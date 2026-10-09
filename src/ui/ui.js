/*
 * ui.js: the product shell. Title, how to fly, credits, settings, pause,
 * results, stick calibration, the flight overlay, and the flight-controller screen.
 *
 * Why this exists: the page used to load straight into a falling quad with
 * a monospace debug dump in the corner. That reads as a tech demo. A
 * player arriving cold needs a title to land on, a way to start, a way to
 * learn the sticks, a way to change the few settings that matter, and a
 * result to read at the end of a run.
 *
 * Every screen is navigable from the keyboard alone and from a radio or
 * gamepad alone. On a radio there are no reliable menu buttons, so the
 * sticks drive the menus: pitch moves the cursor, roll right selects, roll
 * left goes back. Any gamepad button also selects. The title and Quad pose
 * the airframe with the sticks, so there pitch moves the cursor and roll is
 * left to the pose; Rates, Tune, the bench and Stick help use the sticks for
 * what they show, and there only the buttons choose and go back. The legend
 * says which (see pollPad and STICKS_BUSY). Rows that hold a value also
 * have a mouse control: up and down arrows for a stepped number, a
 * dropdown for a named list.
 *
 * The DOM is built here rather than in index.html so the markup and the
 * state machine that drives it sit in one file. Styling lives in
 * index.html next to the rest of the page's CSS.
 *
 * Nothing in this file touches the simulation. It reads state that the
 * shell hands it and returns the player's intent as action strings.
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

import { MAPS } from '../maps/registry.js';
import { CAL_STEPS, KEY_THROTTLE_MODES, normaliseKeyThrottle } from '../input/input.js';
import {
  STICK_MODES, DEFAULT_STICK_MODE, normaliseStickMode, stickChannels, stickCaption,
} from '../input/stickmode.js';
import { LINK_PRESETS } from '../input/link.js';

/* Wording for input.js's calibration steps. The order lives there. */
const CAL_LABELS = {
  center: 'Centre',
  sweep: 'Full range',
  throttle: 'Throttle',
  roll: 'Roll',
  pitch: 'Pitch',
  yaw: 'Yaw',
  /* Only asked of a radio that reports no buttons. See SELECT_STEP in
   * input.js. */
  select: 'Menu switch',
  confirm: 'Check',
};
import { MENU_TRACKS, trackById, musicIds } from '../render/tracks.js';
import { CUSTOM_TUNE, TUNES, tuneById, tunesFor } from '../../configs/registry.js';
import { AIRFRAMES, AIRFRAME_IDS, airframeById, WHOOP_TRUE_DIMS } from '../../configs/airframes.js';
/* Two functions, for the two questions this file asks the builder: which
 * class is the track a pilot is about to fly, and whether the freestyle
 * seat holds a map of the pilot's own (see ownMapId). */
import { docModeOf, trackClassOf } from '../trackbuilder/elements.js';
import {
  RATE_DEFAULTS,
  SUPERSEDED_RATES,
  RATE_FIELDS,
  RATE_TYPES,
  TOUCH_RATE_DEFAULTS,
  RATE_TYPE_LABEL,
  THROTTLE_CAP_CHOICES,
  THROTTLE_CURVE_FIELDS,
  cliOf,
  formatRate,
  fullStickDeg,
  hoverStickPercent,
  normaliseRates,
  pitchMatchesRoll,
  profileForType,
  rateField,
  ratesAreDefault,
  ratesAreSupersededStock,
  ratesFromLegacy,
  ratesShort,
  ratesSummary,
  throttleSummary,
} from '../../configs/rates.js';
import {
  PRESET_NAME_MAX,
  RATES_STORAGE_WARNING,
  deleteRatePreset,
  listRatePresets,
  presetMatching,
  presetNamed,
  ratePresetById,
  saveRatePreset,
} from '../../configs/ratepresets.js';
import {
  PID_AXES,
  PID_FIELDS,
  PID_FIELD_SPECS,
  SLIDER_KEYS,
  SLIDERS,
  clearPidsFor,
  normalisePids,
  pidsAdjusted,
  pidsEntry,
  pidsSummary,
  setPidSlider,
  setPidsExpert,
} from '../../configs/pids.js';
import {
  boardPageUrl, fetchMapList, fetchTrackList, fetchTrackTimes, mapCardUrl, partnersPageUrl, pickFeaturedTracks,
  pickNewestMaps, wikiPageUrl,
} from '../share/board.js';
import { PATTERNS } from '../game/trickdetect.js';
import { PROVEN } from '../game/proven.js';
import { trickByName } from '../game/tricks.js';
import { TrickFilmPlayer, filmFor, VIEW_LABEL } from './trickfilm.js';
import { BOARD_WINDOW, WIKI_WINDOW, openNamedWindow } from '../share/windows.js';
import { BUG_KINDS, submitBug } from '../share/bugs.js';
import {
  AIR_GRIP_MAX,
  AIR_GRIP_MIN,
  AIR_GRIP_STEP,
  AIR_GRIP_STOCK,
  FEEL_WORDS,
  MOTOR_KV_MAX,
  MOTOR_KV_MIN,
  MOTOR_KV_STEP,
  MOTOR_KV_STOCK,
  TUNE_MIN_AIR_MS,
  TUNE_VERDICTS,
  airtimeWords,
  buildTunePayload,
  clampAirGrip,
  clampMotorKv,
  effectiveTune,
  inputKindFromSource,
  tuneAskReason,
  tuneCardText,
  tuneSliderBlurbs,
  tuneSliderWords,
  tuneValuesLine,
} from '../share/tune.js';
import { nameRules, readPilotName, writePilotName } from '../share/pilot.js';
import { stampFor, stampKeyForMap } from '../share/stamps.js';
import { MARK_FINDS } from '../game/egg.js';
import { PARTNERS, roleTitle } from '../partners/roster.js';
import { courseChip, hasFlyableTrack, inspectCourse, isEmptyCanvas } from '../share/listing.js';
import { isoLapMs, drawIso, drawPlan, fieldSize, planCanvas, planFromDocument } from '../share/plan.js';
import { activeCourseSummary } from '../share/summary.js';
import {
  readPendingTime,
  readPostedBest,
  writeBuilderIntent,
  writePendingTime,
  /* Only clearShareImport. The shell used to WRITE a share seat too, for a
   * track that ships with the simulator; the Track room no longer seats one
   * of those, so what is left is clearing a stale seat out of the way of
   * the pilot's own track. See seatLocal. A board track's seat is written
   * by main.js, which owns the fetch. */
  clearShareImport,
} from '../share/session.js';
import {
  clipKeyForMap,
  getClip,
  putClip,
  makeClipElement,
  recordCanvasStream,
  withCaptureLock,
  whenVisible,
  clipDurationMs,
  CLIP_W,
  CLIP_H,
} from '../share/orbitcache.js';
import {
  GRAPHICS_IDS,
  detectDefaultGraphics,
  graphicsLabel,
  graphicsNote,
  normalizeGraphics,
} from '../render/quality.js';
import {
  CAMERA_FOVS,
  CAMERA_FOV_DEFAULT,
  CAMERA_ANGLE_MIN,
  CAMERA_ANGLE_MAX,
  CAMERA_ANGLE_DEFAULT,
  cameraTiltRad,
  clampCameraAngle,
} from '../render/lens.js';
import { ScoreHud } from './scorehud.js';
import { ChaseHud, chaseCallText } from './chasehud.js';
import {
  closeCallCount, drawMangaPage, drawRunCard, mangaPanels, pageSentence,
} from './mangapage.js';
import { paintTitle } from './lettering.js';
import { formatScore } from '../game/score.js';
import { PRACTICE_LAPS } from '../game/race.js';
import { JOKE_MS, quotedJoke } from './loading.js';
import { fillCredits } from './credits.js';
import { INSTAGRAM_NOTE, PATREON_NOTE, TIP_NOTE, openInstagram, openSupport, openTip, patreonAnchor } from '../share/patreon.js';
import { mountRatesPanel } from './ratespanel.js';
import { mountPidsPanel } from './pidspanel.js';
import { touchWanted } from '../input/touchsticks.js';
import {
  closePadGate, newPadGate, openPadGate, padDtMs, stepPadGate,
} from '../input/padgate.js';
import {
  capital, channelList, platformHelp, radioBlind, stickBrowser, stickPlatform, stickSay,
} from './stickhelp.js';
import {
  downloadCli, drawAttitude, FcSession, paintPageStrip, paintTabStrip,
} from './fc.js';
import { readFcDump } from '../fc/dump.js';
/*
 * The pilot's own tracks live in this browser, and the Track room lists
 * them now, so the shell reads the same library the builder's Load dialog
 * reads rather than only the one document in the autosave seat.
 * writeAutosave is still also used to re-home a document whose seat is
 * about to stop being the active one. See seatCraftForCourse and seatLocal.
 */
import {
  keepDisplaced, listTracks, loadTrack, readAutosave, writeAutosave,
} from '../trackbuilder/storage.js';

/* Whether a Flight controller save exists, which is what puts Your edits
 * on the Tune row. Read fresh each time: the pilot can save one two rows
 * away from the row that offers it. */
/*
 * Which actions leave for another tab, and which open another screen. The row
 * grammar reads these to decide a row's kind, so a new action that forgets to
 * appear here renders as a plain action, which is the safe default: it gets no
 * chevron it has not earned.
 */
/* card-board opens the board's page for one track in the board's tab, so it
 * wears the link arrow the leaderboard row wears (MENUS-PLAN.md 1.38). */
const LINK_ACTIONS = new Set(['leaderboard', 'seat-board', 'wiki', 'support', 'partners', 'card-board']);
/* mapbuilder is the builder's freestyle door, and it opens the same page
 * trackbuilder does, so it wears the same chevron: the pause menu's Back to
 * the track builder is one or the other depending on what is being flown,
 * and the row should not change shape between the two. */
const SCREEN_ACTIONS = new Set([
  'courses', 'race', 'freestyle', 'pilot', 'quad', 'launch', 'standings', 'rates', 'pids', 'fc',
  'howto', 'tricks', 'credits', 'trackbuilder', 'trackbuilder-new', 'mapbuilder', 'builder', 'remix', 'editown',
  'choosepad', 'calibrate', 'calibrate-check', 'stickhelp', 'stickhelp-calibrate', 'stickhelp-check',
  'advanced', 'card-launch',
]);

/*
 * THE CHROME BUDGET (MENUS-PLAN.md 2.6). Up to seven things floated over
 * every room: the crumb, the Flying and Pilot chips, Report bug, the music
 * dock, Patreon and the command bar's button. On a phone they took the top
 * 120 px and the bottom 40 px of a 390 px window, and on a laptop they sat
 * on headings and ledes. Each now appears where it is about the screen it
 * is on, and these sets are where that is decided.
 *
 * Report bug where reports come from: the run, its pause and results, and
 * the rooms a pilot opens because something is wrong. F8 opens it from
 * every screen, and How to fly teaches the key. The title has had none by
 * decision since the gate was a first impression, and keeps none.
 */
const BUG_CHIP_SCREENS = new Set([
  'flight', 'paused', 'results', 'pilot', 'advanced', 'stickhelp', 'calibrate', 'padpick',
]);
/* The music where it is chosen or heard over a run: the title, the run and
 * its pause, and Settings, which holds Sound. */
const MUSIC_SCREENS = new Set(['title', 'flight', 'paused', 'pilot']);
/* What is seated, in the rooms where it decides what happens next. The Maps
 * room only once a map is seated (see contextChips). */
const FLYING_CHIP_SCREENS = new Set(['courses', 'launch', 'quad', 'freestyle']);
/* The pilot's name, where a time is about to go on the board under it. */
const PILOT_CHIP_SCREENS = new Set(['launch', 'results']);
/* Support on the title and in About, not beside every crumb. */
const PATREON_SCREENS = new Set(['title', 'credits']);

/*
 * THE SCREENS WHERE THE STICKS ARE BUSY, and what with, said in the legend
 * in place of Move and Adjust, which were not true there (MENUS-PLAN.md
 * 2.9). The buttons still choose and go back on all of them.
 */
const STICKS_BUSY = {
  rates: 'Sticks move the dot on the curve',
  pids: 'Sticks rest here, so a stick cannot change a gain',
  fc: 'Sticks rest on the bench',
  stickhelp: 'Sticks are what is being tested',
};

/* The two screens whose sticks pose the quad: pitch moves the cursor there
 * and roll is left to the pose. See pollPad. */
function posesQuad(ui) {
  return ui.screen === 'quad' || (ui.screen === 'title' && !ui.onGate());
}

/* What the breadcrumb says, per screen. A room is a navigation parent, so a
 * trail rather than a single word: Escape then has one obvious destination
 * instead of the four the return chain currently chooses between. */
/*
 * Screens a room can be opened FROM and returned to. The launch card and
 * both track rooms carry doors into Quad and Pilot; the title is not here
 * because it is where Back goes when there is nowhere else to go.
 */
/*
 * How long the room has to be untouched before a world preview is allowed
 * to record. Long enough that arrowing down four cards never triggers one,
 * short enough that a pilot who stops to read a note gets their previews.
 * See noteInteraction.
 */
const REEL_QUIET_MS = 900;

/*
 * The film of the loaded world (captureCurrentCard): how many of its frames
 * reach the card before the recorder starts, and how long to wait for them
 * before sending the card to the orbit frame instead. Three is what the
 * orbit frame's share card draws before the frame it keeps (CARD_WARMUP in
 * src/share/orbit.js). The film draws ten a second, so on a machine with a
 * GPU three take a third of a second; the ten seconds are for a software
 * rasteriser, where one frame of the town can take most of a second.
 */
const FILM_WARMUP = 3;
const FILM_START_MS = 10000;

/*
 * THE COURSE CARDS FLY THEIR OWN LAP.
 *
 * ONE PACE, NOT ONE DURATION, and that is the whole of what changed here.
 * It was twelve seconds a lap for every card, the exporter's old figure, so
 * a 41 m course went round three times as fast as a 13 m one and a row of
 * cards had no common speed to read. isoLapMs in src/share/plan.js gives
 * each track its own length of lap at one steady speed, which is the
 * animation exporter's rule and RaceGOW's own: see LAP_SPEED in
 * src/trackbuilder/stage.js.
 *
 * Repainted twenty times a second rather than every frame. Each card is a
 * few dozen strokes on a 150 px canvas, but there are several of them and
 * they are painted over a world that is also being rendered, and nothing
 * about a travelling ribbon needs 60 Hz.
 */
const COURSE_PLAN_MS = 50;

const ROOM_PARENTS = new Set(['courses', 'freestyle', 'launch', 'quad', 'pilot']);

/* The rooms whose list is their content, sized to the window by
 * fitMenuHeight. */
const FIT_SCREENS = new Set(['pilot', 'advanced', 'quad', 'rates', 'pids', 'launch', 'stickhelp', 'standings', 'paused']);

/*
 * ONE NAME PER ROOM, and it is the name of what the room holds
 * (MENUS-PLAN.md, the glossary). The title's Track row opens Tracks and its
 * Map row opens Maps; the room a Tune row opens is Tune, with the PID
 * sliders inside it; the room that holds the credits roll and every door
 * out to the people behind this is About. The ids stay as they were, because
 * checks, CSS and saved cursors name rooms by id and a pilot never sees one.
 */
const SCREEN_TITLES = {
  title: 'WebFPV',
  courses: 'Tracks',
  freestyle: 'Maps',
  pilot: 'Settings',
  quad: 'Quad',
  launch: 'Before you fly',
  standings: 'Standings',
  rates: 'Rates',
  pids: 'Tune',
  fc: 'Firmware bench',
  paused: 'Paused',
  results: 'Run complete',
  howto: 'How to fly',
  tricks: 'Trick list',
  credits: 'About',
  stickhelp: 'Stick help',
  advanced: 'Advanced',
  calibrate: 'Calibrate sticks',
  padpick: 'Choose joystick',
};
/*
 * The crumb's trail, as the room is reached from its home. crumbTrail()
 * swaps the first part for the room it was actually opened from when that
 * is a different one, so the crumb and Escape always name the same place:
 * Rates opened from Quad reads Quad / Rates, and Escape goes to Quad.
 */
const CRUMBS = {
  courses: ['Tracks'],
  freestyle: ['Maps'],
  pilot: ['Settings'],
  quad: ['Quad'],
  launch: ['Before you fly'],
  standings: ['Tracks', 'Standings'],
  rates: ['Settings', 'Rates'],
  pids: ['Quad', 'Tune'],
  fc: ['Quad', 'Firmware bench'],
  paused: ['Paused'],
  results: ['Run complete'],
  howto: ['How to fly'],
  tricks: ['Maps', 'Trick list'],
  credits: ['About'],
  stickhelp: ['Settings', 'Stick help'],
  advanced: ['Settings', 'Advanced'],
  calibrate: ['Settings', 'Calibrate sticks'],
  padpick: ['Settings', 'Choose joystick'],
  title: ['WebFPV'],
};

/*
 * The freestyle world the pilot is SEATED in, or null when the seat is a
 * track. The Map row on the title reads this rather than the remembered id,
 * because a row on the front page has to name what Fly would launch, and
 * those two are not the same thing the moment somebody backs out of the
 * world picker without choosing.
 */
function seatedFreestyleMap(s) {
  const m = MAPS.find((x) => x.id === (s && s.map));
  return m && m.mode === 'freestyle' ? m : null;
}

/*
 * The world to seat when the pilot has said freestyle and none is seated:
 * the one they last flew, or the only one there is. Null only when there is
 * a real choice and nothing remembered, which is the one case the Freestyle
 * room's cards are for. The gate asks this, and so does Fly, because a
 * failed load puts the old seat back under a pilot who still said
 * freestyle (bug-850375dc), and Fly has to answer them the way the gate
 * would rather than open a room with nothing in it to press.
 */
function freestyleWorldToSeat(s) {
  const remembered = MAPS.find((x) => x.id === (s && s.freestyleMap) && x.mode === 'freestyle');
  const worlds = MAPS.filter((x) => x.mode === 'freestyle');
  return remembered || (worlds.length === 1 ? worlds[0] : null);
}

/* The title's town row when no world is seated. After a failed load it
 * says so, because the notice that said it first is gone in four seconds
 * and "Not loaded" alone reads like something the pilot forgot to do. */
function townNote(s, failure) {
  const world = freestyleWorldToSeat(s);
  if (world && failure && failure.map === world.id) {
    return `${world.name} did not load. Fly reloads the page and tries again.`;
  }
  return 'The town, a map of your own, or one from the board. No gates. Open it and fly.';
}

/*
 * The id of the map Your map flies when it is one the pilot built, or ''
 * when it flies the starter yard. chooseDocument's rule in
 * src/maps/built/index.js, restated from the seat alone the way
 * stampKeyForMap in src/share/stamps.js restates it, because that file
 * stays off the wire until the world is chosen. Change the three together.
 */
function ownMapId() {
  try {
    const saved = readAutosave('full', 'freestyle');
    const doc = saved && saved.doc;
    return doc && docModeOf(doc) === 'freestyle' && doc.elements.length > 0 && doc.id
      ? String(doc.id)
      : '';
  } catch (e) {
    return '';
  }
}

/*
 * Whether there is a saved Flight controller dump FOR THIS AIRCRAFT. A dump
 * is the whole of one machine's configuration, a 6S 2207's or a 1S 0702's,
 * and offering the five inch's as "Your edits" on the whoop was handing a
 * 23 g machine a tune built for thirty times its mass. Each aircraft keeps
 * its own, so saving one never takes the other's off its row: see
 * readFcDump in src/fc/dump.js.
 */
function hasFcDump(airframe = AIRFRAME_IDS[0]) {
  return readFcDump(airframe) != null;
}

/* The tune ids the row can offer right now. */
/*
 * The tunes on offer. Airframe aware since the whoop landed: a 6S 5 inch
 * race tune loaded onto a 1S whoop is not a different feel, it is an
 * oscillation, because the whoop's PIDs are a third of the five inch's for
 * the same reason its angular acceleration is three times higher.
 *
 * The argument is optional and defaults to the five inch, because this is
 * called from module scope in the settings allow list where there is no
 * `this` to read a setting off. loadSettings passes the stored airframe.
 */
function tuneChoices(airframe = AIRFRAME_IDS[0]) {
  return [...tunesFor(airframe).map((t) => t.id), ...(hasFcDump(airframe) ? [CUSTOM_TUNE.id] : [])];
}

/* Step through a list with wraparound. Every value row on every screen
 * moves through this, so a left arrow at the start of a list lands on its
 * end rather than doing nothing. */
function cycle(list, value, dir) {
  const i = list.indexOf(value);
  const n = list.length;
  return list[((i < 0 ? 0 : i) + dir + n) % n];
}

/*
 * Where the settings live.
 *
 * v3, and the bump IS the migration. v2 blobs could carry a whole captured
 * rateprofile and rate knobs off the offered lists, both written by the
 * flight-controller screen, and reading one back now would either be ignored
 * silently or step to the wrong end of a list. Rather than carry code to
 * repair a shape nothing can produce any more, the old blob is simply not
 * read. Everyone starts on the defaults once; a handful of testers is
 * exactly the moment to do that and never again.
 *
 * Nothing else is lost with it: the pilot name, course documents, stored
 * best laps and the stick mapping are all separate keys.
 *
 * src/boot.js SPELLS THIS STRING OUT rather than importing it, on purpose,
 * so that boot does not drag ui.js's module graph in ahead of the loading
 * screen. Change it there too. scripts/shots.js does import it.
 */
export const SETTINGS_KEY = 'webfpv.settings.v3';

export const FLIGHT_MODES = ['acro', 'angle'];
/* The lens, and the derivation behind it, live in src/render/lens.js. It is
 * re-exported here because the settings screen is where a pilot meets it. */
export {
  CAMERA_FOVS,
  CAMERA_FOV_DEFAULT,
  CAMERA_ANGLE_MIN,
  CAMERA_ANGLE_MAX,
  CAMERA_ANGLE_DEFAULT,
};
export const PACK_VOLTAGES = [4.2, 3.8, 3.5];
/* PRACTICE_LAPS, last, is the run with no end: see src/game/race.js. */
export const LAP_COUNTS = [1, 3, 5, PRACTICE_LAPS];

/* A lap count as the launch card writes it. */
function lapsLabel(n) {
  return n === PRACTICE_LAPS ? 'Practice' : `${n}`;
}

/* Render scale, percent of the preset's resolution, and the frame cap in
 * Hz, 0 meaning uncapped. Both from a board report about lower end
 * machines: fewer pixels is the one lever that always helps a starved
 * GPU, and a steady 30 or 60 reads better than a heaving 47. The input
 * poll and the physics never see either: the cap skips only the draw. */
export const RENDER_SCALES = [100, 85, 70, 55];
export const FPS_CAPS = [0, 90, 60, 30];
/* Expert is the full model and the default; arcade switches the
 * imperfection terms off in the module via sim_set_flight_style. */
export const FLIGHT_STYLES = ['expert', 'arcade'];

/*
 * Frame pacing's three answers, and where the timer actually runs. 'auto'
 * follows the graphics preset (see the note at DEFAULTS.pacing); the other
 * two are the pilot overruling it either way. The derivation lives here
 * beside the setting so main.js, the row and the checks all ask the same
 * function, and the ?loop= URL flag in main.js outranks it for a session.
 */
export const PACING_MODES = ['auto', 'timer', 'display'];

export function pacingTimerOn(s) {
  if (s.pacing === 'timer') {
    return true;
  }
  if (s.pacing === 'display') {
    return false;
  }
  return normalizeGraphics(s.graphics) === 'low';
}

/*
 * The crosshairs' shapes, 'off' first because it is the default. 'wings'
 * is the flat mark a Betaflight OSD's crosshairs element draws, 'cross' is
 * four short arms round an open centre, and 'dot' is the least in the way.
 * Each is one class on .osd-cross in index.html; see syncCrosshair.
 */
export const CROSSHAIRS = ['off', 'wings', 'cross', 'dot'];
const CROSSHAIR_LABEL = { off: 'Off', wings: 'Wings', cross: 'Cross', dot: 'Dot' };

/*
 * WEIGHT: the pilot's answer to "floaty", as a percentage of the weight the
 * airframe is flown at. 100 is normal, and normal is configs/airframes.js
 * gravityBase, 1.62 times 9.80665 on the five inch, which is what the shell
 * hands sim_set_gravity before a pilot touches anything.
 *
 * THIS IS THE THIRD SHAPE OF ONE SLIDER, and each step was a pilot's.
 * First it scaled drag, and the pilot said the difference was hardly
 * discernible. Then it scaled gravity from 70 to 180 percent of 1.0, and the
 * same pilot flew it to the stop and said full Sinky feels about right, then
 * asked for normal to sit at ninety percent of that with headroom either way.
 * So 0.9 times 1.80 is the base, the slider is 60 to 140 around it, and the
 * number a pilot reads is a weight rather than a gravity: "Weight 120" is
 * twenty percent heavier than the machine we ship, whatever the base is.
 *
 * Sinky is not planted. Planted is HORIZONTAL, how far the craft carries.
 * Sinky is VERTICAL, how fast it comes down and how little it hangs, and the
 * drag slider moved the vertical axis by single figures while moving the
 * fall time the wrong way. Gravity moves it fivefold; measured at the base:
 *
 *   weight 60    0.97 g   hover 26.0, fall 10 m 1.57 s, balloon 4.03 m
 *   weight 100   1.62 g   hover 35.0, fall 10 m 1.20 s, balloon 1.62 m
 *   weight 140   2.27 g   hover 42.7, fall 10 m 1.01 s, balloon 0.67 m
 *
 * The floaty end is within half a percent of the 1.0 machine every earlier
 * record was set on, which is deliberate: a pilot who liked the old feel can
 * have it back. The sinky end is heavier than anyone has yet asked for.
 *
 * What it costs, said plainly: scaling gravity is a heavier world rather
 * than a heavier quad. At the base the craft carries 1.62 times the thrust
 * at hover, so every tilt shoves it sideways that much harder, 5.5 to 8.8
 * m/s2 at the same 57 degree bank, where a real heavy quad accelerates at
 * g tan theta whatever it weighs. Rotation is untouched within 1.5 percent.
 * The pilot flew that and called it right; if a later report says it turns
 * too hard, the answer is mass, not this band.
 *
 * THE WHOOP HAS ITS OWN BASE NOW, 2.025, which is the five inch's 125. A
 * pilot flying the same track back to back in Vdrone and here had to take
 * the whoop to 120 to 130, and the owner made 125 its normal. So "Weight
 * 100" is still the machine we ship, it is just a heavier machine on the
 * whoop, and the slider's top is per airframe: the module refuses a gravity
 * above 2.5, so the whoop stops at 120, 2.43. WEIGHT_MAX is the widest any
 * airframe offers and configs/airframes.js weightMax is each one's own.
 *
 * THE BOARD HOLDS THIS BAND TOO. A time and a freestyle run carry the weight
 * they were flown at, and the board refuses one off 60 to 140 in steps of 5
 * (normaliseWeight in WebFPVSimulator-LeaderBoard's src/validate.js, which
 * mirrors these four as NAME_RE mirrors pilot.js). Widen the band or change
 * the step here and it changes there first, or a lap at the new end is
 * refused by the board with a sentence about a weight.
 */
export const WEIGHT_MIN = 60;
export const WEIGHT_MAX = 140;
export const WEIGHT_STEP = 5;
export const WEIGHT_STOCK = 100;

/* The top of the slider on this airframe. No airframe, the shell's widest. */
export function weightMaxFor(airframeId) {
  if (airframeId == null) {
    return WEIGHT_MAX;
  }
  return Math.min(WEIGHT_MAX, airframeById(airframeId).weightMax ?? WEIGHT_MAX);
}

export function clampWeight(v, airframeId) {
  const n = Math.round(Number(v) / WEIGHT_STEP) * WEIGHT_STEP;
  if (!Number.isFinite(n)) {
    return WEIGHT_STOCK;
  }
  return Math.min(weightMaxFor(airframeId), Math.max(WEIGHT_MIN, n));
}

/*
 * What the feel form's hint quotes about the stock quad and the heavy end of
 * the slider, per airframe, because the whoop's two ends are not the five
 * inch's. Measured off dist/sim.wasm on the five inch plant from a hover at
 * 4.2 V: ten metres of fall with the throttle cut, the balloon after a
 * 400 ms punch at 60 percent stick, and hover off the same bisection as
 * configs/rates.js. The five inch row is the sentence as it always read.
 */
const WEIGHT_FEEL = {
  '5inch': { fall: ['1.20', '1.01'], balloon: ['1.6', '0.7'], hover: ['35.0', '42.7'] },
  whoop65: { fall: ['1.07', '0.98'], balloon: ['0.9', '0.5'], hover: ['39.9', '44.6'] },
};

/*
 * The multiple of 9.80665 the module is asked for, from a slider value and
 * the airframe it is flown on. Rounded to three places so the same setting
 * always produces the same double, which is what the record key hashes.
 * Clamped to the airframe's own top, so a weight stored on a five inch at
 * 140 can never ask the module for a whoop gravity it refuses.
 */
export function gravityScaleFor(weight, airframeId) {
  const base = airframeById(airframeId).gravityBase;
  return Math.round(base * (clampWeight(weight, airframeId) / 100) * 1000) / 1000;
}
/*
 * WHAT A FREESTYLE FLIGHT IS. Three positions on one row, because they are
 * three answers to the same question and a pilot only ever wants one.
 *
 * THE COUNTER COUNTS ON EVERY ONE OF THEM (FREESTYLE-MAPS-PLAN.md section 7
 * and decision 2, Stage C). Named gaps, skims, unders, threads, low passes,
 * the chase and the STF mark are geometry, so they cannot misname anything
 * (the mark only while finds are on, MARK_FINDS in src/game/egg.js),
 * and every freestyle map counts them into combos on the score overlay
 * whatever this row says. What the row decides is TRICK NAMES, which are
 * still being built, and the clock.
 *
 *   'off'     Lines only: the geometry, and no trick names, no run clock
 *             and no board; the clock slot carries the airtime. THE
 *             DEFAULT. The value is still called 'off', because it is
 *             stored in every returning pilot's settings.
 *   'free'    Tricks too, named and scored as they land, in the same
 *             combos, with no clock and no board. The run never ends.
 *   'scored'  Tricks too, two minutes from the first thing scored, the
 *             tricks' own total to the board and the whole count kept as
 *             this browser's best on the map (src/game/counterbest.js).
 *
 * Off is a decision about what is SHOWN. The recogniser and the trick
 * scorer go on running underneath it, because they are the thing being
 * developed and stopping them would stop them being exercised. What off
 * removes is a trick name on the screen that the pilot has not asked to be
 * judged by.
 *
 * See DEFAULTS.freestyleScoring for why off is the default.
 */
export const FREESTYLE_SCORING = ['off', 'free', 'scored'];
const FREESTYLE_SCORING_LABEL = { off: 'Lines only', free: 'Free flight', scored: 'Scored run' };

/*
 * THE WARNING, and it comes FIRST when trick names are on, because a row
 * wearing row-warn owes the pilot the reason before it offers them
 * anything. It is about the tricks and only the tricks: the lines are
 * geometry and are counted in every position. The argument for it is at
 * DEFAULTS.freestyleScoring.
 */
const SCORING_WARNING = 'Trick names are an unfinished feature and still being built.'
  + ' The recogniser misses tricks it should name and puts the wrong name on some of'
  + ' the ones it catches, so read them as a work in progress rather than as a verdict'
  + ' on your flying.';

/* `where` is the world seated: the town, Your map, or this map when it came
 * from the board. */
const scoringOff = (where) => `Lines only: ${where} counts gaps, skims, unders, threads, low passes and the`
  + ' chase into combos. No trick names and no clock.';
const SCORING_FREE_ON = 'Free flight: tricks too, named and scored as you land them in the same combos,'
  + ' with no clock and no board, and the run never ends.';
/* What the other two add, said once from Lines only, where a pilot reads
 * them before choosing. */
const SCORING_MORE = 'Free flight adds trick names, the one to learn a Powerloop in, and a scored run'
  + ' adds two minutes and the high score board.';
const scoringMoreBuilt = (where) => 'Free flight adds trick names, the one to learn a Powerloop in, and a scored'
  + ` run adds two minutes and a best kept for ${where}.`;

const SCORING_BOARD = 'Scored run: two minutes from the first thing you score. The tricks\' own total'
  + ' goes to the high score board, and the whole count is kept as your best here.';

/*
 * WITH MANGA AND SCORING OFF IN SETTINGS nothing this row decides is drawn
 * in flight, and the row says so first, where a pilot who picked Free
 * flight and saw no trick names would look for why. It stands in for the
 * warning, which is about trick names on the screen, and there are none:
 * the row loses its amber for the same reason. What the row decides still
 * happens underneath (DEFAULTS.mangaAndScoring), which is the second half
 * of the sentence.
 */
const SCORING_UNDRAWN = 'Counted and not drawn, because Manga and scoring is off in Settings.';

/*
 * Your map is a different place for every pilot who has built one, so the
 * board will not take a run flown on it (see BUILT_OFF_BOARD). The Scored
 * run line says so while it is seated, rather than promising a board the
 * results screen then greys out. The reason is left to the results row.
 * A map from the board flies in the same world and is refused the same way
 * (BOARD_MAP_OFF_BOARD), so the line names it "this map" rather than
 * calling somebody else's map yours. Not its name: the note is measured
 * against the bottom bar, below, and a name is as long as its author made it.
 */
const scoringBoardBuilt = (where) => 'Scored run: two minutes from the first thing you score, kept as your'
  + ` best on ${where}, and off the high score board.`;

/*
 * Lines only says what it counts and, in one sentence, what the other two
 * add, because that is where a pilot reads them before choosing one. A mode
 * with trick names says the warning and its own line and nothing else: at
 * 1280 by 720 the warning and all three ran 125 px under the bottom bar,
 * and the line cut off was the one about the board, which is the line a
 * pilot who has just chosen Scored run needs. Free flight, once chosen,
 * leaves out why to choose it: with it the town's note still ended 14 px
 * under the bar, where it is the longest.
 */
function scoringNote(mode, mapId, fromBoard = false, drawn = true) {
  const built = mapId === 'built';
  const where = built ? (fromBoard ? 'this map' : 'Your map') : 'the town';
  if (mode === 'off') {
    return `${drawn ? '' : `${SCORING_UNDRAWN} `}${scoringOff(where)} ${built ? scoringMoreBuilt(where) : SCORING_MORE}`;
  }
  return `${drawn ? SCORING_WARNING : SCORING_UNDRAWN} ${mode === 'free' ? SCORING_FREE_ON : (built ? scoringBoardBuilt(where) : SCORING_BOARD)}`;
}

/*
 * Why a run flown on Your map cannot be posted, said once for the results
 * row. The board files a run under its map's id, and 'built' names a
 * different yard in every browser, so a run posted from one would sit on
 * a table beside runs flown somewhere else entirely. main.js refuses the
 * post as well, as a backstop for a press that reaches it some other way.
 */
const BUILT_OFF_BOARD = 'A map you built is a different place for every pilot who has one, so its runs'
  + ' stay off the public board. Fly the town for a run that can go up.';

/* A map from the board is the same place for everybody, so the reason
 * above would be untrue of it. The board simply keeps no table of runs for
 * a published map yet, and main.js refuses the post for every built world. */
const BOARD_MAP_OFF_BOARD = 'The board keeps no runs for a published map yet, so a run flown on one'
  + ' stays here. Fly the town for a run that can go up.';

/*
 * What the results say about this browser's best counter on the map. The
 * number is localBestOf's; whether this run set it, and what it beat, are
 * the two fields endFreestyleRun in main.js puts beside it
 * (`counterImproved`, `counterBestBefore`, from src/game/counterbest.js).
 * Null when there is no best to speak of.
 */
function counterBestSentence(s) {
  const best = localBestOf(s);
  if (!(best > 0)) {
    return null;
  }
  if (s.counterImproved) {
    return s.counterBestBefore > 0
      ? `A new best for this map in this browser, up from ${formatScore(s.counterBestBefore)}.`
      : 'The first counted run on this map in this browser, so its best.';
  }
  return `Your best on this map in this browser: ${formatScore(best)}.`;
}

/* Where a built track lives, said in the Race room beside the row that
 * builds one. It was the title's, where it was three lines on every visit
 * and wrong with a freestyle map seated. The builder's strip says the same. */
/* The orders the Tracks room offers for the board's half: the same three
 * the board's own Order menu leads with, in its words. */
const COURSE_ORDERS = [['flown', 'Most flown'], ['newest', 'Newest'], ['name', 'A to Z']];
const COURSE_ORDER_IDS = COURSE_ORDERS.map(([id]) => id);

const KEEP_NOTE = 'Tracks you build stay in this browser. Clearing it, or another device, starts you from nothing. Publish a track to put it on the public board.';

/* How many kinds of trick a freestyle result lists before "N more". */
const RESULT_TRICK_ROWS = 3;

/*
 * The counter's bests as plain results rows, [label, value], for the
 * results screen when there is no manga page to draw them on (Clean FPV).
 * The same four things the page's panels are: src/ui/mangapage.js.
 */
function counterRows(s) {
  const out = [];
  if (s.bestGap && s.bestGap.name) {
    out.push([`Best gap, ${s.bestGap.name}`, `+${formatScore(s.bestGap.points || 0)}`]);
  }
  if (s.longestSkim && s.longestSkim.ms > 0) {
    out.push([`Longest skim, ${s.longestSkim.name || 'Skim'}`, `${(s.longestSkim.ms / 1000).toFixed(1)} s`]);
  }
  if (s.bestTail && s.bestTail.ms > 0) {
    out.push([s.bestTail.drift ? 'Best tail, the drift car' : 'Best tail', `${(s.bestTail.ms / 1000).toFixed(1)} s`]);
  }
  if (s.eggFound) {
    out.push(['STF mark', 'Found']);
  }
  return out;
}

/*
 * The partners' marks this run found, as one results row, [label, value],
 * or none. A row and not a manga panel: the page's panels are the run's
 * flying, and a find is a credit to the partner, so it is listed under the
 * page whether the page is drawn or not. The roster's order rather than
 * the order they were found, so the row reads the same way every time.
 */
function partnerRows(s) {
  const found = s && Array.isArray(s.partnersFound) ? s.partnersFound : [];
  const partners = PARTNERS.filter((p) => found.includes(p.slug));
  return partners.length ? [['Partner marks found', partners.map((p) => p.short).join(', ')]] : [];
}

/* The best counter total this browser has for the map, from the summary,
 * or null when the summary does not carry one. The shell writes it as
 * `counterBest` (endFreestyleRun in main.js, from src/game/counterbest.js),
 * 0 when the map has none yet, which is no best to show. `localBest`, a
 * number or an object holding one as `counter` (or `total`), is the shape
 * the harness fixtures carry. */
function localBestOf(s) {
  if (s && typeof s.counterBest === 'number') {
    return s.counterBest > 0 ? s.counterBest : null;
  }
  const b = s ? s.localBest : null;
  if (typeof b === 'number') {
    return b;
  }
  if (b && typeof b === 'object') {
    const v = b.counter != null ? b.counter : b.total;
    return typeof v === 'number' ? v : null;
  }
  return null;
}

/*
 * WHO TO NAME ON A TRACK, IN ONE PLACE.
 *
 * A board track's `author` is the account that published it. On a track
 * somebody built themselves those are the same person. On the eight RaceGOW5
 * rooms they are not: six other people designed them and one brought them
 * over, and the designer is in the track's own credit block, which the board
 * passes through now. So the line names the builder where the board knows
 * one, and the publisher otherwise. The detail pane still says both.
 */
function byLine(t) {
  if (t && t.designer) {
    return `by ${t.designer}`;
  }
  return t && t.author ? `by ${t.author}` : '';
}

/* What a board map's card says about it, as the board's own card does: its
 * size in pieces, and its named gaps when it has any, which are the lines
 * its builder wants flown. */
function mapFacts(m) {
  const facts = [`${m.pieces} piece${m.pieces === 1 ? '' : 's'}`];
  if (m.gaps > 0) {
    facts.push(`${m.gaps} named gap${m.gaps === 1 ? '' : 's'}`);
  }
  return facts;
}

const DEFAULTS = {
  /* Which world. 'custom' is a track from the board or the builder, and
   * 'city' is the freestyle town. It is a string so loadSettings' typeof
   * gate accepts it, and an unknown value falls back to the track in
   * src/maps/registry.js rather than throwing, because a stale localStorage
   * entry must not be able to stop the page booting. A stored 'field' from
   * before the race field was removed is the track world. */
  map: 'custom',
  /*
   * The freestyle world the pilot last chose, or '' if they never have.
   *
   * It has a default because that is the only way a key survives a reload:
   * loadSettings copies stored keys by walking DEFAULTS, so this one was
   * written on every pick in the Freestyle room and dropped on the next
   * boot, and the row that names it went back to the first world in the
   * registry however many times the pilot flew another.
   *
   * Empty means never chosen, and that is a signal rather than an absence:
   * the gate sends a pilot with no world of their own to the picker instead
   * of seating one on their behalf.
   */
  freestyleMap: '',
  /* Which Betaflight diff the module is initialised from. A string for the
   * same reason map is: loadSettings only accepts a stored key whose typeof
   * matches the default, and an unknown id falls back to the first tune in
   * configs/registry.js rather than throwing. */
  tune: 'betaflight-default',
  /*
   * WHICH AIRCRAFT. A plant, not a tune: mass, inertia, motors, rotors,
   * pack, drag and ducts, selected in the compiled module by
   * sim_set_airframe. configs/airframes.js is the list.
   *
   * '5inch' stays the default and the first row, so a returning pilot's
   * records, tune, rates and camera all still mean exactly what they did.
   * An unknown id falls back to it rather than throwing, same rule as map
   * and tune, because a stale localStorage entry must not stop the page
   * booting.
   */
  airframe: '5inch',
  /*
   * Whether the aircraft question has ever been ANSWERED, which is not the
   * same as whether it is asked. The gate offers all three ways in on every
   * visit, so the question is on screen every time; this flag is what makes
   * the seated aircraft a real answer rather than a default, and it is what
   * a link carrying ?craft= writes so that it can skip the gate. Unlike the
   * mode, which is what this session is for and is never remembered, the
   * aircraft is a PREFERENCE: the seated one is what the cursor opens on,
   * and the Quad screen carries the row for every later change.
   */
  airframeAsked: false,
  /*
   * WHICH AIRCRAFT THE MACHINE SETTINGS IN THIS BLOB WERE SET FOR: the tune,
   * the pack, the weight, the camera and the PIDs (MACHINE_KEYS). Written by
   * seatAirframe and on every load, so it differs from `airframe` only when
   * something outside this file moved the aircraft, which the builder's class
   * toggle does by writing `airframe` alone. That difference is what
   * loadSettings acts on, rather than guessing from the values: the guess was
   * "still the other machine's stock value", and a five inch pilot who chose
   * 95 degrees of lens, the whoop's stock, lost it at every load.
   *
   * Empty on a blob from before it existed, which gets the guess one last
   * time; see reseatIfForeign.
   */
  seatedFor: '',
  /*
   * THE MACHINE SETTINGS OF EVERY AIRCRAFT THAT IS NOT SEATED, by airframe
   * id, put away by seatAirframe when the pilot leaves an aircraft and given
   * back when they return. Before it, changing aircraft wrote the new one's
   * stock camera and tune over the pilot's and kept nothing, so going to the
   * whoop and back cost the five inch its camera and its tune (bug-ddfe1c6d),
   * and both aircraft shared one PID adjustment because both fly the same
   * tune id (bug-693b9ed4). Entries are validated against their aircraft
   * when they come back, not here.
   */
  hangar: {},
  /*
   * The whole rate profile, owned by the pilot rather than by the tune: a
   * rates type and three firmware fields per axis, plus Betaflight's
   * throttle limit, which lives in the same rate profile in the firmware and
   * so lives in the same object here. Betaflight 4.5.1's own defaults; see
   * configs/rates.js for the units and for why they live here.
   *
   * loadSettings REPLACES this rather than keeping it: the spread that
   * builds a settings object is shallow, so a stored profile has to be
   * normalised into a fresh object or a pilot editing their max rate would
   * be writing through into the frozen defaults above.
   */
  rates: RATE_DEFAULTS,
  /* Whether the rows edit pitch separately from roll. A menu shape rather
   * than a firmware field, which is why it is out here and not in the
   * profile: the firmware has always had three axes and this only decides
   * whether two of them are typed once or twice. */
  ratesSplitPitch: false,
  /*
   * The pilot's PID adjustment, KEYED BY TUNE ID, empty meaning every tune
   * flies its own numbers. Slider overrides and the expert table both live
   * here; configs/pids.js owns the shape, the clamps and the CLI it
   * becomes. Per tune rather than global on purpose: a single override
   * across tunes would make the Tune row meaningless. loadSettings
   * REPLACES this with a normalised fresh object, same as rates.
   */
  pids: {},
  /*
   * Which airframe PID seeds have already been laid down, by tune id. An
   * airframe may ship a starting PID adjustment for its default tune (see
   * defaultPids in configs/airframes.js), and a seed that is only ever
   * conditional on "the pilot has no entry" would come BACK the next time
   * the page loaded after they pressed Reset to stock on it. This is what
   * makes it a one shot: the seed lands once per tune, ever, and after that
   * the adjustment is the pilot's whether they kept it, moved it or threw
   * it away.
   */
  pidsSeeded: {},
  /*
   * Which generation of the whoop's SHIPPED DEFAULTS this profile has been
   * moved to. See SUPERSEDED_WHOOP: when a whoop default changes, a stored
   * copy of the old default has to move with it, and this marker is what
   * makes that move happen ONCE. Without it the move ran on every load, so
   * a pilot who put the superseded value back from the menu had it taken
   * away again at the next boot, which is the opposite of the "one row
   * away" the comment promised. 0 is a profile from before the marker; the
   * migration itself says what each generation moved.
   */
  whoopDefaults: 0,
  /*
   * Which generation of the shipped RATE defaults this profile has been
   * moved to, the same one shot as whoopDefaults. See SUPERSEDED_RATES in
   * configs/rates.js: a profile still on the old stock 70 / 670 is moved to
   * the softer default once, and a pilot who types 670 back keeps it.
   */
  stockRates: 0,
  /*
   * Whether the flight feel question has been offered. It offers itself
   * exactly once, after the first finished race, and never again: the
   * moment the dialog opens this flips and is saved, whatever the pilot
   * does with it. The rows on Results and the pause menu are the way back
   * in; an automatic prompt that returns is how feedback dies.
   */
  feelAsked: false,
  /*
   * WHETHER THIS PILOT HAS EVER BEEN IN THE AIR, which is what "first run"
   * means. It used to be read off whether any settings were saved at all,
   * and answering the gate saves settings, so a newcomer who reloaded before
   * flying lost First flight for good (MENUS-PLAN.md 1.43). Set the first
   * time the flight screen comes up, by any path. A saved blob from before
   * this key existed has no key at all and still counts as returning.
   */
  hasFlown: false,
  /*
   * How many race results screens this pilot has seen, for the flight feel
   * question, which waits for the second (MENUS-PLAN.md 2.8).
   */
  resultsSeen: 0,
  /*
   * The order of the board's half of the Tracks room: 'flown' (most flown
   * first, the board's own default), 'newest' or 'name'. Remembered, because
   * a pilot who looks for new tracks looks for them every visit.
   */
  courseOrder: 'flown',
  /*
   * Whether the thumb-rates hand-off has happened. A fresh profile on a
   * touch device starts on TOUCH_RATE_DEFAULTS directly; an existing
   * profile still flying the stock defaults is switched ONCE, the first
   * time touch actually flies, by adoptTouchRates in src/main.js, with a
   * notice saying where to change them. A pilot with their own rates is
   * never touched, and this flag is what keeps all of it to one offer.
   */
  touchRatesOffered: false,
  /*
   * Betaflight ANGLE_MODE. 'acro' is the default and the radio default.
   *
   * Keyboard flight does not read this value ON A RACE TRACK, where holding
   * a line matters more than inverting and a key is a bang bang input: it
   * reads keyRaceMode below instead. It does read it in freestyle, where
   * angle holds the craft to about thirty degrees of bank and puts the whole
   * trick catalogue out of reach: see flightModeSetting in src/main.js. This
   * comment used to say "always", which stopped being true when the town
   * arrived.
   */
  flightMode: 'acro',
  /*
   * ANGLE_MODE FOR RACING ON THE KEYBOARD, and 'angle' is the default, which
   * is exactly what the keys were before it existed: they forced Angle on a
   * race track with no way out. bug-92007f3e asked for the way out, so M in
   * flight flips this one while racing on keys, and flightMode everywhere
   * else. A new key rather than a reading of flightMode, because every
   * returning pilot has flightMode stored as 'acro' whether or not they ever
   * chose it, and reading that would move them all off Angle at once.
   */
  keyRaceMode: 'angle',
  /*
   * WHICH STICK CARRIES WHICH CHANNEL. Mode 2 is what this shell has always
   * been and what every record on the board was flown on. It reaches the
   * thumb sticks and the keyboard, which had no mode before this and could
   * not be flown by a Mode 1 pilot at all, and it names the sticks on every
   * screen that draws them. See src/input/stickmode.js.
   */
  stickMode: DEFAULT_STICK_MODE,
  /*
   * WHAT THE THROTTLE KEYS DO WHEN THEY ARE LET GO. 'hover' springs back to
   * hover in the air and to idle on the pad, which is what they have always
   * done. 'hold' leaves the throttle where it was put, like a radio's.
   * bug-3a7be142 asked for the choice. See KEY_THROTTLE_MODES in
   * src/input/input.js. The keyboard only: a radio and the thumb sticks
   * already keep their throttle where it is left.
   */
  keyThrottle: 'hover',
  /*
   * FREESTYLE IS THREE DIFFERENT ACTIVITIES AND THEY WANT DIFFERENT RULES.
   * See FREESTYLE_SCORING above for what each value does.
   *
   * A scored run is two minutes with a board at the end of it, which is a
   * competition and is the right shape for one. Learning a Powerloop is
   * not: it is forty attempts, and a clock that keeps ending the session
   * turns practice into an interruption. 'free' takes the clock and the
   * board away and leaves the scoring on, so a pilot can still see whether
   * the thing they just flew counted.
   *
   * AND 'off' IS THE DEFAULT, WHICH IS THE POINT OF THIS FIELD. The trick
   * recogniser is not finished, and the whole of what this field does is
   * decide whether a pilot is shown its answers. It still misses shapes it should name and
   * still names some of them wrong, and a wrong name is worse than no name:
   * a pilot flying a Split-S and being paid for a Half Matty learns the
   * wrong thing about their own flying, and one that lands a clean orbit
   * and is told it was nothing concludes the orbit was bad. Freestyle's
   * job today is flight feel, so what a pilot gets without asking is a town
   * and a quad, and the scorer is a thing you switch on knowing what it is.
   * Since the counter (Stage C, 2026-09-26) that is still the whole of it:
   * the lines, gaps, close calls, the chase and the mark, are counted and
   * shown whatever this says (decision 2), and this decides trick names.
   *
   * The key is deliberately NOT the old 'freestyleRun'. Settings are saved
   * whole, so every returning pilot has that key holding the old default of
   * 'scored' whether or not they ever chose it, and reading it would mean
   * this default reached nobody who had ever opened the page. A new key has
   * no stored value for anyone, so the default applies once and the pilot's
   * own choice persists after that. It also ends a real ambiguity: Ui's own
   * `this.freestyleRun` is the last run's SUMMARY, not a mode.
   */
  freestyleScoring: 'off',
  /*
   * WHETHER THE ONE TIME SCORING RESET HAS RUN. See the block in
   * loadSettings that reads it, which is the whole of what it is for.
   */
  scoringReset: false,
  flightStyle: 'expert',
  /* Betaflight launch control. Off: ordinary takeoff. On: L on the start
   * line holds attitude at idle until you punch throttle. */
  launchControl: false,
  /*
   * Who the ghost drone chases: 'off', 'best' (your best lap this session)
   * or 'previous' (the lap before this one). Best is the default because a
   * pacer you have to discover in a menu is a pacer nobody meets: the first
   * finished lap quietly becomes the rival on the second, which is the
   * whole loop. A board rival picked off the leaderboard is session state
   * in main.js, not stored here, because it belongs to one course and one
   * visit. Laps record regardless of this setting, so switching it on
   * mid-session has the session to race.
   */
  ghost: 'best',
  cameraAngle: CAMERA_ANGLE_DEFAULT,
  cameraFov: CAMERA_FOV_DEFAULT,
  renderScale: 100,
  fpsCap: 0,
  /*
   * MANGA AND SCORING, the one switch over both (the owner, 2026-09-28: a
   * toggle for all the manga graphics and the scoring, the graphics only,
   * and none of the calculations under them). On by default, which is the
   * game as it was. Off, nothing of the manga look is drawn anywhere and no
   * score is drawn in flight: no speed lines, impact frame or screentone
   * (ui.manga is false), no score, combo or chase overlay, no black outline
   * round the world on Medium and High (the ink pass, which Low never draws:
   * setInkLines in src/render/quality.js), the menus' titles
   * in the system's own type and their panels without the ink frame, the
   * results as a list, and a found mark's moment in plain clothes. It is
   * the pictures and nothing else: the scorer, the counter, the chase, a
   * scored run's clock and its results, the bests and the board run exactly
   * as they do with it on. Clean FPV and the Impact frame are finer switches
   * inside it. See syncManga.
   */
  mangaAndScoring: true,
  /*
   * CLEAN FPV: the manga layer off (FREESTYLE-MAPS-PLAN.md sections 3.2 and
   * 3.3, decision 4). Off by default, because the layer is for freestyle
   * maps and on there unless the pilot turns it off; a race track is clean
   * whatever this says. It takes the lettered callouts, their sound effects
   * and the manga results page back to plain HUD text, and the speed lines,
   * the impact frame and the screentone out of the picture (src/main.js,
   * mangaFrame, reads ui.manga). See syncManga.
   */
  cleanFpv: false,
  /*
   * THE IMPACT FRAME'S OWN SWITCH (the plan, section 3.2 item 4): a crash
   * holds the moment for a beat, re-inked, then lets go. On by default on a
   * freestyle map, and a row of its own as well as Clean FPV, because a
   * flash is a photosensitivity question and not only a style one. Off
   * whatever this says when the system asks for reduced motion. See
   * src/render/manga.js, GENTLE.
   */
  impactFrame: true,
  /*
   * CROSSHAIRS: a fixed mark at the centre of the picture, which is where
   * the camera points, the way a Betaflight OSD can draw one. Off by
   * default, because a mark nobody asked for is a mark in the way of the
   * gate. Only the picture: the flight never sees it. A string so the
   * typeof gate accepts it, and loadSettings holds it to CROSSHAIRS.
   */
  crosshair: 'off',
  /*
   * FPS READOUT: the frame rate the browser is drawing at, in the corner of
   * the flight picture. Off by default, because a number nobody asked for
   * is a number in the way. Only the picture: it is counted from the frames
   * setOsd is handed, never from anything the flight reads. A boolean so
   * the typeof gate accepts it.
   */
  showFps: false,
  /*
   * STICK OVERLAY: the two gimbals at the bottom of the flight picture, a
   * dot on each following the live sticks. On by default, so a pilot on a
   * radio or a gamepad sees what the quad is being told, which they did not
   * before: the overlay used to be the keyboard's alone. Off removes the
   * gimbals for a clean picture; the Weight slider between them is not this
   * setting's and stays. Only the picture: it reads the channels the frame
   * loop already holds. A boolean so the typeof gate accepts it.
   */
  stickOverlay: true,
  /*
   * RACE LINE: in a whoop room, a trail of cream dots through the next gates
   * showing a good line a pilot can fly, the owner's ask of 2026-10-08 on
   * behalf of beginners. Off by default: a trail nobody asked for is a trail
   * in the way, and while it is off nothing is built, loaded or solved. Only
   * the picture: it reads the course and the room, never the flight. A
   * boolean so the typeof gate accepts it.
   */
  raceLine: false,
  /*
   * Shadows off: the picture without the sun's shadow map, on any preset.
   * The map is a second draw of the scene and a lookup in every lit pixel,
   * which is most of what Medium and High cost over Low on an integrated
   * GPU, and a tester asked for it by name (bug-baefef1b). Stored as the
   * exception so a save from before the row reads as shadows on, and a
   * boolean so loadSettings' typeof gate accepts it. Changing it rebuilds
   * the world, as a preset does; Low has no map and ignores it.
   */
  shadowsOff: false,
  packVoltage: 4.2,
  /*
   * How heavy the quad is, as a percentage of the weight the airframe is
   * flown at. See WEIGHT_STOCK above. 100 is the shipped machine and the
   * ONLY value that files a record on the public board, which is the same
   * rule the arcade style follows and for the same reason: a lap flown at a
   * different weight is a lap flown on a different aircraft.
   *
   * The key is `weight`. It replaced `gravity`, which was a percentage of
   * 1.0 and is not read: a stored 180 there meant 1.8 times g, which is
   * weight 111 here and not on the step, and carrying the number across
   * would file a pilot on a machine they never chose. `air` before that
   * scaled drag and is not read either.
   */
  weight: WEIGHT_STOCK,
  /*
   * FLIGHT FEEL TUNING (src/share/tune.js). A mode, off by default, that puts
   * two more sliders beside Weight while the quad is on the ground: Air grip,
   * how far the quad carries, and Motor power, the motors' KV. Both are
   * percentages of the machine as it ships, 100 is stock, and they are only
   * ever APPLIED while the mode is on (effectiveTune), so a pilot who turns
   * it off flies stock whatever is stored here and finds their tune again
   * when they turn it back on. Per airframe, like weight: see MACHINE_KEYS.
   *
   * A flight off stock goes off the public board, because a lap on a quad
   * that grips the air differently is a lap on a different aircraft and the
   * board has nowhere to say which. Weight keeps its own rule.
   */
  feelTuning: false,
  /*
   * TEST BRANCH ONLY. Do not merge this to main.
   *
   * The owner, 2026-10-09 13:04Z: "Push all the 3 sliders to test for
   * testing". They were on this branch already, behind the mode above, which
   * is off by default, so the test build showed Weight alone and looked as if
   * the other two had not been pushed. This marker is the scoringReset
   * pattern, read in loadSettings: the key is new, so no stored profile has
   * it, the first load turns feelTuning on and sets this together with it,
   * and the first save keeps both. After that the pilot's own choice stands,
   * so a tester who switches the mode off in the Quad room keeps it off.
   * DEFAULTS.feelTuning stays false because a changed default would reach
   * nobody who has already stored false. Undo it by reverting the one commit
   * that added this key and the block that reads it.
   */
  feelTuningTest: false,
  airGrip: AIR_GRIP_STOCK,
  motorKv: MOTOR_KV_STOCK,
  /* Whether the end of a flight flown off stock asks if it felt better than
   * stock. "Stop asking" on that question turns it off; Settings turns it
   * back on. Nothing is ever sent without a yes either way. */
  feelTuneAsk: true,
  laps: 3,
  sound: true,
  volume: 6,
  /* Per stem, zero to ten, each dividing by 10 to reach the audio API. The
   * types matter: loadSettings only accepts a stored key whose typeof matches
   * the default, so a level has to stay a number and the focus tone a
   * boolean, or an old localStorage value silently wins. */
  /* 5, down from 6: the owner asked for the motors low, softened and
   * unobtrusive, and the default is where most players leave them. */
  motorLevel: 5,
  windLevel: 5,
  musicLevel: 5,
  /* Which record: 'rotation' starts on a random track each visit then
   * walks the crate, a track id pins one. A string so the typeof gate
   * accepts it, and an unknown id (including the old generated-bed ids)
   * falls back to rotation. */
  musicTrack: 'rotation',
  focusTone: false,
  /*
   * The radio between the sticks and the flight controller. 'perfect' is
   * the behaviour this shell has always had, an exact packet grid with no
   * delay, and it stays the default so a lap time never changes underneath
   * a pilot who did not ask for it. See src/input/link.js.
   */
  link: 'perfect',
  /* Record the flight for download as a blackbox CSV. Off by default: it
   * holds every frame of the run in memory. */
  flightLog: false,
  /* Settings > Advanced > Support prompts, and src/share/supportprompt.js
   * reads it for the builder. Declared here because loadSettings keeps only
   * a key with a default: the switch went in on 2026-10-05 without one, so
   * Off was dropped by the next page load and the prompts came back. */
  supportPrompts: true,
  /* Named preset, not a bag of sliders. 'high' is the authored look and
   * the default on a first run that is not a Steam Deck; see
   * src/render/quality.js. A string so loadSettings' typeof gate accepts
   * it, and an unknown value falls back to high rather than throwing. */
  graphics: 'high',
  /* Whether the graphics value above was DETECTED or CHOSEN. Detection can
   * only guess from the user agent before a context exists, and the thing
   * worth knowing, whether this machine is rasterising on the CPU, is not
   * knowable until the session renderer is up. So boot is allowed to lower
   * a detected value once it can see the renderer, and is never allowed to
   * touch one the pilot picked. Picking any value in Settings clears this
   * for good, including picking the one detection would have chosen. */
  graphicsAuto: true,
  /*
   * WHAT AUTO HAS LEARNED ABOUT THIS MACHINE, kept so a boot does not undo
   * it (review finding F5, 2026-09-27). Measured: Auto has moved the preset
   * on the frames at least once, so the boot guess from the GPU's name
   * stands down (bootGuessGraphics in quality.js); it used to put a
   * promoted iGPU back to Medium at every boot. Raised: the preset Auto last
   * promoted into, or ''. Ceiling: the highest preset Auto may promote to,
   * or '', set when Auto had to come down from a preset it had raised to,
   * so a machine is not promoted and demoted again every session
   * (autoPresetMove in autoscale.js). A preset picked by hand clears all
   * three, because that ends Auto's say.
   */
  graphicsAutoMeasured: false,
  graphicsAutoRaised: '',
  graphicsAutoCeiling: '',
  /*
   * LOW LATENCY VIEW: ask the browser to present the flight canvas without
   * the compositor's frame queue (the canvas's desynchronized attribute, see
   * buildShell in src/render/shell.js). On by default because that queue is
   * one or two frames the pilot feels in the sticks and never sees in the
   * frame rate. It can tear, and it is a request that some platforms do not
   * grant, so it is a row: a context's attributes are fixed when it is made,
   * so a change here takes effect on the next load, and the note says so.
   */
  lowLatency: true,
  /*
   * PREDICTED VIEW: draw the FPV view where the quad will be when the frame
   * reaches the screen, one frame ahead, from its speed and rotation (see
   * src/render/predict.js). The picture is otherwise always a frame behind
   * the sticks. Only the picture: the flight, the lap and the physics never
   * see it. On by default; a row, because it is a thing a pilot feels and
   * may not want, and a report says whether it was on.
   */
  predictView: true,
  /*
   * FRAME PACING: which clock draws the frames. 'display' is the browser's
   * own beat, requestAnimationFrame. 'timer' draws on a timer at the
   * display's period less the GPU's measured frame, without asking the
   * display: each refresh then picks up a picture milliseconds old instead
   * of up to a whole refresh old, which the laptop it was built for
   * measured as 16 ms less key to screen and half the worst case
   * (bug-c7fb5247, plan P3.4). What it costs: more frames a second is
   * more GPU work a second, heat and battery, and Auto graphics holds
   * still while it runs because a timer's cadence says nothing about the
   * display. 'auto', the default, is the owner's ask of 2026-09-28: the
   * timer exactly when the graphics preset is Low, the preset for the
   * machines where the trade wins, however Low was reached, by hand, by
   * the boot guess or by Auto demoting. The ?loop= URL flag still forces
   * either loop for a session, over this. The derivation is
   * pacingTimerOn below; main.js swaps the loop live when this or the
   * preset changes, and paces LIVE FLYING only: a replay or the room's
   * film has no sticks to answer, so their frames keep the display's
   * beat whatever this row says (timerPacesNow in main.js, and the
   * battery day it was learned is in PROGRESS.md).
   */
  pacing: 'auto',
  /*
   * FULLSCREEN IN FLIGHT: Fly, Restart and Resume take the page fullscreen,
   * and the title gives the window back. A window in a desktop is composited
   * by the desktop, which on many a Linux laptop is one more frame between
   * the sticks and the glass, and a fullscreen window is one most desktop
   * compositors hand straight to the display. On by default; a browser that
   * will not go fullscreen simply stays where it is. See main.js,
   * enterFlightFullscreen.
   */
  fullscreenFly: true,
};

/*
 * Has this browser been told what the gravity slider is?
 *
 * ITS OWN KEY, not a field in the settings blob, and the reason is
 * detectFirstRun below: that function reads the existence of a saved settings
 * blob as proof that somebody has been here before, so folding this flag into
 * settings would make dismissing a hint promote a brand new visitor to a
 * returning pilot and take the first-run title screen away from them.
 *
 * Nor is it one of the prefixes detectFirstRun scans for, deliberately: a
 * pilot who read a hint and left has still never flown here.
 *
 * v2 because v1's card explained a drag slider, which this control is no
 * longer. The few browsers that dismissed that card were told about a knob
 * that does not exist any more, so they get the new one once. That is what
 * the version in the key is for, and it is cheaper than being wrong quietly.
 */
const AIR_HINT_KEY = 'webfpv.airhint.v2';
/* How long the card stays up in the air, on the run's airtime. Long enough
 * to read two sentences in a hover, short enough that it is gone before the
 * pilot is looking at the ground it covers. */
const AIR_HINT_AIR_MS = 8000;
/* How long the flight chips stay up once the quad is in the air, or after
 * the last pointer movement: see syncChipFade. Wall clock, because it is
 * chrome, not flight. */
const CHIPS_QUIET_MS = 3000;

function airHintSeen() {
  try {
    return localStorage.getItem(AIR_HINT_KEY) === '1';
  } catch (e) {
    /* Private mode cannot remember, so the hint is shown once per session
     * rather than never: a hint too often beats a control nobody can read. */
    return false;
  }
}

function markAirHintSeen() {
  try {
    localStorage.setItem(AIR_HINT_KEY, '1');
  } catch (e) {
    /* Private mode: dismissed for this session, which is all it can be. */
  }
}

/* Flight feel tuning's own card, the same way and for the same reason: its
 * own key, never a field in the settings blob. */
const TUNE_HINT_KEY = 'webfpv.tunehint.v1';

function tuneHintSeen() {
  try {
    return localStorage.getItem(TUNE_HINT_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function markTuneHintSeen() {
  try {
    localStorage.setItem(TUNE_HINT_KEY, '1');
  } catch (e) {
    /* Private mode: dismissed for this session. */
  }
}

/*
 * Has this browser ever flown here?
 *
 * The shell had this signal all along and threw it away: nothing on the
 * title told visit one from visit one hundred, so somebody who had never
 * held a stick got the same nine row list as somebody chasing a personal
 * best, with the thing they needed sitting seventh.
 *
 * TWO SIGNALS, BOTH HAVE TO BE COLD. A saved settings blob means somebody
 * changed something, and a stored best means somebody finished a lap. Either
 * one is enough to say this is not a first run, because getting one of them
 * wrong in the other direction would put the first-run screen in front of a
 * returning pilot, which is far worse than missing it once.
 */
function detectFirstRun() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      /* Saved settings are a returning pilot unless they say, in so many
       * words, that this pilot has not flown yet: see hasFlown. */
      try {
        const saved = JSON.parse(raw);
        if (saved && saved.hasFlown === false) {
          return true;
        }
      } catch (e) {
        /* Not JSON. loadSettings starts again from the defaults; this is
         * still somebody who has been here. */
      }
      return false;
    }
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      if (key.startsWith('webfpv.best') || key.startsWith('webfpv.trackbuilder')) {
        return false;
      }
    }
    return true;
  } catch (e) {
    /* Private mode cannot tell us, so assume a returning pilot. */
    return false;
  }
}

/* The whoop's id. See the migration in loadSettings. */
const WHOOP_ID = 'whoop65';
/*
 * THE WHOOP'S SHIPPED DEFAULTS THAT HAVE BEEN SUPERSEDED, and the value
 * each one used to hold.
 *
 * reseatIfForeign will not move any of these and should not: its rule is
 * "is this still the OTHER aircraft's stock value", which is what protects a
 * number the pilot actually chose, and none of these is the five inch's. So
 * that rule reads a superseded default as the pilot's own and keeps it, and
 * every pilot who flew the whoop before the change would sit on the old
 * value with no sign that a new one exists.
 *
 * Each entry moves ONCE, only from the exact figure that shipped, and only
 * on the whoop. Once is enforced by the whoopDefaults marker in DEFAULTS:
 * GENERATION is the number a profile carries after this table has been
 * applied to it, and the table is applied only to a profile carrying a
 * smaller one. A pilot who genuinely wants the old value has it on the menu
 * one row away, and it stays after they choose it.
 *
 * The history, because the same value has now shipped twice: the whoop
 * shipped on the stock whoop tune, a 65 percent cap and a 115 degree lens.
 * Generation 1 moved those to the Freestyle at a 150 master, 75 and 95.
 * Generation 2 moves the tune and the cap back, the lens stays at 95, and
 * the Freestyle's seeded master goes with the default it was seeded for.
 * A profile still on the generation 0 values is on today's tune and cap
 * already and only its lens moves.
 */
const SUPERSEDED_WHOOP = {
  GENERATION: 2,
  /* 75 percent, the generation 1 cap. Back to 65 with the stock tune. */
  throttleCap: 75,
  /* The Freestyle preset, the generation 1 tune. Back to the stock tune. */
  tune: 'whoop-freestyle',
  /* 115 degrees, chosen for a 5 by 6 m room. The room is 10 by 12 now. */
  cameraFov: 115,
  /*
   * The PID seed generation 1 laid on the Freestyle: master 150. Taken back
   * out only from a profile that RECEIVED it (pidsSeeded says so) and still
   * holds exactly it, so a pilot who moved that slider, or set the tune by
   * hand, keeps their own numbers.
   */
  pidsSeed: { tune: 'whoop-freestyle', sliders: { master: 150 } },
};

export function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch (e) {
    stored = {};
  }
  /* "null", a number or a string parses without throwing and is no settings. */
  if (!stored || typeof stored !== 'object') {
    stored = {};
  }
  const s = { ...DEFAULTS };
  const hadGraphics = typeof stored.graphics === 'string';
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof stored[k] === typeof DEFAULTS[k]) {
      s[k] = stored[k];
    }
  }
  if (s.flightMode !== 'angle') {
    s.flightMode = 'acro';
  }
  if (s.keyRaceMode !== 'acro') {
    s.keyRaceMode = 'angle';
  }
  /* A blob saved before hasFlown existed belongs to somebody who has been
   * here, and detectFirstRun has always called them returning. Without this
   * the default false would be written back on the next save and a veteran
   * would be offered First flight on their next visit. */
  if (Object.keys(stored).length && typeof stored.hasFlown !== 'boolean') {
    s.hasFlown = true;
  }
  if (!COURSE_ORDER_IDS.includes(s.courseOrder)) {
    s.courseOrder = DEFAULTS.courseOrder;
  }
  s.stickMode = normaliseStickMode(s.stickMode);
  s.keyThrottle = normaliseKeyThrottle(s.keyThrottle);
  /*
   * A setting the pilot picks off a LIST has to still be on that list.
   *
   * The typeof gate above is not enough on its own: it accepts any number at
   * all, so a hand edited local storage entry could set the field of view to
   * 5 and the projection would be a telescope with no way back except
   * clearing the site. It also silently keeps a value the list no longer
   * offers, which is how the field of view recalibration would have reached
   * nobody who had ever opened Settings: their stored 100 is not on the new
   * list and was chosen against a different camera model, so it goes back to
   * the default rather than being snapped to the nearest survivor.
   */
  /*
   * The airframe is validated FIRST and on its own, because the tune list
   * below depends on it. A stored airframe the build no longer offers has to
   * become the five inch before the tune is checked, or a pilot on a removed
   * airframe would keep a tune no airframe can load.
   */
  if (!AIRFRAME_IDS.includes(s.airframe)) {
    s.airframe = DEFAULTS.airframe;
  }
  /*
   * And which aircraft the stored machine settings were SET FOR, which is
   * not the stored airframe when the builder's class toggle has moved it
   * since the last load (see seatedFor). Everything below is validated
   * against the aircraft it was set for, and the move to the wanted one is
   * made at the end, by seatAirframe, so the aircraft being left is put away
   * whole rather than half validated against the other machine.
   */
  const wanted = s.airframe;
  const marked = AIRFRAME_IDS.includes(s.seatedFor);
  if (marked) {
    s.airframe = s.seatedFor;
  }
  s.hangar = hangarOf(s);
  for (const [key, allowed] of [
    ['tune', tuneChoices(s.airframe)],
    ['link', Object.keys(LINK_PRESETS)],
    ['pacing', PACING_MODES],
    ['cameraFov', CAMERA_FOVS],
    ['renderScale', RENDER_SCALES],
    ['fpsCap', FPS_CAPS],
    ['flightStyle', FLIGHT_STYLES],
    ['laps', LAP_COUNTS],
    ['packVoltage', PACK_VOLTAGES],
    ['musicTrack', musicIds()],
    ['ghost', ['off', 'best', 'previous']],
    ['freestyleScoring', FREESTYLE_SCORING],
    ['crosshair', CROSSHAIRS],
    ['graphicsAutoRaised', ['', ...GRAPHICS_IDS]],
    ['graphicsAutoCeiling', ['', ...GRAPHICS_IDS]],
  ]) {
    if (!allowed.includes(s[key])) {
      /* The tune's fallback is the AIRFRAME's default tune, not the blob's:
       * a whoop whose stored tune has gone must land on a whoop tune. */
      s[key] = key === 'tune' ? airframeById(s.airframe).defaultTune : DEFAULTS[key];
    }
  }
  /* Pack charge is per airframe too: 6S LiPo runs 4.20 to 3.50 and 1S LiHV
   * runs 4.35 to 3.60, and a stored 3.50 on a whoop is a cell nobody flies. */
  {
    const af = airframeById(s.airframe);
    if (!af.packVoltages.includes(s.packVoltage)) {
      s.packVoltage = af.packVoltages[0];
    }
  }
  /* Angle is a range, not a list: a stored 40 from the old six-step menu
   * must survive, a stored 90 must not, and 45 has to be legal now. */
  s.cameraAngle = clampCameraAngle(s.cameraAngle);
  /* Weight is a range too, and the module REFUSES a gravity outside its own
   * band, so a hand edited blob has to be brought back before it reaches
   * sim_set_gravity. Against the airframe's own top, which is lower on the
   * whoop than the five inch. */
  s.weight = clampWeight(s.weight, s.airframe);
  /* And the two tuning sliders, against their own bands: the module refuses
   * a scale outside 0.5 to 2.0 and 0.8 to 1.2, and a hand edited blob must
   * not be able to ask for one. */
  s.airGrip = clampAirGrip(s.airGrip);
  s.motorKv = clampMotorKv(s.motorKv);
  /*
   * The rate profile, from whichever shape this blob was written in.
   *
   * A save from before the rates screen learned the five Betaflight rate
   * systems carries five flat numbers instead: Max rate in deg/s, a yaw
   * copy of it, centre sensitivity, whole expo and the throttle cap. They
   * are read across rather than discarded, because a pilot who chose 900
   * deg/s and 20 expo asked for that and should not be quietly put back on
   * the Betaflight default by an upgrade. Everything else is clamped by
   * normaliseRates, which is also what makes a hand edited localStorage
   * blob unable to put an out of range number into a uint8 field.
   */
  const legacy = typeof stored.rates === 'object' && stored.rates ? null : ratesFromLegacy(stored);
  /* A profile that has never held rates in any shape, on a device with
   * thumbs, starts on the touch profile: the stock 670-no-expo default is
   * calibrated against a gimbal and is unflyable on glass. Only ever a
   * STARTING POINT for a blank profile; a stored rates object of any age
   * takes the ordinary path, and the flag records that the hand-off is
   * done so main.js never re-offers. */
  const neverHadRates = !legacy && !(stored.rates && typeof stored.rates === 'object');
  if (neverHadRates && touchWanted()) {
    s.rates = normaliseRates(TOUCH_RATE_DEFAULTS);
    s.touchRatesOffered = true;
  } else {
    s.rates = normaliseRates(legacy || s.rates);
  }
  /* The shipped rates moved (2026-10-09, 70 / 670 to 60 / 600). A profile
   * still holding the old stock on every axis never chose it, so it moves
   * once with the default; the throttle limit and curve stay as they are. */
  if (!(s.stockRates >= SUPERSEDED_RATES.GENERATION)) {
    if (ratesAreSupersededStock(s.rates)) {
      s.rates = normaliseRates({
        ...s.rates,
        roll: { ...RATE_DEFAULTS.roll },
        pitch: { ...RATE_DEFAULTS.pitch },
        yaw: { ...RATE_DEFAULTS.yaw },
      });
    }
    s.stockRates = SUPERSEDED_RATES.GENERATION;
  }
  /*
   * THE WHOOP'S SHIPPED DEFAULTS MOVED, and a stored copy of the old ones
   * has to move with them. See SUPERSEDED_WHOOP for what and why, and the
   * whoopDefaults marker in DEFAULTS for why this runs once per profile
   * rather than on every load.
   */
  const migrate = !(s.whoopDefaults >= SUPERSEDED_WHOOP.GENERATION);
  if (migrate && s.airframe === WHOOP_ID) {
    const af = airframeById(WHOOP_ID);
    if (s.rates && s.rates.throttleCap === SUPERSEDED_WHOOP.throttleCap) {
      s.rates = { ...s.rates, throttleCap: af.rates.throttleCap };
    }
    if (s.tune === SUPERSEDED_WHOOP.tune) {
      s.tune = af.defaultTune;
    }
    if (s.cameraFov === SUPERSEDED_WHOOP.cameraFov) {
      s.cameraFov = af.cameraFov;
    }
  }
  /* The PID adjustment, clamped onto what the firmware and the menu will
   * take. An unknown tune id, an out-of-range slider or a half-complete
   * expert table cannot survive a localStorage edit into the emitter. */
  s.pids = normalisePids(s.pids);
  /*
   * The seeded slider goes with the default it was seeded for, whatever
   * aircraft is seated, because it is keyed by tune and not by seat: a
   * five inch pilot who once flew the whoop carries it too. Only an entry
   * this shell laid down itself and that has not been touched since.
   */
  if (migrate) {
    const seed = SUPERSEDED_WHOOP.pidsSeed;
    const e = s.pids[seed.tune];
    const seeded = s.pidsSeeded && typeof s.pidsSeeded === 'object' && s.pidsSeeded[seed.tune];
    const untouched = e && e.mode === 'sliders' && !e.pids
      && Object.keys(e.sliders).length === Object.keys(seed.sliders).length
      && Object.keys(seed.sliders).every((k) => e.sliders[k] === seed.sliders[k]);
    if (seeded && untouched) {
      const rest = { ...s.pids };
      delete rest[seed.tune];
      s.pids = rest;
    }
  }
  s.whoopDefaults = SUPERSEDED_WHOOP.GENERATION;
  /*
   * The seated aircraft's starting PID adjustment, after normalisePids so it
   * is not stripped as an unknown entry, and after the tune is final so it
   * lands on the tune it was chosen against. One shot: see seedAirframePids.
   */
  seedAirframePids(s, s.airframe);
  /* The race field is gone. A stored 'field', or an id no map has, flies
   * the track world. City is left alone. */
  if (s.map === 'field' || !MAPS.some((m) => m.id === s.map)) {
    s.map = 'custom';
  }
  /* The remembered freestyle world, by the same rule: a stale id, or a
   * track id sitting in the freestyle slot, means nothing was chosen. */
  if (!MAPS.some((m) => m.id === s.freestyleMap && m.mode === 'freestyle')) {
    s.freestyleMap = '';
  }
  /*
   * ANYTHING STILL BELONGING TO THE OTHER AIRCRAFT.
   *
   * The seated airframe can be moved from outside this file: the track
   * builder's class toggle writes it. That writer knows which aircraft is
   * wanted and deliberately does not know its tune, its pack, its rates or
   * its camera, because knowing would mean the builder pulling the whole
   * shell in to draw a two button toggle.
   *
   * So the reconciliation is here, on the way in. A blob that says which
   * aircraft its settings were set for is moved by seatAirframe, exactly as
   * the Aircraft row moves it, when that is not the aircraft wanted, and is
   * otherwise TRUSTED: the values in it are the pilot's. A blob from before
   * seatedFor existed cannot say, and gets the old guess one last time; the
   * next save marks it.
   */
  if (!marked) {
    reseatIfForeign(s);
    s.seatedFor = s.airframe;
  } else if (wanted !== s.airframe) {
    seatAirframe(s, wanted);
  }
  /* A profile whose pitch differs from its roll has to show three axes,
   * whatever the stored menu shape says, or the rows would be editing a
   * pitch the pilot cannot see. */
  if (!pitchMatchesRoll(s.rates)) {
    s.ratesSplitPitch = true;
  }
  /*
   * THE ONE TIME SCORING RESET, and it is here because of a bug rather than
   * because of a change of mind.
   *
   * The radio's roll stick used to adjust the row under the cursor on a card
   * screen, which the keyboard's own arrows deliberately do not do. With one
   * freestyle world the Freestyle room draws no cards, so Scoring is its
   * first row and the cursor opens on it, and cycle() wraps: one nudge of
   * roll left, the gesture that means BACK on every other row in the
   * product, took the default 'off' the long way round to 'scored' and
   * saved it. See padMenu, where that is fixed.
   *
   * Nothing in the blob can tell that write apart from a deliberate one, so
   * a pilot carrying 'free' or 'scored' today may never have asked for it,
   * and the argument at DEFAULTS.freestyleScoring reached none of them. The
   * value goes back to the default ONCE.
   *
   * It moves once and it is not a policy: the flag rides in the same blob,
   * so the first save after this load records that it has run, and a pilot
   * who switches scoring back on the same minute keeps it forever after. A
   * pilot who saves nothing at all is a pilot whose value is already the
   * default, so re-running costs them nothing either.
   */
  if (!s.scoringReset) {
    s.freestyleScoring = DEFAULTS.freestyleScoring;
    s.scoringReset = true;
  }
  /* TEST BRANCH ONLY: the three tuning sliders on for every tester, once.
   * See DEFAULTS.feelTuningTest for the argument and for how to undo it. */
  if (!s.feelTuningTest) {
    s.feelTuning = true;
    s.feelTuningTest = true;
  }
  /* First run, or an older save from before this key existed: pick Low
   * on a Deck so the page is flyable, High everywhere else so the
   * authored look is what a new desktop player sees. A stored choice,
   * even a stale one, wins over detection. */
  if (!hadGraphics) {
    s.graphics = detectDefaultGraphics();
  } else {
    s.graphics = normalizeGraphics(s.graphics);
  }
  return s;
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (e) {
    /* private mode: settings simply do not persist */
  }
}

/*
 * Move the settings blob onto an airframe: the things that BELONG TO THE
 * MACHINE and cannot survive a change of it.
 *
 * The rule this follows is the one the Quad screen's own comment states: a
 * setting lives with the machine if it stops meaning anything when the
 * machine changes. Four do.
 *
 *   tune         a Betaflight diff for a 1S 23 gram quad on a 710 gram 6S
 *                one is not a different feel, it is an oscillation.
 *   rates        the maker ships 580 deg/s on a racing whoop against
 *                Betaflight's 670 for a 5 inch, and a track three metres
 *                wide is why.
 *   packVoltage  6S LiPo is 4.20 to 3.50 and 1S LiHV is 4.35 to 3.60. A
 *                stored 3.50 on a whoop is a cell nobody flies.
 *   camera       fov and tilt, which ui.js already keeps in Quad rather
 *                than Pilot precisely because they are bolted to the
 *                airframe.
 *
 * Rates are the one that could be argued the other way, and configs/rates.js
 * says outright that rates are the PILOT'S. They still are: this reseeds
 * them only when they are still the previous airframe's stock profile, so a
 * pilot who has set their own rates keeps them across a change and one who
 * has not gets the new machine's factory numbers instead of the old one's.
 */
/*
 * Move any setting that still belongs to the OTHER aircraft, and leave every
 * setting the pilot has actually chosen.
 *
 * The test for "not chosen" is the same one seatAirframe uses for rates:
 * does it still hold the other machine's stock value. A pilot who set 100
 * degrees of lens on a five inch keeps it on a whoop, because 100 is neither
 * aircraft's default and is therefore theirs. A pilot who never touched it
 * gets the whoop's 115.
 *
 * ONLY FOR A BLOB THAT CANNOT SAY WHICH AIRCRAFT IT WAS SET FOR, which is a
 * blob from before seatedFor. The test is a guess, and it guesses wrong for
 * a pilot whose own choice happens to be the other machine's stock: since
 * the whoop's stock lens became 95, a five inch pilot who picked 95 lost it
 * at every load (bug-ddfe1c6d). A marked blob is never guessed at.
 */
function reseatIfForeign(s) {
  const a = airframeById(s.airframe);
  const other = AIRFRAMES.find((x) => x.id !== a.id);
  if (!tuneChoices(a.id).includes(s.tune)) {
    s.tune = a.defaultTune;
  }
  if (!a.packVoltages.includes(s.packVoltage)) {
    s.packVoltage = a.packVoltages[0];
  }
  s.weight = clampWeight(s.weight, a.id);
  s.airGrip = clampAirGrip(s.airGrip);
  s.motorKv = clampMotorKv(s.motorKv);
  if (!other) {
    return s;
  }
  if (ratesMatch(s.rates, other.rates)) {
    s.rates = normaliseRates({ ...s.rates, ...structuredCloneRates(a.rates) });
  }
  if (s.rates && s.rates.throttleCap === other.rates.throttleCap) {
    s.rates = normaliseRates({ ...s.rates, throttleCap: a.rates.throttleCap });
  }
  if (s.cameraFov === other.cameraFov) {
    s.cameraFov = a.cameraFov;
  }
  if (s.cameraAngle === clampCameraAngle(other.cameraAngle)) {
    s.cameraAngle = clampCameraAngle(a.cameraAngle);
  }
  return s;
}

/*
 * THE SETTINGS THAT BELONG TO ONE MACHINE, which seatAirframe puts away in
 * the hangar when the pilot leaves an aircraft and gives back when they
 * return to it. The four the note under saveSettings names, less the rates,
 * which are the pilot's and keep their own rule in seatAirframe, and two
 * more that turned out to be the machine's as well:
 *
 *   weight  a percentage of THIS aircraft's stock mass, with this aircraft's
 *           top, so a five inch on 140 came back from the whoop on 120.
 *   pids    the PID adjustment is keyed by tune id and both aircraft fly the
 *           same tune id, so tuning the whoop on the PIDs screen retuned the
 *           five inch as well (bug-693b9ed4).
 *
 * The pilot's own "Your edits" dump is per aircraft too, in its own storage:
 * see readFcDump in src/fc/dump.js. The tune here only says it is chosen.
 */
const MACHINE_KEYS = ['tune', 'packVoltage', 'weight', 'airGrip', 'motorKv', 'cameraFov', 'cameraAngle', 'pids'];

/* The hangar as a fresh object holding only aircraft this build knows, so a
 * hand edited blob cannot have seatAirframe write through into anything. */
function hangarOf(s) {
  const out = {};
  const h = s.hangar;
  if (!h || typeof h !== 'object' || Array.isArray(h)) {
    return out;
  }
  for (const id of AIRFRAME_IDS) {
    if (h[id] && typeof h[id] === 'object' && !Array.isArray(h[id])) {
      out[id] = h[id];
    }
  }
  return out;
}

/* Exported for scripts/shots.js, which has to seed the answer a pilot gives
 * on the choice screen. A seed that wrote only the airframe would leave the
 * rates and the camera belonging to the other aircraft, and every capture
 * past that point would be a photograph of a state the shell never puts a
 * pilot in. One function, so the seed cannot drift from the answer. */
export function seatAirframe(s, id) {
  const from = airframeById(s.airframe);
  const to = airframeById(id);
  /*
   * PUT THE AIRCRAFT BEING LEFT AWAY, and take out the one being returned
   * to. Only on a real change: called with the aircraft already seated this
   * changes nothing the pilot set. Twice it did, by writing that aircraft's
   * stock camera over theirs: from the gate, which now asks first, and from
   * a ?craft= link naming the aircraft already seated, which the track
   * builder's Fly button writes, so a pilot flying their own map from the
   * builder was put back on 30 degrees and 85 every time (bug-ddfe1c6d).
   *
   * The first time an aircraft is seated there is nothing to give back, and
   * it gets what it always got: its stock camera, its default tune when the
   * pilot's is not on its row, and the PIDs as they stand. Every time after
   * that, it gets what the pilot left on it.
   */
  const moving = from.id !== to.id;
  const hangar = hangarOf(s);
  const back = moving ? hangar[to.id] : null;
  if (moving) {
    /* The PIDs as a fresh copy, because on a first visit the new aircraft
     * keeps flying the same object, and clearPidsFor deletes from it in
     * place: a Reset to stock on the whoop would have reached into the five
     * inch's put away adjustment too. */
    const away = {};
    for (const k of MACHINE_KEYS) {
      away[k] = k === 'pids' ? normalisePids(s.pids) : s[k];
    }
    hangar[from.id] = away;
    delete hangar[to.id];
  }
  s.hangar = hangar;
  s.airframe = to.id;
  s.seatedFor = to.id;
  if (back) {
    /* Each value through the same gate the loader puts it through, against
     * this aircraft: the tune, pack and weight lines below, the lens list
     * and the tilt range here, and normalisePids. */
    if (typeof back.tune === 'string') {
      s.tune = back.tune;
    }
    if (typeof back.packVoltage === 'number') {
      s.packVoltage = back.packVoltage;
    }
    if (typeof back.weight === 'number') {
      s.weight = back.weight;
    }
    /* The tuning sliders are the machine's as well: a motor power chosen for
     * the whoop is not one the five inch should wake up with. A hangar from
     * before they existed has neither and the aircraft keeps what it has. */
    if (typeof back.airGrip === 'number') {
      s.airGrip = back.airGrip;
    }
    if (typeof back.motorKv === 'number') {
      s.motorKv = back.motorKv;
    }
    s.cameraFov = CAMERA_FOVS.includes(back.cameraFov) ? back.cameraFov : to.cameraFov;
    s.cameraAngle = clampCameraAngle(typeof back.cameraAngle === 'number' ? back.cameraAngle : to.cameraAngle);
    s.pids = normalisePids(back.pids);
  } else if (moving) {
    s.cameraFov = to.cameraFov;
    s.cameraAngle = clampCameraAngle(to.cameraAngle);
    /* A first visit starts both tuning sliders at stock. A tune is a set of
     * numbers for one machine, and carrying a five inch's Motor power onto a
     * whoop that has never been flown would be handing it a tune nobody made
     * for it. */
    s.airGrip = AIR_GRIP_STOCK;
    s.motorKv = MOTOR_KV_STOCK;
  }
  if (!tuneChoices(to.id).includes(s.tune)) {
    s.tune = to.defaultTune;
  }
  if (!to.packVoltages.includes(s.packVoltage)) {
    s.packVoltage = to.packVoltages[0];
  }
  /* A five inch at 140 is not a weight the whoop offers, so it comes down to
   * the whoop's top. Anything inside both ranges stays the pilot's. */
  s.weight = clampWeight(s.weight, to.id);
  s.airGrip = clampAirGrip(s.airGrip);
  s.motorKv = clampMotorKv(s.motorKv);
  if (ratesMatch(s.rates, from.rates)) {
    s.rates = normaliseRates({ ...s.rates, ...structuredCloneRates(to.rates) });
  }
  /*
   * The throttle limit moves on its own test, not with the rates, because it
   * is not part of a rate profile: configs/rates.js keeps it outside the
   * system on purpose so it survives a type change. It is the aircraft's
   * though, and a whoop wants 65 where a five inch wants the whole stick, so
   * it follows the same "still the other machine's" rule the rates do. A
   * pilot who set 80 keeps 80.
   */
  if (s.rates && s.rates.throttleCap === from.rates.throttleCap) {
    s.rates = { ...s.rates, throttleCap: to.rates.throttleCap };
  }
  /* And the aircraft's starting PID adjustment, if it ships one and this
   * profile has never been offered it. The tune moved to the new aircraft's
   * default a few lines up, which is the tune the seed is keyed to. */
  seedAirframePids(s, to.id);
  return s;
}

/* A rate profile object from an airframe row, deep enough that normaliseRates
 * cannot write through into the registry's own literal. */
/*
 * Lay down an airframe's starting PID adjustment for its default tune, once.
 *
 * No airframe ships one today. The whoop did, for a while: the maker's
 * Freestyle preset with the master slider at 150 percent, the owner's
 * setting flown, until the owner flew the machine hard and asked for the
 * the stock tune instead; SUPERSEDED_WHOOP takes that seed back out. The
 * mechanism stays for the next airframe that wants one. It is a SEED and
 * not a setting, so it lands on a profile that has never had an adjustment
 * for that tune and never lands twice; see pidsSeeded above for why once
 * matters.
 *
 * Keyed to the airframe's DEFAULT TUNE rather than to the airframe, because
 * that is what such a number is chosen against. A master chosen for one
 * preset on top of another preset's own master is a figure nobody picked.
 */
function seedAirframePids(s, id) {
  const af = airframeById(id);
  const tune = af.defaultTune;
  if (!af.defaultPids || !tune) {
    return s;
  }
  if (!s.pids || typeof s.pids !== 'object') {
    s.pids = {};
  }
  if (!s.pidsSeeded || typeof s.pidsSeeded !== 'object') {
    s.pidsSeeded = {};
  }
  if (s.pidsSeeded[tune]) {
    return s;
  }
  /* Marked either way. A pilot who has already adjusted this tune owns it,
   * and the seed must not arrive later if they reset it. */
  s.pidsSeeded = { ...s.pidsSeeded, [tune]: true };
  if (!s.pids[tune]) {
    s.pids = { ...s.pids, [tune]: { sliders: { ...af.defaultPids } } };
  }
  return s;
}

function structuredCloneRates(r) {
  return {
    type: r.type,
    roll: { ...r.roll },
    pitch: { ...r.pitch },
    yaw: { ...r.yaw },
  };
}

/* Is this profile still the airframe's stock one? Type and the three axes;
 * the throttle cap and curve are the pilot's on any airframe and are not
 * compared. */
function ratesMatch(have, want) {
  if (!have || have.type !== want.type) {
    return false;
  }
  for (const axis of ['roll', 'pitch', 'yaw']) {
    const a = have[axis];
    const b = want[axis];
    if (!a || a.rcRate !== b.rcRate || a.srate !== b.srate || a.expo !== b.expo) {
      return false;
    }
  }
  return true;
}

/*
 * m:ss, for the freestyle run clock. Whole seconds, rounded UP so the
 * readout reaches 0:00 exactly when the run ends rather than sitting on it
 * for a second first, and no hundredths: this is written every frame and a
 * hundredths readout is sixty style invalidations a second for a number
 * nobody reads at that resolution, and it jitters under the eye.
 *
 * Not formatTime, which is the LAP clock's shape and prints hundredths
 * because a lap is won and lost in them. A run is not.
 */
export function formatRunClock(ms) {
  /* An untimed run reports Infinity, which is not a clock. Nothing in the
   * shell builds one, only the self-test does, but a readout that can print
   * "Infinity:NaN" is one refactor away from being seen. */
  if (!Number.isFinite(ms)) {
    return '--:--';
  }
  const left = Math.ceil((ms > 0 ? ms : 0) / 1000);
  const m = Math.floor(left / 60);
  const sec = left - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export function formatTime(ms) {
  if (ms == null || !Number.isFinite(ms)) {
    return '--.--';
  }
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  if (m > 0) {
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }
  return s.toFixed(2);
}

function formatDelta(ms) {
  if (ms == null || !Number.isFinite(ms)) {
    return '';
  }
  const core = formatTime(Math.abs(ms));
  if (ms < 0) {
    return `-${core}`;
  }
  if (ms > 0) {
    return `+${core}`;
  }
  return core;
}

function makeGimbal(caption) {
  const box = el('div', 'osd-gimbal');
  const plate = el('div', 'osd-gimbal-plate');
  plate.append(el('div', 'osd-cross-x'), el('div', 'osd-cross-y'));
  /* The dot rides a transparent layer the plate's own size, and it is that
   * layer that moves, by transform: a percentage in translate() is a
   * fraction of the element's own box, so on a plate of any size 50 per cent
   * is half the plate, and nothing is laid out when a stick moves. The dot
   * used to move by left and top, a layout every frame the keys were held.
   * See placeNub. */
  const nub = el('div', 'osd-nub-track');
  nub.append(el('div', 'osd-nub'));
  plate.append(nub);
  /* The caption is kept because it is not a constant any more: it names the
   * channels this pilot's stick mode put on this plate. See setStickMode. */
  const cap = el('div', 'osd-gimbal-cap', caption);
  box.append(plate, cap);
  return { box, nub, cap };
}

/*
 * THE GRAVITY SLIDER, drawn. Built here rather than inline in build() because
 * it is four elements and a hint card, and build() is already the longest
 * thing in this file.
 *
 * THE CLASS NAMES STILL SAY AIR AND THEY STAY THAT WAY. This control scaled
 * the drag set for one afternoon before the pilot flew it and named the axis
 * they actually meant, and renaming .osd-air to .osd-grav is exactly the move
 * the .corner-chip note further down this file was written in blood about:
 * webfpv.org serves index.html at max-age=0 and this script at max-age=14400,
 * so for four hours a returning browser pairs the NEW stylesheet with the OLD
 * script. Renamed classes leave that script writing elements no rule matches,
 * which drops an unstyled slider and an unpositioned hint card into the
 * middle of a race. A class name is the contract across that seam. The label
 * a pilot reads is not, so that is what changed.
 *
 * The control is a native input[type=range] wearing .row-range, exactly the
 * one the Rates and PIDs screens use, so drag, touch, and arrow keys on a
 * focused track are the browser's problem in all three places. What differs
 * from those screens is WHEN it commits: there it is on release, because each
 * one re-inits the module and a re-init per drag pixel would stutter. This
 * one calls sim_set_gravity, which is a single store into the plant, so it
 * commits live on 'input' and the pilot feels the weight arrive under the
 * craft mid drag. That is the entire point of putting it here.
 */
function makeWeightSlider({ min, max, step, value, label }) {
  const box = el('div', 'osd-air is-off');

  const hint = el('div', 'osd-air-hint');
  hint.hidden = true;
  hint.append(el('p', 'osd-air-hint-title', 'Weight'));
  hint.append(el(
    'p',
    'osd-air-hint-body',
    'Drag this if the quad feels floaty or too heavy. Right makes it heavier,'
    + ' so it drops when you chop the throttle and stops hanging at the top'
    + ' of a jump. Left makes it lighter and it floats. Hover moves up and'
    + ' down the stick with it, which is most of what you will feel.',
  ));
  const dismiss = btn('osd-air-hint-btn', 'Got it');
  hint.append(dismiss);

  const row = el('div', 'osd-air-row');
  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'row-range osd-air-range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  range.setAttribute('aria-label', label);
  row.append(el('span', 'osd-air-end', 'Floaty'), range, el('span', 'osd-air-end', 'Sinky'));

  const cap = el('div', 'osd-air-cap', '');
  box.append(hint, row, cap);
  const tune = makeTuneGroup();
  box.append(tune.hint, tune.box);
  return {
    box, range, cap, hint, dismiss, tune,
  };
}

/*
 * THE TWO SLIDERS FLIGHT FEEL TUNING ADDS, under Weight in the same block.
 *
 * They are children of .osd-air and built from the same parts, so they take
 * the Weight slider's whole life for nothing: the fade in the air, the
 * return on the ground, the dim under the pause menu, the two classes on the
 * range that keep the OSD's amber, the focus rule in bindAirSlider. A class
 * name is a contract across the deploy cache seam (read the note above
 * makeWeightSlider), so .osd-air and its children are untouched and the new
 * parts only add classes.
 *
 * Hidden until the mode is on (paintAir), so a pilot who never turns it on
 * has exactly the block they had.
 *
 * AIR GRIP runs Carries to Grips because that is the direction a pilot
 * names it: left, the air lets go and the quad coasts; right, it holds on.
 * MOTOR POWER runs Softer to Punchier for the same reason.
 */
function makeTuneRow({
  min, max, step, left, right, label,
}) {
  const row = el('div', 'osd-air-row');
  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'row-range osd-air-range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.setAttribute('aria-label', label);
  row.append(el('span', 'osd-air-end', left), range, el('span', 'osd-air-end', right));
  /* The row and its caption in a box of their own, so a slider the module
   * cannot answer is put away as one thing (paintAir): the row's own display
   * would beat the hidden attribute. */
  const cap = el('div', 'osd-air-cap', '');
  const box = el('div', 'osd-tune-item');
  box.append(row, cap);
  return {
    box, row, range, cap,
  };
}

function makeTuneGroup() {
  const box = el('div', 'osd-tune');
  box.hidden = true;
  const grip = makeTuneRow({
    min: AIR_GRIP_MIN,
    max: AIR_GRIP_MAX,
    step: AIR_GRIP_STEP,
    left: 'Carries',
    right: 'Grips',
    label: 'Air grip, how far the quad carries',
  });
  const power = makeTuneRow({
    min: MOTOR_KV_MIN,
    max: MOTOR_KV_MAX,
    step: MOTOR_KV_STEP,
    left: 'Softer',
    right: 'Punchier',
    label: 'Motor power, how hard the motors pull',
  });
  const reset = btn('osd-air-hint-btn osd-tune-reset', 'Reset to stock');
  box.append(grip.box, power.box, reset);
  /* Its own card, once ever, the first time the mode is on and the quad is
   * down. Outside the group so hiding the group never hides it from the
   * code that raises it; positioned like the Weight card, above the block. */
  const hint = el('div', 'osd-air-hint osd-tune-hint');
  hint.hidden = true;
  hint.append(el('p', 'osd-air-hint-title', 'Flight feel tuning'));
  /* Kept so setTuneCaps can reword it for a module that has one slider. */
  const body = el('p', 'osd-air-hint-body', tuneCardText());
  hint.append(body);
  const hintBtn = btn('osd-air-hint-btn', 'Got it');
  hint.append(hintBtn);
  return {
    box, grip, power, reset, hint, hintBtn, body,
  };
}

/*
 * ONE CELL PER AXIS THE RADIO REPORTS, for the calibrate screen and Stick
 * help alike. Built once per axis count and moved after that: rebuilding the
 * row every frame would throw away the dot's transition and churn the DOM at
 * the frame rate, for a strip whose whole job is to look steady.
 *
 * The dot is the live value on a fixed -1 to 1 track, so a coarse axis steps
 * and a fine one glides, and a pilot can see which of their controls is which
 * without knowing what any of it means yet. `withChannel` writes under each
 * cell the channel the sim reads from that axis, which is Stick help's whole
 * point and would be noise in the wizard, where the channels are the thing
 * still being found. Returns the cells, which the caller keeps.
 */
function paintAxisStrip(root, cells, axes, withChannel) {
  let out = cells;
  if (out.length !== axes.length) {
    root.textContent = '';
    out = axes.map((a) => {
      const cell = el('div', 'cal-axis');
      cell.append(el('span', 'cal-axis-n', String(a.i)));
      const track = el('span', 'cal-axis-track');
      const span = el('i', 'cal-axis-span');
      const dot = el('i', 'cal-axis-dot');
      track.append(span, dot);
      cell.append(track);
      const ch = withChannel ? el('span', 'cal-axis-ch', '') : null;
      if (ch) {
        cell.append(ch);
      }
      root.append(cell);
      return {
        cell, span, dot, ch,
      };
    });
  }
  /* Nothing to say about a radio that has gone away, and an empty strip
   * says it better than eight stale dots. */
  root.hidden = axes.length === 0;
  const pct = (v) => `${Math.max(0, Math.min(100, ((v + 1) / 2) * 100)).toFixed(1)}%`;
  axes.forEach((a, k) => {
    const c = out[k];
    if (!c) {
      return;
    }
    c.dot.style.left = pct(a.v);
    /* The travel bar is the range seen so far, drawn between its two
     * ends, which is what the full range step is asking the pilot to
     * grow. One axis unit is half the track. */
    const lo = Number.isFinite(a.lo) ? a.lo : a.v;
    const hi = Number.isFinite(a.hi) ? a.hi : a.v;
    c.span.style.left = pct(lo);
    c.span.style.width = `${Math.max(0, Math.min(100, (hi - lo) * 50)).toFixed(1)}%`;
    const live = Math.abs(a.v - (a.rest || 0)) > 0.15;
    Ui.klass(c.cell, `cal-axis${a.mapped ? ' is-mapped' : ''}${live ? ' is-live' : ''}`);
    if (c.ch) {
      Ui.text(c.ch, a.channel || 'unread');
    }
  });
  return out;
}

function makePadCard() {
  const card = el('div', 'pad-card');
  const title = el('div', 'pad-card-title', '');
  const art = el('div', 'pad-card-art');
  const left = makeGimbal('');
  const right = makeGimbal('');
  art.append(left.box, right.box);
  const name = el('div', 'pad-card-name', '');
  const status = el('div', 'pad-card-status', '');
  card.append(title, art, name, status);
  return { card, title, name, status, left, right };
}

function placeNub(nub, x, y) {
  /* A thousandth of the plate is well under a pixel on any plate this page
   * draws, and the compare stops a stick at rest writing anything at all. */
  const tx = Math.round(x * 50000) / 1000;
  const ty = Math.round(-y * 50000) / 1000;
  if (nub.__wfX === tx && nub.__wfY === ty) {
    return;
  }
  nub.__wfX = tx;
  nub.__wfY = ty;
  nub.style.transform = `translate(${tx}%, ${ty}%)`;
}

/*
 * Both gimbal plates from a channel set. The clamp, the throttle rescale
 * from 0..1 to -1..1 and the pitch negate were written out twice, in the
 * flight overlay and in the calibration screen, which is two places to get
 * the pitch sign wrong in.
 */
/*
 * The two sentences the touch page carried on FIXED THUMBS: the collective
 * stays where it is left, the springy one comes back. They follow the
 * throttle now rather than the side, because in Mode 1 the throttle is the
 * right thumb and the old text told that pilot the opposite.
 */
function thrNote(mode, side) {
  const map = stickChannels(mode)[side];
  return map.vert === 'throttle'
    ? ' Throttle STAYS where you leave it, like a real radio: trim a hover, lift the thumb, it holds.'
    : ' Forward is nose down, fly forward. Springs back to centre when you let go.';
}

/*
 * What each key pair does, named for the channel this mode put on it. The
 * four rows used to be constants, which is what a Mode 1 pilot on a keyboard
 * was reading when the arrows turned out to be throttle.
 *
 * The throttle row also follows what the keys do when let go, which is the
 * pilot's choice since bug-3a7be142. "Let go and it holds height" was the
 * promise that ticket caught the keys breaking, and it is true again now.
 */
function keyHowtoRows(mode, keyThrottle = 'hover') {
  const c = stickChannels(mode);
  const say = {
    throttle: normaliseKeyThrottle(keyThrottle) === 'hold'
      ? 'Throttle. It stays where you leave it, like a radio. A tap moves it about a percent, a longer hold moves it faster.'
      : 'Throttle. Tap for a nudge, hold to climb, long hold to punch. Let go and it holds height.',
    pitch: 'Pitch. Forward is stick forward, nose down, fly forward.',
    yaw: 'Yaw, left and right on the spot.',
    roll: 'Roll.',
  };
  return [
    ['W and S', say[c.left.vert]],
    ['A and D', say[c.left.horiz]],
    ['Up and down', say[c.right.vert]],
    ['Left and right', say[c.right.horiz]],
  ];
}

function placeSticks(left, right, ch, mode = DEFAULT_STICK_MODE) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const layout = stickChannels(mode);
  for (const side of ['left', 'right']) {
    const map = layout[side];
    const stick = side === 'left' ? left : right;
    const vert = map.vert === 'throttle' ? ch.throttle * 2 - 1 : -ch.pitch;
    placeNub(stick.nub, clamp(ch[map.horiz]), clamp(vert));
  }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

function btn(cls, text) {
  const n = el('button', cls, text);
  n.type = 'button';
  return n;
}

function wordmark() {
  const h = el('h1', 'wordmark');
  h.append(document.createTextNode('WEB'), el('span', 'fpv', 'FPV'));
  return h;
}

/*
 * THE HEADINGS ARE LETTERED (polish item 19). The wordmark and every room's
 * title are drawn in the lettering's own hand (src/ui/lettering.js
 * paintTitle): heavy slanted capitals, a thick ink line and a hard drop,
 * the hand the freestyle callouts and the results page already speak in,
 * so the menus are the game's own voice and not a developer UI with a
 * manga layer over it.
 *
 * THE TEXT STAYS. The heading keeps its words in the DOM, in its own place
 * and at its own size, for a screen reader, for find in page and for a
 * search engine; .is-lettered makes their fill transparent and the
 * lettering is an aria-hidden canvas laid over them. So the layout is the
 * text's, to the pixel, and lint:shell's measurements cannot move. With
 * forced colours on, the canvas goes and the text comes back (index.html).
 *
 * THE MENUS USE THE HAND WHATEVER CLEAN FPV SAYS. Clean FPV is about
 * flight: nothing drawn over the picture while flying. A menu is not
 * flying, and a title is looked at, not read at 100 km/h. Manga and scoring
 * off is the switch that takes the hand off the menus too: under the
 * root's .no-manga a heading is its own text, as it was before any of this
 * (unletterHeading).
 *
 * PAINTED ONCE. A heading is painted when its screen is shown and again
 * only if what it says, its colour, its size or its room has changed
 * (h.letterKey): show() and a settled resize ask, and a screen visited a
 * second time paints nothing. Never per frame.
 */
const LETTER_PROBE = 'lettered-probe';
const LETTER_ART = 'lettered-art';

/* A heading's words as runs in their own colours: the wordmark is WEB in
 * cream and FPV in sakura because its CSS says so, a record is mint for the
 * same reason. */
function headingRuns(h, cs) {
  const runs = [];
  for (const n of h.childNodes) {
    if (n.nodeType === 3) {
      runs.push({ text: n.textContent, fill: cs.color });
    } else if (n.nodeType === 1 && !n.classList.contains(LETTER_PROBE) && !n.classList.contains(LETTER_ART)) {
      runs.push({ text: n.textContent, fill: getComputedStyle(n).color });
    }
  }
  const out = [];
  for (const r of runs) {
    const text = r.text.replace(/\s+/g, ' ');
    if (text && (text.trim() || out.length)) {
      out.push({ text, fill: r.fill });
    }
  }
  if (out.length) {
    out[0].text = out[0].text.replace(/^ /, '');
    out[out.length - 1].text = out[out.length - 1].text.replace(/ $/, '');
  }
  return out.filter((r) => r.text);
}

/*
 * Letter one heading, if it is on screen and anything it depends on has
 * changed. The outline is a fifth of the size at callout sizes and thins
 * toward a tenth on the wordmark, where a fifth of 104 px is a 21 px line
 * and the letters close up into a blot.
 */
function letterHeading(h) {
  if (!h || typeof window === 'undefined' || !h.isConnected) {
    return;
  }
  if (h.closest('.no-manga')) {
    unletterHeading(h);
    return;
  }
  const cs = getComputedStyle(h);
  const px = parseFloat(cs.fontSize);
  const box = h.getBoundingClientRect();
  if (!(px > 0) || !box.width || cs.display === 'none') {
    return;
  }
  const runs = headingRuns(h, cs);
  if (!runs.length) {
    h.classList.remove('is-lettered');
    return;
  }
  const parent = h.parentElement;
  const pcs = getComputedStyle(parent);
  const pr = parent.getBoundingClientRect();
  const right = Math.min(pr.right - parseFloat(pcs.paddingRight || '0'), window.innerWidth - 4);
  const left = Math.max(pr.left + parseFloat(pcs.paddingLeft || '0'), 4);
  /* Centred when its text is, or when its box is a shrink wrapped one in
   * the middle of its column, which is how a flex column centres a title:
   * the lettering is wider than the text, and set from the text's left
   * edge it would sit right of the middle the text marked. */
  const mid = (box.left + box.right) / 2;
  const centred = cs.textAlign === 'center'
    || (box.width < (right - left) - 2 && Math.abs(mid - (left + right) / 2) < 2);
  const inkW = Math.min(0.2, Math.max(0.1, 7 / px));
  const pad = px * (inkW + 0.12);
  const maxW = Math.floor(centred ? right - left : right - box.left + pad);
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const key = `${runs.map((r) => `${r.text}\u0001${r.fill}`).join('\u0002')}|${px}|${maxW}|${centred}|${dpr}`;
  let art = h.querySelector(`:scope > .${LETTER_ART}`);
  let probe = h.querySelector(`:scope > .${LETTER_PROBE}`);
  if (h.letterKey === key && art && probe && h.classList.contains('is-lettered')) {
    return;
  }
  if (!probe) {
    probe = el('span', LETTER_PROBE);
    probe.setAttribute('aria-hidden', 'true');
    h.append(probe);
  }
  if (!art) {
    art = el('canvas', LETTER_ART);
    art.setAttribute('aria-hidden', 'true');
    h.append(art);
  }
  let m = null;
  try {
    m = paintTitle(art, runs, px, { maxW, inkW });
  } catch (e) {
    m = null;
  }
  if (!m) {
    /* No 2D context: the text is the heading, as it was. */
    h.classList.remove('is-lettered');
    art.remove();
    return;
  }
  h.classList.add('is-lettered');
  /* On the text's own baseline, or, if the text wrapped to a second line
   * on a narrow window, across the middle of its box. */
  const baseline = probe.offsetTop;
  const top = baseline > px * 1.5 ? h.clientHeight / 2 - (m.base - m.px * 0.36) : baseline - m.base;
  const x = centred ? (h.clientWidth - m.w) / 2 : -m.left;
  art.style.left = `${Math.round(x)}px`;
  art.style.top = `${Math.round(top)}px`;
  h.letterKey = key;
}

/* The lettering off a heading: its canvas and its probe out, and the class
 * that made its words transparent, so the heading's own rule draws it
 * again, text shadow and all. What a heading is with Manga and scoring
 * off, and what it was before it was lettered. Nothing to do on one that
 * never was. */
function unletterHeading(h) {
  for (const n of h.querySelectorAll(`:scope > .${LETTER_ART}, :scope > .${LETTER_PROBE}`)) {
    n.remove();
  }
  h.classList.remove('is-lettered');
  h.letterKey = '';
}

/* Set a lettered heading's words: textContent takes the lettering with it,
 * so it is put back at once rather than leaving transparent text behind. */
function setHeadingText(h, text) {
  h.textContent = text;
  h.classList.remove('is-lettered');
  h.letterKey = '';
  letterHeading(h);
}

/*
 * First-time thumbnail wait. Recording a clip takes several seconds
 * (the city, longer). A blank card looks like a stall. Same copy as the
 * boot screen: "loading" and a joke. Cached visits never see it.
 */

/* A menu plus a side column for its note, so the note cannot resize the rows. */

/*
 * THE LIST IS THE CATALOGUE'S, NOT A WRITTEN ONE.
 *
 * One row per PATTERN the recogniser matches, so nothing can be advertised
 * that the game will not score and nothing scoreable can be left out. The
 * building blocks (a bare quarter roll and its family) are deliberately
 * skipped: they are what a trick is MADE of and the workbook prices them as
 * consolation rather than as things to go and fly, and a list opening with
 * eleven fragments buries the tricks underneath them.
 */
const BLOCK_NAME = /^(1\/4|1\/2|3\/4|1) (Flip|Roll|Yaw)/;

function scoreableTricks() {
  const seen = new Set();
  const out = [];
  for (const pat of PATTERNS) {
    if (seen.has(pat.name) || BLOCK_NAME.test(pat.name)) {
      continue;
    }
    const t = trickByName(pat.name);
    if (!t || t.points == null) {
      continue;
    }
    /*
     * ONLY WHAT IS KNOWN TO SCORE.
     *
     * The list showed all sixty four patterns that carry a name and a price,
     * which promises a pilot sixty four tricks the town will pay for. It
     * will not. Some of them the recogniser has never once named, and a
     * trick you cannot land is worse than one that is missing: the pilot
     * flies it, gets nothing, and concludes the scoring is broken rather
     * than that the trick was never really there.
     *
     * So the gate is evidence. src/game/proven.js is written by the sweep,
     * which flies every pattern from its own steps and records what came
     * back, and a trick earns its place here by having been scored at least
     * once. That also means the list REPAIRS ITSELF: teach the rig to fly a
     * wall and the wall tricks reappear on the next generation, with no
     * hand maintained list to fall out of date.
     *
     * The cost is that a trick the rig cannot fly is hidden even though a
     * pilot may well be able to score it, which is the right way round. A
     * missing trick is a pleasant surprise when it scores. A listed one
     * that never pays is a broken promise.
     */
    const ev = PROVEN[pat.name];
    if (!ev || ev.landed <= 0) {
      continue;
    }
    seen.add(pat.name);
    out.push({
      name: pat.name,
      points: t.points,
      category: t.category || 'Other',
      difficulty: t.difficulty || '',
      steps: pat.steps,
      /* How reliably the sweep landed it. See trickStatus. */
      proven: ev,
    });
  }
  /* Grouped the way the workbook groups them, and cheapest first inside a
   * group, so the list reads as a ladder rather than as an index. */
  out.sort((a, b) => (a.category === b.category
    ? a.points - b.points
    : a.category.localeCompare(b.category)));
  return out;
}

/*
 * How reliably it scores, in a sentence, for a trick that is already known
 * to score at all: scoreableTricks does not list one that is not.
 *
 * The distinction still earns its place because "scores every time" and
 * "scores when it is flown cleanly" are different promises, and a pilot who
 * has just missed one twice deserves to know which they were sold.
 */
function trickStatus(t) {
  if (t.proven.landed >= t.proven.runs) {
    return {
      tag: 'Reliable',
      line: `Scored on all ${t.proven.runs} test flights, across three bank`
        + ' angles and three degrees of overshoot.',
    };
  }
  return {
    tag: 'Fussy',
    line: `Scored on ${t.proven.landed} of ${t.proven.runs} test flights, so`
      + ' it wants flying cleanly to register.',
  };
}

/* The number the Trick list rows carried as their value. Nothing calls it
 * while those rows are withdrawn; it is two lines and it comes back with
 * them, so it stays rather than being rewritten later from memory. */
function countScoreableTricks() {
  return scoreableTricks().length;
}

function wrapMenu() {
  const stage = el('div', 'menu-stage');
  const menu = el('div', 'menu');
  /* The rows inside are options, so the box around them has to be the
   * listbox or the role means nothing to a reader. See renderMenu. */
  menu.setAttribute('role', 'listbox');
  const help = el('div', 'menu-help');
  stage.append(menu, help);
  return { stage, menu, help };
}

/*
 * BEFORE YOU FLY, ONCE PER TRACK PER VISIT (MENUS-PLAN.md 2.7).
 *
 * The launch card carries the fairness contract, what a run on this track
 * counts as, and it stood between the title's Fly and every single run. It
 * is read once. So the title's Fly shows it the first time a track is flown
 * in this tab, and after that goes to the grid with the run set up as it
 * was. A press that names a track (its card's Fly it, a double click, the
 * builder's Fly this track, Standings) has always gone to the grid; the
 * seated track's sheet in the Tracks room has a Before you fly row, which
 * is the way back to the card whenever it is wanted.
 *
 * The tab's own storage, so a new visit starts over and two tabs do not
 * answer for each other. The key is the track, not the run settings: the
 * card is a statement about the track, and changing laps is a reason to
 * open it, which the Before you fly row does.
 */
const LAUNCH_SEEN_KEY = 'webfpv.launchSeen.v1';

function launchCardKey(s) {
  if (s.map !== 'custom') {
    return s.map || null;
  }
  const seat = activeCourseSummary();
  const id = seat && (seat.shareId || (seat.doc && seat.doc.id) || seat.name);
  return id ? `custom:${id}` : null;
}

function readLaunchSeen() {
  try {
    const list = JSON.parse(sessionStorage.getItem(LAUNCH_SEEN_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function launchCardSeen(s) {
  const key = launchCardKey(s);
  return Boolean(key) && readLaunchSeen().includes(key);
}

function markLaunchCardSeen(s) {
  const key = launchCardKey(s);
  if (!key) {
    return;
  }
  const list = readLaunchSeen();
  if (!list.includes(key)) {
    list.push(key);
    try {
      sessionStorage.setItem(LAUNCH_SEEN_KEY, JSON.stringify(list.slice(-50)));
    } catch (e) {
      /* No storage, so the card shows on every Fly, as it always did. */
    }
  }
}

/*
 * IS THE THING IN THE SEAT A RACE?
 *
 * The launch card is for a measured run: it exists to say what a lap time
 * counts as. Freestyle has no clock, no lap, no ghost and no board, so a
 * card in front of it would be ceremony, and the Freestyle room was built
 * without one for exactly that reason.
 *
 * The predicate is GATE COUNT, which is the same signal the Race and
 * Freestyle rooms split on and the same one the renderer uses: a designed
 * course with no stations is a freestyle flight, no lap and no gate HUD.
 * Not MAPS[].mode, which nothing but a debug hook reads and which would
 * file a gateless published track under Race and then promise it a clock it
 * cannot deliver.
 */
function seatIsRace(s) {
  const m = MAPS.find((x) => x.id === s.map) ?? MAPS[0];
  if (m.mode === 'freestyle') {
    return false;
  }
  if (m.id !== 'custom') {
    return true;
  }
  const seat = activeCourseSummary();
  return Boolean(seat && seat.gates > 0);
}

/*
 * THE RECORD KEY, IN ENGLISH.
 *
 * main.js builds a personal-best key by hashing the config text with the
 * pack voltage and the flight style, and latches the lap count at run start.
 * So a best time is not filed under a track: it is filed under a track AND a
 * tune AND a pack AND a physics model AND a lap count, and change any one of
 * them and you are on a different board. Nothing ever said that out loud, so
 * a pilot who nudged pack charge lost their record without being told why.
 *
 * This is that key, written as the sentence a pilot would say. It goes in the
 * help column under the Fly button, which is the last thing read before a
 * run and the only place it can still change anything.
 */
function recordSentence(s, trackName) {
  const style = s.flightStyle === 'arcade' ? 'Arcade' : 'Expert';
  const link = s.link === 'perfect' ? 'a perfect link' : LINK_PRESETS[s.link].label;
  /* Practice is not in the list, because it is not a different best: a
   * practice lap is held against the same record a counted lap is. What it
   * changes is the board, and the last sentence says so. */
  const bits = [
    `${style} physics`,
    `${s.packVoltage.toFixed(2)} V per cell`,
    ...(s.laps === PRACTICE_LAPS ? [] : [`${s.laps} lap${s.laps === 1 ? '' : 's'}`]),
    `the ${tuneById(s.tune).name} tune`,
  ];
  /* clampWeight rather than s.weight raw, the same guard bugSnapshot uses:
   * every settings object that reaches here has been through loadSettings,
   * and a sentence that can print "weight at undefined percent" if one ever
   * does not is a sentence waiting to embarrass itself in front of a pilot. */
  const weight = clampWeight(s.weight, s.airframe);
  if (weight !== WEIGHT_STOCK) {
    /* Second in the list, right behind the physics model, because it IS the
     * physics model: the slider on the flight screen scales the weight the
     * craft carries. A pilot who nudged it mid flight and forgot has exactly
     * the problem this sentence exists to prevent. */
    bits.splice(1, 0, `weight at ${weight} percent`);
  }
  return `Your best on ${trackName} is filed under exactly this: ${bits.join(', ')}.`
    + ' Change any part of it and you are on a different board.'
    + (s.laps === PRACTICE_LAPS
      ? ' Practice laps stay off the public board, so this run will not count there.'
      : s.flightStyle === 'arcade'
        ? ' Arcade times stay off the public board, so this run will not count there.'
        : weight !== WEIGHT_STOCK
          /* It used to say a time off 100 stays off the public board. The
           * board takes it now and prints the weight beside the name, the
           * owner's ask of 2026-09-27, so the sentence says that instead. */
          ? ` This run is on ${link}, and a time from it goes on the public board marked Weight ${weight}%.`
          : ` This run is on ${link}.`);
}

/*
 * THE RADIO DEAD END, SAID OUT LOUD AND MADE FIXABLE.
 *
 * Two states leave a pilot with a radio they cannot use, and neither of them
 * says anything today: the cursor moves and nothing else happens, which
 * reads as a broken product rather than as a radio that needs a minute.
 *
 * NO BUTTONS. Every switch on this radio arrives as an axis, so
 * padMenuButtons has nothing to read and select is permanently false. It is
 * the harder of the two, because the fix, calibration, is itself a menu row
 * that has to be selected. input.js answers that with a hold, and this row
 * is where a pilot finds out that is the gesture.
 *
 * NOT CALIBRATED. navRaw deliberately gives up and down only, because it
 * cannot tell pitch from roll without a map. So the cursor moves and no
 * value row can be adjusted: half a menu. Calibrating is the whole fix.
 *
 * It is a ROW, not a floating panel, and it is row zero. That gets it first
 * in the focus order for free, gives it the help column, the cursor, the
 * click target and the row grammar without any of them being special cased,
 * and makes Enter on it go to the one screen that fixes the thing it is
 * complaining about. A banner nobody can focus is a banner a radio pilot
 * cannot act on, which would be the same joke twice.
 */
function padTroubleItem(info, platform = 'other') {
  if (!info || !info.count || info.using === 'Keyboard') {
    return null;
  }
  if (!info.buttons && !info.hasSelect) {
    return {
      label: 'Your radio has no buttons this browser can see',
      action: 'calibrate',
      rowClass: 'row-warn',
      note: 'Every switch on it is arriving as an axis, so nothing on it can press Enter yet.'
        + ' Hold any stick away from centre for about a second and that counts as one press,'
        + ' which is enough to get in here and fix it properly. Calibrating ends by asking you'
        + ' to throw the switch you want as Enter, and after that it works like a button.',
    };
  }
  /*
   * A SAVED MAP THAT READS AN AXIS THIS PAD DOES NOT HAVE, which reads as a
   * stick that does nothing and says nothing: see missingChannels in
   * src/input/input.js. A fact about the map rather than an inference, so
   * it goes first of the stick rows. It opens Stick help rather than the
   * wizard, because on a phone passing four axes the wizard cannot finish
   * either, and Stick help is the screen that says so.
   */
  const missing = info.missingChannels || [];
  if (missing.length) {
    return {
      label: `Your calibration reads ${channelList(missing)} from an axis this radio does not have`,
      action: 'stickhelp',
      rowClass: 'row-warn',
      note: `It was saved from a radio or a browser that sent more axes than the ${info.axisCount || 'few'}`
        + ` arriving now, so ${channelList(missing)} reads nothing. Stick help shows what this radio`
        + ' sends and whether calibrating again will find it.',
    };
  }
  /*
   * A GUESS THAT IS WORKING IS NOT A PROBLEM, AND THIS USED TO SAY IT WAS.
   *
   * The test was `map.stored`, which records whether somebody has been
   * through the wizard. It is not a fact about the mapping. A pilot with a
   * transmitter in AETR joystick mode, which is what this page's own advice
   * tells them to set, plugs it in, flies the quad correctly with the built
   * in guess, and never opens the wizard because nothing is wrong. They got
   * a red row at the top of the front page, on every visit, telling them
   * their radio was not calibrated. Reported as a bug, and it was one: the
   * row was reporting on a flag rather than on the radio.
   *
   * info.mapUsable is the observation instead, and it is about the machine:
   * a real throttle is parked off centre because it has no centring spring.
   * See noteThrottleParked in src/input/input.js. When it is true the guess
   * has been seen behaving like a radio, the menus let the sticks move left
   * and right, and there is nothing left to warn about.
   *
   * When it is false the warning is EARNED and says what was observed, not
   * what a flag holds: a spring centred axis where the throttle should be is
   * a gamepad or a radio in some other order, and that pilot is about to
   * take off at half power on a stick that springs back.
   */
  /*
   * ON A PHONE THAT HANDS OVER FOUR AXES, the throttle sitting at the middle
   * has a third explanation the two above do not: Chrome dropped the real
   * throttle and axis 2 is the yaw stick. The wizard cannot finish with a
   * stick missing, so there the row opens Stick help, which shows whether
   * all four arrive and carries the wizard for when they do. See fourAxisPad
   * in src/input/input.js.
   */
  if (!info.calibrated && !info.mapUsable) {
    const phone = platform === 'android' && info.fourAxes;
    return {
      label: 'This browser is guessing your stick order',
      action: phone ? 'stickhelp' : 'calibrate',
      rowClass: 'row-warn',
      note: 'The axis it thinks is your throttle is sitting at the middle, and a real'
        + ' throttle rests at one end because it has no centring spring. So the guess is'
        + ' probably wrong, and a wrong guess means taking off at half power on a stick'
        + (phone
          ? ' that springs back. On a phone, first check that all four sticks arrive at all:'
            + ' Chrome on Android passes on only four of a radio\'s axes. Stick help shows which.'
          : ' that springs back. Calibrating takes about a minute and fixes it for good.'),
    };
  }
  /*
   * THE GUESS CAN PASS THE THROTTLE QUESTION AND STILL HAVE NO YAW.
   *
   * The row above is the only thing that was ever asked about the guess,
   * and it asks about one axis. A radio whose throttle is where AETR says
   * and whose yaw is not gets a silent shell and a quad that will not spin,
   * which is three tickets on the board and none of them knew what to call
   * it. input.js watches for it directly: see noteGuessOrder.
   *
   * It comes after the throttle row rather than before it because a quad
   * taking off at half power on its own is the worse surprise of the two,
   * and in practice only one of them can be true at a time anyway.
   */
  if (!info.calibrated && info.guessNoYaw) {
    return {
      label: 'This browser cannot see your yaw stick',
      action: 'calibrate',
      rowClass: 'row-warn',
      note: 'The axis it guessed was yaw has not moved once, while a stick it does not'
        + ' know about has been swept end to end. That is a radio reporting its channels'
        + ' in some order other than the one being guessed, and the part of it you have'
        + ' lost is yaw. Calibrating takes about a minute and tells this page which axis'
        + ' is which.',
    };
  }
  /*
   * AND THE GUESS CAN HAVE THE THROTTLE WHERE IT EXPECTS YAW.
   *
   * bug-c9423f3e, a Radiomaster Pocket in Firefox: "the throttle is mapped
   * on the yaw axes and the throttle movement is not detected". Both rows
   * above stayed quiet for it: the guessed throttle axis had been off
   * centre once, and the guessed yaw moves plenty, because it IS the
   * throttle. How it rests is what gives it away: off centre and still for
   * seconds, which a throttle does and a sprung yaw stick never does. See
   * noteYawParked in src/input/input.js.
   */
  if (!info.calibrated && info.guessYawParked) {
    return {
      label: 'This browser has your throttle as yaw',
      action: 'calibrate',
      rowClass: 'row-warn',
      note: 'The axis it guessed was yaw sits off centre and stays there, which a yaw stick'
        + ' on its spring never does and a throttle always does. So this radio reports its'
        + ' channels in another order, and your throttle is probably turning the quad'
        + ' instead of lifting it. Calibrating takes about a minute and tells this page'
        + ' which axis is which.',
    };
  }
  /*
   * A RADIO THE BROWSER HAS DRESSED AS A GAMEPAD. The standard layout reads
   * its sticks as a gamepad's, which puts them on the wrong channels, and
   * none of the three rows above is asked on the standard layout, because
   * for a real gamepad there is no order to guess. See noteStandardParked
   * in src/input/input.js.
   */
  if (!info.calibrated && info.radioAsGamepad) {
    return {
      label: 'This browser calls your radio a gamepad',
      action: 'calibrate',
      rowClass: 'row-warn',
      note: 'One of its stick axes rests off centre and stays there, which a gamepad stick never'
        + ' does and a radio\'s throttle always does. Read as a gamepad, its sticks land on the'
        + ' wrong channels. Calibrating takes about a minute and tells this page which axis is'
        + ' which.',
    };
  }
  /*
   * A STICK THE PILOT FLEW WITHOUT, on any map, calibrated or not: the
   * owner's ask of 28 September, a stick not being moved for long enough
   * brings up help. It is decided in flight (noteDeadChannels) and seen
   * here on the pause menu and the title, and in flight as a banner. It
   * opens Stick help, not the wizard, because the wizard only helps when
   * the stick reaches the browser, and whether it does is exactly what the
   * pilot does not know yet.
   */
  const dead = info.deadChannels || [];
  if (dead.length) {
    const phone = platform === 'android' && info.fourAxes
      ? ' On a phone the likeliest cause is Chrome passing on only four of the radio\'s axes.'
      : '';
    return {
      label: `${capital(channelList(dead))} ${dead.length > 1 ? 'are' : 'is'} not reaching the sim`,
      action: 'stickhelp',
      rowClass: 'row-warn',
      note: `${capital(channelList(dead))} did not move once in flight while your other sticks did.`
        + ' If you were moving it, the sim was not getting it. Stick help finds out whether that'
        + ` is the sim, the browser or the radio, and says what fixes it.${phone}`,
    };
  }
  return null;
}

/*
 * HOW MANY CHOICES FIT ON THE ROW ITSELF.
 *
 * Up to four, the whole set is drawn inline as segments and the pilot can
 * see every option and which one is live without pressing anything. Above
 * four there is no width for it, so the row keeps its button and Enter
 * opens the list.
 *
 * The count is not enough on its own, and the shell check said so: the Tune
 * row carried three presets then, so it drew as a strip, and its labels were
 * things like "Betaflight default" and "Karate race 6S", which wrapped to two
 * lines and took the title screen 18 px further past the fold. So the rule is
 * count AND fit, and both are measured rather than guessed. Twenty four
 * characters of labels all told is what a row's control holds at 1280 px
 * beside a label of its own: Off/On is five, Acro/Angle is nine,
 * Low/High/Ultra is twelve, Arcade/Expert is twelve, and those three tunes
 * were forty.
 *
 * The Tune row ships one preset now and no longer needs the fit rule to
 * behave, which is exactly why it stopped relying on it: it carries
 * `pickOnly` instead. The budget is unchanged and stays measured, because it
 * was never about that one row.
 *
 * The line also decides what Enter does, and that is the more important
 * half. See select().
 */
const SEGMENT_MAX = 4;

/* The pad gestures that act on a menu, for padLogReport. The cursor moving is
 * not one: it changes nothing. */
const PAD_ACTS = ['right', 'left', 'select', 'back'];

/* Long enough that a fast typist does not trigger a rebuild per letter,
 * short enough that the list feels live. A bench rebuild is about 57 ms
 * measured on this container, so anything under about 100 would still be
 * one render per keystroke. */
const SEARCH_DEBOUNCE_MS = 120;
const SEGMENT_CHARS = 24;

/* Whether a choice row draws its whole set on the row, or keeps a button
 * and opens a list. One predicate, so the renderer and select() cannot
 * disagree about which kind of row this is. */
function fitsAsSegments(it) {
  if (!it || !it.options || !it.options.length || it.options.length > SEGMENT_MAX) {
    return false;
  }
  const chars = it.options.reduce((n, o) => n + String(o.label || '').length, 0);
  return chars <= SEGMENT_CHARS;
}

/*
 * Slug a label down to something that survives being written into a DOM id
 * and read back. Anything that is not a letter or a digit becomes a hyphen,
 * because a label is prose: it has apostrophes, degrees signs and commas.
 */
function slugify(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'row';
}

/*
 * Stamp a stable id onto every row of a freshly built list. See items().
 *
 * The list is mutated in place rather than copied: these objects are made
 * fresh on every render and thrown away on the next one, and the callers
 * that hold on to one, the drop-down and the typed field, are holding the
 * same object this is stamping.
 */
function stampIds(items, screen) {
  const seen = new Map();
  const prefix = screen ? `${screen}:` : '';
  for (const it of items) {
    if (!it || typeof it !== 'object') {
      continue;
    }
    if (it.id) {
      continue;
    }
    let base;
    if (it.action) {
      base = `a-${it.action}`;
    } else if (it.key) {
      base = `k-${it.key}`;
    } else if (it.section) {
      base = `s-${slugify(it.label)}`;
    } else {
      base = slugify(it.label);
    }
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    it.id = n === 1 ? `${prefix}${base}` : `${prefix}${base}~${n}`;
  }
  return items;
}

/* Step a value through a list, wrapping. */
function choice(label, note, choices, current, format, set) {
  const fmt = format || ((v) => String(v));
  return {
    label,
    note,
    value: fmt(current),
    current,
    options: choices.map((c) => ({ value: c, label: fmt(c) })),
    pick: (v) => {
      const hit = choices.find((c) => String(c) === String(v));
      if (hit !== undefined) {
        set(hit);
      }
    },
    adjust: (d) => set(cycle(choices, current, d)),
  };
}

/*
 * A BOOLEAN IS A SWITCH, not a list of two things.
 *
 * This used to be choice() over [true, false], which meant a two item popup
 * opened for every on and off in the product: Sound, Launch control, Flight
 * log, Binaural tone, and every feature row on the bench. Twelve of them. A popup is the control for "which of these many",
 * and a popup listing On and Off asks a pilot to travel to a menu to answer
 * a question the row itself could have answered in place.
 *
 * `sw` is the flag, and there are no `options`, which is what keeps the
 * dropdown from ever opening on one of these. Left, Right and Enter all
 * flip it: a switch is one bit, the same key puts it back, and it is the
 * one value row where Enter changing something is the idiom rather than
 * the accident. See select().
 */
/*
 * The Frame pacing row's note: what is pacing the frames right now and what
 * that trades. The timer redraws without waiting for the display's beat, so
 * every refresh picks up a picture milliseconds old instead of up to a
 * whole refresh old; the price is more GPU work a second, which is heat and
 * battery, and Auto graphics holding still while it runs. Worded per state
 * so the row always says what THIS machine is doing.
 */
function pacingNote(s) {
  const on = pacingTimerOn(s);
  if (s.pacing === 'timer') {
    return 'The timer draws the frames on every preset while you fly: the picture answers the sticks sooner, for more GPU work, heat and battery, and Auto graphics holds still while it runs. Replays and films keep the display\'s beat.';
  }
  if (s.pacing === 'display') {
    return 'The display paces the frames on every preset, the browser\'s ordinary beat: easiest on the battery, and the picture waits for the next refresh.';
  }
  return on
    ? 'On Low the timer draws the frames while you fly, so the picture answers the sticks sooner, for more GPU work, heat and battery; Auto graphics holds still while it runs, and replays and films keep the display\'s beat. On Medium and High the display paces everything.'
    : 'The display paces the frames on this preset. On Low the timer would draw while you fly instead, so the picture answers the sticks sooner, for more GPU work, heat and battery.';
}

function toggle(label, note, on, set) {
  const current = Boolean(on);
  return {
    label,
    note,
    sw: true,
    on: current,
    value: current ? 'On' : 'Off',
    current,
    /* Left and Right SET a switch rather than cycling it: Right is On,
     * Left is Off. Cycling means a held Right on a radio makes the row
     * blink, and it means the two keys are the same key, which is a waste
     * of the only spatial handle a two state control has. */
    adjust: (d) => set(d > 0),
    /* Enter flips. See select(). */
    flip: () => set(!current),
  };
}

/*
 * A TYPED number, in whatever units the row's field is displayed in.
 *
 * The one row type on these menus that is not a list, and the reason it
 * exists is the rates bug: a value a pilot has in their head, 1500 deg/s or
 * 0.42 of super rate, has to be enterable, and no list of a dozen steps is
 * ever going to carry it. spec comes from configs/rates.js and knows the
 * firmware bounds, the display scale and how the number is written.
 *
 * The arrows still work, and one press is one firmware unit, so the row is
 * still drivable from a radio or the keyboard alone. `typed` is what the
 * text field commits: it clamps rather than refuses, because a pilot who
 * asks for 5000 deg/s means "as much as it will give me".
 */
function number(label, note, spec, cli, set) {
  const clamp = (v) => Math.max(spec.cliMin, Math.min(spec.cliMax, v));
  const text = formatRate(spec, cli);
  return {
    label,
    note,
    /* No `value`: the field IS the value on this row, and renderMenu reads
     * num before it looks for one. */
    num: {
      spec, cli, text, unit: spec.unit,
    },
    adjust: (d) => set(clamp(cli + d)),
    typed: (raw) => {
      const t = String(raw).trim();
      if (t === '') {
        return null;
      }
      return cliOf(spec, Number(t));
    },
    set,
  };
}

function stepper(label, note, value, adjust) {
  return { label, note, value, adjust, step: true };
}

function hasLoadedTrack() {
  return hasFlyableTrack();
}

/* Screens whose choices are drawn as cards above the row list. The rows
 * that remain are whatever is not a card.
 *
 * The title is not in here because it is a card screen only SOMETIMES: the
 * gate draws two, the menu behind it draws none and carries a Ghost row
 * whose left and right arrows have to keep adjusting rather than moving.
 * Ui.cardScreen() is the predicate that knows both. */
function isCardScreen(screen) {
  /* Both pickers lay their choices out in a row. */
  return screen === 'courses' || screen === 'freestyle';
}

/* The plan of whatever is on the working canvas, or null. Derived rather
 * than stored: the canvas changes in the builder, on another page. */
function currentPlan() {
  const seat = activeCourseSummary();
  if (!seat || !seat.doc || isEmptyCanvas(seat.doc)) {
    return null;
  }
  try {
    return planFromDocument(seat.doc);
  } catch (e) {
    return null;
  }
}

function liveListing(mapId) {
  if (mapId && mapId !== 'custom') {
    return null;
  }
  try {
    const course = inspectCourse();
    return course && course.kind !== 'none' ? course : null;
  } catch (e) {
    return null;
  }
}

/*
 * BACK TO THE TRACK BUILDER, on the pause menu, or null.
 *
 * The owner's ask on 2026-09-26: flying a track they built, Escape should
 * offer the builder, so the loop is fly, edit, fly. The builder's Fly this
 * track and Fly this map already come straight back to the starting blocks
 * (linkedFly), so this is the other half of that loop and nothing more.
 *
 * ONLY FOR WHAT THE PILOT BUILT, and absent rather than greyed otherwise.
 * The rule that every course action always returns a row is about the
 * course rooms, whose rows are a fixed set of things to do to the seat. A
 * greyed "Back to the track builder" in the town, or on somebody else's
 * track, would say "back" to a page the pilot never came from.
 *
 * Which door is the one the Track room already uses for the same track. The
 * race canvas (local, or a copy of somebody else's) opens as it is, with
 * ?mode=race. A published track of the pilot's own goes through Edit this
 * track, because it can be seated from the board while the canvas holds
 * something else, and the builder's edit intent is what brings the seated
 * one onto the canvas (and keeps local changes, see adoptIncomingShare in
 * src/trackbuilder/app.js). Your map opens the freestyle canvas, which is
 * the seat it was flown from, and only when that seat holds a map: the
 * starter yard and a map from the board are not on it.
 */
function builderReturnItem(s, sharedMap) {
  if (s.map === 'custom') {
    const listing = liveListing('custom');
    const kind = listing ? listing.kind : 'none';
    if (kind !== 'local' && kind !== 'remix' && kind !== 'owned') {
      return null;
    }
    return {
      label: 'Back to the builder',
      action: kind === 'owned' ? 'editown' : 'trackbuilder',
      note: `Opens ${listing.name || 'this track'} in the builder. Fly this track in there brings you straight back to the starting blocks.`,
    };
  }
  if (s.map === 'built' && !sharedMap && ownMapId()) {
    return {
      label: 'Back to the builder',
      action: 'mapbuilder',
      note: 'Opens your map in the builder. Fly this map in there brings you straight back to it.',
    };
  }
  return null;
}

/*
 * The four things a player can do to the course they are holding.
 *
 * EVERY ONE OF THESE ALWAYS RETURNS A ROW. They used to return null when
 * they did not apply, and the caller pushed only the survivors, so the
 * title menu swung between nine and thirteen rows: the row under the
 * cursor moved depending on what the player had done last, and an action
 * that was simply unavailable was indistinguishable from one that does not
 * exist. A greyed row with a reason teaches; a missing row cannot.
 *
 * `disabled` is honoured by select(), and renderMenu paints it as row-grey.
 */
function uploadAction(listing, {
  row = null, timePosted, practice = false, tuned = false,
}) {
  const pending = readPendingTime();
  const shareId = listing && listing.shareId;
  /* The lap this row would send, the run's own or the one kept from an
   * earlier visit, and the weight it was flown at, which goes with it. */
  const held = row && Number.isFinite(row.lapMs)
    ? row
    : (shareId && pending && pending.trackId === shareId ? pending : null);
  const ms = held ? held.lapMs : null;
  const weight = held && held.weight != null ? clampWeight(held.weight, null) : WEIGHT_STOCK;
  if (timePosted && shareId) {
    const rank = timePosted.rank != null ? ` Rank ${timePosted.rank}.` : '';
    return {
      label: 'Time posted',
      action: 'posttime',
      disabled: true,
      note: `That lap is on the public board.${rank}`,
    };
  }
  if (!listing || !shareId) {
    return {
      label: 'Post a time',
      action: 'posttime',
      disabled: true,
      note: 'Only a track on the board can hold a time. Publish this one first.',
    };
  }
  if (!listing.canPostTime) {
    return {
      label: 'Post a time',
      action: 'posttime',
      disabled: true,
      note: 'The layout has changed since it was published. Update the track on the board first.',
    };
  }
  if (ms == null) {
    return {
      label: 'Post a time',
      action: 'posttime',
      disabled: true,
      /* A pilot who has just flown twenty clean laps in practice and comes
       * here to post one is owed the real reason, not an invitation to fly
       * the lap they already flew. The same for laps flown on the tuned air
       * or motors: they are on the results screen, and the board will not
       * take them. */
      note: practice
        ? 'Practice laps stay off the public board. A run of 1, 3 or 5 laps puts its best lap here when it finishes.'
        : (tuned
          ? 'Tuned flight, not posted to the board. Laps flown on Air grip or Motor power off 100 are a different quad from the one everybody else flew. Set both back to 100 and fly it again.'
          : 'Fly a clean lap on this track and the lap appears here.'),
    };
  }
  const best = readPostedBest(shareId);
  const isNew = best != null && ms < best;
  /* A lap off 100 goes up like any other, and the board prints its weight
   * beside the name, so the row says so before it is pressed. */
  const marked = weight !== WEIGHT_STOCK
    ? ` It goes up marked Weight ${weight}%, the weight it was flown at.`
    : '';
  return {
    label: isNew ? `Post new best, ${formatTime(ms)}` : `Post ${formatTime(ms)}`,
    action: 'posttime',
    note: (isNew
      ? 'Faster than the last time you posted from this browser. Sends this lap to the public board.'
      : 'Send this lap to the public board under your name.') + marked,
  };
}

function publishAction(listing, published) {
  if (published) {
    return {
      label: 'Published',
      action: 'seat-board',
      note: 'This track is on the public board. Opens its page.',
    };
  }
  if (listing && listing.canPublishNew) {
    const of = listing.sourceName ? ` of ${listing.sourceName}` : '';
    const by = listing.sourceAuthor ? ` by ${listing.sourceAuthor}` : '';
    return {
      label: 'Publish this track',
      action: 'publishcourse',
      note: listing.remix
        ? `Your copy${of}${by}. Goes on the board under a new name. Then you can post a time.`
        : 'Put this track on the public board. Then you can post a time.',
    };
  }
  if (listing && listing.canUpdateListing && listing.layoutDrift) {
    return {
      label: 'Update this track',
      action: 'publishcourse',
      note: 'The layout changed. Updating the board will clear posted times, then you can post a time.',
    };
  }
  if (listing && listing.kind === 'owned') {
    return {
      label: 'Publish this track',
      action: 'publishcourse',
      disabled: true,
      note: 'Already on the board, and nothing has changed since.',
    };
  }
  if (listing && listing.kind === 'community') {
    return {
      label: 'Publish this track',
      action: 'publishcourse',
      disabled: true,
      note: 'Somebody else published this one. Edit a copy to put your own version on the board.',
    };
  }
  return {
    label: 'Publish this track',
    action: 'publishcourse',
    disabled: true,
    note: listing && listing.kind === 'local'
      ? 'A track needs a flying order before it can be published. Set one in the builder.'
      : 'Nothing to publish. Build a track, or pick one from the board.',
  };
}

function remixAction(listing) {
  if (listing && listing.canRemix) {
    const by = byLine(listing) ? ` ${byLine(listing)}` : '';
    return {
      label: 'Edit a copy',
      action: 'remix',
      note: `Open ${listing.name}${by} in the builder as your own track, under a new name.`,
    };
  }
  return {
    label: 'Edit a copy',
    action: 'remix',
    disabled: true,
    note: listing && listing.kind === 'owned'
      ? 'This one is already yours. Edit this track instead.'
      : 'Only a published track by somebody else can be copied.',
  };
}

function editOwnAction(listing) {
  if (listing && listing.kind === 'owned') {
    return {
      label: 'Edit this track',
      action: 'editown',
      note: 'Open this track in the builder. A rename updates the name on the board. A layout change asks before clearing times.',
    };
  }
  return {
    label: 'Edit this track',
    action: 'editown',
    disabled: true,
    note: listing && listing.kind === 'community'
      ? 'Somebody else published this one. Edit a copy to make it yours.'
      : 'Nothing of yours on the board to edit.',
  };
}

/*
 * The still a world card wears until its clip exists.
 *
 * A COLD BROWSER MAKES EVERY CLIP FROM SCRATCH, one world at a time and only
 * while nobody is using the room, so a first visit to Freestyle can spend the
 * better part of a minute with nothing to look at. It spent it as four dark
 * rectangles with the word "loading" on them, which is the worst possible
 * moment to say nothing at all about the places somebody is choosing between.
 * The poster is a rendered frame of the world itself: scripts/posters.js
 * makes it, src/maps/registry.js names it.
 *
 * A CUSTOM PROPERTY AND NOT AN <img>, for three reasons that all came out of
 * trying the element first. A background is decorative by construction, so
 * there is no alt text to invent for a picture the card already names in
 * type underneath it. A background survives `replaceChildren`, which the
 * recorder calls on this box in three places and which would otherwise throw
 * the picture away every time a capture started. And a background that fails
 * to load simply does not paint, so a missing file degrades to the dark
 * rectangle the card always was rather than to a broken image icon: a poster
 * is a nicety and must not be able to break the picker.
 *
 * The property is set on the CARD rather than the reel because two rules
 * read it: the reel paints it, and so does the wait panel, which sits over an
 * opaque recorder iframe and would otherwise be a scrim over nothing.
 */
function markPoster(card, map) {
  if (!card || !map || !map.poster) {
    return;
  }
  const href = new URL(`../../${map.poster}`, import.meta.url).href;
  card.style.setProperty('--poster', `url("${href}")`);
  card.classList.add('has-poster');
}

/*
 * The STF lettering as type: the S and the F in the element's own colour
 * and the T in the logo's green, the way src/art/stf.js paints the mark,
 * for the found callout and for the stamp on a found map's card. Type and
 * not the painted mark, because a menu should not pay to paint a canvas
 * for a badge the size of a thumbnail.
 */
function stfLettering(cls) {
  const word = el('span', cls);
  word.append(el('span', null, 'S'), el('span', 'stf-t', 'T'), el('span', null, 'F'));
  return word;
}

/* How long the found moment is up, callout and panel together, in ms. The
 * stf- keyframes in index.html run this long: change both. */
const STF_FOUND_MS = 3000;

/*
 * A course card's identity, stable across the rebuilds items() does on every
 * render. The card objects themselves are made fresh each time, so the chosen
 * card is remembered by this key rather than by reference.
 */
function courseCardKey(card) {
  if (!card || !card.course) {
    return null;
  }
  if (card.course.kind === 'board' || card.course.kind === 'local') {
    return `${card.course.kind}:${card.course.track.id}`;
  }
  if (card.course.kind === 'new') {
    return 'new';
  }
  return 'current';
}

/*
 * WHAT ONE COURSE CARD CAN DO, once the player has chosen it.
 *
 * The screen used to be a strip of cards over a list of actions, and it read
 * as though the list acted on the card the cursor was on. It did not. The
 * list has always acted on the course in the SEAT, the one loaded and flown,
 * and the only thing choosing a card did was load it and fly it. So the one
 * question a player actually has about a course on the board, "let me look at
 * this one in the builder", had no answer that did not involve flying it
 * first, crashing out, and coming back. Reported exactly that way: I select
 * it and it opens, I cannot select it then edit it from this menu.
 *
 * Choosing a card now names it and lists what can be done with it. Fly it is
 * first, so the common path is Enter Enter and still one keystroke longer
 * than it was, which is the price of the card meaning something. The rows
 * underneath the strip are untouched and still belong to the seat, because
 * publishing and uploading a time are things you do to the course you are
 * flying, not to a card you are pointing at.
 *
 * FLY IT IS THE SCREEN'S PRIMARY, and that is what puts it within reach of
 * a mouse. This list is under every card on the board, thirty of them on a
 * five inch, so from a card near the top it was a scroll away, and the
 * scroll the choose used to make stopped with Fly it under the command bar.
 * The owner, 2026-09-27: "at the moment i click on it, then the page
 * scrolls a bit then i have to scroll down to fly the track". A primary row
 * is also the filled button on the command bar (see primaryItem), which
 * sits in the same pixels however far the page is scrolled, so choosing a
 * card puts Fly it on screen without moving anything. A double click on the
 * card is the same press: see flyCard.
 */
function courseCardRows(subject, seatRows = []) {
  const board = subject.course.kind === 'board';
  const name = subject.label;
  const rows = [
    /* The list says whose it is. The chosen card is marked as well, but a
     * colour is not a label, and this list sits far enough below the strip
     * that the two want joining in words. Not a cursor stop. */
    { label: name, section: true },
    {
      label: 'Fly it',
      action: 'card-fly',
      primary: true,
      note: board
        ? `Load ${name} from the board and go straight to the starting blocks. A double click on its card does the same.`
        : `Fly ${name}, straight from the starting blocks. A double click on its card does the same.`,
    },
  ];
  /* The seated track's own rows, when the card is the seat: Before you fly,
   * Post a time, Publish, the right Edit, Standings and its page. */
  if (seatRows.length) {
    rows.push(...seatRows);
    rows.push({ label: 'Back to the list', action: 'card-back' });
    return rows;
  }
  rows.push({
    label: 'Open in the builder',
    action: 'card-builder',
    note: board
      ? `Open ${name} in the builder without flying it. Somebody else's track opens as a copy under your own name.`
      : `Open ${name} in the builder. Nothing is flown.`,
  });
  if (board) {
    rows.push({
      label: 'Standings',
      action: 'card-standings',
      note: `Every time posted on ${name}, fastest first, and who flew them. Opens here, not on another site.`,
    });
    rows.push({
      label: 'This track on Tracks and times',
      action: 'card-board',
      note: `${name} on the public board: every time posted on it, who flew them and their ghosts. A link to send somebody. Opens in a new tab.`,
    });
  }
  rows.push({ label: 'Back to the list', action: 'card-back' });
  return rows;
}

/*
 * THE ONE EDIT ROW, which is the right one of three (MENUS-PLAN.md 2.4):
 * Edit this track for a published track of your own, Edit a copy for
 * somebody else's, and Open in the builder for a track that lives only in
 * this browser. Each used to be its own row, two of them greyed out at any
 * moment, saying in grey what the third was for.
 */
function editAction(listing, seat = null) {
  if (listing && listing.kind === 'owned') {
    return editOwnAction(listing);
  }
  if (listing && listing.canRemix) {
    return remixAction(listing);
  }
  const name = (seat && seat.name) || (listing && listing.name) || 'this track';
  return {
    label: 'Open in the builder',
    action: 'trackbuilder',
    note: `Opens the builder on ${name}. New in there starts a blank one. ${KEEP_NOTE}`,
  };
}

/*
 * Rows that can be pressed, and the one greyed row that is news rather than
 * an apology: Time posted says the lap is on the board. A greyed row whose
 * reason is another row's job ("Publish this one first") is left out, and
 * the row that does that job says so in its own note.
 */
function applicableRows(rows) {
  return rows.filter((r) => r && (!r.disabled || r.label === 'Time posted'));
}

function orderedCourses(list, order) {
  const out = list.slice();
  if (order === 'newest') {
    out.sort((a, b) => String(b.publishedUtc || '').localeCompare(String(a.publishedUtc || '')));
  } else if (order === 'name') {
    out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  }
  return out;
}

/* What pressing a course card does, said once for all three kinds of card so
 * they cannot drift apart again. Each used to end "Choosing it loads the
 * track and flies it here", which stopped being true on 2026-08-19, when
 * choosing a card started listing what it can do. */
const CARD_PRESS_NOTE = 'Choose it to see what you can do with it, or double click it to fly it.';

/*
 * The tune, as named choices.
 *
 * A tune is P, I, D, feedforward and filtering. One ships, and it is what a
 * freshly flashed quad flies but for four settings its file argues for; the
 * other name on this row, when it is there, is the pilot's own saved dump.
 * Neither carries rates, which is why moving between them changes how the
 * quad settles and not how far the sticks go. See configs/registry.js.
 */
/*
 * Changing what the quad flies re-inits the module, and re-initing puts the
 * craft back on the start line with the lap clock at zero.
 *
 * WHY THAT IS RIGHT AND NOT A BUG, even though the deleted flight-controller
 * screen used to defer it behind a Save and restart the run dialog. A lap
 * flown half on one rate profile and half on another is not a lap: the
 * record key in src/main.js hashes the whole composed config precisely so
 * that a time is only ever compared against times flown on the same one. So
 * the choice mid-run is between restarting the run and recording a time that
 * means nothing, and Tune has always taken the first. Rates takes it too.
 *
 * What was wrong was doing it in SILENCE, which is what removing the dialog
 * left behind: an arrow key on the pause menu cost a lap with no warning.
 * The row says so now, and so does the hint on the screen itself.
 */
const MID_RUN_WARNING = ' Changing it during a run puts the quad back on the start line.';

function tuneItem(s, midRun) {
  const name = tuneById(s.tune).name;
  const adjusted = pidsAdjusted(s.pids, s.tune);
  return {
    label: 'Tune',
    /*
     * THE ADJUSTMENT STAYS ON THE ROW. That was the PIDs row's whole
     * contribution, and dropping it would have been the one thing lost in
     * folding two rows into one: a quad flying something other than its
     * tune's own numbers has to say so without being opened. Stock reads as
     * the tune's name alone, because "Betaflight default, stock" is a row
     * saying the same thing twice.
     */
    value: adjusted ? `${name}, ${pidsSummary(s.pids, s.tune).toLowerCase()}` : name,
    action: 'pids',
    note: `${tuneById(s.tune).note} Opens ${SCREEN_TITLES.pids}, where the tune is chosen and Betaflight's own sliders adjust it. Your rates are kept.${midRun ? MID_RUN_WARNING : ''}`,
  };
}

/*
 * WHICH TUNE THE PIDS ROOM IS ADJUSTING, and the only place it is chosen.
 *
 * It used to be chosen on Quad, one row above a PIDs row that opened this
 * screen. That pair read as two decisions and was never two: with one tune
 * shipped, the upper row had a single answer on it and the lower one was
 * what a pilot had come to open. They are one row on Quad now, and it opens
 * here, so the picker had to come with it. The alternative was a Tune row on
 * Quad opening a screen whose own Tune row pointed back at Quad.
 *
 * ONE SHIPPED TUNE MEANS THE ROW HAS TO SAY WHERE THE SECOND ONE COMES FROM.
 * Karate race 6S and Precision used to sit under the default, so the row was
 * self evidently a list and needed no explaining. It is one name until the
 * pilot saves a dump, and a row offering exactly one answer with nothing
 * said about it reads as broken rather than as stock. So the note carries
 * the door to the bench, and that clause goes away the moment a save gives
 * the row two answers.
 */
function tunePickItem(s, midRun) {
  const ids = tuneChoices(s.airframe);
  const ownTune = ids.includes(CUSTOM_TUNE.id);
  const door = ownTune
    ? ''
    : ` Stock is the only tune shipped. Edit one on ${SCREEN_TITLES.fc} and save it, and it joins this row as ${CUSTOM_TUNE.name}.`;
  return {
    ...choice(
      'Tune',
      `Everything below belongs to this one, and each tune keeps its own adjustment.${door}${midRun ? MID_RUN_WARNING : ''}`,
      ids,
      s.tune,
      (id) => tuneById(id).name,
      (id) => { s.tune = id; },
    ),
    /*
     * ENTER OPENS THIS ROW, IT NEVER STEPS IT, and that is a decision rather
     * than an accident of arithmetic.
     *
     * This is the row that bit somebody: one Enter a row below where it was
     * meant swapped the flight tune with nothing announcing it, and a tune
     * swap re-inits the module and costs the lap. What kept it safe
     * afterwards was fitsAsSegments saying no, which it said because the
     * labels of three tunes came to forty characters against a budget of
     * twenty four. With two tunes deleted the list is short enough to be
     * segmented, so the guarantee evaporated on a change that had nothing to
     * do with it, and the shell check caught the row going dead in the same
     * breath. A row whose cost is a lap does not get to depend on how long
     * its labels happen to be. See select().
     */
    pickOnly: true,
  };
}

/*
 * The aircraft row: the top of the Quad screen and the only way to change
 * the answer the first run gate asked.
 *
 * It carries the loudest note on the screen because it is the loudest
 * change on the screen. Everything else here adjusts one machine; this one
 * swaps the machine, and it takes the tune, the pack charge and the camera
 * with it because none of those means anything on the other aircraft. It
 * also changes what a track IS: a whoop flies a 1.22 by 1.83 m RaceGOW room
 * and a five inch flies a sixty metre field, so the seated track goes with
 * it too.
 */
function craftItem(s, midRun) {
  const af = airframeById(s.airframe);
  const other = AIRFRAMES.find((a) => a.id !== s.airframe) || af;
  return choice(
    'Aircraft',
    `${af.blurb} Each aircraft keeps its own tune, PIDs, pack, weight and camera: changing it brings back that machine's as you left them, or its stock ones the first time, and switches the builder between a ${other.trackClass === 'micro' ? 'sixty metre field and a living room' : 'living room and a sixty metre field'}. Your own rates go with you unless they are still the stock ones.${midRun ? MID_RUN_WARNING : ''}`,
    AIRFRAME_IDS,
    s.airframe,
    (id) => airframeById(id).name,
    (id) => { seatAirframe(s, id); },
  );
}

/*
 * Where the camera tilt starts costing enough yaw to be worth a word, and
 * what to offer instead. 40 is where sin(t) passes 0.64, so nearly two
 * thirds of a yaw becomes picture roll; 500 puts a 40 degree mount back to
 * roughly what 30 degrees feels like at the stock rate. Both measured, see
 * PROGRESS.md.
 */
const YAW_TIP_TILT = 40;
const YAW_TIP_RATE = 500;

/* The rate systems whose Max rate column is the rate at full stick, so
 * "set yaw to 500" is one number and is exactly true. See offerYawTip. */
function yawTipFixable(rates) {
  const type = normaliseRates(rates).type;
  return type === 'ACTUAL' || type === 'QUICK';
}

/* How long a yes or no refuses to be answered after it opens. See askConfirm. */
const CONFIRM_DEAF_MS = 300;

function ratesChanged(s) {
  return !ratesAreDefault(s.rates);
}

/* The way in to the Rates screen, with the whole curve read out on the row
 * so a pilot can see what they are flying without opening it. */
function ratesItem(s, midRun) {
  return {
    label: 'Rates',
    value: ratesShort(s.rates),
    action: 'rates',
    /*
     * NO MID RUN WARNING ANY MORE, and its absence is the point.
     *
     * It said the quad goes back on the start line, and until this round it
     * did: rates live in the config text, so changing one re-inits the
     * module, and the module's init is a full reset. applySettings in
     * src/main.js now puts the craft back where it stood instead, so the
     * sentence would be a warning about something that does not happen.
     * The tune and the PIDs still carry it, because they still do it.
     */
    note: `How far the sticks go, and how sharply. Yours, not the tune's. A radio in Acro flies this curve; key races start in Angle. Changing them mid run leaves the quad where it is and the clock running.`,
  };
}

/* The way back into the flight feel question, after its one automatic
 * offer. On Results and the pause menu only: those are the two places a
 * pilot has just been flying, which is when a feel report is worth
 * anything. */
/*
 * THE WEIGHT, AS A ROW ON THE PAUSE SCREEN. The owner, 2026-09-26: "finish
 * the weight slider", usable where it is shown and not only visible there.
 * The flight overlay's slider showed through the pause menu dimmed, under a
 * screen that takes every pointer, and no key reached it, so the pause
 * screen could show it and nobody could move it. It is a row now, in "Does
 * it feel wrong?", because floaty or heavy is that question: the Rates and
 * PIDs screens' own drag track with the number beside it. Drag lands on
 * release, one arrow or one stick flick is one step of five, the number
 * types. The same setting and the same save as the overlay's slider, which
 * follows it (applySettings paints it), so neither can disagree with the
 * other. Changing it voids a running lap, as the overlay's always has; see
 * the weight in applySettings, src/main.js.
 */
function weightItem(s) {
  const top = weightMaxFor(s.airframe);
  const cur = clampWeight(s.weight, s.airframe);
  const spec = {
    cliMin: WEIGHT_MIN, cliMax: top, scale: 1, decimals: 0, unit: '%',
  };
  const set = (v) => { s.weight = clampWeight(v, s.airframe); };
  const it = number(
    'Weight',
    `How heavy the quad feels. Right is heavier: it drops when you chop the throttle and stops hanging at the top of a jump. Left is lighter, and it floats. ${WEIGHT_STOCK} is the quad as it ships; changing it mid lap voids the lap, and a lap flown off ${WEIGHT_STOCK} goes on the public board with its weight beside your name.`,
    spec,
    cur,
    set,
  );
  /* A step is five, the overlay's step: number() would step one, which
   * clampWeight rounds straight back. */
  it.adjust = (d) => set(cur + d * WEIGHT_STEP);
  it.range = { min: WEIGHT_MIN, max: top, step: WEIGHT_STEP };
  return it;
}

/*
 * FLIGHT FEEL TUNING'S ROWS, the pause screen's copy of the two sliders under
 * Weight, for the reason weightItem exists: the flight overlay puts its
 * sliders away under the pause, and a pilot who paused to move one needs a
 * row that does. Same setting, same save, same clamp as the overlay's, which
 * follows it. Drawn only while the mode is on (see the callers), so a pilot
 * who never turned it on has the menu they had.
 *
 * A step is five, the sliders' step: number() would step one, which the
 * clamp rounds straight back.
 */
function tuneSliderItem(label, note, spec, cur, set, step) {
  const it = number(label, note, spec, cur, set);
  it.adjust = (d) => set(cur + d * step);
  it.range = { min: spec.cliMin, max: spec.cliMax, step };
  return it;
}

function airGripItem(s) {
  return tuneSliderItem(
    'Air grip',
    `How much the air holds the quad back, so how far it carries with the sticks centred. Left and it coasts on and runs faster; right and the air grips it, it stops sooner and tops out slower. ${AIR_GRIP_STOCK} is the quad as it ships. Changing it mid lap voids the lap, and a flight off ${AIR_GRIP_STOCK} stays off the public board.`,
    {
      cliMin: AIR_GRIP_MIN, cliMax: AIR_GRIP_MAX, scale: 1, decimals: 0, unit: '%',
    },
    clampAirGrip(s.airGrip),
    (v) => { s.airGrip = clampAirGrip(v); },
    AIR_GRIP_STEP,
  );
}

function motorKvItem(s) {
  return tuneSliderItem(
    'Motor power',
    `How much speed the motors make for a volt, their KV. Left is softer: a gentler punch and a lower top speed. Right is punchier, and the pack sags more for it, and the quad hovers lower on the stick. ${MOTOR_KV_STOCK} is the quad as it ships. Changing it mid lap voids the lap, and a flight off ${MOTOR_KV_STOCK} stays off the public board.`,
    {
      cliMin: MOTOR_KV_MIN, cliMax: MOTOR_KV_MAX, scale: 1, decimals: 0, unit: '%',
    },
    clampMotorKv(s.motorKv),
    (v) => { s.motorKv = clampMotorKv(v); },
    MOTOR_KV_STEP,
  );
}

function tuningItem(s, caps) {
  return toggle(
    'Flight feel tuning',
    `Off by default. On, ${tuneSliderWords(caps) || 'the tuning sliders'} join Weight between the sticks while the quad is on the ground, and a flight flown on your own sliders ends with a question: did that feel better than the stock quad? Nothing is sent unless you say yes. Off, the quad flies as it ships whatever the sliders say. Switching it mid lap voids the lap if it changes the quad you are flying.`,
    Boolean(s.feelTuning),
    (v) => { s.feelTuning = Boolean(v); },
  );
}

function tuneAskItem(s) {
  return toggle(
    'Ask after a tuned flight',
    'When a flight flown on your own sliders ends, ask whether it felt better than stock. You can always answer no, and nothing is sent without a yes. Off, it never asks; the sliders still work.',
    Boolean(s.feelTuneAsk),
    (v) => { s.feelTuneAsk = Boolean(v); },
  );
}

function feelItem() {
  return {
    label: 'Flight feel',
    action: 'feel',
    note: 'Tell the tune work how the quad flies. One word is enough; your tune, PID adjustment and rates go with it.',
  };
}

/*
 * GRAPHICS, WITH AUTO FIRST. Auto is graphicsAuto, the flag this row always
 * cleared when a preset was picked: until 2026-09-27 it only meant "detected
 * from the GPU's name", and now it means the frames choose (see
 * src/render/autoscale.js). Picking Auto hands the preset back to it from
 * wherever it stands; picking a preset fixes it by hand, as before.
 * `scaleNow` is Auto's resolution factor, from main.js, so the note can say
 * what it is doing rather than what it might do.
 */
function graphicsItem(s, scaleNow) {
  const id = normalizeGraphics(s.graphics);
  const pct = Math.round((Number(scaleNow) || 1) * 100);
  /* The preset above the ceiling was tried here and did not hold: said,
   * so a pilot wondering why Auto never goes higher has the answer. */
  const top = GRAPHICS_IDS.indexOf(s.graphicsAutoCeiling);
  const tried = top >= 0 && top < GRAPHICS_IDS.length - 1
    ? ` ${graphicsLabel(GRAPHICS_IDS[top + 1])} was tried on this machine and did not keep the picture on time, so Auto stays at ${graphicsLabel(GRAPHICS_IDS[top])} or below.`
    : '';
  const note = s.graphicsAuto
    ? `Auto: drawing at ${graphicsLabel(id)}${pct < 100 ? `, at ${pct} percent resolution right now` : ''}. It watches how the frames actually arrive, lowers the resolution when the picture runs late, and changes the preset between runs.${tried} Pick a preset to fix it by hand.`
    : graphicsNote(id);
  return choice(
    'Graphics',
    note,
    ['auto', ...GRAPHICS_IDS],
    s.graphicsAuto ? 'auto' : id,
    /* "Auto", not "Auto (Medium)": the longer one broke the segmented row's
     * 24 character budget, so the row turned into a list on Medium and stayed
     * segmented on Low and High, changing shape with its own value
     * (MENUS-PLAN.md 1.40). What Auto is drawing at is the note's first
     * sentence. */
    (v) => (v === 'auto' ? 'Auto' : graphicsLabel(v)),
    (v) => {
      if (v === 'auto') {
        s.graphicsAuto = true;
      } else {
        s.graphics = v;
        s.graphicsAuto = false;
        /* A preset by hand ends Auto's say, and what it had learned with
         * it: see graphicsAutoMeasured in DEFAULTS. */
        s.graphicsAutoMeasured = false;
        s.graphicsAutoRaised = '';
        s.graphicsAutoCeiling = '';
      }
    },
  );
}

/*
 * What Low latency view is doing on this machine, in one sentence a pilot
 * can act on. `info.lowLatency` is what the browser granted when the canvas
 * was made (see main.js, beside setGpuInfo), which can differ from what the
 * row says now: the row takes effect on the next load.
 */
function lowLatencyNote(on, info) {
  const granted = Boolean(info && info.lowLatency);
  const what = 'Draws each frame straight to the screen instead of queueing it behind the page, which can take a frame or two off the time between your sticks and the picture. It can tear.';
  if (!on) {
    return granted
      ? `Off from the next load. ${what} This browser is using it until you reload.`
      : `Off. ${what} Reload after switching it on.`;
  }
  return granted
    ? `On, and this browser is using it. ${what}`
    : `On, but this browser did not grant it, so frames still queue behind the page. ${what} Not every browser can; if you just switched it on, reload.`;
}

/*
 * INPUT TO SCREEN, the measured row. `p` is main.js's latency probe: key to
 * screen from the browser's Event Timing (null before a reported press), the
 * refresh rate, the GPU's time over a frame and whether the low latency
 * canvas was granted. It says what it is and what it is not: a browser's
 * reading, not the monitor's own delay after it.
 */
function latencyItem(p) {
  const key = p && p.key;
  const bits = [];
  if (p && p.hz) {
    bits.push(`the screen refreshes at ${p.hz} Hz`);
  }
  if (p && p.gpuMs != null) {
    bits.push(`the GPU takes about ${Math.round(p.gpuMs)} ms over a frame`);
  }
  if (p) {
    bits.push(p.lowLatency ? 'Low latency view is in use' : 'frames queue behind the page (Low latency view is not in use)');
  }
  /* A 60 Hz reading on a big screen is very often a Windows display mode
   * left at 60 on a faster panel (bug-0054c4c6: a 144 Hz monitor flown at
   * 60 until the mode was changed, with the GPU idle). Said once, in the
   * note, as a thing to check and not a fault: a real 60 Hz panel reads
   * the same. */
  const wide = typeof window !== 'undefined' && window.screen
    ? window.screen.width * (window.devicePixelRatio || 1) : 0;
  const sixty = p && p.hz === 60 && wide >= 2560
    ? ' If this monitor can run faster than 60 Hz, check that the system is set to its top refresh rate (Windows: Settings, Display, Advanced display), because the page can only draw as often as the display it is given.'
    : '';
  const facts = bits.length ? ` Here ${bits.join(', ')}.${sixty}` : '';
  if (!p || !p.supported) {
    return {
      label: 'Input to screen',
      value: 'Not measurable here',
      note: `This browser does not report input timing, so the time from a press to the screen cannot be read.${facts}`,
      info: true,
    };
  }
  if (!key) {
    return {
      label: 'Input to screen',
      value: 'Press a few keys',
      note: `Measured from your own key presses and clicks to the frame that first showed them, so it fills in as you use the menus.${facts}`,
      info: true,
    };
  }
  return {
    label: 'Input to screen',
    value: `About ${key.ms} ms`,
    note: `From a key press to the frame that first showed it, the median of your last ${key.n}, as this browser reports it; the display's own delay after that is not included. One frame at 60 Hz is 17 ms.${facts}`,
    info: true,
  };
}

function gpuItem(info) {
  if (!info) {
    return {
      label: 'GPU',
      value: 'Detecting',
      note: 'Read from the WebGL context that is drawing the world.',
      info: true,
    };
  }
  /* The renderer's own name, without the vendor in brackets after it: the
   * row's value stops at about half the row, so "Software (Google Inc.
   * (Google))" was cut to "Software (Google Inc. (..." (MENUS-PLAN.md 1.15).
   * The note says the whole thing, and so does the row's tooltip. */
  const short = String(info.display || '').split(' (')[0].trim() || info.display;
  return {
    label: 'GPU',
    value: short,
    title: info.display,
    note: info.note,
    info: true,
  };
}

function padChooseNote(info, blind = null) {
  const n = info && typeof info.count === 'number' ? info.count : 0;
  if (n <= 0) {
    /* A pilot looking at this row has a radio in mind. Where the browser
     * will not show one to a page, that is the first thing to tell them,
     * and not "plug one in": see radioBlind in src/ui/stickhelp.js. */
    if (blind) {
      return blind.note;
    }
    return 'Plug in a radio in joystick mode. If more than one is plugged in, this is how you pick which one flies.';
  }
  if (n === 1) {
    return `One device is plugged in, ${info.using}. Open this to confirm it, or to switch to the keyboard.`;
  }
  return `${n} devices are plugged in. Move the one you want. Windows lists them in Game Controllers order; this screen is how you pick.`;
}

/*
 * `#credits` is a real address. World load, a map swap and the constructor
 * all call show('title'). If those calls are allowed to win, the hash is
 * stripped (replaceState does not fire hashchange) and the visitor lands
 * on Fly. The hash wins until the pilot backs off it.
 */
function locationHashScreen() {
  const h = (window.location.hash || '').replace(/^#/, '');
  return h === 'credits' ? 'credits' : null;
}

/*
 * WHETHER FREESTYLE IS OFFERED AT ALL, and on a whoop it is not.
 *
 * Freestyle is one place, a town: roofs, alleys, a level crossing and a works
 * road, laid out for a five inch at forty metres a second and about five
 * hundred metres across. A 65 mm whoop doing five is as wrong in it as a five
 * inch is in a living room, and that is the mismatch this whole class split
 * exists to remove. Offering the card anyway would be offering a pilot a
 * place they will turn round and leave.
 *
 * So on a whoop the mode question has one answer and is not asked: the title
 * goes aircraft, then straight to the menu, and Escape from the menu goes
 * straight back to the aircraft. When there is an indoor freestyle space to
 * fly, this is the one function that has to change.
 */
function freestyleOffered(airframeId) {
  return airframeById(airframeId).trackClass !== 'micro';
}

/*
 * RACE OR FREESTYLE, WHEN THE LINK ALREADY SAID.
 *
 * The gate is a question, and a question that has been answered must not be
 * asked again: the builder's Fly this track button links to ?map=custom, the
 * board's links carry ?share=id, and a chase link carries ?ghost=id. Every
 * one of those is somebody arriving with the thing they want to fly already
 * named, so the gate would be a screen in front of a decision they made on
 * another page.
 *
 * Only the link answers it. A stored setting deliberately does not, which is
 * the whole point of the gate: see the constructor.
 */
function linkedMode() {
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (e) {
    /* No URL to read. The gate asks. */
    return null;
  }
  if (params.get('share') || params.get('ghost')) {
    return 'race';
  }
  /* A published map from the board is freestyle whatever else the link
   * says; the board's own link says ?map=built beside it anyway. */
  if (params.get('mapshare')) {
    return 'freestyle';
  }
  const wanted = params.get('map');
  const m = wanted ? MAPS.find((x) => x.id === wanted) : null;
  if (!m) {
    return null;
  }
  return m.mode === 'freestyle' ? 'freestyle' : 'race';
}

/*
 * FLY NOW, WHEN THE LINK SAID SO: the id of the map the link asked to be
 * flown the moment it has loaded, or null.
 *
 * The builder's Fly this map is a press that has already said everything:
 * this map, the five inch, fly it. With ?map= and ?craft= the gate is
 * answered, but the pilot still landed on the title, whose Fly row and
 * Map: Your map only asked the same question a third time, and the owner's
 * report on 2026-09-25 was exactly that: Fly this map "bumps me back" to
 * the menu. ?fly=1 is the rest of the sentence. It only counts beside a
 * map the registry knows, and main.js only acts on it when that map is the
 * one that loaded and the gate is answered, so a map that failed to load
 * leaves the pilot on the title with the failure said, as before.
 *
 * Fly this track carries it too since 2026-09-26, as ?map=custom with the
 * aircraft its class is for, and main.js takes a race seat past the launch
 * card to the grid, because the owner asked for the starting blocks and
 * not a card in front of them.
 */
function linkedFly() {
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (e) {
    return null;
  }
  if (params.get('fly') !== '1') {
    return null;
  }
  const wanted = params.get('map');
  return wanted && MAPS.some((x) => x.id === wanted) ? wanted : null;
}

/*
 * Take one parameter out of the address, keeping every other one and the
 * hash. A link's one-time instruction must not outlive the load it was
 * for: a reload of a ?fly=1 page is a pilot reloading, not a pilot asking
 * to be put in the air again.
 */
function dropLinkParam(name) {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(name)) {
      return;
    }
    url.searchParams.delete(name);
    history.replaceState(history.state, '', url);
  } catch (e) {
    /* No history to write. The parameter stays; main.js has already read it. */
  }
}

/*
 * The two aircraft in plan, drawn TO ONE SCALE.
 *
 * The viewBox is 300 mm across for both, so the five inch fills it and the
 * whoop sits in the middle of it at a bit over a fifth of the width, which
 * is exactly the relationship the two machines have on a bench. That is the
 * single most useful thing a card can tell somebody who has flown one and
 * not the other, and it is the one thing two cropped photographs cannot say.
 *
 * The five inch is an X: four arms out to four open discs, which is what you
 * see when you look at one. The whoop is a tub: four rings joined by webs,
 * with no arm visible anywhere, because there are none. The silhouettes are
 * the difference between the two designs and they are drawn rather than
 * described.
 *
 * Numbers are millimetres and come from configs/airframes.js, so a change to
 * an airframe's dimensions redraws its card.
 */
function craftSvg(a) {
  const VB = 300;           /* viewBox side, millimetres */
  const c = VB / 2;
  /*
   * THE REAL PRODUCT, WHICH ON THE WHOOP IS NOT THE AIRFRAME'S `dims`.
   *
   * The whoop flies the five inch's plant, so its `dims` are the five
   * inch's: that is what the collider sweeps and what the world draws,
   * because the world is built MICRO_SCALE times life size to suit. Drawn
   * from those, the whoop's plan would fill this viewBox edge to edge like
   * the five inch's, and the one thing this card exists to say, that the
   * two machines sit on a bench at a fifth of each other's width, would be
   * gone. WHOOP_TRUE_DIMS is the 65 mm machine as the maker publishes it, and
   * it is what a pilot holding one would measure.
   */
  const dims = a.id === 'whoop65' ? WHOOP_TRUE_DIMS : a.dims;
  const arm = dims.arm * 1000;
  const prop = dims.propR * 1000;
  /* The outside of a duct is the hull, not the blade plus a guess at a wall. */
  const hull = (dims.hullR ?? dims.propR) * 1000;
  const off = arm / Math.SQRT2;
  const motors = [[off, off], [off, -off], [-off, off], [-off, -off]];
  const ducted = a.trackClass === 'micro';
  const parts = [];
  if (ducted) {
    /* The tub: the webs first so the rings sit on top of them. */
    parts.push(`<rect x="${c - off}" y="${c - off}" width="${off * 2}" height="${off * 2}"`
      + ` rx="${prop * 0.35}" fill="none" stroke="currentColor" stroke-width="${prop * 0.42}"`
      + ' stroke-opacity="0.30"/>');
    parts.push(`<line x1="${c - off}" y1="${c - off}" x2="${c + off}" y2="${c + off}"`
      + ` stroke="currentColor" stroke-width="${prop * 0.34}" stroke-opacity="0.24"/>`);
    parts.push(`<line x1="${c - off}" y1="${c + off}" x2="${c + off}" y2="${c - off}"`
      + ` stroke="currentColor" stroke-width="${prop * 0.34}" stroke-opacity="0.24"/>`);
  } else {
    for (const [mx, mz] of motors) {
      parts.push(`<line x1="${c}" y1="${c}" x2="${c + mx}" y2="${c + mz}"`
        + ` stroke="currentColor" stroke-width="${prop * 0.20}" stroke-opacity="0.55"/>`);
    }
    parts.push(`<rect x="${c - 22}" y="${c - 38}" width="44" height="76" rx="10"`
      + ' fill="currentColor" fill-opacity="0.30"/>');
  }
  for (const [mx, mz] of motors) {
    if (ducted) {
      /* The duct wall, then the bore, so a ring reads as a ring. */
      parts.push(`<circle cx="${c + mx}" cy="${c + mz}" r="${hull}"`
        + ' fill="currentColor" fill-opacity="0.34"/>');
      parts.push(`<circle cx="${c + mx}" cy="${c + mz}" r="${prop}"`
        + ' fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.85"/>');
    } else {
      parts.push(`<circle cx="${c + mx}" cy="${c + mz}" r="${prop}"`
        + ' fill="currentColor" fill-opacity="0.16"'
        + ' stroke="currentColor" stroke-width="1.4" stroke-opacity="0.8"/>');
    }
  }
  if (ducted) {
    /*
     * The stack and the camera, which are the only things that say which way
     * it is pointing. There is no canopy: a whoop is sold bare, the board
     * IS the top of the aircraft, and the camera standing at the front of it
     * is the tallest thing on the machine. See src/render/whoopcraft.js,
     * which draws the same two parts in the same order. -z is the nose in
     * the craft frame and on this drawing.
     */
    parts.push(`<rect x="${c - 9}" y="${c - 9}" width="18" height="18" rx="2"`
      + ' fill="currentColor" fill-opacity="0.42"/>');
    parts.push(`<rect x="${c - 7}" y="${c - 17}" width="14" height="11" rx="2"`
      + ' fill="currentColor" fill-opacity="0.72"/>');
  }
  return `<svg viewBox="0 0 ${VB} ${VB}" role="img" aria-hidden="true"`
    + ' preserveAspectRatio="xMidYMid meet" class="craft-plan">'
    + parts.join('') + '</svg>';
}

/*
 * THE THREE WAYS IN, and they are the whole of the front door.
 *
 * This used to be two questions in a row. Which aircraft, five inch or
 * whoop, and then race or freestyle, and the second one was skipped on the
 * whoop because a 65 mm machine has nowhere to freestyle. So a pilot who
 * came to fly pressed twice, and what the second press asked depended on
 * what the first one answered: choosing the five inch produced a question
 * the whoop had not been asked. The owner reported exactly that, and it is
 * the report this table answers.
 *
 * Between the two questions there are three legal answers and no more. The
 * whoop has no freestyle, so the pairs are five inch racing, whoop racing,
 * and freestyle, which is the five inch. One screen, three cards, one press.
 * The objection the old aircraft gate wrote down was that a third card
 * beside Race and Freestyle would pretend racing on a whoop was not a real
 * answer; it is answered by racing on a whoop being one of the three cards
 * rather than by asking twice.
 *
 * A card carries both halves of the answer, so act() seats the aircraft and
 * sets the mode in one go. The AIRCRAFT is remembered in settings and the
 * MODE deliberately is not, which is unchanged: what the cursor opens on is
 * the seated aircraft's card, and every visit still passes through here.
 *
 * The pictures are frames of the real renderer, shipped as files by
 * scripts/gatecards.js, because the screen a first visit opens on has to
 * paint before anything has been flown and with no network. The plan
 * drawing over each one is craftSvg, and the two machines are drawn to ONE
 * scale in one viewBox, so the whoop is a fifth of the width of the five
 * inch on its card because it is a fifth of the width of it on a bench. A
 * photograph of a room and a photograph of a field cannot say that: they
 * are both a picture that fills a card.
 */
const WAYS = [
  {
    id: 'race-5inch',
    airframe: '5inch',
    mode: 'race',
    label: 'Five inch racing',
    art: 'assets/gate/race.jpg',
    blurb: 'A gated track on a sixty metre field, against the clock. A 710 gram 6S quad at forty metres a second, and every lap you finish can go on the public board.',
    facts: ['6S', '220 mm', 'The board'],
  },
  {
    id: 'race-whoop65',
    airframe: 'whoop65',
    mode: 'race',
    label: 'Whoop racing',
    art: 'assets/gate/whoop.jpg',
    /* Says what configs/airframes.js says, in the same words: the machine
     * flies the five inch's model and the room is built to match, so the
     * picture is a whoop's and the hands get the five inch. The old line
     * promised three times the angular acceleration, which was true of a
     * plant nothing selects now. */
    blurb: 'The same clock, indoors. A 65 mm ducted whoop through a track that fits in a living room, on 28 inch gates.',
    facts: ['1S', '65 mm', 'Indoors'],
  },
  {
    id: 'freestyle-5inch',
    airframe: '5inch',
    mode: 'freestyle',
    label: 'Freestyle',
    art: 'assets/gate/freestyle.jpg',
    /* No clock and no score in the line, because neither is on until a
     * pilot asks for them. See DEFAULTS.freestyleScoring. The aircraft is
     * named because this card seats one: the town is five hundred metres
     * across and it is the five inch's. */
    blurb: 'The whole town on the five inch, or a map you build yourself. Roofs, alleys and a level crossing, or cranes and bandos wherever you put them. No clock, no gates, and trick names are a switch inside.',
    /* The mode's three, not the machine's, and the machine is on the card
     * anyway: the plan mark over the picture is the five inch's. Three
     * words that fit one line on a landscape phone, where the blurb is
     * hidden and these are the whole of the card. */
    facts: ['No gates', 'No clock', 'Build a map'],
  },
].map((w) => ({ ...w, action: `way-${w.id}` }));

/*
 * THE FOURTH CARD, WHICH MAKES SOMETHING RATHER THAN FLYING IT. The owner
 * asked for it on 2026-09-25: "on this page i want a 4th box - map builder".
 *
 * It is kept out of WAYS on purpose. A way seats an aircraft and a mode and
 * lands on the menu behind the gate; this seats nothing. It leaves for the
 * builder, a separate page, and the builder opens by asking which of its
 * three canvases to start on, with the same three pictures this gate uses
 * (openChooser in src/trackbuilder/app.js). So what is being made is asked
 * on the page where it is made, and asked once.
 *
 * The picture is a frame of the builder's own 3D preview on the starter
 * map, written by scripts/gatecards.js like the other three. There is no
 * plan drawing over it, because the drawing is the aircraft to scale and
 * this card seats no aircraft. Its facts are amber, the builder's colour.
 */
const BUILDER_CARD = {
  id: 'builder',
  label: 'Builder',
  art: 'assets/gate/builder.jpg',
  blurb: 'Make your own. A race track for the five inch, a room for the whoop, or a freestyle map of bandos, cranes and named gaps, drawn from above and flown from the same page.',
  facts: ['Tracks', 'Rooms', 'Maps'],
  action: 'builder',
};

/* The way that is seated right now, which is what the gate's cursor opens
 * on and what a menu that has been backed out of returns to. The mode is
 * only set once the gate has been answered, so before that the racing card
 * of the seated aircraft is the standing answer. */
function seatedWay(settings, mode) {
  return WAYS.find((w) => w.airframe === settings.airframe && w.mode === (mode || 'race'))
    || WAYS.find((w) => w.airframe === settings.airframe)
    || WAYS[0];
}

/*
 * The aircraft, when a link names it. Same rule as linkedMode: somebody
 * arriving from the builder or the board with a whoop track in hand has
 * already answered the question, so asking it would be a screen in front of
 * a decision they made on another page.
 *
 * Returns an airframe id or null. Unknown values are null rather than a
 * fallback, because "the link said something I do not understand" and "the
 * link said nothing" should both end up asking.
 */
function linkedCraft() {
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (e) {
    return null;
  }
  const wanted = params.get('craft');
  return AIRFRAME_IDS.includes(wanted) ? wanted : null;
}

function clearLocationHash() {
  const url = new URL(window.location.href);
  if (!url.hash) {
    return;
  }
  url.hash = '';
  history.replaceState(null, '', url);
}

/*
 * THE OSD'S NUMBERS AT OSD RATE, NOT FRAME RATE. Every readout that changes
 * continuously used to be rewritten every frame: the lap clock to the
 * hundredth, the speed, the height and the pack. Each write is a style and
 * layout pass and a re-raster of its text under the OSD's ink edge, and on
 * 2026-09-27 a headless trace put that edge at about half a millisecond of
 * raster a frame over plain text. The edge stays, because it is what keeps
 * the small print readable over a lit world; the numbers change less often
 * instead. Fifteen a second for speed, height and pack, thirty for the clock,
 * which nobody reads faster, and a real OSD updates slower still. Anything
 * that is a change of state (a clock starting, a readout coming or going, a
 * gate, the launch call) is still written the frame it happens. The gates
 * are a hair under the periods so a 60 Hz frame lands on every fourth and
 * every second frame rather than beating against them.
 */
const OSD_NUMBERS_MS = 62;
const OSD_CLOCK_MS = 31;

export class Ui {
  constructor(root) {
    this.root = root;
    this.settings = loadSettings();
    this.firstRun = detectFirstRun();
    /*
     * WHAT THIS SESSION IS FOR, which is half of the one question the front
     * door asks. The other half is which aircraft, below, and one card on
     * the gate answers both: see WAYS.
     *
     * 'race', 'freestyle', or null for "not asked yet", which is one of the
     * two ways the gate is up.
     *
     * It is NOT in the settings blob and is deliberately not remembered.
     * The two are not a preference, they are what this session is for: the
     * same pilot races on Tuesday and messes about on Wednesday, and a
     * remembered answer would put whichever they did last in front of them
     * as a fact rather than a choice. It costs one keypress a visit and it
     * buys a front page that is about the thing they came to do.
     *
     * What it buys the menu behind it is the removal of a choice that was
     * being made twice. Race and Freestyle were two rows on the title, each
     * naming a place, so the pilot picked a mode by picking a location and
     * the front page carried both. With the mode already answered there is
     * one row, and it names the track or the map, which is the only part
     * still open.
     *
     * A link that names what to fly answers it without asking: see
     * linkedMode. The gate is up while EITHER half is unanswered, which is
     * what onGate() says, so a link has to answer both to skip it.
     */
    this.mode = linkedMode();
    /*
     * WHICH AIRCRAFT, the other half.
     *
     * It used to be a gate of its own IN FRONT of Race or Freestyle, on the
     * argument that the two questions are not the same shape. They are not,
     * but between them they have three legal answers, and asking twice for
     * three answers cost a press and made what the second screen asked
     * depend on what the first one answered. One gate, three cards: WAYS.
     *
     * The answer IS remembered, in settings.airframe, because the aircraft
     * is a preference rather than a statement about today. What is not
     * remembered is that the question was asked: the gate is the root of the
     * menu and it opens every visit. See craftGate below.
     */
    const linkedAf = linkedCraft();
    if (linkedAf) {
      /*
       * seatAirframe alone, and NOT an assignment to settings.airframe first.
       * It used to be both, and the assignment defeated the seat: seatAirframe
       * reads the aircraft it is moving FROM off settings.airframe to decide
       * whether the rates and the throttle cap are still that machine's stock
       * ones, and with the destination already written in, from and to were
       * the same aircraft. A ?craft=whoop65 link on a five inch profile flew
       * the whoop on 670 degree rates with no cap until the next reload.
       */
      seatAirframe(this.settings, linkedAf);
      this.settings.airframeAsked = true;
      saveSettings(this.settings);
    }
    /*
     * THE GATE IS THE ROOT MENU, every visit and not only the first.
     *
     * The aircraft used to be a first run question: answer it once and it
     * never came back, and the only way to change aircraft after that was
     * three rows deep under Quad. That made the whoop half of this product
     * something a pilot had to already know existed. It is not a setting
     * inside the experience, it IS the experience, so it is on the first
     * thing the title asks and on the thing Escape backs out to.
     *
     * This flag is the aircraft's half of "has the gate been answered". It
     * is false when a link named the aircraft, and the gate still opens
     * unless the mode is answered too, which is what onGate() decides.
     *
     * airframeAsked still matters: it is what lets a LINK carrying ?craft=
     * skip straight past this, and it is what the choice screen writes so
     * the seated aircraft is a real answer rather than a default.
     */
    this.craftGate = !linkedAf;
    /* The map a ?fly=1 link asked to be flown once it has loaded, read
     * once and taken out of the address at once. main.js acts on it after
     * the first frame. See linkedFly. */
    this.flyOnLoad = linkedFly();
    if (this.flyOnLoad) {
      dropLinkParam('fly');
    }
    /* A link that names the whoop has answered the mode question too, so
     * that pair of link parameters is still one press from the air. */
    if (this.syncMode()) {
      saveSettings(this.settings);
    }
    /* Which aircraft the mode was last made legal for. See writeSettings:
     * the answer only changes when the AIRCRAFT changes. */
    this.modeSyncedFor = this.settings.airframe;
    /* Set while a guided first flight is in the air. main.js reads it. */
    this.guided = false;
    this.boardCourses = [];
    /* The pilot's own tracks, read off this browser's library on entry to
     * the Track room. The board's half above it and this one are the two
     * things that room lists. See loadLocalCourses. */
    this.localCourses = [];
    /* The standings screen's subject and its times. null means "not asked
     * yet", which paintStandings draws as Reading the board; an empty array
     * means the board answered and there are none. */
    this.standingsFor = null;
    this.standingsTimes = null;
    this.standingsError = '';
    /* The Ghost row's contents, pushed by the shell through setGhostRow,
     * because the shell is the side that knows what can be chased. Null
     * hides the row, which is every freestyle map. */
    this.ghostRow = null;
    this.boardLoading = false;
    this.openingBoardCourse = false;
    this.onBoardCourse = null; /* (track) => Promise<boolean> */
    this.screen = 'title';
    /* Which device the pilot last touched, so the command bar prints that
     * device's glyphs. Showing keyboard and pad prompts at once is twice the
     * noise and half the answer.
     *
     * 'none' until something is pressed, and that is not a nicety: it used
     * to start at 'key', so a phone, which never sends a key, was
     * indistinguishable from a keyboard and got told to press Enter. The
     * legend reads this to choose a third voice on a touch screen that has
     * not heard from a keyboard or a pad. Everywhere else treats it exactly
     * as it treated 'key'. */
    this.lastInput = 'none';
    /* Screen id to the label of the row the cursor was on. See restoreCursor. */
    this.cursorMemory = {};
    /* The id of the row the cursor is on. The durable half of the cursor:
     * the index says where the row is right now, this says which row it is.
     * See syncCursor and restoreFocusRow. */
    this.focusId = null;
    this.cursor = 0;
    /*
     * On the gate the cursor starts on the card that is SEATED, so a
     * returning whoop pilot sees their own answer under the cursor and two
     * presses of Enter from a cold start put them back where they were.
     * renderMenu only re-picks when the cursor has fallen off the list, and
     * zero is a valid row here, so the first paint has to be told.
     */
    if (this.craftGate || !this.mode) {
      const at = WAYS.findIndex((w) => w.id === seatedWay(this.settings, this.mode).id);
      this.cursor = at >= 0 ? at : 0;
    }
    /* Which course card the player has chosen, by courseCardKey, and the
     * last one they were on. The first says whose list is showing; the
     * second is where Back to the list puts the cursor. */
    this.cardSubject = null;
    this.lastCardKey = null;
    /* The card the first press of a click chose, by courseCardKey, which is
     * what a double click flies (cardDoubleClick); and the card whose track
     * is being fetched to fly, which is the one that says Loading. */
    this.cardPress = null;
    this.flyingCard = null;
    /* The chosen card to open again when Back returns to the room from the
     * launch card or Standings, and the card the open sheet is drawn after.
     * See show and placeCourseSheet. */
    this.reopenCard = null;
    this.sheetAfterKey = null;
    this.onAction = null;    /* (action, settings) => void */
    this.onSettings = null;  /* (settings) => void */
    /* () => void. Fly what was just seated from the starting blocks, now if
     * its world is on screen and after the load if one is building. main.js
     * owns the world, so only it can tell which. See flyCard. */
    this.onFlySeated = null;
    this.onMusicSkip = null; /* (dir) => void, -1 previous, +1 next */
    /* (screen) => void, fired by show(). The shell hangs the music
     * context off this: the flight crate plays on a flight, the menu bed
     * everywhere else, and this file is the only side that knows which of
     * those is up. */
    this.onScreenChange = null;
    {
      /*
       * A placeholder for the dock until main.js pushes the player's real
       * status, which it does before the first gesture. It is a MENU
       * record because a visit opens in the menus and the menu bed is
       * what will be playing; the Music track setting names a flight
       * record, so it is not the answer to this question even when it is
       * pinned. Which of the two is a roll on the player, so this is
       * MENU_TRACKS[0] rather than a second roll that would disagree with
       * it for one frame.
       */
      const tr = MENU_TRACKS[0];
      this.musicNow = {
        id: tr.id,
        name: tr.name,
        selection: this.settings.musicTrack,
        index: 0,
        context: 'menu',
      };
    }
    /* Where the live sticks are, for the Rates curve. Written by the frame
     * loop through paintRates, read by the panel on every redraw. */
    this.ratesStick = { roll: 0, pitch: 0, yaw: 0 };
    /* Asked at most once a session, so oscillating across 40 does not nag. */
    this.yawTipAsked = false;
    /*
     * Which room a ROOM was opened from, so Escape goes back to it.
     *
     * Same contract as ratesFrom below, and needed for the same reason: the
     * Race and Freestyle rooms both carry a Tune row that is a door into
     * Quad, and act('quad') set returnTo to 'title' from anywhere that was
     * not paused. So changing a tune from Freestyle and pressing Back
     * landed on the title rather than the room you were standing in, which
     * is a one way door dressed as a signpost.
     *
     * Separate from returnTo on purpose: returnTo is where the pause chain
     * came from, and overwriting it here strands a paused run.
     */
    this.roomFrom = null;
    /* Set when Rates was opened FROM Settings, so Escape lands back on the
     * list it was a row of. Separate from returnTo on purpose: returnTo is
     * where Settings itself came from, and overwriting it here would lose a
     * paused origin two screens up. */
    this.ratesFrom = null;
    /* Same contract for the PIDs screen. */
    this.pidsFrom = null;
    /* And for the flight controller: which list its row was on, so Escape
     * lands back there without disturbing the pause chain in returnTo. */
    this.fcFrom = null;
    /* The module readback the PIDs screen draws from; see setPidsLive. */
    this.pidsLive = null;
    /* A refused preset write, shown as one amber row in the Rates room and
     * cleared the moment the room is entered or a write succeeds. Not a
     * setting: it describes this browser's last answer, not the pilot's. */
    this.ratesNotice = null;
    /*
     * The flight-controller editor. The session holds the draft dump and
     * builds the rows; the shell owns what Save means through onFcSave.
     */
    this.onFcOpen = null;    /* (page) => void */
    this.onFcSave = null;    /* (draft, { restart, exit, presetId }) => void */
    this.onFcAngle = null;   /* (on) => void, same sim_set_angle_mode as Settings */
    this.onFcMotor = null;   /* (motor, duty) => void, sim_motor_override */
    this.fc = new FcSession();
    this.fc.getFlightMode = () => (this.settings.flightMode === 'angle' ? 'angle' : 'acro');
    this.fc.setFlightMode = (on) => {
      this.settings.flightMode = on ? 'angle' : 'acro';
      saveSettings(this.settings);
      this.renderMenu();
      if (this.onFcAngle) {
        this.onFcAngle(Boolean(on));
      }
    };
    this.fc.getLaunchControl = () => Boolean(this.settings.launchControl);
    this.fc.setLaunchControl = (on) => {
      this.settings.launchControl = Boolean(on);
      saveSettings(this.settings);
      this.renderMenu();
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
    };
    this.fc.motorTestAllowed = () => !this.fc.runActive && this.fcFrom !== 'paused';
    this.fc.onMotorTest = (motor, duty) => {
      if (this.onFcMotor) {
        this.onFcMotor(motor, duty);
      }
    };
    this.onUiSound = null;   /* (kind) => void: 'move', 'adjust', 'select', 'back' */
    this.share = null;       /* published course this run is flying, or null */
    /* A published freestyle map this page load is flying in the built
     * world, from ?mapshare=: { id, name, author, board }, or null. The
     * title names it rather than Your map. See sharedMap in main.js. */
    this.sharedMap = null;
    this.timePosted = null;  /* last successful post on the results screen */
    /* The freestyle run the results screen is showing, and whether it has
     * been sent. Both cleared by resetScore, which every restart calls. */
    this.freestyleRun = null;
    this.runPosted = null;
    this.resultsFastest = null;
    /* What the results screen offers the board: { lapMs, threeMs, weight }
     * from the race's boardRow, the lap it would post and the weight it was
     * flown at, or null. resultsFastest stays the run's fastest lap, which
     * is what this screen reports; the two differ only on a room run that
     * changed weight between laps. */
    this.resultsBoard = null;
    /* Whether a lap of the run on screen was left off the board for being
     * flown on the tuned air or motors. See showResults. */
    this.resultsOffBoard = false;
    this.resultsDocId = null;
    this.coursePublished = null;
    /*
     * FLIGHT FEEL TUNING'S END OF FLIGHT, all of it in one place.
     *
     * tuneProbe is main.js's TuneLog read as a function; tuneCaps is which of
     * the two sliders the loaded module can answer (setTuneCaps); resultsTune
     * is the flight the results screen on show is about, taken when it was
     * shown because the log is cleared by the next run; tuneAsked is the
     * combinations already asked about this session, so one is asked once;
     * tuneAskTimer is the pending automatic question, so leaving the screen
     * can cancel it. See maybeAskTune.
     */
    this.tuneProbe = null;
    this.tuneCaps = { air: true, kv: true };
    this.resultsTune = null;
    this.tuneAsked = new Set();
    /* The combinations already sent this session, so the Share row can say
     * so instead of offering the same tune twice. */
    this.tuneSent = new Set();
    this.tuneAskTimer = 0;
    this.padPrev = { up: false, down: false, left: false, right: false, select: false, back: false };
    /* Seed the edges on the next poll rather than acting on them. Set by
     * every screen change; see show(). */
    this.padRearm = true;
    /* Whether a radio may drive the menus yet, for a visit to them that
     * began in flight, and the clock its waiting runs on. See
     * src/input/padgate.js. */
    this.padGate = newPadGate();
    this.padClockAt = 0;
    /* The last few things the radio did to a menu, and when this screen was
     * shown, so a report can say what resumed a pause: see padLogReport. */
    this.padLog = [];
    this.padShownAt = 0;
    this.dropEl = null;
    this.dropIndex = null;
    this.menuRows = [];
    this.rowOffset = 0;
    this.reelFreezeWorld = false;
    /* The Freestyle room's film of the loaded world, read by main.js every
     * frame; see captureCurrentCard. */
    this.reelFilm = null;
    /* Set by main.js: which world is loaded and the clip key it was built
     * under. See startReels. */
    this.loadedWorld = null;
    this.gpuInfo = null;
    /* Set by main.js; see setStickProbe. */
    this.stickProbe = null;
    /* Set by main.js; see setCraftProbe. */
    this.craftProbe = null;
    /* The machine and the browser, as far as Stick help's advice and the
     * stick rows care. Read once: neither changes under a running page.
     * See src/ui/stickhelp.js. */
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    this.stickPlatform = stickPlatform({
      userAgent: nav.userAgent,
      uaPlatform: nav.userAgentData && nav.userAgentData.platform,
      maxTouchPoints: nav.maxTouchPoints,
      coarse: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    });
    this.stickBrowser = stickBrowser(nav.userAgent);
    /* Whether this browser is one that does not show a radio to a page, and
     * the words for it, or null. Every surface that says "plug a radio in"
     * asks first: see radioBlind in src/ui/stickhelp.js. */
    this.radioBlind = radioBlind(this.stickPlatform, this.stickBrowser);
    /* What the help block under the bars was last built for, so it is
     * rebuilt only when that changes. See setStickHelp. */
    this.stickHelpKey = '';
    /* Set by main.js when a map fails to load; see bugSnapshot. */
    this.loadFailure = null;
    /* The gravity hint is shown at most once per page load even before the
     * localStorage flag is consulted, so a pilot who dismissed it and then
     * paused and resumed does not get it again on the way back into flight. */
    this.airHintDone = false;
    /* The same for flight feel tuning's card: see setAirSlider. */
    this.tuneHintDone = false;
    /* The airtime at which the card first went up, for its eight seconds. */
    this.airHintAtMs = null;
    this.ptrX = null;
    this.ptrY = null;
    /* The flight chips' fade: when this flight went into the air, when a
     * pointer last moved, and whether the class is on. See syncChipFade. */
    this.chipsAloftAt = null;
    this.chipsWokeAt = -Infinity;
    this.chipsQuiet = false;
    this.build();
    this.root.addEventListener('mousedown', (e) => {
      if (this.dropEl && !this.dropEl.contains(e.target) && !e.target.closest('.drop-btn')) {
        this.closeDrop();
      }
    });
    /* A pointer moving or landing anywhere but on a thumb stick brings the
     * chips back. A thumb flying a stick is not reaching for a chip, and on
     * a phone the thumbs never leave the glass, so the stick zones do not
     * count. Passive, and one comparison and at most one class write. */
    const wakeChips = (e) => {
      if (e.target && e.target.closest && e.target.closest('.touch-zone')) {
        return;
      }
      this.chipsWokeAt = performance.now();
      this.setChipsQuiet(false);
    };
    window.addEventListener('pointermove', wakeChips, { passive: true });
    window.addEventListener('pointerdown', wakeChips, { passive: true });
    this.show('title');
    this.bindWikiHash();
  }

  build() {
    const r = this.root;
    r.textContent = '';

    /* Flight overlay: the on screen display a pilot actually reads. */
    this.osd = el('div', 'osd');
    /* When the continuous readouts were last written: see OSD_NUMBERS_MS.
     * Far in the past, so the first frame of a flight writes them all. */
    this.osdNumbersAt = -1e9;
    this.osdClockAt = -1e9;
    /* The clock is a lap on the race field and an airtime in freestyle, and
     * an unlabelled number that means two different things is how a pilot
     * learns to distrust an instrument. */
    this.osdClockLabel = el('div', 'osd-label', 'Lap');
    this.osdTimer = el('div', 'osd-timer', '--.--');
    this.osdGate = el('div', 'osd-gate', '');
    this.osdBest = el('div', 'osd-best', '');
    this.osdLast = el('div', 'osd-best', '');
    /* The gap to the ghost, lit for a few seconds after each gate. Mint
     * when you are ahead of it, amber when it is ahead of you, the same
     * reading as everything else on this overlay: mint is the good news. */
    this.osdGhost = el('div', 'osd-ghost is-off', '');
    /* The label and the clock, and the last lap, the record and the ghost,
     * each in a wrapper of its own. On a desk the wrappers are plain blocks
     * and change nothing; on a phone the sheet lays each one out as a line,
     * so the clock ends high enough for the banner to hang under it. See
     * THE PHONE OSD in index.html. The bounce count rides that line too on
     * a phone, a second node off on a desk, because it is a count about the
     * run like the lap and the record, and in the pack's corner it pushed
     * the line into the middle of a 740 px phone. */
    const top = el('div', 'osd-top');
    const clock = el('div', 'osd-clock');
    clock.append(this.osdClockLabel, this.osdTimer);
    const records = el('div', 'osd-records');
    this.osdHitsTouch = el('div', 'osd-best osd-hits-touch', '');
    records.append(this.osdLast, this.osdBest, this.osdGhost, this.osdHitsTouch);
    top.append(clock, this.osdGate, records);
    this.osdPack = el('div', 'osd-value', '');
    this.osdPackBar = el('div', 'bar-fill');
    const packBar = el('div', 'bar');
    packBar.append(this.osdPackBar);
    const packBlock = el('div', 'osd-corner osd-left');
    /* The mode a second time, in the pack's line, for the phone: its top
     * left corner is the pack and the mode, and the top right is speed and
     * height up to Pause. Off on a desk, where the mode is under the speed. */
    this.osdFlightTouch = el('div', 'osd-sub osd-mode osd-mode-touch', '');
    packBlock.append(el('div', 'osd-label', 'Pack'), this.osdPack, packBar, this.osdFlightTouch);
    this.osdHits = el('div', 'osd-sub osd-hits', '');
    packBlock.append(this.osdHits);
    this.osdSpeed = el('div', 'osd-value', '');
    this.osdFlight = el('div', 'osd-sub osd-mode', '');
    this.osdLaunch = el('div', 'osd-launch is-off', '');
    /* The height as a number and two tails: the desk's "above the ground"
     * and the phone's "up", which fits beside the speed on a small phone
     * held sideways. The sheet shows one; only the number is written. */
    this.osdAlt = el('div', 'osd-sub', '');
    this.osdAltNum = el('span', '', '');
    this.osdAlt.append(this.osdAltNum, el('span', 'osd-alt-long', ' above the ground'), el('span', 'osd-alt-short', ' up'));
    this.osdThrBar = el('div', 'bar-fill warm');
    const thrBar = el('div', 'bar');
    thrBar.append(this.osdThrBar);
    const flightBlock = el('div', 'osd-corner osd-right');
    flightBlock.append(this.osdSpeed, this.osdFlight, this.osdAlt, el('div', 'osd-label', 'Throttle'), thrBar);
    const sticks = el('div', 'osd-sticks is-off');
    this.osdStickLeft = makeGimbal('Yaw, throttle');
    this.osdStickRight = makeGimbal('Roll, pitch');
    /*
     * BETWEEN THE GIMBALS, which is where the report that asked for it said
     * to put it. The container used to be hidden as a unit whenever a radio
     * was the stick source; now the two gimbals carry their own is-off and
     * the container is up whenever either half has something to show, which
     * for the gravity slider is every flight. A radio pilot therefore gets the
     * slider alone, centred, which is the case the report was filed from.
     */
    this.osdAir = makeWeightSlider({
      min: WEIGHT_MIN,
      max: weightMaxFor(this.settings.airframe),
      step: WEIGHT_STEP,
      value: this.settings.weight,
      label: 'Weight, how heavy the quad feels',
    });
    sticks.append(this.osdStickLeft.box, this.osdAir.box, this.osdStickRight.box);
    this.osdSticks = sticks;
    this.bindAirSlider();
    /* The crosshairs, at the centre of the canvas, which is the camera's
     * axis. Four arms and a dot, and the shape class says which of them
     * draw: see syncCrosshair and .osd-cross in index.html. */
    this.osdCross = el('div', 'osd-cross is-off');
    this.osdCross.append(el('i', 'xh-l'), el('i', 'xh-r'), el('i', 'xh-t'), el('i', 'xh-b'), el('i', 'xh-dot'));
    this.osdCrossShape = 'off';
    /* The FPS readout, counted in setOsd and shown by syncFps. */
    this.osdFps = el('div', 'osd-fps');
    this.osdFps.hidden = true;
    this.osdFpsFrames = 0;
    this.osdFpsAt = 0;
    this.osd.append(this.osdFps, this.osdCross, top, packBlock, flightBlock, sticks, this.osdLaunch, this.buildTargetLock());
    r.append(this.osd);

    /*
     * The freestyle score, in its own overlay beside the OSD rather than
     * inside it. Two reasons, and the second is the real one: the OSD is
     * dimmed as a whole when the run is paused, and a score that fades with
     * the instruments is fine, but the OSD is also hidden on every screen
     * that is not flight, and the score wants to survive into the results
     * screen. Keeping it a sibling means each is shown on its own terms.
     */
    this.scoreHud = new ScoreHud(r);

    /*
     * THE CHASE: the Tail meter and the chase callouts (src/ui/chasehud.js),
     * a layer of its own beside the score. Not behind the Scoring switch:
     * the chase is geometry, and geometry shows by default on a freestyle
     * map (FREESTYLE-MAPS-PLAN.md section 12, decision 2). Down until the
     * shell says the map has cars: see setChaseCars.
     */
    this.chaseHud = new ChaseHud(r);
    this.chaseCarsOn = false;

    /*
     * THE STF MARK, FOUND: a layer of its own beside the score, for the
     * score's reason. The OSD is dimmed and hidden as a unit and the score
     * is switched off with Scoring, and a found mark is a moment rather
     * than an instrument, shown whether or not the run is scored. Before
     * the screens, so a menu opened over it covers it. See stfFound.
     */
    this.stfLayer = el('div', 'stf-found');
    this.stfTimer = 0;
    r.append(this.stfLayer);
    /* The lettering on or off, before anything is called out: see
     * syncManga. The harness hooks, for the pictures the counter needs
     * before the scorer that feeds it exists: see installLetteringHooks. */
    this.letterHold = false;
    this.syncManga();
    this.installLetteringHooks();

    /* Centre banner: launch prompt, lap splits, crash notice, and the
     * stick calibration prompts, which have to read over a screen, so the
     * banner is appended after the screens rather than before. */
    this.banner = el('div', 'banner', '');
    /* And a notice on a menu screen, which is not the banner: see
     * setMenuNotice. */
    this.menuNotice = el('div', 'menu-notice', '');
    this.menuNotice.hidden = true;
    /*
     * THE ONE THING THAT SPEAKS.
     *
     * Every word this shell says in flight was written into an ordinary div:
     * the banner, the gate cue, the lap time, the results. The only
     * aria-live node in the file was the music dock's track title, so a
     * screen reader user heard the song change and not that the lap had
     * finished. This is one polite region, off screen, fed by setBanner and
     * by showResults, and it is deliberately the only one: two live regions
     * competing is worse than none, because the second interrupts the first.
     *
     * Off screen with a clip rather than display:none, because display:none
     * takes a node out of the accessibility tree entirely, which is the
     * mistake the old hidden hint lines made (deleted, MENUS-PLAN.md 1.42)
     * and this one must not repeat.
     */
    this.announcer = el('div', 'sr-only', '');
    this.announcer.setAttribute('aria-live', 'polite');
    this.announcer.setAttribute('aria-atomic', 'true');
    this.announcer.setAttribute('role', 'status');

    /*
     * THE FRAME. One status bar and one command bar, outside every screen,
     * so they occupy the same pixels whatever the pilot is looking at.
     *
     * Before this, the input legend was a per screen `hint` in a different
     * place on each one, the primary action was a row inside the list, and
     * nothing said which screen you were on or what you were about to fly.
     * The two bars are absolutely positioned and the screens are padded to
     * clear them by --bar-top and --bar-bot, so a bar can never render on
     * top of a row. See the token block in index.html.
     */
    this.frameTop = el('div', 'frame-top');
    this.crumb = el('div', 'crumb');
    this.frameContext = el('div', 'frame-context');
    this.frameGap = el('div', 'frame-gap');
    this.frameTop.append(this.crumb, this.frameGap, this.frameContext);

    this.frameBot = el('div', 'frame-bot');
    this.frameLegend = el('div', 'frame-legend');
    this.framePrimary = document.createElement('button');
    this.framePrimary.type = 'button';
    this.framePrimary.className = 'frame-primary';
    this.framePrimary.hidden = true;
    /* The bar's primary is bound to the SCREEN's declared primary action,
     * never to whatever row the cursor is on. A reviewer found the bug that
     * rule exists for: with the bar acting on the focused row, moving the
     * mouse toward the button crosses every row on the way and changes what
     * the button does before you reach it. */
    this.framePrimary.addEventListener('click', () => {
      const it = this.primaryItem();
      if (it && it.action) {
        this.act(it.action);
      }
    });
    this.frameBot.append(this.frameLegend, el('div', 'frame-gap'), this.framePrimary);
    r.append(this.frameTop, this.frameBot);
    /* A scroll anywhere in the shell can bring the primary row into sight or
     * take it out of it: see syncPrimaryButton. Captured, because a scroll
     * event does not bubble. One look per frame. */
    this.primaryFrame = 0;
    r.addEventListener('scroll', () => {
      if (!this.primaryFrame) {
        this.primaryFrame = requestAnimationFrame(() => {
          this.primaryFrame = 0;
          this.syncPrimaryButton();
        });
      }
    }, { capture: true, passive: true });

    /* Screens. */
    this.screens = {};

    const title = el('div', 'screen screen-title');
    const copy = el('div', 'title-copy');
    const brand = el('div', 'brand');
    this.brandSub = el('div', 'brand-sub', '');
    brand.append(wordmark(), this.brandSub);
    /* Beta notice. The only line on this screen that is about the
     * software rather than about flying, so it wears the amber an
     * instrument wears rather than the mint a record does, and it sits
     * directly under the wordmark: a pilot who is about to meet a bug
     * should have been told before the lap, not after it. It is not
     * dismissible, because the thing it warns about has not stopped
     * being true by the second visit.
     *
     * A CHIP NOW, NOT A SENTENCE (2026-09-26). The word is the part that
     * has to survive, which the short screen already knew; the sentence
     * cost the title two lines at every width and is the chip's hover
     * title and a screen reader's text instead. It shares a row with
     * Patreon, so both keep their place under the wordmark and the menu
     * gets the lines back. */
    const betaLine = 'Expect bugs and rough edges. It is still being built, and it will improve.';
    const beta = el('p', 'beta-note');
    const betaTag = el('span', 'beta-tag', 'Beta');
    betaTag.title = betaLine;
    beta.append(betaTag, el('span', 'sr-only', ` ${betaLine}`));
    const chips = el('div', 'brand-chips');
    chips.append(beta);
    brand.append(chips);
    /*
     * The support link lives HERE on the title, under the wordmark, because
     * the title hides the top bar and the command bar's right corner is
     * where a pilot does not look. The same node moves into the bars on
     * every other screen.
     */
    this.patreonSlot = el('div', 'brand-patreon');
    this.patreonLink = patreonAnchor();
    this.patreonSlot.append(this.patreonLink);
    chips.append(this.patreonSlot);
    this.titleBest = el('div', 'brand-best', '');
    brand.append(this.titleBest);
    /*
     * NO KEEP NOTE HERE ANY MORE. "Tracks you build stay in this browser"
     * was three lines on the front page, drawn with a freestyle map seated
     * too, where it said track, and it cost the title its last menu row:
     * lint:shell's 67 px. It is true and useful where a track is built or
     * chosen, so it is the Race room's Build a track note (KEEP_NOTE) and
     * the builder's own strip, which already said it.
     */
    /* First run only. */
    this.firstNote = el('p', 'keep-note first-note', 'A quad has no brakes and no wings. Point it where you want to go and push. Two minutes and you will be through a gate.');
    brand.append(this.firstNote);
    this.wikiTeaser = btn('wiki-teaser', 'Simulating FPV, for nerds');
    this.wikiTeaser.setAttribute('aria-label', 'Open the FPV wiki');
    this.wikiTeaser.addEventListener('click', () => this.act('wiki'));
    brand.append(this.wikiTeaser);
    const titleBlock = wrapMenu();
    this.titleMenu = titleBlock.menu;
    /*
     * The title's row list scrolls like every other list.
     *
     * index.html carries two `.screen-title .menu-scroll` height caps, one
     * for a narrow window and one for a short one, and neither had ever
     * applied to anything: this element never carried the class. So on a
     * 844 by 390 phone in landscape the list grew to 614 px inside a 318 px
     * box and Report bug, the last row, could not be reached by any amount
     * of scrolling. Every other menu in the shell adds this on the line
     * after it is built.
     */
    this.titleMenu.classList.add('menu-scroll');
    this.titleHelp = titleBlock.help;
    const titleFoot = el('div', 'title-foot');
    titleFoot.append(titleBlock.stage);
    /*
     * The gate's two cards.
     *
     * A third child of the copy column, and it is display:none in every
     * state but the gate, so the two child space-between contract the
     * other states rely on is untouched. It sits between the brand and the
     * foot because that is the middle of the column, which is the only
     * part of this screen with room in it: see the measurements in
     * PROGRESS.md.
     */
    this.gateCards = el('div', 'gate-cards');
    copy.append(brand, this.gateCards, titleFoot);
    this.craftCanvas = el('canvas', 'craft-view');
    this.craftCanvas.setAttribute('aria-hidden', 'true');
    title.append(copy);
    this.screens.title = title;

    /*
     * How to fly.
     *
     * A CONTROL YOU OPERATE, not an essay you skim. This screen used to be
     * two definition lists over a two hundred word centred paragraph. It was
     * accurate and nobody read it, and the product already owned the one
     * thing that teaches a stick: makeGimbal, the live gimbal pair the flight
     * overlay and the calibration screen both use. So the sticks here are
     * live. Press W on this screen and the left gimbal climbs, with the same
     * hold ramp the flight path uses, because it IS the flight path: main.js
     * feeds the same channels it feeds the quad.
     *
     * One half at a time. A keyboard pilot and a radio pilot need different
     * sentences and neither needs the other's, so the page has a source
     * switch and shows one column. Whichever the shell says is live is the
     * one it opens on.
     */
    const howto = el('div', 'screen screen-page screen-howto');
    howto.append(el('h2', null, 'How to fly'));
    /* ONE LINE (MENUS-PLAN.md 2.5). The gate colours went to the line under
     * the keys, with the rest of what a first run needs (see renderHowto). */
    howto.append(el('p', 'howto-lede', 'No brakes and no wings: to slow down or turn, point the quad somewhere else and push.'));

    const howtoTabs = el('div', 'howto-tabs');
    this.howtoTabs = {};
    /* The Touch tab exists only on a device with touch points, first in
     * the row because on that device it is the way this page's reader is
     * most likely holding the machine. */
    const tabList = [
      ...(touchWanted() ? [['touch', 'Touch']] : []),
      ['keyboard', 'Keyboard'], ['radio', 'Radio or gamepad'], ['launch', 'Launch control'],
    ];
    for (const [id, label] of tabList) {
      const b = btn('howto-tab', label);
      b.addEventListener('click', () => this.setHowtoSource(id));
      howtoTabs.append(b);
      this.howtoTabs[id] = b;
    }
    howto.append(howtoTabs);

    const howtoBody = el('div', 'howto-body');
    const rig = el('div', 'howto-rig');
    this.howtoStickLeft = makeGimbal('Yaw, throttle');
    this.howtoStickRight = makeGimbal('Roll, pitch');
    const sticksRow = el('div', 'howto-sticks');
    sticksRow.append(this.howtoStickLeft.box, this.howtoStickRight.box);
    this.howtoLive = el('div', 'howto-live', '');
    rig.append(sticksRow, this.howtoLive);
    this.howtoKeys = el('dl', 'howto-keys');
    howtoBody.append(rig, this.howtoKeys);
    howto.append(howtoBody);

    this.howtoMode = el('p', 'howto-mode', '');
    howto.append(this.howtoMode);
    const howtoWiki = btn('howto-wiki', 'Why this works: the FPV wiki');
    howtoWiki.addEventListener('click', () => this.act('wiki'));
    howto.append(howtoWiki);

    const howtoBlock = wrapMenu();
    this.howtoMenu = howtoBlock.menu;
    this.howtoHelp = howtoBlock.help;
    howto.append(howtoBlock.stage);
    this.screens.howto = howto;
    this.howtoSource = touchWanted() ? 'touch' : 'keyboard';
    this.renderHowto();

    /*
     * THE TRICK LIST, and it is the catalogue's own list rather than a
     * written one.
     *
     * Every row here is a PATTERN the recogniser actually matches, priced by
     * the workbook, described from its own steps and animated from them too.
     * Nothing on this screen is typed out by hand, so a trick cannot be
     * advertised that the game will not score, and a film cannot show a
     * shape the scorer does not want. See src/ui/trickfilm.js.
     */
    const tricks = el('div', 'screen screen-page screen-tricks');
    tricks.append(el('h2', null, 'Trick list'));
    tricks.append(el('p', 'rates-lede', 'Every trick the scorer is known to name, what it pays, and what it looks like. Pick one and watch it: the picture is drawn from the same definition the scorer matches against, so what you see is exactly what it is waiting for. Each one has been flown and scored in testing, which is what earns it a place here. Points are before the combo, which multiplies them.'));
    const trickStage = el('div', 'trick-stage');
    this.trickCanvas = el('canvas', 'trick-film');
    const trickSide = el('div', 'trick-side');
    this.trickName = el('div', 'trick-name', '');
    this.trickMeta = el('div', 'trick-meta', '');
    this.trickHow = el('p', 'trick-how', '');
    this.trickView = el('div', 'trick-view', '');
    trickSide.append(this.trickName, this.trickMeta, this.trickHow, this.trickView);
    trickStage.append(this.trickCanvas, trickSide);
    tricks.append(trickStage);
    const trickBlock = wrapMenu();
    this.trickMenu = trickBlock.menu;
    this.trickMenu.classList.add('menu-scroll');
    this.trickHelp = trickBlock.help;
    tricks.append(trickBlock.stage);
    this.screens.tricks = tricks;
    this.trickPlayer = new TrickFilmPlayer(this.trickCanvas);
    this.trickShown = '';

    /*
     * ABOUT: the credits roll, and every door to the people behind this.
     *
     * The rows come BEFORE the roll. Under it they were 1,540 px below the
     * window on arrival, Partners and Back both, which is what kept
     * lint:shell red (MENUS-PLAN.md 0.1); and since 2.1 this room also holds
     * the front page's old Support and FPV wiki rows, which have to be
     * findable without reading a page of thanks first. The roll is the
     * content, the rows are the furniture, and furniture goes by the door.
     */
    const credits = el('div', 'screen screen-page screen-credits');
    credits.append(el('h2', null, 'About'));
    credits.append(el('p', 'rates-lede', 'Who made this, whose work it stands on, and how to reach them.'));
    this.creditsRoll = el('div', 'credits-roll');
    fillCredits(this.creditsRoll, { assetBase: 'assets/credits' });
    const creditsBlock = wrapMenu();
    this.creditsMenu = creditsBlock.menu;
    this.creditsHelp = creditsBlock.help;
    credits.append(
      creditsBlock.stage,
      this.creditsRoll,
    );
    this.screens.credits = credits;

    /*
     * The map screen. Cards rather than a row of text, and each card plays a
     * short flight through the world it offers.
     *
     * WHY A SCREEN AND NOT A ROW. Choosing the map is the biggest choice a
     * player makes and it takes seconds to honour, and until now it was a
     * name on a menu row that you stepped through with the arrow keys: a
     * player who had never flown either one was choosing between the strings
     * "Track" and "Freestyle city". What a world is like is not
     * something a sentence gets across, so the cards show it.
     *
     * The thumbnail is a recorded loop of the title shot, not a live world.
     * The first visit that needs a card records 480p into IndexedDB; every
     * visit after that is a <video> element. Boot still does not fetch the
     * city (check 16). Opening this screen does not keep a second WebGL
     * copy of any world running, which is what a Steam Deck with other tabs
     * open actually survives.
     *
     * Custom map always opens a second card screen: fly the current
     * course, pick a published one from the board, or create / edit.
     * Create / edit is a third screen: edit the current map, or start a
     * new one, then the track builder page itself.
     */
    const courses = el('div', 'screen screen-page screen-maps screen-courses');
    courses.append(el('h2', null, 'Tracks'));
    /*
     * WHICH AIRCRAFT THIS LIST IS FOR, said out loud.
     *
     * The list is filtered to the seated machine, because a RaceGOW room and
     * a MultiGP field are not alternatives to each other: one of them puts a
     * five inch in a living room. But a filtered list with nothing saying it
     * is filtered reads as tracks having disappeared, and the fix somebody
     * reaches for then is republishing them.
     *
     * The line names the aircraft and says where the switch is, which is the
     * Quad room, one row from here on the title.
     */
    this.coursesLede = el('p', 'screen-lede', '');
    courses.append(this.coursesLede);
    /*
     * NO WORLD STRIP HERE, and the label is the reason.
     *
     * The audit's opening example was this screen: titled Tracks, opening
     * with a heading that said WORLDS, over four things that were not
     * tracks. The worlds moved to the Freestyle room and the strip stayed,
     * empty, with its label still drawn. So the complaint outlived the fix
     * by one element: a screen headed Tracks still said WORLDS above its
     * tracks, over nothing at all.
     *
     * mapCardHost is still built because the Freestyle room draws its cards
     * into it through the same renderMapCards; it just is not appended to
     * this screen.
     */
    this.mapCardHost = el('div', 'map-cards');
    this.courseStrip = el('div', 'card-strip');
    /* Most flown first, and all of them, which is what the strip holds now
     * that it is not capped at five. */
    /* Two groups, so the caption names both rather than describing one
       ordering that only ever applied to the board's half. Yours first
       because the track you were last working on is the one you came here
       to fly; the board's underneath, most flown first. */
    /*
     * THE ORDER IS A CONTROL, NOT A CAPTION. The label said "most flown
     * first" about a half the pilot could not reorder, so a pilot looking
     * for what was published this week had thirty cards to read. Three
     * chips, the board's own three orders in its words, and the choice is
     * remembered (settings.courseOrder). They are buttons, so Tab reaches
     * them; the arrow keys stay on the cards.
     */
    const stripHead = el('div', 'strip-head');
    stripHead.append(el('div', 'strip-label', 'Yours first, then the board'));
    this.courseOrderChips = el('div', 'strip-order');
    this.courseOrderChips.setAttribute('role', 'group');
    this.courseOrderChips.setAttribute('aria-label', "Order of the board's tracks");
    for (const [id, word] of COURSE_ORDERS) {
      const chip = el('button', 'order-chip', word);
      chip.type = 'button';
      chip.dataset.order = id;
      chip.addEventListener('click', () => {
        if (this.settings.courseOrder === id) {
          return;
        }
        this.settings.courseOrder = id;
        saveSettings(this.settings);
        if (this.onUiSound) {
          this.onUiSound('move');
        }
        this.renderMenu();
      });
      this.courseOrderChips.append(chip);
    }
    stripHead.append(this.courseOrderChips);
    this.courseStrip.append(stripHead);
    this.courseCardHost = el('div', 'map-cards course-cards');
    this.boardNote = el('div', 'board-note', '');
    this.courseStrip.append(this.courseCardHost, this.boardNote);
    const coursesBlock = wrapMenu();
    this.coursesMenu = coursesBlock.menu;
    this.coursesMenu.classList.add('menu-scroll');
    this.coursesHelp = coursesBlock.help;
    /* Kept, because choosing a card from the keys brings the whole of this
     * into view rather than one row of it. See revealCardList. */
    this.coursesStage = coursesBlock.stage;
    /* The chosen track's fastest pilots, in the sheet's first column, which
     * was empty: see paintPodium. */
    this.coursePodium = el('div', 'sheet-podium');
    this.coursePodium.hidden = true;
    this.coursePodium.setAttribute('aria-live', 'polite');
    this.coursesStage.prepend(this.coursePodium);
    this.podiumCache = new Map();
    courses.append(
      this.courseStrip,
      coursesBlock.stage,
    );
    /* A double click on a track flies it: see cardDoubleClick. The
     * capturing half forgets the last card press on every first press, so
     * a press on anything else in the room cannot leave one behind for a
     * later double click to find: a card's own handler, which runs after
     * this, writes it back when the press was on a card. */
    courses.addEventListener('click', (e) => {
      if (e.detail <= 1) {
        this.cardPress = null;
      }
    }, true);
    courses.addEventListener('dblclick', (e) => this.cardDoubleClick(e));
    this.screens.courses = courses;

    /* Freestyle. Same card machinery as Race, different contents, and no
     * publish cluster because nothing here is timed or posted. */
    const freestyle = el('div', 'screen screen-page screen-courses screen-freestyle');
    freestyle.append(el('h2', null, 'Maps'));
    /*
     * The lede used to end "Pick one and fly it", which was the instruction
     * for a screen that offered four worlds, and it said "no board", which
     * stopped being true when the freestyle high score table went up. Both
     * are fixed here rather than in a card: this is the room's own sentence
     * about what freestyle IS.
     */
    /* The lede promised a scored run, and scoring is no longer what a pilot
     * gets without asking for it. A front page that describes the thing
     * behind the door has to describe the door that is actually open: the
     * town and the quad, with the scoring named as a switch rather than as
     * the point. See DEFAULTS.freestyleScoring. */
    /* One line (MENUS-PLAN.md 2.5). What is counted, and that trick names
     * start off, is the Scoring row's note, which says it where the switch
     * is; the machine is the Quad row's. */
    freestyle.append(el('p', 'rates-lede', 'Open ground, no gates: the town, your map, or one from the board.'));
    this.freestyleCards = el('div', 'map-cards');
    /*
     * THE BOARD'S MAPS, the Race room's board strip for freestyle: the ten
     * newest maps published from the builder, under the two worlds that
     * are always here. A strip of their own rather than more cards in the
     * one above, because the cards above are the world cards, which record
     * a clip of each world, and a map from the board has a picture already:
     * its share card. See renderBoardMapCards.
     */
    this.boardMapStrip = el('div', 'card-strip');
    this.boardMapStrip.append(el('div', 'strip-label', 'From the board, newest first'));
    this.boardMapHost = el('div', 'map-cards course-cards board-map-cards');
    this.boardMapNote = el('div', 'board-note', '');
    this.boardMapStrip.append(this.boardMapHost, this.boardMapNote);
    const freestyleBlock = wrapMenu();
    this.freestyleMenu = freestyleBlock.menu;
    this.freestyleMenu.classList.add('menu-scroll');
    this.freestyleHelp = freestyleBlock.help;
    freestyle.append(this.freestyleCards, this.boardMapStrip, freestyleBlock.stage);
    this.screens.freestyle = freestyle;

    /*
     * QUAD, and PILOT, which were one screen called Settings.
     *
     * Thirty rows in one undivided scroll, in an order that grew rather
     * than was chosen: a pilot's name next to a PID editor next to a
     * binaural tone. Headings helped and did not fix it, because the list
     * was two lists. The rule that separates them is what a change
     * SURVIVES. Rates survive changing the quad but are the pilot's, so
     * they are Pilot. The tune, the PIDs and the firmware survive changing
     * the pilot, so they are Quad. Graphics and sound survive both, so they
     * are neither and sit at the bottom of Pilot as a leaf. Laps, pack
     * charge and flight model survive nothing, they define the run, so they
     * are the launch card below.
     *
     * Camera is the one deliberate exception to the rule: it survives both,
     * and it stays in Quad anyway because it is bolted to the airframe and
     * changes what a yaw does to the picture.
     *
     * The airframe showcase moves here with the machine. It was posing a
     * quad above a list of the pilot's sound levels.
     */
    const quad = el('div', 'screen screen-page screen-quad');
    quad.append(el('h2', null, 'Quad'));
    quad.append(el('p', 'rates-lede', 'The aircraft, its tune, the camera and how it flies.'));
    const quadBlock = wrapMenu();
    this.quadMenu = quadBlock.menu;
    this.quadMenu.classList.add('menu-scroll');
    this.quadHelp = quadBlock.help;
    this.craftQuadFrame = el('div', 'craft-showcase-frame');
    this.craftQuadFrame.append(this.craftCanvas);
    this.craftCaption = el('div', 'craft-showcase-cap', 'Acro. Sticks are rates. Hands off holds.');
    const quadShowcase = el('div', 'craft-showcase');
    quadShowcase.append(this.craftQuadFrame, this.craftCaption);
    quadBlock.stage.prepend(quadShowcase);
    quad.append(quadBlock.stage);
    this.screens.quad = quad;

    const pilot = el('div', 'screen screen-page screen-pilot');
    pilot.append(el('h2', null, 'Settings'));
    pilot.append(el('p', 'rates-lede', 'You, your radio and your rates, the picture and the sound.'));
    const pilotBlock = wrapMenu();
    this.pilotMenu = pilotBlock.menu;
    this.pilotMenu.classList.add('menu-scroll');
    this.pilotHelp = pilotBlock.help;
    pilot.append(pilotBlock.stage);
    this.screens.pilot = pilot;

    /*
     * ADVANCED, one door down from Settings (MENUS-PLAN.md 2.3).
     *
     * Settings had grown back to 33 stops, past the 30 that split it from
     * Quad on 28 August, and nine of them were the render pipeline's knobs
     * and the flight log: rows a pilot touches when something is wrong, and
     * whose own notes say Auto handles them otherwise. A pilot looking for
     * Volume scrolled past Frame pacing to find it. They live here now,
     * under the same Settings styling, with Escape back to Settings.
     */
    const advanced = el('div', 'screen screen-page screen-pilot screen-advanced');
    advanced.append(el('h2', null, 'Advanced'));
    advanced.append(el('p', 'rates-lede', 'For when something is wrong. Auto suits most machines.'));
    const advancedBlock = wrapMenu();
    this.advancedMenu = advancedBlock.menu;
    this.advancedMenu.classList.add('menu-scroll');
    this.advancedHelp = advancedBlock.help;
    advanced.append(advancedBlock.stage);
    this.screens.advanced = advanced;

    /*
     * STANDINGS: the board, in the game.
     *
     * "Open the board" was two problems in one row. It is jargon, so it
     * meant nothing to somebody who had never seen the board; and it LEFT,
     * to a page whose own way back reloads the simulator at the title and
     * throws away whatever was seated. A player who wanted to know what the
     * record was had to quit the game to find out.
     *
     * Everything that page shows about a track, the times and who flew
     * them, comes from an endpoint this shell already calls for the ghost
     * picker. So it is a screen here, and the web page stays as one honest
     * link for sending somebody rather than as the only way to see a time.
     */
    const standings = el('div', 'screen screen-page screen-standings');
    standings.append(el('h2', null, 'Standings'));
    this.standingsLede = el('p', 'rates-lede', '');
    standings.append(this.standingsLede);
    this.standingsTable = el('div', 'standings-table');
    const standingsBlock = wrapMenu();
    this.standingsMenu = standingsBlock.menu;
    this.standingsMenu.classList.add('menu-scroll');
    this.standingsHelp = standingsBlock.help;
    standingsBlock.stage.prepend(this.standingsTable);
    standings.append(standingsBlock.stage);
    this.screens.standings = standings;

    /*
     * THE LAUNCH CARD: the room the first design of this was missing.
     *
     * main.js latches runVoltage, runStyle and runLaps at run start, and
     * recordKey() hashes the config text, the pack voltage and the flight
     * style into one personal-best key. So laps, pack charge and flight
     * model are not settings a pilot carries around, they are properties of
     * the RUN: they are what a lap time means. Filing them under Quad or
     * Pilot put them in a room where neither was true, and produced a
     * concrete failure: a pilot sets Arcade because "the ideal quad" reads
     * like a better quad, beats their best by two seconds, and only the
     * results screen tells them it does not count.
     *
     * They are not a fifth room. They are the content of the moment before
     * you launch, which is exactly where a pilot wants to see them, and the
     * sentence in the help column is the record key rendered in English.
     *
     * Racing only. Freestyle has no clock, no lap, no ghost and no board,
     * so asking would be ceremony, and it already carries its own arcade
     * readout for the one flag that does change a freestyle flight.
     */
    const launch = el('div', 'screen screen-page screen-launch');
    launch.append(el('h2', null, 'Before you fly'));
    this.launchLede = el('p', 'rates-lede', '');
    launch.append(this.launchLede);
    const launchBlock = wrapMenu();
    this.launchMenu = launchBlock.menu;
    this.launchMenu.classList.add('menu-scroll');
    this.launchHelp = launchBlock.help;
    launch.append(launchBlock.stage);
    this.screens.launch = launch;

    /*
     * Rates.
     *
     * A PICTURE AND A RATEPROFILE, where there used to be a whole Betaflight
     * Configurator. The old flight-controller screen offered eight tabs, a
     * few hundred editable firmware keys, a raw CLI textarea and a file drop
     * that would flash any dump the pilot could find. It was accurate and it
     * was unusable, and none of it was the thing a pilot actually changes.
     * Rates are. So the tune is two named choices on the menus that already
     * carried it, and everything a pilot sets by hand is here: the rates
     * type, three numbers per axis, and the throttle limit. That is
     * Configurator's Rates tab and nothing else from it.
     *
     * The curve is the point. "670 deg/s" means nothing until you can see
     * that a quarter of stick is 55 of it; the graph and the readout beside
     * it are the same numbers Betaflight's own curve will fly, drawn from
     * src/fc/ratescurve.js. The dots on it are the live sticks.
     */
    const rates = el('div', 'screen screen-page screen-rates');
    rates.append(el('h2', null, 'Rates'));
    rates.append(el(
      'p',
      'rates-lede',
      /* One line (MENUS-PLAN.md 2.5). The five systems are the Rates type
       * row's note, and what a key race does with the curve is the keyboard
       * Stick path row's. */
      'How far the sticks turn the quad. They stay when you switch tunes.',
    ));
    this.ratesPanel = mountRatesPanel();
    const ratesBlock = wrapMenu();
    this.ratesMenu = ratesBlock.menu;
    this.ratesMenu.classList.add('menu-scroll');
    this.ratesHelp = ratesBlock.help;
    /* Into the stage's first column, the same seat the quad takes on
     * Settings. The three column grid is what keeps the rows in the middle
     * of the window whatever is beside them. */
    ratesBlock.stage.prepend(this.ratesPanel.root);
    rates.append(ratesBlock.stage);
    this.screens.rates = rates;

    /*
     * PIDs.
     *
     * THE HALF OF THE FLIGHT-CONTROLLER SCREEN THAT WAS MISSED. Removing
     * the Configurator homage was right, and then a beta tester reported
     * the two shipped tunes floppy and said they used to push the PIDs to
     * 200-300 percent, which is exactly the control the removal took away.
     * So this is that control at the Rates screen's size: Betaflight's own
     * tuning sliders on whichever tune is loaded, an expert table for
     * setting PIDs directly, and nowhere to paste a CLI dump. The sliders
     * are the firmware's simplified_* keys and a real `simplified_tuning
     * apply`; the panel beside the rows draws the values read back OUT of
     * the running module, so what is on this screen is what is flying.
     */
    const pids = el('div', 'screen screen-page screen-rates screen-pids');
    pids.append(el('h2', null, 'Tune'));
    pids.append(el(
      'p',
      'rates-lede',
      /* One line (MENUS-PLAN.md 2.5). What each slider does is its row's
       * note, the master multiplier's included. */
      'How hard the flight controller works. Kept for each tune.',
    ));
    this.pidsPanel = mountPidsPanel();
    const pidsBlock = wrapMenu();
    this.pidsMenu = pidsBlock.menu;
    this.pidsMenu.classList.add('menu-scroll');
    this.pidsHelp = pidsBlock.help;
    pidsBlock.stage.prepend(this.pidsPanel.root);
    pids.append(pidsBlock.stage);
    this.screens.pids = pids;

    /*
     * The flight controller, restored. Configurator 10.10 chrome: yellow
     * header, dark left tab rail, PID Tuning pages across the top of the
     * work area, a status strip along the bottom. What did NOT come back
     * from the first version: the CLI tab, its textarea, and the
     * drop-a-diff import. Text leaves through Export; none comes in.
     */
    const fc = el('div', 'screen screen-page screen-fc');
    const fcHead = el('div', 'fc-head');
    const fcBrand = el('div', 'fc-brand');
    fcBrand.append(el('span', 'fc-wordmark', 'BETAFLIGHT'));
    fcBrand.append(el('span', 'fc-fw', '4.5.1'));
    fcBrand.append(el('span', 'fc-conn', 'WASM'));
    this.fcDirty = el('span', 'fc-dirty', '');
    fcBrand.append(this.fcDirty);
    fcHead.append(fcBrand);
    const homage = el('p', 'fc-homage');
    const cfgLink = el('a', null, 'Betaflight Configurator');
    cfgLink.href = 'https://github.com/betaflight/betaflight-configurator';
    cfgLink.target = '_blank';
    cfgLink.rel = 'noopener noreferrer';
    const bfLink = el('a', null, 'Betaflight');
    bfLink.href = 'https://github.com/betaflight/betaflight';
    bfLink.target = '_blank';
    bfLink.rel = 'noopener noreferrer';
    homage.append(
      document.createTextNode('Homage of '),
      cfgLink,
      document.createTextNode(' 10.10 colours and tabs, not that app. No Vue, no MSP, no iframe, no CLI paste. Firmware is compiled '),
      bfLink,
      document.createTextNode(' 4.5.1. With thanks to the Betaflight developers. GPLv3.'),
    );
    fcHead.append(homage);
    const fcExit = el('div', 'fc-exit');
    this.fcSaveExit = btn('fc-exit-btn fc-exit-save', 'Save and exit');
    this.fcSaveExit.addEventListener('click', (e) => {
      e.stopPropagation();
      this.act('fc-save-exit');
    });
    this.fcLeave = btn('fc-exit-btn fc-exit-leave', 'Exit without saving');
    this.fcLeave.addEventListener('click', (e) => {
      e.stopPropagation();
      this.act('fc-back');
    });
    const fcExitHint = el('div', 'fc-exit-hint');
    fcExitHint.append(el('kbd', null, 'Esc'));
    this.fcExitCopy = el('span', 'fc-exit-copy', 'exits without saving');
    fcExitHint.append(this.fcExitCopy);
    fcExit.append(this.fcSaveExit, this.fcLeave, fcExitHint);
    this.fcExit = fcExit;
    const fcBody = el('div', 'fc-body');
    this.fcTabs = el('nav', 'fc-tabs');
    this.fcTabs.setAttribute('aria-label', 'Configurator tabs');
    const fcWork = el('div', 'fc-work');
    this.fcPages = el('div', 'fc-pages');
    this.fcPages.setAttribute('aria-label', 'PID Tuning pages');
    this.fcPages.hidden = true;
    const fcBlock = wrapMenu();
    this.fcMenu = fcBlock.menu;
    this.fcMenu.classList.add('menu-scroll');
    this.fcHelp = fcBlock.help;
    this.fcAttitude = el('canvas', 'fc-attitude');
    this.fcAttitude.width = 220;
    this.fcAttitude.height = 220;
    this.fcAttitude.setAttribute('aria-label', 'Attitude');
    this.fcAttitude.hidden = true;
    fcWork.append(this.fcPages, fcBlock.stage, this.fcAttitude);
    fcBody.append(this.fcTabs, fcWork);
    const fcStatus = el('div', 'fc-status', 'Connected: WASM  ·  Betaflight 4.5.1  ·  PID 1 kHz  ·  Profile 0  ·  Homage of Configurator 10.10, not that app');
    fc.append(fcHead, fcExit, fcBody, fcStatus);
    this.screens.fc = fc;

    const calibrate = el('div', 'screen screen-page screen-calibrate');
    calibrate.append(el('h2', null, 'Calibrate sticks'));
    this.calKicker = el('div', 'cal-kicker', '');
    this.calPrompt = el('p', 'cal-prompt', '');
    this.calHint = el('p', 'cal-hint', '');
    const calSticks = el('div', 'cal-sticks');
    this.calStickLeft = makeGimbal('Yaw, throttle');
    this.calStickRight = makeGimbal('Roll, pitch');
    calSticks.append(this.calStickLeft.box, this.calStickRight.box);
    /*
     * THE RAW AXES, BECAUSE THE GIMBALS ABOVE CANNOT SHOW AN AXIS THEY HAVE
     * NOT LEARNED ABOUT YET.
     *
     * Two gimbals are four channels, and which four axes those are is the
     * question this whole screen exists to answer. A pilot whose yaw sits
     * on axis 5 moved their yaw stick on the full range step and watched
     * nothing move, and filed it. This strip has no opinion: one cell per
     * axis, the live value as a dot, the travel seen so far as a bar behind
     * it, mint once a channel has claimed it. See calibrationView.
     */
    this.calAxes = el('div', 'cal-axes');
    this.calAxisCells = [];
    this.calList = el('ol', 'cal-steps');
    const calBtns = el('div', 'cal-actions');
    this.calCancelBtn = btn('name-dialog-btn', 'Cancel');
    /* Only ever shown on the menu switch step, and only a radio reporting
     * no buttons is asked that. See skipCalibrationSelect in input.js. */
    this.calSkipBtn = btn('name-dialog-btn', 'No switch, skip');
    this.calSkipBtn.hidden = true;
    /* Only on the check step, and only when the throttle is reading high
     * enough to fly the quad with nobody touching it. See zeroThrottleHere
     * in input.js for the radio this exists for. */
    this.calZeroBtn = btn('name-dialog-btn', 'Throttle zero is here');
    this.calZeroBtn.hidden = true;
    /*
     * REVERSE THE CHANNEL UNDER THEIR THUMB, and the label names it rather
     * than saying Reverse, because the whole trick of this control is that
     * the pilot never has to choose from a list: whatever they are moving
     * is what the button is about. See movingChannel in input.js.
     */
    this.calRevBtn = btn('name-dialog-btn', 'Reverse');
    this.calRevBtn.hidden = true;
    /* Only on the check step, where the two drawn gimbals are captioned
     * and a pilot can see that they are on the wrong hands. */
    this.calModeBtn = btn('name-dialog-btn', 'Swap stick mode');
    this.calModeBtn.hidden = true;
    this.calSaveBtn = btn('name-dialog-btn on', 'Save mapping');
    this.calSaveBtn.disabled = true;
    this.calCancelBtn.addEventListener('click', () => this.act('calibrate-cancel'));
    this.calSkipBtn.addEventListener('click', () => this.act('calibrate-skip'));
    this.calZeroBtn.addEventListener('click', () => this.act('calibrate-zero-throttle'));
    this.calRevBtn.addEventListener('click', () => this.act('calibrate-reverse'));
    this.calModeBtn.addEventListener('click', () => this.act('calibrate-stick-mode'));
    this.calSaveBtn.addEventListener('click', () => this.act('calibrate-save'));
    calBtns.append(
      this.calCancelBtn, this.calSkipBtn, this.calZeroBtn,
      this.calRevBtn, this.calModeBtn, this.calSaveBtn,
    );
    calibrate.append(
      this.calKicker,
      this.calPrompt,
      this.calHint,
      calSticks,
      this.calAxes,
      this.calList,
      calBtns,
    );
    this.screens.calibrate = calibrate;
    this.calCanSave = false;
    this.calCanSkip = false;

    /*
     * STICK HELP. A stick that does nothing, and the one question that tells
     * where it is lost: move it, does any bar move? See src/ui/stickhelp.js
     * for the argument and every sentence, and STICK HELP in
     * src/input/input.js for what is watched.
     *
     * The strip is the calibrate screen's, the same cells in the same
     * classes painted by the same function, with the channel each axis is
     * read as written under it, because "the sim reads this axis as yaw" is
     * the thing this screen has to show and the calibrate screen does not.
     * It is a room with rows, unlike the calibrate screen, so a radio pilot
     * can leave it and the shell check walks it.
     */
    const stickhelp = el('div', 'screen screen-page screen-stickhelp');
    stickhelp.append(el('h2', null, 'Stick help'));
    stickhelp.append(el(
      'p',
      'stickhelp-lede',
      /* One line (MENUS-PLAN.md 2.5). What a moving bar means is the line
       * under the bars, which says it about the bar that moved. */
      'Move the stick that is not working to each end, and watch its bar.',
    ));
    this.stickAxes = el('div', 'cal-axes stickhelp-axes');
    this.stickAxisCells = [];
    this.stickSay = el('p', 'stickhelp-say', '');
    this.stickSay.setAttribute('aria-live', 'polite');
    this.stickPad = el('p', 'stickhelp-pad', '');
    this.stickSteps = el('div', 'stickhelp-steps');
    const stickBlock = wrapMenu();
    this.stickHelpMenu = stickBlock.menu;
    this.stickHelpHelp = stickBlock.help;
    stickhelp.append(
      this.stickPad,
      this.stickAxes,
      this.stickSay,
      this.stickSteps,
      stickBlock.stage,
    );
    this.screens.stickhelp = stickhelp;

    const padpick = el('div', 'screen screen-page screen-padpick');
    padpick.append(el('h2', null, 'Choose joystick'));
    this.padKicker = el('div', 'cal-kicker', 'Which device');
    this.padPrompt = el('p', 'cal-prompt', 'Move the joystick you want to fly with.');
    this.padHint = el('p', 'cal-hint', '');
    this.padCards = el('div', 'pad-cards');
    const padBtns = el('div', 'cal-actions pad-actions');
    this.padYesBtn = btn('name-dialog-btn on', 'Yes, use this');
    this.padNoBtn = btn('name-dialog-btn', 'No, not this one');
    this.padSkipBtn = btn('name-dialog-btn', 'Use keyboard instead');
    this.padYesBtn.addEventListener('click', () => this.act('padpick-yes'));
    this.padNoBtn.addEventListener('click', () => this.act('padpick-no'));
    this.padSkipBtn.addEventListener('click', () => {
      this.act(this.padPickReason === 'menu' ? 'padpick-cancel' : 'padpick-skip');
    });
    padBtns.append(this.padYesBtn, this.padNoBtn, this.padSkipBtn);
    padpick.append(
      this.padKicker,
      this.padPrompt,
      this.padHint,
      this.padCards,
      padBtns,
    );
    this.screens.padpick = padpick;
    this.padCardNodes = new Map();
    this.padInfo = { count: 0, using: 'Keyboard' };
    this.padPickReason = 'boot';
    this.padPickPhase = 'wiggle';

    /* screen-paused names it for the checks, which find a screen's list by
     * its class: without it the shell walk measured nothing here. */
    const paused = el('div', 'screen screen-modal screen-paused');
    paused.append(el('h2', null, 'Paused'));
    const pausedBlock = wrapMenu();
    this.pausedMenu = pausedBlock.menu;
    this.pausedHelp = pausedBlock.help;
    paused.append(pausedBlock.stage);
    this.screens.paused = paused;

    const results = el('div', 'screen screen-results');
    const resultsCopy = el('div', 'results-copy');
    const resultsTop = el('div', 'results-top');
    this.resultsKicker = el('div', 'results-kicker', '');
    this.resultsHead = el('h2', 'results-head', 'Run complete');
    this.resultsHero = el('div', 'results-hero');
    this.resultsHeroCap = el('div', 'results-hero-cap', 'Best lap');
    this.resultsHeroTime = el('div', 'results-hero-time', '');
    this.resultsHeroMeta = el('div', 'results-hero-meta', '');
    this.resultsHero.append(this.resultsHeroCap, this.resultsHeroTime, this.resultsHeroMeta);
    this.resultsBody = el('div', 'results');
    this.resultsNote = el('p', 'results-note', '');
    resultsTop.append(
      this.resultsKicker,
      this.resultsHead,
      this.resultsHero,
      this.resultsBody,
      this.resultsNote,
    );
    /* The course that lap was flown on, drawn the way the board and the
     * builder draw it. A result read on a screen that never shows the shape
     * of the course is a number without its subject. */
    this.resultsPlanWrap = el('div', 'results-plan');
    this.resultsPlan = planCanvas(null, 'Track plan');
    this.resultsPlanWrap.append(this.resultsPlan);
    resultsTop.append(this.resultsPlanWrap);
    const resultsBlock = wrapMenu();
    this.resultsMenu = resultsBlock.menu;
    this.resultsHelp = resultsBlock.help;
    const resultsFoot = el('div', 'results-foot');
    resultsFoot.append(resultsBlock.stage);
    resultsCopy.append(resultsTop, resultsFoot);
    results.append(resultsCopy);
    /*
     * THE MANGA PAGE (FREESTYLE-MAPS-PLAN.md section 3.2 item 6): a freestyle
     * run's results as three to five panels, down the open side of the
     * screen where a race shows its course. One canvas, drawn when the
     * results are shown and when the window changes size; its accessible
     * name is the page in words. See showMangaPage and src/ui/mangapage.js.
     */
    this.resultsManga = el('div', 'results-manga');
    this.resultsManga.hidden = true;
    this.resultsMangaCanvas = el('canvas', 'results-manga-page');
    this.resultsMangaCanvas.setAttribute('role', 'img');
    this.resultsManga.append(this.resultsMangaCanvas);
    results.append(this.resultsManga);
    this.mangaPanels = [];
    this.mangaStf = null;
    this.mangaTimer = 0;
    window.addEventListener('resize', () => {
      if (this.screen !== 'results' || !this.mangaPanels.length) {
        return;
      }
      clearTimeout(this.mangaTimer);
      this.mangaTimer = setTimeout(() => this.paintMangaPage(), 150);
    });
    this.screens.results = results;

    this.nameDialog = el('div', 'name-dialog');
    this.nameDialog.hidden = true;
    this.nameDialog.setAttribute('aria-modal', 'true');
    this.nameDialog.setAttribute('role', 'dialog');

    /*
     * REPORT BUG, AND WHERE IT IS NOT.
     *
     * This chip was removed whole and that went too far. The ask was about
     * one screen: the picture that came with it was the title with the
     * three cards on it, and a floating button over the first thing a
     * visitor sees is what was wrong with it. Everywhere else it is the
     * only thing on screen that says how to tell somebody a thing is
     * broken, and taking it off every screen left F8, which a phone does
     * not have.
     *
     * So it is back, and it is hidden on the title. The title is the one
     * screen whose whole job is a first impression, it is the screen the
     * report was about, and it is one press from any screen that has the
     * chip on it.
     */
    this.bugChip = btn('bug-chip', 'Report bug, give feedback');
    this.bugChip.title = 'F8 also opens this.';
    this.bugChip.addEventListener('click', () => this.openBugReport());

    /*
     * PAUSE, for a pointer.
     *
     * A phone has had this button since the thumb sticks shipped, mounted
     * by src/input/touchsticks.js, and a mouse has never had one: the only
     * way out of a flight was the Escape key. That is fine if you know it
     * and invisible if you do not, and the room a pilot wants is usually
     * behind it, because Paused is where Quit to title lives and the title
     * is where a map is chosen. Reported as being stuck in a freestyle map
     * with no way back to a race one.
     *
     * The same two calls the Escape key and the thumb button both make, so
     * there is one way to pause and three ways to ask for it. It hides
     * itself when the thumb sticks are up, because that overlay brings its
     * own and two Pause buttons in one corner is worse than none.
     */
    this.pauseChip = btn('bug-chip pause-chip', 'Pause');
    this.pauseChip.title = 'Escape also pauses.';
    this.pauseChip.addEventListener('click', () => {
      if (this.screen !== 'flight') {
        return;
      }
      this.act('pause');
      this.show('paused');
    });

    this.musicDock = el('div', 'music-dock');
    this.musicDock.setAttribute('role', 'group');
    this.musicDock.setAttribute('aria-label', 'Music');
    this.musicPrev = btn('music-skip', '‹');
    this.musicPrev.setAttribute('aria-label', 'Previous track');
    this.musicPrev.tabIndex = -1;
    this.musicNext = btn('music-skip', '›');
    this.musicNext.setAttribute('aria-label', 'Next track');
    this.musicNext.tabIndex = -1;
    /*
     * THE NAME IS THE MUTE, because the dock is already the shape of the
     * control: a chevron, a thing, a chevron. Every media widget anybody
     * has used puts skip on the arrows and the state of the sound in the
     * middle, and this one had the arrows wired and a label in the middle
     * that did nothing. Asked for as "if i click on the music selector, in
     * the middle it mutes".
     *
     * A button rather than a div with a listener, so it has the cursor,
     * the hit box and the role without any of the three being written by
     * hand. tabIndex -1 like the two skips beside it: these are pointer
     * affordances over the world, and a menu whose arrow keys wander into
     * the corner of the screen is worse than a dock nobody can tab to. The
     * keyboard's route to the same setting is the Music row under Pilot.
     *
     * aria-live stays on it and the text stays the track's name, so the
     * name is still what is announced when the bed moves on. What the
     * click does is in the title attribute, which the name needed anyway
     * because it ellipsises at 11em.
     */
    this.musicTitle = btn('music-title', this.musicNow.name);
    this.musicTitle.setAttribute('aria-live', 'polite');
    this.musicTitle.tabIndex = -1;
    this.musicDock.append(this.musicPrev, this.musicTitle, this.musicNext);
    const keepFocusOff = (e) => e.preventDefault();
    this.musicPrev.addEventListener('mousedown', keepFocusOff);
    this.musicNext.addEventListener('mousedown', keepFocusOff);
    this.musicTitle.addEventListener('mousedown', keepFocusOff);
    this.musicTitle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMusicMute();
    });
    this.musicPrev.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.skipMusic(-1);
    });
    this.musicNext.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.skipMusic(1);
    });

    for (const s of Object.values(this.screens)) {
      s.style.display = 'none';
      r.append(s);
    }
    r.append(this.announcer, this.banner, this.menuNotice, this.bugChip, this.pauseChip, this.musicDock, this.nameDialog);
    this.syncChips();
  }

  setSharedMap(map) {
    this.sharedMap = map
      ? { id: map.id, name: map.name, author: map.author || '', board: map.board || '' }
      : null;
  }

  setShare(share) {
    this.share = share || null;
    this.timePosted = null;
    if (this.screen === 'title' || this.screen === 'courses' || this.screen === 'results') {
      this.renderMenu();
    }
  }

  setGhostRow(row) {
    this.ghostRow = row || null;
    if (this.screen === 'title' || this.screen === 'paused') {
      this.renderMenu();
    }
  }

  /* The Ghost row where the shell has provided one, as an array so the two
   * menus that carry it can spread it in place. Cycling steps through off,
   * the session ghosts, and whatever the board holds for this course. */
  ghostItems() {
    if (!this.ghostRow) {
      return [];
    }
    return [{
      label: 'Ghost',
      value: this.ghostRow.value,
      note: this.ghostRow.note,
      adjust: (d) => {
        if (this.ghostRow) {
          this.ghostRow.cycle(d);
        }
      },
    }];
  }

  markTimePosted(posted) {
    this.timePosted = posted || { ok: true };
    if (this.screen === 'title' || this.screen === 'results') {
      this.renderMenu();
    }
  }

  markCoursePublished(posted) {
    this.coursePublished = posted || { ok: true };
    if (this.screen === 'title' || this.screen === 'results' || this.screen === 'courses') {
      this.renderMenu();
    }
  }

  /*
   * Typed fields. The stick menu cannot enter a name, so this is a small
   * overlay. Resolves to a map of field keys, or null if they cancel.
   */
  askForm({ title, detail, confirmLabel, fields } = {}) {
    if (this.nameWait) {
      this.closeNameDialog(null);
    }
    const list = Array.isArray(fields) && fields.length
      ? fields
      : [{
        key: 'name',
        label: '',
        value: readPilotName() || '',
        maxLength: 24,
        placeholder: 'Name',
        rules: nameRules(),
        save: writePilotName,
      }];
    return new Promise((resolve) => {
      this.nameWait = resolve;
      const box = el('div', 'name-dialog-box');
      box.append(el('h2', null, title || 'Your name'));
      if (detail) {
        box.append(el('p', 'lede', detail));
      }
      const inputs = [];
      const err = el('p', 'name-dialog-err', '');
      for (const spec of list) {
        if (spec.label) {
          box.append(el('p', 'name-dialog-label', spec.label));
        }
        if (spec.rules) {
          box.append(el('p', 'lede', spec.rules));
        }
        const field = document.createElement('input');
        field.type = 'text';
        field.className = 'name-dialog-input';
        field.maxLength = spec.maxLength || 80;
        field.autocomplete = spec.autocomplete || 'off';
        field.value = spec.value || '';
        field.placeholder = spec.placeholder || spec.label || '';
        field.dataset.key = spec.key;
        box.append(field);
        /*
         * ANOTHER SPELLING OF A NAME ALREADY ON THE BOARD (MENUS-PLAN.md
         * 3.4). The board shows names that differ only by case, spaces,
         * dots, hyphens or underscores as one pilot, and stores them as
         * typed; a pilot who posts as "asylum fpv" beside "AsylumFPV" is
         * told so here, before they post, and can take the spelling that is
         * there with one press. `known` may be a promise: the post flow
         * opens the dialog first and asks the board while the pilot types.
         */
        if (spec.known) {
          const hint = el('p', 'name-dialog-hint', '');
          hint.hidden = true;
          box.append(hint);
          let known = [];
          const fold = (v) => String(v || '').toLowerCase().replace(/[\s._-]+/g, '');
          const check = () => {
            const typed = field.value.trim();
            const f = fold(typed);
            const hit = f ? known.find((k) => fold(k) === f && k !== typed) : null;
            hint.hidden = !hit;
            hint.textContent = '';
            if (hit) {
              const use = btn('name-dialog-use', hit);
              use.title = `Use ${hit}`;
              use.addEventListener('click', () => {
                field.value = hit;
                check();
                field.focus();
              });
              hint.append('This track\'s board already has ', use,
                '. If that is you, use the same spelling, so your times sit under one name.');
            }
          };
          field.addEventListener('input', check);
          Promise.resolve(spec.known).then((list) => {
            known = Array.isArray(list) ? [...new Set(list.filter(Boolean).map(String))] : [];
            check();
          }).catch(() => {});
        }
        inputs.push({ spec, field });
      }
      const row = el('div', 'name-dialog-row');
      const save = btn('name-dialog-btn on', confirmLabel || 'Save');
      const cancel = btn('name-dialog-btn', 'Cancel');
      row.append(save, cancel);
      box.append(err, row);
      this.nameDialog.textContent = '';
      this.nameDialog.append(box);
      this.nameDialog.hidden = false;
      const readValues = () => {
        const out = {};
        for (const { spec, field } of inputs) {
          let value = String(field.value || '').trim();
          if (spec.save) {
            value = spec.save(field.value);
            if (!value) {
              err.textContent = spec.rules || 'That value is not usable.';
              field.focus();
              return null;
            }
          } else if (spec.required !== false && !value) {
            err.textContent = spec.empty || 'That needs a name.';
            field.focus();
            return null;
          }
          out[spec.key] = value;
        }
        return out;
      };
      const finish = (value) => {
        this.closeNameDialog(value);
      };
      const onKey = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const values = readValues();
          if (values) {
            finish(values);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        }
      };
      this.nameKeyHandler = onKey;
      this.nameDialog.addEventListener('keydown', onKey, true);
      save.addEventListener('click', () => {
        const values = readValues();
        if (values) {
          finish(values);
        }
      });
      cancel.addEventListener('click', () => finish(null));
      /*
       * Backdrop cancel. This used to be a `{ once: true }` listener, which
       * spends itself on the FIRST click anywhere in the dialog: one click
       * in the name field and clicking the backdrop no longer closed
       * anything. It also outlived a dialog closed by a button, because
       * `once` only removes the listener when it actually fires, so every
       * open that ended on Save left one behind on a node that is reused.
       * Held and removed in closeNameDialog, next to the key handler.
       */
      this.nameClickHandler = (e) => {
        if (e.target === this.nameDialog) {
          finish(null);
        }
      };
      this.nameDialog.addEventListener('click', this.nameClickHandler);
      inputs[0].field.focus();
      inputs[0].field.select();
    });
  }

  /*
   * NAME THIS PROFILE. The same overlay askName uses, for the same reason:
   * a name is typed, and the stick menu cannot type one.
   *
   * THIS IS THE PROMPT the owner asked for. There is no inline name field
   * anywhere, so "save with no name" cannot reach the store: confirming an
   * empty field leaves the dialog open with the `empty` line under it,
   * because askForm's readValues refuses a required field that is blank and
   * returns null rather than inventing a name.
   *
   * `suggested` is the loaded preset's name when the numbers already match
   * one, so the common case of nudging a saved profile and saving it again
   * lands on that profile instead of quietly growing a second copy of it.
   * The detail carries the storage warning, because this is the moment a
   * pilot decides the profile is worth keeping and therefore the moment it
   * matters that it is kept in one browser and nowhere else.
   */
  askRatePresetName(suggested = '') {
    const taken = presetNamed(suggested);
    return this.askForm({
      title: 'Name this preset',
      detail: RATES_STORAGE_WARNING,
      confirmLabel: taken ? 'Replace' : 'Save',
      fields: [{
        key: 'name',
        label: '',
        value: suggested,
        maxLength: PRESET_NAME_MAX,
        placeholder: 'Preset name',
        empty: 'A preset needs a name.',
      }],
    }).then((values) => (values ? values.name : null));
  }

  /*
   * A yes or no, on the same overlay the name form uses.
   *
   * Shares the node deliberately: handleKey already swallows every menu key
   * while `nameDialog` is open, closeNameDialog already tears down the key
   * and backdrop listeners, and a second modal with its own copy of that
   * bookkeeping is how one of them ends up leaking a listener. No field, so
   * the confirming button takes focus instead. Resolves true or false, and
   * a backdrop click or Escape is false.
   */
  askConfirm({ title, detail, yes, no }) {
    return new Promise((resolve) => {
      this.nameWait = resolve;
      const box = el('div', 'name-dialog-box');
      box.append(el('h2', null, title));
      if (detail) {
        box.append(el('p', 'lede', detail));
      }
      const row = el('div', 'name-dialog-row');
      const yesBtn = btn('name-dialog-btn on', yes || 'Yes');
      const noBtn = btn('name-dialog-btn', no || 'No');
      row.append(noBtn, yesBtn);
      box.append(row);
      this.nameDialog.textContent = '';
      this.nameDialog.append(box);
      this.nameDialog.hidden = false;

      /*
       * TWO THINGS THIS DIALOG DOES NOT DO, both reported by a pilot who
       * spammed the camera angle button past 40 and watched the tip vanish
       * before they could read it.
       *
       * NO BACKDROP DISMISSAL. The backdrop is inset 0 with pointer-events
       * auto, so it covers the row the pilot was just clicking: the stepper
       * that opened this sits at x 1183 in a 1600 wide window and the box is
       * centred, so the very next click of a burst landed on the backdrop
       * and answered no. The name form can keep click-beside-to-cancel
       * because a pilot opens it deliberately and it has an obvious Cancel.
       * A question that appears UNDER THE CURSOR uninvited cannot.
       *
       * AND A SHORT DEAF PERIOD. Removing the backdrop handler fixes the
       * clicks that land beside the box, but at another window size the box
       * can be under the cursor and the same burst would hit a BUTTON, which
       * is worse: it would answer for them. Nothing is accepted from any
       * source for 300 ms, which is under the roughly 250 ms floor for
       * reacting to something that just appeared, so it can only ever
       * swallow input that was already queued when the dialog opened.
       */
      const openedAt = performance.now();
      const finish = (v) => {
        if (performance.now() - openedAt < CONFIRM_DEAF_MS) {
          return;
        }
        this.closeNameDialog(v);
      };
      const onKey = (e) => {
        if (e.key === 'Enter' || e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          e.stopPropagation();
          finish(true);
        } else if (e.key === 'Escape' || e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      };
      this.nameKeyHandler = onKey;
      this.nameDialog.addEventListener('keydown', onKey, true);
      yesBtn.addEventListener('click', () => finish(true));
      noBtn.addEventListener('click', () => finish(false));
      yesBtn.focus();
    });
  }

  /* The camera tilt stepper, shared by the Quad room (where it is the
   * machine's setting) and the Rates screen (where the yaw it rolls into the
   * picture is tuned). One definition, so the two cannot drift. */
  cameraAngleRow(s) {
    return stepper(
      'Camera angle',
      /*
       * The yaw sentence is not a caveat, it is the main thing a pilot
       * needs to know before they crank this up, and the menu never said
       * it. A camera tilted up by t sees a pure yaw as sin(t) of image
       * roll and cos(t) of image yaw, which is geometry and is exactly
       * what a real tilted camera does. At 30 that is half. At 40 it is
       * nearly two thirds, which is the tilt a pilot wrote in about.
       */
      `How far the camera tilts up from the airframe. ${CAMERA_ANGLE_MIN} is flat, looking along the nose. ${CAMERA_ANGLE_DEFAULT} is a typical cruise. 45 to ${CAMERA_ANGLE_MAX} is race. Above about 30, yaw starts to roll the horizon: at ${s.cameraAngle} degrees, ${Math.round(Math.sin(cameraTiltRad(s.cameraAngle)) * 100)} percent of a yaw shows up as roll in the picture. That is what a real tilted camera does. Lower Yaw max rate on the Rates screen to tame it.`,
      `${s.cameraAngle}°`,
      (d) => {
        const before = s.cameraAngle;
        s.cameraAngle = clampCameraAngle(before + d);
        /* On the way UP across the threshold only, and only if the yaw
         * rate is above what would be offered. Stepping back down and up
         * again inside one session does not ask twice. */
        if (before < YAW_TIP_TILT
          && s.cameraAngle >= YAW_TIP_TILT
          && fullStickDeg(s.rates, 'yaw') > YAW_TIP_RATE
          && yawTipFixable(s.rates)
          && !this.yawTipAsked) {
          this.offerYawTip();
        }
      },
    );
  }

  /*
   * The tip that fires when the camera goes past the angle where yaw starts
   * to roll the horizon hard. Offered ONCE per session, only on the way UP
   * across the threshold, and only when the yaw rate is actually above what
   * would be suggested, so a pilot who has already dealt with it is never
   * asked. The numbers in it are this pilot's, not an example.
   *
   * IN DEG/S AT FULL PEDAL, read off the same curve the Rates screen draws,
   * because that is the only number the five rate systems agree on. The one
   * press fix is offered on the two systems where it is exact, Actual and
   * Quick, which are the two whose Max rate column IS the rate at the stop:
   * on Betaflight or KISS the same 500 deg/s is a pair of numbers with no
   * single right answer, so those pilots get the sentence and the screen
   * rather than a button that would have to guess. See yawTipFixable.
   */
  offerYawTip() {
    const s = this.settings;
    this.yawTipAsked = true;
    const pct = Math.round(Math.sin(cameraTiltRad(s.cameraAngle)) * 100);
    const yawNow = fullStickDeg(s.rates, 'yaw');
    const now = Math.round(yawNow * Math.sin(cameraTiltRad(s.cameraAngle)));
    const then = Math.round(YAW_TIP_RATE * Math.sin(cameraTiltRad(s.cameraAngle)));
    this.askConfirm({
      title: 'Yaw will roll the horizon',
      detail: `At ${s.cameraAngle} degrees of tilt, ${pct} percent of a yaw shows up as roll in the picture: ${now} deg/s of it at your ${yawNow} deg/s yaw rate. That is what a real tilted camera does, and the usual answer is a slower yaw. Dropping the yaw max rate to ${YAW_TIP_RATE} brings it back to ${then} deg/s. You can change it any time on the Rates screen.`,
      yes: `Set yaw to ${YAW_TIP_RATE}`,
      no: `Leave it at ${yawNow}`,
    }).then((ok) => {
      if (!ok) {
        return;
      }
      /* Max rate is srate in tens of deg/s on both systems this is offered
       * on, which is why the fix is one assignment and not a solver. */
      this.settings.rates.yaw.srate = YAW_TIP_RATE / 10;
      saveSettings(this.settings);
      this.renderMenu();
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
    });
  }

  /*
   * A name is typed, not flown. The stick menu cannot enter one, so this is
   * a small overlay with a field. Resolves to the stored name, or null if
   * they cancel.
   */
  askName({ title, detail, known = null } = {}) {
    return this.askForm({
      title: title || 'Your name',
      detail: detail || 'Posted times and published tracks carry this name. Changing it updates the board for tracks you published from this browser.',
      confirmLabel: 'Save',
      fields: [{
        key: 'name',
        label: '',
        value: readPilotName() || '',
        maxLength: 24,
        placeholder: 'Name',
        autocomplete: 'nickname',
        rules: nameRules(),
        save: writePilotName,
        /* Names already on the board, or a promise of them: see askForm. */
        known,
      }],
    }).then((values) => (values ? values.name : null));
  }

  /*
   * THE UNSAVED GUARD on a report form.
   *
   * Escape, a click on the backdrop and Cancel all used to throw a typed
   * report away the instant they were touched. The backdrop is the one
   * that actually hurt: reaching for a field and missing it by a few
   * pixels destroyed everything the pilot had written, with no warning
   * and nothing to undo. It was reported by somebody who had retyped the
   * same ticket several times before they worked out what was eating it.
   *
   * So a form with anything in it asks first. The form is HIDDEN rather
   * than rebuilt, so its nodes and every value in them stay alive: Keep
   * editing puts the pilot back exactly where they were, mid sentence,
   * with the caret in the field they left. Send it hands them back to the
   * form and then submits, so a draft that fails validation lands on the
   * form's own error line instead of vanishing behind a confirmation.
   * Discard is the only path that loses anything and it takes a
   * deliberate click on a button that says so.
   *
   * An untouched form closes silently. Asking somebody who typed nothing
   * whether they really meant it is how a guard teaches people to click
   * through guards without reading them.
   *
   * Returns true when it asked, false when it let the close through.
   */
  confirmDiscard(box, { dirty, submit, discard }) {
    if (!dirty()) {
      discard();
      return false;
    }
    const panel = el('div', 'name-dialog-box bug');
    panel.append(el('h2', null, 'Keep this report?'));
    panel.append(el(
      'p',
      'lede',
      'You have written something that has not been sent. Nothing here keeps a draft, so closing now loses it.',
    ));
    const row = el('div', 'name-dialog-row');
    const send = btn('name-dialog-btn on', 'Send it');
    const keep = btn('name-dialog-btn', 'Keep editing');
    const drop = btn('name-dialog-btn danger', 'Discard');
    row.append(send, keep, drop);
    panel.append(row);
    /* Back to the form, untouched. Also what Escape means while this is
     * up: the least destructive reading of "not that". */
    const restore = () => {
      panel.remove();
      box.style.display = '';
      this.discarding = null;
    };
    this.discarding = restore;
    send.addEventListener('click', () => {
      restore();
      submit();
    });
    keep.addEventListener('click', restore);
    drop.addEventListener('click', () => {
      this.discarding = null;
      discard();
    });
    box.style.display = 'none';
    this.nameDialog.append(panel);
    keep.focus();
    return true;
  }

  closeNameDialog(value) {
    if (this.nameKeyHandler) {
      this.nameDialog.removeEventListener('keydown', this.nameKeyHandler, true);
      this.nameKeyHandler = null;
    }
    if (this.nameClickHandler) {
      this.nameDialog.removeEventListener('click', this.nameClickHandler);
      this.nameClickHandler = null;
    }
    this.nameDialog.hidden = true;
    this.nameDialog.textContent = '';
    /* Any route out of the dialog retires the unsaved guard with it, or a
     * stale restore would hide the next form behind a panel that is no
     * longer in the document. */
    this.discarding = null;
    const done = this.nameWait;
    this.nameWait = null;
    this.bugFiling = false;
    if (done) {
      done(value);
    }
    this.syncChips();
    this.renderMenu();
  }

  /*
   * The chips that float over the world rather than living on a screen,
   * and the dock that stacks under them.
   *
   * `bug-chip` is the class all three wear and it is a bad name for a base
   * that Pause also uses. It stays anyway: see the stylesheet, where the
   * rule is, for what renaming it cost.
   *
   * Report bug is on the screens BUG_CHIP_SCREENS names: the run and the
   * rooms a pilot opens when something is wrong. See the comment where it is
   * built for why the title has none, and the budget for why the rest of
   * the rooms have none either.
   */
  syncChips() {
    const dialog = this.nameDialog && !this.nameDialog.hidden;
    const bug = this.bugChip && !dialog && BUG_CHIP_SCREENS.has(this.screen);
    if (this.bugChip) {
      this.bugChip.hidden = !bug;
      this.bugChip.classList.toggle('on-flight', this.screen === 'flight');
    }
    /* Flight only. Paused already has Resume as its first row, and every
     * other screen has somewhere to go on it. */
    if (this.pauseChip) {
      this.pauseChip.hidden = dialog || this.screen !== 'flight';
      this.pauseChip.classList.toggle('on-flight', this.screen === 'flight');
    }
    /* The dock takes the second slot when there is a chip in the first and
     * the corner when there is not, which is the title. Written as a class
     * rather than as a top in pixels here, so the status bar's own offset
     * stays in the stylesheet with the rest of the stacking. */
    if (this.musicDock) {
      this.musicDock.classList.toggle('under-chip', Boolean(bug));
    }
    this.syncMusicDock();
    if (this.screen !== 'flight') {
      this.syncChipFade(false);
    }
  }

  /*
   * HOW MANY CHIPS STAND IN THE TOP RIGHT, for the stylesheet. On a phone
   * held upright a centred heading and the chips want the same pixels, and
   * Settings' heading was printed under Report bug and the music dock. The
   * budget decides which screens have chips at all (BUG_CHIP_SCREENS,
   * MUSIC_SCREENS); this tells a narrow screen how far down to start.
   */
  syncChipRows() {
    if (!this.root) {
      return;
    }
    const up = (n) => Boolean(n) && !n.hidden;
    const n = this.screen === 'title' || this.screen === 'flight'
      ? 0
      : (up(this.bugChip) ? 1 : 0) + (up(this.musicDock) ? 1 : 0);
    this.root.classList.toggle('chip-rows-1', n === 1);
    this.root.classList.toggle('chip-rows-2', n === 2);
    if (this.musicDock) {
      this.musicDock.classList.toggle('on-title', this.screen === 'title');
    }
  }

  /*
   * THE FLIGHT CHIPS FADE (POLISH-PLAN.md item 12; the owner, 2026-09-27:
   * "yes fade the chips too"). A real feed carries the OSD and nothing
   * else, so the music dock, Report bug and Pause go after about three
   * seconds in the air, and come back when the quad is down again (landed,
   * perched, set down, on its back), on the pause screen, and the moment a
   * pointer moves or a finger lands anywhere but on a thumb stick.
   *
   * From the frame loop with the Weight slider's own aloft test, and it
   * does nothing a frame but compare two times: the fade is the sheet's
   * transition on one class on the root, written on a change only.
   *
   * FADED, NOT GONE. Only the opacity goes: every chip still takes its
   * click and its tap where it stands, so a thumb that knows where Pause
   * is still pauses, and Escape and F8 never depended on a chip. There is
   * no pause button on a radio in flight to keep working; a radio pilot
   * pauses on Escape, and gets the chips back by landing or pausing.
   */
  syncChipFade(aloft, nowMs = performance.now()) {
    if (!aloft || this.screen !== 'flight') {
      this.chipsAloftAt = null;
      this.setChipsQuiet(false);
      return;
    }
    if (this.chipsAloftAt == null) {
      this.chipsAloftAt = nowMs;
    }
    const from = Math.max(this.chipsAloftAt, this.chipsWokeAt);
    this.setChipsQuiet(nowMs - from >= CHIPS_QUIET_MS);
  }

  setChipsQuiet(on) {
    if (this.chipsQuiet === on) {
      return;
    }
    this.chipsQuiet = on;
    this.root.classList.toggle('chips-quiet', on);
  }

  /*
   * Is a flight up. Paused counts, and that is the decision in this
   * predicate rather than an oversight: the pause screen keeps the flight
   * display, the lap clock and the pack on screen behind it, the flight is
   * still there to go back to, and swapping the bed out and back every
   * time somebody taps Escape mid race would be the most obtrusive thing
   * in the mix. One predicate, used by the dock and by the music context,
   * so the dock cannot say flying while the bed says menus.
   */
  flying() {
    return this.screen === 'flight' || this.screen === 'paused';
  }

  skipMusic(dir) {
    if (typeof this.onMusicSkip === 'function') {
      this.onMusicSkip(dir);
    }
  }

  /*
   * Mute, and back to where it was.
   *
   * Zero IS the off state already: the Music stepper under Pilot prints
   * Off at zero, applyMix stops the bed at zero, and the dock has dimmed
   * itself on `musicLevel <= 0` since it was built. So this writes the one
   * number rather than inventing a second flag that could disagree with it.
   *
   * The level it restores is the one it muted, held for this visit only. A
   * pilot who mutes, closes the tab and comes back gets the default rather
   * than their own number, because the alternative is a settings key whose
   * whole job is to remember a number the pilot can see and set in one
   * press on the row it came from.
   *
   * onSettings is what actually stops the sound: applyMix in main.js reads
   * the level and the enable off the settings object. Without it the dock
   * would dim and the bed would play on.
   */
  toggleMusicMute() {
    const s = this.settings;
    if (s.musicLevel > 0) {
      this.musicLevelWas = s.musicLevel;
      s.musicLevel = 0;
    } else {
      s.musicLevel = this.musicLevelWas || DEFAULTS.musicLevel;
    }
    saveSettings(s);
    if (this.onSettings) {
      this.onSettings(s);
    }
    this.syncMusicDock();
    /* The Music row prints Off or a number, and it is one screen away. */
    this.renderMenu();
    this.announce(s.musicLevel > 0 ? 'Music on' : 'Music muted');
  }

  setMusicNow(st) {
    if (!st) {
      return;
    }
    this.musicNow = st;
    this.syncMusicDock();
  }

  syncMusicDock() {
    if (!this.musicDock) {
      return;
    }
    const dialog = this.nameDialog && !this.nameDialog.hidden;
    /* MUSIC_SCREENS, which leaves out calibrate and padpick as this always
     * did: the wizard owns the sticks there. */
    const hide = dialog
      || !MUSIC_SCREENS.has(this.screen)
      || !this.settings.sound;
    this.musicDock.hidden = hide;
    this.musicDock.classList.toggle('on-flight', this.flying());
    const muted = this.settings.musicLevel <= 0;
    this.musicDock.classList.toggle('is-muted', muted);
    const name = (this.musicNow && this.musicNow.name) || MENU_TRACKS[0].name;
    this.musicTitle.textContent = name;
    /* The name, because it ellipsises, and then what the click does. */
    this.musicTitle.title = muted ? `${name}. Click to unmute.` : `${name}. Click to mute.`;
    this.syncChipRows();
  }

  bugSnapshot() {
    const s = this.settings || {};
    const seat = s.map === 'custom' ? activeCourseSummary() : null;
    const gpu = this.gpuInfo || {};
    let href = '';
    try {
      href = String(window.location.href || '').slice(0, 300);
    } catch (e) {
      href = '';
    }
    let userAgent = '';
    try {
      userAgent = String(navigator.userAgent || '').slice(0, 180);
    } catch (e) {
      userAgent = '';
    }
    /*
     * THE FAULT THAT STOPPED THE FLIGHT, IF ONE DID.
     *
     * main.js wraps the frame body once and records the first thrown fault
     * on window.__frameFault. The comment beside it says the fault is
     * "recorded for the bug report, which is the one path that carries a
     * fault off this machine". It was not. This function never read it, so
     * the mechanism was built, the banner told the pilot to press F8, and
     * the ticket that arrived looked like every other ticket.
     *
     *   bug-579a663f: "when I really hardly crash the drone the game just
     *   freezes"
     *
     * That is the exact symptom the wrapper was written for, because a
     * frame body that throws at the same line every frame draws nothing:
     * the last picture stays on screen for ever. Whether it is what
     * happened to that pilot is unknowable, because their report could not
     * carry the one field that would have said so. The next one can.
     *
     * Only present when there is a fault, so an ordinary report does not
     * grow an empty field, and clipped hard: the board caps a context at
     * 8000 characters over 32 keys, and a stack is the only thing here
     * with no natural length.
     */
    let fault = null;
    try {
      const f = window.__frameFault;
      if (f && f.message) {
        fault = {
          message: String(f.message).slice(0, 300),
          /* The top frames only. WHERE it threw is the whole question and
           * everything below is the loop that called it. */
          stack: String(f.stack || '').split('\n').slice(0, 4).join(' | ').slice(0, 400),
          atMs: Number(f.atMs) || 0,
        };
      }
    } catch (e) {
      /* The shell itself is what broke. A report with no fault field is
       * still worth more than no report at all. */
    }
    return {
      href,
      screen: this.screen,
      map: s.map || '',
      ...(fault ? { fault } : {}),
      /*
       * THE LAST MAP THAT FAILED TO LOAD, AND WHY, if one did this session.
       * bug-850375dc was a pilot left in the Freestyle room after the town
       * failed to load, and the report said where they were and nothing
       * about what failed: a dropped module, a build that threw, or a
       * browser holding half of one deploy. Only present when there is one,
       * like fault, and clipped the same way.
       */
      ...(this.loadFailure ? { loadFailure: this.loadFailure } : {}),
      courseId: (seat && (seat.shareId || (seat.doc && seat.doc.id))) || '',
      courseName: (seat && seat.name) || '',
      flightMode: s.flightMode || '',
      /* The rate profile, because the report that started this screen's
       * rewrite was about rates and did not carry them: an agent reading
       * "cannot set my rates" had no way to see what the pilot was on. */
      rates: ratesSummary(s.rates || {}),
      /*
       * The throttle curve, spelled out. "Flight feel: throttle is touchy"
       * arrived with a rates line that says nothing about the throttle
       * unless a cap is already on, so the one setting that answers the
       * complaint was the one thing the report could not carry. Its hover
       * is at the weight, pack and Motor power below, so they agree.
       */
      throttle: throttleSummary(
        s.rates || {},
        s.airframe,
        clampWeight(s.weight, s.airframe),
        s.packVoltage,
        this.tuneCaps.kv ? effectiveTune(s).motorKv : MOTOR_KV_STOCK,
      ),
      /*
       * THE SLIDER'S POSITION, and it belongs in the report for the same
       * reason the throttle curve does: this is the one field that tells the
       * difference between "the shipped quad is too floaty" and "I have
       * already dragged this to 180 and it is STILL too floaty". The first
       * is an opinion about a default, the second is a measurement of one.
       */
      weight: clampWeight(s.weight, s.airframe),
      /* And the absolute multiple of 9.80665 that weight became on this
       * airframe, because the base has moved once already and "weight 100"
       * in a ticket from before the move and one from after it are
       * different machines. Both numbers, always. */
      gravityScale: gravityScaleFor(s.weight, s.airframe),
      /*
       * HOW THE STICKS GOT HERE, which is the field five feel reports were
       * missing and the reason they read as five opinions about one quad.
       *
       * They were not. Reconstructed from the rate profile and the user
       * agent afterwards, they were a radio, a keyboard and two sets of
       * thumbs, and three of the five words described the transducer rather
       * than the aircraft: "stiff" is what analogMag's 0.34 ceiling does to
       * a keyboard, "floppy" is a sprung thumb on glass. Every one of those
       * numbers was already measured and none of them was written down.
       *
       * padHz is the one to read first. The RC grid handed to Betaflight is
       * a fixed 250 Hz and the consumer side is frame rate independent
       * (measured, PROGRESS.md round 19), so the grid is not the variable.
       * What varies is how fresh the value on each slot is, and that is a
       * property of the browser, the driver and the radio's own USB report
       * rate. A padHz sitting at the frame rate means the browser is
       * rAF-locked on gamepad input and feedforward, which is the
       * derivative of the setpoint, is seeing an impulse train at frame
       * rate. That is twitchy, from code that did not change.
       */
      stick: this.stickProbe ? this.stickProbe() : null,
      /*
       * WHAT THE FRAMES COST WHILE FLYING. bug-e82b8bb8 was a pilot saying
       * the lag made the track unflyable and a report saying 60 fps, read
       * on the pause screen, which is a statement about the pause screen.
       * This is the flying frames' own record, whether the browser granted
       * the low latency canvas, and the render scale. One key: the board's
       * cap is 32.
       */
      perf: this.perfProbe ? this.perfProbe() : null,
      /*
       * THE CRAFT, for a ticket that says it is stuck: parked or flying, on its back or waiting for a stick to
       * centre, how long still, where, how often set down and why, the stick keys down. bug-d7247563 and
       * bug-ad038907 each said "stuck" and nothing else, and neither could be made to happen from the words. One key.
       */
      craft: this.craftProbe ? this.craftProbe() : null,
      graphics: s.graphics || '',
      cameraAngle: s.cameraAngle,
      cameraFov: s.cameraFov,
      packVoltage: s.packVoltage,
      link: s.link || '',
      gpu: gpu.display || gpu.name || '',
      userAgent,
      viewport: {
        w: window.innerWidth || 0,
        h: window.innerHeight || 0,
        dpr: window.devicePixelRatio || 1,
      },
    };
  }

  /*
   * Pause first if they were in the air, so typing does not fly the quad,
   * then open the form. Snapshot the context BEFORE pausing so an F8 from
   * flight still records screen: flight.
   */
  openBugReport() {
    if (this.bugFiling || (this.nameDialog && !this.nameDialog.hidden)) {
      return;
    }
    this.bugFiling = true;
    const context = this.bugSnapshot();
    if (this.screen === 'flight') {
      this.act('pause');
      this.show('paused');
    }
    this.askBugReport(context);
  }

  askBugReport(context) {
    if (this.nameWait) {
      this.closeNameDialog(null);
    }
    const box = el('div', 'name-dialog-box bug');
    box.append(el('h2', null, 'Report a bug'));
    box.append(el(
      'p',
      'lede',
      'Title and what happened are enough. The map, graphics, GPU and browser go with the ticket so you do not have to type those.',
    ));
    /* The other door. The chip says give feedback as well as report a bug,
     * and a pilot who came to say how the quad flies should not have to
     * dress an opinion up as a defect: this hands them to the flight feel
     * form, which asks the one question they came to answer. */
    const feelDoor = btn('name-dialog-door', 'Just here to say how it flies? Give flight feel feedback instead.');
    box.append(feelDoor);

    const kindLabel = el('p', 'name-dialog-label', 'Kind');
    const kind = document.createElement('select');
    kind.className = 'name-dialog-input';
    for (const opt of BUG_KINDS) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      if (opt.id === 'wrong') {
        o.selected = true;
      }
      kind.append(o);
    }

    const titleLabel = el('p', 'name-dialog-label', 'Title');
    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'name-dialog-input';
    title.maxLength = 120;
    title.placeholder = 'Short, specific';
    title.autocomplete = 'off';

    const whatLabel = el('p', 'name-dialog-label', 'What happened');
    const what = document.createElement('textarea');
    what.className = 'name-dialog-input name-dialog-area';
    what.maxLength = 4000;
    what.rows = 4;
    what.placeholder = 'What you saw, heard, or could not do.';

    const expectedLabel = el('p', 'name-dialog-label', 'What you expected (optional)');
    const expected = document.createElement('textarea');
    expected.className = 'name-dialog-input name-dialog-area';
    expected.maxLength = 2000;
    expected.rows = 2;

    const stepsLabel = el('p', 'name-dialog-label', 'How to reproduce (optional)');
    const steps = document.createElement('textarea');
    steps.className = 'name-dialog-input name-dialog-area';
    steps.maxLength = 2000;
    steps.rows = 2;

    const nameLabel = el('p', 'name-dialog-label', 'Your name (optional)');
    const reporter = document.createElement('input');
    reporter.type = 'text';
    reporter.className = 'name-dialog-input';
    reporter.maxLength = 24;
    reporter.autocomplete = 'nickname';
    reporter.value = readPilotName() || '';
    reporter.placeholder = 'Leave blank to stay Anonymous';

    const err = el('p', 'name-dialog-err', '');
    const row = el('div', 'name-dialog-row');
    const send = btn('name-dialog-btn on', 'Send');
    const cancel = btn('name-dialog-btn', 'Cancel');
    row.append(send, cancel);
    box.append(
      kindLabel, kind,
      titleLabel, title,
      whatLabel, what,
      expectedLabel, expected,
      stepsLabel, steps,
      nameLabel, reporter,
      err, row,
    );
    this.nameDialog.textContent = '';
    this.nameDialog.append(box);
    this.nameDialog.hidden = false;
    this.syncChips();

    /* Same in-flight guard the feel dialog carries: a ticket that is still
     * POSTing must not lose its dialog to Escape, the backdrop or Cancel,
     * or it lands twice from a pilot who thought it never left. */
    let sending = false;
    const finish = (value) => {
      this.closeNameDialog(value);
    };
    /* Anything the pilot actually wrote. The name is not in this list: it
     * is prefilled from the stored pilot name, so a form carrying only
     * that is an untouched form.
     *
     * `sent` retires the guard the moment the ticket lands. The success
     * screen replaces the form's children but the input nodes survive
     * detached, values and all, so without this Escape on the Sent screen
     * would ask whether to keep a report that is already on the board. */
    let sent = false;
    const isDirty = () => !sent && Boolean(
      title.value.trim() || what.value.trim() || expected.value.trim() || steps.value.trim(),
    );
    /* Every close a pilot can trip goes through the guard, and the guard
     * lets an empty form straight through. See confirmDiscard. */
    const tryClose = (after) => {
      if (sending || this.discarding) {
        return;
      }
      this.confirmDiscard(box, {
        dirty: isDirty,
        submit: () => submit(),
        discard: after,
      });
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (sending) {
        return;
      }
      /* Escape over the guard is Keep editing, not a second answer to a
       * question about losing work. */
      if (this.discarding) {
        this.discarding();
        return;
      }
      tryClose(() => finish(null));
    };
    this.nameWait = () => {};
    this.nameKeyHandler = onKey;
    this.nameDialog.addEventListener('keydown', onKey, true);
    this.nameClickHandler = (e) => {
      /* A stray backdrop click is what loses a report in the first place,
       * so while the guard is up the backdrop does nothing at all. */
      if (e.target === this.nameDialog && !sending && !this.discarding) {
        tryClose(() => finish(null));
      }
    };
    this.nameDialog.addEventListener('click', this.nameClickHandler);
    cancel.addEventListener('click', () => tryClose(() => finish(null)));
    feelDoor.addEventListener('click', () => {
      tryClose(() => {
        finish(null);
        this.openFeelReport();
      });
    });
    const submit = async () => {
      err.textContent = '';
      if (title.value.trim().length < 8) {
        err.textContent = 'A title needs at least eight characters.';
        title.focus();
        return;
      }
      if (what.value.trim().length < 20) {
        err.textContent = 'Say what happened, at least a sentence.';
        what.focus();
        return;
      }
      const payload = {
        kind: kind.value,
        title: title.value,
        what: what.value,
        expected: expected.value,
        steps: steps.value,
        reporter: reporter.value,
        context,
      };
      sending = true;
      send.disabled = true;
      cancel.disabled = true;
      send.textContent = 'Sending';
      try {
        const posted = await submitBug(payload);
        sending = false;
        sent = true;
        box.textContent = '';
        box.append(el('h2', null, 'Sent'));
        box.append(el(
          'p',
          'lede',
          `Ticket ${posted.id} is on the board. Thanks.`,
        ));
        const doneRow = el('div', 'name-dialog-row');
        const close = btn('name-dialog-btn on', 'Close');
        close.addEventListener('click', () => finish(posted));
        doneRow.append(close);
        box.append(doneRow);
        close.focus();
      } catch (e) {
        sending = false;
        send.disabled = false;
        cancel.disabled = false;
        send.textContent = 'Send';
        err.textContent = e.message || 'The board could not take that report.';
      }
    };
    send.addEventListener('click', submit);
    title.focus();
  }

  /*
   * Everything the tune work needs to read a feel report: the bug context
   * plus which tune was flown, what the pilot has done to it, and the PID
   * values the module was actually flying, from the readback rather than
   * the menu. A feel report without its numbers is a mood; with them it is
   * a data point.
   */
  feelSnapshot() {
    const s = this.settings || {};
    return {
      ...this.bugSnapshot(),
      tune: s.tune || '',
      tuneName: tuneById(s.tune).name,
      pids: pidsSummary(s.pids, s.tune),
      pidsLive: this.pidsLive,
      bestLapMs: Number.isFinite(this.resultsFastest) ? this.resultsFastest : null,
    };
  }

  /*
   * The flight feel question. Asks itself ONCE, ever: after the first
   * finished race, from showResults, and the flag flips the moment the
   * dialog opens, whatever is done with it. After that it is a row on
   * Results and on the pause menu, because an automatic prompt that keeps
   * coming back is how a pilot learns to close dialogs without reading
   * them.
   */
  maybeOfferFeel() {
    if (this.settings.feelAsked) {
      return;
    }
    /*
     * ON THE SECOND RESULTS, NOT THE FIRST (MENUS-PLAN.md 2.8). The first
     * finished race is the pilot's first time, and the form opened over it.
     * One more run and they have something to compare the feel against.
     * Never on its own for a radio or a gamepad: a form wants a keyboard,
     * and a pilot whose hands are on sticks would meet a modal they cannot
     * type into. The Flight feel row is one press away for all of them.
     */
    this.settings.resultsSeen = Math.min(99, (this.settings.resultsSeen || 0) + 1);
    saveSettings(this.settings);
    if (this.settings.resultsSeen < 2 || this.lastInput === 'pad') {
      return;
    }
    /* Let the results screen land first. A record celebration with a form
     * on top of it is a form remembered as an interruption. */
    setTimeout(() => {
      if (this.settings.feelAsked || this.screen !== 'results') {
        return;
      }
      if (this.bugFiling || (this.nameDialog && !this.nameDialog.hidden)) {
        return;
      }
      this.openFeelReport();
    }, 1400);
  }

  openFeelReport() {
    if (this.bugFiling || (this.nameDialog && !this.nameDialog.hidden)) {
      return;
    }
    /* Opened is asked, on either path: the automatic offer never returns,
     * and a pilot who found the row does not need the popup either. */
    if (!this.settings.feelAsked) {
      this.settings.feelAsked = true;
      saveSettings(this.settings);
    }
    /* No pause-first branch like openBugReport's: F8 reaches that one from
     * flight, while this one is only reachable from the paused and results
     * menus and its automatic offer requires the results screen. */
    this.askFeelReport(this.feelSnapshot());
  }

  askFeelReport(context) {
    if (this.nameWait) {
      this.closeNameDialog(null);
    }
    const FEELS = [
      { id: 'floppy', label: 'Floppy' },
      { id: 'soft', label: 'Soft' },
      { id: 'right', label: 'About right' },
      { id: 'stiff', label: 'Stiff' },
      { id: 'twitchy', label: 'Twitchy' },
    ];
    const ISSUES = [
      { id: 'sluggish', label: 'Slow to answer the stick' },
      { id: 'bounce', label: 'Bounces back after a stop' },
      { id: 'propwash', label: 'Wobbles in propwash' },
      { id: 'drift', label: 'Drifts off attitude' },
      { id: 'yaw', label: 'Yaw is lazy' },
      { id: 'throttle', label: 'Throttle is touchy' },
      /*
       * FLOATY GETS ITS OWN CHIP, because it kept arriving in the free text
       * box instead. "About right" plus "its much too floaty" typed
       * underneath is a report the chip rows could not carry, and the row
       * below can now answer it on the spot the way the throttle row does.
       */
      { id: 'floaty', label: 'Floaty, carries too far' },
      { id: 'locked', label: 'Locked in, no complaints' },
    ];

    const box = el('div', 'name-dialog-box bug feel');
    box.append(el('h2', null, 'How does it fly?'));
    box.append(el(
      'p',
      'lede',
      `One honest word steers the tune work more than any telemetry. Only the first row is needed; your tune, PID adjustment and rates travel with the answer so the numbers behind the feel arrive too. You were flying ${context.tuneName}.`,
    ));

    let feel = null;
    const issues = new Set();
    const chipRow = (options, onPick) => {
      const wrap = el('div', 'feel-chips');
      const chips = new Map();
      for (const opt of options) {
        const chip = btn('feel-chip', opt.label);
        chip.addEventListener('click', () => {
          onPick(opt.id, chips);
        });
        chips.set(opt.id, chip);
        wrap.append(chip);
      }
      return { wrap, chips };
    };
    const feelRow = chipRow(FEELS, (id, chips) => {
      feel = feel === id ? null : id;
      for (const [cid, chip] of chips) {
        chip.classList.toggle('on', cid === feel);
      }
    });
    /*
     * THE ONE COMPLAINT THIS SHELL CAN ANSWER ON THE SPOT.
     *
     * "Throttle is touchy" has been a chip on this form all along, and the
     * setting that answers it has been compiled in, wired up and two screens
     * away all along too, defaulting OFF. A pilot reported it, we read the
     * report a day later and replied with the name of a menu row. That round
     * trip is the bug.
     *
     * So the row is offered here, at the moment the chip is ticked, and only
     * when it would actually do something: a pilot who has already capped
     * their throttle is complaining about something else and must not be
     * told to do the thing they did. The report still sends either way. This
     * is not a substitute for it, it is what the pilot gets to try tonight
     * instead of waiting for us.
     */
    const capHint = el('p', 'lede feel-hint', '');
    capHint.hidden = true;
    /*
     * THE SECOND COMPLAINT THIS SHELL CAN ANSWER ON THE SPOT, on exactly the
     * rule the throttle row above set: offered when the chip is ticked and
     * only when it would still do something. A pilot already sitting at the
     * top of the gravity range is telling us the DEFAULT is wrong, which is a
     * report worth having undisturbed, so they are not told to do the thing
     * they have done.
     */
    const airHint = el('p', 'lede feel-hint', '');
    airHint.hidden = true;
    const refreshAirHint = () => {
      const af = this.settings.airframe;
      const weight = clampWeight(this.settings.weight, af);
      const top = weightMaxFor(af);
      const show = issues.has('floaty') && weight < top;
      airHint.hidden = !show;
      if (show) {
        const f = WEIGHT_FEEL[af] ?? WEIGHT_FEEL['5inch'];
        airHint.textContent = `The Weight slider between the sticks on the flight screen is this exact complaint: it scales the weight the quad carries, so it drops when you chop the throttle instead of hanging. Yours is at ${weight} percent. From a hover with the throttle cut, the stock quad falls 10 metres in ${f.fall[0]} s and balloons ${f.balloon[0]} m after a short punch; at ${top} percent that is ${f.fall[1]} s and ${f.balloon[1]} m. Hover moves up the stick with it, ${f.hover[0]} percent at stock to ${f.hover[1]} at ${top}. Worth dragging before you wait on us, and a lap flown on it goes on the public board with its weight beside your name.`;
      }
    };
    const refreshCapHint = () => {
      const r = this.settings.rates || {};
      const cap = normaliseRates(r).throttleCap;
      const show = issues.has('throttle') && cap >= 100;
      capHint.hidden = !show;
      if (show) {
        const eased = hoverStickPercent(75, this.settings.airframe);
        const now = hoverStickPercent(100, this.settings.airframe);
        capHint.textContent = `This quad hovers at ${now.toFixed(1)} percent of stick with no throttle limit, so nearly all the travel is above hover. Rates, Throttle limit, 75 percent moves hover to ${eased.toFixed(1)} percent and gives the fine control back without losing any climb you can use indoors. Worth trying before you wait on us.`;
      }
    };
    const issueRow = chipRow(ISSUES, (id, chips) => {
      if (issues.has(id)) {
        issues.delete(id);
      } else {
        issues.add(id);
      }
      chips.get(id).classList.toggle('on', issues.has(id));
      refreshCapHint();
      refreshAirHint();
    });
    /*
     * THE DOOR TO FLIGHT FEEL TUNING, on the form where a pilot has just
     * said how the quad flies. A word tells us what is wrong; the mode lets
     * them try to put it right and, if a setting beats stock, tell us which.
     * Two sentences and one button, and the button only while the mode is
     * off. It turns the mode on and nothing else: the sliders appear on the
     * ground, the pilot is asked at the end of a flight, and nothing is sent
     * without a yes. The switch lives in the Quad room as well; this is the
     * place a pilot who is already unhappy is looking.
     */
    const tuneNote = el('p', 'lede feel-hint', '');
    const tuneDoor = btn('name-dialog-door', 'Turn on flight feel tuning');
    const paintTuneDoor = () => {
      const on = Boolean(this.settings.feelTuning);
      const words = tuneSliderWords(this.tuneCaps);
      const many = this.tuneCaps.air && this.tuneCaps.kv;
      /* A module with neither slider has nothing to offer: no door at all. */
      tuneNote.hidden = !words;
      if (!words) {
        tuneDoor.hidden = true;
        return;
      }
      tuneNote.textContent = on
        ? `Flight feel tuning is on. While you are landed, ${words} ${many ? 'are' : 'is'} beside Weight between the sticks. If a setting feels better than stock you are asked at the end of the flight whether to send it.`
        : `Want to change it yourself? Flight feel tuning puts ${many ? 'two more sliders' : 'one more slider'} beside Weight while you are on the ground: ${tuneSliderBlurbs(this.tuneCaps)}. If a setting feels better than stock you can send us the numbers after the flight. Off unless you turn it on, and nothing is sent without your yes.`;
      tuneDoor.hidden = on;
    };
    paintTuneDoor();
    tuneDoor.addEventListener('click', () => {
      this.settings.feelTuning = true;
      this.writeSettings();
      paintTuneDoor();
    });

    const wordsLabel = el('p', 'name-dialog-label', 'In your own words (optional)');
    const words = document.createElement('textarea');
    words.className = 'name-dialog-input name-dialog-area';
    words.maxLength = 2000;
    words.rows = 3;
    words.placeholder = 'What you would tell the person holding the screwdriver.';

    const nameLabel = el('p', 'name-dialog-label', 'Your name (optional)');
    const reporter = document.createElement('input');
    reporter.type = 'text';
    reporter.className = 'name-dialog-input';
    reporter.maxLength = 24;
    reporter.autocomplete = 'nickname';
    reporter.value = readPilotName() || '';
    reporter.placeholder = 'Leave blank to stay Anonymous';

    const err = el('p', 'name-dialog-err', '');
    const row = el('div', 'name-dialog-row');
    const send = btn('name-dialog-btn on', 'Send');
    const dismiss = btn('name-dialog-btn', 'Not now');
    row.append(send, dismiss);
    box.append(
      el('p', 'name-dialog-label', 'The quad felt'),
      feelRow.wrap,
      el('p', 'name-dialog-label', 'Anything specific (pick any)'),
      issueRow.wrap,
      capHint,
      airHint,
      tuneNote,
      tuneDoor,
      wordsLabel, words,
      nameLabel, reporter,
      err, row,
    );
    this.nameDialog.textContent = '';
    this.nameDialog.append(box);
    this.nameDialog.hidden = false;
    this.syncChips();

    /*
     * While the POST is in flight, nothing may close the dialog. Escape or
     * Not now during the await used to leave the report landing on the
     * board while the pilot watched the form vanish, believed nothing was
     * sent, and sent it again: a duplicate ticket per impatient click.
     * Cleared before the Thanks screen so Escape works there again.
     */
    let sending = false;
    const finish = (value) => {
      this.closeNameDialog(value);
    };
    /* A picked chip counts as much as a typed sentence here: this form is
     * meant to be answered in two clicks, so two clicks is a real answer
     * to lose. The name is prefilled and does not count. `sent` retires
     * the guard once it has landed, for the reason the bug form gives. */
    let sent = false;
    const isDirty = () => !sent && Boolean(feel || issues.size || words.value.trim());
    const tryClose = (after) => {
      if (sending || this.discarding) {
        return;
      }
      this.confirmDiscard(box, {
        dirty: isDirty,
        submit: () => submit(),
        discard: after,
      });
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (sending) {
        return;
      }
      if (this.discarding) {
        this.discarding();
        return;
      }
      tryClose(() => finish(null));
    };
    this.nameWait = () => {};
    this.nameKeyHandler = onKey;
    this.nameDialog.addEventListener('keydown', onKey, true);
    this.nameClickHandler = (e) => {
      if (e.target === this.nameDialog && !sending && !this.discarding) {
        tryClose(() => finish(null));
      }
    };
    this.nameDialog.addEventListener('click', this.nameClickHandler);
    dismiss.addEventListener('click', () => tryClose(() => finish(null)));
    const submit = async () => {
      err.textContent = '';
      if (!feel) {
        err.textContent = 'Pick a word on the first row. One is enough.';
        return;
      }
      const feelLabel = FEELS.find((f) => f.id === feel).label.toLowerCase();
      const picked = ISSUES.filter((i) => issues.has(i.id)).map((i) => i.label.toLowerCase());
      const lines = [`The quad felt ${feelLabel} this run.`];
      /*
       * WHERE THE SLIDER WAS, in the sentence and not only in the context
       * blob, because the owner asked for it there and because it is the one
       * number that turns a feel word into a measurement: "floaty at weight
       * 100" is a verdict on the default, and "floaty at 140" is a verdict
       * on the whole band. The absolute multiple rides along so a ticket
       * from before the base moved reads correctly beside one from after.
       */
      lines.push(`Weight slider at ${context.weight} percent, which is ${context.gravityScale.toFixed(2)} times g on this airframe.`);
      if (picked.length) {
        lines.push(`Noticed: ${picked.join('; ')}.`);
      }
      if (words.value.trim()) {
        lines.push(words.value.trim());
      }
      const payload = {
        kind: 'feel',
        title: `Flight feel: ${feelLabel}${picked.length ? `, ${picked[0]}` : ''}`,
        what: lines.join('\n'),
        reporter: reporter.value,
        context,
      };
      sending = true;
      send.disabled = true;
      dismiss.disabled = true;
      send.textContent = 'Sending';
      try {
        const posted = await submitBug(payload);
        sending = false;
        sent = true;
        box.textContent = '';
        box.append(el('h2', null, 'Thanks'));
        box.append(el(
          'p',
          'lede',
          'Landed, with your tune and rates attached. This is exactly what moves the flight model.',
        ));
        const doneRow = el('div', 'name-dialog-row');
        const close = btn('name-dialog-btn on', 'Close');
        close.addEventListener('click', () => finish(posted));
        doneRow.append(close);
        box.append(doneRow);
        close.focus();
      } catch (e) {
        sending = false;
        send.disabled = false;
        dismiss.disabled = false;
        send.textContent = 'Send';
        err.textContent = e.message || 'The board could not take that report.';
      }
    };
    send.addEventListener('click', submit);
    /* Keyboard first, like every menu here: the first answer chip takes
     * focus, Tab walks the rest, Enter picks, Escape leaves. Enter cannot
     * fall through to the menu underneath; handleKey swallows everything
     * while a dialog is up. */
    const firstChip = feelRow.chips.values().next().value;
    if (firstChip) {
      firstChip.focus();
    }
  }

  /*
   * FLIGHT FEEL TUNING: THE ROWS THE MODE ADDS, AND THE QUESTION THAT ENDS A
   * FLIGHT FLOWN ON THEM.
   *
   * The mode is off by default and everything here is behind it. The rows are
   * the pause screen's and the Quad room's copy of the two sliders (the
   * flight screen's own are in makeWeightSlider), drawn only while the mode is
   * on and only for the sliders the loaded module can answer.
   */
  tuneRows(s, withAsk = false) {
    if (!s.feelTuning) {
      return [];
    }
    return [
      ...(this.tuneCaps.air ? [airGripItem(s)] : []),
      ...(this.tuneCaps.kv ? [motorKvItem(s)] : []),
      ...(withAsk ? [tuneAskItem(s)] : []),
    ];
  }

  /*
   * The flight a question would be about, or null: the combination of the
   * three sliders flown longest this flight in the mode, when that was at
   * least TUNE_MIN_AIR_MS. Taken when a results screen is shown or a pilot
   * leaves a flight, because main.js clears the log when the next run starts.
   */
  takeTuneFlight() {
    if (!this.settings.feelTuning || !this.tuneProbe) {
      return null;
    }
    const f = this.tuneProbe();
    return f && f.airtimeS * 1000 >= TUNE_MIN_AIR_MS ? f : null;
  }

  /*
   * THE ROW FOR A PILOT THE DIALOG CANNOT REACH. A radio cannot answer a
   * dialog (the pad can only go Back), so the automatic question skips it,
   * and a touch pilot may simply have said Not now and changed their mind.
   * This is the same form, one press away on the results screen, for as long
   * as the flight is on it. It is also the way back after Stop asking.
   */
  tuneShareRows() {
    const f = this.resultsTune;
    if (!f || !this.settings.feelTuning) {
      return [];
    }
    if (this.tuneSent.has(f.key)) {
      return [{
        label: 'Tune sent',
        action: 'sharetune',
        disabled: true,
        note: 'That tune is on the board. Thanks.',
      }];
    }
    return [{
      label: 'Share this tune',
      action: 'sharetune',
      note: `${tuneValuesLine(f, this.tuneCaps)}, ${airtimeWords(f.airtimeS)} in the air. If it felt better than stock, send the numbers with a word or two to the people tuning the sim. Nothing is sent unless you press Send.`,
    }];
  }

  /*
   * ASK, ONCE, AT THE END OF THE FLIGHT, AND ONLY WHEN IT IS WORTH ASKING.
   *
   * The decision is tuneAskReason in src/share/tune.js, which says why not in
   * a word. What is added here is the timing: a beat after the screen lands
   * so a record celebration is not covered by a form, and never over another
   * dialog (the once-ever flight feel offer opens at 1.4 seconds, this one
   * waits for 2.2, and a dialog that is up when the timer fires wins and
   * this one stays quiet). A combination is marked asked when it is SHOWN, so
   * it is not asked twice this session whatever the answer.
   */
  maybeAskTune(flight) {
    if (this.tuneAskTimer) {
      window.clearTimeout(this.tuneAskTimer);
      this.tuneAskTimer = 0;
    }
    const reason = tuneAskReason({
      flight,
      tuning: this.settings.feelTuning,
      ask: this.settings.feelTuneAsk !== false,
      asked: this.tuneAsked,
      pad: this.lastInput === 'pad',
    });
    if (reason) {
      return;
    }
    this.tuneAskTimer = window.setTimeout(() => {
      this.tuneAskTimer = 0;
      if (this.tuneAsked.has(flight.key) || (this.screen !== 'results' && this.screen !== 'title')) {
        return;
      }
      if (this.bugFiling || (this.nameDialog && !this.nameDialog.hidden)) {
        return;
      }
      this.tuneAsked.add(flight.key);
      this.askTune(flight);
    }, 2200);
  }

  /*
   * THE QUESTION. Four answers and no default that sends: Better than stock
   * opens the form, Same or worse offers the same form for the negative
   * result (a worse tune at known values is data too), Not now closes, and
   * Stop asking turns the question off for good (Settings turns it back on;
   * the Share row on Results is always there). Nothing is sent from this
   * dialog, ever.
   *
   * Like askConfirm it has no backdrop dismissal and a short deaf period,
   * because it appears on its own, under a hand that is probably about to
   * press Fly again, and a stray click must not answer for the pilot.
   */
  askTune(flight) {
    if (this.nameWait) {
      this.closeNameDialog(null);
    }
    const af = airframeById(flight.airframe);
    const box = el('div', 'name-dialog-box bug tune');
    box.append(el('h2', null, 'Did that feel better than stock?'));
    box.append(el(
      'p',
      'lede',
      `${tuneValuesLine(flight, this.tuneCaps)}. ${airtimeWords(flight.airtimeS)} in the air on the ${af.short}.`,
    ));
    box.append(el(
      'p',
      'lede',
      'If it did, you can send these numbers with a word or two to the people tuning the sim. Nothing is sent unless you press Send on the next screen.',
    ));
    const row = el('div', 'name-dialog-row');
    const better = btn('name-dialog-btn on', 'Better than stock');
    const worse = btn('name-dialog-btn', 'Same or worse');
    const later = btn('name-dialog-btn', 'Not now');
    const stop = btn('name-dialog-btn', 'Stop asking');
    row.append(better, worse, later, stop);
    box.append(row);
    this.nameDialog.textContent = '';
    this.nameDialog.append(box);
    this.nameDialog.hidden = false;
    this.syncChips();

    const openedAt = performance.now();
    const deaf = () => performance.now() - openedAt < CONFIRM_DEAF_MS;
    this.nameWait = () => {};
    this.nameKeyHandler = (e) => {
      if (e.key !== 'Escape') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (!deaf()) {
        this.closeNameDialog(null);
      }
    };
    this.nameDialog.addEventListener('keydown', this.nameKeyHandler, true);
    better.addEventListener('click', () => {
      if (deaf()) {
        return;
      }
      this.closeNameDialog(null);
      this.askTuneForm(flight, { path: 'better' });
    });
    const askNegative = () => {
      box.textContent = '';
      box.append(el('h2', null, 'Thanks, that is useful to know'));
      box.append(el(
        'p',
        'lede',
        'A tune that felt the same or worse tells the people tuning the sim where not to go. Want to send this result too? Nothing is sent unless you say so.',
      ));
      const r = el('div', 'name-dialog-row');
      const close = btn('name-dialog-btn on', 'Close');
      const send = btn('name-dialog-btn', 'Send this result');
      r.append(close, send);
      box.append(r);
      close.addEventListener('click', () => this.closeNameDialog(null));
      send.addEventListener('click', () => {
        this.closeNameDialog(null);
        this.askTuneForm(flight, { path: 'worse' });
      });
      close.focus();
    };
    worse.addEventListener('click', () => {
      if (!deaf()) {
        askNegative();
      }
    });
    later.addEventListener('click', () => {
      if (!deaf()) {
        this.closeNameDialog(null);
      }
    });
    stop.addEventListener('click', () => {
      if (deaf()) {
        return;
      }
      this.settings.feelTuneAsk = false;
      saveSettings(this.settings);
      this.closeNameDialog(null);
    });
    better.focus();
  }

  /*
   * THE FORM, and the only place a tune is sent from. It shows the numbers
   * read only (they are what was flown, not what the sliders say now), asks
   * for the verdict, takes the five feel words the flight feel form uses and
   * a few words of the pilot's own, and has two buttons: Send, and Don't
   * send. Nothing leaves the browser until Send, a failure says so in a
   * sentence and leaves the form as it was, and the sending / sent guards and
   * the unsaved guard are askFeelReport's, for the reasons written there.
   *
   * `path` is how the pilot got here, which decides the verdict chips:
   * 'better' offers Better and Much better with Better chosen, 'worse'
   * offers About the same and Worse, 'manual' (the Share row) offers all
   * four and chooses none, so a pilot sharing a bad result is not nudged.
   */
  askTuneForm(flight, { path }) {
    if (this.nameWait) {
      this.closeNameDialog(null);
    }
    const af = airframeById(flight.airframe);
    const ids = {
      better: ['better', 'much_better'],
      worse: ['same', 'worse'],
      manual: ['much_better', 'better', 'same', 'worse'],
    }[path] || ['better', 'much_better', 'same', 'worse'];
    let verdict = path === 'better' ? 'better' : null;
    let feel = null;

    const box = el('div', 'name-dialog-box bug tune');
    box.append(el('h2', null, path === 'worse' ? 'Send this result' : 'Send your tune'));
    box.append(el(
      'p',
      'lede',
      `${tuneValuesLine(flight, this.tuneCaps)}. ${airtimeWords(flight.airtimeS)} in the air on the ${af.short}. These go to the board with your words, grouped by aircraft and by physics version, so the people tuning the sim can see what pilots prefer. Your tune, your rates and the same details a flight feel report carries go with them.`,
    ));
    const chipRow = (options, selected, onPick) => {
      const wrap = el('div', 'feel-chips');
      const chips = new Map();
      for (const opt of options) {
        const chip = btn(`feel-chip${opt.id === selected ? ' on' : ''}`, opt.label);
        chip.addEventListener('click', () => {
          onPick(opt.id, chips);
        });
        chips.set(opt.id, chip);
        wrap.append(chip);
      }
      return { wrap, chips };
    };
    const verdictRow = chipRow(
      ids.map((id) => TUNE_VERDICTS.find((v) => v.id === id)),
      verdict,
      (id, chips) => {
        verdict = id;
        for (const [cid, chip] of chips) {
          chip.classList.toggle('on', cid === verdict);
        }
      },
    );
    const feelRow = chipRow(FEEL_WORDS, null, (id, chips) => {
      feel = feel === id ? null : id;
      for (const [cid, chip] of chips) {
        chip.classList.toggle('on', cid === feel);
      }
    });
    const words = document.createElement('textarea');
    words.className = 'name-dialog-input name-dialog-area';
    words.maxLength = 2000;
    words.rows = 3;
    words.placeholder = 'What changed, and what you would tell the person holding the screwdriver.';
    const reporter = document.createElement('input');
    reporter.type = 'text';
    reporter.className = 'name-dialog-input';
    reporter.maxLength = 24;
    reporter.autocomplete = 'nickname';
    reporter.value = readPilotName() || '';
    reporter.placeholder = 'Leave blank to stay Anonymous';
    const err = el('p', 'name-dialog-err', '');
    const row = el('div', 'name-dialog-row');
    const send = btn('name-dialog-btn on', 'Send');
    const dismiss = btn('name-dialog-btn', 'Don\'t send');
    row.append(send, dismiss);
    box.append(
      el('p', 'name-dialog-label', 'Compared with stock it felt'),
      verdictRow.wrap,
      el('p', 'name-dialog-label', 'The quad felt (optional)'),
      feelRow.wrap,
      el('p', 'name-dialog-label', 'In your own words (optional)'),
      words,
      el('p', 'name-dialog-label', 'Your name (optional)'),
      reporter,
      err,
      row,
    );
    this.nameDialog.textContent = '';
    this.nameDialog.append(box);
    this.nameDialog.hidden = false;
    this.syncChips();

    let sending = false;
    let sent = false;
    const finish = (value) => {
      this.closeNameDialog(value);
    };
    const isDirty = () => !sent && Boolean(feel || words.value.trim());
    const tryClose = (after) => {
      if (sending || this.discarding) {
        return;
      }
      this.confirmDiscard(box, {
        dirty: isDirty,
        submit: () => submit(),
        discard: after,
      });
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (sending) {
        return;
      }
      if (this.discarding) {
        this.discarding();
        return;
      }
      tryClose(() => finish(null));
    };
    this.nameWait = () => {};
    this.nameKeyHandler = onKey;
    this.nameDialog.addEventListener('keydown', onKey, true);
    this.nameClickHandler = (e) => {
      if (e.target === this.nameDialog && !sending && !this.discarding) {
        tryClose(() => finish(null));
      }
    };
    this.nameDialog.addEventListener('click', this.nameClickHandler);
    dismiss.addEventListener('click', () => tryClose(() => finish(null)));
    const submit = async () => {
      err.textContent = '';
      if (!verdict) {
        err.textContent = 'Pick how it felt compared with stock. One is enough.';
        return;
      }
      const st = this.stickProbe ? this.stickProbe() : null;
      const payload = buildTunePayload({
        verdict,
        feel,
        words: words.value,
        reporter: reporter.value,
        airframe: flight.airframe,
        airframeShort: af.short,
        weight: flight.weight,
        airGrip: flight.airGrip,
        motorKv: flight.motorKv,
        gravityScale: flight.gravityScale,
        airtimeS: flight.airtimeS,
        flightMode: st && st.flying,
        tuneId: this.settings.tune,
        input: inputKindFromSource(st && st.source),
        rates: this.settings.rates,
        context: this.feelSnapshot(),
      });
      sending = true;
      send.disabled = true;
      dismiss.disabled = true;
      send.textContent = 'Sending';
      try {
        const posted = await submitBug(payload);
        sending = false;
        sent = true;
        this.tuneSent.add(flight.key);
        box.textContent = '';
        box.append(el('h2', null, 'Thanks'));
        box.append(el(
          'p',
          'lede',
          `Your tune landed${posted && posted.id ? ` as ${posted.id}` : ''}, with the numbers, your words and the physics version. The people tuning the sim read these side by side.`,
        ));
        const doneRow = el('div', 'name-dialog-row');
        const close = btn('name-dialog-btn on', 'Close');
        close.addEventListener('click', () => finish(posted));
        doneRow.append(close);
        box.append(doneRow);
        close.focus();
      } catch (e) {
        sending = false;
        send.disabled = false;
        dismiss.disabled = false;
        send.textContent = 'Send';
        /* A board that has not been updated yet refuses the kind with a 400
         * and a sentence about kinds, which means nothing to a pilot. */
        err.textContent = e && e.status === 400 && /pick a kind/i.test(e.message || '')
          ? 'The board has not been updated to take tunes yet, so nothing was sent. Try again later.'
          : ((e && e.message) || 'The board could not take that tune.');
      }
    };
    send.addEventListener('click', submit);
    const first = verdictRow.chips.get(verdict) || verdictRow.chips.values().next().value;
    if (first) {
      first.focus();
    }
  }

  /* Menu definitions are rebuilt on show so values read correctly. */
  /*
   * A STABLE NAME FOR EVERY ROW, so that nothing has to remember an index.
   *
   * items() is rebuilt from scratch on every render, and the lists change
   * length as they go: rows appear and vanish with the loaded track, the
   * board, the dirty flag and, on the bench, four filters. An index means
   * nothing across two of those rebuilds. Focus memory already learned this
   * the expensive way and started storing a label instead, which works until
   * two rows share one, and Save on the bench shares a label with nothing
   * while Back shares it with every screen in the product.
   *
   * The id is DERIVED rather than typed into seven hundred object literals,
   * for the same reason the palette is not repeated in seven hundred places:
   * one rule in one function is checkable, and a hand-stamped id is a thing
   * that can be forgotten on the next row somebody adds. Anything that
   * genuinely needs to name itself can still set `id` and win.
   *
   * The order is what the row already carries, most stable first. `action`
   * is a verb the shell already dispatches on and is stable by construction.
   * `key` is a firmware key on the bench and is unique in the catalog. Only
   * then the label, slugged. A collision gets a counter, which is stable as
   * long as the colliding rows keep their order, and rows that collide are
   * repeated section headings and Back, which do.
   */
  items() {
    return stampIds(this.buildItems(), this.screen);
  }

  buildItems() {
    const s = this.settings;
    if (this.screen === 'title') {
      /*
       * FIRST RUN IS TWO CHOICES AND CREDITS, not nine. Nothing here used
       * to tell visit one from visit one hundred, so a pilot who had never
       * held a stick got the same list as somebody coming back for a personal
       * best, with the one thing they needed sitting seventh. isFirstRun is a
       * signal the product already had and threw away: no stored settings, no
       * lap on record. Credits sits with the two choices so who made this is
       * readable before a lap is flown.
       */
      /*
       * The pad trouble row, above whichever title state is up. A pilot
       * whose radio cannot press anything is the person this row is most
       * for, and the first screen is where they are looking.
       *
       * On the gate it sits UNDER the two cards rather than over them, and
       * that is arithmetic rather than taste: renderMenu computes the row
       * offset as `items.length - rows.length`, so every card has to come
       * before every row or the cursor and the row list disagree by one.
       */
      const trouble = padTroubleItem(this.padInfo, this.stickPlatform);
      /*
       * THE GATE. THREE PICTURES, AND NOTHING ELSE ON THE PAGE TO ANSWER.
       *
       * A pilot arriving does not open a menu wanting "Quad" or "Settings".
       * They want to race or they want to mess about, on one machine or the
       * other, and until that is answered every other row on this screen is
       * furniture. It used to be answered halfway down a list of eleven,
       * twice: once by the Race row and once by the Freestyle row, each of
       * which was really a location picker wearing a mode's name. Then it
       * was two card screens in a row. Now it is one, and WAYS is where the
       * three cards and the argument for them live.
       *
       * WHY CARDS AND NOT ROWS. The difference between these three is a
       * difference between PLACES, and a place is the thing a sentence is
       * worst at. Three menu rows ask somebody who has never flown any of
       * them to choose between words. The picker screens learned this
       * already, which is why the worlds are cards there; this is the same
       * lesson one screen earlier, where it matters most because it is the
       * first thing anybody sees.
       *
       * None of the three is `primary`. The bottom bar's button paints the
       * primary item, and a bar reading "Freestyle" under a card reading
       * "Freestyle" is the same choice drawn twice.
       *
       * No `note` either: the help column would print it floating over the
       * cards, and every word of it is already on the card in a place that
       * says which of the three it belongs to.
       */
      if (this.onGate()) {
        return [
          ...WAYS.map((w) => ({
            label: w.label,
            card: w.id,
            art: w.art,
            svg: craftSvg(airframeById(w.airframe)),
            blurb: w.blurb,
            facts: w.facts,
            action: w.action,
          })),
          /* Last of the cards and before the trouble row, which has to
           * come after every card: see the offset note above. */
          {
            label: BUILDER_CARD.label,
            card: BUILDER_CARD.id,
            art: BUILDER_CARD.art,
            blurb: BUILDER_CARD.blurb,
            facts: BUILDER_CARD.facts,
            action: BUILDER_CARD.action,
          },
          ...(trouble ? [trouble] : []),
        ];
      }
      const m = MAPS.find((x) => x.id === s.map) ?? MAPS[0];
      const seat = m.id === 'custom' ? activeCourseSummary() : null;
      /*
       * The course actions that used to appear and vanish here live on the
       * Courses screen and on Results, where the course itself is what the
       * player is looking at. FPV wiki opens the landing-site wiki. Report a bug
       * is a stable last row so testers can send a ticket from title.
       */
      /*
       * ONE ROW FOR THE PLACE, BECAUSE THE MODE IS ALREADY ANSWERED.
       *
       * This screen used to carry Race and Freestyle side by side, each
       * naming a location and each really asking the same question the gate
       * above now asks once. A pilot who had decided to race still had to
       * read a Freestyle row to get past it, and the two rows disagreed
       * about what the seat was: Race named the loaded track, Freestyle
       * named a remembered world that was not seated and would not be
       * flown.
       *
       * So there is one row, it belongs to the mode that was chosen, and it
       * names WHAT FLY WOULD LAUNCH rather than what was picked last. Track
       * in Race, Map in Freestyle, and the room behind each of them is the
       * one it always was.
       *
       * Fly stays first and stays the primary. It is the verb, it names what
       * it will launch, and it is never on the room cycle: overshooting into
       * a launch out of an unsaved firmware edit is the failure that rule
       * exists to prevent.
       */
      const world = seatedFreestyleMap(s);
      /* A map from the board is flown in the built world, and the row names
       * that map and its builder rather than calling it Your map. */
      const shared = world && world.id === 'built' ? this.sharedMap : null;
      const modeRow = this.mode === 'freestyle'
        ? {
          label: 'Map',
          value: shared ? shared.name : (world ? world.name : 'Not loaded'),
          action: 'freestyle',
          /*
           * "Map" again, beside the world that is seated. From 30 August it
           * read "The town", labelled for the room because there was no
           * choice in it: one freestyle world, seated by the gate, and "Map:
           * Choose one" had sent a pilot into a picker with one option. Your
           * map made it a choice again (FREESTYLE-MAPS-PLAN.md, section 6),
           * and "The town" over "Your map" named the one world that was not
           * going to be flown.
           */
          note: shared
            ? `${shared.name}${shared.author ? `, built by ${shared.author}` : ''}, from the board. Your quad and the physics model are in here.`
            : (world
              ? `${world.note} Your quad and the physics model are in here.`
              : townNote(s, this.loadFailure)),
        }
        : {
          label: 'Track',
          value: seat ? seat.name : 'Choose one',
          action: 'courses',
          note: seat
            ? `${seat.name}, and every other track. Gated, against the clock, and a lap flown here can go on the board.`
            : 'No track is seated yet. Your own tracks, every track the board is offering, and the builder, are in here.',
        };
      /*
       * THREE ROOMS AND A VERB, in place of twelve typographic equals.
       *
       * Tune, PIDs and Rates were built once and spread onto four screens,
       * so "where do I change my rates" had four correct answers with
       * different surrounding context, and only the Pause copies carried
       * the warning that changing mid-run resets you to the start line.
       * They are in exactly one room each now.
       *
       * Each room row carries a MANIFEST of what is inside it. The flat
       * list this replaces was an inventory, and a row of closed doors
       * would be a downgrade: the word "rates" still has to appear on the
       * front page or a pilot who knows what they want cannot see where to
       * go.
       *
       * Fly is the verb and stays first and stays the primary. It is never
       * a room, because overshooting a shoulder detent into a launch out of
       * an unsaved firmware edit is the failure that rule exists to
       * prevent.
       */
      /*
       * THE FIRST FLIGHT, WHICH IS NOW A VERB AND NOT A SCREEN.
       *
       * A pilot's first visit used to be met by its own three row menu:
       * First flight, I have flown before, Credits. That screen asked
       * whether they had flown before in order to decide what to show them,
       * which is a question about the product rather than about flying, and
       * it stood between them and the one question this shell actually
       * needs answered.
       *
       * So it is gone, and the guided flight it existed to offer is the
       * primary row here instead: same action, same three prompts, one
       * screen later and behind a choice they have already made.
       *
       * Race only, and only with a track under them, because the guide is
       * three lines that talk about gates and src/main.js retires it on the
       * first frame of a gateless world. Offering it in Freestyle would be
       * a row that promises a tutorial and delivers silence.
       */
      const guide = this.firstRun && this.mode === 'race' && this.seatMatchesMode();
      const flyRow = guide
        ? {
          label: 'First flight',
          action: 'firstflight',
          primary: true,
          note: seat && seat.name
            ? `${seat.name}, levelled off, with the sticks drawn on screen and a prompt at each step.`
            : 'Levelled off, with the sticks drawn on screen and a prompt at each step.',
        }
        : {
          label: 'Fly',
          action: 'fly',
          primary: true,
          /* Which of the two Fly does, said before it is pressed: see
           * launchCardSeen. */
          note: seatIsRace(s) && this.seatMatchesMode()
            ? (launchCardSeen(s)
              ? `Straight to the starting blocks${seat && seat.name ? ` of ${seat.name}` : ''}, set up as last time. Before you fly is under the track in Tracks.`
              : 'Before you fly first: the laps, the pack and what this run counts as, then the grid. Once per track each visit.')
            : undefined,
        };
      return [
        ...(trouble ? [trouble] : []),
        flyRow,
        modeRow,
        /*
         * THE TRICK LIST IS WITHDRAWN UNTIL THE SCORING IS SETTLED.
         *
         * Two rows opened it, this one and its twin in the Freestyle room,
         * and both are gone. The screen, its catalogue, its films and the
         * checks that cover it are all still here and still correct: what
         * was removed is the way in, because a list of what the scorer pays
         * for is a promise about a scorer that is not finished, and the
         * scoring switch one room over still wears a warning colour for the
         * same reason.
         *
         * When it comes back it belongs HERE, on the first screen a
         * freestyle pilot sees, and that is worth keeping written down. It
         * used to live only inside The town, one door further in than
         * anybody looks, and the report from real play was "I can't see the
         * catalogue of tricks, there is no UI element". There was one, behind
         * a door labelled with the name of a place. Restoring it is this
         * comment turned back into a row.
         */
        /*
         * THE QUAD ROW NAMES THE QUAD. It showed the tune, so the pause menu
         * read "Betaflight default" twice, one row above the other, and a
         * pilot asked what they were flying got the name of a PID file
         * (MENUS-PLAN.md 1.3). The tune is one row inside, under its name.
         */
        {
          label: 'Quad',
          value: airframeById(s.airframe).name,
          action: 'quad',
          note: 'The machine. The aircraft, its tune and PIDs, camera angle, field of view, flight mode and the firmware bench, which is every Betaflight key the module compiles.',
        },
        {
          /*
           * "PILOT" IS THE ONE ROOM WHOSE NAME DOES NOT SAY WHAT IS IN IT,
           * and the thing in it is the single most reported subject on the
           * board.
           *
           * A pilot hunting for their radio scans this column and reads
           * Fly, Track, Quad, Settings, How to fly, FPV wiki, Tracks and
           * Times, Credits. Nothing there is a radio. Quad is the closest
           * word and it is the wrong room. So they conclude the product has
           * no calibration, which is what the owner concluded, and what
           * "I cant map my sticks to the correct commands, or cant find the
           * setting" was already saying a day before that.
           *
           * The note has said "your radio, calibration" all along, and a
           * note is only shown for the row under the cursor, so it is read
           * by somebody who has already guessed right. The label is what
           * gets scanned.
           *
           * The row id is built from `action` rather than the label, so
           * this costs no id and nothing that names rows has to move.
           */
          /*
           * NO VALUE. It showed the pilot's name, so a pilot who had not set
           * one read "Settings: Not set" as settings nobody had made
           * (MENUS-PLAN.md 1.2). A set name is already the Pilot chip in the
           * top right; Your name inside still says Not set.
           */
          label: 'Settings',
          action: 'pilot',
          note: 'You and your radio. Your name, choosing a joystick, Calibrate sticks, rates, graphics and sound.',
        },
        { label: 'How to fly', action: 'howto', note: 'The sticks, live, and what the keys do.' },
        {
          label: 'Tracks and times',
          action: 'leaderboard',
          note: 'Every published track and map, the times flown on them and who flew them. Opens in a new tab.',
        },
        /*
         * ABOUT, where Credits, Support and the FPV wiki were three rows of
         * the front page answering "who made this" (MENUS-PLAN.md 2.1). The
         * room behind it is the credits roll with those doors, Partners and
         * Report a bug on it. The action is still `credits`, so the row id,
         * the #credits address and the checks that name it do not move.
         */
        {
          label: 'About',
          action: 'credits',
          note: 'Who made this and whose work it stands on, the partners who back it, Patreon, the FPV wiki, and reporting a bug.',
        },
        /*
         * THE WAY BACK TO THE GATE, AND IT IS A ROW NOW.
         *
         * It was the Escape key and a line of legend text at the foot of
         * the screen. The text was a hit area, which nobody could tell by
         * looking at it: it sits in the row that reads "Move  Choose  Esc",
         * which is a key legend everywhere else in the shell, so a pilot
         * who had answered the gate had one visible route back and it was a
         * key. Reported as exactly that.
         *
         * It goes last, under Credits, because it is the only row that
         * leaves this screen upwards rather than opening something on it.
         * There was no room for an eleventh row here and there still is
         * not: this one is affordable because Report bug, give feedback
         * left the list at the same time. That form is the floating chip
         * again, on every screen except this one, and on F8.
         *
         * Named for where it lands rather than called Back, for the reason
         * legendFor gives: Back on the front page reads like it leaves the
         * game, and a pilot looking for the other mode or the other machine
         * is looking for the screen that offers both.
         */
        { label: this.gateLabel(), action: 'mode-gate', note: 'The cards: five inch racing, whoop racing, freestyle and the builder. Changing your mind about any of it starts here.' },
      ];
    }
    if (this.screen === 'howto') {
      return [{ label: 'Back', action: 'back' }];
    }
    /*
     * STICK HELP'S WAYS ON, in the order the screen argues for them. The
     * wizard first, because a bar that moves means the browser has the stick
     * and a minute of calibrating is the whole fix. The pad picker last of
     * the three, for the pilot whose bars are somebody else's device.
     *
     * ROUND TRIPS, so their own actions. The two wizard rows here come BACK
     * here when the wizard ends, saved or cancelled, where the ones in
     * Settings go back to Settings: the next thing a pilot who has just
     * calibrated wants is to move the stick that was dead and watch it
     * arrive, and this is the screen that shows that. Settings stays the one
     * room that holds calibration, which lint:input asserts by the
     * `calibrate` action, and these are doors into the same wizard from the
     * one screen that sends people to it.
     */
    if (this.screen === 'stickhelp') {
      return [
        {
          label: 'Calibrate sticks',
          action: 'stickhelp-calibrate',
          primary: true,
          note: 'Centre, full range, then one named move per stick. It maps whatever axis actually'
            + ' moves, so a stick the sim has on the wrong channel is fixed by this. A stick no bar'
            + ' moves for is not: the block above says where that one is lost.',
        },
        {
          label: 'Check sticks',
          action: 'stickhelp-check',
          note: 'The mapping flying now, live. Reverse a channel that goes the wrong way, or put the'
            + ' sticks on the other hands.',
        },
        {
          label: 'Choose joystick',
          value: (this.padInfo && this.padInfo.using) || 'Keyboard',
          action: 'choosepad',
          note: padChooseNote(this.padInfo, this.radioBlind),
        },
        { label: 'Back', action: 'back' },
      ];
    }
    /*
     * THE PARTNERS' ROW lives here, under the roll that names them, and not
     * on the front page, which has had no room for an eleventh row since
     * the gate's row came (see THE WAY BACK TO THE GATE). Credits is where
     * the front page already sends a pilot asking who is behind this, and
     * its note says the partners are in it.
     */
    if (this.screen === 'credits') {
      return [
        {
          label: 'Partners',
          action: 'partners',
          note: `${PARTNERS.map((p) => p.name).join(', ').replace(/, ([^,]*)$/, ' and $1')}. Opens their page on the board in a new tab.`,
        },
        { label: 'Support', action: 'support', note: PATREON_NOTE },
        { label: 'Buy Mat a battery ($5)', action: 'tip', note: TIP_NOTE },
        { label: 'Instagram', action: 'instagram', note: INSTAGRAM_NOTE },
        {
          label: 'FPV wiki',
          action: 'wiki',
          note: 'The closed loop, the plant, and every Betaflight 4.5.1 key. Opens the wiki on webfpv.org.',
        },
        /*
         * A REPORT FROM THE FRONT DOOR, for the one pilot who had none. The
         * title deliberately carries no bug chip, and a phone has no F8, so
         * a touch pilot could not report anything without first flying
         * (MENUS-PLAN.md 1.41). This is that door, one row from the title.
         */
        {
          label: 'Report a bug',
          action: 'reportbug',
          note: 'Something wrong, or something to say: the form takes a title and a sentence, and sends the map, graphics and browser with it. F8 opens it from anywhere.',
        },
        { label: 'Back', action: 'back' },
      ];
    }
    /*
     * Courses. ONE SCREEN WHERE THERE WERE THREE.
     *
     * Reaching the track builder used to be Title, Track builder, Create /
     * edit map, then the builder, or Title, Map, Custom map, Create / edit
     * map, then the builder. Two routes to the same page with three screens
     * in between, and every one of those screens asked the player to choose
     * before it showed them anything to choose between. Choose new map did
     * not even list courses: it opened the board in a new tab, whose own Fly
     * button then opened a second simulator.
     *
     * So: worlds and five courses from the board in one grid, the builder
     * one row away from all of it. Start a new course is the builder's own
     * New button, which is where it belongs.
     */
    if (this.screen === 'courses') {
      if (this.coursesLede) {
        const af = airframeById(this.settings.airframe);
        this.coursesLede.textContent = `Tracks for the ${af.name.toLowerCase()}. Quad changes the aircraft.`;
      }
      const listing = liveListing('custom');
      const loaded = hasLoadedTrack();
      const seat = loaded ? activeCourseSummary() : null;
      /*
       * Everything in this room is a track, so there is nothing to segment
       * and no heading that contradicts the screen title. The freestyle
       * worlds moved to their own room; what is left is the seated course
       * and whatever the board is offering.
       */
      const cards = [];
      if (loaded && seat) {
        const chip = courseChip(listing);
        cards.push({
          label: seat.name,
          note: `${chip.note} ${seat.gates} gate${seat.gates === 1 ? '' : 's'}. ${CARD_PRESS_NOTE}`,
          course: { kind: 'current', seat },
          action: 'map:custom',
        });
      }
      /*
       * THE PILOT'S OWN TRACKS, out of this browser's library.
       *
       * TWO SOURCES ON THIS SCREEN AND NO THIRD: what is on the board, and
       * what is in this browser. That is the rule now, and it replaced a
       * third source that broke it.
       *
       * The tracks that ship with the simulator used to be listed here, on
       * the argument that the RaceGOW5 set was otherwise reachable only
       * from the builder's Load dialog, which a pilot who just wants to fly
       * never opens. What that argument missed is that a shipped track is a
       * COPY of something that is also on the board, under a different id,
       * and the copy answers to nobody. Taking RaceGOW5 Track 5 off the
       * board did not take it off this screen, and Track 1, which is still
       * on the board, was listed twice: once as itself and once as its
       * shipped twin. A pilot cannot be expected to know which of two
       * identical cards is the one with times on it.
       *
       * So the shipped set reaches pilots the way every other track does,
       * by being on the board (scripts/boardpresets.js publishes it), and
       * this screen lists the board and the library. Take a track off the
       * board and it leaves this screen. That is the whole point.
       *
       * The library is still listed in the builder's Load dialog with the
       * shipped set beside it, which is where a shipped track belongs: it
       * is something to open and make yours, not something to race against
       * a board that has never heard of it.
       *
       * Built once on entry to the screen rather than here, because items()
       * runs on every cursor move and this reads and normalises a document
       * per track. See loadLocalCourses.
       */
      const seatedId = seat && seat.doc ? seat.doc.id : null;
      for (const t of this.localCourses || []) {
        /* The card on the canvas is already the top card. Showing it twice
         * is the same confusion the shipped twins caused. */
        if (t.id === seatedId) {
          continue;
        }
        cards.push({
          label: t.name,
          note: `Yours, saved in this browser. ${t.gates} gate${t.gates === 1 ? '' : 's'}. ${CARD_PRESS_NOTE}`,
          course: { kind: 'local', track: t },
          action: `local:${t.id}`,
        });
      }
      /*
       * BUILD A TRACK IS A CARD NOW, at the end of the pilot's own half
       * (MENUS-PLAN.md 2.4). It was the first of eight rows under thirty
       * one cards, two screens down. A card is where a pilot looking at
       * tracks is looking, and the end of their own half is where a new one
       * of theirs would appear.
       */
      cards.push({
        label: 'Build a track',
        note: `Opens the builder on an empty field. Whatever was on its canvas is kept in its Load list. ${KEEP_NOTE}`,
        course: { kind: 'new' },
        action: 'trackbuilder-new',
      });
      for (const t of orderedCourses(this.boardCourses || [], s.courseOrder)) {
        cards.push({
          label: t.name,
          note: t.designer
            ? `Designed by ${t.designer}${t.series ? ` for ${t.series}` : ''}${t.author ? `, published by ${t.author}` : ''}. ${CARD_PRESS_NOTE}`
            : (t.author
              ? `Published by ${t.author}. ${CARD_PRESS_NOTE}`
              : `A published track. ${CARD_PRESS_NOTE}`),
          course: { kind: 'board', track: t },
          action: `board:${t.id}`,
        });
      }
      /*
       * A CARD THE PLAYER HAS CHOSEN OPENS ITS SHEET, drawn under the card's
       * own line of the grid (placeCourseSheet), not at the foot of the
       * page. The seated track's eight rows used to sit under all thirty one
       * cards, two screens below the card they acted on, three of them
       * greyed out; they are that card's sheet now, and a row that cannot
       * apply is not drawn (MENUS-PLAN.md 2.4).
       */
      const chosen = this.cardSubject
        ? cards.find((c) => c.course && courseCardKey(c) === this.cardSubject)
        : null;
      if (chosen) {
        const seatRows = chosen.course.kind === 'current'
          ? [
            {
              label: 'Before you fly',
              action: 'card-launch',
              note: 'Laps, pack charge, flight model, radio link and the ghost: what this run counts as. Opens the launch card, which has its own Fly.',
            },
            ...applicableRows([
              uploadAction(listing, {
                timePosted: this.timePosted,
                practice: s.laps === PRACTICE_LAPS,
              }),
              publishAction(listing, this.coursePublished),
            ]),
            editAction(listing, seat),
            ...(listing && listing.shareId ? [
              {
                label: 'Standings',
                action: 'standings',
                note: `Every time posted on ${seat ? seat.name : 'this track'}, fastest first. Opens here.`,
              },
              {
                label: 'This track on Tracks and times',
                action: 'seat-board',
                note: 'Its page on the public board, opened on this track. A link to send somebody. Opens in a new tab.',
              },
            ] : []),
          ]
          : [];
        return [...cards, ...courseCardRows(chosen, seatRows)];
      }
      return [...cards, { label: 'Back', action: 'back' }];
    }
    /*
     * FREESTYLE. One town and no ceremony.
     *
     * There is deliberately no launch card here. Racing is a measured run and
     * earns a moment to check what it is measured as; freestyle has no clock,
     * no lap, no ghost and no board, so asking would be ceremony. The one row
     * under the grid is the quad, because that is the only thing a freestyle
     * pilot changes between flights, and the line under it is a readout:
     * SIM_ARCADE is a plant flag and is not gated on race mode, so arcade
     * changes a freestyle flight too and nothing else was saying so.
     */
    if (this.screen === 'tricks') {
      return this.trickRows().map((t) => ({
        label: t.name,
        value: `${formatScore(t.points)}`,
        note: `${t.status.tag}. ${t.difficulty}. ${t.how}`
          + ` Seen ${VIEW_LABEL[t.view].replace('seen ', '')}.`,
        action: 'noop',
      }));
    }
    if (this.screen === 'freestyle') {
      /*
       * THE CARDS ONLY EXIST IF THERE IS A CHOICE.
       *
       * With one freestyle world this room drew one card, and a grid of one
       * card is not a picker, it is a picture of the place the pilot is
       * already seated in. The gate seats it directly now, so what is left
       * here is what a freestyle pilot actually comes looking for: the quad
       * and the physics model. The card machinery stays because the day a
       * second world lands it is a registry entry and nothing else.
       *
       * AND WHEN NO WORLD IS SEATED, because then there is a choice to make
       * even with one world: load it or not. A load that fails puts the old
       * seat back (bug-850375dc), and without the card this room is the
       * one place in the menu that says "The town" and cannot load it.
       */
      const worlds = MAPS.filter((x) => x.mode === 'freestyle');
      const cards = worlds.length > 1 || !seatedFreestyleMap(s) ? worlds.map((x) => ({
        label: x.name,
        note: x.note,
        map: x,
        action: `map:${x.id}`,
      })) : [];
      /* The board's maps, after the worlds and before the rows, because the
       * rows are whatever follows the last card. See loadBoardMaps. */
      const boardCards = (this.boardMaps || []).map((m) => ({
        label: m.name,
        note: `${[m.author ? `Built by ${m.author}` : 'A published map', ...mapFacts(m)].join(', ')}. Choosing it loads the map from the board and flies it here.`,
        boardMap: m,
        action: `boardmap:${m.id}`,
      }));
      return [
        ...cards,
        ...boardCards,
        /*
         * FIRST, because it is the only choice on this screen that changes
         * what the next two minutes ARE.
         *
         * AND IT WEARS THE WARNING WHEN IT IS SWITCHED ON. row-warn is the
         * amber instrument colour the file already uses for a row that is
         * telling a pilot something about the state of the machine rather
         * than offering them something (see padTroubleItem), and an
         * unfinished scorer is exactly that. It is on the ROW rather than
         * in a popup because a popup is dismissed once and then the pilot
         * flies for an hour: this stays amber for as long as the thing it
         * is warning about is on, and goes quiet the moment it is off. So
         * it is quiet with Manga and scoring off too, when no trick name is
         * drawn at all: see SCORING_UNDRAWN.
         */
        {
          ...choice(
            'Scoring',
            scoringNote(s.freestyleScoring, s.map, Boolean(this.sharedMap), s.mangaAndScoring),
            FREESTYLE_SCORING,
            s.freestyleScoring,
            (id) => FREESTYLE_SCORING_LABEL[id],
            (id) => { s.freestyleScoring = id; },
          ),
          rowClass: s.freestyleScoring === 'off' || !s.mangaAndScoring ? undefined : 'row-warn',
          /* Enter opens the list rather than stepping it: this row is the
           * first thing the cursor lands on in this room, and switching an
           * unfinished feature on is a pick, not a nudge. See select(). */
          pickOnly: true,
        },
        /*
         * The Freestyle room's Trick list door, withdrawn with the one on
         * the title until the scoring is settled. See the note there for
         * why, and for where it goes back. It belonged beside the scoring
         * row above it, which is the row it is really about.
         */
        /*
         * A DOOR, not a copy, and it is spelled the way the other two rooms
         * that carry it spell it.
         *
         * It was labelled Tune and opened Quad, which was fine while Tune on
         * Quad was a picker. It stopped being fine when the picker moved:
         * Tune on Quad and on the pause menu opens the PIDs room, so a pilot
         * who had learned that pressed Tune here and landed on a different
         * screen with another Tune row to press. One label, two destinations.
         *
         * Pointing it at the PIDs room instead was the wrong repair and the
         * shell check said so in two lines: this was Freestyle's ONLY way
         * into Quad, so the camera, the flight mode, the aircraft and the
         * bench all went out of reach from here. The title and Before you
         * fly both solve this already with a row called Quad valued at the
         * tune's name, and what this row is IS that row. So it is that row.
         * What you are about to fly is still on it, as the value: the
         * aircraft since 2026-10-01, as on the title (MENUS-PLAN.md 1.3).
         */
        {
          label: 'Quad',
          value: airframeById(s.airframe).name,
          action: 'quad',
          note: `The machine. Its Tune row opens ${SCREEN_TITLES.pids}, where the tune is chosen and Betaflight's own sliders adjust it, and the camera, the flight mode and the firmware bench are there too.`,
        },
        /*
         * SETTABLE HERE, because there is nowhere else a freestyle pilot
         * can reach it.
         *
         * It was an info row pointing at the launch card, and freestyle
         * deliberately has no launch card: no clock, no lap, no board, so
         * nothing to declare. That left the one flag which DOES change a
         * freestyle flight as a read-only line naming a screen the pilot
         * could not get to. Reported as "physics model doesn't do
         * anything", and it did not.
         *
         * It is the same setting the launch card carries, so a race pilot
         * still meets it in the moment before a run where it decides what
         * the time counts as. This copy is not a duplicate of a value with
         * a home elsewhere: freestyle IS the other home.
         */
        choice(
          'Flight model',
          s.flightStyle === 'arcade'
            ? 'Arcade: the ideal quad. No propwash shake, no gyro noise, no build asymmetry. It is a plant flag, so it changes a freestyle flight exactly as much as it changes a race.'
            : 'Expert: the full physics, propwash, gyro noise and build tolerance included. Arcade turns the imperfections off for a friendlier machine. Takes effect on the next flight.',
          FLIGHT_STYLES,
          s.flightStyle === 'arcade' ? 'arcade' : 'expert',
          (id) => (id === 'arcade' ? 'Arcade' : 'Expert'),
          (id) => { s.flightStyle = id; },
        ),
        /*
         * THE DOOR TO THE OTHER HALF OF YOUR MAP. The world card above flies
         * it; this makes it. It opens the builder on its freestyle canvas,
         * which is a seat of its own, so a race track in progress is never
         * touched by it and never flown as a map.
         */
        {
          label: 'Build a map',
          action: 'mapbuilder',
          note: 'Opens the builder on the freestyle canvas. Place buildings, a crane, containers, a skate set and named gaps, then fly it here as Your map.',
        },
        { label: 'Back', action: 'back' },
      ];
    }

    /*
     * QUAD: the machine. Everything that is carried with a posted time.
     *
     * A DEPTH LADDER, not a flat list, and the rungs are numbered on screen
     * because the whole point is that a pilot can stop at the first one. A
     * beginner never leaves rung 1, one choice that sets a whole tune. A
     * tuner lives on rung 2, Betaflight's own simplified sliders. An expert
     * takes the door to rung 3, and it is visibly a door rather than a row
     * in a list.
     */
    if (this.screen === 'quad') {
      /*
       * The mid-run warning travels with the ROOM, not with one screen's
       * copy of a row. Pause used to reach Settings by a route that showed
       * the same Tune row WITHOUT the warning, so whether a pilot was told
       * that changing it resets them to the start line depended on which
       * of four doors they came through. A room reached from a paused run
       * says it, every row, every time.
       */
      const midRun = this.returnTo === 'paused';
      return [
        /*
         * Aircraft sits under the tune's own heading rather than under one
         * of its own, and the heading is renamed to cover both. Two reasons,
         * and the second is the real one. A machine and its tune are one
         * subject: the tune list below is the aircraft's, so a heading that
         * separated them would be drawing a line where the data does not
         * have one. And scripts/shell-check.js records this screen's
         * overflow and fails when it grows, which a heading of its own did:
         * 55 px to 135. The row is what the pilot needs; the heading was
         * decoration, and decoration is what gives way.
         */
        { label: 'The machine', section: true },
        craftItem(s, midRun),
        tuneItem(s, midRun),
        {
          label: 'Firmware bench',
          action: 'fc',
          note: `Every Betaflight 4.5.1 key the module compiles, tab by tab, in Configurator’s own colours. Opens as a tool, in its own frame. Save becomes Your edits and the Tune row above starts naming it; the picker that puts you back on stock is in ${SCREEN_TITLES.pids}. There is no CLI paste.`,
        },
        { label: 'Camera', section: true },
        this.cameraAngleRow(s),
        choice(
          'Field of view',
          'Wider sees more, narrower magnifies. 75 matches what an FPV lens does to the middle of the frame; 85 gives some of that back for width; 115 is the widest this projection can honestly offer, about 145 degrees corner to corner, and the gates will look smaller for it.',
          CAMERA_FOVS,
          s.cameraFov,
          (n) => `${n} degrees vertical`,
          (n) => { s.cameraFov = n; },
        ),
        { label: 'Flight', section: true },
        choice(
          'Flight mode',
          'Acro: sticks are rates, hands off holds attitude. Angle: sticks are tilt, hands off levels. A radio, a gamepad, thumb sticks and every freestyle flight fly this one, because Angle holds the craft to about thirty degrees of bank and no trick in the book can be flown in it. M in flight switches whichever one you are flying, and keeps it.',
          FLIGHT_MODES,
          s.flightMode === 'angle' ? 'angle' : 'acro',
          (id) => (id === 'angle' ? 'Angle' : 'Acro'),
          (id) => { s.flightMode = id; },
        ),
        /*
         * THE KEYBOARD'S OWN MODE, AS A ROW. A race on keys flies
         * keyRaceMode, not the row above (modeKey in src/main.js), and the
         * only way to change it was M in flight. So on a keyboard the room
         * showed Acro selected over a quad captioned ANGLE, and both were
         * true (MENUS-PLAN.md 1.16). Shown while the keyboard is the stick
         * path, which is when it decides anything.
         */
        ...((!this.padInfo || !this.padInfo.count) && !touchWanted() ? [choice(
          'Keyboard races',
          'How a race flies on the keyboard. Angle by default: a key is on or off, so letting go levelling the quad is what makes keys flyable. Acro if you have learned to fly keys on rates. M in flight switches it too, and keeps it.',
          FLIGHT_MODES,
          s.keyRaceMode === 'acro' ? 'acro' : 'angle',
          (id) => (id === 'angle' ? 'Angle' : 'Acro'),
          (id) => { s.keyRaceMode = id; },
        )] : []),
        toggle(
          'Launch control',
          'Betaflight race start, off by default. When on, press L on the start line, pitch forward, centre the stick, then punch throttle. The quad holds the angle until you go.',
          Boolean(s.launchControl),
          (v) => { s.launchControl = Boolean(v); },
        ),
        /*
         * FLIGHT FEEL TUNING, the mode's switch. On, it adds Air grip and
         * Motor power to the room as rows and to the flight screen as
         * sliders beside Weight; the question about a tuned flight is its
         * other half. The rows after the switch exist only while it is on,
         * so a pilot who never turned it on sees one more row and no more.
         */
        ...(this.tuneCaps.air || this.tuneCaps.kv ? [tuningItem(s, this.tuneCaps)] : []),
        ...this.tuneRows(s, true),
        /*
         * A SIGNPOST, not a copy. Rates are the pilot's, and configs/rates.js
         * says so in capitals: no tune here sets rates. Putting the real row
         * here would be the four-copies-of-Tune problem starting again, so
         * this row says where they are and what they are, and goes there.
         *
         * It stays, and one thing about it changed when the Aircraft row
         * landed above: "stay put when you switch tunes" was the whole of
         * the claim and is now only half of it. Rates are still the pilot's,
         * but changing the AIRCRAFT reseeds them if they are still the
         * outgoing machine's stock profile, because the maker ships 580 deg/s
         * on a racing whoop against Betaflight's 670 for a five inch. The
         * note says both.
         *
         * scripts/shell-check.js also walks freestyle to Quad to Rates and
         * back twice and asserts it lands where it started, so this row is
         * load bearing navigation as well as a signpost.
         */
        {
          label: 'Rates',
          value: ratesShort(s.rates),
          action: 'rates',
          note: `Not the machine's. Rates are yours, so they live under ${SCREEN_TITLES.pilot} and stay put when you switch tunes. Changing the aircraft reseeds them only if you are still on stock rates. This row goes there, and changing them mid run leaves the quad where it is.`,
        },
        { label: 'Back', action: 'back' },
      ];
    }

    /*
     * PILOT: you and your sticks. What survives changing the quad.
     */
    if (this.screen === 'pilot') {
      const ids = musicIds();
      const name = readPilotName();
      /* Same contract as Quad above. */
      const midRun = this.returnTo === 'paused';
      return [
        { label: 'You', section: true },
        {
          label: 'Your name',
          value: name || 'Not set',
          action: 'setname',
          note: name
            ? 'Posted times and published tracks carry this name. Changing it updates the board for tracks you published from this browser.'
            : `Needed to publish a track or post a time. ${nameRules()}`,
        },
        { label: 'Sticks', section: true },
        {
          label: 'Choose joystick',
          value: (this.padInfo && this.padInfo.using) || 'Keyboard',
          action: 'choosepad',
          note: padChooseNote(this.padInfo, this.radioBlind),
        },
        { label: 'Calibrate sticks', action: 'calibrate', note: 'Centre, full range, then one named move per stick. Saved after you check it.' },
        /*
         * THE WAY BACK TO THE ONLY SCREEN THAT SHOWS A MAPPING.
         *
         * The wizard's check step draws the live gimbals, every axis, and
         * the reverse control, and it used to sit behind six steps. A pilot
         * who found a backwards channel afterwards had to redo the whole
         * calibration to reach it, with the same chance of the same wrong
         * push: "some are inverted and there's no option to change it".
         * This opens that step by itself, against the mapping already
         * saved, so a one channel repair costs one row instead of a minute.
         */
        {
          label: 'Check sticks',
          action: 'calibrate-check',
          note: 'Your saved mapping, live, without calibrating again. Move a stick and watch it:'
            + ' if it goes the wrong way, one key reverses that channel, and if the wrong stick'
            + ' moves on screen, one key puts them on the other hands. Nothing is kept until you save.',
        },
        /*
         * THE ONE FOR A STICK THAT DOES NOTHING AT ALL, which the two above
         * cannot help with when the stick never reaches the browser. Always
         * here, not only when a verdict is up, because the pilot who knows
         * their yaw is dead should not have to fly twenty seconds to be let
         * in. See STICK HELP in src/input/input.js.
         */
        {
          label: 'Stick help',
          action: 'stickhelp',
          note: 'A stick that does nothing? Move it here and watch every axis your radio sends.'
            + ' That tells the sim, the browser and the radio apart, and says what fixes each.',
        },
        /*
         * RESTART FROM THE RADIO, bug-a25bc2dd: "As people start to grind
         * tracks they will need ready access to a restart race hot key...
         * can be assigned to an AUX on the radio too." R was the only way
         * that did not go through the pause menu, and it is on the keyboard.
         * Only offered with a radio, because on the keyboard it is R. See
         * noteRestartSwitch in input.js.
         */
        ...(this.padInfo && this.padInfo.count > 0 && this.padInfo.using !== 'Keyboard' ? [{
          label: 'Restart switch',
          value: this.padInfo.restartCapturing ? 'Flip it now' : (this.padInfo.restart || 'Not set'),
          action: 'restart-switch',
          note: this.padInfo.restartCapturing
            ? 'Flip the switch or press the button you want to restart with. Choose this row again to stop.'
            : (this.padInfo.restart
              ? 'In flight, flipping it takes you back to the start line, like R on the keyboard. Choose this row to pick another.'
              : 'A switch or button on your radio that takes you back to the start line in flight, like R on the keyboard. Choose this row, then flip it.'),
        }] : []),
        ...(this.padInfo && this.padInfo.restart && !this.padInfo.restartCapturing ? [{
          label: 'Forget restart switch',
          action: 'restart-switch-clear',
          note: 'R on the keyboard still restarts.',
        }] : []),
        /*
         * WHICH STICK CARRIES WHICH CHANNEL, and it sits here because the
         * two rows above are the other two things a pilot does to their
         * sticks before flying.
         *
         * Four options fit inline as segments, which is the whole reason
         * modes 3 and 4 are offered: they are a row in a table rather than
         * a code path, and the strip has room. A standard gamepad flies it
         * too until calibrated: see standardGuessMap in input.js. The note
         * says plainly that a radio does not need this, because a radio pilot who changes it
         * expecting their transmitter to follow would be confused by a
         * setting that only redraws the screen for them.
         */
        choice(
          'Stick mode',
          'Which stick is throttle and which is yaw, the way your radio is set up.'
          + ' Mode 2 is throttle on the left, which is what this page has always been.'
          + ' Mode 1 puts throttle on the right and pitch on the left.'
          + ' This flies the THUMB STICKS, the KEYBOARD and a GAMEPAD that has not been'
          + ' through Calibrate sticks, none of which has a mode of its own. A radio'
          + ' already applies its own mode before this page sees a stick, so for a radio'
          + ' this only names the sticks drawn on screen.',
          STICK_MODES,
          s.stickMode,
          (n) => `Mode ${n}`,
          (n) => { s.stickMode = normaliseStickMode(n); },
        ),
        /*
         * WHAT THE THROTTLE KEYS DO WHEN LET GO, beside the row that decides
         * which keys they are. bug-3a7be142: "it snaps strangely, and doesn't
         * hold position like a real radio", asking for "an option to toggle
         * snapping, or for the throttle to hold position". The note says it
         * is the keyboard only, for the same reason the Stick mode note says
         * what a radio ignores.
         */
        choice(
          'Keyboard throttle',
          s.keyThrottle === 'hold'
            ? 'Stays put: the throttle keys move the throttle and it stays wherever you leave it, the way a radio\'s does. A tap moves it about a percent, a longer hold moves it faster. The keyboard only.'
            : 'Springs back: a tap nudges, a hold climbs, and letting go settles the throttle at hover for this quad, its weight, its throttle cap and its pack, so it holds height. Back on the ground it goes to idle. The keyboard only.',
          KEY_THROTTLE_MODES,
          s.keyThrottle,
          (id) => (id === 'hold' ? 'Stays put' : 'Springs back'),
          (id) => { s.keyThrottle = normaliseKeyThrottle(id); },
        ),
        ratesItem(s, midRun),
        choice(
          'Radio link',
          s.link === 'perfect'
            ? 'No radio: every frame arrives, exactly on time. Feedforward and RC smoothing read that cadence, so this is sharper than any real link.'
            : `${LINK_PRESETS[s.link].hz} Hz, ${LINK_PRESETS[s.link].delayMs} ms delay, ${LINK_PRESETS[s.link].jitterMs} ms jitter. Records set on a perfect link are not comparable.`,
          Object.keys(LINK_PRESETS),
          s.link,
          (id) => LINK_PRESETS[id].label,
          (id) => { s.link = id; },
        ),
        { label: 'Screen', section: true },
        graphicsItem(s, this.autoScaleNow),
        toggle(
          'Shadows',
          normalizeGraphics(s.graphics) === 'low'
            ? 'Low draws no shadows at all, so there is nothing to switch. Pick Medium or High to bring them back.'
            : s.shadowsOff
              ? 'Off: no shadows from the sun, and the shadow pass and its lookup in every lit pixel are not drawn. The quickest relief on a laptop that is slow. Changing this rebuilds the world.'
              : 'On: the sun casts shadows, at this preset\'s detail. Turn it off if the picture is slow or the shadow edges bother you. Changing this rebuilds the world.',
          normalizeGraphics(s.graphics) !== 'low' && !s.shadowsOff,
          (v) => { if (normalizeGraphics(s.graphics) !== 'low') { s.shadowsOff = !v; } },
        ),
        /*
         * THE DOOR TO THE KNOBS. Render scale, the frame cap, low latency,
         * predicted view, frame pacing, the input to screen meter and the
         * flight log, one door down: see the Advanced room's comment.
         */
        {
          label: 'Advanced',
          action: 'advanced',
          note: 'Render scale, frame cap, low latency and predicted view, frame pacing, what reaches the screen how fast, and the flight log. For when something is wrong; Auto looks after the picture otherwise.',
        },
        toggle(
          'Fullscreen in flight',
          s.fullscreenFly
            ? 'On: Fly, Restart and Resume go fullscreen, and back to the title gives the window back. Many desktops hand a fullscreen window straight to the display, which can take a frame off the time between your sticks and the picture. Escape leaves fullscreen and pauses, and Resume goes back to it.'
            : 'Off: the page stays in its window. Fullscreen can take a frame off the time between your sticks and the picture on many desktops.',
          s.fullscreenFly,
          (v) => { s.fullscreenFly = v; },
        ),
        /*
         * THE SWITCH OVER ALL OF IT: the manga look everywhere, the black
         * outline round the world on Medium and High, and the score's
         * readouts in flight, and never the counting under them
         * (DEFAULTS.mangaAndScoring). First of the three, because the two
         * after it are finer parts of it, and while it is off their notes
         * say they are waiting on it rather than describing a look that is
         * not there.
         */
        toggle(
          'Manga and scoring',
          s.mangaAndScoring
            ? 'On: the game\'s manga look and its score. The menus\' titles are lettered in the manga hand, Medium and High draw black outlines round the world, and on a freestyle map the score, its combos and the chase are drawn as you fly them. Clean FPV and the Impact frame below trim parts of it.'
            : 'Off: no manga look anywhere, and no score while you fly. No black outlines round the world on Medium and High, as on Low, no speed lines, impact frame or lettering, menus in plain type, and no score, combo or chase meter over the picture. The counting goes on underneath, so a scored run still runs its two minutes and ends on its results.',
          s.mangaAndScoring,
          (v) => { s.mangaAndScoring = v; },
        ),
        /*
         * THE MANGA LAYER'S SWITCH IN FLIGHT (FREESTYLE-MAPS-PLAN.md section
         * 3.3: "a Clean FPV setting turns all of it off in one row"). The
         * note says everything it turns off, the picture's half (Stage F)
         * as well as the lettering's.
         */
        toggle(
          'Clean FPV',
          !s.mangaAndScoring
            ? 'Nothing to do while Manga and scoring is off: every map is already clean. Turn that on and this keeps the score and the chase as plain words and numbers, with no manga look in flight.'
            : (s.cleanFpv
              ? 'On: freestyle maps look and read the way a race track does. No speed lines and no impact frame; callouts are words and numbers, and the results are a list.'
              : 'Off: on a freestyle map, ink speed lines gather at the edges of the picture above about 20 m/s, a crash lands as an impact frame, tricks, gaps and combos are hand lettered like a manga with a small katakana sound effect beside the big ones, and the results come back as a page of panels. Race tracks are always clean.'),
          s.cleanFpv,
          (v) => { s.cleanFpv = v; },
        ),
        /*
         * THE IMPACT FRAME'S OWN ROW, beside the switch that also turns it
         * off: a flash is a photosensitivity question, so it can go without
         * the rest of the look going with it. The note says what it does,
         * that it is never a white flash, and what else stops it.
         */
        toggle(
          'Impact frame',
          !s.mangaAndScoring
            ? 'Nothing to do while Manga and scoring is off: a crash cuts straight to where you are set down. Turn that on and this decides whether a crash holds the moment as an ink panel.'
            : (s.impactFrame
              ? 'On: a crash on a freestyle map holds the moment for a beat as a high contrast ink panel with impact lines, then lets go. Never a white flash, at most one every two seconds. Off under Clean FPV, and whenever your system asks for reduced motion.'
              : 'Off: a crash cuts straight to where you are set down, with no held frame. The rest of the manga look stays.'),
          s.impactFrame,
          (v) => { s.impactFrame = v; },
        ),
        /*
         * THE HUD: what is drawn over the picture in flight. One row for
         * now, the crosshairs, a fixed mark at the centre of the frame.
         * The note says per shape what it is, like Frame pacing's.
         */
        choice(
          'Crosshairs',
          {
            off: 'A mark at the centre of the picture, which is where the camera points. Off: nothing is drawn there.',
            wings: 'Wings: a short line either side of a centre dot, the flat mark a Betaflight OSD draws, fixed at the centre of the picture where the camera points.',
            cross: 'Cross: four short arms round an open centre, fixed at the centre of the picture where the camera points, so what you aim at stays in view.',
            dot: 'Dot: one small dot at the centre of the picture, where the camera points. The least in the way.',
          }[s.crosshair] || '',
          CROSSHAIRS,
          s.crosshair,
          (id) => CROSSHAIR_LABEL[id],
          (id) => { s.crosshair = id; },
        ),
        toggle(
          'Show FPS',
          s.showFps
            ? 'On: the frame rate is drawn in the top corner while you fly, updated twice a second. It is the rate the browser is drawing at, so it reads the display, not the physics.'
            : 'Off: no frame rate on screen. Turn it on to see how smoothly this machine is drawing the flight.',
          s.showFps,
          (v) => { s.showFps = v; },
        ),
        toggle(
          'Stick overlay',
          s.stickOverlay
            ? 'On: two small boxes at the bottom of the flight picture, a dot in each following your sticks, laid out by your Stick mode. Drawn for a radio, a gamepad and the keys; hidden while you fly on the thumb sticks, which are already on screen.'
            : 'Off: no stick boxes on the flight picture. Turn it on to see what your sticks are telling the quad.',
          s.stickOverlay,
          (v) => { s.stickOverlay = v; },
        ),
        toggle(
          'Race line',
          s.raceLine
            ? 'On: in a whoop room, a trail of dots through the next gates shows a good line to fly, from the gate you have just flown to the one after the next. Dots close together mean slow down, amber ones mean slowest. Rooms only, and a few tracks have no line yet.'
            : 'Off: no trail. Turn it on in a whoop room to see a good line through the next gates, drawn as dots.',
          s.raceLine,
          (v) => { s.raceLine = v; },
        ),
        { label: 'Sound', section: true },
        toggle('Sound', 'All sound: motors, wind, music, cues and every lap time called out loud.', s.sound, (v) => { s.sound = v; }),
        stepper('Volume', 'Overall level, the lap call included. Zero to ten.', `${s.volume}`, (d) => {
          s.volume = Math.max(0, Math.min(10, s.volume + d));
        }),
        stepper('Motors', 'The blade pass tone. You fly on its pitch, so keep some of it.', `${s.motorLevel}`, (d) => {
          s.motorLevel = Math.max(0, Math.min(10, s.motorLevel + d));
        }),
        stepper('Wind', 'Air over the airframe. Rises with speed.', `${s.windLevel}`, (d) => {
          s.windLevel = Math.max(0, Math.min(10, s.windLevel + d));
        }),
        stepper(
          'Music',
          'Recorded tracks in flight, and a quieter bed in the menus. One level for both. The skip buttons on screen jump a track.',
          s.musicLevel > 0 ? `${s.musicLevel}` : 'Off',
          (d) => { s.musicLevel = Math.max(0, Math.min(10, s.musicLevel + d)); },
        ),
        choice(
          'Music track',
          s.musicTrack === 'rotation'
            ? 'What flies. A random start, then every track in turn.'
            : 'What flies. This track loops until you skip or pick another.',
          ids,
          s.musicTrack,
          (id) => (id === 'rotation' ? 'Rotation' : trackById(id).name),
          (id) => { s.musicTrack = id; },
        ),
        toggle(
          'Binaural tone',
          'A quiet 1000 Hz tone, 6 Hz apart between the ears. Needs headphones to do anything at all.',
          s.focusTone,
          (v) => { s.focusTone = v; },
        ),
        { label: 'Back', action: 'back' },
      ];
    }

    /* ADVANCED: the rows Settings sends here. See the room's comment. */
    if (this.screen === 'advanced') {
      return [
        { label: 'Picture and latency', section: true },
        gpuItem(this.gpuInfo),
        choice(
          'Render scale',
          'Fewer pixels, then stretched to fit. The one lever that always helps a starved GPU, at the price of sharpness. 100 is native for the preset.',
          RENDER_SCALES,
          s.renderScale,
          (n) => (n >= 100 ? 'Native' : `${n}%`),
          (n) => { s.renderScale = n; },
        ),
        choice(
          'Frame cap',
          'Caps how often the world is drawn. A steady 60 reads better than a heaving 90, and it spares the battery. Sticks are still read and the physics still steps every frame; only the picture waits.',
          FPS_CAPS,
          s.fpsCap,
          (n) => (n === 0 ? 'Uncapped' : `${n} fps`),
          (n) => { s.fpsCap = n; },
        ),
        /*
         * THE SHORT PATH TO THE GLASS, as a row because it can tear and
         * because it is a request a platform may refuse. The note says which
         * happened on this machine, from what the browser actually granted,
         * and that a change waits for the next load: see lowLatency in
         * DEFAULTS and buildShell in src/render/shell.js.
         */
        toggle(
          'Low latency view',
          lowLatencyNote(s.lowLatency, this.gpuInfo),
          s.lowLatency,
          (v) => { s.lowLatency = v; },
        ),
        toggle(
          'Predicted view',
          s.predictView
            ? 'On: in flight the view is drawn where the quad will be when the frame reaches the screen, from its speed and rotation, a frame ahead of where it was when the frame began. That takes about a frame off the time between your sticks and the picture. Only the picture moves; the flight, the lap and the physics are the same either way.'
            : 'Off: the view is drawn where the quad was when the frame began, which the screen shows a frame later.',
          s.predictView,
          (v) => { s.predictView = v; },
        ),
        choice(
          'Frame pacing',
          pacingNote(s),
          PACING_MODES,
          s.pacing,
          (id) => ({ auto: 'Timer with Low', timer: 'Timer, always', display: 'Display, always' }[id]),
          (id) => { s.pacing = id; },
        ),
        /* What the pieces above add up to on this machine, measured: see
         * src/render/latency.js. Read only, like the GPU row. */
        latencyItem(this.latencyProbe ? this.latencyProbe() : null),
        { label: 'Diagnostics', section: true },
        toggle(
          'Flight log',
          'Record the run for download as a Betaflight blackbox CSV. Holds the whole flight in memory.',
          s.flightLog,
          (v) => { s.flightLog = v; },
        ),
        toggle(
          'Support prompts',
          s.supportPrompts !== false
            ? 'On: show a small support prompt at good moments (new personal best, after about 20 minutes of flying, or after publishing a map). At most once a week.'
            : 'Off: never show support prompts.',
          s.supportPrompts !== false,
          (v) => { s.supportPrompts = v; },
        ),
        {
          label: 'Download flight log',
          action: 'downloadflightlog',
          note: 'Writes what was recorded as blackbox_decode CSV, which scripts/replay-log.js reads.',
        },
        { label: 'Back', action: 'back' },
      ];
    }

    /*
     * STANDINGS. What the board knows about one track.
     *
     * The rows are the ACTIONS. The table itself is drawn above them by
     * paintStandings, because a leaderboard is a table and pretending forty
     * times are forty menu rows would make the cursor walk them one press at
     * a time to reach Back.
     */
    if (this.screen === 'standings') {
      const t = this.standingsFor;
      if (!t) {
        return [
          {
            label: 'No track chosen',
            info: true,
            disabled: true,
            note: 'Pick a track in the Race room and open its standings from there.',
          },
          { label: 'Back', action: 'back' },
        ];
      }
      const rows = [];
      const times = this.standingsTimes || [];
      const best = times.length ? times[0] : null;
      const room = t.trackClass === 'micro';
      const bestMs = best ? (room ? best.threeMs : best.lapMs) : null;
      rows.push({
        label: 'Fly this track',
        action: 'standings-fly',
        primary: true,
        note: best
          ? `Loads ${t.name} and goes straight to the starting blocks. The time to beat is ${formatTime(bestMs)} by ${best.name || 'an unnamed pilot'}${room ? ', three laps.' : '.'}`
          : `Loads ${t.name} and goes straight to the starting blocks. Nobody has posted a time yet, so the first one is yours.`,
      });
      /*
       * Racing a recorded lap is the one thing a standings table is FOR
       * that reading it cannot give you. Only offered on a time that
       * actually carries a ghost: the board stores them per lap and older
       * ones predate the feature.
       */
      const ghosts = times.filter((x) => x.hasGhost && x.id);
      if (ghosts.length) {
        rows.push({
          label: 'Chase the record',
          action: 'standings-ghost',
          note: `${ghosts[0].name || 'An unnamed pilot'}'s ${formatTime(ghosts[0].lapMs)} flown as a ghost beside you, straight from the starting blocks.`,
        });
      }
      rows.push({
        label: 'This track on Tracks and times',
        action: 'card-board',
        note: `${t.name} on the public board, opened on its own page. A link to send somebody. Opens in a new tab.`,
      });
      rows.push({ label: 'Back', action: 'back' });
      return rows;
    }

    /*
     * THE LAUNCH CARD. What this run counts as, before it is flown.
     *
     * Five rows, and every one of them is latched by main.js at run start or
     * hashed into recordKey(). The help column's first sentence is that key
     * rendered in English, because "your personal best is filed under
     * exactly this sentence" is the thing nobody was ever told.
     */
    if (this.screen === 'launch') {
      const seat = activeCourseSummary();
      const m = MAPS.find((x) => x.id === s.map) ?? MAPS[0];
      const trackName = seat && seat.name ? seat.name : m.name;
      return [
        {
          label: 'Track',
          value: trackName,
          info: true,
          note: seat && seat.gates
            ? `${seat.gates} gates. This is what your time will be measured on.`
            : 'This is what your time will be measured on.',
        },
        /*
         * TUNE, NOT QUAD, because the tune is what a run is filed under and
         * the camera is not (recordKey in src/main.js). The row read "Quad:
         * Betaflight default" and promised the tune "goes to the board with
         * the time", which it does not: a posted time carries the name, the
         * lap, the three lap total, the ghost and the weight, and nothing
         * else (postTime in src/share/board.js; MENUS-PLAN.md 1.35).
         */
        tuneItem(s, false),
        { label: 'What this run counts as', section: true },
        choice(
          'Laps',
          s.laps === PRACTICE_LAPS
            ? 'Practice has no end: fly as many laps as you like, each one called out with its time as you cross the line, and stop from the pause menu. Nothing flown in practice goes to the public board. Latched when you launch, so changing it mid-run does nothing until the next one.'
            : 'How many laps a run lasts before the result screen. Practice has no end and keeps nothing for the board. Latched when you launch, so changing it mid-run does nothing until the next one.',
          LAP_COUNTS,
          s.laps,
          lapsLabel,
          (n) => { s.laps = n; },
        ),
        choice(
          'Pack charge',
          'A tired pack sags harder and gives less punch. Best laps are kept per charge level, so a time set on a fresh pack and a time set on a tired one are two different records.',
          PACK_VOLTAGES,
          s.packVoltage,
          (n) => `${n.toFixed(2)} volts per cell`,
          (n) => { s.packVoltage = n; },
        ),
        choice(
          'Flight model',
          s.flightStyle === 'arcade'
            ? 'Arcade: the ideal quad. No propwash shake, no gyro noise, no build asymmetry, so any tune flies glass smooth. Times flown here stay off the public board.'
            : 'Expert: the full physics, propwash, gyro noise and build tolerance included, which is what every board time is flown on. Arcade turns the imperfections off for a friendlier machine.',
          FLIGHT_STYLES,
          s.flightStyle === 'arcade' ? 'arcade' : 'expert',
          (id) => (id === 'arcade' ? 'Arcade' : 'Expert'),
          (id) => { s.flightStyle = id; },
        ),
        choice(
          'Radio link',
          s.link === 'perfect'
            ? 'A perfect link is sharper than any real radio: every frame arrives, exactly on time. Pick a real link to race on what a real radio feels like. The board is not told which link a time was flown on.'
            : `${LINK_PRESETS[s.link].hz} Hz, ${LINK_PRESETS[s.link].delayMs} ms delay, ${LINK_PRESETS[s.link].jitterMs} ms jitter.`,
          Object.keys(LINK_PRESETS),
          s.link,
          (id) => LINK_PRESETS[id].label,
          (id) => { s.link = id; },
        ),
        /* The ghost is a property of the run too: it is armed for this
         * launch and it is what you are racing. It was on the title, which
         * is the one screen with no run in front of it. */
        ...this.ghostItems(),
        {
          label: 'Fly',
          action: 'launch-go',
          primary: true,
          note: recordSentence(s, trackName),
        },
        { label: 'Back', action: 'back' },
      ];
    }

    if (this.screen === 'paused') {
      /* Resume is the button. The conditional Edit a copy that used to
       * appear here belongs on the Courses screen. Report a bug is the
       * chip in the corner, or F8, so this list stays put. Flight feel
       * sits by the tuning rows because "this feels off" is the moment a
       * pilot pauses, and the report carries the tune and PIDs they are
       * paused on. FPV wiki opens the landing-site wiki so a mid-flight
       * "why did that happen" does not have to quit the run. */
      /*
       * THE ONE COPY THAT EARNS ITS PLACE, and doors for the rest.
       *
       * The pause menu's job is not to be a second Settings screen. It is
       * to answer "what just happened, and does it feel wrong", so the
       * tuning a pilot pauses in order to reach stays one row away and
       * everything else becomes a door to a room rather than a copy of it.
       *
       * Tune keeps its row here because that IS the question, and because
       * this copy carries the mid-run warning that changing it puts the
       * quad back on the start line. PIDs and Rates are doors now: they
       * were the two of the four scattered copies whose surrounding
       * context differed, and the rooms carry the same warning through
       * MID_RUN_WARNING on the way in.
       */
      /* Third, under the two that keep the pilot flying: Escape, down, down,
       * Enter is the whole way to the builder. See builderReturnItem. */
      const builder = builderReturnItem(s, this.sharedMap);
      /*
       * THE STICK ROW, when there is one, under the rows that keep the pilot
       * flying and never above them: Resume is where the cursor lands and
       * the builder's row is a muscle memory. The pause is where a pilot
       * lands after the in flight banner about a dead stick, so the row that
       * banner points at has to be here, not only on the title.
       *
       * Whatever the row is about, from here it opens Stick help, which
       * carries the wizard as a round trip and says what else it could be:
       * a pilot mid run is better served by the screen that tests the stick
       * than by a wizard that drops them in Settings.
       */
      const stickRow = padTroubleItem(this.padInfo, this.stickPlatform);
      const trouble = stickRow ? { ...stickRow, action: 'stickhelp' } : null;
      return [
        { label: 'Resume', action: 'resume', primary: true },
        { label: 'Restart run', action: 'restart' },
        ...(builder ? [builder] : []),
        ...this.ghostItems(),
        ...(trouble ? [trouble] : []),
        { label: 'Does it feel wrong?', section: true },
        tuneItem(s, true),
        /*
         * RATES, ONE PRESS FROM THE PAUSE MENU, because that is when a pilot
         * knows they want them.
         *
         * They were two rooms away: Settings, then Rates. The question this
         * section asks is "does it feel wrong", and how far the sticks go is
         * half of every answer to it, so the row belongs beside the tune.
         * A DOOR, not a copy: the numbers and the curve live in one room and
         * shell-check asserts that they are editable on exactly one screen.
         *
         * No mid-run warning, unlike the Tune row above it. Rates no longer
         * put the quad back on the start line: see applySettings in
         * src/main.js, which re-seats the craft where it was instead of
         * resetting the run.
         */
        {
          label: 'Rates',
          value: ratesShort(s.rates),
          action: 'rates',
          note: 'How far the sticks go, and the throttle limit. Yours, not the tune\'s. Changing them here leaves the quad where it is and the clock running.',
        },
        weightItem(s),
        /*
         * FLIGHT FEEL TUNING'S TWO SLIDERS, as rows, only while the mode is
         * on: this is where a keyboard or radio pilot who has just felt
         * something wrong can move them (the flight screen's own are
         * pointer sliders). The mode's SWITCH is not here and that is
         * arithmetic, not taste: this list has no room to spare at 1280 by
         * 720 (scripts/shell-check.js records its fold, and one row more
         * hung 47 px under the command bar), so the switch lives in the
         * Quad room and in the flight feel form, and a pilot who never
         * turned the mode on has the menu they had. See tuneSliderItem.
         */
        ...this.tuneRows(s),
        feelItem(),
        /*
         * ELSEWHERE IS TWO DOORS AND THE WAY OUT (MENUS-PLAN.md 2.2).
         *
         * A pause is for the run: resume it, restart it, fix how it feels,
         * or leave. Quad went because the two of its doors a pilot pauses
         * for, Tune and Rates, are already above, and its value was the
         * same "Betaflight default" as Tune's, one row apart. Graphics is
         * one door away under Settings. The wiki, Support and Credits went
         * because a new tab opened mid run is a way to lose the run, and
         * they are one row from the title in About. At 1600x900 the last
         * row, the way out, was cut off by the legend; now it is not.
         */
        { label: 'Elsewhere', section: true },
        {
          label: 'Settings',
          action: 'pilot',
          /* Rates are the first thing in this room and they no longer cost
           * the run, so the blanket warning would be wrong more often than
           * right. The rows that still restart a run carry it themselves. */
          note: 'Your name, your radio, graphics and sound.',
        },
        { label: 'How to fly', action: 'howto' },
        { label: 'Quit to title', action: 'title' },
      ];
    }
    if (this.screen === 'results') {
      /* Seven rows on a race, always the same seven, greyed when an action
       * does not apply. A freestyle run has no course to publish, so it
       * keeps only the two that mean anything. */
      const listing = this.settings.map === 'custom' ? liveListing('custom') : null;
      /*
       * A world has no course to publish and no listing to post to, so the
       * five course actions would all be greyed at once, which is five rows
       * of noise rather than one useful disabled row. Freestyle is the same
       * for the same reason: no lap, nothing to upload.
       */
      if (this.osdMode === 'freestyle') {
        /*
         * A FREESTYLE RUN HAS SOMETHING TO POST NOW, which it never did
         * before: two minutes, a number at the end of it, and a board with
         * a table waiting for it. The five track actions still mean nothing
         * here, because there is no track, so the run keeps four rows.
         *
         * A run of nothing is not a score. The row says so rather than
         * being offered and refused by the board, which is the difference
         * between a menu that knows what it is doing and one that finds out.
         */
        const run = this.freestyleRun;
        const nothing = !run || !(run.total > 0) || !(run.tricks > 0);
        /* Your map comes first among the refusals: nothing flown on it can
         * be posted, so telling a pilot to fly a trick first, or to switch
         * to Scored, would send them to fix something that is not the
         * reason. */
        const built = this.settings.map === 'built';
        return [
          { label: 'Fly again', action: 'restart', primary: true },
          this.runPosted
            ? {
              label: this.runPosted.improved === false ? 'Your best still stands' : 'Run posted',
              action: 'postrun',
              disabled: true,
              note: this.runPosted.improved === false
                ? `The board already holds a better run of yours, ${formatScore(this.runPosted.score)}. Only your best is kept.`
                : `The board kept that run.${this.runPosted.rank != null ? ` Rank ${this.runPosted.rank}.` : ''}`,
            }
            : {
              label: 'Post this run',
              action: 'postrun',
              /*
               * FREE FLIGHT IS REFUSED HERE, on the row, rather than by a
               * notice when the row is pressed. The shell's notice banner
               * only draws in flight, so a refusal raised from the results
               * screen is a press that does nothing at all. A row that says
               * why it is off is the same answer given before it is needed.
               */
              disabled: built || nothing || Boolean(run && run.assisted)
                || (run && run.timed === false) || Boolean(run && run.weightMixed)
                || Boolean(run && run.tuned),
              note: built ? (this.sharedMap ? BOARD_MAP_OFF_BOARD : BUILT_OFF_BOARD) : (nothing
                ? 'A run with no tricks in it is not a score. Fly one and it appears here.'
                : (run && run.timed === false
                  ? 'Free flight has no clock, so there is nothing for a board to compare it against. Set Scoring to Scored run in the Maps room and fly it again.'
                  : (run && run.assisted
                    ? 'This run used the harness hooks, so it is not a flown score and the board will not take it.'
                    /* The weight goes up with the run and the board prints
                     * it; a run whose tricks landed at two weights has no
                     * one weight to print, so it is the one weight refusal
                     * left. See submitFreestyleRun in main.js. */
                    : (run.weightMixed
                      ? 'The weight changed during this run, so it has no one weight for the board to show. Fly it again at one weight.'
                      /* Weight is printed on the board; Air grip and Motor
                       * power are not, so a run landed on them is a run on
                       * another quad and stays off. */
                      : (run.tuned
                        ? 'Tuned flight, not posted to the board. Tricks landed on Air grip or Motor power off 100 are a different quad from the one everybody else flew. Set both back to 100 and fly it again.'
                        : `${formatScore(run.total)} from ${run.tricks} tricks${Number.isInteger(run.weight) && run.weight !== WEIGHT_STOCK ? `, marked Weight ${run.weight}%` : ''}. One entry per pilot on the board, and only your best.`))))),
            },
          /*
           * THE SHARE CARD, the run's manga page beside its score. A row of
           * its own rather than a part of posting, because most runs cannot
           * be posted (Your map, free flight) and every run with something
           * to draw can have a picture. See saveRunCard.
           */
          (() => {
            const drawn = Boolean(run) && mangaPanels(run).length > 0;
            const saved = this.cardSaved;
            return {
              label: saved && saved.name ? 'Share card saved' : 'Save share card',
              action: 'savecard',
              disabled: !drawn,
              note: !drawn
                ? 'A run with nothing to draw has no card. A trick, a gap, a skim or a tail puts one here.'
                : (saved && saved.error
                  ? `The card could not be made: ${saved.error}`
                  : (saved && saved.name
                    ? `Saved as ${saved.name}. Choose this row again for another copy.`
                    : 'The run as a manga page beside its score, 1200 by 630, the size a link preview uses. Saved as a JPEG to post wherever you like.')),
            };
          })(),
          {
            label: 'Tracks and times',
            action: 'leaderboard',
            note: 'Every published track and map, and the times flown on them. Opens in a new tab.',
          },
          ...this.tuneShareRows(),
          feelItem(),
          { label: 'Back to title', action: 'title' },
        ];
      }
      if (!listing) {
        return [
          { label: 'Fly again', action: 'restart', primary: true },
          ...this.tuneShareRows(),
          feelItem(),
          { label: 'Back to title', action: 'title' },
        ];
      }
      /*
       * SIX ROWS, NOT EIGHT, AND NONE OF THEM GREY (MENUS-PLAN.md, Run
       * complete). Publish and Edit this track were greyed on most runs,
       * and the page row was greyed until a track had a page. A row that
       * cannot apply is not drawn; the one that does the job says why in
       * its note (Publish: "then you can post a time"). Time posted stays,
       * greyed, because it is news. One Edit row, the right one of three.
       */
      const onBoard = Boolean(listing.shareId || listing.published || this.coursePublished);
      return [
        { label: 'Fly again', action: 'restart', primary: true },
        ...applicableRows([
          uploadAction(listing, {
            row: this.resultsBoard,
            timePosted: this.timePosted,
            tuned: this.resultsOffBoard,
          }),
          publishAction(listing, this.coursePublished),
        ]),
        editAction(listing, activeCourseSummary()),
        ...(onBoard ? [{
          label: 'This track on Tracks and times',
          action: 'seat-board',
          note: `${listing.name || 'This track'} on the public board, opened on its own page: every time posted on it and who flew them. Opens in a new tab.`,
        }] : []),
        ...this.tuneShareRows(),
        feelItem(),
        { label: 'Back to title', action: 'title' },
      ];
    }
    if (this.screen === 'rates') {
      /*
       * BETAFLIGHT CONFIGURATOR'S RATES TAB, in a menu.
       *
       * A rates TYPE and three numbers per axis, typed rather than picked
       * off a list. The lists were the bug: Max rate stopped at 1400 and
       * centre sensitivity at 140, so a pilot who flies 1500, or 850, or any
       * number the list did not happen to carry, could not enter it at all,
       * and a pilot who thinks in Betaflight RC Rate and Super Rate had no
       * row to put them in. Every range and every default here is
       * Configurator 10.10's own; see configs/rates.js.
       *
       * The numbers are the firmware's, at the firmware's resolution. One
       * arrow press is one uint8 step, which is ten deg/s in the deg/s
       * columns and a hundredth everywhere else, and a typed number that
       * falls between two of them is rounded to the one the quad can
       * actually be given rather than shown back as a rate nothing flies.
       */
      const r = s.rates;
      const split = Boolean(s.ratesSplitPitch);
      const hover = hoverStickPercent(r.throttleCap, this.settings.airframe);
      const tilt = Math.sin(cameraTiltRad(s.cameraAngle));
      const noteFor = (axis, key) => {
        const spec = rateField(r.type, key);
        const bits = [spec.note];
        if (key !== 'expo') {
          bits.push(`At full stick this axis is ${fullStickDeg(r, axis)} deg/s.`);
        }
        if (axis === 'yaw' && key === 'srate') {
          bits.push(`Quads yaw slower than they roll, so many pilots set yaw below roll. Your camera is tilted up ${s.cameraAngle} degrees, so ${Math.round(tilt * 100)} percent of a yaw rolls the horizon rather than turning it: ${Math.round(fullStickDeg(r, 'yaw') * tilt)} deg/s of picture roll at full pedal.`);
        }
        return bits.join(' ');
      };
      /* One editable field. Roll writes pitch too while the two are joined,
       * which is the only place the joining means anything: the profile
       * itself always carries three axes, exactly as the firmware does. */
      const rateRow = (axis, key) => number(
        rateField(r.type, key).label,
        noteFor(axis, key),
        rateField(r.type, key),
        r[axis][key],
        (v) => {
          r[axis][key] = v;
          if (!split && axis === 'roll') {
            r.pitch[key] = v;
          }
        },
      );
      const axisRows = (axis) => RATE_FIELDS.map((key) => rateRow(axis, key));
      /*
       * WHICH NAMED PROFILE IS FLYING, and it is worked out rather than
       * remembered.
       *
       * The row could have stored "the preset I last loaded" and gone stale
       * the moment a number moved under it. Instead it asks the library
       * whether anything in it flies exactly what is flying now, compared as
       * the CLI text the profile emits, which is the same comparison
       * src/main.js makes to decide whether a change reached the module. So
       * the row cannot claim to be on Bando while flying something else: the
       * instant a stick number moves it stops matching and says so.
       *
       * `pickOnly`, for the reason the Tune row carries it: this is a list
       * whose entries change how the quad flies, and Enter a row below where
       * it was meant must open it rather than step it.
       */
      const presets = listRatePresets();
      const loaded = presetMatching(r);
      const presetValue = loaded
        ? loaded.name
        : (ratesAreDefault(r) ? 'Stock' : 'Not saved');
      const presetRow = presets.length === 0
        ? {
          label: 'Preset',
          value: 'None saved',
          info: true,
          note: `Save the numbers below under a name and they come back in one press, which is what a second track wants. ${RATES_STORAGE_WARNING}`,
        }
        : {
          ...choice(
            'Preset',
            `${presets.length === 1 ? 'One saved profile' : `${presets.length} saved profiles`}. Loading one sets every number below, the throttle limit included, and does not put you back on the start line. ${RATES_STORAGE_WARNING}`,
            presets.map((p) => p.id),
            loaded ? loaded.id : '',
            (id) => (ratePresetById(id) || { name: presetValue }).name,
            (id) => {
              const pick = ratePresetById(id);
              if (pick) {
                s.rates = normaliseRates(pick.rates);
              }
            },
          ),
          pickOnly: true,
        };
      return [
        ...this.stickPathRow(),
        presetRow,
        choice(
          'Rates type',
          `Which rate system the numbers below are in. All five are Betaflight's own and all five fly: the curve is chosen in fc/rc.c by this one field. Actual is the Betaflight 4.5 default and the one whose Max rate column means exactly what it says at the stop. Changing this loads that system's own defaults, because a Betaflight RC rate of 1.00 and an Actual centre sensitivity of 70 are the same stored number and not the same setting.`,
          RATE_TYPES,
          r.type,
          (t) => RATE_TYPE_LABEL[t],
          (t) => { s.rates = profileForType(t, r); },
        ),
        toggle(
          'Separate pitch',
          split
            ? 'On. Pitch has its own three numbers and its own curve on the graph. Turning this off copies roll onto pitch.'
            : 'Off. Roll and pitch share one set of numbers, which is how most quads are set up and what Betaflight ships. Turn it on to give pitch its own.',
          split,
          (on) => {
            s.ratesSplitPitch = on;
            if (!on) {
              for (const key of RATE_FIELDS) {
                r.pitch[key] = r.roll[key];
              }
            }
          },
        ),
        { label: split ? 'Roll' : 'Roll and pitch', section: true },
        ...axisRows('roll'),
        ...(split ? [{ label: 'Pitch', section: true }, ...axisRows('pitch')] : []),
        { label: 'Yaw', section: true },
        ...axisRows('yaw'),
        this.cameraAngleRow(s),
        { label: 'Throttle', section: true },
        choice(
          'Throttle limit',
          r.throttleCap >= 100
            ? `Off. This quad is almost nine to one thrust to weight and hovers at ${hover.toFixed(1)} percent of stick, so most of the travel is above hover. Capping it scales the whole stick down and gives the resolution back.`
            : `Betaflight SCALE limit: full stick commands ${r.throttleCap} percent, and the whole travel is redistributed under it. Hover moves to about ${hover.toFixed(1)} percent of stick, so the throttle is less touchy.`,
          THROTTLE_CAP_CHOICES,
          r.throttleCap,
          (n) => (n >= 100 ? 'Off' : `${n}%`),
          (n) => { r.throttleCap = n; },
        ),
        /* Betaflight's own throttle curve, thr_mid and thr_expo, the two
         * uint8s fc/rc.c bends the throttle stick with. Compiled and live
         * all along; a board report asked where they were. The hover figure
         * quoted by the limit row above is measured on the straight factory
         * curve, so a bent curve moves where hover sits on the stick. */
        number(
          THROTTLE_CURVE_FIELDS.thrMid.label,
          `${THROTTLE_CURVE_FIELDS.thrMid.note} This quad hovers near ${hover.toFixed(1)} percent of stick on the factory curve.`,
          THROTTLE_CURVE_FIELDS.thrMid,
          r.thrMid,
          (v) => { r.thrMid = v; },
        ),
        number(
          THROTTLE_CURVE_FIELDS.thrExpo.label,
          THROTTLE_CURVE_FIELDS.thrExpo.note,
          THROTTLE_CURVE_FIELDS.thrExpo,
          r.thrExpo,
          (v) => { r.thrExpo = v; },
        ),
        { label: 'Presets', section: true },
        /*
         * ONLY HERE WHEN SOMETHING WENT WRONG. A refused write is state the
         * pilot has to know about and cannot see anywhere else, so it wears
         * row-warn and stays until the next save or delete clears it, which
         * is the same rule the Freestyle room's Scoring row follows. A
         * successful save says so by changing the Preset row's value.
         */
        ...(this.ratesNotice ? [{
          label: 'Not saved',
          value: '',
          info: true,
          rowClass: 'row-warn',
          note: this.ratesNotice,
        }] : []),
        {
          label: 'Save as preset',
          action: 'rates-save',
          note: loaded
            ? `Save these numbers again under a name. They already match ${loaded.name}, so saving under that name replaces it and any other name makes a second profile. ${RATES_STORAGE_WARNING}`
            : `Name these numbers and they come back in one press. ${RATES_STORAGE_WARNING}`,
        },
        {
          label: 'Delete preset',
          action: 'rates-delete',
          disabled: !loaded,
          rowClass: loaded ? undefined : 'row-grey',
          note: loaded
            ? `Forget ${loaded.name}. This browser is the only copy, so it cannot be undone. The numbers stay on the quad; only the saved profile goes.`
            : 'Load a preset first. This deletes the profile the rows below are flying, and they are not flying a saved one.',
        },
        {
          label: 'Revert to defaults',
          action: 'rates-default',
          disabled: !ratesChanged(s),
          note: ratesChanged(s)
            ? `Back to the shipped rates: Actual, ${formatRate(rateField('ACTUAL', 'rcRate'), RATE_DEFAULTS.roll.rcRate)} deg/s at centre, ${formatRate(rateField('ACTUAL', 'srate'), RATE_DEFAULTS.roll.srate)} deg/s at the stop on every axis, no expo, no throttle limit. A step under a freshly flashed Betaflight's 70 and 670, which are one row each away.`
            : 'Already on the shipped defaults.',
        },
        { label: 'Back', action: 'back' },
      ];
    }
    if (this.screen === 'pids') {
      /*
       * BETAFLIGHT CONFIGURATOR'S PID TUNING TAB, in a menu, minus the CLI.
       *
       * Two ways in, the same two Configurator offers. The sliders are the
       * firmware's simplified_* keys plus a real `simplified_tuning apply`,
       * so the arithmetic from slider to PID is compiled Betaflight and
       * nothing else. 100 is Betaflight's factory scale, which is not
       * always where a tune ships a slider: the shipped default carries
       * feedforward at 125, and a saved dump can carry anything. The
       * expert table writes the PIDs themselves with the sliders off,
       * which is Configurator's expert mode. Everything is keyed by the
       * tune on the row above: adjust your own dump and stock stays stock.
       *
       * A slider the pilot has not moved shows the TUNE's value and is not
       * stored, and a slider walked back onto the tune's value forgets it
       * was ever moved, so stock has one spelling and the best-lap record
       * key (a hash of the config text) cannot split on a no-op.
       */
      const live = this.pidsLive && this.pidsLive.tune === s.tune ? this.pidsLive : null;
      const entry = pidsEntry(s.pids, s.tune);
      const expert = Boolean(entry && entry.mode === 'expert' && entry.pids);
      const tuneName = tuneById(s.tune).name;
      const yawNote = live && live.baselineMode === 'RP'
        ? ` ${tuneName} runs the sliders in RP mode, so they reach roll and pitch and leave yaw at its stock values, exactly as Configurator would.`
        : '';
      /* Only built when `live` is present, per the loading row below, so
       * the tune's baseline is always real and walking a slider back onto
       * it always forgets the override. */
      const sliderRow = (k) => {
        const spec = SLIDERS[k];
        const tuneVal = live.baseline[k];
        const moved = Boolean(entry && entry.sliders && k in entry.sliders);
        const cur = moved ? entry.sliders[k] : tuneVal;
        const bits = [spec.note];
        if (moved) {
          bits.push(`${tuneName} ships this at ${tuneVal}; setting it back there forgets the change.`);
        }
        if (k === 'master') {
          bits.push(yawNote.trim());
        }
        const it = number(
          spec.label,
          bits.filter(Boolean).join(' '),
          spec,
          cur,
          (v) => { setPidSlider(s.pids, s.tune, k, v, tuneVal); },
        );
        /* A real track, as Configurator draws these: drag lands on
         * release, arrows still step one percent, the number still
         * types. */
        it.range = { min: spec.cliMin, max: spec.cliMax };
        return it;
      };
      const pidRow = (axis, f) => {
        const spec = PID_FIELD_SPECS[f];
        return number(
          spec.label,
          spec.note,
          spec,
          entry.pids[axis][f],
          (v) => { entry.pids[axis][f] = v; },
        );
      };
      /* The mode switch sits ABOVE the rows it switches, at the same index
       * in both shapes. It was below the sliders, so flipping it rebuilt
       * the menu with the cursor left on an index that no longer held the
       * toggle, the guard in renderMenu sent the cursor to the top, and
       * the next arrow press stepped the Tune row instead. A control must
       * stay under the cursor that just used it. */
      /*
       * NO ROW EDITS A TUNE THAT IS NOT LOADED YET. Between the Tune row
       * moving and swapTune's fetch publishing the readback, `live` is
       * null and every fallback here would be a lie: a slider would show
       * 100 where a saved dump ships 185, an arrow press would store an
       * override computed from that wrong base with no tune value to
       * forget it against, and the expert toggle would seed the table from
       * stock instead of from what is about to fly. So the window shows
       * one info row instead of controls. It lasts one local fetch; on a
       * slow network it is the same honesty the panel caption already has.
       */
      const rows = [
        /*
         * THE PICKER, not a door back to Quad.
         *
         * It was a door, and it had to be: the tune was chosen one row above
         * the PIDs row on Quad, and this screen only needed to SAY which
         * tune it was adjusting. Folding those two Quad rows into one moved
         * the choosing in here, because a Tune row on Quad that opens this
         * screen cannot be answered by a Tune row here that opens Quad.
         *
         * The loading branch below is reachable from both directions now: a
         * swap made here, and a swap followed in from Quad, arrive with
         * `live` null the same way.
         */
        tunePickItem(s, this.returnTo === 'paused'),
      ];
      if (!live) {
        rows.push({
          label: `Loading ${tuneName}`,
          info: true,
          note: 'The tune is being fetched and applied. Its sliders appear the moment the module reads back.',
        });
      } else {
        rows.push(toggle(
          'Set PIDs directly',
          expert
            ? 'On. The sliders are off (simplified_pids_mode OFF, as Configurator\'s expert mode sets it) and the table below is what flies. Turning this off restores the sliders and remembers the table.'
            : 'Off. The sliders below drive the PIDs through the firmware\'s own simplified tuning. Turn this on to type every value yourself, starting from exactly what is flying now.',
          expert,
          (on) => {
            setPidsExpert(s.pids, s.tune, on, live.pids);
          },
        ));
        if (!expert) {
          rows.push({ label: 'Betaflight\'s tuning sliders', section: true });
          for (const k of SLIDER_KEYS) {
            rows.push(sliderRow(k));
          }
        }
        if (expert) {
          for (const axis of PID_AXES) {
            rows.push({ label: axis === 'roll' ? 'Roll' : axis === 'pitch' ? 'Pitch' : 'Yaw', section: true });
            for (const f of PID_FIELDS) {
              rows.push(pidRow(axis, f));
            }
          }
        }
      }
      rows.push(
        {
          label: 'Firmware bench',
          action: 'fc',
          note: 'The Firmware bench: filters, features and every firmware key, not just the PIDs. Configurator-shaped. No CLI paste.',
        },
        {
          label: 'Back to the tune\'s own values',
          action: 'pids-default',
          disabled: !pidsAdjusted(s.pids, s.tune),
          note: pidsAdjusted(s.pids, s.tune)
            ? `Forgets every slider and hand-set PID for ${tuneName} and flies the tune as it ships. Other tunes' adjustments are kept.`
            : `${tuneName} is already flying its own values.`,
        },
        { label: 'Back', action: 'back' },
      );
      return rows;
    }
    if (this.screen === 'fc') {
      return this.fc.items();
    }
    return [];
  }

  renderMenu() {
    this.syncMusicDock();
    if (this.screen === 'standings') {
      this.paintStandings();
    }
    if (this.screen === 'launch' && this.launchLede) {
      const seat = activeCourseSummary();
      const m = MAPS.find((x) => x.id === this.settings.map) ?? MAPS[0];
      const name = seat && seat.name ? seat.name : m.name;
      const gates = seat && seat.gates ? `${seat.gates} gates` : '';
      const by = byLine(seat);
      this.launchLede.textContent = [name, gates, by].filter(Boolean).join(' \u00b7 ');
    }
    this.closeDrop();
    if (this.screen === 'courses') {
      this.renderMapCards();
      this.renderCourseCards();
    }
    if (this.screen === 'freestyle') {
      this.renderMapCards();
      this.renderBoardMapCards();
    }
    if (this.screen === 'tricks') {
      this.renderTricks();
    }
    if (this.screen === 'title') {
      this.renderTitleCards();
    }
    if (this.screens && this.screens.title) {
      /*
       * onGate(), NOT `!this.mode`, and this line was the whole of a bug
       * that made the front page unusable.
       *
       * The gate has two halves, the aircraft and the mode, and
       * `!this.mode` only ever saw one of them. So whenever the mode
       * was already answered while the aircraft still was not, the
       * title dressed itself as the menu: `is-gate` never went on, and with
       * it went the rule that lays the two cards out
       * (`.screen-title.is-gate .gate-cards`), the rules that take the keep
       * note, the wiki teaser and the best-lap chip off a screen that is
       * asking one question, and the rule that hides an empty menu panel.
       * The pilot got a blank box where the aircraft should be, two
       * paragraphs that belong to a seat they had not chosen, and no way to
       * fly. Reported as "the menu is not populated and i can't fly it".
       *
       * Both routes to it are ordinary. The track builder's Fly this track
       * link is `?map=custom`, which linkedMode reads as race, so every
       * pilot arriving from the builder hit it. And on a whoop syncMode
       * answers the mode itself, so every whoop pilot hit it from any link.
       *
       * onGate() is the one definition, `this.screen === 'title' &&
       * (this.craftGate || !this.mode)`, and it is what cardScreen and the
       * key handling have always used. This line disagreeing with them is
       * what let the screen be a gate for one half of the code and a menu
       * for the other.
       */
      const gate = this.onGate();
      this.screens.title.classList.toggle('is-first', Boolean(this.firstRun));
      /* The gate is one question, so the lines that describe a seat the
       * pilot has not chosen to fly yet come off the screen behind it. */
      this.screens.title.classList.toggle('is-gate', gate);
    }
    const host = {
      title: this.titleMenu,
      howto: this.howtoMenu,
      stickhelp: this.stickHelpMenu,
      tricks: this.trickMenu,
      credits: this.creditsMenu,
      courses: this.coursesMenu,
      freestyle: this.freestyleMenu,
      pilot: this.pilotMenu,
      advanced: this.advancedMenu,
      quad: this.quadMenu,
      launch: this.launchMenu,
      standings: this.standingsMenu,
      rates: this.ratesMenu,
      pids: this.pidsMenu,
      fc: this.fcMenu,
      paused: this.pausedMenu,
      results: this.resultsMenu,
    }[this.screen];
    if (!host) {
      return;
    }
    /* The flight controller's Save, Discard, Export and Exit rows group
     * into one Configurator-yellow button bar rather than running down
     * the list. Built on first sight of an fc-btn row. */
    let fcBar = null;
    const items = this.items();
    if (this.cursor >= items.length || !this.isStop(items[this.cursor])) {
      /* titleStop rather than firstStop, so the first paint of the aircraft
       * gate puts the cursor on the aircraft that is seated. Everywhere else
       * the two are the same call. */
      this.cursor = this.titleStop();
    }
    const scroll = host.scrollTop;
    host.textContent = '';
    /* The Courses screen draws its choices as cards above this menu, so the
     * rows here are only what is left over. */
    const rows = this.cardScreen()
      ? items.filter((it) => !it.map && !it.course && !it.card && !it.boardMap)
      : items;
    const offset = items.length - rows.length;
    this.rowOffset = offset;
    this.menuRows = [];
    rows.forEach((it, k) => {
      const i = k + offset;
      /* A heading is not a row. It gets no cursor, no hover and no click,
       * and syncCursor never has to think about it. */
      if (it.section) {
        const head = el('div', 'menu-section', it.label);
        host.append(head);
        this.menuRows.push(head);
        return;
      }
      const cls = ['row'];
      /* The kind is a class, so the signature is CSS rather than another
       * branch in here. A value row needs no marker: it already carries its
       * own control on the right. */
      const kind = this.rowKind(it);
      if (kind === 'navigation') {
        cls.push('row-nav');
      } else if (kind === 'link') {
        cls.push('row-link');
      }
      if (it.info) {
        cls.push('row-info');
      }
      if (it.disabled) {
        cls.push('row-grey');
      }
      if (it.primary) {
        cls.push('row-primary');
      }
      if (it.rowClass) {
        cls.push(it.rowClass);
      }
      const row = el('div', cls.join(' '));
      /*
       * ROVING TABINDEX. Exactly one row in the list is reachable by Tab,
       * the one under the cursor, and the rest are focusable only by
       * script. That is the standard listbox contract and it is what makes
       * document.activeElement and this.cursor the same thing rather than
       * two authorities that agree by accident.
       *
       * What it buys, concretely: Tab lands on the row a pilot was last
       * looking at rather than skipping the menu entirely, a screen reader
       * follows the cursor because the cursor IS the focus, and the
       * browser's own focus ring appears exactly where the painted bar is.
       *
       * The role is option-in-a-listbox rather than button-per-row: a row
       * is a thing selected from a set, and calling each one a button would
       * have a reader announce nine buttons with no relationship.
       */
      row.tabIndex = i === this.cursor ? 0 : -1;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === this.cursor));
      if (it.id) {
        row.dataset.rowId = it.id;
      }
      /*
       * Focus arriving from anywhere the shell did not drive it: Tab,
       * shift-Tab, a screen reader's own navigation, a click. The cursor
       * follows, because a focused row that is not the cursor is the two
       * authorities problem again with the roles reversed.
       */
      row.addEventListener('focus', () => {
        if (this.cursor !== i) {
          this.cursor = i;
          this.syncCursor(false);
        }
      });
      row.append(el('span', 'row-label', it.label));
      /* Before the adjust branch: a typed row has arrows too, and the
       * stepper alone would be the old list row without the field that is
       * the whole point of it. */
      if (it.num && it.range) {
        row.append(this.makeSliderControl(it, i));
      } else if (it.num) {
        row.append(this.makeNumber(it, i));
      } else if (it.text) {
        row.append(this.makeSearch(it, i));
      } else if (it.sw) {
        row.append(this.makeSwitch(it, i));
      } else if (fitsAsSegments(it)) {
        row.append(this.makeSegments(it, i));
      } else if (it.options) {
        row.append(this.makeDrop(it, i));
      } else if (it.step || it.adjust) {
        row.append(this.makeStepper(it, i));
      } else if (it.value != null) {
        const val = el('span', 'row-value', it.value);
        /* Every plain value can be cut at half the row, a device name, an
         * adjusted tune or a long track name on a door, so every one carries
         * its whole text as a tooltip, not only the read only rows
         * (MENUS-PLAN.md 1.39). An item may name a longer title of its own. */
        val.title = it.title || it.value;
        row.append(val);
      }
      /* A browser player reaches for the mouse. A menu that only answers
       * to arrow keys reads as broken, not as keyboard first. */
      /* Hover only when the pointer actually moved. mouseenter fires when
       * a rebuilt row appears under a stationary pointer, and so does
       * mousemove after scrollIntoView: both snapped the cursor back and
       * made the arrow keys look broken. */
      row.addEventListener('mousemove', (e) => this.hoverCursor(e, i));
      row.addEventListener('click', (e) => {
        if (e.target.closest('.row-control')) {
          return;
        }
        this.closeDrop();
        this.cursor = i;
        this.syncCursor(false);
        /* Value rows change through the arrows or the dropdown. Clicking
         * the label only focuses them, except a typed row, where the label
         * is the largest thing to aim at and typing is what it is for.
         * Action rows still fire. */
        if (it.num) {
          this.focusNumber(i);
          return;
        }
        if (!it.adjust && !it.options && !it.step && !it.info) {
          this.select();
        }
      });
      if (this.screen === 'fc' && it.rowClass === 'fc-btn') {
        if (!fcBar) {
          fcBar = el('div', 'fc-bar');
          host.append(fcBar);
        }
        fcBar.append(row);
      } else {
        host.append(row);
      }
      this.menuRows.push(row);
    });
    /*
     * Keeping the scroll position is right when the list is the same list,
     * and wrong when it has been replaced. A confirm panel is three rows
     * where 144 were, so a restored scrollTop of 3600 px hides all three
     * behind the header and the pilot is asked a question they cannot read.
     * Anything shorter than the box gets the top.
     */
    this.fitMenuHeight();
    host.scrollTop = host.scrollHeight > host.clientHeight ? scroll : 0;
    /* Before syncCursor paints anything: the cursor belongs to a row, not
     * to an index, and this list may have changed length. */
    this.restoreFocusRow();
    this.syncFrame();
    this.syncCursor(false);
    this.syncRates();
    this.syncPids();
    this.syncFcChrome();
    /* A click that was travelling from one typed field to another, landing
     * now that the rows it was aiming at exist again. See makeNumber. */
    if (this.numberFocusWanted != null) {
      const want = this.numberFocusWanted;
      this.numberFocusWanted = null;
      this.focusNumber(want);
    }
  }

  /*
   * A LIST WINDOW USES THE HEIGHT IT HAS (MENUS-PLAN.md 2.3).
   *
   * The rooms whose content IS their list capped it with a share of the
   * viewport, so Settings scrolled 1,691 px of rows through a 464 px window
   * with 110 px of empty page under it, and on a landscape phone the same
   * cap left the list running under the command bar. The window now runs
   * from where the list starts to just above the command bar, measured, so
   * it is right at every size and whatever the heading above it took. Below
   * a usable height the room's own CSS cap stands.
   */
  fitMenuHeight() {
    if (typeof window === 'undefined' || !FIT_SCREENS.has(this.screen)) {
      return;
    }
    const screen = this.screens && this.screens[this.screen];
    /* The pause menu scrolls by its modal's own rule rather than as a
     * .menu-scroll, whose desktop cap would cut a list that fits. */
    const box = screen && (screen.querySelector('.menu-scroll')
      || (this.screen === 'paused' ? this.pausedMenu : null));
    if (!box) {
      return;
    }
    box.style.maxHeight = '';
    box.style.minHeight = '';
    /* Only a list that scrolls itself is fitted. Below 1280 px Quad and
     * Rates let the PAGE scroll instead (overflow visible on the list), and
     * a height put on a list that does not clip only draws its rows past
     * its own border. */
    if (getComputedStyle(box).overflowY === 'visible') {
      return;
    }
    const top = box.getBoundingClientRect().top;
    const bar = this.frameBot && !this.frameBot.hidden
      ? this.frameBot.getBoundingClientRect().height
      : 0;
    let room = Math.floor(window.innerHeight - bar - top - 16);
    /*
     * A HELP LINE UNDER THE LIST GETS ITS ROOM TOO, where the layout has
     * stacked it there and the window can spare it: Quad at 1280 by 720
     * fitted its list to the bar and printed the note for the row under the
     * cursor beneath the bar. Three lines' worth, and only when the list
     * keeps about four rows, so a phone, which has neither, is unchanged.
     */
    const help = screen.querySelector('.menu-help');
    if (help && getComputedStyle(help).position !== 'absolute') {
      const below = help.getBoundingClientRect().top >= box.getBoundingClientRect().bottom - 1;
      if (below && room - 72 >= 180) {
        room -= 72;
      }
    }
    if (room >= 160) {
      /* The phone floor (.menu's min-height of 200 px, which stops a list
       * being squeezed to nothing) is lowered to what fits: the list is
       * sized here, so it cannot be squeezed, and a floor above the room
       * is what put it 16 px under the bar on a phone on its side. */
      box.style.minHeight = '160px';
      box.style.maxHeight = `${room}px`;
      /* max-height is the CONTENT's height, and the list's padding and its
       * top rule sit outside it. Take back whatever it overshoots by. */
      const over = Math.ceil(box.getBoundingClientRect().bottom - (window.innerHeight - bar - 8));
      if (over > 0 && room - over >= 160) {
        box.style.maxHeight = `${room - over}px`;
      }
    }
  }

  /* The curve, redrawn from the settings whenever the menu is rebuilt. Every
   * row on this screen writes a setting and then rebuilds, so this is the one
   * place the picture has to be kept honest. */
  syncRates() {
    if (!this.ratesPanel) {
      return;
    }
    if (this.screen !== 'rates') {
      return;
    }
    this.ratesPanel.paint(this.settings.rates, this.ratesStick, this.settings.airframe);
  }

  /* The live sticks, from the frame loop. Only while the screen is up: the
   * panel draws unconditionally and the caller owns the guard. */
  paintRates(stick) {
    if (stick) {
      this.ratesStick = stick;
    }
    if (!this.ratesPanel || this.screen !== 'rates') {
      return;
    }
    this.ratesPanel.paintStick(this.ratesStick);
  }

  /* The PID bars, repainted from the module readback whenever the menu is
   * rebuilt. Same contract as syncRates: every row on the screen writes a
   * setting and then rebuilds, so this is where the picture stays honest. */
  syncPids() {
    if (!this.pidsPanel || this.screen !== 'pids') {
      return;
    }
    const s = this.settings;
    const live = this.pidsLive && this.pidsLive.tune === s.tune ? this.pidsLive : null;
    const entry = pidsEntry(s.pids, s.tune);
    const name = tuneById(s.tune).name;
    let caption;
    if (!live) {
      caption = `${name} is loading.`;
    } else if (entry && entry.mode === 'expert' && entry.pids) {
      caption = `${name}, PIDs set by hand. Read back from the module.`;
    } else if (pidsAdjusted(s.pids, s.tune)) {
      caption = `${name} through your sliders. Read back from the module; the notch is stock 4.5.1.`;
    } else {
      caption = `${name}, as it ships. Read back from the module; the notch is stock 4.5.1.`;
    }
    this.pidsPanel.paint(live, caption);
  }

  /*
   * The flight controller's chrome: tab rail, page strip, attitude canvas
   * and the dirty flag, all repainted with the menu because every row
   * edit rebuilds the menu.
   */
  syncFcChrome() {
    if (!this.fcTabs) {
      return;
    }
    const on = this.screen === 'fc';
    if (on) {
      paintTabStrip(this.fcTabs, this.fc, (id) => {
        if (this.fc.confirm) {
          return;
        }
        this.fc.setTab(id);
        this.cursor = 0;
        this.renderMenu();
      });
      paintPageStrip(this.fcPages, this.fc, (id) => {
        if (this.fc.confirm) {
          return;
        }
        this.fc.page = id;
        this.cursor = 0;
        this.renderMenu();
      });
    }
    const confirm = Boolean(this.fc.confirm);
    const setupOn = on && this.fc.tab === 'setup' && !confirm;
    this.fcAttitude.hidden = !setupOn;
    if (setupOn) {
      drawAttitude(this.fcAttitude, this.fc.attitude);
    }
    this.syncFcDirty();
  }

  syncFcDirty() {
    if (this.fcDirty) {
      this.fcDirty.textContent = this.fc.dirty() ? 'Unsaved' : '';
    }
    this.syncFcExit();
  }

  syncFcExit() {
    if (!this.fcExit) {
      return;
    }
    const on = this.screen === 'fc';
    /*
     * The save-run confirm hides the exit bar because it is asking whether
     * to restart a live run and an Exit button beside that question is a
     * third answer nobody meant to offer. The leave confirm keeps it: that
     * panel IS the leave question, and hiding the bar collapses the header
     * height under it so the first row renders behind the brand block.
     */
    const confirm = this.fc.confirm === 'save-run';
    const dirty = this.fc.dirty();
    this.fcExit.hidden = !on || confirm;
    if (this.fcSaveExit) {
      this.fcSaveExit.hidden = !dirty;
    }
    if (this.fcLeave) {
      this.fcLeave.textContent = dirty ? 'Exit without saving' : 'Exit';
    }
    if (this.fcExitCopy) {
      this.fcExitCopy.textContent = dirty ? 'exits without saving' : 'returns';
    }
  }

  leaveFc() {
    this.fc.stopMotors();
    this.fc.confirm = null;
    const dest = ['paused', 'quad', 'pids'].includes(this.fcFrom)
      ? this.fcFrom
      : 'title';
    this.show(dest);
  }

  /* The horizon on the Setup tab, fed by the shell's frame loop. */
  paintFcAttitude() {
    if (this.screen === 'fc' && this.fc.tab === 'setup' && !this.fc.confirm) {
      drawAttitude(this.fcAttitude, this.fc.attitude);
    }
  }

  /*
   * The module readback, from the shell after every successful sim_init.
   * The PIDs screen's bars and its slider fallbacks have no other source:
   * nothing on the screen computes a PID from a slider, so a control that
   * stopped reaching Betaflight shows up as a control that moves nothing.
   */
  setPidsLive(live) {
    this.pidsLive = live || null;
    if (this.screen === 'pids') {
      this.renderMenu();
    }
  }

  helpNode() {
    return {
      title: this.titleHelp,
      howto: this.howtoHelp,
      stickhelp: this.stickHelpHelp,
      tricks: this.trickHelp,
      credits: this.creditsHelp,
      courses: this.coursesHelp,
      freestyle: this.freestyleHelp,
      pilot: this.pilotHelp,
      advanced: this.advancedHelp,
      quad: this.quadHelp,
      launch: this.launchHelp,
      standings: this.standingsHelp,
      rates: this.ratesHelp,
      pids: this.pidsHelp,
      fc: this.fcHelp,
      paused: this.pausedHelp,
      results: this.resultsHelp,
    }[this.screen];
  }

  syncCursor(scroll = true) {
    const items = this.items();
    /*
     * The id of the row the cursor is on, kept so that a REBUILD can put
     * the cursor back on the same row rather than the same index. The
     * bench has four filters now, tab, page, search and only-what-I-
     * changed, and every one of them changes the list's length underneath
     * a cursor that would otherwise stay at 27 and land somewhere else.
     * See restoreFocusRow.
     */
    const here = items[this.cursor];
    if (here && here.id) {
      this.focusId = here.id;
    }
    this.menuRows.forEach((row, k) => {
      const i = k + this.rowOffset;
      const on = i === this.cursor;
      row.classList.toggle('on', on);
      /* Roving tabindex: see renderMenu. Headings are in menuRows too and
       * are not focusable, so they are left alone. */
      if (row.classList.contains('row')) {
        row.tabIndex = on ? 0 : -1;
        row.setAttribute('aria-selected', String(on));
      }
    });
    const help = this.helpNode();
    if (help) {
      const note = items[this.cursor]?.note || '';
      /* A note that scrolls keeps its scroll position when its text is
       * replaced, so the next long note opened part way down if the last
       * one had been read to the end. Only on a change: this runs every
       * cursor move and a scrollTop write is a layout flush. */
      if (help.textContent !== note) {
        help.textContent = note;
        help.scrollTop = 0;
      }
      /*
       * THE TITLE'S NOTE DRAWS OVER THE BRAND COPY, so the brand copy
       * gets out of its way.
       *
       * On the title screen the note is absolutely positioned above the
       * menu and grows UPWARD, out of flow, which means a long note is
       * painted straight on top of the keep note sitting above it. A
       * tester reported it as overlapping text and they were right: at
       * 1536 by 776 the note for the Course row spans 312 to 344 and the
       * keep note spans 279 to 344, so the two are drawn in the same
       * band. Nothing pushed anything because absolute elements do not.
       *
       * Only one of the two is ever being read. The keep note is ambient
       * and always true; the row note is about the thing under the
       * cursor right now. So the ambient one yields, on opacity rather
       * than display, which keeps the layout still and cannot itself
       * shift anything.
       */
      if (this.screens.title) {
        this.screens.title.classList.toggle('has-help', help === this.titleHelp && Boolean(note));
      }
    }
    const on = this.menuRows[this.cursor - this.rowOffset];
    if (scroll && on && typeof on.scrollIntoView === 'function') {
      on.scrollIntoView({ block: 'nearest' });
    }
    /*
     * Move the browser's focus to match, but ONLY if focus is already
     * inside this menu. Two reasons, both learned the hard way elsewhere in
     * this file: a menu that grabs focus on every cursor move takes the
     * caret out of the bench's search field mid-word, and a screen the
     * pilot has not touched yet should not steal focus from the page.
     *
     * preventScroll, because scrollIntoView above has already put the row
     * where it belongs and the browser's own focus scroll would fight it.
     */
    if (on && on !== document.activeElement && this.focusInMenu()) {
      try {
        on.focus({ preventScroll: true });
      } catch (e) {
        /* Older engines take no options. The class is what paints it. */
        on.focus();
      }
    }
  }

  /*
   * Put the browser's focus on the cursor's row whether or not it is
   * already in the menu.
   *
   * syncCursor deliberately will not steal focus from a field, which is
   * what keeps the bench's search typeable. But leaving that field with
   * Down is the one case where the field is being abandoned ON PURPOSE:
   * without this the blur dropped focus to the body and the cursor bar
   * walked the results with nothing focused, so a screen reader followed
   * none of it and Tab restarted from the top of the page.
   */
  focusCursorRow() {
    const on = this.menuRows && this.menuRows[this.cursor - this.rowOffset];
    if (!on || !on.classList.contains('row')) {
      return;
    }
    try {
      on.focus({ preventScroll: true });
    } catch (e) {
      on.focus();
    }
  }

  /* Is the browser's focus on something inside the menu the cursor drives?
   * A row, or a control inside a row. Anything else, a field, the bug chip,
   * the page itself, is left alone. */
  focusInMenu() {
    const live = document.activeElement;
    if (!live || live === document.body) {
      return false;
    }
    /* A typed field or a search field owns its own caret. */
    if (live.tagName === 'INPUT' || live.tagName === 'TEXTAREA') {
      return false;
    }
    return this.menuRows.some((row) => row === live || row.contains(live));
  }

  /*
   * After a rebuild, put the cursor back on the ROW it was on rather than
   * the index it was at.
   *
   * A filter that removes rows above the cursor slides everything up under
   * it, so the cursor stays at 27 and is now pointing at a different key.
   * The bench grew four filters in the same turn this landed, and the
   * launch card and the rooms change length with the seat and the board, so
   * this is not hypothetical.
   *
   * Silent when the row is gone: falling back to the index is the least
   * surprising thing left, and the caller has already clamped it.
   */
  restoreFocusRow() {
    if (!this.focusId) {
      return;
    }
    const items = this.items();
    const at = items.findIndex((it) => it && it.id === this.focusId && this.isStop(it));
    if (at >= 0 && at !== this.cursor) {
      this.cursor = at;
    }
  }

  /* True when this event is a real pointer move, not Chromium reporting
   * that the element under a still mouse changed because the list scrolled
   * or was rebuilt. */
  pointerMoved(e) {
    const x = e.clientX;
    const y = e.clientY;
    const moved = this.ptrX != null && (x !== this.ptrX || y !== this.ptrY);
    this.ptrX = x;
    this.ptrY = y;
    return moved;
  }

  hoverCursor(e, i) {
    if (!this.pointerMoved(e) || this.cursor === i) {
      return;
    }
    this.setCursor(i, true);
  }

  /*
   * Move the cursor. `pointer` says the MOUSE did it, and two things that
   * are right for a key press are wrong for a hover.
   *
   * SCROLLING. syncCursor brings the cursor's row into view, which is the
   * whole point when Down walks off the bottom of a scroller. On a hover
   * the row is already in view, by definition: the pointer is on it. Worse,
   * near the ends of a scroller `block: 'nearest'` still shifts the list a
   * few pixels, which slides a DIFFERENT row under a stationary pointer,
   * which fires another mousemove, which moves the cursor again. That
   * feedback loop is what "the menu is laggy following the mouse" is: not
   * slow code, the list moving under the hand.
   *
   * THE CLICK. A move cue per row is right for one key press and is a
   * machine-gun when a mouse sweeps down twenty rows in a third of a second.
   */
  setCursor(i, pointer = false) {
    this.noteInteraction();
    if (i === this.cursor) {
      return;
    }
    this.closeDrop();
    this.cursor = i;
    if (this.screen === 'courses') {
      const here = this.items()[i];
      if (here && here.course) {
        this.lastCardKey = courseCardKey(here);
      }
    }
    /*
     * A card is lit by a class and by nothing else, and the render pass that
     * sets it only runs when the whole menu is rebuilt, which a cursor move
     * deliberately does not do. So the cursor repaints the cards itself.
     *
     * This used to be inside the `courses` branch above, which is why the
     * Freestyle room's four world cards did not follow the arrow keys at
     * all: the highlight only moved when something else forced a full
     * render. Every card screen goes through markCards now.
     */
    if (this.cardScreen()) {
      this.markCards();
    }
    /*
     * THE TRICK FILM IS LIT BY THE CURSOR AND BY NOTHING ELSE, and it had
     * the card bug above, one screen over, unfixed.
     *
     * renderTricks paints the name, the points, the how-to and the
     * animation for whichever row the cursor is on, and it is called from
     * renderMenu. A cursor move deliberately does NOT rebuild the menu,
     * for the reason markCards exists, so walking the list with the arrows
     * or the mouse moved the highlight and left the panel showing the
     * first trick for ever:
     *
     *   bug-f105cf4a, Fernando: "cuando selecciono otro truco no sale solo
     *   se ve el primer truco", when I select another trick it does not
     *   appear, only the first trick is shown.
     *
     * They were trying to learn tricks they had never flown, which is the
     * one thing this screen is for, and it showed them one of them.
     */
    if (this.screen === 'tricks') {
      this.renderTricks();
    }
    this.syncCursor(!pointer);
    if (this.onUiSound && !pointer) {
      this.onUiSound('move');
    }
  }

  /*
   * Two segments, Off and On, with the live one lit. Not a popup, and not a
   * checkbox either: a checkbox says nothing about what the other state is
   * called, and half of these are not really on and off in the pilot's head,
   * they are two named behaviours.
   *
   * Both segments are clickable and both are labelled, so a mouse can go
   * straight to the state it wants rather than pressing a thing to find out.
   */
  /*
   * A TEXT FIELD THAT FILTERS AS YOU TYPE. One row uses it, the firmware
   * bench's search, and it is separate from the typed number row because
   * that one commits on blur, carries stepper arrows and declares a decimal
   * input mode: three things that are wrong for a name typed a letter at a
   * time.
   *
   * DEBOUNCED, because each keystroke rebuilds the list and a full teardown
   * render of the bench costs about 57 ms on this container. Without it,
   * typing `failsafe` is eight renders and the field drops letters. The
   * caret is deliberately NOT restored by the rebuild: the field is rebuilt
   * with the same value, and refocusing it every frame is what made the
   * first draft impossible to type into.
   */
  makeSearch(it, i) {
    const wrap = el('div', 'row-control row-search');
    const field = document.createElement('input');
    field.className = 'row-num row-textfield';
    field.type = 'text';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.value = it.text.value || '';
    field.placeholder = it.text.placeholder || '';
    field.setAttribute('aria-label', it.label);
    field.addEventListener('click', (e) => e.stopPropagation());
    field.addEventListener('focus', () => {
      this.closeDrop();
      this.cursor = i;
      this.syncCursor(false);
    });
    field.addEventListener('input', () => {
      const v = field.value;
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        if (!it.onText) {
          return;
        }
        it.onText(v);
        /* Put the caret back exactly where it was. The rebuild replaces
         * this node, so the position has to be carried across rather than
         * left to the browser, which would drop it to the end. */
        const at = field.selectionStart;
        this.searchCaret = at;
        this.renderMenu();
        this.restoreSearchCaret();
      }, SEARCH_DEBOUNCE_MS);
    });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        /* Up and down belong to the list, so a pilot can type a few letters
         * and then walk into the results without reaching for the mouse. */
        e.preventDefault();
        e.stopPropagation();
        field.blur();
        this.move(e.key === 'ArrowDown' ? 1 : -1);
        this.focusCursorRow();
        return;
      }
      if (e.key === 'Enter') {
        /* Straight into the results, on the first hit. */
        e.preventDefault();
        e.stopPropagation();
        field.blur();
        this.move(1);
        this.focusCursorRow();
        return;
      }
      if (e.key === 'Escape') {
        /* Leaves the field, then a second Escape leaves search, which is
         * the same two step contract the typed number row has. */
        e.preventDefault();
        e.stopPropagation();
        field.blur();
        return;
      }
      /* Everything else is typing, and must not reach the menu: `d` is
       * ArrowRight on this shell and would adjust a row mid-word. */
      e.stopPropagation();
    });
    wrap.append(field);
    return wrap;
  }

  /* After a search rebuild, put the caret back in the freshly built field. */
  restoreSearchCaret() {
    const row = this.menuRows && this.menuRows[this.cursor - this.rowOffset];
    const field = row && row.querySelector('.row-textfield');
    if (!field) {
      return;
    }
    field.focus();
    const at = this.searchCaret == null ? field.value.length : this.searchCaret;
    try {
      field.setSelectionRange(at, at);
    } catch (e) {
      /* Some inputs refuse a range. The focus is the part that matters. */
    }
  }

  makeSwitch(it, i) {
    const wrap = el('div', 'row-control row-switch');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', it.label);
    for (const seg of [false, true]) {
      const b = btn(`sw-seg${it.on === seg ? ' on' : ''}`, seg ? 'On' : 'Off');
      b.setAttribute('aria-pressed', String(it.on === seg));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cursor = i;
        this.syncCursor(false);
        /* Clicking the segment already lit is not a flip. A switch that
         * toggles on any click is a button wearing a switch's clothes. */
        if (it.on === seg) {
          return;
        }
        this.setSwitch(it, seg);
      });
      wrap.append(b);
    }
    return wrap;
  }

  /*
   * The same strip, for a row with a handful of NAMED choices rather than
   * two states. Flight mode is Acro or Angle, Flight model is Arcade or
   * Expert, Graphics is Low, High or Ultra. None of those is an on and an
   * off, and all of them fit on the row.
   *
   * Drawing them inline is worth more than the width it costs: a popup
   * hides every option a pilot has not chosen, so the row said "Acro" and
   * nothing said what the alternative was called or that there was one.
   */
  makeSegments(it, i) {
    const wrap = el('div', 'row-control row-switch');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', it.label);
    for (const opt of it.options) {
      const live = String(opt.value) === String(it.current);
      const b = btn(`sw-seg${live ? ' on' : ''}`, opt.label);
      b.setAttribute('aria-pressed', String(live));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cursor = i;
        this.syncCursor(false);
        if (live || it.disabled || it.info) {
          return;
        }
        this.pick(opt.value);
      });
      wrap.append(b);
    }
    return wrap;
  }

  /* One place that writes a switch, so the sound, the repaint and the
   * disabled guard cannot drift between the mouse and the keys. */
  setSwitch(it, on) {
    if (!it || !it.sw || it.disabled || it.info) {
      return;
    }
    if (it.on === Boolean(on)) {
      return;
    }
    it.adjust(on ? 1 : -1);
    /* The same path a Left or Right press takes: save, repaint, sound, and
     * hand the settings to whoever is listening. */
    this.writeSettings();
  }

  makeStepper(it, i) {
    const wrap = el('div', 'row-control');
    const val = el('span', 'row-value', it.value);
    val.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cursor = i;
      this.adjust(1);
    });
    const col = el('span', 'step-col');
    const up = btn('step', '▲');
    const down = btn('step', '▼');
    up.setAttribute('aria-label', `Increase ${it.label}`);
    down.setAttribute('aria-label', `Decrease ${it.label}`);
    up.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cursor = i;
      this.adjust(1);
    });
    down.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cursor = i;
      this.adjust(-1);
    });
    col.append(up, down);
    wrap.append(val, col);
    return wrap;
  }

  /*
   * A row with a text field in it.
   *
   * THE COMMIT IS ON BLUR OR ENTER, not on every keystroke, and that is a
   * decision rather than an omission. A field that clamped as you typed
   * would turn the "1" of 1500 into the minimum and then append to it, and
   * a field that re-inited the module on every keystroke would put the quad
   * back on the start line four times for one number. What DOES follow the
   * keystroke is the picture beside the menu: previewNumber draws the curve
   * the half-typed number would fly, so the graph answers before the value
   * is committed.
   *
   * The arrows keep their meaning, one firmware step, and take the typed
   * text as their starting point when there is one, so typing 800 and then
   * pressing up is 810 rather than one step from whatever was stored.
   */
  makeNumber(it, i) {
    const wrap = el('div', 'row-control');
    const field = document.createElement('input');
    field.className = 'row-num';
    field.type = 'text';
    field.inputMode = 'decimal';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.value = it.num.text;
    field.setAttribute('aria-label', it.label);
    field.addEventListener('focus', () => {
      /* An open dropdown belongs to the row it was opened on. Clicking into
       * a field is leaving that row, and the field swallows its own clicks,
       * so without this the list stayed on the screen with the caret
       * somewhere else and the cursor no longer on it. */
      this.closeDrop();
      this.cursor = i;
      this.syncCursor(false);
      field.select();
    });
    field.addEventListener('click', (e) => e.stopPropagation());
    /*
     * Clicking from one field straight into another.
     *
     * The browser would do this itself, and it does not survive here: its
     * focus move blurs the field being left, that commit rebuilds the rows,
     * and the node the click was travelling to is gone before the focus
     * lands. So the move is taken over. preventDefault stops the browser
     * competing, the field being left is blurred deliberately so that its
     * value is committed, and renderMenu puts the caret in the freshly built
     * field at the end of the rebuild. A click inside the field that already
     * has the caret is left alone, or the caret could not be placed.
     */
    field.addEventListener('mousedown', (e) => {
      const live = document.activeElement;
      if (live === field) {
        return;
      }
      e.preventDefault();
      if (live && live.classList && live.classList.contains('row-num')) {
        this.numberFocusWanted = i;
        live.blur();
        return;
      }
      field.focus();
    });
    field.addEventListener('input', () => this.previewNumber(it, field.value));
    field.addEventListener('blur', () => {
      /* A field the menu has already rebuilt away has nothing to commit:
       * removing a focused element fires blur, and the value it carries has
       * just been written by whatever removed it. */
      if (!field.isConnected) {
        return;
      }
      this.commitNumber(it, field.value);
    });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.commitNumber(it, field.value);
        return;
      }
      if (e.key === 'Escape') {
        /* Cancel the edit rather than leave the screen. The window listener
         * in src/input/input.js forwards Escape out of a text field on
         * purpose, so this one has to stop it, and a second Escape on the
         * row goes back as it always did. */
        e.preventDefault();
        e.stopPropagation();
        field.value = it.num.text;
        this.syncRates();
        field.blur();
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        /* Up and down are the menu's, not the caret's. Without this a pilot
         * who clicked into a field could not leave it with the keyboard. */
        e.preventDefault();
        e.stopPropagation();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        this.commitNumber(it, field.value);
        this.move(dir);
      }
    });
    const col = el('span', 'step-col');
    const up = btn('step', '▲');
    const down = btn('step', '▼');
    up.setAttribute('aria-label', `Increase ${it.label}`);
    down.setAttribute('aria-label', `Decrease ${it.label}`);
    for (const [b, dir] of [[up, 1], [down, -1]]) {
      /* Keep the focus where it is: a blur here would rebuild the row and
       * take the button out from under the click that was already on its
       * way, so the first press after typing would do nothing. */
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cursor = i;
        this.stepNumber(it, dir, field.value);
      });
    }
    col.append(up, down);
    wrap.append(field);
    if (it.num.unit) {
      wrap.append(el('span', 'row-num-unit', it.num.unit));
    }
    wrap.append(col);
    return wrap;
  }

  /*
   * A DRAG SLIDER, the control Betaflight Configurator draws for its
   * simplified tuning, plus the number beside it so the value is never a
   * guess. Three ways in, all landing on the same setter: drag the track
   * (native input[type=range], so touch, mouse and a focused arrow key
   * all work for free), arrow keys on the unfocused row through the
   * menu's own adjust path, or click the number and type.
   *
   * THE COMMIT IS ON RELEASE ('change'), not per drag pixel ('input').
   * Every one of these rows re-inits the module when it lands, and a
   * re-init per pixel would both stutter the drag and rebuild the menu
   * out from under the pointer mid-drag. 'input' only repaints the
   * number; letting go applies, exactly one init per gesture.
   */
  makeSliderControl(it, i) {
    const wrap = el('div', 'row-control row-slider');
    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'row-range';
    range.min = String(it.range.min);
    range.max = String(it.range.max);
    range.step = String(it.range.step || 1);
    range.value = String(it.num.cli);
    range.setAttribute('aria-label', it.label);
    range.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.closeDrop();
      this.cursor = i;
      this.syncCursor(false);
    });
    range.addEventListener('click', (e) => e.stopPropagation());
    range.addEventListener('change', () => {
      const v = Number(range.value);
      if (!Number.isFinite(v) || v === it.num.cli) {
        return;
      }
      it.set(v);
      this.writeSettings();
    });
    /* The number is typed, same contract as makeNumber: commit on Enter
     * or blur, Escape restores. Small on purpose; the track is the star. */
    const field = document.createElement('input');
    field.className = 'row-num row-range-num';
    field.type = 'text';
    field.inputMode = 'decimal';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.value = it.num.text;
    field.setAttribute('aria-label', `${it.label} value`);
    field.addEventListener('click', (e) => e.stopPropagation());
    field.addEventListener('pointerdown', (e) => e.stopPropagation());
    field.addEventListener('focus', () => {
      this.closeDrop();
      this.cursor = i;
      this.syncCursor(false);
      field.select();
    });
    field.addEventListener('blur', () => {
      if (!field.isConnected) {
        return;
      }
      this.commitNumber(it, field.value);
    });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.commitNumber(it, field.value);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        field.value = it.num.text;
        field.blur();
      }
    });
    /* The drag repaints the FIELD, live, so the number is never behind
     * the thumb; the commit still waits for release. */
    range.addEventListener('input', () => {
      field.value = formatRate(it.num.spec, Number(range.value));
    });
    wrap.append(range, field);
    if (it.num.unit) {
      wrap.append(el('span', 'row-num-unit', it.num.unit));
    }
    return wrap;
  }

  /* Put the caret in a typed row's field, from a click on the row or from
   * Enter on the keyboard. */
  focusNumber(i) {
    const row = this.menuRows[i - this.rowOffset];
    const field = row && row.querySelector('.row-num');
    if (field) {
      field.focus();
    }
  }

  /*
   * Draw the curve the text in the field would fly, without committing it.
   *
   * The write into the settings is REAL and is undone on the next line. It
   * is done that way because the row's own setter is the only thing that
   * knows where the value goes and whether roll carries pitch with it, and
   * nothing can read the settings between these two statements: no save, no
   * onSettings, no await.
   */
  previewNumber(it, raw) {
    if (!this.ratesPanel || this.screen !== 'rates') {
      return;
    }
    const next = it.typed(raw);
    if (next == null) {
      return;
    }
    const before = it.num.cli;
    it.set(next);
    try {
      this.ratesPanel.paint(this.settings.rates, this.ratesStick, this.settings.airframe);
    } finally {
      it.set(before);
    }
  }

  commitNumber(it, raw) {
    const next = it.typed(raw);
    if (next == null || next === it.num.cli) {
      /* Nothing to store, but the field may hold "67x" or a number that
       * rounds to what is already there, so the row is rebuilt to put the
       * stored value back on the screen. */
      this.renderMenu();
      return;
    }
    it.set(next);
    this.writeSettings();
  }

  stepNumber(it, dir, raw) {
    const typed = it.typed(raw);
    const base = typed == null ? it.num.cli : typed;
    const spec = it.num.spec;
    const next = Math.max(spec.cliMin, Math.min(spec.cliMax, base + dir));
    if (next === it.num.cli) {
      this.renderMenu();
      return;
    }
    it.set(next);
    this.writeSettings();
  }

  /* Store, redraw, tell the shell. The three things every row that changes
   * a setting does, in one place. */
  writeSettings() {
    /*
     * ONLY WHEN THE AIRCRAFT MOVED, and the comment this replaces explains
     * why it has to be conditional: "The Aircraft row comes through here,
     * so this is where a pilot who swaps to the whoop from inside the town
     * stops being in freestyle." That is the one row it was written for,
     * and EVERY row that changes a setting comes through here.
     *
     * syncMode does not ask what changed. On a whoop, where freestyle is
     * not offered because there is nowhere to fly it, it forces mode to
     * race and the map to custom. So a pilot on the whoop, in the town,
     * who nudged the camera angle was thrown onto the custom track:
     *
     *   bug-4d5b2c51: "when i tried to change the camera angle (on the
     *   65mm) it brought me to a different page. I want to freestyle but
     *   always go to the raceGOW track page as soon as i try to adjust cam
     *   angle." And, in the same ticket, "changing the quad in freestyle
     *   doesn't seem to make a difference", which is the other end of it.
     *
     * Measured before the change: camera angle 25 to 15 on a seated whoop
     * moved mode freestyle to race and map city to custom, touching
     * nothing else. Gating on the aircraft keeps the case it was written
     * for, because swapping aircraft is exactly when the airframe moves,
     * and boot still runs it once for a stale saved pair.
     */
    if (this.settings.airframe !== this.modeSyncedFor) {
      this.modeSyncedFor = this.settings.airframe;
      this.syncMode();
    }
    saveSettings(this.settings);
    this.renderMenu();
    /* The title's freestyle line and the score overlay both read a setting
     * this row may have just changed. See refreshBest. */
    this.refreshBest();
    if (this.onUiSound) {
      this.onUiSound('adjust');
    }
    if (this.onSettings) {
      this.onSettings(this.settings);
    }
  }

  makeDrop(it, i) {
    const wrap = el('div', 'row-control');
    const b = btn('drop-btn', it.value);
    b.setAttribute('aria-haspopup', 'listbox');
    b.setAttribute('aria-label', it.label);
    /* The whole value, for when the button cuts it (MENUS-PLAN.md 1.39). */
    b.title = String(it.value == null ? '' : it.value);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.dropIndex === i) {
        this.closeDrop();
        return;
      }
      this.openDrop(i, b, it);
    });
    wrap.append(b);
    return wrap;
  }

  /*
   * Open the list on the row the cursor is on, from the keyboard.
   *
   * openDrop needs an element to hang the list under and the mouse path
   * hands it the button that was clicked. From the keys there is no such
   * event, so the button is looked up on the row. If the row has no button,
   * which is every row rendered before this list existed, the row itself is
   * a perfectly good thing to hang a list under.
   */
  openDropForCursor() {
    const i = this.cursor;
    const it = this.items()[i];
    const row = this.menuRows && this.menuRows[i - this.rowOffset];
    if (!it || !it.options || !it.options.length || !row) {
      return;
    }
    if (this.onUiSound) {
      this.onUiSound('select');
    }
    this.openDrop(i, row.querySelector('.drop-btn') || row, it);
  }

  openDrop(i, anchor, it) {
    this.closeDrop();
    this.cursor = i;
    this.syncCursor();
    const list = el('div', 'drop-list');
    list.setAttribute('role', 'listbox');
    for (const opt of it.options) {
      const o = btn(`drop-opt${String(opt.value) === String(it.current) ? ' on' : ''}`, opt.label);
      o.setAttribute('role', 'option');
      o.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeDrop();
        this.cursor = i;
        this.pick(opt.value);
      });
      list.append(o);
    }
    this.root.append(list);
    const r = anchor.getBoundingClientRect();
    list.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 240))}px`;
    list.style.minWidth = `${Math.max(r.width, 148)}px`;
    list.style.top = `${r.bottom + 4}px`;
    const lr = list.getBoundingClientRect();
    if (lr.bottom > window.innerHeight - 8) {
      list.style.top = `${Math.max(8, r.top - lr.height - 4)}px`;
    }
    this.dropEl = list;
    this.dropIndex = i;
    this.dropOpts = [...list.querySelectorAll('.drop-opt')];
    this.dropHi = this.dropOpts.findIndex((o) => o.classList.contains('on'));
    if (this.dropHi < 0) {
      this.dropHi = 0;
    }
    this.markDropHi();
  }

  markDropHi() {
    if (!this.dropOpts) {
      return;
    }
    this.dropOpts.forEach((o, j) => o.classList.toggle('on', j === this.dropHi));
    const on = this.dropOpts[this.dropHi];
    if (on) {
      on.scrollIntoView({ block: 'nearest' });
    }
  }

  moveDrop(dir) {
    if (!this.dropEl || !this.dropOpts || !this.dropOpts.length) {
      return;
    }
    const n = this.dropOpts.length;
    this.dropHi = (this.dropHi + dir + n) % n;
    this.markDropHi();
    if (this.onUiSound) {
      this.onUiSound('move');
    }
  }

  confirmDrop() {
    const it = this.items()[this.cursor];
    const opt = it && it.options && it.options[this.dropHi];
    this.closeDrop();
    if (opt) {
      this.pick(opt.value);
    }
  }

  closeDrop() {
    if (this.dropEl) {
      this.dropEl.remove();
      this.dropEl = null;
    }
    this.dropIndex = null;
    this.dropOpts = null;
    this.dropHi = 0;
  }

  pick(value) {
    const it = this.items()[this.cursor];
    if (!it || !it.pick) {
      return;
    }
    it.pick(value);
    saveSettings(this.settings);
    this.renderMenu();
    /* Same reason as writeSettings: see refreshBest. */
    this.refreshBest();
    if (this.onUiSound) {
      this.onUiSound('adjust');
    }
    if (this.onSettings) {
      this.onSettings(this.settings);
    }
  }

  /*
   * The world cards, and the flight playing on each of them.
   *
   * BUILT ONCE, then only re-marked. The menu is rebuilt from scratch on
   * every cursor move, which is what keeps it honest everywhere else, and
   * doing that here would throw away three live shots twenty times a
   * second as somebody arrowed along the row.
   */
  /*
   * Which card the cursor is on, painted. One pass for all three card
   * screens, because a card's lit state is a class on an element the render
   * pass built and the cursor moves far more often than the list changes.
   */
  markCards() {
    if (this.screen === 'title') {
      for (const [i, c] of (this.titleCards || []).entries()) {
        const on = i === this.cursor;
        c.card.classList.toggle('on', on);
        /* Roving tab stop, the same shape the rows use. A card is a real
         * control here rather than a picture: it is the only thing on the
         * first screen, so Tab and a screen reader have to find it. */
        c.card.tabIndex = on ? 0 : -1;
        c.card.setAttribute('aria-current', String(on));
      }
      return;
    }
    const worlds = this.mapCards || [];
    worlds.forEach((c, j) => c.card.classList.toggle('on', j === this.cursor));
    (this.courseCards || []).forEach((c, j) => {
      c.card.classList.toggle('on', j + worlds.length === this.cursor);
    });
    if (this.screen === 'freestyle') {
      (this.boardMapCards || []).forEach((c, j) => {
        c.card.classList.toggle('on', j + worlds.length === this.cursor);
      });
    }
  }

  /*
   * The gate's three cards.
   *
   * Built from the same items() the rows come from, so there is one list and
   * one cursor over the whole screen, and rebuilt only when the set of cards
   * changes rather than on every cursor move.
   *
   * A div with role=button rather than a real <button>: Enter is already
   * handled by handleKey for whatever the cursor is on, and a native button
   * would ALSO fire a click for the same keypress, which would answer the
   * gate twice and swap the world twice.
   */
  renderTitleCards() {
    const host = this.gateCards;
    if (!host) {
      return;
    }
    const items = this.items().filter((it) => it.card);
    const key = items.map((it) => it.card).join('|');
    if (!this.titleCards || this.titleCardKey !== key) {
      this.titleCardKey = key;
      host.textContent = '';
      this.titleCards = items.map((it, i) => {
        const card = el('div', `gate-card gate-card-${it.card}`);
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', it.label);
        const art = el('div', 'gate-card-art');
        if (it.art) {
          const img = el('img', 'gate-card-shot');
          img.src = it.art;
          /* The name is right underneath it, so the picture is decoration to
           * anything reading the page aloud. */
          img.alt = '';
          img.decoding = 'async';
          art.append(img);
        }
        if (it.svg) {
          /*
           * A DRAWING OVER THE PHOTOGRAPH, and the two say different things.
           *
           * The photograph answers "what is this place like", and a picture
           * of a town, a field or a room is the only honest answer to that.
           * It cannot answer "how big is the thing I am flying", because
           * whatever is in front of the lens fills the frame: the five inch
           * and the whoop are 220 mm and 65 mm across and both would be a
           * quad on a card.
           *
           * So the plan is drawn over the corner of each, and BOTH ARE DRAWN
           * TO ONE SCALE in one viewBox, which is why the whoop's mark is a
           * fifth of the width of the five inch's. That relationship is the
           * single most useful thing these cards can tell somebody who has
           * flown one and not the other. See craftSvg.
           */
          const mark = el('div', 'gate-card-mark');
          mark.innerHTML = it.svg;
          art.append(mark);
        }
        const body = el('div', 'gate-card-body');
        const name = el('div', 'gate-card-name', it.label);
        const blurb = el('p', 'gate-card-blurb', it.blurb);
        const facts = el('div', 'gate-card-facts');
        for (const f of it.facts || []) {
          facts.append(el('span', 'gate-card-fact', f));
        }
        body.append(name, blurb, facts);
        card.append(art, body);
        card.addEventListener('mousemove', (e) => this.hoverCursor(e, i));
        card.addEventListener('focus', () => {
          if (this.cursor !== i) {
            this.setCursor(i);
          }
        });
        card.addEventListener('click', () => {
          this.cursor = i;
          this.select();
        });
        host.append(card);
        return { card };
      });
    }
    this.markCards();
  }


  /*
   * The rows, with each trick's film built once and kept. A film is a handful
   * of closures over numbers; building sixty of them costs nothing and
   * rebuilding one per keypress would.
   */
  trickRows() {
    if (!this.trickList) {
      this.trickList = scoreableTricks().map((t) => {
        const film = filmFor(t.steps);
        return {
          ...t, film, how: film.caption, view: film.view, status: trickStatus(t),
        };
      });
    }
    return this.trickList;
  }

  /*
   * Show whichever trick the cursor is on. Guarded on the NAME having
   * changed, because this runs on every menu render and restarting an
   * animation that is already playing is a visible stutter.
   */
  renderTricks() {
    const rows = this.trickRows();
    if (!rows.length || !this.trickPlayer) {
      return;
    }
    const t = rows[Math.max(0, Math.min(rows.length - 1, this.cursor))] || rows[0];
    if (t.name === this.trickShown) {
      return;
    }
    this.trickShown = t.name;
    Ui.text(this.trickName, t.name);
    Ui.text(this.trickMeta, `${formatScore(t.points)} points \u00b7 ${t.difficulty}`
      + ` \u00b7 ${t.category} \u00b7 ${t.status.tag}`);
    Ui.text(this.trickHow, `${t.how} ${t.status.line}`);
    /* Which way the camera faces, because a roll seen from the side is a
     * craft that does not appear to move at all and the reader has to know
     * they are being shown the one angle it reads from. */
    const view = VIEW_LABEL[t.view].replace('seen ', '');
    Ui.text(this.trickView, `Seen ${view}. The pink nose is the front of the quad, and the faded copies are where it was.`);
    this.trickPlayer.show(t.film);
  }

  renderMapCards() {
    /* Whichever picker is up. Race holds no world cards any more, so on that
     * screen this paints an empty strip and costs nothing. */
    const host = this.screen === 'freestyle' ? this.freestyleCards : this.mapCardHost;
    if (!host) {
      return;
    }
    const items = this.items().filter((it) => it.map);
    if (!this.mapCards || this.mapCards.length !== items.length) {
      this.stopReels();
      host.textContent = '';
      this.mapCards = items.map((it, i) => {
        const card = el('div', 'map-card');
        markPoster(card, it.map);
        const shot = el('div', 'map-reel');
        const body = el('div', 'map-card-body');
        const name = el('div', 'map-card-name', it.label);
        const tag = el('div', 'map-card-tag', '');
        const still = el('div', 'map-card-still', '');
        /* The STF stamp, up when this browser has found the mark in the
         * world this card flies. See the update below. */
        const stamp = stfLettering('map-card-stamp');
        stamp.hidden = true;
        stamp.title = 'You found the STF mark here';
        stamp.setAttribute('role', 'img');
        stamp.setAttribute('aria-label', 'You found the STF mark here');
        body.append(name, tag);
        card.append(shot, still, stamp, body);
        card.addEventListener('mousemove', (e) => this.hoverCursor(e, i));
        card.addEventListener('click', () => {
          this.cursor = i;
          this.select();
        });
        host.append(card);
        return {
          card, shot, tag, still, stamp, name, id: it.map.id,
        };
      });
      this.startReels();
    }
    this.mapCards.forEach((c, i) => {
      c.card.classList.toggle('on', i === this.cursor);
      /* A map from the board flies in the built world too, and then it is
       * that map's card that says so, not Your map's. */
      const flying = c.id === this.settings.map && !(c.id === 'built' && this.sharedMap);
      c.tag.textContent = flying ? 'Flying now' : '';
      /*
       * THE STAMP IS FOR THE WORLD THE CARD WOULD FLY, asked every render,
       * because Your map is whatever the builder's freestyle seat holds and
       * that can change in another tab while this one sits on the menu. It
       * reads the seat and the stamp record and builds nothing: well under
       * a millisecond for the starter's document.
       *
       * No stamp at all while finds are off (MARK_FINDS in src/game/egg.js),
       * including one this browser wrote before they were.
       */
      const found = MARK_FINDS && Boolean(stampFor(stampKeyForMap(c.id)));
      if (c.stamp.hidden === found) {
        c.stamp.hidden = !found;
      }
    });
  }

  /*
   * The board's maps, as cards under the worlds. Rebuilt when the list
   * changes, and otherwise only relit, like the course cards.
   *
   * THE PICTURE IS THE MAP'S SHARE CARD: one frame of it in the renderer
   * the game flies, drawn by the browser that published it (src/share/
   * card.js), so a map is chosen by what it looks like, as the worlds above
   * are. An <img> and not a background, because a card that will not load
   * has something better to fall back to than the dark rectangle: the
   * outline drawing the board's own tile shows (drawPlan in
   * src/share/plan.js), which is also what a map with no share card gets.
   * The picture is decorative, so its alt is empty: the name is under it.
   *
   * The found STF mark stamps these cards as it does the worlds'. A map
   * from the board keys its stamp by its document's id, which is the id it
   * has on the board (stfKey in src/maps/built/egg.js). While finds are off
   * (MARK_FINDS in src/game/egg.js) no card wears one.
   */
  renderBoardMapCards() {
    const host = this.boardMapHost;
    if (!host) {
      return;
    }
    const items = this.items();
    const offset = items.filter((it) => it.map).length;
    const cards = items.filter((it) => it.boardMap);
    const key = cards.map((it) => `${it.boardMap.id}:${it.boardMap.cardUtc}`).join('|');
    if (!this.boardMapCards || this.boardMapCardKey !== key) {
      host.textContent = '';
      this.boardMapCardKey = key;
      this.boardMapCards = cards.map((it, k) => {
        const m = it.boardMap;
        const card = el('div', 'map-card course-card board-map-card');
        const shot = el('div', 'map-reel');
        const c = { card, canvas: null, id: m.id };
        const drawn = () => {
          c.canvas = planCanvas(m.plan, `Plan of ${m.name}`);
          shot.replaceChildren(c.canvas);
          c.painted = drawPlan(c.canvas, c.canvas.planData);
        };
        const picture = mapCardUrl(m);
        if (picture) {
          const img = el('img', 'map-reel-view board-map-shot');
          img.alt = '';
          img.decoding = 'async';
          img.loading = 'lazy';
          img.addEventListener('error', drawn, { once: true });
          img.src = picture;
          shot.append(img);
        }
        const body = el('div', 'map-card-body');
        const name = el('div', 'map-card-name', it.label);
        c.tag = el('div', 'map-card-tag', '');
        c.stamp = stfLettering('map-card-stamp');
        c.stamp.hidden = true;
        c.stamp.title = 'You found the STF mark here';
        c.stamp.setAttribute('role', 'img');
        c.stamp.setAttribute('aria-label', 'You found the STF mark here');
        /* Dotted rather than spaced, as the standings lede is: the page
         * folds two spaces into one, and "by Mat 51 pieces 5 named gaps"
         * reads as one run of words. */
        const meta = el('div', 'map-card-meta', [m.author ? `by ${m.author}` : '', ...mapFacts(m)]
          .filter(Boolean).join(' \u00b7 '));
        body.append(name, c.tag);
        card.append(shot, c.stamp, body, meta);
        card.addEventListener('mousemove', (e) => this.hoverCursor(e, k + offset));
        card.addEventListener('click', () => {
          this.cursor = k + offset;
          this.select();
        });
        host.append(card);
        if (!picture) {
          drawn();
        }
        return c;
      });
    }
    const flying = this.settings.map === 'built' && this.sharedMap ? this.sharedMap.id : null;
    this.boardMapCards.forEach((c, k) => {
      c.card.classList.toggle('on', k + offset === this.cursor);
      c.tag.textContent = c.id === flying ? 'Flying now' : '';
      /* A plan drawn while the room was hidden had no size to draw at, so
       * it is drawn again the first time the room is up. */
      if (c.canvas && !c.painted) {
        c.painted = drawPlan(c.canvas, c.canvas.planData);
      }
      const found = MARK_FINDS && Boolean(stampFor(`built:${c.id}`));
      if (c.stamp.hidden === found) {
        c.stamp.hidden = !found;
      }
    });
  }

  /*
   * The course cards: what is on the canvas, and what is on the board.
   *
   * A COURSE IS DRAWN, NOT DESCRIBED. These used to be paragraphs of type on
   * a blank card, so a player chose a course without ever seeing its shape,
   * while the board and the builder were both drawing exactly the picture
   * that would have told them. The plan is the same drawing all three use;
   * see src/share/plan.js. The board ships one with its list, and the local
   * canvas gets one derived from its document.
   */
  renderCourseCards() {
    const host = this.courseCardHost;
    if (!host) {
      return;
    }
    const items = this.items();
    const offset = items.filter((it) => it.map).length;
    const cards = items.filter((it) => it.course);
    const key = cards.map((it) => `${it.course.kind}:${it.label}`).join('|');
    if (!this.courseCards || this.courseCardKey !== key) {
      host.textContent = '';
      this.courseCardKey = key;
      this.courseCards = cards.map((it, k) => {
        const i = k + offset;
        const fresh = it.course.kind === 'new';
        const card = el('div', fresh ? 'map-card course-card course-card-new' : 'map-card course-card');
        const shot = el('div', 'map-reel');
        /* A card that carries its own track, as against the seated one,
           whose plan comes from the seat. Both of this screen's sources
           carry theirs: the board's listing and the library's document. */
        const listed = it.course.kind === 'board' || it.course.kind === 'local';
        const plan = listed
          ? it.course.track.plan
          : (fresh ? null : currentPlan());
        /* Build a track has no plan to draw. Its picture is a plus on an
         * empty field, which is what the builder opens on. */
        const canvas = fresh ? null : planCanvas(plan, `Plan of ${it.label}`);
        /* Said on the picture while the board hands this track over to be
         * flown: see flyCard. Laid over it rather than put beside the name,
         * where a word rewraps the name and the card grows, and every card
         * under it moves the moment after a double click asked for a page
         * that holds still. */
        const wait = el('div', 'course-card-wait', 'Loading');
        wait.hidden = true;
        if (fresh) {
          shot.append(el('div', 'course-card-plus', '+'));
        } else {
          shot.append(canvas);
        }
        shot.append(wait);
        const body = el('div', 'map-card-body');
        const name = el('div', 'map-card-name', it.label);
        const meta = el('div', 'map-card-meta', '');
        /*
         * WHO, HOW BIG, AND THE TIME TO BEAT, as three things rather than one
         * run of words (MENUS-PLAN.md 1.14). They were joined by two spaces,
         * which a line break or a long name turned into "by Ana 12 gates
         * record 41.20" and a reader had to find the joins. A middle dot
         * between the facts, and the record on a line of its own with its
         * label, because it is the one number on the card a pilot compares.
         */
        const record = el('div', 'map-card-record', '');
        if (fresh) {
          meta.textContent = 'An empty field in the builder';
        } else if (listed) {
          const t = it.course.track;
          /* The designer where the board knows one, because the author is
           * whoever published it and on a track brought over from a series
           * those are two different people. */
          meta.textContent = [byLine(t), `${t.gates} gate${t.gates === 1 ? '' : 's'}`]
            .filter(Boolean)
            .join(' \u00b7 ');
          if (t.recordMs != null) {
            record.textContent = t.recordThree
              ? `Record, three laps: ${formatTime(t.recordMs)}`
              : `Record lap: ${formatTime(t.recordMs)}`;
          }
        } else {
          const size = fieldSize(plan);
          meta.textContent = [`${it.course.seat.gates} gate${it.course.seat.gates === 1 ? '' : 's'}`, size]
            .filter(Boolean)
            .join(' \u00b7 ');
        }
        /*
         * NO BADGE OVER THE PICTURE. Shipped, on the board and not on the
         * board were three words laid over the one thing the card is for,
         * and a pilot choosing a course is choosing a course rather than a
         * provenance. Where the track came from is still said, in the note
         * beside the list once a card is chosen, which is where a question
         * about it gets asked. courseChip still decides that wording, so
         * the builder, the board and this room cannot describe one course
         * two ways.
         */
        const tag = el('div', 'map-card-tag', '');
        body.append(name, tag);
        card.append(shot, body, meta, record);
        card.addEventListener('mousemove', (e) => this.hoverCursor(e, i));
        card.addEventListener('click', (e) => {
          const key = courseCardKey(it);
          /* The second press of a double click on this card belongs to the
           * double click, which flies it: see cardDoubleClick. Choosing it
           * again here would be a second answer to one gesture. */
          if (e.detail > 1 && key === this.cardPress) {
            return;
          }
          /* A quick press on a DIFFERENT card is a new choice and not the
           * end of a double click, whatever the browser counts: Android
           * counts two taps as far as 100 dp apart as one double tap, and
           * two cards are 16 px apart. So only a first press begins one. */
          this.cardPress = e.detail > 1 ? null : key;
          this.cursor = i;
          this.select(true);
        });
        host.append(card);
        return { card, canvas, tag, wait, kind: it.course.kind, key: courseCardKey(it) };
      });
      this.paintCoursePlans();
    }
    if (this.courseOrderChips) {
      for (const chip of this.courseOrderChips.children) {
        const on = chip.dataset.order === this.settings.courseOrder;
        chip.classList.toggle('on', on);
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
    this.courseCards.forEach((c, k) => {
      const i = k + offset;
      c.card.classList.toggle('on', i === this.cursor);
      /* The list below belongs to one card. Say which, or the screen is back
       * to looking like a strip of cards over an unrelated menu. */
      c.card.classList.toggle('chosen', Boolean(this.cardSubject) && c.key === this.cardSubject);
      /* Loading on the card the pilot pressed while the board hands its
       * document over, because the room's own note for it is under every
       * other card and a double click is made with the eyes on this one. */
      const loading = Boolean(this.openingBoardCourse) && c.key === this.flyingCard;
      if (c.wait.hidden === loading) {
        c.wait.hidden = !loading;
      }
      c.tag.textContent = c.kind === 'current' && this.settings.map === 'custom' ? 'Flying now' : '';
    });
    this.placeCourseSheet();
  }

  /*
   * THE CHOSEN CARD'S SHEET OPENS UNDER ITS OWN LINE OF THE GRID
   * (MENUS-PLAN.md 2.4), the way a photo library opens a picture: the
   * cards above stay where they were, the chosen one keeps its place, and
   * what can be done with it is directly beneath it rather than under all
   * thirty one cards. The sheet is the room's own menu stage, moved: the
   * rows, the cursor, the help and the command bar are all the ones every
   * other screen uses.
   *
   * The line is worked out from the card's index and how many cards fit
   * across, not from where the cards are drawn now, because the sheet
   * itself breaks the line it is put after: measured with it in place, a
   * resize would keep the old break for ever.
   *
   * With nothing chosen the stage goes back under the strip, where it holds
   * the room's Back.
   */
  placeCourseSheet() {
    const stage = this.coursesStage;
    const host = this.courseCardHost;
    if (!stage || !host || !this.courseStrip) {
      return;
    }
    const cards = this.courseCards || [];
    const at = this.cardSubject ? cards.findIndex((c) => c.key === this.cardSubject) : -1;
    if (at < 0) {
      this.sheetAfterKey = null;
      stage.classList.remove('is-sheet');
      stage.style.removeProperty('--notch-x');
      stage.style.removeProperty('--sheet-w');
      if (stage.previousElementSibling !== this.courseStrip) {
        this.courseStrip.after(stage);
      }
      return;
    }
    const first = cards[0].card;
    const width = first.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(host).columnGap) || 0;
    const across = width > 0
      ? Math.max(1, Math.floor((host.clientWidth + gap + 0.5) / (width + gap)))
      : 1;
    const end = Math.min(cards.length - 1, (Math.floor(at / across) + 1) * across - 1);
    this.sheetAfterKey = cards[end].key;
    stage.classList.add('is-sheet');
    /* As wide as a full line of cards, so its rule lines up with the grid
     * above and below it. Still too wide to share a line with a card. */
    const span = Math.min(across, cards.length);
    stage.style.setProperty('--sheet-w', `${Math.round(span * width + (span - 1) * gap)}px`);
    if (cards[end].card.nextElementSibling !== stage) {
      cards[end].card.after(stage);
    }
    /* The notch points at the card the sheet belongs to. */
    const sheetBox = stage.getBoundingClientRect();
    const cardBox = cards[at].card.getBoundingClientRect();
    stage.style.setProperty('--notch-x', `${Math.round(cardBox.left + cardBox.width / 2 - sheetBox.left)}px`);
    this.paintPodium();
  }

  /*
   * THE TOP THREE, IN THE SHEET (MENUS-PLAN.md 2.4). A pilot choosing a
   * track wants to know what it takes, and the answer was a screen away
   * behind Standings. The sheet's first column was empty, so it holds the
   * fastest three pilots, each once at their best, read from the board when
   * the card is chosen. Standings is still the door to the whole table.
   *
   * Only a track the board holds has times: a track of your own that is
   * not published shows none, and the column stays empty.
   */
  podiumSubject() {
    if (this.screen !== 'courses' || !this.cardSubject) {
      return null;
    }
    const card = this.subjectCard();
    if (!card || !card.course) {
      return null;
    }
    const room = airframeById(this.settings.airframe).trackClass === 'micro';
    if (card.course.kind === 'board') {
      const t = card.course.track;
      return { key: `${t.board || ''}|${t.id}`, id: t.id, board: t.board || undefined, room };
    }
    if (card.course.kind === 'current') {
      const listing = liveListing('custom');
      if (listing && listing.shareId) {
        const board = listing.board || (this.share && this.share.board) || undefined;
        return { key: `${board || ''}|${listing.shareId}`, id: listing.shareId, board, room };
      }
    }
    return null;
  }

  loadPodium() {
    const subject = this.podiumSubject();
    if (!subject || this.podiumCache.has(subject.key)) {
      return;
    }
    this.podiumCache.set(subject.key, null);
    fetchTrackTimes(subject.id, subject.board)
      .then((times) => {
        const best = new Map();
        for (const row of times) {
          const ms = subject.room ? row.threeMs : row.lapMs;
          if (!Number.isFinite(ms)) {
            continue;
          }
          const who = String(row.name || '').trim().toLowerCase();
          const had = best.get(who);
          if (!had || ms < had.ms) {
            best.set(who, { name: row.name, ms });
          }
        }
        const rows = [...best.values()].sort((a, b) => a.ms - b.ms).slice(0, 3);
        this.podiumCache.set(subject.key, { rows });
      })
      .catch(() => {
        this.podiumCache.set(subject.key, { error: true });
      })
      .finally(() => {
        if (this.screen === 'courses') {
          this.paintPodium();
        }
      });
  }

  paintPodium() {
    const box = this.coursePodium;
    if (!box) {
      return;
    }
    const subject = this.podiumSubject();
    box.textContent = '';
    box.hidden = !subject;
    if (!subject) {
      return;
    }
    box.append(el('div', 'sheet-podium-head', subject.room ? 'Fastest three laps' : 'Fastest lap'));
    const got = this.podiumCache.get(subject.key);
    if (!got) {
      box.append(el('div', 'sheet-podium-note', 'Reading the board'));
      return;
    }
    if (got.error) {
      box.append(el('div', 'sheet-podium-note', 'The board is not answering, so no times.'));
      return;
    }
    if (!got.rows.length) {
      box.append(el('div', 'sheet-podium-note', 'No times yet. The first one posted is the record.'));
      return;
    }
    const me = (readPilotName() || '').trim().toLowerCase();
    got.rows.forEach((row, i) => {
      const line = el('div', 'sheet-podium-row');
      if (me && String(row.name || '').trim().toLowerCase() === me) {
        line.classList.add('is-me');
      }
      line.append(
        el('span', 'sheet-podium-rank', String(i + 1)),
        el('span', 'sheet-podium-name', row.name || 'Unnamed pilot'),
        el('span', 'sheet-podium-time', formatTime(row.ms)),
      );
      box.append(line);
    });
  }

  /*
   * A CHOOSE MUST NOT MOVE THE CARD THAT WAS CHOSEN. Opening one card's
   * sheet closes another's, and when the other was above it every card
   * from there down moves up by that sheet's height, under a pointer that
   * did not move: a second press of a double click then lands on a
   * different track. So the page is scrolled by however far the card moved,
   * and the strip never gets shorter while the room is open (a shorter
   * page scrolled to its foot is moved by the browser, not by us). show()
   * lets the height go when the room is left.
   */
  courseCardTop(key) {
    const c = (this.courseCards || []).find((x) => x.key === key);
    return c ? c.card.getBoundingClientRect().top : null;
  }

  holdCourseStrip() {
    const strip = this.courseStrip;
    if (strip) {
      strip.style.minHeight = `${Math.max(strip.offsetHeight, parseFloat(strip.style.minHeight) || 0)}px`;
    }
  }

  keepCardStill(key, before) {
    const after = this.courseCardTop(key);
    const page = this.screens && this.screens.courses;
    if (before == null || after == null || !page) {
      return;
    }
    const moved = after - before;
    if (Math.abs(moved) >= 1) {
      page.scrollTop += moved;
    }
  }

  /* A canvas reports no size until it is laid out, so the first paint waits
   * for the frame after the cards are in the document. */
  paintCoursePlans() {
    if (!this.courseCards || !this.courseCards.length) {
      return;
    }
    /*
     * THE CARD IS THE THREE QUARTER VIEW, not the plan, and it flies. A
     * pilot picking a course is asking what it looks like, and from above a
     * two high stack and a single gate are the same line. See drawIso in
     * src/share/plan.js: same data, same angles, same colours and the same
     * travelling ribbon as the animation exporter, so a card and an
     * exported GIF of one track are the same object.
     */
    this.stopCoursePlans();
    /* Each card is asked for the phase of ITS OWN lap: a long course and a
     * short one share a speed, not a duration, so their ribbons are at
     * different points of their own laps at the same moment. */
    const paint = (ms) => {
      for (const c of this.courseCards || []) {
        if (!c.canvas) {
          continue;
        }
        const plan = c.canvas.planData;
        drawIso(c.canvas, plan, ms == null ? {} : { phase: (ms / isoLapMs(plan)) % 1 });
      }
    };
    /* A pilot who has asked for less motion gets the structure and no lap,
     * which is the still of the same drawing rather than a different one. */
    const reduced = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    if (reduced) {
      requestAnimationFrame(() => paint(null));
      return;
    }
    const began = performance.now();
    let last = -COURSE_PLAN_MS;
    const tick = (now) => {
      if (!this.courseCards || !this.courseCards.length || this.screen !== 'courses') {
        this.coursePlanFrame = null;
        return;
      }
      this.coursePlanFrame = requestAnimationFrame(tick);
      /* Nothing is repainted for a tab nobody is looking at. */
      if (document.hidden || now - last < COURSE_PLAN_MS) {
        return;
      }
      last = now;
      paint(now - began);
    };
    this.coursePlanFrame = requestAnimationFrame(tick);
  }

  /* The card animation belongs to one visit to the room. */
  stopCoursePlans() {
    if (this.coursePlanFrame != null) {
      cancelAnimationFrame(this.coursePlanFrame);
      this.coursePlanFrame = null;
    }
  }

  /*
   * THE PILOT'S OWN TRACKS, read once per visit to the Track room.
   *
   * Once, rather than inside items(), because items() runs on every cursor
   * move and this reads and normalises one document per saved track to get
   * a plan drawing out of it. The library only changes in the builder,
   * which is another page, so a read on entry is as fresh as it can be.
   *
   * FILTERED BY CLASS, which listTracks itself does not do to the pilot's
   * half: the builder's Load dialog shows a pilot everything they have
   * saved, and this room is one aircraft's room. A whoop pilot has no use
   * for a sixty metre field here, and pressing Fly on one would change
   * their aircraft under them, which is the same reason the board half is
   * filtered.
   *
   * The shipped presets that listTracks appends are dropped. They are not
   * the pilot's, they are not on the board, and this screen is those two
   * things. See the note beside the cards in buildItems.
   */
  loadLocalCourses() {
    const want = airframeById(this.settings.airframe).trackClass;
    const out = [];
    try {
      for (const t of listTracks(want)) {
        if (t.preset) {
          continue;
        }
        const found = loadTrack(t.id);
        const doc = found && found.doc ? found.doc : null;
        if (!doc || trackClassOf(doc) !== want) {
          continue;
        }
        out.push({
          id: doc.id,
          name: doc.name || 'Untitled track',
          author: '',
          /* A track in this browser's library keeps the credit block it was
           * saved with, so a RaceGOW room opened from here names its
           * designer exactly as the board does. */
          designer: doc.credit ? String(doc.credit.designer || '') : '',
          series: doc.credit ? String(doc.credit.series || '') : '',
          /*
           * THE STEPS THAT ARE HOLES, not every step. A waypoint is a step
           * in the flying order that pins the racing line and scores
           * nothing, so counting the whole sequence advertises gates a
           * pilot will never fly through. summaryOf in src/share/listing.js
           * counts the seated track the same way.
           */
          gates: Array.isArray(doc.sequence)
            ? doc.sequence.filter((step) => {
              const el = (doc.elements || []).find((e) => e.id === step.elementId);
              return Boolean(el) && el.type !== 'waypoint';
            }).length
            : 0,
          plan: planFromDocument(doc),
          board: '',
          modifiedUtc: doc.modifiedUtc || '',
        });
      }
    } catch (e) {
      /* A library this browser will not hand over, which is private mode or
       * a quota. The board half of the screen is untouched by it, the same
       * way a board that is down leaves this half alone. */
    }
    /* Newest change first, which is the order the builder's Load dialog
     * uses and the order a pilot thinks in: the one they were just working
     * on is the one they want to fly. */
    out.sort((a, b) => String(b.modifiedUtc).localeCompare(String(a.modifiedUtc)));
    this.localCourses = out;
  }

  /*
   * Seat one of the pilot's own tracks and fly it.
   *
   * THE AUTOSAVE, NOT THE SHARE SEAT, and that is the whole difference
   * between this and how a board track is seated. The share seat is for a
   * track that is not yours: it exists so that opening somebody else's
   * course does not write over the one you were building. Your own track
   * IS the thing the autosave holds, so putting it anywhere else would
   * give the builder two answers about what you are working on.
   *
   * NOTHING IS LOST BY IT. The document about to be displaced is kept in
   * the library first, by keepDisplaced in src/trackbuilder/storage.js,
   * the builder's own rule: as itself if the library does not have it, as
   * a copy beside the saved one if it was edited after its last Save. So a
   * pilot who had an unsaved track in the builder and pressed one of these
   * cards finds it in the library rather than finding it gone, and when
   * storage will not take it nothing is replaced. The builder's own Load
   * dialog opens straight over the working copy; this room is further from
   * the builder than that dialog is, so it takes the extra care.
   */
  seatLocal(id) {
    const found = loadTrack(id);
    const doc = found && found.doc ? found.doc : null;
    if (!doc) {
      this.boardNote.textContent = 'That track is no longer saved in this browser.';
      this.loadLocalCourses();
      return false;
    }
    const cls = trackClassOf(doc);
    let held = null;
    try {
      const working = readAutosave(cls);
      held = working && working.doc ? working.doc : null;
    } catch (e) {
      /* Nothing to displace, or a browser that will not say. Carry on: the
       * load below is what the pilot asked for. */
    }
    if (held && held.id !== doc.id && !keepDisplaced(held).ok) {
      this.boardNote.textContent = `This browser would not keep "${held.name}", the track in the builder, so it is still there. Export it from the builder first.`;
      return false;
    }
    /* inspectCourse reads the share seat BEFORE the autosave, so a share
     * left over from the last board track would shadow the track that was
     * just chosen and the pilot would fly the wrong one. */
    clearShareImport(cls);
    if (!writeAutosave(doc)) {
      this.boardNote.textContent = 'This browser would not store that track.';
      return false;
    }
    this.setShare(null);
    return true;
  }

  /*
   * The board's courses, fetched once per visit to the Courses screen.
   * Five most flown, or the two that have times plus three random when
   * the board is still too young for a top five.
   *
   * A NICETY, NOT A DEPENDENCY. A board that is down, blocked or simply not
   * running leaves the worlds and the local course exactly as they are, with
   * one line saying so. The old flow could not fail this softly because it
   * navigated away to the board to do the same job.
   */
  loadBoardCourses() {
    if (this.boardLoading) {
      return;
    }
    this.boardLoading = true;
    this.boardNote.textContent = 'Reading the board';
    fetchTrackList(this.share && this.share.board ? this.share.board : undefined)
      .then((list) => {
        this.boardLoading = false;
        /* The course on the canvas is already a card. Showing it twice, once
         * as itself and once as its listing, is how a player ends up unsure
         * which of the two they are about to fly. */
        const seatId = (() => {
          try {
            const l = inspectCourse();
            return l && l.shareId ? l.shareId : null;
          } catch (e) {
            return null;
          }
        })();
        /*
         * ONLY THE TRACKS THIS AIRCRAFT FLIES.
         *
         * A RaceGOW room is 28 inch gates in a five by six metre room and a
         * MultiGP track is 5 ft gates over sixty metres, and the seated
         * aircraft decides which of those a pilot is here for. Offering both
         * is offering a five inch pilot a list where half the entries put
         * them in a living room the moment they press Fly.
         *
         * The board says the class on every listing. One published before
         * there were two is a field track, which is what it is, so the
         * default here has to be 'full' rather than "show it anyway".
         */
        const want = airframeById(this.settings.airframe).trackClass;
        const rest = list.filter((t) => t.id !== seatId
          && (t.trackClass === 'micro' ? 'micro' : 'full') === want);
        /*
         * EVERY TRACK, not five.
         *
         * It used to take the five most flown and tell the pilot to leave
         * for the board if they wanted the rest, which is the whole
         * complaint: the room says Race and then declines to list the
         * races. The screen scrolls, the cards are cheap (a plan drawing
         * on a canvas, no WebGL), and a board with more tracks than fit is
         * a board doing well.
         *
         * Ordered the way pickFeaturedTracks ordered its five, most flown
         * first, so the tracks somebody has actually raced are at the top
         * and the long tail is underneath rather than shuffled through it.
         */
        this.boardCourses = pickFeaturedTracks(rest, rest.length);
        if (this.boardCourses.length) {
          this.boardNote.textContent = '';
        } else if (list.length) {
          /* Say WHICH list came back empty. "Nothing here" in front of a
           * pilot who can see the board has tracks on it reads as broken;
           * "none for this aircraft" is a fact they can act on. */
          const other = list.some((t) => (t.trackClass === 'micro' ? 'micro' : 'full') !== want);
          const name = airframeById(this.settings.airframe).name.toLowerCase();
          this.boardNote.textContent = other
            ? `No ${name} tracks on the board yet. Build one and publish it, or change aircraft.`
            : '';
        } else {
          this.boardNote.textContent = 'No published tracks on the board yet. Build one and publish it.';
        }
        if (this.screen === 'courses') {
          this.renderMenu();
        }
      })
      .catch(() => {
        this.boardLoading = false;
        this.boardCourses = [];
        this.boardNote.textContent = 'The board is not answering, so only your own tracks are listed.';
        if (this.screen === 'courses') {
          this.renderMenu();
        }
      });
  }

  /*
   * The board's freestyle maps, fetched once per visit to the Freestyle
   * room: the ten newest (pickNewestMaps in src/share/board.js), less the
   * one Your map already flies, which would otherwise be two cards for one
   * map with nothing saying which is about to be flown. The Race room drops
   * the seated track's listing for the same reason.
   *
   * A NICETY, NOT A DEPENDENCY, as the Race room's list is. A board that is
   * down leaves the town and Your map exactly as they were, with one line
   * saying why nothing else is there.
   */
  loadBoardMaps() {
    if (this.boardMapsLoading) {
      return;
    }
    this.boardMapsLoading = true;
    this.boardMapNote.textContent = 'Reading the board';
    fetchMapList()
      .then((list) => {
        this.boardMapsLoading = false;
        const own = ownMapId();
        this.boardMapNote.textContent = list.length
          ? ''
          : 'No freestyle maps on the board yet. Build one in the builder and publish it.';
        this.relistBoardMaps(pickNewestMaps(list.filter((m) => m.id !== own)));
      })
      .catch(() => {
        this.boardMapsLoading = false;
        this.boardMapNote.textContent = 'The board is not answering, so only the town and your own map are listed.';
        this.relistBoardMaps([]);
      });
  }

  /*
   * Swap the listed maps without moving the pilot off the row they are on.
   * The cards arrive ABOVE the rows, so a cursor kept by index would put a
   * pilot who had already walked down to Scoring on somebody's map when a
   * slow board answered.
   */
  relistBoardMaps(maps) {
    const here = this.screen === 'freestyle' ? this.items()[this.cursor] : null;
    this.boardMaps = maps;
    if (this.screen !== 'freestyle') {
      return;
    }
    const i = here && here.id ? this.items().findIndex((it) => it.id === here.id) : -1;
    if (i >= 0) {
      this.cursor = i;
    }
    this.renderMenu();
  }

  /*
   * A map from the board, chosen on its card. What the board's own Fly this
   * map does, without the page load: main.js fetches the document (it owns
   * the documents worlds are built from, see worldDocument there) and the
   * built world is seated around it.
   *
   * SEATED ONLY IF THE PILOT IS STILL IN THE ROOM when it arrives. One who
   * backed out while the board woke up has changed their mind, and seating
   * the map anyway would swap the world under whatever they went to do.
   */
  openBoardMap(id) {
    const m = (this.boardMaps || []).find((x) => x.id === id);
    if (!m || this.openingBoardMap) {
      return;
    }
    /* Already the map in the built world: there is nothing to fetch. */
    if (this.settings.map === 'built' && this.sharedMap && this.sharedMap.id === m.id) {
      this.seatMap('built');
      return;
    }
    if (!this.onBoardMap) {
      this.boardMapNote.textContent = `${m.name} could not be loaded from the board.`;
      return;
    }
    this.openingBoardMap = true;
    this.boardMapNote.textContent = `Loading ${m.name}`;
    this.onBoardMap(m).then((shared) => {
      this.openingBoardMap = false;
      this.boardMapNote.textContent = '';
      if (this.screen !== 'freestyle') {
        return;
      }
      this.useSharedMap(shared);
      this.seatMap('built');
    }).catch((err) => {
      this.openingBoardMap = false;
      this.boardMapNote.textContent = `${m.name} could not be loaded. ${err.message ?? err}`;
    });
  }

  /*
   * Which document the built world flies: a map from the board, or the
   * pilot's own when `shared` is null. main.js holds it and builds from it;
   * this only says which.
   *
   * The address stops naming a ?mapshare= map either way, because from
   * here on it no longer says what is flown, and a reload of it would put
   * the pilot back on a map they had chosen to leave.
   */
  useSharedMap(shared) {
    if (this.onSharedMap) {
      this.onSharedMap(shared);
    } else {
      this.setSharedMap(shared);
    }
    dropLinkParam('mapshare');
  }

  /*
   * Open the standings for one track, and go and get them.
   *
   * `track` is a board listing, the same shape loadBoardCourses holds: it
   * already carries the name, the author and the gate count, so the screen
   * has something to draw before the network answers. Only the times need
   * fetching, from the endpoint the ghost picker already calls.
   */
  showStandings(track) {
    if (!track || !track.id) {
      return;
    }
    this.standingsFor = track;
    this.standingsTimes = null;
    this.standingsError = '';
    /*
     * The navigation is done HERE rather than through act('standings').
     *
     * `standings` is also the name of the row that opens this screen for the
     * seated track, and act() would have matched that row's handler, which
     * calls back into here: one name doing two jobs, and the second of them
     * a loop. The screen still records where it was opened from, the same
     * way act() does for a room, so Back is the track list rather than the
     * title.
     */
    this.roomFrom = ROOM_PARENTS.has(this.screen) ? this.screen : null;
    this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
    this.show('standings');
    const key = track.id;
    this.standingsLoading = key;
    fetchTrackTimes(track.id, track.board || undefined)
      .then((times) => {
        if (this.standingsLoading !== key) {
          return;
        }
        this.standingsLoading = null;
        /* Fastest first, on the time the board ranks: three laps on a
         * RaceGOW room, one lap on the field. A room row with no three lap
         * total is not a time. */
        const room = track.trackClass === 'micro';
        this.standingsTimes = times
          .filter((row) => !room || Number.isFinite(row.threeMs))
          .slice()
          .sort((a, b) => (room ? a.threeMs - b.threeMs : a.lapMs - b.lapMs));
        if (this.screen === 'standings') {
          this.paintStandings();
          this.renderMenu();
        }
      })
      .catch(() => {
        if (this.standingsLoading !== key) {
          return;
        }
        this.standingsLoading = null;
        this.standingsTimes = [];
        this.standingsError = 'The board is not answering, so its times cannot be shown.';
        if (this.screen === 'standings') {
          this.paintStandings();
          this.renderMenu();
        }
      });
  }

  /*
   * The table. Drawn rather than listed, for the reason in items(): forty
   * times as forty menu rows would make the cursor walk them all to reach
   * Back, and a leaderboard is a thing you read, not a thing you traverse.
   *
   * The pilot's own name is marked, because the one row a person looks for
   * in a leaderboard is their own.
   */
  paintStandings() {
    if (!this.standingsTable) {
      return;
    }
    const t = this.standingsFor;
    const table = this.standingsTable;
    table.textContent = '';
    if (this.standingsLede) {
      this.standingsLede.textContent = t
        ? [t.name, t.gates ? `${t.gates} gates` : '', byLine(t)]
          .filter(Boolean).join(' \u00b7 ')
        : '';
    }
    if (!t) {
      return;
    }
    if (this.standingsTimes == null) {
      table.append(el('div', 'standings-note', 'Reading the board'));
      return;
    }
    if (this.standingsError) {
      table.append(el('div', 'standings-note', this.standingsError));
      return;
    }
    const room = t.trackClass === 'micro';
    if (!this.standingsTimes.length) {
      table.append(el('div', 'standings-note', room
        ? 'No three lap time on this track yet. RaceGOW scores three laps in a row, and the first one is yours.'
        : 'No times posted on this track yet. The first one is yours.'));
      return;
    }
    const me = (readPilotName() || '').trim().toLowerCase();
    const head = el('div', 'standings-row standings-head');
    head.append(el('span', 'standings-rank', ''));
    head.append(el('span', 'standings-pilot', 'Pilot'));
    head.append(el('span', 'standings-lap', room ? 'Three laps' : 'Lap'));
    table.append(head);
    this.standingsTimes.forEach((row, i) => {
      const line = el('div', 'standings-row');
      if (me && String(row.name || '').trim().toLowerCase() === me) {
        line.classList.add('is-me');
      }
      if (i === 0) {
        line.classList.add('is-record');
      }
      line.append(el('span', 'standings-rank', String(i + 1)));
      const who = el('span', 'standings-pilot', row.name || 'Unnamed pilot');
      /* A time flown off 100 says so, as the board's own table does. The
       * board ranks every weight on the clock, so the label is the only
       * thing that tells two rows apart. */
      if (Number.isInteger(row.weight) && row.weight !== WEIGHT_STOCK) {
        who.append(' ', el('span', 'standings-weight', `Weight ${row.weight}%`));
      }
      if (row.hasGhost) {
        /* A ghost is the difference between reading a time and racing it,
         * so the rows that carry one say so. */
        who.append(el('span', 'standings-ghost', 'ghost'));
      }
      line.append(who);
      line.append(el('span', 'standings-lap', formatTime(room ? row.threeMs : row.lapMs)));
      table.append(line);
    });
  }

  /*
   * Start the thumbnails. Cached clips play immediately. A miss records
   * once, one world at a time, then the iframe (or the film of the loaded
   * world) is thrown away.
   */
  startReels() {
    this.stopReels();
    const cards = this.mapCards ?? [];
    /*
     * The world that is loaded is filmed where it stands, and every other
     * one in a frame of its own. main.js says which world that is and the
     * key it was built under (loadedWorld there): none for a map from the
     * board loaded in the built world, which is not Your map, whose clip is
     * keyed by the pilot's own seat, so filming it in place would file
     * somebody else's map under yours. And none for Your map when the seat
     * has changed since the world was built, because then the card names a
     * map that is not the one loaded; the orbit frame builds it as it is.
     */
    const loaded = this.loadedWorld ? this.loadedWorld() : null;
    const filmsHere = (c) => Boolean(loaded) && c.id === loaded.id && c.clipKey === loaded.key;
    const ac = new AbortController();
    const session = { ac, urls: [], unsub: [] };
    this.reelSession = session;
    this.reelFreezeWorld = false;

    const onVis = () => {
      /* Both rooms: the world cards moved to Freestyle, and a clip paused
       * by a hidden tab there stayed paused when the tab came back. */
      const hide = document.hidden || (this.screen !== 'courses' && this.screen !== 'freestyle');
      for (const c of this.mapCards || []) {
        if (!c.clip || !c.clip.pause) {
          continue;
        }
        if (hide) {
          c.clip.pause();
        } else {
          c.clip.play().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    session.unsub.push(() => document.removeEventListener('visibilitychange', onVis));

    const pending = [];
    for (const c of cards) {
      c.shot.replaceChildren();
      c.clip = null;
      c.still.textContent = '';
      pending.push(c);
    }

    const run = async () => {
      const misses = [];
      for (const c of pending) {
        if (this.reelSession !== session) {
          return;
        }
        c.clipKey = clipKeyForMap(c.id);
        try {
          const blob = await getClip(c.clipKey);
          if (blob) {
            this.attachClip(c, blob, session);
            continue;
          }
        } catch (e) {
          /* Cache read failed: record instead. */
        }
        misses.push(c);
      }
      if (misses.length) {
        misses.forEach((c, i) => {
          c.jokeOff = i;
          this.showReelWait(c, session);
        });
        this.startReelJokes(session);
      }
      const currentMiss = misses.filter(filmsHere);
      const otherMiss = misses.filter((c) => !filmsHere(c));
      /*
       * ONE AT A TIME, AND ONLY WHILE NOBODY IS USING THE ROOM.
       *
       * Each capture builds a Three.js scene in a same origin iframe, on
       * this thread, and blocks it for seconds. The cached clips above are
       * already attached by now, so what is left is only ever the first
       * visit in a given browser. Waiting for quiet before EACH one means
       * a pilot who arrives and immediately picks a world never pays for
       * any of it, and a pilot who stops to read gets them one by one.
       *
       * The loaded world goes first because it costs least: it is filmed
       * where it stands and nothing is built (captureCurrentCard).
       */
      for (const c of currentMiss) {
        if (this.reelSession !== session) {
          return;
        }
        await this.whenQuiet(session);
        this.reelCapturing = true;
        try {
          if (!await this.captureCurrentCard(c, session, loaded)) {
            otherMiss.push(c);
          }
        } finally {
          this.reelCapturing = false;
        }
      }
      for (const c of otherMiss) {
        if (this.reelSession !== session) {
          return;
        }
        await this.whenQuiet(session);
        this.reelCapturing = true;
        try {
          await this.captureRemoteCard(c, session);
        } finally {
          this.reelCapturing = false;
        }
      }
    };
    run().catch((e) => {
      if (e && e.name === 'AbortError') {
        return;
      }
      console.warn(e);
    });
  }

  attachClip(c, blob, session) {
    const { node, url } = makeClipElement(blob, 'map-reel-view');
    session.urls.push(url);
    c.clip = node;
    c.wait = null;
    c.waitJoke = null;
    c.still.textContent = '';
    c.shot.replaceChildren(node);
    if (document.hidden && node.pause) {
      node.pause();
    }
  }

  showReelWait(c, session) {
    let wait = c.wait;
    if (!wait || !c.shot.contains(wait)) {
      wait = el('div', 'map-reel-wait');
      const stage = el('div', 'map-reel-wait-stage', 'loading');
      const joke = el('div', 'map-reel-wait-joke');
      wait.append(stage, joke);
      c.wait = wait;
      c.waitJoke = joke;
      c.shot.append(wait);
    }
    c.waitJoke.textContent = quotedJoke(session.jokeAt, c.jokeOff);
  }

  startReelJokes(session) {
    if (session.jokeTimer != null) {
      return;
    }
    session.jokeAt = 0;
    const tick = () => {
      session.jokeAt += 1;
      for (const c of this.mapCards || []) {
        if (c.waitJoke) {
          c.waitJoke.textContent = quotedJoke(session.jokeAt, c.jokeOff);
        }
      }
    };
    session.jokeTimer = setInterval(tick, JOKE_MS);
    session.unsub.push(() => {
      clearInterval(session.jokeTimer);
      session.jokeTimer = null;
    });
  }

  /*
   * THE WORLD ALREADY LOADED IS FILMED WHERE IT STANDS, not built again.
   *
   * main.js draws it behind the room, still hidden, at the clip's size and
   * frame rate, on the title camera flown from the start of its line on the
   * clip's clock, and copies each frame onto this card's canvas, which the
   * recorder takes: `film` in main.js's frame, and paintMapThumbs below.
   * The world is in memory already, so this costs a small canvas and a
   * small draw. The other way, the orbit frame the other cards use, builds
   * a second copy of the world on this thread and holds both at once; see
   * PROGRESS.md, 2026-09-26, for the two measured side by side.
   *
   * This is what the card used to get wrong. The copy onto the card was
   * only ever made on the Race room, where world cards no longer live, so
   * here the recorder took twelve seconds of the canvas's grey fill and
   * cached it, and the pilot's own map was the card that looked broken.
   * So the recorder now starts only once the film has drawn onto the card,
   * and the clip opens on the world. A world that draws nothing (it cannot
   * be filmed here after all) answers false, and the caller sends the card
   * to the orbit frame instead.
   */
  async captureCurrentCard(c, session, loaded) {
    const canvas = el('canvas', 'map-reel-view');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = CLIP_W;
    canvas.height = CLIP_H;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.fillStyle = '#1a241c';
      ctx.fillRect(0, 0, CLIP_W, CLIP_H);
    }
    c.shot.append(canvas);
    c.still.textContent = '';
    this.showReelWait(c, session);
    let filmed = true;
    try {
      await withCaptureLock(async () => {
        if (this.reelSession !== session) {
          return;
        }
        const again = await getClip(c.clipKey);
        if (again) {
          this.attachClip(c, again, session);
          return;
        }
        await whenVisible(session.ac.signal);
        /* One whole cycle of the line in the clip, sped up to fit, as the
         * orbit frame records it (renderAndCapture in src/share/orbit.js),
         * so a card looks the same whichever way it was filmed. */
        const periodMs = loaded && loaded.periodMs > 0 ? loaded.periodMs : 0;
        const loopMs = clipDurationMs(periodMs);
        const film = {
          key: c.clipKey,
          canvas,
          scale: (periodMs > 0 ? periodMs : loopMs) / loopMs,
          t0: -1,
          frames: 0,
        };
        this.reelFilm = film;
        try {
          await this.whenFilmed(film, session);
          /* The picture is there, so the wait becomes a caption over it
           * rather than a panel in front of it. */
          if (c.wait) {
            c.wait.classList.add('map-reel-wait-film');
          }
          film.t0 = performance.now();
          const blob = await recordCanvasStream(canvas, loopMs, session.ac.signal);
          await putClip(c.clipKey, blob);
          if (this.reelSession !== session) {
            return;
          }
          this.attachClip(c, blob, session);
        } finally {
          if (this.reelFilm === film) {
            this.reelFilm = null;
          }
        }
      });
    } catch (e) {
      if (e && e.name === 'AbortError') {
        return true;
      }
      c.wait = null;
      c.waitJoke = null;
      c.shot.replaceChildren();
      if (e && e.noFilm) {
        filmed = false;
      } else {
        c.still.textContent = 'Preview unavailable.';
      }
    }
    return filmed;
  }

  /*
   * Resolve once main.js has drawn the film's first frames onto the card:
   * FILM_WARMUP of them, as the orbit frame waits for its own before it
   * records, because the shadow focus and the post chain settle on the
   * first few. Rejects when the session ends, or with `noFilm` when nothing
   * is drawn in FILM_START_MS, which is main.js declining the film (it
   * checks the key, the screen and the mode on every frame).
   */
  whenFilmed(film, session) {
    const giveUp = performance.now() + FILM_START_MS;
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.reelSession !== session || session.ac.signal.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        if (film.frames >= FILM_WARMUP) {
          resolve();
          return;
        }
        if (performance.now() > giveUp) {
          const err = new Error('The loaded world drew nothing for its card.');
          err.noFilm = true;
          reject(err);
          return;
        }
        setTimeout(check, 50);
      };
      check();
    });
  }

  /*
   * A world that is not loaded: iframe the orbit page, which records,
   * caches, and posts the clip. Then the iframe dies.
   */
  async captureRemoteCard(c, session) {
    c.still.textContent = '';
    const frame = document.createElement('iframe');
    frame.className = 'map-reel-view';
    frame.title = 'World preview';
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    c.shot.append(frame);
    this.showReelWait(c, session);
    this.reelFreezeWorld = true;
    try {
      await whenVisible(session.ac.signal);
      const blob = await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (err, value) => {
          if (settled) {
            return;
          }
          settled = true;
          window.removeEventListener('message', onMsg);
          session.ac.signal.removeEventListener('abort', onAbort);
          clearTimeout(timer);
          if (err) {
            reject(err);
          } else {
            resolve(value);
          }
        };
        const onAbort = () => finish(new DOMException('aborted', 'AbortError'));
        const onMsg = (e) => {
          if (!e.data || e.data.type !== 'webfpv-orbit-clip') {
            return;
          }
          if (frame.contentWindow !== e.source) {
            return;
          }
          const mime = e.data.mime || 'video/webm';
          const buffer = e.data.buffer;
          if (!buffer) {
            finish(new Error('Preview sent no clip.'));
            return;
          }
          finish(null, new Blob([buffer], { type: mime }));
        };
        const timer = setTimeout(() => finish(new Error('Preview timed out.')), 90000);
        session.ac.signal.addEventListener('abort', onAbort);
        window.addEventListener('message', onMsg);
        if (session.ac.signal.aborted) {
          onAbort();
          return;
        }
        frame.src = new URL(`../share/orbit.html?map=${encodeURIComponent(c.id)}`, import.meta.url).href;
      });
      if (this.reelSession !== session) {
        return;
      }
      await putClip(c.clipKey, blob);
      this.attachClip(c, blob, session);
    } catch (e) {
      if (e && e.name === 'AbortError') {
        return;
      }
      c.wait = null;
      c.waitJoke = null;
      c.shot.replaceChildren();
      c.still.textContent = 'Preview unavailable.';
    } finally {
      if (frame.parentNode) {
        frame.remove();
      }
      if (this.reelSession === session) {
        this.reelFreezeWorld = false;
      }
    }
  }

  /*
   * Copy a frame of the film onto the card being recorded, which is the
   * canvas the recorder takes. main.js calls this straight after drawing
   * one, and only then. After the clip is made there is nothing to copy:
   * the cards are videos.
   *
   * main.js holds its renderer at the clip's size for the film, so this is
   * a copy and not a crop. The crop is kept for a frame drawn at any other
   * shape, which then loses its edges rather than being squashed.
   */
  paintMapThumbs(src) {
    const film = this.reelFilm;
    if (!film || !film.canvas) {
      return;
    }
    const sw = src.width;
    const sh = src.height;
    if (!(sw > 0 && sh > 0)) {
      return;
    }
    const dest = film.canvas;
    const dw = dest.width;
    const dh = dest.height;
    const scale = Math.max(dw / sw, dh / sh);
    const cw = dw / scale;
    const ch = dh / scale;
    try {
      dest.getContext('2d').drawImage(
        src,
        (sw - cw) * 0.5, (sh - ch) * 0.5, cw, ch,
        0, 0, dw, dh,
      );
      film.frames += 1;
    } catch (e) {
      /* A tainted read would take the frame with it. */
    }
  }

  /*
   * Any input at all, noted so the preview recorder can get out of the way.
   *
   * Recording a world preview loads orbit.html in a same origin iframe,
   * which builds a whole Three.js scene ON THIS THREAD. Measured on arrival
   * at the Freestyle room with a cold cache: 23 frames in 10.4 seconds and
   * a single gap of 5155 ms with no paint at all. Reported as "the
   * freestyle page is unresponsive when I get to it, becomes responsive
   * after a time", which is exactly what four of those in a row is.
   *
   * The recording is worth having: it is cached per browser, so the cost is
   * paid once and every later visit is instant. What is not worth having is
   * paying it WHILE somebody is trying to use the room. So input wins:
   * every cursor move and every key press pushes the recorder back, and it
   * only runs after the room has been quiet.
   */
  noteInteraction() {
    this.lastInteractionAt = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    /*
     * A capture already running is TORN DOWN, not merely delayed.
     *
     * Waiting for quiet before starting one is not enough on its own: a
     * pilot who arrives, reads a card for a second and then reaches for the
     * arrow keys walks straight into the middle of a 4.6 second block that
     * has already begun. Removing the iframe ends its browsing context, so
     * the scene it was building stops there.
     *
     * The work is not lost for good. The room re-arms itself below and the
     * capture starts again the next time the room is quiet, and once it
     * finishes the clip is cached for every later visit.
     */
    if (this.reelCapturing && this.reelSession) {
      this.stopReels();
      this.armReels();
    }
  }

  /* Re-arm the preview recorder after an interaction tore it down. One
   * timer, replaced rather than stacked, so a pilot arrowing down four
   * cards schedules one restart and not four. */
  armReels() {
    if (this.reelRestart != null) {
      clearTimeout(this.reelRestart);
    }
    this.reelRestart = setTimeout(() => {
      this.reelRestart = null;
      if (this.screen === 'courses' || this.screen === 'freestyle') {
        this.startReels();
      }
    }, REEL_QUIET_MS);
  }

  /*
   * Resolve once the room has been untouched for REEL_QUIET_MS, or reject
   * if the session was torn down while waiting. Polled rather than driven
   * by an event, because the thing being waited for is an ABSENCE.
   */
  whenQuiet(session) {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (!session || this.reelSession !== session || session.ac.signal.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        const now = (typeof performance !== 'undefined' && performance.now)
          ? performance.now() : Date.now();
        const since = now - (this.lastInteractionAt || 0);
        if (since >= REEL_QUIET_MS) {
          resolve();
          return;
        }
        session.quietTimer = setTimeout(check, Math.max(80, REEL_QUIET_MS - since));
      };
      check();
    });
  }

  stopReels() {
    this.reelFreezeWorld = false;
    this.reelCapturing = false;
    /* main.js stops drawing the film on the next frame. */
    this.reelFilm = null;
    if (this.reelSession && this.reelSession.quietTimer) {
      clearTimeout(this.reelSession.quietTimer);
    }
    if (this.reelSession) {
      try {
        this.reelSession.ac.abort();
      } catch (e) {
        /* Already aborted. */
      }
      if (this.reelSession.unsub) {
        for (const fn of this.reelSession.unsub) {
          fn();
        }
      }
      if (this.reelSession.urls) {
        for (const url of this.reelSession.urls) {
          URL.revokeObjectURL(url);
        }
      }
    }
    this.reelSession = null;
    if (this.reelRaf != null) {
      cancelAnimationFrame(this.reelRaf);
      this.reelRaf = null;
    }
    if (this.mapCards) {
      for (const c of this.mapCards) {
        c.clip = null;
        if (c.shot) {
          c.shot.replaceChildren();
        }
      }
    }
  }

  show(screen) {
    this.closeDrop();
    /* In the air by any path, a card's double click and a ?fly=1 link
     * included, is having flown: see hasFlown. */
    if (screen === 'flight') {
      this.firstRun = false;
      if (!this.settings.hasFlown) {
        this.settings.hasFlown = true;
        saveSettings(this.settings);
      }
    }
    if (screen === 'launch') {
      markLaunchCardSeen(this.settings);
    }
    /*
     * A STICK HELD THROUGH A SCREEN CHANGE IS NOT A GESTURE ON THE SCREEN
     * IT LANDS ON.
     *
     * pollPad is edge triggered off padPrev, which works as long as pollPad
     * saw the stick held on the screen being left. Three screens break that
     * promise, and they break it in the direction that fires: flight resets
     * padPrev to all false on every poll, and the calibrate and joystick
     * picker screens are fed channels that input.js pins to zero while they
     * are up, because the wizard owns the sticks. So the tracker believed
     * every stick was centred, and the first poll on the new screen saw a
     * held stick go from false to true and called it a fresh flick.
     *
     * Found on the check step, where it is not an edge case but the normal
     * way through: the pilot holds a stick to aim the reverse control, and
     * the reverse they just pressed turns their held roll from right into
     * LEFT, which is Back. Save, and the shell threw them out of Settings
     * onto the front page. The same fault pauses a run with roll held and
     * moves the cursor on the pause menu.
     *
     * So the next poll after any screen change SEEDS padPrev instead of
     * acting on it. The cost is that a deliberate flick made in the same
     * two milliseconds as the change is swallowed, which is a cost the edge
     * trigger is already paying everywhere else: let go and flick again.
     */
    this.padRearm = true;
    /*
     * A MENU THAT OPENS FROM FLIGHT OPENS UNDER THE PILOT'S HANDS.
     *
     * The seeding above is for a stick held at this instant. It cannot help
     * with what a person does with a radio in the seconds after reaching for
     * the keyboard: the release, the overshoot, a regrip, setting it down.
     * bug-2d93629e was the pause menu resuming itself off exactly that,
     * because the cursor opens on Resume and select and back are both Resume
     * there. So a visit to the menus that begins in flight waits for the
     * sticks to be quiet, and asks a roll to be held a beat; a visit that
     * begins on the title does neither. It lasts until the pilot is in the
     * air again or on the title, and the title wins even from flight: it is
     * where a radio pilot starts, and never a menu opened under their hands.
     * this.screen is still the screen being left here. See
     * src/input/padgate.js.
     */
    if (screen === 'flight' || screen === 'title') {
      closePadGate(this.padGate);
    } else if (this.screen === 'flight') {
      openPadGate(this.padGate);
    }
    if (this.screen !== screen) {
      this.padShownAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }
    const pinned = locationHashScreen();
    if (pinned && screen === 'title') {
      screen = pinned;
      if (!this.returnTo) {
        this.returnTo = 'title';
      }
    }
    /* The row being left, read while the screen being left is still whole:
     * the Tracks room's sheet is closed just below, and its rows go with
     * it. See the cursor memory further down. */
    const leaving = this.items()[this.cursor];
    if (this.screen === 'courses' && screen !== 'courses') {
      /* A sheet that opened a screen which comes back here is open again on
       * the way back: Before you fly and Standings, and the screens the
       * launch card itself opens. Anything else starts the room afresh. */
      this.reopenCard = screen === 'launch' || screen === 'standings' ? this.cardSubject : null;
      /* Nothing draws a thumbnail for a screen nobody is looking at. */
      this.stopReels();
      this.stopCoursePlans();
      this.mapCards = null;
      this.courseCards = null;
      this.courseCardKey = null;
      this.cardSubject = null;
      this.lastCardKey = null;
      this.cardPress = null;
      this.flyingCard = null;
      if (this.courseStrip) {
        this.courseStrip.style.minHeight = '';
      }
      /* The times are read again on the next visit, so one posted since
       * is in them. Kept for a sheet that is coming straight back. */
      if (this.podiumCache && !this.reopenCard) {
        this.podiumCache.clear();
      }
    }
    if (screen === 'title' || screen === 'flight' || screen === 'paused') {
      this.reopenCard = null;
    }
    /*
     * THE SAME FOR THE FREESTYLE ROOM, where the world cards moved to and
     * this stop did not. A recorder left waiting there went on after the
     * pilot left, because whenQuiet asks only that nothing was pressed for
     * a moment. Seen in headless Chromium: out of the room 300 ms after
     * opening it, and for the next twelve seconds and more the title had
     * an orbit frame building the town under it and its own world hidden
     * (reelFreezeWorld), and a radio pilot who took off presses no key to
     * stop it. The film of the loaded world would also have kept recording
     * its last frame once main.js stopped drawing it. The cards are
     * rebuilt on the way back in, from the cache.
     */
    if (this.screen === 'freestyle' && screen !== 'freestyle') {
      this.stopReels();
      this.mapCards = null;
    }
    /* ratesFrom belongs to one visit to the Rates screen. Leaving that screen
     * for anywhere else drops it, so a later show('rates') that did not come
     * through act('rates'), a world swap keeping the pilot in place, cannot
     * inherit a stale origin and send Escape to the wrong list. Re-showing
     * rates over itself is exactly that case and must NOT clear it. */
    /*
     * roomFrom belongs to one visit. Landing on the title, or on the room
     * it points at, means the trip it described is over; anything else is
     * still inside the same trip and keeps it, which is what lets Quad's
     * Rates signpost come back through Quad to Freestyle.
     */
    if (this.roomFrom && (screen === 'title' || screen === this.roomFrom)) {
      this.roomFrom = null;
    }
    if (this.screen === 'rates' && screen !== 'rates') {
      this.ratesFrom = null;
    }
    /* A storage complaint belongs to the visit that caused it. Walking back
     * in should not meet a warning about a save attempted ten minutes ago. */
    if (screen === 'rates' && this.screen !== 'rates') {
      this.ratesNotice = null;
    }
    /*
     * pidsFrom SURVIVES A TRIP TO THE BENCH, because the bench comes back
     * here: leaveFc names pids as one of its three destinations, the same
     * way fcFrom names pids as one of its three origins.
     *
     * Clearing it on the way out is why Quad, Tune, Every setting, back,
     * back landed on the TITLE. The PIDs room had forgotten it was opened
     * from Quad while the pilot was one room deeper, so Escape fell through
     * to returnTo and threw them out of the machine entirely. Every other
     * exit still drops it, and every other arrival sets it: act('pids') is
     * the only show('pids') in the file.
     */
    if (this.screen === 'pids' && screen !== 'pids' && screen !== 'fc') {
      this.pidsFrom = null;
    }
    if (this.screen === 'fc' && screen !== 'fc' && !(screen === 'rates' && this.ratesFrom === 'fc')) {
      this.fcFrom = null;
    }
    if (this.screen === 'credits' && screen !== 'credits') {
      const url = new URL(window.location.href);
      if ((url.hash || '') === '#credits') {
        url.hash = '';
        history.replaceState(null, '', url);
      }
    }
    /*
     * Remember where the cursor was, keyed by the screen being left.
     *
     * Settings, arrow down to Rates, Enter, Escape used to land on row 0 of
     * 30, twenty rows above the row just left, because show() reset the
     * cursor on every transition including a return. A pilot tuning rates
     * makes that trip dozens of times in a session.
     *
     * The ID is stored, not the index, because the index means nothing once
     * a list changes length, and these lists do: rows appear and vanish
     * with the loaded track, the board and the dirty flag.
     *
     * It used to store the label, which is the same idea done with the only
     * handle a row had at the time. A label is not unique: Back is on nine
     * screens, every section heading repeats, and the bench prints the same
     * `feature` prefix a dozen times, so a restore could land on the first
     * row that happened to read the same. See stampIds.
     */
    if (this.screen && leaving && leaving.id) {
      this.cursorMemory[this.screen] = leaving.id;
    }
    /* Entering a different screen drops the remembered row: its id belongs
     * to the screen being left. Ids are screen prefixed so a stale one
     * could not match anyway, and clearing it says that on purpose rather
     * than relying on the prefix. */
    if (this.screen !== screen) {
      this.focusId = null;
    }
    /* Arriving somewhere is interaction: it stops a preview recorder from
     * starting into the same frame that is still painting the room. */
    this.noteInteraction();
    this.screen = screen;
    if (screen === 'courses' && this.reopenCard) {
      this.cardSubject = this.reopenCard;
      this.lastCardKey = this.reopenCard;
      this.reopenCard = null;
      this.loadPodium();
    }
    /* this.screen is already the new one, so items() describes where we are
     * going. Settings opens on its first real row rather than on a heading. */
    this.cursor = this.restoreCursor();
    if (screen === 'courses') {
      /* Both halves on every entry. The library is read here rather than
       * cached for the session because the builder is another page: a
       * pilot who saves a track and comes back should see it. */
      this.loadLocalCourses();
      this.loadBoardCourses();
    }
    if (screen === 'freestyle') {
      this.loadBoardMaps();
    }
    if (screen === 'howto') {
      this.renderHowto();
    }
    /* The film is the only thing in this shell that asks for frames outside
     * flight, so it runs on exactly one screen and stops the moment that
     * screen is left. */
    if (this.trickPlayer) {
      if (screen === 'tricks') {
        this.trickShown = '';
        this.renderTricks();
      } else {
        this.trickPlayer.stop();
      }
    }
    if (screen === 'credits') {
      const url = new URL(window.location.href);
      if ((url.hash || '') !== '#credits') {
        url.hash = 'credits';
        history.replaceState(null, '', url);
      }
    }
    for (const [name, node] of Object.entries(this.screens)) {
      node.style.display = name === screen ? '' : 'none';
    }
    this.letterScreen(screen);
    /* Paused keeps the flight display up, dimmed: the lap clock and the
     * pack are what the player paused to look at. */
    this.syncFrame();
    this.osd.style.display = screen === 'flight' || screen === 'paused' ? '' : 'none';
    /* A toggle, not a className: setOsd keeps is-free on the same node. */
    this.osd.classList.toggle('dim', screen === 'paused');
    this.syncCrosshair();
    this.syncFps();
    this.pauseAirSlider(screen);
    /* The score follows the OSD onto and off the screen, but only in
     * freestyle: a race has no score and an empty Score 0 over a lap timer
     * is a readout that never changes. */
    this.syncScoreVisible();
    this.syncChaseVisible();
    this.renderMenu();
    this.syncChips();
    /* Last, and unconditionally. Last because a listener is entitled to
     * read a settled screen; unconditionally because show() is also how
     * a screen is re-entered, and the shell side of this is idempotent by
     * construction rather than by this file guessing what changed. */
    if (typeof this.onScreenChange === 'function') {
      this.onScreenChange(screen);
    }
  }

  bindWikiHash() {
    this.applyLocationHash();
    window.addEventListener('hashchange', () => this.applyLocationHash());
  }

  applyLocationHash() {
    const h = (window.location.hash || '').replace(/^#/, '');
    if (h === 'credits') {
      if (this.screen !== 'credits' && this.screen !== 'flight' && this.screen !== 'paused') {
        this.act('credits');
      }
      return;
    }
    if (h.startsWith('wiki/')) {
      window.location.replace(wikiPageUrl(h));
      return;
    }
    if (this.screen === 'credits') {
      this.back();
    }
  }

  /*
   * Fly a published course, in this tab.
   *
   * The old path for this was Choose new map, which opened the board in a
   * new tab so the player could press its Fly button, which opened a THIRD
   * tab with a second simulator in it. The board hands a course over through
   * one fetch and one storage write, which is what adoptShareFromLocation
   * already does for a Fly link, so the screen can simply do it here.
   */
  /* The card `cardSubject` names, or null. */
  subjectCard() {
    if (!this.cardSubject) {
      return null;
    }
    return this.items().find((it) => it.course && courseCardKey(it) === this.cardSubject) || null;
  }

  /* Where the cursor goes when a chosen card is closed: back onto that card,
   * so going back leaves the player where they were rather than at the top. */
  cardCursor() {
    const items = this.items();
    const i = items.findIndex((it) => it.course && courseCardKey(it) === this.lastCardKey);
    return i < 0 ? this.firstStop(items) : i;
  }

  /*
   * BRING A CHOSEN CARD'S LIST INTO VIEW, all of it and clear of both bars,
   * after a choose made from the keys or a radio.
   *
   * The cursor's own scroll brings one row to the nearest edge, and on this
   * page the nearest edge is the foot of the window, where the command bar
   * is drawn over it: Fly it came to rest behind the bar. The stage is the
   * heading, the rows and the help beside them. `nearest` on the whole of it
   * puts its foot at the bottom when it fits and its head at the top when it
   * does not, and the scroll-padding on .screen-courses in index.html is
   * what keeps either edge out from under a bar.
   */
  revealCardList() {
    const stage = this.coursesStage;
    if (stage && typeof stage.scrollIntoView === 'function') {
      stage.scrollIntoView({ block: 'nearest' });
    }
  }

  /*
   * A DOUBLE CLICK ON A TRACK FLIES IT. The owner, 2026-09-27: "i should be
   * able to double click on a track to start racing it".
   *
   * Only when both presses were on the same card: the one the first press
   * chose, which that card's click handler wrote down, and the one under
   * the second. The two can only differ when something moved between them
   * or when they were two quick presses on two cards, and flying either
   * card then would be answering a question nobody asked. What used to move
   * them apart is gone: choosing a card no longer scrolls, and the list
   * under the strip no longer shrinks under a still pointer (see the course
   * branch of select). A double click that did not begin on a card finds
   * nothing written down and does nothing: see the capturing listener where
   * the screen is built.
   */
  cardDoubleClick(e) {
    const key = this.cardPress;
    this.cardPress = null;
    const under = e.target instanceof Element ? e.target.closest('.course-card') : null;
    const hit = under && (this.courseCards || []).find((c) => c.card === under);
    if (this.screen === 'courses' && key && hit && hit.key === key) {
      this.flyCard(key);
    }
  }

  /*
   * FLY A TRACK FROM ITS CARD: seat it, then the starting blocks.
   *
   * Three presses end here and they are one press: a double click on the
   * card, the command bar's Fly it while the card is chosen, and the Fly it
   * row under the strip. The row used to seat the track and go back to the
   * title, which is Fly it doing half of what it says: the pilot landed on
   * the menu, pressed Fly, got the launch card and pressed Go. The owner has
   * asked for the other half twice from the builder, on 2026-09-25 and
   * 2026-09-26 ("straight to the starting blocks not the initial menu"), and
   * the builder's Fly this track has gone to the grid since. A track chosen
   * in here is the same decision made one page later.
   *
   * THE GRID WAITS FOR THE WORLD. Seating a track that is not the one loaded
   * starts a swap, and flying before the new world is on screen would put
   * the pilot on the old track under the new one's name. So the last step is
   * main.js's, which knows whether a world is building: see onFlySeated
   * there.
   *
   * A board track keeps its card chosen while the board hands the document
   * over, and says Loading on it. A load that fails leaves the card as it
   * was and brings the room's note, which says why, into view. The press
   * that asked for it is over by then, so moving the page cannot send a
   * press to the wrong card.
   */
  flyCard(key) {
    if (this.screen !== 'courses') {
      return;
    }
    const card = this.items().find((it) => it.course && courseCardKey(it) === key);
    if (!card || card.course.kind === 'new') {
      return;
    }
    const go = () => {
      if (this.onFlySeated) {
        this.onFlySeated();
      }
    };
    const failed = () => {
      this.flyingCard = null;
      if (this.screen === 'courses') {
        this.renderCourseCards();
        this.boardNote.scrollIntoView({ block: 'nearest' });
      }
    };
    if (card.course.kind === 'board') {
      /* One track at a time: openBoardCourse refuses a second while the
       * first is fetching, and a card that said Loading for a fetch that
       * was never made would be a small lie. */
      if (this.openingBoardCourse) {
        return;
      }
      this.flyingCard = key;
      this.openBoardCourse(card.course.track.id, go, failed);
      this.renderCourseCards();
      return;
    }
    if (card.course.kind === 'local' && !this.seatLocal(card.course.track.id)) {
      failed();
      return;
    }
    if (!hasLoadedTrack()) {
      return;
    }
    this.act('map:custom');
    go();
  }

  /*
   * OPEN A COURSE IN THE BUILDER WITHOUT FLYING IT, which is the whole point
   * of this list and the thing the screen could not do before.
   *
   * A board course has to be fetched first, because the builder reads the
   * share seat and a course nobody has loaded is not in it. That fetch is the
   * same one Fly it does; it just stops before the flying. Whose course it is
   * decides how the builder opens it, and that is read off the seat AFTER the
   * fetch rather than guessed from the card, so the answer comes from the
   * same place every other row on this screen reads it from.
   */
  openInBuilder(card) {
    const go = () => {
      const listing = liveListing('custom');
      if (listing && listing.kind === 'owned') {
        writeBuilderIntent({ kind: 'edit' });
      } else if (listing && listing.canRemix) {
        writeBuilderIntent({ kind: 'remix' });
      }
      /* ?mode=race: the track just seated is a race track, and without it
       * a builder that remembers the map canvas opened the map instead. */
      window.location.href = 'src/trackbuilder/index.html?mode=race';
    };
    if (card.course.kind === 'local') {
      /* Seat it first, so liveListing reads the track the pilot pointed at
       * rather than whatever the autosave held, and go() writes the intent
       * that matches it. */
      if (this.seatLocal(card.course.track.id)) {
        go();
      }
      return;
    }
    if (card.course.kind !== 'board') {
      go();
      return;
    }
    const track = card.course.track;
    if (this.openingBoardCourse) {
      return;
    }
    this.openingBoardCourse = true;
    this.boardNote.textContent = `Loading ${track.name}`;
    if (!this.onBoardCourse) {
      this.openingBoardCourse = false;
      this.boardNote.textContent = `${track.name} could not be loaded from the board.`;
      return;
    }
    this.onBoardCourse(track).then((ok) => {
      this.openingBoardCourse = false;
      if (!ok) {
        this.boardNote.textContent = `${track.name} could not be loaded from the board.`;
        return;
      }
      go();
    }).catch((err) => {
      this.openingBoardCourse = false;
      this.boardNote.textContent = `${track.name} could not be loaded. ${err.message ?? err}`;
    });
  }

  /*
   * seatStock was here. It seated a track that ships with the simulator in
   * the share seat, and nothing lists one on this screen any more, so it
   * went with the cards rather than sitting here unreachable.
   *
   * A SEAT IT WROTE CAN STILL BE IN A BROWSER, so nothing that READS one
   * was removed with it: inspectCourse in src/share/listing.js still has
   * its stock branch, and a pilot who seated RaceGOW5 Track 5 last week
   * still finds it as the top card, still flies it, and still opens it in
   * the builder as a copy. Only the way to seat a new one is gone, and
   * that is the builder's Load dialog, which never stopped offering them.
   */

  /* `failed` hears about a load that did not happen, once the note says why:
   * a card that was showing Loading has to stop. */
  openBoardCourse(id, then = null, failed = null) {
    const track = (this.boardCourses || []).find((t) => t.id === id)
      || (this.standingsFor && this.standingsFor.id === id ? this.standingsFor : null);
    if (!track || this.openingBoardCourse) {
      return;
    }
    this.openingBoardCourse = true;
    this.boardNote.textContent = `Loading ${track.name}`;
    if (!this.onBoardCourse) {
      this.openingBoardCourse = false;
      this.boardNote.textContent = `${track.name} could not be loaded from the board.`;
      if (failed) {
        failed();
      }
      return;
    }
    this.onBoardCourse(track).then((ok) => {
      this.openingBoardCourse = false;
      if (!ok) {
        this.boardNote.textContent = `${track.name} could not be loaded from the board.`;
        if (failed) {
          failed();
        }
        return;
      }
      this.boardNote.textContent = '';
      this.act('map:custom');
      if (then) {
        then();
      }
    }).catch((err) => {
      this.openingBoardCourse = false;
      this.boardNote.textContent = `${track.name} could not be loaded. ${err.message ?? err}`;
      if (failed) {
        failed();
      }
    });
  }

  /*
   * The tutorial's one column, and the sticks above it. Rebuilt rather than
   * toggled because it is six lines of type and a switch nobody flips twice.
   */
  setHowtoSource(id) {
    this.howtoSource = ['radio', 'launch', 'touch'].includes(id) ? id : 'keyboard';
    this.renderHowto();
    if (this.onUiSound) {
      this.onUiSound('adjust');
    }
  }

  renderHowto() {
    if (!this.howtoKeys) {
      return;
    }
    const source = this.howtoSource;
    for (const [id, b] of Object.entries(this.howtoTabs)) {
      b.classList.toggle('on', id === source);
    }
    this.howtoKeys.textContent = '';
    const rows = source === 'touch'
      ? [
        ['Left thumb', `${stickCaption(this.settings.stickMode, 'left')}.${thrNote(this.settings.stickMode, 'left')}`],
        ['Right thumb', `${stickCaption(this.settings.stickMode, 'right')}.${thrNote(this.settings.stickMode, 'right')}`],
        ['The whole corner', 'The pad is bigger than the drawing: the stick is wherever your thumb lands in the lower corner, and deflection is the drag from there.'],
        ['Landscape', 'Turn the phone sideways. The pads sit under both thumbs, the way a radio sits in both hands.'],
        ['Turtle', 'If you end up inverted on the ground, a TURTLE MODE prompt appears. Pitch or roll on the right pad to flip over. You do not have to time it. Let go, then take off.'],
        ['Pause', 'The Pause chip, top right. Hits bounce. Time is the penalty. Resume, then pitch or roll if you are inverted.'],
        ['Gates', 'Fly the one that pulses. Green is the way through, red is its wrong face.'],
      ]
      : source === 'radio'
      ? [
        [`Left stick (Mode ${normaliseStickMode(this.settings.stickMode)})`, `${stickCaption(this.settings.stickMode, 'left')}. Set the mode on the radio; this page follows it in Settings.`],
        ['Right stick', `${stickCaption(this.settings.stickMode, 'right')}.`],
        ['Before you fly', this.radioBlind
          ? this.radioBlind.howto
          : 'Put the radio in joystick mode before loading this page, then run Calibrate sticks in Settings.'],
        ['In the menus', 'Pitch moves the cursor, roll right selects, roll left goes back. After a pause or a finish, wait a moment with the sticks at rest and hold the roll a beat.'],
        ['Restart', 'R on the keyboard, or a switch on the radio: Settings, Restart switch, then flip it.'],
        ['Acro', 'Hands off holds the attitude you left it in. Every turn has to be flown back out again.'],
        ['Turtle', 'If you end up inverted on the ground, a TURTLE MODE prompt appears. Pitch or roll with the right stick to flip over. You do not have to time it. Centre the stick, then take off.'],
        ['Gates', 'Fly the one that pulses. Green is the way through, red is its wrong face.'],
      ]
      : source === 'launch'
        ? [
          ['What it is', 'Betaflight race start. Pitch the quad, let go of the stick, and it holds that angle at idle until you punch throttle. No looping off the blocks.'],
          ['Turn it on', 'Quad, Launch control, On. It stays off until you do. Then press L on the start line, before you raise throttle.'],
          ['Set the angle', 'Throttle at idle. Pitch forward until the OSD reads around 30 to 40 degrees. Centre the stick. The motors hold it.'],
          ['Go', 'Punch throttle past about 20 percent. The hold dumps, the props bite, and you are flying. L again resets it after a launch.'],
          ['Keyboard', 'Up arrow is pitch forward. W is throttle. Launch control switches you to Acro for the hold, then your own mode comes back after you go.'],
          ['Radio', 'Same sequence as a real board. L is the mode switch. Fine-tune launch_angle_limit and launch_trigger_throttle_percent on the Firmware bench, under Quad.'],
          ['Turtle', 'If you tip over on the blocks, TURTLE MODE takes over. Pitch or roll to flip. You do not have to time it. Centre the stick, then press L and launch again.'],
        ]
      : [
        ...keyHowtoRows(this.settings.stickMode, this.settings.keyThrottle),
        ['L', 'Launch control, if you turned it on in Quad. Pitch, centre, punch.'],
        ['M', 'Switches Angle and Acro in flight, and keeps the choice.'],
        ['R, then Escape', 'Back to the start line, and pause.'],
        ['Turtle', 'If you end up inverted on the ground, a TURTLE MODE prompt appears. Pitch or roll with the arrow keys to flip over. You do not have to time it. Let go, then take off.'],
        ['F8', 'Report a bug or give feedback. Pauses if you are in the air, then opens the form.'],
        ['Gates', 'Fly the one that pulses. Green is the way through, red is its wrong face.'],
      ];
    for (const [k, v] of rows) {
      this.howtoKeys.append(el('dt', null, k), el('dd', null, v));
    }
    this.howtoLive.textContent = source === 'touch'
      ? 'The pads appear in flight, under your thumbs.'
      : source === 'radio'
        ? 'Move your sticks. These follow the radio.'
        : source === 'launch'
          ? 'L arms it. Pitch, centre, punch. The gimbals still follow your hands.'
          : 'Press the keys. These follow your hands.';
    this.howtoMode.textContent = source === 'touch'
      ? 'Thumb sticks are a real proportional stick, so they fly whichever Flight mode is set in Quad: Acro, like a radio, by default. Angle is gentler while you learn: let go of the right pad and the quad levels itself.'
      : source === 'radio'
        ? 'A radio flies Acro by default: the sticks ask for a rate of rotation, and letting go asks for none, which holds whatever attitude the quad is in. Change it under Flight mode in Quad, or with M in flight.'
        : source === 'launch'
          ? 'Off by default, because a punch from a hold is violent and not everyone wants it. Turn it on in Quad, then L on the pad. The green LAUNCH readout is the pitch angle. It blinks when throttle is close to firing.'
          : 'Keys are on or off, so hold time is the analog: a tap moves the stick a little, a hold sits at a flyable amount, a long hold goes to full. Races on keys start in Angle, so letting go levels the quad.';
  }

  /* Live channels for the tutorial's gimbals, fed by the shell's loop. */
  setHowtoSticks(ch) {
    if (!this.howtoStickLeft || this.screen !== 'howto') {
      return;
    }
    placeSticks(this.howtoStickLeft, this.howtoStickRight, ch, this.settings.stickMode);
  }

  setCraftCaption(text) {
    /* main.js calls syncAngleMode from the frame loop, on every screen, so
     * this wrote into the Settings caption sixty times a second while the
     * pilot was looking at something else. */
    Ui.text(this.craftCaption, text);
  }

  isModal() {
    return this.screen !== 'flight';
  }

  /* The title while the question of what to fly is still open. Three
   * things behave differently there and nowhere else on this screen: the
   * three choices are cards, the left and right arrows move between them,
   * and a radio's sticks walk them instead of posing the airframe. */
  /*
   * Seat the aircraft the loaded track was built for, if it is not already
   * seated. Returns the airframe it moved to, or null if nothing moved.
   *
   * Only for the custom map: the built in field and the town have no
   * document and no class, and they are the five inch's.
   */
  seatCraftForCourse() {
    if (this.settings.map !== 'custom') {
      return null;
    }
    let seat = null;
    try {
      seat = activeCourseSummary();
    } catch (e) {
      /* No readable course is not a reason to move a pilot's aircraft. */
      return null;
    }
    if (!seat || !seat.doc) {
      return null;
    }
    /*
     * RE-HOME IT FIRST. The seats are one per class and this document is
     * about to stop being in the active one: the moment the aircraft moves,
     * every read goes to the other class's seat, and a document left behind
     * in this one is a track the pilot pressed Fly on and never saw again.
     * writeAutosave files by the DOCUMENT's class, so this is the one line
     * that carries it across. A share seat is already keyed by the document
     * and needs nothing.
     */
    if (!seat.shareId) {
      try {
        writeAutosave(seat.doc);
      } catch (e) {
        /* Storage refused; the seat it is in still reads. */
      }
    }
    return this.seatCraftForDoc(seat.doc);
  }

  /*
   * Seat the aircraft a DOCUMENT is built for, if it is not already seated.
   * Returns the airframe it moved to, or null if nothing moved.
   *
   * The boot path calls this with a document that arrived by link, before
   * anything reads a seat, because the seats are one per class: a five inch
   * profile that follows a Fly link to a room writes the room into the whoop
   * seat and then reads the five inch's, and the track it was sent to is
   * nowhere. Seating the aircraft the document is for is what makes the two
   * reads the same read.
   */
  seatCraftForDoc(doc) {
    const cls = doc ? trackClassOf(doc) : null;
    if (!cls) {
      return null;
    }
    const have = airframeById(this.settings.airframe);
    if (have.trackClass === cls) {
      return null;
    }
    const want = AIRFRAMES.find((a) => a.trackClass === cls);
    if (!want || want.id === have.id) {
      return null;
    }
    seatAirframe(this.settings, want.id);
    this.settings.airframeAsked = true;
    this.writeSettings();
    return want;
  }

  /*
   * Keep the mode legal for the seated aircraft.
   *
   * A whoop has nowhere to freestyle, so on one the mode is not a question:
   * see freestyleOffered. That covers a leftover 'freestyle' from the five
   * inch and a mode that was never set, and it is what makes a ?craft=whoop65
   * link one press from the air rather than a card away from it.
   *
   * The gate is the one place this must not run, and craftGate is the half
   * of it that says so. There the mode is deliberately blank and the pilot
   * is one press from seating the OTHER aircraft, so answering the mode on
   * a whoop's behalf while the cards are up would close the gate under a
   * pilot who was about to choose the five inch.
   *
   * The SEAT moves with the mode, because a mode on its own is a word: a
   * pilot who swaps to the whoop from inside the town would otherwise be in
   * race with the town still seated, which is the whoop in the five inch's
   * five hundred metre world, drawn behind the title, and is the exact thing
   * this is here to stop. It is also the state every pilot who flew the town
   * on a whoop before this already has in storage, so the boot call has to
   * repair it and not only the swap. freestyleMap is left alone, so swapping
   * back to the five inch puts them in the town they left.
   *
   * Returns whether it changed anything, because two of the three callers
   * store the settings themselves and one of them stores them once.
   */
  syncMode() {
    if (this.craftGate || freestyleOffered(this.settings.airframe)) {
      return false;
    }
    let moved = false;
    if (this.mode !== 'race') {
      this.mode = 'race';
      moved = true;
    }
    if (this.settings.map !== 'custom') {
      this.settings.map = 'custom';
      moved = true;
    }
    return moved;
  }

  /* What the title's one Escape hint is named for: the screen it lands on.
   * One name now, because there is one gate whatever is seated. Naming the
   * destination rather than saying Back is deliberate, see legendFor, and
   * "what to fly" is what the three cards between them ask. */
  gateLabel() {
    return 'What to fly';
  }

  onGate() {
    return this.screen === 'title' && (this.craftGate || !this.mode);
  }

  /* Every screen that draws some of its choices as cards. */
  cardScreen() {
    return isCardScreen(this.screen) || this.onGate();
  }

  /*
   * The title's hint line, which is different on the two states this screen
   * has. Escape is on it once there is a gate behind the menu to go back
   * to, and is off it on the gate, where the key does nothing: a prompt for
   * a key that is a no-op is worse than no prompt at all.
   */
  /*
   * Where the cursor lands when the title's cursor is reset.
   *
   * On the gate it lands on the card that is SEATED, so a returning whoop
   * pilot sees their own answer under the cursor rather than the five inch,
   * and pressing Enter twice from a cold start keeps them where they were.
   * The aircraft is what is remembered, so before the mode is answered the
   * standing answer is that machine's racing card: see seatedWay.
   * Everywhere else it is the first row that can be chosen, which is what it
   * has always been.
   */
  titleStop() {
    const items = this.items();
    if (this.onGate()) {
      const at = items.findIndex(
        (it) => it.action === seatedWay(this.settings, this.mode).action,
      );
      if (at >= 0) {
        return at;
      }
    }
    return this.firstStop(items);
  }

  /*
   * The track record, and which world we are in. One call because they change
   * together: a freestyle map has no record to show and the title's subtitle
   * has to stop claiming a time trial.
   */
  setBest(ms, mode) {
    if (mode) {
      this.osdMode = mode;
    }
    /* Held so refreshBest can redraw the line without a record in hand. */
    this.lastBestMs = ms;
    const freestyle = this.osdMode === 'freestyle';
    /*
     * The score follows the MODE as well as the screen. show() decides
     * visibility too, and on its own that is an ordering dependency: the
     * mode changes when a map is swapped and the screen does not have to
     * change with it. A custom track with no gates is a freestyle map by
     * scene.js's own definition, so swapping onto one has to light the
     * score up without waiting for the next show().
     */
    this.syncScoreVisible();
    this.syncChaseVisible();
    this.syncManga();
    const m = MAPS.find((x) => x.id === this.settings.map) ?? MAPS[0];
    const seat = this.settings.map === 'custom' ? activeCourseSummary() : null;
    /* A map from the board is flown in the built world, and is not Your map. */
    const shared = this.settings.map === 'built' ? this.sharedMap : null;
    const worldName = (seat && seat.name) || (shared && shared.name) || m.name;
    if (this.brandSub) {
      /*
       * "no gates" rather than "free flight", which was the strapline and
       * was also the on-screen LABEL of the middle Scoring position: see
       * FREESTYLE_SCORING_LABEL. So the title named a scoring mode the
       * pilot had not picked, in the same words the Scoring row uses to
       * name the one they had, and the two surfaces disagreed using one
       * vocabulary. No gates is true in all three positions and is the
       * Freestyle room's own first sentence about the place.
       */
      this.brandSub.textContent = freestyle ? `${worldName}, no gates` : `${worldName}, time trial`;
    }
    this.titleBest.textContent = '';
    if (freestyle) {
      /*
       * It had "no clock, no lap" on it, which was true of freestyle until
       * a run became two minutes with a score at the end. There is still no
       * lap and there are still no gates.
       *
       * AND THE TWO MINUTES ARE THE SCORED RUN'S, so they are said only
       * when the pilot has asked for a scored run. This is the first line
       * on the first screen after choosing Freestyle, and with Scoring at
       * its default it was telling a pilot they had a two minute clock
       * while nothing else in the product agreed: no overlay, an OSD slot
       * reading Air, and a run that never ends. Off and free flight have
       * no clock, so they say so. See DEFAULTS.freestyleScoring, and the
       * pre takeoff banner in src/main.js, which is the same sentence in
       * the same trap.
       */
      this.titleBest.textContent = this.settings.freestyleScoring === 'scored'
        ? 'No gates, no lap, two minutes'
        : 'No gates, no lap, no clock';
      this.osdBest.textContent = '';
      return;
    }
    if (ms != null) {
      this.titleBest.append('Track record ', el('span', 'brand-best-time', formatTime(ms)));
    } else {
      this.titleBest.textContent = 'No lap recorded yet';
    }
    this.osdBest.textContent = ms != null ? `Record ${formatTime(ms)}` : 'No record yet';
  }

  /*
   * REDRAW THE TITLE'S RECORD LINE FROM STATE THAT IS ALREADY HERE.
   *
   * setBest writes three things a settings change can invalidate: the
   * freestyle line, which now names the Scoring position, the strapline,
   * and the overlay's visibility. Only src/main.js calls it, and only on a
   * map load or the end of a run, so a pilot who changed Scoring in the
   * Freestyle room and backed out to the title read the PREVIOUS position's
   * sentence until the next world loaded. Every settings commit goes
   * through writeSettings or pick, so both call this.
   */
  refreshBest() {
    if (!this.titleBest) {
      return;
    }
    this.setBest(this.lastBestMs ?? null);
  }

  resultsCourseName() {
    if (this.share && this.share.name) {
      return this.share.name;
    }
    if (this.settings.map === 'custom') {
      try {
        const listing = inspectCourse();
        if (listing && listing.name) {
          return listing.name;
        }
      } catch (e) {
        /* Fall through to the map name. */
      }
    }
    const m = MAPS.find((x) => x.id === this.settings.map) ?? MAPS[0];
    return m.name;
  }

  /*
   * log is the race's record of every lap attempted, in order, clean or
   * thrown away. Voided attempts keep their lap number and appear as
   * rows: renumbering the survivors tells the player they flew a
   * different race from the one they remember.
   *
   * recordAtStart is the track record as the run began. The live best
   * may have moved during the run, and the hero line needs the old
   * figure to say whether this lap beat it.
   */
  /*
   * opts carries what the shell knows and this screen cannot work out:
   * `threeMs`, the fastest three CONSECUTIVE clean laps, which
   * src/game/race.js computes from its own log because a void in the middle
   * breaks a run and the clean list has already forgotten where it was; and
   * `trackClass`, because which of the two metrics is the headline is a
   * property of the track, not of the run.
   */
  showResults(log, best, recordAtStart, ghostNote = null, opts = {}) {
    this.resultsBody.textContent = '';
    this.resultsNote.textContent = '';
    /* The flight flown on the tuned sliders, if there was one: taken now
     * because the results menu is built from it and the log is cleared when
     * the next run starts. */
    this.resultsTune = this.takeTuneFlight();
    const clean = log.filter((l) => Number.isFinite(l.ms)).map((l) => l.ms);
    const fastest = clean.length ? Math.min(...clean) : null;
    const slowest = clean.length ? Math.max(...clean) : null;
    const hadRecord = recordAtStart != null && Number.isFinite(recordAtStart);
    const isRecord = fastest != null && (!hadRecord || fastest < recordAtStart);
    const matched = fastest != null && hadRecord && fastest === recordAtStart;
    const screen = this.screens.results;
    screen.classList.toggle('is-record', Boolean(isRecord));
    screen.classList.toggle('is-empty', !clean.length);
    /* A race's results have a course to draw, not a manga page: a page
     * left from a freestyle run would sit over the course plate. */
    screen.classList.remove('has-manga');
    this.mangaPanels = [];
    this.resultsManga.hidden = true;
    screen.classList.remove('is-in');
    void screen.offsetWidth;
    screen.classList.add('is-in');

    this.resultsKicker.textContent = this.resultsCourseName();
    if (!clean.length) {
      setHeadingText(this.resultsHead, 'Run ended');
      this.resultsHeroTime.textContent = '';
      this.resultsHeroMeta.textContent = '';
      this.resultsHeroMeta.className = 'results-hero-meta';
      this.resultsBody.append(el('p', 'results-empty', 'No clean lap this run. Hitting the ground or a gate frame costs the time it takes to get going again. Only an out of sequence gate voids the lap and sends you back to the mint ring.'));
    } else {
      setHeadingText(this.resultsHead, isRecord
        ? 'New track record'
        : (matched ? 'Matched the record' : 'Run complete'));
      /*
       * RACEGOW IS SCORED ON THREE CONSECUTIVE LAPS, so on a micro track
       * that total is the headline and the best single lap moves to the
       * line under it. Everywhere else the best lap keeps the top line,
       * which is what MultiGP's time trial is scored on.
       *
       * The record line on this screen stays the best single lap of the
       * run, against the record this browser holds. The public board is
       * the other number: on a RaceGOW room the time it ranks is the three
       * lap total, and that is what the standings show.
       */
      const three = Number.isFinite(opts.threeMs) ? opts.threeMs : null;
      const threeUp = opts.trackClass === 'micro' && three != null;
      this.resultsHeroCap.textContent = threeUp
        ? 'Best three laps'
        : (clean.length === 1 ? 'Lap time' : 'Best lap');
      this.resultsHeroTime.textContent = formatTime(threeUp ? three : fastest);
      if (threeUp) {
        /* Three consecutive is what the run is scored on, so the lap that
         * carries the record is named here rather than left to the rows. */
        const lapWord = clean.length === 1 ? 'Lap' : 'Best lap';
        if (isRecord) {
          this.resultsHeroMeta.textContent = `${lapWord} ${formatTime(fastest)}, a track record`;
          this.resultsHeroMeta.className = 'results-hero-meta gain';
        } else if (matched) {
          this.resultsHeroMeta.textContent = `${lapWord} ${formatTime(fastest)}, equals the record`;
          this.resultsHeroMeta.className = 'results-hero-meta gain';
        } else {
          this.resultsHeroMeta.textContent = `${lapWord} ${formatTime(fastest)}, ${formatDelta(fastest - best)} off ${formatTime(best)}`;
          this.resultsHeroMeta.className = 'results-hero-meta off';
        }
      } else if (isRecord && hadRecord) {
        this.resultsHeroMeta.textContent = `${formatDelta(fastest - recordAtStart)}  previous ${formatTime(recordAtStart)}`;
        this.resultsHeroMeta.className = 'results-hero-meta gain';
      } else if (isRecord) {
        this.resultsHeroMeta.textContent = 'First record on this track';
        this.resultsHeroMeta.className = 'results-hero-meta gain';
      } else if (matched) {
        this.resultsHeroMeta.textContent = `Equals the record  ${formatTime(best)}`;
        this.resultsHeroMeta.className = 'results-hero-meta gain';
      } else {
        this.resultsHeroMeta.textContent = `${formatDelta(fastest - best)} off the record  ${formatTime(best)} to beat`;
        this.resultsHeroMeta.className = 'results-hero-meta off';
      }
    }
    log.forEach((entry) => {
      const fastestRow = entry.ms != null && entry.ms === fastest;
      const row = el('div', `result-row${entry.ms == null ? ' void' : ''}${fastestRow ? ' fastest' : ''}`);
      const main = el('div', 'result-main');
      main.append(el('span', 'result-label', `Lap ${entry.n}`));
      if (entry.ms == null) {
        main.append(el('span', 'result-time', 'void'));
        main.append(el('span', 'result-why', (entry.reason || '').replace(/\n/g, ' ').toLowerCase()));
        row.append(main);
      } else {
        main.append(el('span', 'result-time', formatTime(entry.ms)));
        if (fastestRow && clean.length > 1) {
          main.append(el('span', 'result-tag', 'fastest'));
        }
        row.append(main);
        if (slowest > 0) {
          const bar = el('div', 'result-bar');
          const fill = el('div', 'result-bar-fill');
          fill.style.width = `${Math.max(10, (entry.ms / slowest) * 100)}%`;
          bar.append(fill);
          row.append(bar);
        }
      }
      this.resultsBody.append(row);
    });
    /*
     * The two footing rows, and they are ONE row whenever they are one
     * number. A clean run of exactly three laps has a total that IS the
     * fastest three consecutive, and printing it twice under two labels
     * reads as two measurements that happen to agree rather than as one
     * measurement. So the total row takes the three lap name in that case,
     * and the separate row only appears when a longer or a voided run
     * really does make them different figures.
     */
    const total = clean.length > 1 ? clean.reduce((a, b) => a + b, 0) : null;
    const three = Number.isFinite(opts.threeMs) ? opts.threeMs : null;
    const totalRow = (label, ms) => {
      const row = el('div', 'result-row total');
      const main = el('div', 'result-main');
      main.append(el('span', 'result-label', label));
      main.append(el('span', 'result-time', formatTime(ms)));
      row.append(main);
      this.resultsBody.append(row);
    };
    if (total != null) {
      /* Renamed only on the track that is SCORED on it. A clean three lap
       * run on the field has the same arithmetic, but MultiGP's time trial
       * is scored on one lap, so calling its total by RaceGOW's name would
       * put a rule on the screen that does not apply to the run. */
      totalRow(
        opts.trackClass === 'micro' && three != null && three === total
          ? 'Best three consecutive'
          : (clean.length === log.length ? 'Total' : 'Clean laps total'),
        total,
      );
    }
    /* Named on every track that managed three in a row, because it is the
     * RaceGOW metric and a five inch pilot flying a longer run has every
     * reason to want it too. On a micro track it is also the hero above, and
     * having it in the rows is what makes them add up to the headline. */
    /* A room's row. main.js hands the figure over for every class, because
     * the race computes it for every class, but the sixty metre field is
     * scored on one lap and its sheet must not grow a RaceGOW row. */
    if (opts.trackClass === 'micro' && three != null && three !== total) {
      totalRow('Best three consecutive', three);
    }
    /* How the run went against the ghost that was being chased, one line,
     * written by the shell because only it knows who the ghost was. */
    if (ghostNote) {
      this.resultsBody.append(el('p', 'results-ghost', ghostNote));
    }
    /* The note is about the course that was FLOWN. It used to read
     * inspectCourse unconditionally, so a lap on the race field came back
     * with a line about whatever course happened to be on the builder's
     * canvas, named and everything. */
    if (this.settings.map !== 'custom') {
      this.resultsNote.textContent = '';
    } else if (this.share && this.share.id) {
      const by = this.share.author ? ` by ${this.share.author}` : '';
      this.resultsNote.textContent = `${this.share.name || 'This track'}${by} is on the public board. Post a time under your name to appear on it.`;
    } else {
      try {
        const listing = inspectCourse();
        if (listing && listing.kind === 'remix') {
          const of = listing.sourceName ? ` of ${listing.sourceName}` : '';
          this.resultsNote.textContent = `${listing.name} is your copy${of}. Publish it under a new name to put it on the board.`;
        } else if (listing && listing.kind === 'local' && listing.canPublishNew) {
          this.resultsNote.textContent = `${listing.name} lives in this browser. Publish it to put it on the board, then you can post a time.`;
        } else if (listing && listing.kind === 'owned' && listing.layoutDrift) {
          this.resultsNote.textContent = `${listing.name} has a layout that is not on the board yet. Update the track before posting a time.`;
        }
      } catch (e) {
        /* A summary failure must not hide the times. */
      }
    }
    this.timePosted = null;
    this.coursePublished = null;
    this.resultsFastest = fastest;
    /* The row the board would be sent, from the race (boardRow). The one
     * caller always hands it; one that did not would get the fastest lap
     * and the three with no weight, which every reader takes as stock. */
    /* A run whose laps were all flown on the tuned air or motors has no row
     * at all (race.boardRow), and must not fall through to the fastest lap
     * with no weight, which every reader takes as a stock lap. */
    this.resultsOffBoard = Boolean(opts.offBoard);
    this.resultsBoard = fastest == null || (!opts.board && this.resultsOffBoard)
      ? null
      : (opts.board || { lapMs: fastest, threeMs: Number.isFinite(opts.threeMs) ? opts.threeMs : null, weight: null });
    /* Which course this lap was flown on. The time and the document have to
     * travel together: publishing a DIFFERENT course while these results are
     * still on screen used to hand the new course this lap. */
    this.resultsDocId = null;
    if (fastest != null) {
      try {
        const listing = inspectCourse();
        this.resultsDocId = listing && listing.doc ? listing.doc.id : null;
        if (listing && listing.canPostTime && listing.shareId && this.resultsBoard) {
          writePendingTime({
            trackId: listing.shareId,
            lapMs: this.resultsBoard.lapMs,
            /* Carried with the lap, because the upload can happen on a later
             * visit and by then the race is gone. Null on the field, which
             * is scored on one lap and always will be. */
            threeMs: opts.trackClass === 'micro' ? this.resultsBoard.threeMs : null,
            /* And the weight it was flown at, for the same reason: the
             * slider may be somewhere else by the time it goes up. */
            weight: this.resultsBoard.weight,
          });
        }
      } catch (e) {
        /* Keep the results screen even if storage is unavailable. */
      }
    }
    /* A world has no plan to draw, so the panel goes away rather than
     * showing an empty blueprint plate. */
    const plan = this.settings.map === 'custom' ? currentPlan() : null;
    this.resultsPlan.planData = plan;
    this.resultsPlanWrap.hidden = !plan;
    this.show('results');
    if (plan) {
      requestAnimationFrame(() => drawPlan(this.resultsPlan, plan, { scaleBar: true }));
    }
    /* The one automatic offer of the flight feel question, because this is
     * the only place a first race finishes. */
    this.maybeOfferFeel();
    /* And, when the flight was flown on the tuned sliders, whether it was
     * better than stock. */
    this.maybeAskTune(this.resultsTune);
  }

  /*
   * A NOTICE THAT ARRIVES WHILE A MENU IS UP (MENUS-PLAN.md 1.8). The banner
   * is the flight's voice: three lines of large amber type a fifth of the
   * way down, which on a menu was printed over the heading and the lede
   * ("plug in a radio" across SETTINGS, "Stick mapping saved" across the
   * room it came back to). On a menu the same words are a small line above
   * the command bar, read out once like the banner. Called from the frame
   * loop, so it only touches the page when the words change.
   */
  setMenuNotice(text) {
    const want = text || '';
    const node = this.menuNotice;
    if (!node || node.__wfText === want) {
      return;
    }
    node.__wfText = want;
    node.textContent = want;
    node.hidden = !want;
    if (want) {
      this.announce(want);
    }
  }

  setBanner(text, panelled = false) {
    /* Called from the frame loop as well as from events, so it is guarded
     * like the OSD. */
    const want = text || '';
    Ui.text(this.banner, want);
    const opacity = want ? '1' : '0';
    if (this.banner.__wfOpacity !== opacity) {
      this.banner.__wfOpacity = opacity;
      this.banner.style.opacity = opacity;
    }
    Ui.klass(this.banner, panelled ? 'banner panel' : 'banner');
    /* The announcer is the one place a screen reader hears a banner at all;
     * see mountAnnouncer. Only real text, and only when it changes. */
    if (want) {
      this.announce(want);
    }
  }

  /*
   * THE TARGET MARK: the answer to "where is the next one".
   *
   * A lit gate can only be found by a pilot who is already looking at it.
   * The report this exists for is the other case: the target is behind a
   * clubhouse, or off the side of a 117 degree frame, or simply one of
   * fourteen structures in a valley, and there is nothing on screen that
   * says which way to turn. Every racing game solves that on the display
   * rather than in the world, because the display is the one surface that
   * cannot be occluded.
   *
   * Two states, one element. In frame, it is a bracket around the opening,
   * sized to the aperture, so it reads as a lock on that object rather than
   * as a dot near it. Out of frame or behind, it is a chevron pinned inside
   * the edge, pointing the shortest way round. Both carry the range and
   * both take their colour from the same half space test the gate does, so
   * the display and the world can never disagree about which way through.
   *
   * It lets go inside 6 m. By then the gate is most of the frame and a
   * bracket around it is a box drawn on a barn door.
   */
  buildTargetLock() {
    this.lock = el('div', 'lock is-off');
    this.lockBox = el('div', 'lock-box');
    this.lockBox.append(el('i', 'lc tl'), el('i', 'lc tr'), el('i', 'lc bl'), el('i', 'lc br'));
    this.lockArrow = el('div', 'lock-arrow');
    this.lockDist = el('div', 'lock-dist', '');
    this.lock.append(this.lockBox, this.lockArrow, this.lockDist);
    /* Last written values. Every one of these is a style write per frame if
     * it is not cached, and a style write is layout the browser may or may
     * not be able to skip. The mark is on screen for a whole race. */
    this.lockLast = { cls: '', tx: '', bx: '', ax: '', dx: '', text: '', op: '' };
    return this.lock;
  }

  /*
   * `x` and `y` are CSS pixels from the top left of the canvas, already
   * clamped into the frame by the shell, which is the only place that knows
   * the canvas size. `size` is the projected aperture in CSS pixels, `angle`
   * the chevron's heading in degrees clockwise from up.
   */
  setTargetLock({ show, x, y, size, angle, edge, wrong, distance, fade }) {
    if (!this.lock) {
      return;
    }
    const last = this.lockLast;
    const cls = show
      ? `lock${edge ? ' is-edge' : ''}${wrong ? ' is-wrong' : ''}`
      : 'lock is-off';
    if (cls !== last.cls) {
      this.lock.className = cls;
      last.cls = cls;
    }
    if (!show) {
      return;
    }
    const tx = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (tx !== last.tx) {
      this.lock.style.transform = tx;
      last.tx = tx;
    }
    const op = fade < 0.995 ? fade.toFixed(2) : '';
    if (op !== last.op) {
      this.lock.style.opacity = op;
      last.op = op;
    }
    if (edge) {
      const ax = `translate(-50%, -50%) rotate(${angle.toFixed(1)}deg)`;
      if (ax !== last.ax) {
        this.lockArrow.style.transform = ax;
        last.ax = ax;
      }
    } else {
      const bx = `${size.toFixed(0)}px`;
      if (bx !== last.bx) {
        this.lockBox.style.width = bx;
        this.lockBox.style.height = bx;
        last.bx = bx;
      }
    }
    /* The label sits under whichever mark is showing, which are two
     * different heights, so it is placed rather than laid out. */
    const drop = (edge ? 15 : size * 0.5) + 11;
    const dx = `translate(-50%, ${drop.toFixed(0)}px)`;
    if (dx !== last.dx) {
      this.lockDist.style.transform = dx;
      last.dx = dx;
    }
    /* Whole metres. A tenth of a metre at 30 m/s is three hundredths of a
     * second and reads as a smear of digits. */
    const text = `${Math.round(distance)} m`;
    if (text !== last.text) {
      this.lockDist.textContent = text;
      last.text = text;
    }
  }

  /*
   * Flight overlay values. Prose and units a pilot reads: seconds, volts,
   * metres, kilometres per hour. No identifiers, no raw state.
   */
  /*
   * The flight display.
   *
   * `mode` is 'race' or 'freestyle', and it is not a cosmetic switch: a
   * freestyle map has no gates, no lap and no record, so a HUD that showed
   * "Gate 1 of 0" and a lap clock counting from a line that does not exist
   * would be reporting three things that are not true. What it shows instead
   * is what a freestyle pilot actually reads.
   *
   *   THE RUN CLOCK, not a lap and no longer an airtime. It was an airtime,
   *   counting up, on the reasoning that freestyle is flown in packs and how
   *   long you have been up decides when to come home. That was right while
   *   nothing was being measured. A freestyle run is two minutes now, with a
   *   score at the end of it that goes on a public board, so the number a
   *   pilot needs is how much of it is LEFT: the last twenty seconds are when
   *   they decide whether to try the big line, and they cannot decide that
   *   without knowing they are the last twenty seconds.
   *
   *   It is in the lap clock's slot, top centre, rather than beside the
   *   score. That is where a pilot already looks for a clock, and it means
   *   there is exactly ONE clock on the screen: an airtime counting up
   *   beside a run counting down is two answers to the same question.
   *   ALTITUDE ABOVE THE GROUND UNDER THE CRAFT. This one is not optional in
   *   a city. Cross one street and the surface under you moves seven metres,
   *   from the road to the overbridge deck; a height measured from the spawn,
   *   which is what this used to show, is a number that means nothing over a
   *   roof. The shell measures it against the surface query the collision
   *   test uses, so the readout and the thing that kills you agree.
   *   Speed, pack and throttle are the same in both, because they are
   *   properties of the machine and not of the game around it, which is
   *   also why the machine decides whether speed shows at all: osdSpeed in
   *   configs/airframes.js, false on the whoop.
   */
  /*
   * Say something once, to whoever is listening. The guard is the point: a
   * live region re-reads its contents when they change, and setBanner runs
   * on the frame loop, so an unguarded write would speak the same sentence
   * sixty times a second.
   */
  announce(text) {
    const want = text == null ? '' : String(text);
    if (!this.announcer || this.announcer.__wfSaid === want) {
      return;
    }
    this.announcer.__wfSaid = want;
    this.announcer.textContent = want;
  }

  /*
   * WRITE ONLY WHAT CHANGED.
   *
   * These three exist because setOsd runs on every flight frame and used to
   * assign textContent and className to about a dozen nodes whether or not
   * the value had moved. Assigning the string a node already holds still
   * replaces its Text child and still invalidates style, and this overlay is
   * composited above the WebGL canvas, which is the arrangement an
   * integrated GPU pays for most. Measured with a MutationObserver: 17
   * records per frame in flight, 3 per frame sitting on the title.
   *
   * scorehud.js has done it this way since it was written and says why at
   * the top of the file. This is the same guard, in the file that needed it
   * more. The last value is cached on the node itself so nothing has to keep
   * a map in step with a DOM that screens rebuild.
   */
  static text(el, value) {
    if (!el) {
      return;
    }
    const v = value == null ? '' : String(value);
    if (el.__wfText !== v) {
      el.__wfText = v;
      el.textContent = v;
    }
  }

  static klass(el, value) {
    if (!el) {
      return;
    }
    const v = value == null ? '' : String(value);
    if (el.__wfClass !== v) {
      el.__wfClass = v;
      el.className = v;
    }
  }

  /* Bars are a fraction of their track, drawn as a horizontal scale.
   * Rounded to a thousandth before the compare, because a battery that
   * drains by a ten thousandth of a per cent per frame would otherwise defeat
   * the guard entirely while moving nothing a pilot can see.
   *
   * A TRANSFORM, NOT A WIDTH. The throttle bar moves nearly every frame, and
   * a width is layout: it was a style, layout and paint pass every frame,
   * behind a 120 ms width transition that also drew the throttle a tenth of
   * a second late. A scale is composited and never lays anything out; the
   * fill is full width in the stylesheet and scaled from its left edge. */
  static bar(el, frac) {
    if (!el) {
      return;
    }
    const f = Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 1000;
    if (el.__wfBar !== f) {
      el.__wfBar = f;
      el.style.transform = `scaleX(${f})`;
    }
  }

  /* The clock's text, written now if it is a change of state (live false)
   * or on the clock's tick if it is a running number: see OSD_CLOCK_MS. A
   * method and a flag rather than a closure, because setOsd runs every frame
   * and the frame loop allocates nothing (P8). */
  osdClock(text, live) {
    if (!live || this.osdClockDue) {
      Ui.text(this.osdTimer, text);
    }
  }

  setOsd({ mode, lapMs, lastLapMs, gate, gateCount, gateCue, volts, packFrac, altitude, speedKph, throttle, flightMode, bounces, launchState, launchPitch, ghostGapMs, ghostFinal, runState, runRemainMs, runTimed, runScored }) {
    const freestyle = mode === 'freestyle';
    this.countFps();
    /* Whether the continuous readouts are due this frame: see
     * OSD_NUMBERS_MS. A running clock waits for its tick; a clock that has
     * just stopped, started or changed what it counts is written at once,
     * because that is a change of state and not a number moving. */
    const nowMs = performance.now();
    const numbersDue = nowMs - this.osdNumbersAt >= OSD_NUMBERS_MS;
    const clockDue = nowMs - this.osdClockAt >= OSD_CLOCK_MS;
    if (numbersDue) {
      this.osdNumbersAt = nowMs;
    }
    if (clockDue) {
      this.osdClockAt = nowMs;
    }
    this.osdClockDue = clockDue;
    /* A freestyle clock has no gate line and no records under it, so on a
     * phone the banner can hang higher: see THE PHONE OSD in index.html.
     * Written on a change only. */
    if (this.osdFree !== freestyle) {
      this.osdFree = freestyle;
      this.osd.classList.toggle('is-free', freestyle);
    }
    /* Before the first gate there is no lap to time, so the clock reads
     * zero and dims rather than showing a row of dashes. */
    const running = lapMs != null && Number.isFinite(lapMs);
    if (freestyle) {
      /*
       * The run has not started until the first trick, so the clock says so
       * rather than showing two minutes that are not counting. Dimmed by
       * the same `waiting` class the lap clock uses before the first gate,
       * which is the same state for the same reason.
       */
      if (runScored === false) {
        /*
         * SCORING OFF MEANS THERE IS NO RUN, so the slot goes back to the
         * airtime it carried before a run was a thing that ends, which is
         * what a pilot flying a pack wants beside the pack bar. Airtime is
         * time in the air: main.js starts it at takeoff and holds it while
         * the quad sits landed, so the pads read a dimmed 0.00 and not the
         * seconds spent reading the banner. See airtimeMs there.
         */
        Ui.text(this.osdClockLabel, 'Air');
        this.osdClock(running ? formatTime(lapMs) : '0.00', running);
        Ui.klass(this.osdTimer, running ? 'osd-timer' : 'osd-timer waiting');
      } else if (runTimed === false) {
        /*
         * FREE FLIGHT HAS NO CLOCK, and the slot is not left empty: a blank
         * where a number belongs reads as a fault. It says what it is.
         */
        Ui.text(this.osdClockLabel, 'Run');
        this.osdClock('Free', false);
        Ui.klass(this.osdTimer, 'osd-timer waiting');
      } else {
        const ready = runState !== 'flying' && runState !== 'over';
        const left = Number.isFinite(runRemainMs) ? runRemainMs : 0;
        Ui.text(this.osdClockLabel, 'Run');
        this.osdClock(ready ? '2:00' : formatRunClock(left), !ready);
        Ui.klass(this.osdTimer, ready
          ? 'osd-timer waiting'
          : (left <= 10_000 ? 'osd-timer is-late' : 'osd-timer'));
      }
    } else {
      Ui.text(this.osdClockLabel, 'Lap');
      this.osdClock(running ? formatTime(lapMs) : '0.00', running);
      Ui.klass(this.osdTimer, running ? 'osd-timer' : 'osd-timer waiting');
    }
    if (freestyle) {
      Ui.text(this.osdGate, '');
    } else if (gateCue) {
      Ui.text(this.osdGate, `Gate ${gate} of ${gateCount}, ${gateCue}`);
    } else {
      Ui.text(this.osdGate, `Gate ${gate} of ${gateCount}`);
    }
    if (numbersDue) {
      Ui.text(this.osdPack, `${volts.toFixed(1)} volts`);
      Ui.bar(this.osdPackBar, packFrac);
    }
    Ui.text(this.osdLast, !freestyle && lastLapMs != null ? `Last lap ${formatTime(lastLapMs)}` : '');
    if (this.osdGhost) {
      if (ghostGapMs == null || freestyle) {
        Ui.klass(this.osdGhost, 'osd-ghost is-off');
        Ui.text(this.osdGhost, '');
      } else {
        /* Negative is you ahead of the ghost. The sign is spelled out so
         * the readout cannot be mistaken for a lap time. */
        const ahead = ghostGapMs <= 0;
        const gap = `${ahead ? '-' : '+'}${(Math.abs(ghostGapMs) / 1000).toFixed(2)}`;
        Ui.text(this.osdGhost, `${ghostFinal ? 'Ghost lap' : 'Ghost'} ${gap}`);
        Ui.klass(this.osdGhost, `osd-ghost ${ahead ? 'ahead' : 'behind'}`);
      }
    }
    /* Gone, not blank, on an airframe that has no speed to print: see
     * osdSpeed in configs/airframes.js. Going or coming is written at once,
     * the number itself at OSD rate. */
    Ui.klass(this.osdSpeed, speedKph == null ? 'osd-value is-off' : 'osd-value');
    if (speedKph == null) {
      Ui.text(this.osdSpeed, '');
    } else if (numbersDue || this.osdSpeed.__wfText === '') {
      Ui.text(this.osdSpeed, `${speedKph.toFixed(0)} km/h`);
    }
    if (this.osdFlight) {
      const modeText = flightMode === 'turtle'
        ? 'Turtle'
        : (launchState === 1 || launchState === 2
          ? 'Launch'
          : (flightMode === 'angle' ? 'Angle' : 'Acro'));
      Ui.text(this.osdFlight, modeText);
      Ui.text(this.osdFlightTouch, modeText);
    }
    if (this.osdLaunch) {
      const on = launchState > 0;
      Ui.klass(this.osdLaunch, 'osd-launch'
        + (on ? '' : ' is-off')
        + (launchState === 2 ? ' is-hot' : '')
        + (launchState === 3 ? ' is-go' : ''));
      if (!on) {
        Ui.text(this.osdLaunch, '');
      } else if (launchState === 3) {
        Ui.text(this.osdLaunch, 'GO');
      } else {
        const deg = Math.round(launchPitch || 0);
        Ui.text(this.osdLaunch, deg > 2 ? `LAUNCH ${deg}` : 'LAUNCH');
      }
    }
    if (numbersDue) {
      Ui.text(this.osdAltNum, `${altitude.toFixed(1)} m`);
    }
    /* The throttle bar every frame: it is an instrument the thumb is reading,
     * and since it moves by transform it costs no layout. See Ui.bar. */
    Ui.bar(this.osdThrBar, throttle);
    if (this.osdHits) {
      /*
       * IT COUNTS UP NOW, AND IT COSTS NOTHING.
       *
       * This row used to read "Hits left 2 of 3" and it was a durability
       * model: the third firm contact of a lap ended the run. There is no
       * wreck any more, an airframe cannot be spent, and a countdown to a
       * thing that no longer happens is worse than no row at all. What is
       * still worth telling a pilot is how much they are bouncing, so the
       * row says that, in the neutral colour, and it says nothing at all
       * until there is something to say.
       */
      /* Through the guards like every other readout. It wrote textContent
       * and className raw, every frame, which replaced the text node and
       * dirtied the layout even when the count had not moved. */
      const hits = !bounces ? '' : (bounces === 1 ? '1 bounce' : `${bounces} bounces`);
      Ui.text(this.osdHits, hits);
      if (bounces) {
        Ui.klass(this.osdHits, 'osd-sub osd-hits');
      }
      Ui.text(this.osdHitsTouch, hits);
    }
  }

  /*
   * The freestyle score overlay. Three calls rather than one because they
   * run at three different rates: the view every frame, the events only
   * when something happened, and the visibility only when the screen
   * changes. Folding them into one call would mean handing the HUD a view
   * on frames where it has nothing to do.
   */
  syncScoreVisible() {
    /* setBest can be reached before build() has run in a future caller, and
     * a missing overlay is not worth a crash on a screen change. */
    if (!this.scoreHud) {
      return;
    }
    /*
     * UP ON EVERY FREESTYLE MAP, whatever Scoring says. It used to come down
     * with Scoring off, because a zero for a run nobody was scoring is a
     * readout that cannot change, which reads as a fault. Since the counter
     * (FREESTYLE-MAPS-PLAN.md decision 2) the lines are counted in every
     * position, so the overlay always has something it can count, and the
     * switch decides trick names, not the overlay.
     *
     * AND DOWN WITH MANGA AND SCORING OFF, the one thing that takes it off a
     * freestyle map: the pilot asked for no score on the screen. The scorer
     * under it counts on regardless (DEFAULTS.mangaAndScoring).
     */
    this.scoreHud.setVisible(
      this.settings.mangaAndScoring
      && this.osdMode === 'freestyle'
      && (this.screen === 'flight' || this.screen === 'paused'),
    );
  }

  /* Neither is handed on with Manga and scoring off. The overlay is down,
   * and a callout lettered into a hidden overlay is work for nobody; what
   * it would have shown is still counted, by the scorer, and the total is
   * written on the first frame after the overlay comes back. */
  setScore(view) {
    if (this.letterHold || !this.settings.mangaAndScoring) {
      return;
    }
    this.scoreHud.update(view);
  }

  scoreEvents(list) {
    if (this.letterHold || !this.settings.mangaAndScoring) {
      return;
    }
    this.scoreHud.events(list);
  }

  /*
   * THE MANGA LAYER, ON OR OFF (FREESTYLE-MAPS-PLAN.md section 3.2 and 3.3,
   * decision 4): on a freestyle map unless the pilot chose Clean FPV, and
   * never on a race track. Called wherever the mode or a setting can have
   * changed, which is setBest (a map adopted, and every settings commit
   * through refreshBest), and once at build. Each layer holds its own flag
   * and ignores a call that changes nothing.
   *
   * What answers to it: the score's names and verdict, the chase's
   * callouts, the found mark's ray fans, the results page, and Stage F's
   * speed lines, impact frame and screentone, which src/main.js's
   * mangaFrame reads from `this.manga` every frame.
   *
   * MANGA AND SCORING OFF is off for all of it, on every map, whatever
   * Clean FPV says (DEFAULTS.mangaAndScoring).
   */
  syncManga() {
    const look = Boolean(this.settings.mangaAndScoring);
    this.manga = look && this.osdMode === 'freestyle' && !this.settings.cleanFpv;
    if (this.scoreHud) {
      this.scoreHud.setManga(this.manga);
    }
    if (this.chaseHud) {
      this.chaseHud.setManga(this.manga);
    }
    if (this.stfLayer) {
      Ui.klass(this.stfLayer, this.manga ? 'stf-found' : 'stf-found is-clean');
    }
    /*
     * The rest of the look is not flight's, and follows Manga and scoring
     * alone: .no-manga on the root takes the ink frame off the menu panels
     * and the tone and the tilt off a found mark's panel (index.html), and
     * letterHeading reads it to give a heading its own text back. The
     * screen that is up is lettered again at once, so the switch thrown in
     * Settings changes the Settings title while the pilot is looking at
     * it; every other screen follows when it is next shown.
     */
    if (this.root && look !== this.lookShown) {
      this.lookShown = look;
      this.root.classList.toggle('no-manga', !look);
      this.letterScreen(this.screen);
    }
  }

  /*
   * The FPS readout follows the Show FPS row. Called from show() for the
   * same reason syncCrosshair is. The count restarts on every show so a
   * pause does not read as one very slow frame.
   */
  syncFps() {
    if (!this.osdFps) {
      return;
    }
    const on = this.settings.showFps === true;
    this.osdFps.hidden = !on;
    this.osdFpsFrames = 0;
    this.osdFpsAt = 0;
  }

  /* One frame drawn: counts, and rewrites the number twice a second. */
  countFps() {
    if (this.settings.showFps !== true || !this.osdFps) {
      return;
    }
    const now = performance.now();
    if (this.osdFpsAt === 0) {
      this.osdFpsAt = now;
      return;
    }
    this.osdFpsFrames += 1;
    if (now - this.osdFpsAt >= 500) {
      Ui.text(this.osdFps, `${Math.round((this.osdFpsFrames * 1000) / (now - this.osdFpsAt))} FPS`);
      this.osdFpsFrames = 0;
      this.osdFpsAt = now;
    }
  }

  /*
   * The crosshairs follow the Crosshairs row. Called from show(), because
   * the OSD is only up in flight and paused, and every way from the row to
   * the flight goes through a show(), so no settings path can leave a stale
   * shape behind. One comparison and at most one class write.
   */
  syncCrosshair() {
    if (!this.osdCross) {
      return;
    }
    const shape = CROSSHAIRS.includes(this.settings.crosshair) ? this.settings.crosshair : 'off';
    if (shape !== this.osdCrossShape) {
      this.osdCrossShape = shape;
      this.osdCross.className = `osd-cross is-${shape}`;
    }
  }

  /*
   * Letter a screen's headings: the wordmark on the title, the room's title
   * everywhere else, the results' head. See letterHeading, which paints only
   * what changed. Not ui.manga's: the menus use the hand whatever Clean FPV
   * says, because Clean FPV is about flight. The first call installs one
   * resize listener, which letters the screen on show again once the window
   * has settled, because a heading's size is in vw.
   */
  letterScreen(screen) {
    const node = this.screens && this.screens[screen];
    if (!node || typeof window === 'undefined') {
      return;
    }
    if (!this.letterResize) {
      this.letterResize = true;
      this.letterTimer = 0;
      window.addEventListener('resize', () => {
        clearTimeout(this.letterTimer);
        this.letterTimer = setTimeout(() => {
          this.letterScreen(this.screen);
          this.fitMenuHeight();
          /* A narrower window fits fewer cards across, so the open sheet
           * moves to the end of its card's new line. */
          if (this.screen === 'courses') {
            this.placeCourseSheet();
          }
          this.syncPrimaryButton();
        }, 150);
      });
    }
    for (const h of node.querySelectorAll(':scope > h2, h1.wordmark, h2.results-head')) {
      letterHeading(h);
    }
    /* A lettered heading can be a different height from its text, so the
     * list under it is measured again. */
    if (screen === this.screen) {
      this.fitMenuHeight();
    }
  }

  showScore(on) {
    this.scoreHud.setVisible(on);
  }

  resetScore() {
    this.scoreHud.reset();
    /* A new run has nothing posted and nothing to post. Without this a
     * pilot who flew a second run saw the first one's "Run posted" row. */
    this.freestyleRun = null;
    this.runPosted = null;
  }

  /*
   * THE CHASE (FREESTYLE-MAPS-PLAN.md section 7 item 4, Stage E): the Tail
   * meter and the chase callouts, fed from src/game/chase.js. What the shell
   * calls, and every one of them is safe with no cars, on a race track, and
   * before build() has run:
   *
   *   setChaseCars(n)     when a map is adopted: how many cars it drives.
   *                       0, a race track or a map with no roads, keeps the
   *                       layer down whatever else is called.
   *   chaseMeter(view)    every flight frame, with chase.view(). A view with
   *                       nothing open, or null, takes the meter down.
   *   chaseEvents(list)   every flight frame, with chase.drainEvents() (null
   *                       when nothing happened); chaseEvent(e) for one.
   *                       Each paying event and each loss gets a callout,
   *                       and the paying ones are spoken as well.
   *   resetChase()        a new run, with resetScore.
   *
   * Up only on a freestyle map with cars, in flight or paused, as the score
   * is; not behind the Scoring switch, for the reason at chaseHud in build().
   * Behind Manga and scoring, as the score is: off, the meter and the
   * callouts are not drawn and the chase counts on under them.
   */
  setChaseCars(n) {
    this.chaseCarsOn = n > 0;
    this.syncChaseVisible();
  }

  syncChaseVisible() {
    if (!this.chaseHud) {
      return;
    }
    this.chaseHud.setVisible(
      this.chaseCarsOn
      && this.settings.mangaAndScoring
      && this.osdMode === 'freestyle'
      && (this.screen === 'flight' || this.screen === 'paused'),
    );
  }

  chaseMeter(view) {
    if (this.letterHold) {
      return;
    }
    if (this.chaseHud) {
      this.chaseHud.meter(this.chaseHud.visible ? view : null);
    }
  }

  chaseEvents(list) {
    if (!list || this.letterHold) {
      return;
    }
    for (const e of list) {
      this.chaseEvent(e);
    }
  }

  chaseEvent(e) {
    if (!this.chaseHud || !this.chaseHud.visible) {
      return;
    }
    this.chaseHud.event(e);
    const t = chaseCallText(e);
    if (t && !t.lost) {
      this.announce(`${t.word}, ${t.line}.`);
    }
  }

  resetChase() {
    if (this.chaseHud) {
      this.chaseHud.reset();
    }
  }

  /*
   * THE STF MARK, FOUND (FREESTYLE-MAPS-PLAN.md section 9). The pilot flew
   * up to the mark and looked straight at it, so the overlay says so the
   * way it says a trick, lettered in ink with a burst behind it, and then
   * shows them what they found in a manga panel: the mark itself, because a
   * pilot at speed may have seen it for a quarter of a second.
   *
   * DOWN THE RIGHT, NEVER THE MIDDLE. The left column is the score's, the
   * banner and the verdict are centred, and the middle of the frame is the
   * pilot's: the plan's rule is that nothing drawn in flight covers its
   * centre third, and this fires with the mark a fifth of the frame across
   * in the middle of it (findRange in src/game/egg.js). The callout
   * sits under the banner's line and the panel under the callout, clear of
   * the speed corner, and neither takes a pointer.
   *
   * THREE SECONDS AND GONE (STF_FOUND_MS). Keyframes on nodes this removes,
   * and no frame of its own, the rule src/ui/scorehud.js opens with. A
   * second call while one is up replaces it rather than stacking.
   *
   * `imageUrl` is the mark as an image (stfDataUrl in src/art/stf.js). Null
   * brings the callout alone, which is still the news.
   */
  stfFound(imageUrl) {
    const layer = this.stfLayer;
    if (!layer) {
      return;
    }
    layer.textContent = '';
    const call = el('div', 'stf-call');
    /* The burst first and the type after it, so the type paints over the
     * rays by DOM order: see .score-name > span in index.html for why not
     * a z-index. */
    call.append(el('div', 'stf-call-burst'), stfLettering('stf-call-word'), el('div', 'stf-call-line', 'Mark found'));
    layer.append(call);
    if (imageUrl) {
      const panel = el('div', 'stf-panel');
      const img = el('img', 'stf-panel-mark');
      img.alt = 'The STF mark';
      img.src = imageUrl;
      panel.append(el('div', 'stf-panel-burst'), img);
      layer.append(panel);
    }
    this.announce('STF mark found.');
    clearTimeout(this.stfTimer);
    /* The timer removes the nodes rather than animationend, which is not
     * promised on a node whose animation never runs (reduced motion). */
    this.stfTimer = setTimeout(() => {
      layer.textContent = '';
    }, STF_FOUND_MS + 200);
  }

  /*
   * A PARTNER'S MARK, FOUND: stfFound's moment, in the same place, for the
   * same three seconds and in the same clothes, because the owner asked for
   * the partners' marks to be found "like the old STF one". The word is the
   * partner's short name in the callout's lettering, the line under it is
   * what they are to WebFPV (roleTitle), and the panel is their sign as it
   * is painted in the world (partnerDataUrl in src/art/partnermark.js), so
   * the pilot sees whose it was even if they saw it for a quarter of a
   * second. A second find while one is up replaces it, as stfFound's does:
   * two marks are never within PARTNER_SEP of each other
   * (src/maps/built/egg.js), so two finds a frame apart do not happen.
   */
  partnerFound(partner, imageUrl) {
    const layer = this.stfLayer;
    if (!layer || !partner) {
      return;
    }
    layer.textContent = '';
    const call = el('div', 'stf-call');
    call.append(
      el('div', 'stf-call-burst'),
      el('span', 'stf-call-word partner-call-word', partner.short),
      el('div', 'stf-call-line', `${roleTitle(partner)} \u00b7 found`),
    );
    layer.append(call);
    if (imageUrl) {
      const panel = el('div', 'stf-panel');
      const img = el('img', 'stf-panel-mark');
      img.alt = `${partner.name}'s mark`;
      img.src = imageUrl;
      panel.append(el('div', 'stf-panel-burst'), img);
      layer.append(panel);
    }
    this.announce(`${partner.name} mark found.`);
    clearTimeout(this.stfTimer);
    this.stfTimer = setTimeout(() => {
      layer.textContent = '';
    }, STF_FOUND_MS + 200);
  }

  /* The freestyle board's answer, so the results row can say what happened
   * rather than staying on the verb. */
  markRunPosted(posted) {
    this.runPosted = posted || { ok: true };
    if (this.screen === 'results') {
      this.renderMenu();
    }
  }

  /*
   * THE HORN. A freestyle run ends the way a race does, on the results
   * screen, and it reuses that screen rather than growing a second one:
   * the shape is the same, a headline number and a list of what made it up,
   * and the screen already knows how to handle a freestyle run's menu.
   *
   * What it does NOT reuse is the lap machinery. A run has no laps, so the
   * rows are the tricks the pilot actually landed, biggest earner first,
   * which is the one sentence a freestyle scorer can say that a pilot
   * cares about: you flew nine flips and they were worth this much.
   *
   * THE COUNTER (Stage C). The headline is the whole counter, `counter`,
   * when the summary carries one: tricks, gaps, close calls, the chase and
   * the mark, with this browser's best for the map beside it (`counterBest`,
   * `counterImproved`). The board is still posted the trick total, `total`,
   * because the board cannot be taught geometry from here
   * (FREESTYLE-MAPS-PLAN.md section 7, "The board"), so the meta line names
   * the trick score as the board's number and the note says which number
   * went where, rather than letting a pilot think the board has the bigger
   * one. In a run with no tricks `total` is 0 and says so.
   *
   * THE MANGA PAGE. On a freestyle map with the manga layer on, what the
   * run is remembered by is drawn as a page of panels down the open side
   * (showMangaPage); with Clean FPV the same things are plain rows under
   * the tricks.
   */
  showFreestyleResults(summary) {
    this.freestyleRun = summary;
    this.runPosted = null;
    this.cardSaved = null;
    /* See showResults: taken before the menu is built. */
    this.resultsTune = this.takeTuneFlight();
    this.resultsBody.textContent = '';
    this.resultsNote.textContent = '';
    const screen = this.screens.results;
    const counter = summary.counter != null ? summary.counter : summary.total;
    const scored = summary.tricks > 0 || counter > 0;
    const clean = summary.crashes === 0 && scored;
    screen.classList.toggle('is-record', clean);
    screen.classList.toggle('is-empty', !scored);
    screen.classList.remove('is-in');
    void screen.offsetWidth;
    screen.classList.add('is-in');

    /* The world the run was flown in, by the registry's name for it, which
     * is what the Map row and the world cards call it. Written in as the
     * town's name, it told a pilot back from Your map that they had been
     * somewhere else. */
    const world = seatedFreestyleMap(this.settings);
    /* A map from the board by its own name, for the same reason. */
    const shared = world && world.id === 'built' && this.sharedMap ? this.sharedMap.name : '';
    const where = shared || (world ? world.name : 'Freestyle');
    this.resultsKicker.textContent = summary.timed === false
      ? `${where}, free flight`
      : where;
    setHeadingText(this.resultsHead, scored
      ? (clean ? 'Clean run' : 'Run complete')
      : 'Run ended');
    this.resultsHeroCap.textContent = 'Score';
    this.resultsHeroTime.textContent = formatScore(counter);
    /* A town has no plan drawing, and an empty blueprint plate beside a
     * freestyle score is a picture of nothing. */
    this.resultsPlan.planData = null;
    this.resultsPlanWrap.hidden = true;
    const notes = [];
    if (!scored) {
      this.resultsHeroMeta.textContent = '';
      this.resultsHeroMeta.className = 'results-hero-meta';
      this.resultsBody.append(el('p', 'results-empty', summary.timed === false
        ? 'Nothing the recogniser could name. A trick is a whole rotation about one axis, or a lap around something: a flip, a roll, a 360 of yaw, a powerloop under a rail. Turning a corner is not a trick and is deliberately worth nothing.'
        : 'Two minutes and nothing the recogniser could name. A trick is a whole rotation about one axis, or a lap around something: a flip, a roll, a 360 of yaw, a powerloop under a rail. Turning a corner is not a trick and is deliberately worth nothing.'));
    } else {
      const calls = closeCallCount(summary.closeCalls);
      const counted = summary.counter != null;
      const parts = [
        counted && summary.counterImproved && localBestOf(summary) > 0 ? 'a new best for this map' : '',
        counted && !summary.counterImproved && localBestOf(summary) > 0
          ? `best ${formatScore(localBestOf(summary))}` : '',
        counted ? `trick score ${formatScore(summary.total || 0)}${this.settings.map === 'built' ? '' : ', the board\'s'}` : '',
        summary.tricks > 0 ? `${summary.tricks} tricks, ${summary.unique} of them different` : '',
        summary.gaps > 0 ? `${summary.gaps} gap${summary.gaps === 1 ? '' : 's'}` : '',
        calls > 0 ? `${calls} close call${calls === 1 ? '' : 's'}` : '',
        summary.bestCombo > 0 ? `best chain ${formatScore(summary.bestCombo)}` : '',
        summary.bonus > 0 ? `variety bonus ${formatScore(summary.bonus)}` : '',
        summary.crashes === 0 ? 'no crashes' : `${summary.crashes} crash${summary.crashes === 1 ? '' : 'es'}`,
      ].filter(Boolean);
      this.resultsHeroMeta.textContent = parts.join('  ·  ');
      this.resultsHeroMeta.className = clean ? 'results-hero-meta gain' : 'results-hero-meta';
      /* The rows are the run's own tally, biggest earner first, and the bar
       * is that trick's share of the trick score. Same idiom the lap rows
       * use, which is why they can share the stylesheet. */
      /* The counter's own bests, first, as plain rows, when there is no
       * page to draw them on: they are what the run is remembered by, and
       * under the tricks they sat below the fold of a list that scrolls. */
      if (!this.manga) {
        this.appendCounterRows(summary);
      }
      this.appendResultRows(partnerRows(summary));
      const rows = summary.rows || [];
      const top = rows.length ? rows[0].points : 0;
      /*
       * THREE, and one line for the rest. It was ten in a list that
       * scrolled, and at 1280 by 720 the Fly again row sat over the third
       * of them and over the best line under them: the page was taller
       * than the column. What a pilot reads a results screen for is what
       * EARNED, and the top three answer it; the manga page beside them
       * carries the best trick, and the rest are counted, with what they
       * paid between them, on a line of their own, so nothing is hidden
       * without saying so.
       */
      for (const row of rows.slice(0, RESULT_TRICK_ROWS)) {
        const line = el('div', `result-row${row === rows[0] ? ' fastest' : ''}`);
        const main = el('div', 'result-main');
        main.append(el('span', 'result-label', row.count > 1 ? `${row.name} x${row.count}` : row.name));
        main.append(el('span', 'result-time', formatScore(row.points)));
        line.append(main);
        if (top > 0) {
          const bar = el('div', 'result-bar');
          const fill = el('div', 'result-bar-fill');
          fill.style.width = `${Math.max(4, Math.round((row.points / top) * 100))}%`;
          bar.append(fill);
          line.append(bar);
        }
        this.resultsBody.append(line);
      }
      const rest = rows.slice(RESULT_TRICK_ROWS);
      if (rest.length) {
        const line = el('div', 'result-row result-more');
        const main = el('div', 'result-main');
        main.append(
          el('span', 'result-label', rest.length === 1 ? 'One more kind of trick' : `${rest.length} more kinds of trick`),
          el('span', 'result-time', formatScore(rest.reduce((sum, r) => sum + (r.points || 0), 0))),
        );
        line.append(main);
        this.resultsBody.append(line);
      }
    }
    /* Which number went to the board, and which stays here. */
    if (summary.counter != null && summary.counter !== summary.total
      && this.settings.map !== 'built' && summary.timed !== false) {
      notes.push(summary.tricks > 0
        ? `Post this run sends the board the trick score, ${formatScore(summary.total)}. The board knows tricks and nothing else yet, so the gaps, close calls and the chase in ${formatScore(summary.counter)} are counted here and not there.`
        : `The board takes tricks only, and this run named none, so there is nothing to post. The gaps, close calls and the chase in ${formatScore(summary.counter)} are counted here.`);
    }
    /* The best line leads the note: it is the sentence the pilot was
     * waiting for, and the board's small print can follow it. */
    const bestNote = scored ? counterBestSentence(summary) : null;
    if (bestNote) {
      notes.unshift(bestNote);
    }
    this.resultsNote.textContent = notes.join(' ');
    this.mangaPanels = this.manga ? mangaPanels(summary) : [];
    screen.classList.toggle('has-manga', this.mangaPanels.length > 0);
    this.show('results');
    this.showMangaPage();
    this.maybeAskTune(this.resultsTune);
  }

  /*
   * The manga page, on the results screen: up with its panels, or down when
   * there are none (a run of nothing, or Clean FPV). Drawn after show(),
   * because a box on a screen that is not displayed measures nothing. The
   * found panel wants the painted mark, which is loaded the first time it
   * is asked for (main.js loads it too, when the mark is found, so this is
   * usually a module already in hand), and the page is drawn again when it
   * arrives.
   */
  showMangaPage() {
    const panels = this.mangaPanels;
    this.resultsManga.hidden = !panels.length;
    if (!panels.length) {
      return;
    }
    /* A phone too narrow for the page does not draw it (index.html, under
     * .results-manga), nor one where it would come out smaller than reads,
     * and then the counter's bests go in the list, as they do for Clean
     * FPV, rather than nowhere. */
    this.fitMangaBox();
    const box = this.resultsManga.getBoundingClientRect();
    if (this.resultsManga.offsetParent === null || box.width < 140 || box.height < 140) {
      this.resultsManga.hidden = true;
      this.appendCounterRows(this.freestyleRun, true);
      return;
    }
    this.resultsMangaCanvas.setAttribute('aria-label', `The run as a manga page. ${pageSentence(panels)}`);
    this.paintMangaPage();
    if (!this.mangaStf && panels.some((p) => p.kind === 'stf')) {
      import('../art/stf.js').then((m) => {
        this.mangaStf = m.stfCanvas();
        if (this.screen === 'results' && this.mangaPanels === panels) {
          this.paintMangaPage();
        }
      }).catch(() => { /* The lettering stands in for the mark. */ });
    }
  }

  /* The counter's bests as plain rows in the results list, at its head
   * when `first`, or where the list has got to. */
  appendCounterRows(summary, first) {
    this.appendResultRows(counterRows(summary || {}), first);
  }

  /* Plain [label, value] rows in the results list, at its head when
   * `first`, or where the list has got to. */
  appendResultRows(pairs, first) {
    const lines = pairs.map(([label, value]) => {
      const line = el('div', 'result-row');
      const main = el('div', 'result-main');
      main.append(el('span', 'result-label', label), el('span', 'result-time', value));
      line.append(main);
      return line;
    });
    if (first) {
      this.resultsBody.prepend(...lines);
    } else {
      this.resultsBody.append(...lines);
    }
  }

  /*
   * On a phone held upright the page sits over the menu, whose height is
   * its rows' (it does not scroll), and a row is 64 px on a finger and 39
   * on a mouse: so the page's foot is set from where the menu actually
   * starts rather than from a guess in the stylesheet. A phone on its side
   * and a desktop put the page beside the menu, and keep the stylesheet's.
   */
  fitMangaBox() {
    const box = this.resultsManga;
    box.style.bottom = '';
    if (window.innerWidth > 860 || window.innerHeight <= 520) {
      return;
    }
    const foot = this.screens.results.querySelector('.results-foot');
    if (foot) {
      const top = foot.getBoundingClientRect().top;
      box.style.bottom = `${Math.max(0, Math.round(window.innerHeight - top + 12))}px`;
    }
  }

  paintMangaPage() {
    const c = this.resultsMangaCanvas;
    if (this.resultsManga.offsetParent === null) {
      return;
    }
    this.fitMangaBox();
    const box = this.resultsManga.getBoundingClientRect();
    const w = Math.max(120, Math.round(box.width));
    const h = Math.max(90, Math.round(box.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMangaPage(ctx, w, h, this.mangaPanels, { stf: this.mangaStf });
  }

  /*
   * THE SHARE CARD: the run's page beside its score, at the card code's
   * 1200 by 630 (src/share/card.js), with that code's wordmark and its
   * JPEG encoder, which keeps a card under the size WhatsApp drops. The
   * card code is loaded on the press, not at boot. Null when the run has
   * nothing to draw. Drawn from the page whether or not Clean FPV is on:
   * it is a picture the pilot asked for, not something over their flying.
   */
  async runCardBytes() {
    const run = this.freestyleRun;
    const panels = run ? mangaPanels(run) : [];
    if (!panels.length) {
      return null;
    }
    const card = await import('../share/card.js');
    if (!this.mangaStf && panels.some((p) => p.kind === 'stf')) {
      try {
        this.mangaStf = (await import('../art/stf.js')).stfCanvas();
      } catch (e) {
        /* The lettering stands in for the mark. */
      }
    }
    const world = seatedFreestyleMap(this.settings);
    const canvas = document.createElement('canvas');
    drawRunCard(canvas, card.CARD_W, card.CARD_H, {
      summary: run, panels, mapName: world ? world.name : 'Freestyle', stf: this.mangaStf,
    }, card.drawWordmark);
    return card.encodeCard(canvas);
  }

  /* The card, saved as a file: there is no board entry for a run to hang
   * it on, so it goes to the pilot, to post wherever they like. */
  async saveRunCard() {
    const run = this.freestyleRun;
    try {
      const bytes = await this.runCardBytes();
      if (!bytes) {
        return;
      }
      const world = seatedFreestyleMap(this.settings);
      const slug = String(world ? world.name : 'freestyle').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const total = run.counter != null ? run.counter : run.total;
      const name = `webfpv-${slug || 'freestyle'}-${Math.round(total)}.jpg`;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.cardSaved = { name };
    } catch (e) {
      this.cardSaved = { error: e && e.message ? e.message : String(e) };
    }
    if (this.screen === 'results') {
      this.renderMenu();
    }
  }

  /*
   * HARNESS HOOKS for the lettering and the results page, window.__lettering,
   * because the pictures Stage C needs cannot wait for a scorer and a
   * pilot: every callout kind, a big bank, a bail, the skim meter, the page
   * with five panels and with two, the card, and each with Clean FPV. Its
   * fixtures are in src/ui/letterdemo.js, loaded only when asked for.
   *
   *   hold(on)      stop the frame loop's own score and chase views from
   *                 writing over what the harness put up
   *   feed(list)    scorer events into the score HUD, shown
   *   view(v)       a scorer view into the score HUD (the skim meter)
   *   chase(list)   chase events into the chase HUD, shown
   *   meter(v)      a chase view into the Tail meter
   *   clean(on)     Clean FPV on or off, as the Settings row sets it
   *   results(s)    a summary onto the results screen; the panels drawn
   *   card()        the share card as a JPEG data URL
   *   centre()      every drawn node of the flight overlays that reaches
   *                 into the middle third of the window, which must be none
   *   demo()        the fixtures module
   *
   * A run shown this way is marked assisted by its fixtures, so Post this
   * run refuses it, as it refuses every harness run.
   */
  installLetteringHooks() {
    if (typeof window === 'undefined') {
      return;
    }
    const ui = this;
    window.__lettering = {
      hold(on) {
        ui.letterHold = on !== false;
        return ui.letterHold;
      },
      feed(list) {
        ui.scoreHud.setVisible(true);
        ui.scoreHud.events(list);
        return ui.scoreHud.names.childElementCount;
      },
      view(v) {
        ui.scoreHud.setVisible(true);
        ui.scoreHud.update(v);
        return true;
      },
      chase(list) {
        ui.chaseHud.setVisible(true);
        ui.chaseHud.events(list);
        return ui.chaseHud.calls.childElementCount;
      },
      meter(v) {
        ui.chaseHud.setVisible(true);
        ui.chaseHud.meter(v);
        return true;
      },
      clean(on) {
        ui.settings.cleanFpv = Boolean(on);
        ui.syncManga();
        return ui.manga;
      },
      results(summary) {
        ui.showFreestyleResults(summary);
        return ui.mangaPanels.map((p) => p.kind);
      },
      async card() {
        const bytes = await ui.runCardBytes();
        if (!bytes) {
          return null;
        }
        let raw = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          raw += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return `data:image/jpeg;base64,${btoa(raw)}`;
      },
      centre() {
        const W = window.innerWidth;
        const x0 = W / 3;
        const x1 = (2 * W) / 3;
        const hits = [];
        for (const layer of [ui.scoreHud.root, ui.chaseHud.root, ui.stfLayer]) {
          for (const n of layer.querySelectorAll('*')) {
            /* What is drawn: a leaf, or a node with text of its own. A
             * column's box is not a thing on the screen. */
            const own = Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim());
            if (n.childElementCount && !own) {
              continue;
            }
            const r = n.getBoundingClientRect();
            if (!r.width || !r.height || r.width >= W * 0.9) {
              continue;
            }
            if (r.right > x0 + 0.5 && r.left < x1 - 0.5) {
              hits.push({
                cls: String(n.className), left: Math.round(r.left), right: Math.round(r.right),
              });
            }
          }
        }
        return hits;
      },
      demo() {
        return import('./letterdemo.js');
      },
    };
  }

  /*
   * The stick overlay, which began as the keyboard's stick ghost. Mode 2:
   * left is yaw (x) and throttle (y, idle at the bottom), right is roll (x)
   * and pitch (y, stick forward is up, matching the radio and the up arrow).
   * Drawn for every stick source while the Stick overlay setting is on,
   * which it is by default; it was the keyboard's alone until 2026-10-06.
   * Hidden on thumb sticks. The shell decides `show` in stickOverlayUp in
   * main.js, the one test the gate mark's bottom margin reads too.
   *
   * `show` now hides the two GIMBALS rather than the block they sit in,
   * because the air slider sits between them and is not the keyboard's.
   * Whether the block itself is up is setAirSlider's call, which the frame
   * loop makes from the same place with the same flight test.
   */
  setStickOverlay({ show, roll, pitch, yaw, throttle }) {
    if (!this.osdSticks) {
      return;
    }
    const cls = show ? 'osd-gimbal' : 'osd-gimbal is-off';
    Ui.klass(this.osdStickLeft.box, cls);
    Ui.klass(this.osdStickRight.box, cls);
    if (!show) {
      return;
    }
    placeSticks(this.osdStickLeft, this.osdStickRight, { yaw, throttle, roll, pitch }, this.settings.stickMode);
  }

  /*
   * THE AIR SLIDER'S THREE JOBS: commit live, say what it is, and explain
   * itself exactly once.
   *
   * Commit is on 'input', not 'change'. Every other slider in this shell
   * waits for the release because each one re-inits the module; this one
   * stores a single double into the plant, and the whole reason it is on the
   * flight screen instead of in a menu is that the pilot should feel the
   * change arrive while the craft is still in the air.
   *
   * The events are stopped at this element. The OSD sits under nothing while
   * flying, but the shell's own key handling treats the flight screen as the
   * stick, and a focused track that let its arrow keys through would steer
   * the quad as well as the slider.
   */
  bindAirSlider() {
    const air = this.osdAir;
    if (!air) {
      return;
    }
    const commit = () => {
      const v = clampWeight(air.range.value, this.settings.airframe);
      if (v === this.settings.weight) {
        /* Still repaint: a drag between two steps snaps back to the value in
         * force, and a caption that did not follow would read as a stuck
         * control. */
        this.paintAir();
        return;
      }
      this.settings.weight = v;
      this.paintAir();
      saveSettings(this.settings);
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
    };
    air.range.addEventListener('input', commit);
    /* Touching the track at all answers the question the hint was asking, so
     * the hint retires whether or not the value ends up anywhere new. */
    air.range.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.dismissAirHint();
    });
    air.range.addEventListener('click', (e) => e.stopPropagation());
    /*
     * IT NEVER KEEPS FOCUS, and the reason was measured rather than
     * reasoned: a click on the track focused it, and from then on the
     * keyboard pilot's ArrowRight moved gravity 100 to 105 instead of
     * rolling the quad, and Escape no longer paused. Both follow from one
     * fact about src/input/input.js: its key listener is on the window and
     * bails out for any INPUT target, because text fields own their keys.
     * A range is an INPUT. So while this control held focus the sticks were
     * dead, the arrows were retuning the plant, and the one key that would
     * have got the pilot out was swallowed by a stopPropagation that used to
     * sit here.
     *
     * The fix is that focus leaves on release, so the window between press
     * and release is the only one in which a key can reach this element,
     * and tabindex -1 so a stray Tab in flight cannot land here either. In
     * flight this is a pointer control, like the chips, and a screen reader
     * is not flying. The pointer drag itself does not need focus: the
     * browser holds implicit capture on the pressed element until release.
     */
    air.range.tabIndex = -1;
    const release = () => {
      if (document.activeElement === air.range) {
        air.range.blur();
      }
    };
    air.range.addEventListener('pointerup', release);
    air.range.addEventListener('pointercancel', release);
    air.range.addEventListener('change', release);
    air.dismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismissAirHint();
    });
    this.bindTuneSliders();
    this.paintAir();
  }

  /*
   * THE TWO TUNING SLIDERS, bound the way the Weight slider is and for the
   * same reasons: they commit live on 'input' so the change is felt arriving
   * under the craft, they never keep focus (read the long note in
   * bindAirSlider: a range holding focus eats the arrow keys that fly the
   * quad and the Escape that pauses it), and a touch on the track answers
   * the card. What a change does is main.js's: applySettings pushes the new
   * scale to the module and voids a lap the change lands in.
   */
  bindTuneSliders() {
    const t = this.osdAir && this.osdAir.tune;
    if (!t) {
      return;
    }
    const rows = [
      [t.grip.range, 'airGrip', clampAirGrip],
      [t.power.range, 'motorKv', clampMotorKv],
    ];
    for (const [range, key, clamp] of rows) {
      range.addEventListener('input', () => {
        const v = clamp(range.value);
        if (v === this.settings[key]) {
          this.paintAir();
          return;
        }
        this.settings[key] = v;
        this.paintAir();
        saveSettings(this.settings);
        if (this.onSettings) {
          this.onSettings(this.settings);
        }
      });
      range.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.dismissTuneHint();
      });
      range.addEventListener('click', (e) => e.stopPropagation());
      range.tabIndex = -1;
      const release = () => {
        if (document.activeElement === range) {
          range.blur();
        }
      };
      range.addEventListener('pointerup', release);
      range.addEventListener('pointercancel', release);
      range.addEventListener('change', release);
    }
    t.reset.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetTune();
    });
    t.hintBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismissTuneHint();
    });
  }

  /* All three sliders back to the quad as it ships, in one settings write,
   * so a lap is voided once and not three times. */
  resetTune() {
    const s = this.settings;
    if (s.weight === WEIGHT_STOCK && s.airGrip === AIR_GRIP_STOCK && s.motorKv === MOTOR_KV_STOCK) {
      return;
    }
    s.weight = WEIGHT_STOCK;
    s.airGrip = AIR_GRIP_STOCK;
    s.motorKv = MOTOR_KV_STOCK;
    this.paintAir();
    saveSettings(s);
    if (this.onSettings) {
      this.onSettings(s);
    }
  }

  dismissTuneHint() {
    const t = this.osdAir && this.osdAir.tune;
    if (!t || this.tuneHintDone) {
      return;
    }
    this.tuneHintDone = true;
    t.hint.hidden = true;
    markTuneHintSeen();
  }

  /*
   * Whether the block is up, and whether the hint is with it. Driven from
   * the frame loop beside setStickOverlay, so the two cannot disagree about
   * what flying means.
   *
   * The hint is shown on the FIRST FLIGHT this browser has ever seen and
   * never again. Not on the title, not in a menu: a tooltip on a control the
   * reader cannot see is a riddle, and the sentence it carries only means
   * anything while there is a quad in the air to try it on.
   *
   * `ready` is the quad in the air: off the pads, not perched, not set down
   * and not on its back. `airMs` is the run's airtime on the sim clock and
   * `padFlying` is a radio or gamepad's sticks moving the quad in the air.
   *
   * THE SLIDER FADES IN THE AIR. The owner's decision of 2026-09-26: "once
   * in flight fade it out, show it when landed or pause screen". The block
   * carries is-aloft while the quad flies and the sheet does the fade, so
   * nothing here runs per frame beyond the cached class write. It stays up
   * while its card is, because the card is pointing at it.
   *
   * ON GLASS THE CARD WAITS FOR THE GROUND. `touch` is the thumb sticks
   * flying. There the slider sits between the plates and fades the moment
   * the quad is in the air, card or no card (POLISH-PLAN.md item 14: no
   * Weight slider in flight on touch), and a card held up in the air was a
   * panel over the middle of a phone's picture for eight seconds with both
   * thumbs busy. So it is raised on the first time the quad is down again
   * after some air, sitting still with the slider under it and a thumb
   * free, and it retires, remembered, on the next takeoff.
   */
  setAirSlider(show, ready = true, { airMs = 0, padFlying = false, touch = false } = {}) {
    const air = this.osdAir;
    if (!air) {
      return;
    }
    Ui.klass(this.osdSticks, show ? 'osd-sticks' : 'osd-sticks is-off');
    if (!show) {
      Ui.klass(air.box, 'osd-air is-off');
      return;
    }
    /*
     * THE CARD RETIRES WITHOUT A POINTER. It used to wait for Got it or a
     * touch on the track, which a pilot holding a radio never gives, so it
     * sat over the ground ahead for the whole first session and came back
     * the next one. It now goes, and is remembered as dismissed, on the
     * first landing or crash (ready drops), after about eight seconds of
     * airtime, or on the first stick a radio or gamepad flies the quad with.
     */
    const dialog = Boolean(this.nameDialog && !this.nameDialog.hidden);
    if (!air.hint.hidden) {
      const done = touch
        ? ready
        : (!ready || padFlying || airMs - this.airHintAtMs >= AIR_HINT_AIR_MS);
      if (done) {
        this.dismissAirHint();
      } else if (dialog) {
        /* Never drawn under a modal. Put away, not retired: it comes back
         * with the flight, on the airtime it had already used. */
        air.hint.hidden = true;
      }
    }
    /*
     * WHEN THE HINT IS RAISED, and both halves of the test were learned
     * from a picture rather than reasoned out.
     *
     * `ready` is the craft being in the air. A card explaining how the air
     * feels, shown to somebody still sitting on the start block under a
     * banner reading "throttle up to take off", is asking them to read about
     * a thing they cannot try; and it is the takeoff prompt they need first.
     *
     * IT DOES NOT ALSO WAIT FOR THE BANNER, and that was the first draft.
     * On a 390 px tall phone the card and the world note landed on each
     * other, so the hint was told to hold until the banner cleared, and on
     * the field map with nothing built the note NEVER clears: a rule that
     * can silently never fire is worse than the overlap it was fixing. The
     * collision is a layout problem and it is solved in the sheet, where the
     * card flips below the slider on a short screen.
     */
    const raise = touch ? (!ready && airMs > 0) : (ready && !padFlying);
    if (!this.airHintDone && air.hint.hidden && raise && !dialog && !airHintSeen()) {
      air.hint.hidden = false;
      /* The first raise starts its eight seconds. A raise after a pause
       * keeps the stamp, so the pause does not buy the card more air. */
      if (this.airHintAtMs == null) {
        this.airHintAtMs = airMs;
      }
    }
    /*
     * FLIGHT FEEL TUNING'S CARD: once ever, on the ground, with the mode on,
     * and never at the same time as the Weight card or under a dialog. It is
     * put away the moment the quad leaves the ground, and remembered as seen
     * only if that was a takeoff and not a dialog: a card the pilot never got
     * to read comes back.
     */
    const tuneHint = air.tune && air.tune.hint;
    if (tuneHint) {
      const room = this.tuneCardRoom();
      if (!tuneHint.hidden && (ready || dialog || !room || !this.settings.feelTuning)) {
        if (ready) {
          this.dismissTuneHint();
        } else {
          tuneHint.hidden = true;
        }
      } else if (tuneHint.hidden && !ready && !dialog && room && air.hint.hidden && this.settings.feelTuning
        && !this.tuneHintDone && !tuneHintSeen()) {
        tuneHint.hidden = false;
      }
    }
    Ui.klass(air.box, ready && air.hint.hidden ? 'osd-air is-aloft' : 'osd-air');
  }

  /*
   * WHETHER THE SCREEN HAS ROOM FOR FLIGHT FEEL TUNING'S CARD. It hangs
   * above the block and is about as tall as the block is wide, so on a short
   * screen it lands on the launch banner and the clock, which is the one
   * thing a pilot sitting on the start block needs to read (measured on an
   * 844 by 390 landscape phone: the card ran from y 97 to 280 and the banner
   * from 20 to 120). The Weight card meets the same screen by hanging below
   * its slider; this block is the lowest thing on the glass and there is no
   * below, so on a short screen the card is simply not raised, and not
   * remembered as seen, so a pilot who later has a taller window is told
   * once then. The line is the sheet's own short screen line, 560 px.
   * The query is made once: setAirSlider runs every frame.
   */
  tuneCardRoom() {
    if (this.tuneRoomQuery === undefined) {
      this.tuneRoomQuery = typeof window.matchMedia === 'function'
        ? window.matchMedia('(min-height: 561px)')
        : null;
    }
    return this.tuneRoomQuery ? this.tuneRoomQuery.matches : true;
  }

  /*
   * Off the screen, the card is put away rather than retired, so it is
   * never drawn through the pause menu or a dialog over it. On the pause
   * screen the Weight is the menu's own row (weightItem), and the sheet
   * puts this slider away under the dimmed OSD; is-aloft comes off so it
   * is up again the moment the pilot resumes on the ground.
   */
  pauseAirSlider(screen) {
    const air = this.osdAir;
    if (!air || screen === 'flight') {
      return;
    }
    air.hint.hidden = true;
    if (air.tune) {
      air.tune.hint.hidden = true;
    }
    if (air.box.__wfClass === 'osd-air is-aloft') {
      Ui.klass(air.box, 'osd-air');
    }
  }

  dismissAirHint() {
    const air = this.osdAir;
    if (!air || this.airHintDone) {
      return;
    }
    this.airHintDone = true;
    air.hint.hidden = true;
    markAirHintSeen();
  }

  /* The track and the caption, from settings. Called on every write so the
   * flight screen agrees with a value changed anywhere else. */
  paintAir() {
    const air = this.osdAir;
    if (!air) {
      return;
    }
    /* The top first, because a range clamps its value to its max and the
     * whoop's is lower than the five inch's. */
    const top = String(weightMaxFor(this.settings.airframe));
    if (air.range.max !== top) {
      air.range.max = top;
    }
    const v = this.settings.weight;
    if (Number(air.range.value) !== v) {
      air.range.value = String(v);
    }
    /*
     * SLATE AT STOCK, AMBER OFF IT. Slate is the colour this shell uses for
     * type that should recede, and at 100 there is nothing to say: the pilot
     * is on the machine the board prints no weight for. Off stock the number
     * is an instrument reading, which is what amber means everywhere else on
     * this overlay, and it is the colour the board's weight label is in.
     *
     * IT USED TO SAY ", off the board" AND THE PILOT HAD IT REMOVED: "this
     * means nothing". They are right about where it belongs. A pilot mid
     * flight is feeling the quad, not filing a time, and what the board does
     * with a weight, which is now to take the time and print the weight
     * beside the name, is said where somebody is actually deciding about a
     * record: the sentence under the Fly button, read immediately before a
     * run, and the note on the Upload row. A third copy riding the
     * instrument all flight is noise, and noise on an overlay is how a pilot
     * learns to stop reading it.
     */
    const stock = v === WEIGHT_STOCK;
    air.cap.textContent = `Weight ${v}%`;
    Ui.klass(air.cap, stock ? 'osd-air-cap is-stock' : 'osd-air-cap');
    /*
     * And the two tuning sliders, when the mode is on. Hidden is the whole
     * of "off": the group takes no space and no pointer, and nothing below
     * runs. Painted the way Weight is, slate at stock and amber off it.
     */
    const tune = air.tune;
    if (tune) {
      const on = Boolean(this.settings.feelTuning);
      if (tune.box.hidden === on) {
        tune.box.hidden = !on;
      }
      if (on) {
        const rows = [
          [tune.grip, clampAirGrip(this.settings.airGrip), AIR_GRIP_STOCK, 'Air grip', this.tuneCaps.air],
          [tune.power, clampMotorKv(this.settings.motorKv), MOTOR_KV_STOCK, 'Motor power', this.tuneCaps.kv],
        ];
        for (const [row, value, base, name, able] of rows) {
          /* A slider the module cannot answer is not drawn: see setTuneCaps. */
          if (row.box.hidden === able) {
            row.box.hidden = !able;
          }
          if (Number(row.range.value) !== value) {
            row.range.value = String(value);
          }
          row.cap.textContent = `${name} ${value}%`;
          Ui.klass(row.cap, value === base ? 'osd-air-cap is-stock' : 'osd-air-cap');
        }
        /* The way home is offered only when there is somewhere to go back
         * from: at stock the button is a line of height spent on nothing. */
        const stockAll = v === WEIGHT_STOCK
          && clampAirGrip(this.settings.airGrip) === AIR_GRIP_STOCK
          && clampMotorKv(this.settings.motorKv) === MOTOR_KV_STOCK;
        if (tune.reset.hidden !== stockAll) {
          tune.reset.hidden = stockAll;
        }
      }
    }
  }

  /*
   * The calibrate screen's strip, painted by paintAxisStrip, which Stick
   * help shares so the two screens draw an axis the same way.
   */
  setCalAxes(axes) {
    if (!this.calAxes) {
      return;
    }
    this.calAxisCells = paintAxisStrip(this.calAxes, this.calAxisCells, axes, false);
  }

  /*
   * STICK HELP, every frame it is up: the pad, the strip, the sentence that
   * reads what the pilot's hand just did, and the block for when no bar
   * moves. `view` is input.js's stickCheckView. The block is rebuilt only
   * when what it depends on changes, because it is paragraphs, and the
   * strip moves in place for the reason setCalAxes gives.
   */
  setStickHelp(view) {
    if (!this.stickAxes || !view) {
      return;
    }
    const how = {
      calibrated: 'read through your calibration',
      standard: 'read as a standard gamepad',
    }[view.map] || (view.guess === 'firefox'
      ? 'read the way Firefox lays out a radio'
      : 'read by the built in guess of a radio\'s channel order');
    Ui.text(this.stickPad, view.pad
      ? `${view.pad}: ${view.axisCount} ${view.axisCount === 1 ? 'axis' : 'axes'}, ${how}.`
      : 'No radio or gamepad.');
    this.stickAxisCells = paintAxisStrip(this.stickAxes, this.stickAxisCells, view.axes || [], true);
    Ui.text(this.stickSay, stickSay(view, this.stickPlatform, this.stickBrowser));
    const key = `${this.stickPlatform}|${this.stickBrowser}|${view.fourAxes ? view.axisCount : ''}`;
    if (key !== this.stickHelpKey) {
      this.stickHelpKey = key;
      const help = platformHelp(this.stickPlatform, this.stickBrowser, {
        fourAxes: view.fourAxes,
        axisCount: view.axisCount,
      });
      this.stickSteps.textContent = '';
      this.stickSteps.append(el('h3', 'stickhelp-steps-title', help.title));
      for (const line of help.lines) {
        this.stickSteps.append(el('p', null, line));
      }
    }
  }

  setCalibration(view) {
    if (!this.calPrompt) {
      return;
    }
    if (!view) {
      this.calCanSave = false;
      this.calCanSkip = false;
      if (this.calSaveBtn) {
        this.calSaveBtn.disabled = true;
      }
      if (this.calSkipBtn) {
        this.calSkipBtn.hidden = true;
      }
      this.calCanZeroThrottle = false;
      if (this.calZeroBtn) {
        this.calZeroBtn.hidden = true;
      }
      this.calCanReverse = false;
      this.calMoving = null;
      this.calOnConfirm = false;
      if (this.calRevBtn) {
        this.calRevBtn.hidden = true;
      }
      if (this.calModeBtn) {
        this.calModeBtn.hidden = true;
      }
      return;
    }
    const n = view.stepIndex + 1;
    this.calKicker.textContent = `Step ${n} of ${view.stepCount}, ${view.title}`;
    this.calPrompt.textContent = view.prompt;
    this.calHint.textContent = view.hint;
    this.calCanSave = Boolean(view.canSave);
    if (this.calSaveBtn) {
      this.calSaveBtn.disabled = !view.canSave;
    }
    this.calCanSkip = Boolean(view.canSkip);
    if (this.calSkipBtn) {
      this.calSkipBtn.hidden = !view.canSkip;
    }
    this.calCanZeroThrottle = Boolean(view.canZeroThrottle);
    if (this.calZeroBtn) {
      this.calZeroBtn.hidden = !view.canZeroThrottle;
    }
    this.calCanReverse = Boolean(view.canReverse);
    this.calMoving = view.moving || null;
    this.calOnConfirm = view.step === 'confirm';
    if (this.calRevBtn) {
      this.calRevBtn.hidden = !view.canReverse;
      if (view.canReverse) {
        /* Named, and it says which way it is going: a pilot who has already
         * pressed it once needs to know this puts it back. */
        const on = view.reverse && view.reverse[view.moving];
        Ui.text(this.calRevBtn, `${on ? 'Un-reverse' : 'Reverse'} ${view.moving}`);
      }
    }
    if (this.calModeBtn) {
      this.calModeBtn.hidden = !this.calOnConfirm;
      Ui.text(this.calModeBtn, `Stick mode ${normaliseStickMode(this.settings.stickMode)}`);
    }
    const ch = view.channels || { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    placeSticks(this.calStickLeft, this.calStickRight, ch, this.settings.stickMode);
    this.setCalAxes(view.axes || []);
    /* The ORDER is input.js's CAL_STEPS, imported rather than re-typed:
     * this list used to restate it, so a step added to the calibration
     * would have run without ever appearing in the list beside it. Only the
     * wording is the UI's business. */
    this.calList.textContent = '';
    /* The steps this run actually asked for, which is one longer for a
     * radio with no buttons. Falling back to the constant keeps the list
     * drawn if a view arrives without one. */
    const steps = (view && view.steps && view.steps.length) ? view.steps : CAL_STEPS;
    steps.forEach((id, i) => {
      const li = el('li', null, CAL_LABELS[id] ?? id);
      if (id === view.step) {
        li.className = 'on';
      } else if (i < view.stepIndex) {
        li.className = 'done';
      }
      this.calList.append(li);
    });
  }

  /*
   * The pilot's stick mode, applied to everything on screen that DRAWS or
   * NAMES a pair of sticks. The channels themselves are the input layer's
   * job; this is the captions, which are not constants any more.
   *
   * Called from main.js's applySettings, so it runs at boot and on every
   * change, which is the same hook the camera and the render scale use.
   */
  setStickMode(mode) {
    const m = normaliseStickMode(mode);
    this.settings.stickMode = m;
    /* applySettings calls this on EVERY settings write, and renderHowto
     * below rebuilds a screen's rows. Same guard as input.setStickMode. */
    if (m === this.stickModeDrawn) {
      return;
    }
    this.stickModeDrawn = m;
    const caps = [
      [this.osdStickLeft, this.osdStickRight],
      [this.howtoStickLeft, this.howtoStickRight],
      [this.calStickLeft, this.calStickRight],
    ];
    for (const [l, r] of caps) {
      if (l && l.cap) {
        Ui.text(l.cap, stickCaption(m, 'left'));
      }
      if (r && r.cap) {
        Ui.text(r.cap, stickCaption(m, 'right'));
      }
    }
    /* The how-to screen's prose names the sticks too, and it is built from
     * a table rather than from the DOM, so it has to be asked again. */
    if (this.howtoKeys) {
      this.renderHowto();
    }
  }

  /*
   * The next stick mode round, for the key and the button on the check
   * step. writeSettings is the same door the Settings row uses, so the
   * keyboard, the thumb sticks, every drawn gimbal and the stored setting
   * all move together and none of it is duplicated here.
   */
  cycleStickMode() {
    const at = STICK_MODES.indexOf(normaliseStickMode(this.settings.stickMode));
    const next = STICK_MODES[(at + 1) % STICK_MODES.length];
    this.settings.stickMode = next;
    this.writeSettings();
    return next;
  }

  setPadInfo(info) {
    const was = padTroubleItem(this.padInfo, this.stickPlatform);
    const wasRestart = (this.padInfo && this.padInfo.restart) || null;
    const wasCapturing = Boolean(this.padInfo && this.padInfo.restartCapturing);
    this.padInfo = info || { count: 0, using: 'Keyboard' };
    /*
     * A TROUBLE ROW THAT APPEARS MID SESSION HAS TO ASK FOR THE PAINT.
     *
     * The row is part of the title's item list, and an item list only
     * becomes DOM in renderMenu. Nothing else on the title changes when a
     * radio's story changes, so a row that turns up later than the last
     * render waits for the pilot to leave the screen and come back, which
     * is a warning nobody is going to see.
     *
     * This was survivable while every trouble row was settled by the time
     * the title first painted: a pad with no buttons reports none on the
     * first poll, and a parked throttle is parked on the first poll too.
     * The no-yaw row is not like that. It is decided in the middle of a
     * session, the first time somebody reaches for a stick that is not
     * where the guess says it is. See noteGuessOrder in input.js.
     *
     * Compared on the label rather than on the info, because the info moves
     * every frame (the pad roster, the name) and the row is what is being
     * painted. Unchanged label, no work.
     */
    const now = padTroubleItem(this.padInfo, this.stickPlatform);
    const label = (r) => (r ? r.label : '');
    /* The pause menu carries the row too, and a dead stick is decided in
     * flight, so the pause is usually the first screen to see it. See the
     * paused list in buildItems. */
    if ((this.screen === 'title' || this.screen === 'paused') && label(was) !== label(now)) {
      this.renderMenu();
    }
    /* The same for the restart switch row in Settings, which changes when
     * a flip lands rather than when anything is pressed on the page. */
    if (this.screen === 'pilot' && (wasRestart !== (this.padInfo.restart || null)
      || wasCapturing !== Boolean(this.padInfo.restartCapturing))) {
      this.renderMenu();
    }
  }

  setPadPick(view) {
    if (!this.padPrompt) {
      return;
    }
    if (!view) {
      this.padCardNodes = new Map();
      if (this.padCards) {
        this.padCards.textContent = '';
      }
      return;
    }
    this.padKicker.textContent = view.pads.length > 1
      ? `${view.pads.length} joysticks plugged in`
      : (view.pads.length === 1 ? 'One joystick plugged in' : 'No joystick');
    this.padPrompt.textContent = view.prompt;
    /*
     * WHAT THE DRAWN STICKS ARE, said beside them. They are the page's
     * reading of the device, through the pilot's calibration or through
     * the built in guess, and a guess that is wrong for this radio looks
     * wrong here: bug-9983ae9a filed that picture as a fault. Said here
     * rather than in src/input because it names a room, and the room's
     * name belongs to this file.
     */
    const read = !view.pads.length
      ? ''
      : (view.mapKnown
        ? ' The sticks drawn follow your saved calibration.'
        : ` The sticks drawn are how this page reads it now, which is a guess until you calibrate. If they do not follow your hands, choose it anyway and run Calibrate sticks in ${SCREEN_TITLES.pilot}.`);
    this.padHint.textContent = `${view.hint}${read}`;
    if (this.padYesBtn) {
      this.padYesBtn.disabled = !view.canAccept;
    }
    if (this.padNoBtn) {
      this.padNoBtn.disabled = !view.canAccept;
    }
    if (this.padSkipBtn) {
      this.padSkipBtn.textContent = view.skipLabel;
    }
    this.padPickPhase = view.phase;
    this.padPickReason = view.reason;
    const keys = view.pads.map((p) => p.key);
    const have = this.padCardNodes || new Map();
    const same = keys.length === have.size && keys.every((k) => have.has(k));
    if (!same) {
      this.padCards.textContent = '';
      this.padCardNodes = new Map();
      for (const pad of view.pads) {
        const node = makePadCard();
        this.padCards.append(node.card);
        this.padCardNodes.set(pad.key, node);
      }
    }
    for (const pad of view.pads) {
      const node = this.padCardNodes.get(pad.key);
      if (!node) {
        continue;
      }
      node.title.textContent = pad.title;
      node.name.textContent = pad.name;
      node.status.textContent = pad.chosen
        ? 'Use this one?'
        : (pad.live ? 'Moving' : 'Resting');
      node.card.classList.toggle('is-live', pad.live && !pad.chosen);
      node.card.classList.toggle('is-on', pad.chosen);
      /* The same plates, captions and placement as the flight overlay and
       * the calibrate screen, so a stick reads the same everywhere it is
       * drawn. See the sticks field in padPickView. */
      const mode = this.settings.stickMode;
      Ui.text(node.left.cap, stickCaption(mode, 'left'));
      Ui.text(node.right.cap, stickCaption(mode, 'right'));
      placeSticks(node.left, node.right, pad.sticks || {
        roll: 0, pitch: 0, yaw: 0, throttle: 0,
      }, mode);
    }
  }

  persistSettings() {
    saveSettings(this.settings);
  }

  /* Auto graphics' resolution factor as it stands, for the Graphics row's
   * note. Repainted only where that row is showing. */
  setAutoScale(f) {
    if (this.autoScaleNow === f) {
      return;
    }
    this.autoScaleNow = f;
    if (this.screen === 'pilot') {
      this.renderMenu();
    }
  }

  setGpuInfo(info) {
    this.gpuInfo = info || null;
    if (this.screen === 'pilot' || this.screen === 'advanced') {
      this.renderMenu();
    }
  }

  /*
   * How the sticks actually reach the flight controller, as a function
   * rather than as a value, and that is the whole point of it.
   *
   * setGpuInfo above hands over a fact settled at boot. The stick path is
   * not one: padHz is re-counted every 500 ms, the source changes the moment
   * a radio is plugged in or a thumb lands on glass, and the stick
   * resolution is unknown until a stick has moved. A snapshot taken at boot
   * would record "the keyboard, 0 Hz" for every pilot, which is worse than
   * recording nothing because it looks like an answer. main.js registers a
   * probe and bugSnapshot calls it at the moment the report is written.
   */
  setStickProbe(fn) {
    this.stickProbe = typeof fn === 'function' ? fn : null;
  }

  /* What the frames cost while flying and what the browser gave the canvas,
   * read when a report is written, for the same reason the stick path is:
   * see setPerfProbe's caller in main.js. */
  setPerfProbe(fn) {
    this.perfProbe = typeof fn === 'function' ? fn : null;
  }

  /* The craft's state for a report: see bugSnapshot, and main.js where it is read. */
  setCraftProbe(fn) {
    this.craftProbe = typeof fn === 'function' ? fn : null;
  }

  /* The flight the end of flight question is about, as a function, because it
   * is the shell's to know and it changes every frame: see main.js, TuneLog. */
  setTuneProbe(fn) {
    this.tuneProbe = typeof fn === 'function' ? fn : null;
  }

  /*
   * Which of flight feel tuning's two sliders the loaded module can answer.
   * A module without the export would take the slider and ignore it, so the
   * row is not drawn: main.js says what it has once it has loaded, and an
   * older dist/sim.wasm simply shows fewer sliders.
   */
  setTuneCaps(caps) {
    this.tuneCaps = { air: Boolean(caps && caps.air), kv: Boolean(caps && caps.kv) };
    const tune = this.osdAir && this.osdAir.tune;
    if (tune) {
      tune.body.textContent = tuneCardText(this.tuneCaps);
    }
    this.paintAir();
    if (this.screen === 'quad' || this.screen === 'paused') {
      this.renderMenu();
    }
  }

  /* Input to screen and the facts beside it, for the Settings row: see
   * latencyItem. A function for the same reason the stick probe is one. */
  setLatencyProbe(fn) {
    this.latencyProbe = typeof fn === 'function' ? fn : null;
  }

  /*
   * ONE ROW ON THE RATES SCREEN SAYING HOW YOUR STICKS REACH THE QUAD.
   *
   * src/main.js explains at length why the performance readout was taken out
   * of the flying corner, and that reasoning stands: those were developer
   * numbers in front of somebody trying to fly. This is not that corner.
   * The Rates screen is where a pilot goes when the feel is wrong, on
   * purpose, having stopped flying, and two of the five feel reports that
   * prompted this row were filed from a pilot who had gone there to fix
   * exactly this and had nothing to read.
   *
   * What it can honestly say differs by transducer, so it says a different
   * thing for each rather than one number for all three. The keyboard's
   * ceiling and the thumb stick's spring are facts about this shell and can
   * be stated flatly. A radio's refresh rate is a fact about the browser and
   * the driver and can only be measured, which is what padHz is.
   *
   * Returns [] rather than a placeholder when there is no probe: a row
   * saying nothing is worse than no row, and the harness mounts this screen
   * without main.js having registered one.
   */
  stickPathRow() {
    const st = this.stickProbe ? this.stickProbe() : null;
    if (!st) {
      return [];
    }
    if (String(st.source).includes('touch')) {
      return [{
        label: 'Stick path',
        value: 'Thumb sticks',
        info: true,
        note: 'A thumb on glass has about a quarter of a gimbal\'s travel and nothing centring it, so the numbers below are seeded gentler than the radio defaults. Roll, pitch and yaw spring back when you lift off; throttle stays where you left it, the way a radio\'s does.',
      }];
    }
    if (String(st.source).includes('keyboard')) {
      return [{
        label: 'Stick path',
        value: 'Keyboard',
        info: true,
        note: 'A key is not a stick. Holding one ramps the stick to 34 percent and stays there until about three quarters of a second, then stretches to full at one and a quarter. So the rates below are the rates a RADIO would fly: a tap reaches roughly a third of them, which is why keyboard flight feels firmer and slower to bite than the numbers say. A gamepad or a radio in USB joystick mode gets the whole curve. And a key race starts in Angle, which ignores this curve: Keyboard races under Quad, or M in flight, makes it Acro.',
      }];
    }
    /*
     * A radio. padHz is how often the browser refreshed the Gamepad object,
     * and it is read against the frame rate rather than against 250: a radio
     * that genuinely reports at 100 Hz is a radio, while a padHz sitting on
     * top of the frame rate is the browser handing over one stick value per
     * rendered frame whatever the radio does. Only the second is a fault,
     * and only WebHID fixes it, so only the second gets a warning.
     */
    const padHz = Number(st.padHz) || 0;
    const fps = Number(st.fps) || 0;
    const tracksFrames = padHz > 0 && fps > 0
      && Math.abs(padHz - fps) <= Math.max(6, fps * 0.15);
    const levels = Number(st.stickLevels) || 0;
    const bits = [];
    if (padHz <= 0) {
      bits.push('Waiting for the radio to report. Move a stick.');
    } else {
      bits.push(`Your radio is refreshing ${padHz} times a second. Betaflight is flown on a fixed 250 Hz frame grid either way, so this is how fresh the value on each of those frames is.`);
    }
    if (tracksFrames) {
      bits.push(`That is your frame rate, ${fps} per second, which means this browser is only reading the radio once per drawn frame. Feedforward works on the CHANGE between frames, so a stick that steps once a frame is felt as a series of nudges rather than a push. Nothing in the rates below fixes that.`);
    }
    if (levels > 0 && levels < 512) {
      bits.push(`This radio reports about ${levels} steps across a stick's full travel, which is coarse enough to feel at high rates. A radio with a finer USB report, or lower rates, both soften it.`);
    }
    return [{
      label: 'Stick path',
      value: padHz > 0 ? `Radio, ${padHz} Hz` : 'Radio',
      info: true,
      rowClass: tracksFrames ? 'row-warn' : undefined,
      note: bits.join(' '),
    }];
  }

  /* Cursor movement and selection, shared by keyboard and sticks. Each
   * lands a small click through onUiSound, and the sound is made HERE, in
   * the one place each gesture funnels through, so the keyboard, the
   * sticks and the mouse all sound the same. */
  /* A group heading is in the list so it renders in the right place, but it
   * is not somewhere the cursor can land. */
  isStop(it) {
    return Boolean(it) && !it.section;
  }

  /*
   * A row the ARROW KEYS step over, and nothing else does.
   *
   * The flight controller renders 542 keys this build does not implement,
   * and every one of them was an arrow stop: the Configuration tab had 141
   * stops and 3 things you could change. Making them non-stops looks like
   * the fix and is not, because the help column is `items[cursor].note` and
   * each of those rows carries a sentence saying which Betaflight subsystem
   * is missing and why. A row the cursor cannot hold is a row whose
   * explanation is gone, so that change would have deleted 542 explanations
   * to save 138 keypresses.
   *
   * So skipping is a property of the TRAVEL, not of the row. Up and Down
   * step over these; PageUp, PageDown, Home, End and a mouse click all
   * still land on them, and the help still speaks.
   */
  isSkip(it) {
    return Boolean(it) && Boolean(it.skip);
  }

  /* The rows Up and Down will actually stop on. Falls back to every stop
   * when a screen is nothing but skipped rows, because a tab with no live
   * key at all must still be walkable rather than inert. */
  arrowStops(items) {
    const walkable = [];
    for (let i = 0; i < items.length; i += 1) {
      if (this.isStop(items[i]) && !this.isSkip(items[i])) {
        walkable.push(i);
      }
    }
    if (walkable.length) {
      return walkable;
    }
    const all = [];
    for (let i = 0; i < items.length; i += 1) {
      if (this.isStop(items[i])) {
        all.push(i);
      }
    }
    return all;
  }

  /* The first row the cursor may land on, at or after `from`. The offset is
   * what lets a chosen course card put the cursor on its own list rather
   * than back on the first card in the strip. */
  firstStop(items, from = 0) {
    for (let i = Math.max(0, from); i < items.length; i += 1) {
      if (this.isStop(items[i])) {
        return i;
      }
    }
    const i = items.findIndex((it) => this.isStop(it));
    return i < 0 ? 0 : i;
  }

  /*
   * THE ROW GRAMMAR. Four kinds of row, and the kind decides what Enter does.
   *
   * A row could navigate, edit a value in place, fire an irreversible action,
   * or leave for another tab, and all four looked identical and all four
   * answered Enter. Driving the shipped build, one press one row below where
   * it was meant silently changed the flight tune, and the only signal that
   * row was different from the one above it was a six pixel caret.
   *
   *   value       has an adjust or a picker. Left and Right change it.
   *   navigation  opens another screen. A chevron says so.
   *   link        leaves for a named tab. An arrow glyph says so.
   *   action      does a thing. Everything else.
   */
  /* The module predicate, reachable from the shell check, so the check and
   * the renderer cannot disagree about which rows draw as a strip. */
  fitsAsSegments(it) {
    return fitsAsSegments(it);
  }

  rowKind(it) {
    if (!it) {
      return 'action';
    }
    if (it.adjust || it.options || it.spec || it.num) {
      return 'value';
    }
    if (it.action && LINK_ACTIONS.has(it.action)) {
      return 'link';
    }
    if (it.action && SCREEN_ACTIONS.has(it.action)) {
      return 'navigation';
    }
    return 'action';
  }

  /* The one action the command bar's button fires. A screen declares it with
   * `primary: true`, which is the flag the mint row already used, so this
   * reads the intent that was always there. */
  primaryItem() {
    return this.items().find((it) => it && it.primary && !it.disabled) || null;
  }

  /*
   * Where the support link sits.
   *
   * The title hides the top bar, so the link sits in the brand, under the
   * wordmark, which is the one place on that screen a visitor reads. The
   * bench hides the top bar too, so there it rides the command bar. Every
   * other menu puts it in the top bar, after the breadcrumb. It is not a
   * menu row: the lists are about the flight.
   * Flight hides both bars, and the link with them. A support control over
   * the FPV picture is the wrong layer.
   */
  placePatreon() {
    const a = this.patreonLink;
    if (!a) {
      return;
    }
    /* The title and About only: see PATREON_SCREENS. About also has it as
     * a row, Support, with the note saying what it pays for. */
    if (!PATREON_SCREENS.has(this.screen)) {
      a.hidden = true;
      return;
    }
    a.hidden = false;
    if (this.screen === 'title') {
      if (a.parentNode !== this.patreonSlot) {
        this.patreonSlot.append(a);
      }
      return;
    }
    if (a.parentNode !== this.frameTop || a.nextSibling !== this.frameGap) {
      this.frameTop.insertBefore(a, this.frameGap);
    }
  }

  /*
   * The bars, repainted whenever the screen or the cursor changes.
   *
   * The legend prints what the CURRENT INPUT DEVICE can do, not both at once:
   * showing keyboard and pad prompts side by side is twice the noise and
   * half the answer. lastInput is written by handleKey and pollPad.
   */
  syncFrame() {
    const onFlight = this.screen === 'flight';
    const bench = this.screen === 'fc';
    /* The title already IS the branding: a wordmark, a tagline and the
     * existing chip cluster. A breadcrumb reading WEBFPV under a wordmark
     * reading WEBFPV is a second answer to a question nobody asked, and its
     * context chips land on top of the bug chip and the music dock. So the
     * top bar sits out the one screen that does not need it. */
    const titleScreen = this.screen === 'title';
    /* The bench is a tool inside its own frame and paints its own chrome in
     * Betaflight yellow. A breadcrumb over the top of that is decoration; the
     * legend is not, so the top bar goes and the bottom one stays. */
    this.frameTop.hidden = onFlight || bench || titleScreen;
    this.frameBot.hidden = onFlight;
    /*
     * And the floating chips move out from under it. The bug chip is
     * pinned to the top right and so is the bar's own context cluster, so
     * on every screen that has a bar the chip sat on top of the one thing
     * a pilot is most likely to want to read there: measured at 1600 and
     * at 1280, it covered 125 px of "Flying 2022 AU Nationals". A width
     * media query used to do this below 860 px, which is not the
     * condition. The condition is whether the bar is there.
     */
    this.root.classList.toggle('bar-shown', !this.frameTop.hidden);
    this.placePatreon();
    if (onFlight) {
      this.root.style.setProperty('--bar-top', '0px');
      this.root.style.setProperty('--bar-bot', '0px');
      return;
    }
    this.root.style.setProperty('--bar-top', bench ? '0px' : '48px');
    this.root.style.setProperty('--bar-bot', '52px');

    this.crumb.textContent = '';
    const trail = this.crumbTrail();
    trail.forEach((part, i) => {
      if (i) {
        this.crumb.append(el('span', 'crumb-sep', '/'));
      }
      this.crumb.append(el('span', i === trail.length - 1 ? 'crumb-here' : 'crumb-up', part));
    });

    this.frameContext.textContent = '';
    for (const chip of this.contextChips()) {
      const node = el('span', 'frame-chip');
      node.append(el('span', 'frame-chip-key', chip.label), el('b', null, chip.value));
      this.frameContext.append(node);
    }

    this.frameLegend.textContent = '';
    for (const hint of this.legendFor()) {
      /* A legend entry that carries an action is a BUTTON, not a label: the
       * key it names has to be pressable by whoever is not holding a
       * keyboard. The rest stay <i>, because a legend that looks entirely
       * clickable and mostly is not is worse than one that is not. */
      const i = hint.action ? btn('legend-act', '') : el('i', null);
      for (const k of hint.keys) {
        i.append(el('span', this.lastInput === 'pad' ? 'kbd pad' : 'kbd', k));
      }
      i.append(document.createTextNode(` ${hint.text}`));
      if (hint.action) {
        i.addEventListener('click', () => this.act(hint.action));
      }
      this.frameLegend.append(i);
    }

    this.syncPrimaryButton();
    /* Rows are drawn after the bars on a change of screen, so look again
     * once they are. */
    if (!this.primaryFrame) {
      this.primaryFrame = requestAnimationFrame(() => {
        this.primaryFrame = 0;
        this.syncPrimaryButton();
      });
    }
  }

  /*
   * THE COMMAND BAR'S BUTTON REPEATS THE SCREEN'S PRIMARY ROW (MENUS-PLAN.md
   * 2.6), and only where repeating it helps. On touch it is always there:
   * it is where the thumb is. With a mouse or keys it is there while the row
   * itself is out of sight, which is the case it was made for (a chosen
   * track's Fly it under thirty cards), and gone while the row is on screen,
   * where it was the same word twice, one of them in the corner.
   */
  syncPrimaryButton() {
    if (!this.framePrimary) {
      return;
    }
    const primary = this.screen === 'flight' ? null : this.primaryItem();
    let show = Boolean(primary);
    if (show && !touchWanted()) {
      const node = this.screens && this.screens[this.screen]
        ? this.screens[this.screen].querySelector('.row-primary')
        : null;
      show = !node || !this.rowInSight(node);
    }
    if (this.framePrimary.hidden === show) {
      this.framePrimary.hidden = !show;
    }
    if (primary && this.framePrimary.textContent !== primary.label) {
      this.framePrimary.textContent = primary.label;
    }
  }

  /* Whether a row is wholly in sight: inside the window less both bars, and
   * inside its own list's window when the list scrolls. */
  rowInSight(node) {
    const r = node.getBoundingClientRect();
    if (!r.height) {
      return false;
    }
    const bars = getComputedStyle(this.root);
    let top = parseFloat(bars.getPropertyValue('--bar-top')) || 0;
    let bottom = window.innerHeight - (parseFloat(bars.getPropertyValue('--bar-bot')) || 0);
    const box = node.closest('.menu-scroll');
    if (box) {
      const b = box.getBoundingClientRect();
      top = Math.max(top, b.top);
      bottom = Math.min(bottom, b.bottom);
    }
    return r.top >= top - 1 && r.bottom <= bottom + 1;
  }

  /*
   * THE CRUMB NAMES WHERE ESCAPE GOES. It was fixed text per screen, so Rates
   * said Settings / Rates when it had been opened from Quad or the pause
   * menu and Escape went there instead (MENUS-PLAN.md 1.37). The first part
   * is read off the same pointers back() reads, in the same order; CRUMBS is
   * the trail when the room was reached from its home.
   */
  crumbTrail() {
    const here = SCREEN_TITLES[this.screen] || this.screen;
    let from = null;
    if (this.screen === 'rates' && this.ratesFrom) {
      from = this.ratesFrom;
    } else if (this.screen === 'pids' && this.pidsFrom) {
      from = this.pidsFrom;
    } else if (this.returnTo === 'paused' && !['paused', 'results', 'title', 'flight'].includes(this.screen)) {
      from = 'paused';
    } else if (this.roomFrom && this.roomFrom !== this.screen) {
      from = this.roomFrom;
    }
    if (from && SCREEN_TITLES[from] && from !== 'title') {
      return [SCREEN_TITLES[from], here];
    }
    return CRUMBS[this.screen] || [here];
  }

  /* What is loaded, in the top right, so no screen has to be left to find out
   * what the next run will actually fly. */
  contextChips() {
    const out = [];
    const flying = FLYING_CHIP_SCREENS.has(this.screen);
    const pilot = PILOT_CHIP_SCREENS.has(this.screen);
    if (!flying && !pilot) {
      return out;
    }
    /* The course only when the seat is the track world, as on the title's
     * Track row. A race track stays seated underneath a freestyle world, so
     * without the guard a pilot in Your map read "Flying" and the name of a
     * track they were not in. */
    const m = MAPS.find((x) => x.id === this.settings.map) ?? MAPS[0];
    const seat = m.id === 'custom' ? activeCourseSummary() : null;
    /* And a map from the board by its own name, not as Your map. */
    const shared = m.id === 'built' && this.sharedMap ? this.sharedMap.name : '';
    /* Not in the Maps room while the seat is still the race track: a pilot
     * choosing a map read "Flying" and the name of a race track there
     * (MENUS-PLAN.md 1.17). */
    if (flying && !(this.screen === 'freestyle' && m.id === 'custom')) {
      out.push({ label: 'Flying', value: seat && seat.name ? seat.name : (shared || m.name) });
    }
    const name = pilot ? readPilotName() : '';
    if (name) {
      out.push({ label: 'Pilot', value: name });
    }
    return out;
  }

  /* The keys this screen answers. Kept short: a legend nobody reads is a
   * legend that cost vertical space for nothing. */
  legendFor() {
    const pad = this.lastInput === 'pad';
    /*
     * A THIRD VOICE, FOR THE PHONE.
     *
     * The bar had exactly two: a pad voice and a keyboard voice, chosen by
     * whichever spoke last. A phone has neither, so a touch visitor was
     * told to press arrow keys and Enter on a screen with no keys, on the
     * first thing they see. The shell already knows it is on a touch screen,
     * because that is what mounts the thumb sticks.
     *
     * lastInput still wins when it is set: someone with a keyboard attached
     * to a tablet gets the keyboard's words the moment they use it.
     */
    const touch = this.lastInput === 'none'
      && typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
    if (touch) {
      const out = [];
      out.push({ keys: [], text: this.cardScreen() ? 'Tap a card' : 'Tap a row' });
      if (this.screen !== 'title') {
        out.push({ keys: [], text: 'Back', action: 'back' });
      }
      /* The title's own way out is the last row of its menu now, where a
       * thumb can find it without reading the legend. See titleItems. */
      return out;
    }
    const out = [];
    if (pad && STICKS_BUSY[this.screen]) {
      /* The sticks are busy here, so the legend says with what rather than
       * promising Move and Adjust (MENUS-PLAN.md 2.9). The buttons below
       * still choose and go back. */
      out.push({ keys: [], text: STICKS_BUSY[this.screen] });
    } else if (this.cardScreen()) {
      /* Pitch, not roll. pollPad walks a card screen with the pitch axis and
       * treats roll right as choose and roll left as back, which is what the
       * Race room's own hint line has always said; this legend claimed Roll
       * and was simply wrong. */
      out.push({ keys: pad ? ['Pitch'] : ['\u2190', '\u2192'], text: 'Move' });
    } else {
      out.push({ keys: pad ? ['Pitch'] : ['\u2191', '\u2193'], text: 'Move' });
      const it = this.items()[this.cursor];
      /* Not on the two screens whose roll poses the quad: see posesQuad. */
      if (this.rowKind(it) === 'value' && !(pad && posesQuad(this))) {
        out.push({ keys: pad ? ['Roll'] : ['\u2190', '\u2192'], text: 'Adjust' });
      }
    }
    out.push({ keys: [pad ? 'A' : 'Enter'], text: 'Choose' });
    /* The Race room's shortcut, and the one entry on this bar a mouse makes
     * rather than a key: a double click on a track flies it (flyCard). Not
     * in the radio's voice, which has no pointer to double click with, nor
     * the phone's, where a double tap is the browser's to interpret. */
    if (this.screen === 'courses' && !pad) {
      out.push({ keys: ['Double click'], text: 'Fly' });
    }
    /*
     * BACK IS A BUTTON ON THE BAR, for every voice (MENUS-PLAN.md 1.12).
     * The bar is the one thing on every screen that never scrolls, so a
     * pointer can always leave from it: How to fly's own Back row was under
     * the window at 1280 by 720, and the bench's is behind its tabs. The
     * keys it names still work as they always did.
     */
    if (this.screen !== 'title') {
      out.push({ keys: [pad ? 'B' : 'Esc'], text: 'Back', action: 'back' });
    } else if (!this.onGate()) {
      /* NOT ON THE GATE. The gate is the root and Escape does nothing
       * there, so offering the key is a joke. onGate() is the one
       * definition of "is the gate up", and this asks it rather than
       * reading the two flags itself: `this.mode` alone was the proxy once
       * and it stopped being one the moment a link could answer the mode
       * without answering the aircraft. */
      /*
       * The title answers Escape: it reopens the gate, which is the only
       * way to change mode or aircraft without reloading. It is named
       * rather than called Back, because Back on the front page reads like
       * it leaves the game, and because a pilot looking for the other mode
       * or the other machine is looking for the screen that offers both.
       *
       * THIS IS THE KEY HINT AND NOTHING ELSE NOW. It was a hit area as
       * well, because for a while it was the only route: the menu had no
       * room for an eleventh row and a pilot who answered Freestyle could
       * reach the town and could not reach a race track again. A clickable
       * word in the row that reads "Move  Choose  Esc" is a key legend
       * everywhere else in the shell, so nobody could tell it was a
       * button, which is how it was reported a second time. The route is
       * the last row of the menu now and this is back to being what it
       * looks like.
       */
      out.push({ keys: [pad ? 'B' : 'Esc'], text: this.gateLabel() });
    }
    return out;
  }

  /*
   * Where the cursor lands on arriving at a screen: the row it was on last
   * time if that row is still there and still a stop, else the first stop.
   * Matching by label rather than by index is what makes it survive a list
   * that grew or shrank while the pilot was elsewhere.
   */
  restoreCursor() {
    const items = this.items();
    const want = this.cursorMemory[this.screen];
    if (want) {
      const i = items.findIndex((it) => it && it.id === want && this.isStop(it));
      if (i >= 0) {
        return i;
      }
    }
    /*
     * QUAD OPENS ON A DOOR, NOT ON THE AIRCRAFT (MENUS-PLAN.md 2.9). Its
     * first row is a two way switch, and a choose on a switch flips it, so
     * the first press a radio pilot made in the room swapped the aircraft
     * and the world under them. The first row that opens a screen is the
     * first stop instead; the switch is one row up.
     */
    if (this.screen === 'quad') {
      const door = items.findIndex((it) => it && this.isStop(it) && this.rowKind(it) === 'navigation');
      if (door >= 0) {
        return door;
      }
    }
    /*
     * A FIRST VISIT OPENS ON THE ROW THE SCREEN EXISTS FOR.
     *
     * `primary` already marks that row on the four screens that have one:
     * Fly on the title and on the launch card, Fly this track on standings,
     * Resume on pause. Without this the cursor went to the first stop, and
     * on the launch card the first stop is Radio link, which is a dropdown.
     * So a pilot who read "Enter flies it" on the card, pressed Enter, and
     * got a list of ELRS packet rates was doing exactly what the screen told
     * them to. The rows above the primary one are settings for the run; the
     * primary one is the run.
     *
     * Only when nothing is remembered. Someone who walked down to Radio link
     * last time and came back still lands where they left off.
     */
    const p = items.findIndex((it) => it && it.primary && this.isStop(it));
    if (p >= 0) {
      return p;
    }
    /*
     * The world cards open on the world that is seated, for the same
     * reason. The first stop is the town's card, so a pilot seated in Your
     * map met the cursor on the town, the tag "Flying now" on the other
     * card, and the town's note beside a world they were not in.
     */
    /* A map from the board is seated in the built world, and its own card
     * is the one that says Flying now, so that is where the cursor opens
     * once the list is there. */
    const shared = this.settings.map === 'built' && this.sharedMap ? this.sharedMap.id : null;
    const onBoard = shared
      ? items.findIndex((it) => it && it.boardMap && it.boardMap.id === shared && this.isStop(it))
      : -1;
    if (onBoard >= 0) {
      return onBoard;
    }
    const seated = items.findIndex((it) => it && it.map && it.map.id === this.settings.map
      && !(shared && it.map.id === 'built') && this.isStop(it));
    if (seated >= 0) {
      return seated;
    }
    return this.firstStop(items);
  }

  move(dir) {
    const items = this.items();
    const n = items.length;
    if (!n) {
      return;
    }
    /*
     * THE TRACKS ROOM IS WALKED IN THE ORDER IT IS DRAWN. The open sheet
     * sits under its card's line of the grid, but its rows come after every
     * card in items(), so a plain step went from the chosen card to the
     * next card and from Fly it up to the last card on the page. In drawn
     * order the line's cards come first, then the sheet, then the cards
     * below it.
     */
    const drawn = this.drawnOrder(items);
    if (drawn) {
      const walk = new Set(this.arrowStops(items));
      const stops = drawn.filter((i) => walk.has(i));
      if (stops.length) {
        const at = stops.indexOf(this.cursor);
        this.setCursor(at < 0 ? stops[0] : stops[(at + dir + stops.length) % stops.length]);
        return;
      }
    }
    let next = (this.cursor + dir + n) % n;
    /* Step over headings and skipped rows. Bounded by n so a list of
     * nothing but headings cannot spin here. */
    /* A Set, because this runs inside a bounded loop over a list that is
     * 144 rows on the flight controller and is rebuilt on every keypress. */
    const walkable = new Set(this.arrowStops(items));
    const stopsHere = (i) => walkable.has(i);
    for (let guard = 0; guard < n && !stopsHere(next); guard += 1) {
      next = (next + dir + n) % n;
    }
    this.setCursor(next);
  }

  /* The Tracks room's indices in drawn order while a sheet is open, or
   * null. See move. */
  drawnOrder(items) {
    if (this.screen !== 'courses' || !this.cardSubject || !this.sheetAfterKey) {
      return null;
    }
    const cards = [];
    const rows = [];
    items.forEach((it, i) => {
      if (it.course) {
        cards.push(i);
      } else if (!it.map) {
        rows.push(i);
      }
    });
    const end = cards.findIndex((i) => courseCardKey(items[i]) === this.sheetAfterKey);
    if (end < 0) {
      return null;
    }
    return [...cards.slice(0, end + 1), ...rows, ...cards.slice(end + 1)];
  }

  /*
   * PageUp and PageDown. Travel by a screenful, and unlike the arrows they
   * land on skipped rows, which is what makes a greyed firmware key
   * readable without walking 138 of its neighbours.
   *
   * A page is the number of rows the scroller can show, so the movement
   * matches what the pilot sees rather than a constant somebody picked.
   */
  pageMove(dir) {
    const items = this.items();
    const stops = [];
    for (let i = 0; i < items.length; i += 1) {
      if (this.isStop(items[i])) {
        stops.push(i);
      }
    }
    if (!stops.length) {
      return;
    }
    const at = stops.indexOf(this.cursor);
    const from = at < 0 ? 0 : at;
    const next = Math.max(0, Math.min(stops.length - 1, from + dir * this.pageSize()));
    this.setCursor(stops[next]);
  }

  /* How many rows a page is. Measured off the live scroller so a short
   * window pages by less, and clamped so a collapsed or unmeasurable box
   * still moves a sensible distance rather than zero. */
  pageSize() {
    const scroll = this.menuScrollNode();
    const row = 44;
    const visible = scroll && scroll.clientHeight ? Math.floor(scroll.clientHeight / row) : 0;
    return Math.max(5, Math.min(25, visible || 10));
  }

  /* Home and End. Both land on any stop, skipped or not. */
  jumpEdge(dir) {
    const items = this.items();
    const stops = [];
    for (let i = 0; i < items.length; i += 1) {
      if (this.isStop(items[i])) {
        stops.push(i);
      }
    }
    if (!stops.length) {
      return;
    }
    this.setCursor(dir < 0 ? stops[0] : stops[stops.length - 1]);
  }

  /* The scrolling box for the screen the cursor is on, or null when the
   * screen has none. Used only for measurement. */
  menuScrollNode() {
    const host = this.screens && this.screens[this.screen];
    if (!host) {
      return null;
    }
    return host.querySelector('.menu-scroll') || host.querySelector('.menu');
  }

  adjust(dir) {
    const it = this.items()[this.cursor];
    if (it && it.adjust) {
      it.adjust(dir);
      this.writeSettings();
    }
  }

  /* `pointer` says a mouse or a finger pressed it, which only the course
   * cards distinguish: see the course branch below. */
  select(pointer = false) {
    const it = this.items()[this.cursor];
    if (!it) {
      return;
    }
    /* A heading is not a row. move() already never lands on one, but
     * setCursor is public and act() dereferences the action, so a cursor
     * put on a heading by anything else threw rather than doing nothing. */
    if (!this.isStop(it)) {
      return;
    }
    if (it.info) {
      return;
    }
    if (it.disabled) {
      if (this.onUiSound) {
        this.onUiSound('back');
      }
      return;
    }
    /* A typed row opens for typing. Stepping it with Enter would be the
     * old list row's behaviour and would put the caret nowhere, which is
     * the whole complaint this screen exists to answer. */
    if (it.num) {
      this.focusNumber(this.cursor);
      return;
    }
    /*
     * A SWITCH FLIPS ON ENTER. It is the one value row where that is the
     * idiom rather than the accident: one bit, visibly changed, and the
     * same key puts it back. A radio whose axes are held out of the menus
     * on this screen has nothing but select, so a switch that ignored
     * Enter would be a switch that radio could never throw.
     */
    if (it.sw) {
      if (it.flip) {
        it.flip();
        this.writeSettings();
      }
      return;
    }
    /*
     * EVERY OTHER VALUE ROW: Enter opens the picker, it does not step the
     * value.
     *
     * Enter used to call adjust(1) on any row with an adjust, which is how
     * one press one row below where it was meant silently changed a flight
     * tune from Betaflight default to Karate race 6S, with nothing
     * confirming it and nothing announcing it. Stepping a thirty item list
     * by one is not a thing anybody means to do; picking from it is. A row
     * with a list opens the list, and a row with no list, a stepper or a
     * typed number, keeps the arrows and does nothing on Enter, because
     * there is nothing to open and stepping it is what Left and Right are
     * already for.
     */
    /*
     * `pickOnly` OPTS A ROW OUT OF STEPPING ON ENTER, however short its list.
     *
     * The segmented branch below argues that stepping is safe because every
     * choice is on screen. That is an argument about VISIBILITY and it holds
     * for a row where the three positions are three equivalent answers. It
     * does not hold for a row that switches an unfinished feature on: the
     * Freestyle room draws no cards while there is one world, so Scoring is
     * its first row and the cursor OPENS on it, and the first affirmative
     * press in the room, Enter on a keyboard or roll right on a radio, was
     * stepping it from off to Free flight. A pilot who has not asked for the
     * scorer should not get it from the press they used to walk into a room.
     * See DEFAULTS.freestyleScoring.
     *
     * The list still opens, so the row stays reachable from a radio: roll
     * right opens it, pitch walks it, roll right again confirms. What is
     * gone is the one press that wrote a value nobody read out.
     */
    if (it.options && it.options.length && (it.pickOnly || !fitsAsSegments(it))) {
      this.openDropForCursor();
      return;
    }
    /*
     * A SEGMENTED ROW CYCLES ON ENTER, and that is safe for the reason the
     * long list is not: every choice is on screen, so a press moves between
     * things the pilot can already see, and one more press comes back
     * round. The tune row is the one that bit somebody, and it opts out by
     * hand with `pickOnly` rather than by being long: it is two labels at
     * most now and would otherwise segment, and stepping it re-inits the
     * module and costs the lap.
     *
     * It also has to work: a radio's axes are deliberately held out of the
     * menus on the title, Settings, Rates, PIDs and the bench, so on those
     * screens select is the only thing a pad has. A segmented row that
     * ignored Enter would be a row that radio could never change.
     */
    if (it.options && it.options.length) {
      this.adjust(1);
      return;
    }
    if (it.adjust || it.step) {
      /* Nothing to open and nothing to fire. Say so rather than silently
       * doing nothing, which reads as a dead key. */
      if (this.onUiSound) {
        this.onUiSound('back');
      }
      return;
    }
    /*
     * A course card is a thing to choose, not a button to press. Choosing one
     * names it and shows what can be done with it; the card's own action is
     * offered there as Fly it. Worlds are left alone: there is exactly one
     * thing to do with a world, so a list of one would be friction.
     */
    /* Always, not only when nothing is chosen yet: with one card's list open,
     * choosing a different card has to move to that card. Falling through
     * here would have flown it instead, which is the behaviour this whole
     * change exists to remove. */
    if (this.screen === 'courses' && it.course) {
      /* Build a track is a door, not a track: there is nothing to choose
       * between on it, so a sheet of one row would be friction. */
      if (it.course.kind === 'new') {
        if (this.onUiSound) {
          this.onUiSound('select');
        }
        this.act(it.action);
        return;
      }
      const key = courseCardKey(it);
      /* Where the card is now, so the sheet opening cannot move it out from
       * under the pointer: see keepCardStill. */
      const before = this.courseCardTop(key);
      this.holdCourseStrip();
      this.cardSubject = key;
      if (this.onUiSound) {
        this.onUiSound('select');
      }
      this.loadPodium();
      this.renderMenu();
      this.renderCourseCards();
      this.keepCardStill(key, before);
      /*
       * Land on Fly it, so the quick path stays Enter then Enter.
       *
       * AND THE PAGE ONLY MOVES FOR THE KEYS. The cursor's own scroll used
       * to run for a click too: it brought Fly it to the nearest edge,
       * which is the bottom of the window, which is under the command bar.
       * Measured at 1440 by 900 on the board's thirty tracks for the five
       * inch: one click scrolled the page 822 px, Fly it came to rest at 856
       * to 900 behind a bar at 848 to 900, and the card the pilot had
       * pressed was gone off the top with another one under the pointer.
       * So a second press, which is what a double click is, landed on a
       * different track.
       *
       * A pointer choose now moves nothing. The card stays under the hand,
       * Fly it arrives on the command bar (see courseCardRows), and the
       * list below is where it always was for whoever wants the builder
       * or the standings. A key or a radio has no bar to reach for, and
       * the cursor it is steering has just gone to a row it cannot see, so
       * there the whole list comes into view, clear of both bars.
       */
      this.setCursor(this.firstStop(this.items(), this.rowOffset), pointer);
      if (!pointer) {
        this.revealCardList();
      }
      return;
    }
    if (this.onUiSound) {
      this.onUiSound('select');
    }
    this.act(it.action);
  }

  /*
   * Seat a freestyle world, and if it has already failed to load in this
   * page, reload into it instead.
   *
   * bug-850375dc. A world is a dynamic import, and a browser keeps a failed
   * module import for the life of the page: measured in headless Chromium,
   * after a dropped connection the second attempt at the town had its file
   * served from the network and the import failed all the same. So seating
   * it again in place is a retry that cannot work. A reload is the one that
   * can, and it
   * is what the loading screen's own Try again does. The seat is saved
   * first so the new page builds the town, and the gate it opens on is the
   * gate every visit opens on.
   */
  seatWorld(world) {
    if (this.loadFailure && this.loadFailure.map === world.id) {
      this.settings.map = world.id;
      this.settings.freestyleMap = world.id;
      saveSettings(this.settings);
      window.location.reload();
      return;
    }
    this.seatMap(world.id);
  }

  /*
   * Seat a map: the one place a chosen world or track becomes the thing the
   * next flight is in.
   *
   * It writes the setting, hands it to the shell, which is the side that
   * swaps the world, and lands the pilot back where the choice was made
   * from. The gate and both pickers go through here so none of them can
   * leave the seat and the row that names it disagreeing.
   */
  seatMap(id) {
    const m = MAPS.find((x) => x.id === id);
    if (m && m.mode === 'freestyle') {
      /* So the Map row names the place you were last in rather than the
       * first in the registry, and so the gate can tell a pilot who has
       * chosen a world from one who never has. */
      this.settings.freestyleMap = id;
    }
    this.settings.map = id;
    saveSettings(this.settings);
    this.show(this.returnTo === 'paused' ? 'paused' : 'title');
    if (this.onSettings) {
      this.onSettings(this.settings);
    }
  }

  /*
   * They have flown, so this is not a first visit any more.
   *
   * The moment is the LAUNCH rather than the dismissal of a screen, because
   * the screen that used to carry that meaning is gone. Written to storage
   * as well as to the flag: detectFirstRun reads a stored settings blob as
   * its first signal, so without the write the guided flight would be
   * offered again on the next load to somebody who has already taken it.
   */
  flown() {
    if (!this.firstRun && this.settings.hasFlown) {
      return;
    }
    this.firstRun = false;
    this.settings.hasFlown = true;
    saveSettings(this.settings);
    this.renderMenu();
  }

  /* Whether the seat is the kind of place the chosen mode flies in. Race
   * needs a loaded track, freestyle needs one of the gateless worlds. A null
   * mode is the gate itself, which has no Fly row to guard. */
  seatMatchesMode() {
    if (this.mode === 'freestyle') {
      return Boolean(seatedFreestyleMap(this.settings));
    }
    if (this.mode === 'race') {
      return this.settings.map === 'custom' && hasLoadedTrack();
    }
    return true;
  }

  back() {
    if (this.dropEl) {
      this.closeDrop();
      if (this.onUiSound) {
        this.onUiSound('back');
      }
      return;
    }
    if (this.screen === 'title') {
      /*
       * TWO LEVELS, AND ESCAPE WALKS BOTH.
       *
       * The menu backs out to the gate, and the gate is the root, where
       * Escape stops. It used to be three, because the gate was two screens
       * and a whoop skipped the second one, so how far Escape went depended
       * on what was seated. One screen, one step, whatever is flying.
       *
       * BOTH halves are cleared, because both are what the gate asks. The
       * mode going null is also what lets syncMode leave it alone while the
       * gate is open: see the comment there.
       */
      if (this.onGate()) {
        return;
      }
      this.craftGate = true;
      this.mode = null;
      if (this.onUiSound) {
        this.onUiSound('back');
      }
      this.setCursor(this.titleStop());
      this.renderMenu();
      return;
    }
    if (this.screen === 'flight') {
      return;
    }
    if (this.onUiSound) {
      this.onUiSound('back');
    }
    if (this.screen === 'calibrate') {
      this.act('calibrate-cancel');
      return;
    }
    if (this.screen === 'padpick') {
      if (this.padPickPhase === 'confirm') {
        this.act('padpick-no');
      } else {
        this.act(this.padPickReason === 'menu' ? 'padpick-cancel' : 'padpick-skip');
      }
      return;
    }
    if (this.screen === 'courses' && this.cardSubject) {
      /* Escape backs out of the chosen course first, not off the screen. */
      this.act('card-back');
      return;
    }
    if (this.screen === 'results') {
      this.act('title');
      return;
    }
    if (this.screen === 'paused') {
      /* Escape opened the pause screen, so Escape closes it again. */
      this.act('resume');
      return;
    }
    if (this.screen === 'fc') {
      /* Escape leaves SEARCH before it leaves the bench, for the same
       * reason it cancels a confirm below: the nearest thing the key can
       * undo is the thing it undoes. Leaving search puts the cursor back
       * on the tab strip rather than wherever result 40 happened to be. */
      if (this.fc.search != null) {
        this.fc.search = null;
        this.setCursor(this.firstStop(this.items(), this.rowOffset));
        this.renderMenu();
        return;
      }
      /* Escape cancels a confirm before it leaves the screen, so a pilot
       * asked "restart the run?" is not thrown off the editor for
       * flinching. */
      if (this.fc.confirm) {
        this.fc.confirm = null;
        this.cursor = 0;
        this.renderMenu();
        return;
      }
      /*
       * A DRAFT IS NOT THROWN AWAY BY ONE KEY.
       *
       * Escape used to run fc-back, which calls discard() unconditionally:
       * hundreds of edited firmware keys gone, no question asked. The same
       * shell already guards a typed bug report behind a three way "Keep
       * this report?" panel, so the protection existed and was pointed at
       * the cheaper thing. Escape again from the panel cancels, by the
       * branch above.
       */
      if (this.fc.dirty()) {
        this.fc.confirm = 'leave';
        this.cursor = 0;
        this.renderMenu();
        /* The panel replaces 144 rows with three, so the list has to go back
         * to the top or the question is asked off screen. */
        if (this.fcMenu) {
          this.fcMenu.scrollTop = 0;
        }
        return;
      }
      this.act('fc-back');
      return;
    }
    if (this.screen === 'rates' && this.ratesFrom) {
      /* Settings is a page, not a mode: the shell has nothing to do when it
       * comes back up, so show() rather than act(), which would rewrite
       * returnTo and strand a pilot who paused a run to get here. */
      const from = this.ratesFrom;
      this.ratesFrom = null;
      this.show(from);
      return;
    }
    if (this.screen === 'pids' && this.pidsFrom) {
      /* Same contract as Rates above. */
      const from = this.pidsFrom;
      this.pidsFrom = null;
      this.show(from);
      return;
    }
    /* Drop the pin before title, or show() would remap title back onto
     * credits and Back would do nothing. */
    if (this.screen === 'credits') {
      clearLocationHash();
    }
    /*
     * The room this one was opened from, if it was opened from one. A
     * paused run still wins: returnTo is the pause chain and losing it
     * strands a flight. Cleared as it is used, so a second Back from the
     * room we just returned to goes on to the title rather than bouncing
     * between the two.
     */
    if (this.returnTo !== 'paused' && this.roomFrom) {
      const from = this.roomFrom;
      this.roomFrom = null;
      this.show(from);
      return;
    }
    this.act(this.returnTo === 'paused' ? 'paused' : 'title');
  }

  act(action) {
    /* The track builder is a separate page, so this is a navigation rather
     * than a screen. It has to be here and not in main.js's action handler
     * because leaving the page tears the simulator down, which is the whole
     * point: the builder shares no module, no canvas and no state with the
     * flight model, only the track document its schema.md describes.
     *
     * A race row opens the builder with ?mode=race. The builder otherwise
     * reopens the canvas the author was last on, and from the Track room
     * that is the wrong answer whenever it was the map. Edit a copy's
     * intent already tells the builder it is a race visit. */
    if (action === 'trackbuilder') {
      window.location.href = 'src/trackbuilder/index.html?mode=race';
      return;
    }
    if (action === 'mapbuilder') {
      window.location.href = 'src/trackbuilder/index.html?mode=freestyle';
      return;
    }
    /* The Tracks room's Build a track card: a blank race canvas, with the
     * one that was on it kept in the builder's Load list. */
    if (action === 'trackbuilder-new') {
      writeBuilderIntent({ kind: 'new' });
      window.location.href = 'src/trackbuilder/index.html?mode=race';
      return;
    }
    /* The gate's fourth card. No ?mode, because nothing on the gate has
     * said which canvas: the builder asks, with the gate's own three
     * pictures. See BUILDER_CARD. */
    if (action === 'builder') {
      window.location.href = 'src/trackbuilder/index.html';
      return;
    }

    if (action === 'remix') {
      writeBuilderIntent({ kind: 'remix' });
      window.location.href = 'src/trackbuilder/index.html';
      return;
    }
    if (action === 'editown') {
      writeBuilderIntent({ kind: 'edit' });
      window.location.href = 'src/trackbuilder/index.html?mode=race';
      return;
    }
    /* Leaderboard and Choose new map are the same page. The board opens
     * courses in the simulator, so this tab has to stay put. Navigating
     * away here left the pilot with no sim and a second one from Fly.
     * The board is a named tab: a pilot who has been to the board once
     * goes back to that same tab rather than collecting a row of them.
     * share.board is the board origin when a published course is loaded,
     * otherwise the default board. */
    if (action === 'leaderboard') {
      openNamedWindow(boardPageUrl(this.share && this.share.board, this.settings.airframe), BOARD_WINDOW);
      return;
    }
    /*
     * THE SEATED TRACK'S OWN PAGE ON THE BOARD (MENUS-PLAN.md 5.1). Every
     * row that said "its page" opened the board's front page, thirty tracks
     * from the one it named. The board takes ?track= and opens that track's
     * sheet, so the link says which.
     */
    if (action === 'seat-board') {
      const listing = liveListing('custom');
      const id = (listing && listing.shareId) || (this.coursePublished && this.coursePublished.id) || '';
      const board = (listing && listing.board) || (this.share && this.share.board);
      openNamedWindow(boardPageUrl(board, this.settings.airframe, id ? { track: id } : {}), BOARD_WINDOW);
      return;
    }
    if (action === 'reportbug') {
      this.openBugReport();
      return;
    }
    if (action === 'feel') {
      this.openFeelReport();
      return;
    }
    /* The tune form, from the Results row: the way in for a pilot the
     * automatic question cannot reach. See tuneShareRows. */
    if (action === 'sharetune') {
      if (this.resultsTune && !this.tuneSent.has(this.resultsTune.key)) {
        this.askTuneForm(this.resultsTune, { path: 'manual' });
      }
      return;
    }
    /*
     * The guided first flight.
     *
     * It launches DIRECTLY rather than through act('fly'), so it skips the
     * launch card: a pilot who has never held a stick does not need to be
     * asked what their lap will count as. The seat is left alone, because
     * the row only appears when there is already a track under it.
     *
     * `skipfirst` was its other half, the row that said "I have flown
     * before" on a screen that no longer exists. Nothing dispatches it now,
     * so it is gone rather than kept as an action with no row.
     */
    if (action === 'firstflight') {
      this.flown();
      this.guided = true;
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
      if (this.onAction) {
        this.onAction('fly', this.settings);
      }
      return;
    }
    /*
     * The rows a chosen course card offers. `cardSubject` says which course
     * they belong to, so none of them has to guess at the seat.
     */
    if (action === 'card-back') {
      const key = this.cardSubject;
      const before = this.courseCardTop(key);
      this.cardSubject = null;
      this.renderMenu();
      this.renderCourseCards();
      this.keepCardStill(key, before);
      if (this.courseStrip) {
        this.courseStrip.style.minHeight = '';
      }
      this.setCursor(this.cardCursor());
      return;
    }
    /*
     * BEFORE YOU FLY, from the seated track's sheet: the launch card, which
     * says what a run on it counts as and has its own Fly. The card belongs
     * to the room here, so its Back comes back to the room with the same
     * sheet open (see reopenCard in show).
     */
    if (action === 'card-launch') {
      this.seatCraftForCourse();
      this.roomFrom = 'courses';
      this.returnTo = 'title';
      this.show('launch');
      return;
    }
    /*
     * Standings, from the chosen card. Reads the board listing off the card
     * rather than the seat, because the point is to look at a track WITHOUT
     * loading it: the seat is whatever you are flying.
     */
    if (action === 'card-standings') {
      const card = this.subjectCard();
      if (card && card.course && card.course.kind === 'board') {
        this.showStandings(card.course.track);
      }
      return;
    }
    /*
     * Standings for the seated track. Its listing carries the share id and
     * the board it came from, which is all fetchTrackTimes needs; the name
     * and gates come off the seat so the screen has something to draw
     * before the network answers.
     */
    if (action === 'standings') {
      const listing = liveListing('custom');
      const seat = activeCourseSummary();
      if (!listing || !listing.shareId) {
        return;
      }
      this.showStandings({
        id: listing.shareId,
        name: (seat && seat.name) || listing.name || 'This track',
        author: listing.author || '',
        designer: (seat && seat.designer) || listing.designer || '',
        series: (seat && seat.series) || listing.series || '',
        gates: (seat && seat.gates) || 0,
        board: listing.board || '',
        trackClass: seat && seat.doc ? trackClassOf(seat.doc) : 'full',
      });
      return;
    }
    if (action === 'standings-fly') {
      /* Seat it, then the starting blocks: a press that names a track flies
       * it, the way its card's Fly it does (MENUS-PLAN.md 2.7). The grid
       * waits for the world, through the same onFlySeated flyCard uses. */
      const t = this.standingsFor;
      if (t && t.id) {
        this.openBoardCourse(t.id, () => {
          if (seatIsRace(this.settings) && this.onFlySeated) {
            this.onFlySeated();
          }
        });
      }
      return;
    }
    /*
     * Race the record: arm the ghost, seat the track, go to the launch card.
     *
     * Arming happens FIRST and through main.js, which parks the id the same
     * way a ?ghost= chase link does. The lap itself is fetched when the
     * track's times are read at seat time, so there is one code path for a
     * ghost picked here and a ghost picked from a shared link.
     */
    if (action === 'standings-ghost') {
      const times = this.standingsTimes || [];
      const top = times.find((x) => x.hasGhost && x.id);
      const t = this.standingsFor;
      if (!top || !t || !t.id) {
        return;
      }
      if (this.onStandingsGhost) {
        this.onStandingsGhost(t, top);
      }
      this.openBoardCourse(t.id, () => {
        if (seatIsRace(this.settings) && this.onFlySeated) {
          this.onFlySeated();
        }
      });
      return;
    }
    /* The standings screen offers the same row and has no card behind it:
     * the track it is showing is the subject. */
    if (action === 'card-board' && this.screen === 'standings') {
      if (this.standingsFor) {
        openNamedWindow(
          boardPageUrl(this.standingsFor.board, this.settings.airframe, { track: this.standingsFor.id }),
          BOARD_WINDOW,
        );
      }
      return;
    }
    if (action === 'card-fly' || action === 'card-builder' || action === 'card-board') {
      const card = this.subjectCard();
      if (!card) {
        this.cardSubject = null;
        this.renderMenu();
        return;
      }
      /* The row, the command bar's button and a double click on the card
       * are one press, and flyCard is it. */
      if (action === 'card-fly') {
        this.flyCard(this.cardSubject);
        return;
      }
      if (action === 'card-board') {
        openNamedWindow(
          boardPageUrl(card.course.track.board, this.settings.airframe, { track: card.course.track.id }),
          BOARD_WINDOW,
        );
        return;
      }
      this.openInBuilder(card);
      return;
    }
    /* A published course, chosen from the grid rather than from another tab. */
    if (action.startsWith('board:')) {
      this.openBoardCourse(action.slice('board:'.length));
      return;
    }
    /* One of the pilot's own. No fetch, so no loading state: seat it and
     * fly. Where 'stock:' used to be, and for the same reason it was: a
     * document already in this browser needs no round trip. */
    if (action.startsWith('local:')) {
      if (this.seatLocal(action.slice('local:'.length))) {
        this.act('map:custom');
      }
      return;
    }
    if (action === 'wiki') {
      openNamedWindow(wikiPageUrl(), WIKI_WINDOW);
      return;
    }
    /* The freestyle run's share card, drawn and saved here: nothing of the
     * shell's is needed for it. See saveRunCard. */
    if (action === 'savecard') {
      this.saveRunCard();
      return;
    }
    /* Patreon, which is not one of our sites, so not a named tab. */
    if (action === 'support') {
      openSupport();
      return;
    }
    /* Stripe tip link for one-off battery donation */
    if (action === 'tip') {
      openTip();
      return;
    }
    if (action === 'instagram') {
      openInstagram();
      return;
    }
    /* The board's partners page, which is one of our sites, in the board's
     * own named tab. */
    if (action === 'partners') {
      openNamedWindow(partnersPageUrl(this.share && this.share.board), BOARD_WINDOW);
      return;
    }
    /*
     * THE GATE'S TWO ROWS.
     *
     * Answering it is not only setting a flag. The seat has to agree with
     * the answer or the Fly row on the next screen launches the other kind
     * of thing entirely, which is the disagreement the old pair of rows
     * lived with: a Freestyle row naming a world that was not seated, over
     * a Fly that would have launched the track.
     *
     * So Race seats the loaded track, Freestyle seats the world the pilot
     * last flew there, and either of them with nothing to seat opens its
     * own picker, because choosing a place IS the question they have just
     * asked and a menu row saying so would be a screen in the way.
     */
    /*
     * ANSWERING THE GATE, WHICH IS ONE PRESS AND BOTH HALVES OF THE ANSWER.
     *
     * It seats the aircraft, sets the mode, and then does exactly what
     * answering the mode always did: seat what is going to be flown, or
     * open the one room that can seat it. The two used to be two branches
     * for two screens; a card carries both now, so this is one.
     *
     * The aircraft is seated BEFORE anything reads a seat. hasLoadedTrack
     * and activeCourseSummary read the seat of the class that is current,
     * one per class, so asking them first would ask about the machine the
     * pilot has just stopped flying.
     */
    const way = WAYS.find((w) => w.action === action);
    if (way) {
      /*
       * ONLY IF IT MOVED, and this guard is a bug fix rather than a tidy.
       *
       * seatAirframe is the deliberate swap: it takes the tune, the pack,
       * the stock rates and THE CAMERA with it, and the camera lines are
       * unconditional, so calling it with the aircraft that is already
       * seated writes that aircraft's stock cameraFov and cameraAngle over
       * the pilot's own. The gate is answered on every visit, so a pilot who
       * had set 45 degrees of tilt on the Quad screen got it reset to the
       * stock 20 every time they opened the simulator. The old aircraft gate
       * called it unconditionally too, so this is older than the three
       * cards; it is fixed here because this is the line that does it.
       *
       * A ?craft= link did the same thing a second way (bug-ddfe1c6d), and
       * that one was fixed in seatAirframe itself, which now leaves an
       * aircraft that is already seated alone. This test stays as the plain
       * statement of what the gate means to do.
       */
      if (way.airframe !== this.settings.airframe) {
        seatAirframe(this.settings, way.airframe);
      }
      this.settings.airframeAsked = true;
      this.craftGate = false;
      this.mode = way.mode;
      saveSettings(this.settings);
      /* The shell has to hear this before anything is flown: it is the
       * call that swaps the plant in the compiled module and reloads the
       * tune. main.js applies it between runs, which the title is. */
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
      this.returnTo = 'title';
      this.roomFrom = null;
      if (way.mode === 'race') {
        if (!hasLoadedTrack()) {
          this.show('courses');
          return;
        }
        if (this.settings.map !== 'custom') {
          this.seatMap('custom');
          return;
        }
      } else if (!seatedFreestyleMap(this.settings)) {
        /*
         * NO PICKER WHEN THERE IS NOTHING TO PICK.
         *
         * This used to open the Freestyle room so a first visit could choose
         * among four worlds with the cards in front of it. Three of those
         * worlds were removed on 2026-08-30 and the picker stayed, so
         * answering "Freestyle" put a screen in front of a pilot whose only
         * content was one card saying the name of the only place they could
         * possibly be going. That is a question with one answer, and a
         * question with one answer is a keypress somebody has to make.
         *
         * The remembered world is still consulted FIRST, and the picker
         * still comes back the moment there is a real choice, which is why
         * this is written as "what is remembered, or the only one" rather
         * than as the id of the town. A second freestyle world costs the
         * registry entry and this branch and nothing else.
         */
        const want = freestyleWorldToSeat(this.settings);
        if (!want) {
          this.show('freestyle');
          return;
        }
        this.seatWorld(want);
        return;
      }
      /*
       * The seat already agrees with the answer, so the gate was one
       * keypress and the menu is behind it. The cursor lands on the first
       * row of what the answer opened rather than staying on the index of
       * the card that was pressed: the third card is the third row, so
       * choosing Freestyle would otherwise put the cursor on the menu's
       * third row and the Fly button under it would read as something
       * else's. Same call back() makes for the same reason.
       */
      this.setCursor(this.titleStop());
      this.renderMenu();
      return;
    }
    /*
     * `tricks` BELONGS HERE and was missing, so the Trick list door did
     * nothing. The screen was built, the row was on the Freestyle menu with
     * action 'tricks', and SCREEN_ACTIONS listed it, so every part that
     * announces the room existed; this is the one that walks into it, and
     * it is a hand written list of screen names that the new screen was
     * never added to. Pressing Enter on the row left the pilot exactly
     * where they were, which is the whole feature unreachable.
     *
     * Found by driving the real shell rather than by reading: window.__ui
     * .show('tricks') rendered the screen perfectly, which is what made it
     * look fine, and only pressing the key a pilot presses showed that
     * nothing happened.
     */
    if (action === 'howto' || action === 'pilot' || action === 'quad'
      || action === 'courses' || action === 'freestyle' || action === 'credits'
      || action === 'tricks' || action === 'stickhelp' || action === 'advanced') {
      /*
       * A room opened FROM another room remembers which, so Back is the way
       * you came rather than a jump to the title. Only from a real room,
       * and never from the pause chain, which returnTo already owns.
       */
      this.roomFrom = ROOM_PARENTS.has(this.screen) && this.screen !== action
        ? this.screen
        : null;
      /* A room opened from a room inside a paused run is still inside that
       * run. This used to reset to the title, so Paused, Settings, Stick
       * help, Escape, Escape quit the run instead of going back to it. */
      this.returnTo = this.screen === 'paused'
        || (this.screen !== 'title' && this.returnTo === 'paused')
        ? 'paused'
        : 'title';
      this.show(action);
      return;
    }
    /*
     * THE LAUNCH CARD, and the one thing on it that is not a setting.
     *
     * `fly` used to launch. It now opens the card, and `launch-go` is what
     * launches, so the verb that starts a run is a different word from the
     * verb that shows you what the run will be. Freestyle keeps the old
     * behaviour and launches directly: it has no clock, no lap, no ghost
     * and no board, so a card in front of it would be ceremony.
     */
    /*
     * FLY WITH NOTHING TO FLY.
     *
     * Reachable: answer Race, land in the track list because nothing is
     * loaded, press Escape without choosing. The row above Fly says Choose
     * one, and this is that row's answer given as a verb. Launching
     * whatever happened to still be seated would be the front page saying
     * one thing and the sim doing another.
     */
    /*
     * THE TRACK DECIDES THE AIRCRAFT, and it decides it here, on the way to
     * the pre-flight card rather than after the world is built.
     *
     * A track's class is not a preference, it is what the track IS: a
     * RaceGOW course is 1.42 by 2.13 m of 28 inch gates in a five metre
     * room, and a MultiGP one is a dozen 5 ft gates over sixty metres. Left
     * to the seated aircraft, a pilot who answered "five inch" once and
     * then opened a living room got a 347 mm quad doing 40 m/s in a room it
     * crosses in a quarter of a second, with the gates and the walls both
     * built for something a fifth of its size. Nothing crashed, which is
     * why it survived: it just was not the track.
     *
     * So the swap is silent and reversible. The pre-flight card carries a
     * Quad row, so a pilot who genuinely wants a five inch in a living room
     * is one click from it, and the card's own note says which machine the
     * run will be filed under.
     */
    if (action === 'fly') {
      this.seatCraftForCourse();
    }
    if (action === 'fly' && !this.seatMatchesMode()) {
      /*
       * FREESTYLE WITH NO WORLD SEATED IS FLY'S TO FIX, NOT A ROOM'S.
       *
       * bug-850375dc, "got stuck on this screen while loading freestyle
       * map". The town's load failed, syncWorld put the track back under a
       * pilot who had said freestyle, and Fly sent them to the Freestyle
       * room to choose a world. The room stopped drawing cards when it was
       * down to one world, so it held Scoring, Quad, Physics model and
       * Back, and nothing that loads anything. So Fly does what the gate
       * does: seat the world, which is the load tried again, by a reload
       * when it has already failed in this page. See seatWorld.
       */
      const world = this.mode === 'freestyle' ? freestyleWorldToSeat(this.settings) : null;
      if (world) {
        this.seatWorld(world);
        return;
      }
      this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
      this.show(this.mode === 'freestyle' ? 'freestyle' : 'courses');
      return;
    }
    if (action === 'fly' && seatIsRace(this.settings)) {
      this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
      /* The card once per track per visit: see launchCardSeen. */
      if (launchCardSeen(this.settings)) {
        this.act('launch-go');
        return;
      }
      this.show('launch');
      return;
    }
    if (action === 'launch-go') {
      /* The card's own button. It falls through to onAction as `fly`,
       * which is the action main.js has always launched on: the card is a
       * screen in front of the verb, not a second verb. */
      this.flown();
      if (this.onAction) {
        this.onAction('fly', this.settings);
      }
      return;
    }
    if (action === 'rates') {
      /* Escape and Back go where the pilot came from, so Rates reached from
       * the pause menu mid-race does not dump them on the title screen.
       * From the flight controller's signpost row, returnTo is left alone:
       * it may be carrying a paused run two screens up, and this row must
       * not be the reason Escape quits it. */
      if (this.screen === 'pilot' || this.screen === 'quad' || this.screen === 'fc') {
        /* Both rooms carry a Rates row: Settings has the real one, Quad has a
         * signpost saying rates are not the machine's. Escape goes back to
         * whichever one was used, or the signpost is a one way door. The
         * bench's "Open the Rates screen" is the same kind of signpost, and
         * Escape used to land on the title from it (MENUS-PLAN.md 1.37), so
         * it comes back to the bench, draft and all: fcFrom survives the trip
         * in show(), as pidsFrom survives a trip to the bench. */
        this.ratesFrom = this.screen;
      } else {
        this.ratesFrom = null;
        if (this.screen !== 'fc') {
          this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
        }
      }
      this.show('rates');
      return;
    }
    if (action === 'pids') {
      /* Same going-back contract as Rates, for the same reason. The launch
       * card's Tune row comes back to the launch card, which is the moment
       * a pilot opened it from: Escape used to land them on the title. */
      if (this.screen === 'quad' || this.screen === 'launch') {
        this.pidsFrom = this.screen;
      } else {
        this.pidsFrom = null;
        this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
      }
      this.show('pids');
      return;
    }
    if (action === 'fc') {
      /* Its own origin pointer, NOT returnTo: returnTo belongs to the
       * pause chain, and overwriting it here stranded a pilot who paused
       * a run, opened PIDs, opened this, and Escaped twice expecting the
       * pause menu back. */
      this.fcFrom = ['paused', 'quad', 'pids'].includes(this.screen)
        ? this.screen
        : 'title';
      if (this.onFcOpen) {
        this.onFcOpen('pid');
      }
      this.show('fc');
      return;
    }
    if (action === 'fc-save') {
      if (!this.fc.dirty()) {
        return;
      }
      if (this.fc.runActive) {
        this.fc.confirm = 'save-run';
        this.fc.exitAfterSave = false;
        this.cursor = 0;
        this.renderMenu();
        return;
      }
      this.fc.stopMotors();
      if (this.onFcSave) {
        this.onFcSave(this.fc.draft, { restart: false, presetId: this.fc.presetId });
      }
      return;
    }
    if (action === 'fc-save-exit') {
      if (!this.fc.dirty()) {
        this.leaveFc();
        return;
      }
      if (this.fc.runActive) {
        this.fc.confirm = 'save-run';
        this.fc.exitAfterSave = true;
        this.cursor = 0;
        this.renderMenu();
        return;
      }
      this.fc.stopMotors();
      if (this.onFcSave) {
        this.onFcSave(this.fc.draft, { restart: false, exit: true, presetId: this.fc.presetId });
      }
      return;
    }
    if (action === 'fc-save-restart') {
      this.fc.exitAfterSave = false;
      this.fc.confirm = null;
      this.fc.stopMotors();
      if (this.onFcSave) {
        this.onFcSave(this.fc.draft, { restart: true, presetId: this.fc.presetId });
      }
      return;
    }
    if (action === 'fc-wait') {
      this.fc.exitAfterSave = false;
      this.fc.confirm = null;
      this.cursor = 0;
      this.renderMenu();
      return;
    }
    if (action === 'fc-motors-stop') {
      this.fc.stopMotors();
      this.renderMenu();
      return;
    }
    if (action.startsWith('fc-preset:')) {
      const id = action.slice('fc-preset:'.length);
      this.fc.applyPreset(id).then(() => {
        this.renderMenu();
      }).catch((err) => {
        console.error(err);
      });
      return;
    }
    /* The two answers to the leave panel. Keep stays on the editor with the
     * draft intact; Discard is the old unconditional behaviour, now behind
     * a deliberate press. */
    if (action === 'fc-keep-editing') {
      this.fc.confirm = null;
      this.cursor = 0;
      this.renderMenu();
      return;
    }
    if (action === 'fc-discard-leave') {
      this.fc.confirm = null;
      this.fc.exitAfterSave = false;
      this.fc.discard();
      this.leaveFc();
      return;
    }
    if (action === 'fc-discard') {
      this.fc.discard();
      this.renderMenu();
      return;
    }
    if (action === 'fc-export') {
      downloadCli('betaflight.diff', this.fc.exportText());
      return;
    }
    if (action === 'fc-back') {
      this.fc.exitAfterSave = false;
      this.fc.discard();
      this.leaveFc();
      return;
    }
    if (action === 'pids-default') {
      /* One tune's adjustment only. The other tunes keep theirs, which is
       * the whole reason the store is keyed. */
      clearPidsFor(this.settings.pids, this.settings.tune);
      saveSettings(this.settings);
      this.renderMenu();
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
      return;
    }
    if (action === 'rates-default') {
      /* normaliseRates rather than the frozen table itself: the rows write
       * into this object, and handing them the defaults by reference would
       * make the first edit change what "revert" means. */
      this.settings.rates = normaliseRates(RATE_DEFAULTS);
      this.settings.ratesSplitPitch = false;
      saveSettings(this.settings);
      this.renderMenu();
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
      return;
    }
    /*
     * SAVE THE NUMBERS UNDER A NAME.
     *
     * The dialog IS the prompt for a name. There is no inline name field on
     * the row and there should not be: the stick menu cannot type, so a name
     * is always this overlay, and a Save that opened it is the same gesture
     * as a Save that demanded it. Leaving the field empty and confirming
     * keeps the dialog open with a line saying so, because askForm refuses
     * an empty required field rather than inventing "Preset 4".
     *
     * Pre-filled with the loaded preset's name when the numbers already
     * match one, so the common "I nudged it, save it again" lands on
     * Replace rather than quietly growing a second copy.
     */
    if (action === 'rates-save') {
      const loaded = presetMatching(this.settings.rates);
      this.askRatePresetName(loaded ? loaded.name : '').then((name) => {
        if (!name) {
          return;
        }
        const res = saveRatePreset(name, this.settings.rates);
        /*
         * SUCCESS NEEDS NO ANNOUNCEMENT, because the Preset row above IS
         * the announcement: it worked out its value by asking the library
         * what matches what is flying, so a save that landed makes the row
         * say the new name on the next render. A toast would be a second
         * copy of a fact already on screen.
         *
         * FAILURE DOES, and it is the whole reason this branch exists. A
         * private window and a full quota both refuse the write, and a
         * pilot who was not told would go back to the other track and find
         * the profile gone. Same words the board uses for the same cause.
         */
        this.ratesNotice = res.ok
          ? null
          : 'This browser would not store that preset. Your rates are still flying, but they are not saved.';
        this.renderMenu();
      });
      return;
    }
    if (action === 'rates-delete') {
      const loaded = presetMatching(this.settings.rates);
      if (!loaded) {
        return;
      }
      this.askConfirm({
        title: `Delete ${loaded.name}?`,
        detail: 'This browser is the only copy, so this cannot be undone. The numbers stay on the quad and keep flying; only the saved profile goes.',
        yes: 'Delete',
        no: 'Keep it',
      }).then((ok) => {
        if (!ok) {
          return;
        }
        const res = deleteRatePreset(loaded.id);
        this.ratesNotice = res.ok
          ? null
          : 'This browser would not change stored presets, so that one is still saved.';
        this.renderMenu();
      });
      return;
    }
    /*
     * Choosing a map. It goes through onSettings rather than onAction
     * because a map change IS a settings change, and the shell's
     * applySettings is the one place that knows a changed map means a swap.
     * Custom map with nothing loaded is not a map yet: Current map stays
     * on the submenu instead of building an empty field.
     */
    if (action.startsWith('map:')) {
      const id = action.slice(4);
      if (id === 'custom' && !hasLoadedTrack()) {
        return;
      }
      /* A world's card goes the way Fly and the gate go: see seatWorld.
       * Choosing one is also choosing off any map from the board, so Your
       * map flies the pilot's own again rather than the last one listed. */
      const world = MAPS.find((x) => x.id === id && x.mode === 'freestyle');
      if (world) {
        this.useSharedMap(null);
        this.seatWorld(world);
        return;
      }
      this.seatMap(id);
      return;
    }
    /* A map from the board, from its card in the Freestyle room. */
    if (action.startsWith('boardmap:')) {
      this.openBoardMap(action.slice('boardmap:'.length));
      return;
    }
    /* back() is the one implementation. This branch used to be a copy of
     * its last three cases and had already drifted: it called show() where
     * back() calls act(), so a Back ROW left main.js unaware of the screen
     * change that the Escape key told it about. */
    if (action === 'back') {
      this.back();
      return;
    }
    if (action === 'mode-gate') {
      /* Exactly what Escape from the title does, and it has to stay exactly
       * that: the gate is the one screen with nothing behind it, so leaving
       * either half answered would show the question with a menu still
       * under it. Both halves, because the one gate asks both. */
      this.mode = null;
      this.craftGate = true;
      this.show('title');
      this.setCursor(this.titleStop());
      this.renderMenu();
      return;
    }
    /* Leaving a flight for the menu is an end of flight as well: take what
     * was flown on the tuned sliders before main.js clears it with the run
     * (onAction 'title' resets), and ask once the title is up. From Results
     * the question was asked on arrival and is not asked again. */
    const leaving = action === 'title' && (this.screen === 'paused' || this.screen === 'flight')
      ? this.takeTuneFlight()
      : null;
    if (action === 'title' || action === 'paused') {
      this.show(action);
    }
    /* Freestyle reaches the air through here rather than through the launch
     * card, so this is the other end of the same event. See flown(). */
    if (action === 'fly') {
      this.flown();
    }
    if (this.onAction) {
      this.onAction(action, this.settings);
    }
    if (leaving) {
      this.resultsTune = null;
      this.maybeAskTune(leaving);
    }
  }

  /* Returns true when the key was a menu key and the shell should not
   * treat it as a flight control. repeat is the browser's key-repeat
   * flag: a held or quickly tapped arrow must step the cursor, but Enter
   * and Escape must not fire again. */
  handleKey(code, repeat = false) {
    /* Any key is somebody using the room, so the preview recorder waits.
     * See noteInteraction. */
    this.noteInteraction();
    if (this.nameDialog && !this.nameDialog.hidden) {
      return true;
    }
    const nav = code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight'
      || code === 'KeyW' || code === 'KeyS' || code === 'KeyA' || code === 'KeyD';
    if (repeat && !nav) {
      return this.screen !== 'flight';
    }
    if (code === 'F8') {
      this.openBugReport();
      return true;
    }
    if (this.screen === 'flight') {
      if (code === 'Escape') {
        this.act('pause');
        this.show('paused');
        return true;
      }
      return false;
    }
    if (this.screen === 'calibrate') {
      if (code === 'Escape' || code === 'Backspace') {
        this.back();
        return true;
      }
      if ((code === 'Enter' || code === 'Space') && this.calCanSave) {
        if (this.onUiSound) {
          this.onUiSound('select');
        }
        this.act('calibrate-save');
        return true;
      }
      /*
       * A KEY IS THE WAY PAST THE ONE STEP A RADIO MIGHT NOT BE ABLE TO
       * ANSWER, and the pilot who reported it asked for exactly this: "A
       * bypass button, just use a key on my keyboard". The button beside
       * Cancel is the same door for a mouse. Deliberately NOT bound to the
       * pad: this step is asking the pilot to hold a switch, and the hold
       * gesture that would carry it is the same gesture, so a pad binding
       * here would skip the step while they were trying to complete it.
       */
      /* T for throttle, named in the hint beside it, because the pilot this
       * is for may have a radio whose only button is a stick hold. */
      if (code === 'KeyT' && this.calCanZeroThrottle) {
        if (this.onUiSound) {
          this.onUiSound('select');
        }
        this.act('calibrate-zero-throttle');
        return true;
      }
      /*
       * R REVERSES WHAT THEY ARE MOVING, and M puts the drawn sticks on the
       * other hands. Both are only live on the check step, both are named
       * in the hint under the prompt as it changes, and neither is bound to
       * the pad: the pilot is holding a stick to aim these, so a stick
       * gesture would fight the aiming. See bug-b0d085f0 and bug-873a84ec.
       */
      if (code === 'KeyR' && this.calCanReverse) {
        if (this.onUiSound) {
          this.onUiSound('select');
        }
        this.act('calibrate-reverse');
        return true;
      }
      if (code === 'KeyM' && this.calOnConfirm) {
        if (this.onUiSound) {
          this.onUiSound('adjust');
        }
        this.act('calibrate-stick-mode');
        return true;
      }
      if ((code === 'Enter' || code === 'Space') && this.calCanSkip) {
        if (this.onUiSound) {
          this.onUiSound('select');
        }
        this.act('calibrate-skip');
        return true;
      }
      return true;
    }
    if (this.screen === 'padpick') {
      if (code === 'Escape' || code === 'Backspace') {
        this.back();
        return true;
      }
      if ((code === 'Enter' || code === 'Space') && this.padPickPhase === 'confirm') {
        if (this.onUiSound) {
          this.onUiSound('select');
        }
        this.act('padpick-yes');
        return true;
      }
      return true;
    }
    if (this.dropEl) {
      if (code === 'ArrowUp' || code === 'KeyW') {
        this.moveDrop(-1);
        return true;
      }
      if (code === 'ArrowDown' || code === 'KeyS') {
        this.moveDrop(1);
        return true;
      }
      if (code === 'Enter' || code === 'Space') {
        this.confirmDrop();
        return true;
      }
      if (code === 'Escape' || code === 'Backspace') {
        this.back();
        return true;
      }
    }
    this.lastInput = 'key';
    if (code === 'ArrowUp' || code === 'KeyW') {
      this.move(-1);
      return true;
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      this.move(1);
      return true;
    }
    if (code === 'ArrowLeft' || code === 'KeyA') {
      /* The map screens lay their cards out in a row, so left and right are
       * what a player reaches for. Nothing on them has a value to adjust. */
      if (this.cardScreen()) {
        this.move(-1);
      } else {
        this.adjust(-1);
      }
      return true;
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      if (this.cardScreen()) {
        this.move(1);
      } else {
        this.adjust(1);
      }
      return true;
    }
    /*
     * `/` OPENS SEARCH ON THE BENCH, which is the key every editor and
     * every browser uses for it, and it is the one screen in the product
     * with enough rows to need one: 696 keys across 23 flat tabs with no
     * grouping and no cross-tab search is a memory test.
     *
     * Nowhere else, because nowhere else has more rows than fit on a
     * screen and a half, and a slash that silently does nothing on nine
     * screens is worse than no slash at all.
     */
    if (code === 'Slash' && this.screen === 'fc' && !this.fc.confirm) {
      if (this.fc.search == null) {
        this.fc.search = '';
        this.renderMenu();
        this.setCursor(this.firstStop(this.items(), this.rowOffset));
        /* Straight into the field. A search you have to press Enter to
         * start typing into is two keys for one intention. */
        this.searchCaret = 0;
        this.restoreSearchCaret();
      }
      return true;
    }
    if (code === 'PageUp') {
      this.pageMove(-1);
      return true;
    }
    if (code === 'PageDown') {
      this.pageMove(1);
      return true;
    }
    if (code === 'Home') {
      this.jumpEdge(-1);
      return true;
    }
    if (code === 'End') {
      this.jumpEdge(1);
      return true;
    }
    if (code === 'Enter' || code === 'Space') {
      this.select();
      return true;
    }
    if (code === 'Escape' || code === 'Backspace') {
      this.back();
      return true;
    }
    return true;
  }

  /*
   * WHAT THE RADIO LAST DID TO A MENU, for a bug report. bug-2d93629e said a
   * pause menu resumed itself and could not say what did it: a stick or a
   * switch, a second in or a tenth. The gate (src/input/padgate.js) closes
   * the stick half of that, and buttons 0 to 3 are menu keys by design, so
   * the next report of it has to be able to say which. `gate` is cold on a
   * visit that began on the title, settling while a menu opened from flight
   * waits for the sticks, open after; `last` is the fresh right, left, select
   * and back the radio made once it was listened to, newest last, with the
   * time since the screen was shown and the screen.
   */
  padLogReport() {
    const g = this.padGate;
    return { gate: g.hot ? (g.settling ? 'settling' : 'open') : 'cold', last: this.padLog.slice() };
  }

  /*
   * Stick navigation. nav is { up, down, left, right, select, back },
   * already resolved by the shell from either the calibrated channels or,
   * when the radio has never been calibrated, from any axis at all. Edge
   * triggered, so a held stick moves one row. Title and Settings do not
   * use pitch and roll for the cursor: those screens pose the airframe.
   */
  pollPad(nav) {
    if (this.screen === 'flight') {
      this.padPrev = { up: false, down: false, left: false, right: false, select: false, back: false };
      return;
    }
    if (nav.up || nav.down || nav.left || nav.right || nav.select || nav.back) {
      this.lastInput = 'pad';
    }
    const now = {
      up: Boolean(nav.up),
      down: Boolean(nav.down),
      right: Boolean(nav.right),
      left: Boolean(nav.left),
      select: Boolean(nav.select),
      back: Boolean(nav.back),
    };
    /* One poll to learn where the sticks already are, acting on nothing.
     * See show(). */
    if (this.padRearm) {
      this.padRearm = false;
      this.padPrev = now;
      return;
    }
    /*
     * A visit that began in flight is not listened to until the sticks have
     * been quiet, and then a roll has to be held a beat: see show() and
     * src/input/padgate.js. The clock is this menu's own wall clock, clamped
     * so a stalled frame or a tab coming back cannot bank quiet it did not
     * see, and it is not the physics path. Before the dialog check, so the
     * waiting goes on under a dialog and the edges are seeded either way.
     */
    const clockNow = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    const dtMs = padDtMs(this.padClockAt, clockNow);
    this.padClockAt = clockNow;
    if (!stepPadGate(this.padGate, now, nav.calm !== false, dtMs)) {
      this.padPrev = now;
      return;
    }
    for (const k of PAD_ACTS) {
      if (now[k] && !this.padPrev[k]) {
        this.padLog.push(`${k} ${Math.round(clockNow - this.padShownAt)}ms on ${this.screen}`);
        if (this.padLog.length > 5) {
          this.padLog.shift();
        }
      }
    }
    /*
     * A dialog swallows the pad exactly as handleKey swallows the keys.
     * Without this, a radio pilot's select flick landed on the MENU UNDER
     * the dialog: with the feel question auto-opened over Results, the
     * flick they meant for Fly again restarted the run behind the form and
     * left it up over a flight it could no longer describe. The edges are
     * still tracked, so releasing a switch while a dialog closes cannot
     * fire on the screen that comes back.
     */
    if (this.nameDialog && !this.nameDialog.hidden) {
      /*
       * BACK CLOSES A DIALOG, once the sticks have been seen at rest since
       * it opened (MENUS-PLAN.md 2.9). A radio pilot could not answer the
       * name prompt, a confirm or the feel form at all, and the form used to
       * open on its own. Only Back, and only as Escape: the dialog's own
       * key handler takes it, so a form with typing in it asks before it
       * throws the typing away, exactly as Escape does. Never select, which
       * could send a form or confirm a question with a flick.
       */
      const rest = !now.up && !now.down && !now.left && !now.right && !now.select && !now.back;
      if (!this.dialogPadArmed) {
        this.dialogPadArmed = rest;
      } else if ((now.back && !this.padPrev.back) || (now.left && !this.padPrev.left)) {
        this.dialogPadArmed = false;
        this.nameDialog.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
        }));
      }
      this.padPrev = now;
      return;
    }
    this.dialogPadArmed = false;
    if (this.screen === 'calibrate') {
      if (now.back && !this.padPrev.back) {
        this.act('calibrate-cancel');
      }
      if (now.select && !this.padPrev.select && this.calCanSave) {
        this.act('calibrate-save');
      }
      this.padPrev = now;
      return;
    }
    if (this.screen === 'padpick') {
      /* Buttons are read from the candidate pad inside input.js. Using
       * firstGamepad() here would let the wrong radio confirm. */
      this.padPrev = now;
      return;
    }
    /*
     * Title, Settings, Rates and PIDs all hold still under a moving stick:
     * the first two pose the airframe, and Rates rides a dot along the
     * curve the stick is about to fly. Pitch and roll that fly it used to
     * step the cursor, which on Rates meant that moving a stick to watch
     * its dot also walked the menu and, on a value row, edited the number
     * it landed on; PIDs is all value rows, so it gets the same rule.
     * Keyboard and mouse own the rows on these four; a radio switch still
     * selects on the title so Fly is one flick away. The pad is tracked so
     * a held stick does not fire an edge the moment the screen closes.
     */
    /* Quad, not Settings: the airframe showcase moved with the machine, so
     * the screen whose sticks pose a quad is the one that has a quad on it.
     * Pilot has no showcase and its sticks are free to drive the cursor,
     * which is the whole point of a room a radio pilot has to reach. */
    /*
     * The GATE is the one part of the title where the sticks drive.
     *
     * The rule above is written for a screen where every choice is one
     * switch press away, and that is true of the title's menu, where Fly is
     * the primary and the bar's button flies it. It is not true of the
     * gate: there are two cards and a radio that cannot move between them
     * can only ever choose the one the cursor happens to be on. Posing the
     * airframe is worth less than being able to answer the question, so on
     * the gate the sticks fall through to the ordinary card walk, pitch to
     * move and roll right to choose, which is what the hint under it says.
     */
    /*
     * STICK HELP is on the same list for the strongest reason of any: the
     * sticks are what is under test, and the screen tells the pilot to push
     * each one to its stops. A stick that walked the cursor there would have
     * pressed Back or Calibrate the first time it was pushed.
     *
     * And its select is not the hold. A radio with no buttons presses Enter
     * by holding a stick off centre for most of a second (see holdSelect in
     * src/input/input.js), which on this screen is what the pilot is asked
     * to do with every stick, so that radio selects here by key, click or
     * its assigned menu switch only.
     */
    if (this.screen === 'stickhelp' && this.padInfo && !this.padInfo.buttons && !this.padInfo.hasSelect) {
      now.select = false;
    }
    /*
     * A LIST OPEN IN PLACE TAKES THE PAD ON EVERY SCREEN (MENUS-PLAN.md
     * 2.9). It used to sit below the guard that follows, so on the six
     * screens the guard covers a list opened with a button could be neither
     * stepped nor closed from the radio. Nothing is posed or measured while
     * a list is open over it.
     */
    if (this.dropEl) {
      if (now.up && !this.padPrev.up) {
        this.moveDrop(-1);
      }
      if (now.down && !this.padPrev.down) {
        this.moveDrop(1);
      }
      if ((now.right && !this.padPrev.right) || (now.select && !this.padPrev.select)) {
        this.confirmDrop();
      }
      if ((now.left && !this.padPrev.left) || (now.back && !this.padPrev.back)) {
        this.closeDrop();
        if (this.onUiSound) {
          this.onUiSound('back');
        }
      }
      this.padPrev = now;
      return;
    }
    /*
     * PITCH MOVES THE CURSOR ON THE TITLE AND IN QUAD (MENUS-PLAN.md 2.9),
     * the rule every other menu already has. They pose the quad, and the
     * pose is roll and yaw as much as pitch, so roll stays out: roll right
     * is choose and roll left is back everywhere else, and a pose would
     * press them. Before this a radio on the title could fly and nothing
     * else, because a cursor it could not move sat on Fly.
     */
    if (posesQuad(this)) {
      if (now.up && !this.padPrev.up) {
        this.move(-1);
      }
      if (now.down && !this.padPrev.down) {
        this.move(1);
      }
    }
    if (posesQuad(this) || STICKS_BUSY[this.screen]) {
      /*
       * Roll stays out on the two that pose the quad and every stick stays
       * out on the busy four (STICKS_BUSY), for the reasons above. The
       * BUTTONS do not.
       *
       * The guard used to swallow everything except select on the title,
       * and the pause menu is fully stick navigable and carries rows into
       * all five of these screens. So a radio pilot could steer into
       * Settings and then have no stick that moved the cursor and no
       * switch that went back: a room you can enter and cannot leave.
       *
       * select and back come from padMenuButtons, which reads buttons 0 to
       * 3 and only after seeing all four released, so a latched arming
       * switch cannot fire them. They are safe on a screen where the axes
       * are not, because they are not the axes.
       */
      if (now.select && !this.padPrev.select) {
        this.select();
      }
      if (now.back && !this.padPrev.back) {
        this.back();
      }
      this.padPrev = now;
      return;
    }
    const it = this.items()[this.cursor];
    /*
     * THE KEYBOARD'S RULE, WHICH THE STICKS DID NOT HAVE.
     *
     * Left and Right on a card screen MOVE the cursor, they do not adjust
     * the row under it: the cards lie in a row and that is what a player
     * reaches for. See the arrow keys above, whose reason for it was that
     * nothing on a card screen has a value to adjust. That stopped being
     * true when the Freestyle room grew a Scoring row and a Physics model
     * row, and with one freestyle world the room draws no cards at all, so
     * Scoring is the FIRST row and the cursor opens on it.
     *
     * On the sticks that made roll LEFT, which everywhere else in the
     * product is BACK, step Scoring backwards instead. cycle() wraps, so
     * one nudge of the gesture a radio pilot uses to leave a room took the
     * default 'off' the long way round to 'scored', and writeSettings
     * saved it: an unfinished scorer switched on, a two minute clock and a
     * public board, for a pilot who thought they had pressed Escape and
     * has no memory of asking for any of it. Roll right was the same bug
     * one position milder, and the hint under the screen tells a radio
     * pilot to roll. See DEFAULTS.freestyleScoring for why off is what a
     * pilot gets without asking.
     *
     * So the sticks get the keyboard's rule. On a card screen roll right
     * chooses and roll left goes back, which is what the hint promises,
     * and a segmented row is still reachable from a radio because select
     * cycles it: see the segmented branch in select().
     */
    const rollAdjusts = Boolean(it && it.adjust) && !this.cardScreen();
    if (now.up && !this.padPrev.up) {
      this.move(-1);
    }
    if (now.down && !this.padPrev.down) {
      this.move(1);
    }
    if (now.right && !this.padPrev.right) {
      if (rollAdjusts) {
        this.adjust(1);
      } else {
        this.select();
      }
    }
    if (now.left && !this.padPrev.left) {
      if (rollAdjusts) {
        this.adjust(-1);
      } else {
        this.back();
      }
    }
    if (now.select && !this.padPrev.select) {
      this.select();
    }
    if (now.back && !this.padPrev.back) {
      this.back();
    }
    this.padPrev = now;
  }
}
