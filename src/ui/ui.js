/*
 * ui.js: the product shell. Title, how to fly, credits, settings, pause, results,
 * stick calibration, the flight overlay, and the flight-controller screen.
 *
 * Why this exists: the page used to load straight into a falling quad with
 * a monospace debug dump in the corner. That reads as a tech demo. A
 * player arriving cold needs a title to land on, a way to start, a way to
 * learn the sticks, a way to change the few settings that matter, and a
 * result to read at the end of a run.
 *
 * Every screen is navigable from the keyboard alone and from a radio or
 * gamepad alone, except Settings and the title. On a radio there are no
 * reliable menu buttons, so the sticks drive the other menus: pitch moves
 * the cursor, roll right selects, roll left goes back. Any gamepad button
 * also selects. Title and Settings keep the sticks for the airframe, so
 * those screens are mouse and keyboard for the rows. A radio switch still
 * selects on the title. The screens say so. Rows that hold a value also
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
import { CAL_STEPS } from '../input/input.js';
import { LINK_PRESETS } from '../input/link.js';

/* Wording for input.js's calibration steps. The order lives there. */
const CAL_LABELS = {
  center: 'Centre',
  sweep: 'Full range',
  throttle: 'Throttle',
  roll: 'Roll',
  pitch: 'Pitch',
  yaw: 'Yaw',
  confirm: 'Check',
};
import { TRACKS, trackById } from '../render/tracks.js';
import { TUNES, tuneById } from '../../configs/registry.js';
import {
  RATE_DEFAULTS,
  ratesSummary,
} from '../../configs/rates.js';
import { boardPageUrl, fetchTrackList, pickFeaturedTracks } from '../share/board.js';
import { BUG_KINDS, submitBug } from '../share/bugs.js';
import { nameRules, readPilotName, writePilotName } from '../share/pilot.js';
import { courseChip, inspectCourse, isEmptyCanvas } from '../share/listing.js';
import { drawPlan, fieldSize, planCanvas, planFromDocument } from '../share/plan.js';
import { activeCourseSummary } from '../share/summary.js';
import {
  readPendingTime,
  readPostedBest,
  writeBuilderIntent,
  writePendingTime,
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
  CLIP_MS_MAX,
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
  clampCameraAngle,
} from '../render/lens.js';
import { JOKE_MS, quotedJoke } from './loading.js';
import { fillCredits } from './credits.js';
import { sanitiseRateProfile } from '../fc/dump.js';
import { cycle, downloadCli, drawAttitude, FcSession, paintPageStrip, paintTabStrip } from './fc.js';

/* Exported for scripts/shots.js, which seeds a chosen graphics preset into
 * storage before the page boots so a cost measurement is not taken at
 * whatever preset the harness machine happens to detect. The key is
 * exported rather than copied there, because a second copy of a storage key
 * is a harness that silently seeds nothing the day this one changes. */
export const SETTINGS_KEY = 'webfpv.settings.v2';

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
export const LAP_COUNTS = [1, 3, 5];

const DEFAULTS = {
  /* Which world. 'field' is the MultiGP circuit and 'city' is the freestyle
   * town. It is a string so loadSettings' typeof gate accepts it, and an
   * unknown value falls back to the field in src/maps/registry.js rather than
   * throwing, because a stale localStorage entry must not be able to stop the
   * page booting. */
  map: 'field',
  /* Which Betaflight diff the module is initialised from. A string for the
   * same reason map is: loadSettings only accepts a stored key whose typeof
   * matches the default, and an unknown id falls back to the first tune in
   * configs/registry.js rather than throwing. */
  tune: 'betaflight-default',
  /* ACTUAL rates, owned by the pilot rather than by the tune. Betaflight
   * 4.5.1's own defaults; see configs/rates.js for why they live here. */
  rateMax: RATE_DEFAULTS.rateMax,
  rateYawMax: RATE_DEFAULTS.rateYawMax,
  rateCentre: RATE_DEFAULTS.rateCentre,
  rateExpo: RATE_DEFAULTS.rateExpo,
  /* Betaflight's throttle limit, SCALE type. 100 is off, which is what a
   * freshly flashed quad does, so that is where the menu starts. */
  throttleCap: RATE_DEFAULTS.throttleCap,
  /* Full rateprofile from the last FC Save or use-dump import. Empty
   * means ratesDiff five knobs, which is a first run and Karate keep-mine. */
  rateProfile: {},
  /* Betaflight ANGLE_MODE. 'acro' is the default and the radio default.
   * Keyboard flight always raises angle, regardless of this value. */
  flightMode: 'acro',
  cameraAngle: CAMERA_ANGLE_DEFAULT,
  cameraFov: CAMERA_FOV_DEFAULT,
  packVoltage: 4.2,
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
  /* Which record: 'rotation' walks the whole crate, a track id pins one.
   * A string so the typeof gate accepts it, and an unknown id falls back
   * to the first track in src/render/tracks.js. */
  musicTrack: 'rotation',
  focusTone: false,
  readout: false,
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
};

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
 * wrong in the other direction would put the two row screen in front of a
 * returning pilot, which is far worse than missing it once.
 */
function detectFirstRun() {
  try {
    if (localStorage.getItem(SETTINGS_KEY)) {
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

export function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch (e) {
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
  for (const [key, allowed] of [
    ['link', Object.keys(LINK_PRESETS)],
    ['cameraFov', CAMERA_FOVS],
    ['laps', LAP_COUNTS],
    ['packVoltage', PACK_VOLTAGES],
  ]) {
    if (!allowed.includes(s[key])) {
      s[key] = DEFAULTS[key];
    }
  }
  /* Angle is a range, not a list: a stored 40 from the old six-step menu
   * must survive, a stored 90 must not, and 45 has to be legal now. */
  s.cameraAngle = clampCameraAngle(s.cameraAngle);
  /* First run, or an older save from before this key existed: pick Low
   * on a Deck so the page is flyable, High everywhere else so the
   * authored look is what a new desktop player sees. A stored choice,
   * even a stale one, wins over detection. */
  if (!hadGraphics) {
    s.graphics = detectDefaultGraphics();
  } else {
    s.graphics = normalizeGraphics(s.graphics);
  }
  s.rateProfile = sanitiseRateProfile(s.rateProfile);
  return s;
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (e) {
    /* private mode: settings simply do not persist */
  }
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
  const nub = el('div', 'osd-nub');
  plate.append(nub);
  box.append(plate, el('div', 'osd-gimbal-cap', caption));
  return { box, nub };
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
  nub.style.left = `${50 + x * 50}%`;
  nub.style.top = `${50 - y * 50}%`;
}

/*
 * Both gimbal plates from a channel set. The clamp, the throttle rescale
 * from 0..1 to -1..1 and the pitch negate were written out twice, in the
 * flight overlay and in the calibration screen, which is two places to get
 * the pitch sign wrong in.
 */
function placeSticks(left, right, ch) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  placeNub(left.nub, clamp(ch.yaw), clamp(ch.throttle * 2 - 1));
  placeNub(right.nub, clamp(ch.roll), clamp(-ch.pitch));
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

function hintWithKeys(keys, text) {
  const n = el('div', 'hint');
  const ks = el('span', 'hint-keys');
  for (const k of keys) {
    ks.append(el('kbd', null, k));
  }
  n.append(ks, el('span', 'hint-copy', text));
  return n;
}

function wordmark() {
  const h = el('h1', 'wordmark');
  h.append(document.createTextNode('WEB'), el('span', 'fpv', 'FPV'));
  return h;
}

/*
 * First-time thumbnail wait. Recording a clip takes several seconds
 * (the city, longer). A blank card looks like a stall. Same copy as the
 * boot screen: "loading" and a joke. Cached visits never see it.
 */

/* A menu plus a side column for its note, so the note cannot resize the rows. */
function wrapMenu() {
  const stage = el('div', 'menu-stage');
  const menu = el('div', 'menu');
  const help = el('div', 'menu-help');
  stage.append(menu, help);
  return { stage, menu, help };
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

function toggle(label, note, on, set) {
  return choice(label, note, [true, false], on, (v) => (v ? 'On' : 'Off'), set);
}

function stepper(label, note, value, adjust) {
  return { label, note, value, adjust, step: true };
}

function hasLoadedTrack() {
  const seat = activeCourseSummary();
  return Boolean(seat && seat.doc && !isEmptyCanvas(seat.doc));
}

/* Screens whose choices are drawn as cards above the row list. The rows
 * that remain are whatever is not a card. */
function isCardScreen(screen) {
  return screen === 'courses';
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
function uploadAction(listing, { fastestMs, timePosted }) {
  const pending = readPendingTime();
  const shareId = listing && listing.shareId;
  const ms = Number.isFinite(fastestMs)
    ? fastestMs
    : (shareId && pending && pending.trackId === shareId ? pending.lapMs : null);
  if (timePosted && shareId) {
    const rank = timePosted.rank != null ? ` Rank ${timePosted.rank}.` : '';
    return {
      label: 'Time uploaded',
      action: 'posttime',
      disabled: true,
      note: `That lap is on the public board.${rank}`,
    };
  }
  if (!listing || !shareId) {
    return {
      label: 'Upload a time',
      action: 'posttime',
      disabled: true,
      note: 'Only a course on the board can hold a time. Publish this one first.',
    };
  }
  if (!listing.canPostTime) {
    return {
      label: 'Upload a time',
      action: 'posttime',
      disabled: true,
      note: 'The layout has changed since it was published. Update the course on the board first.',
    };
  }
  if (ms == null) {
    return {
      label: 'Upload a time',
      action: 'posttime',
      disabled: true,
      note: 'Fly a clean lap on this course and the lap appears here.',
    };
  }
  const best = readPostedBest(shareId);
  const isNew = best != null && ms < best;
  return {
    label: isNew ? `Upload new best, ${formatTime(ms)}` : `Upload ${formatTime(ms)}`,
    action: 'posttime',
    note: isNew
      ? 'Faster than the last time you uploaded from this browser. Sends this lap to the public board.'
      : 'Send this lap to the public board under your name.',
  };
}

function publishAction(listing, published) {
  if (published) {
    return {
      label: 'Published',
      action: 'leaderboard',
      note: 'This course is on the public board. Opens its page.',
    };
  }
  if (listing && listing.canPublishNew) {
    const of = listing.sourceName ? ` of ${listing.sourceName}` : '';
    const by = listing.sourceAuthor ? ` by ${listing.sourceAuthor}` : '';
    return {
      label: 'Publish this course',
      action: 'publishcourse',
      note: listing.remix
        ? `Your copy${of}${by}. Goes on the board under a new name. Then you can upload a time.`
        : 'Put this course on the public board. Then you can upload a time.',
    };
  }
  if (listing && listing.canUpdateListing && listing.layoutDrift) {
    return {
      label: 'Update this course',
      action: 'publishcourse',
      note: 'The layout changed. Updating the board will clear posted times, then you can upload a time.',
    };
  }
  if (listing && listing.kind === 'owned') {
    return {
      label: 'Publish this course',
      action: 'publishcourse',
      disabled: true,
      note: 'Already on the board, and nothing has changed since.',
    };
  }
  if (listing && listing.kind === 'community') {
    return {
      label: 'Publish this course',
      action: 'publishcourse',
      disabled: true,
      note: 'Somebody else published this one. Edit a copy to put your own version on the board.',
    };
  }
  return {
    label: 'Publish this course',
    action: 'publishcourse',
    disabled: true,
    note: listing && listing.kind === 'local'
      ? 'A course needs a flying order before it can be published. Set one in the track builder.'
      : 'Nothing to publish. Build a course, or pick one from the board.',
  };
}

function remixAction(listing) {
  if (listing && listing.canRemix) {
    const by = listing.author ? ` by ${listing.author}` : '';
    return {
      label: 'Edit a copy',
      action: 'remix',
      note: `Open ${listing.name}${by} in the track builder as your own course, under a new name.`,
    };
  }
  return {
    label: 'Edit a copy',
    action: 'remix',
    disabled: true,
    note: listing && listing.kind === 'owned'
      ? 'This one is already yours. Edit this course instead.'
      : 'Only a published course by somebody else can be copied.',
  };
}

function editOwnAction(listing) {
  if (listing && listing.kind === 'owned') {
    return {
      label: 'Edit this course',
      action: 'editown',
      note: 'Open this course in the track builder. A rename updates the name on the board. A layout change asks before clearing times.',
    };
  }
  return {
    label: 'Edit this course',
    action: 'editown',
    disabled: true,
    note: listing && listing.kind === 'community'
      ? 'Somebody else published this one. Edit a copy to make it yours.'
      : 'Nothing of yours on the board to edit.',
  };
}

function tuneItem(s) {
  return choice(
    'Tune',
    tuneById(s.tune).note,
    TUNES.map((t) => t.id),
    s.tune,
    (id) => tuneById(id).name,
    (id) => { s.tune = id; },
  );
}

function graphicsItem(s) {
  const id = normalizeGraphics(s.graphics);
  return choice(
    'Graphics',
    graphicsNote(id),
    GRAPHICS_IDS,
    id,
    graphicsLabel,
    (v) => { s.graphics = v; s.graphicsAuto = false; },
  );
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
  return {
    label: 'GPU',
    value: info.display,
    note: info.note,
    info: true,
  };
}

function padChooseNote(info) {
  const n = info && typeof info.count === 'number' ? info.count : 0;
  if (n <= 0) {
    return 'Plug in a radio in joystick mode. If more than one is plugged in, this is how you pick which one flies.';
  }
  if (n === 1) {
    return `One device is plugged in, ${info.using}. Open this to confirm it, or to switch to the keyboard.`;
  }
  return `${n} devices are plugged in. Move the one you want. Windows lists them in Game Controllers order; this screen is how you pick.`;
}

export class Ui {
  constructor(root) {
    this.root = root;
    this.settings = loadSettings();
    this.firstRun = detectFirstRun();
    /* Set while a guided first flight is in the air. main.js reads it. */
    this.guided = false;
    this.boardCourses = [];
    this.boardLoading = false;
    this.openingBoardCourse = false;
    this.onBoardCourse = null; /* (track) => Promise<boolean> */
    this.screen = 'title';
    this.cursor = 0;
    this.onAction = null;    /* (action, settings) => void */
    this.onSettings = null;  /* (settings) => void */
    this.onFcOpen = null;    /* (page) => void */
    this.onFcSave = null;    /* (draft, { restart, presetId }) => void */
    this.onFcImport = null;  /* (text, name, policy) => void */
    this.onFcAngle = null;   /* (on) => void, same sim_set_angle_mode as Settings */
    this.onFcMotor = null;   /* (motor, duty) => void, sim_motor_override */
    this.fc = new FcSession();
    this.fc.getFlightMode = () => (this.settings.flightMode === 'angle' ? 'angle' : 'acro');
    this.fc.setFlightMode = (on) => {
      this.settings.flightMode = on ? 'angle' : 'acro';
      saveSettings(this.settings);
      if (this.onFcAngle) {
        this.onFcAngle(Boolean(on));
      }
      this.renderMenu();
    };
    this.fc.motorTestAllowed = () => !this.fc.runActive && this.returnTo !== 'paused';
    this.fc.onMotorTest = (motor, duty) => {
      if (this.onFcMotor) {
        this.onFcMotor(motor, duty);
      }
    };
    this.onUiSound = null;   /* (kind) => void: 'move', 'adjust', 'select', 'back' */
    this.share = null;       /* published course this run is flying, or null */
    this.timePosted = null;  /* last successful post on the results screen */
    this.resultsFastest = null;
    this.resultsDocId = null;
    this.coursePublished = null;
    this.padPrev = { up: false, down: false, left: false, right: false, select: false, back: false };
    this.dropEl = null;
    this.dropIndex = null;
    this.menuRows = [];
    this.rowOffset = 0;
    this.reelFreezeWorld = false;
    this.gpuInfo = null;
    this.ptrX = null;
    this.ptrY = null;
    this.build();
    this.root.addEventListener('mousedown', (e) => {
      if (this.dropEl && !this.dropEl.contains(e.target) && !e.target.closest('.drop-btn')) {
        this.closeDrop();
      }
    });
    this.show('title');
  }

  build() {
    const r = this.root;
    r.textContent = '';

    /* Flight overlay: the on screen display a pilot actually reads. */
    this.osd = el('div', 'osd');
    /* The clock is a lap on the race field and an airtime in freestyle, and
     * an unlabelled number that means two different things is how a pilot
     * learns to distrust an instrument. */
    this.osdClockLabel = el('div', 'osd-label', 'Lap');
    this.osdTimer = el('div', 'osd-timer', '--.--');
    this.osdGate = el('div', 'osd-gate', '');
    this.osdBest = el('div', 'osd-best', '');
    this.osdLast = el('div', 'osd-best', '');
    const top = el('div', 'osd-top');
    top.append(this.osdClockLabel, this.osdTimer, this.osdGate, this.osdLast, this.osdBest);
    this.osdPack = el('div', 'osd-value', '');
    this.osdPackBar = el('div', 'bar-fill');
    const packBar = el('div', 'bar');
    packBar.append(this.osdPackBar);
    const packBlock = el('div', 'osd-corner osd-left');
    packBlock.append(el('div', 'osd-label', 'Pack'), this.osdPack, packBar);
    this.osdSpeed = el('div', 'osd-value', '');
    this.osdFlight = el('div', 'osd-sub osd-mode', '');
    this.osdAlt = el('div', 'osd-sub', '');
    this.osdThrBar = el('div', 'bar-fill warm');
    const thrBar = el('div', 'bar');
    thrBar.append(this.osdThrBar);
    const flightBlock = el('div', 'osd-corner osd-right');
    flightBlock.append(this.osdSpeed, this.osdFlight, this.osdAlt, el('div', 'osd-label', 'Throttle'), thrBar);
    const sticks = el('div', 'osd-sticks is-off');
    this.osdStickLeft = makeGimbal('Yaw, throttle');
    this.osdStickRight = makeGimbal('Roll, pitch');
    sticks.append(this.osdStickLeft.box, this.osdStickRight.box);
    this.osdSticks = sticks;
    this.osd.append(top, packBlock, flightBlock, sticks);
    r.append(this.osd);

    /* Centre banner: launch prompt, lap splits, crash notice, and the
     * stick calibration prompts, which have to read over a screen, so the
     * banner is appended after the screens rather than before. */
    this.banner = el('div', 'banner', '');
    /* Optional performance readout, off unless the player asks for it. */
    this.readout = el('div', 'readout', '');

    /* Screens. */
    this.screens = {};

    const title = el('div', 'screen screen-title');
    const copy = el('div', 'title-copy');
    const brand = el('div', 'brand');
    this.brandSub = el('div', 'brand-sub', '');
    brand.append(wordmark(), this.brandSub);
    this.titleBest = el('div', 'brand-best', '');
    brand.append(this.titleBest);
    this.keepNote = el('p', 'keep-note', 'Tracks you build stay in this browser. Clearing it, or another device, starts you from nothing. Publish a course to put it on the public board.');
    brand.append(this.keepNote);
    /* First run only. Replaced by the keep note once a lap has been flown. */
    this.firstNote = el('p', 'keep-note first-note', 'A quad has no brakes and no wings. Point it where you want to go and push. Two minutes and you will be through a gate.');
    brand.append(this.firstNote);
    const titleBlock = wrapMenu();
    this.titleMenu = titleBlock.menu;
    this.titleHelp = titleBlock.help;
    const titleFoot = el('div', 'title-foot');
    titleFoot.append(
      hintWithKeys(['↑↓', 'Enter'], 'Arrow keys move, Enter selects. A radio banks the quad. Any switch selects.'),
      titleBlock.stage,
    );
    copy.append(brand, titleFoot);
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
    howto.append(el('p', 'howto-lede', 'A quad has no brakes and no wings. Throttle only sets how hard the props push, so the way to slow down or turn is to point the quad somewhere else and push. Fly the pulsing gate: green is the way through, red is its wrong face.'));

    const howtoTabs = el('div', 'howto-tabs');
    this.howtoTabs = {};
    for (const [id, label] of [['keyboard', 'Keyboard'], ['radio', 'Radio or gamepad']]) {
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

    const howtoBlock = wrapMenu();
    this.howtoMenu = howtoBlock.menu;
    this.howtoHelp = howtoBlock.help;
    howto.append(howtoBlock.stage);
    this.screens.howto = howto;
    this.howtoSource = 'keyboard';
    this.renderHowto();

    const credits = el('div', 'screen screen-page screen-credits');
    credits.append(el('h2', null, 'Credits'));
    this.creditsRoll = el('div', 'credits-roll');
    fillCredits(this.creditsRoll, { assetBase: 'assets/credits' });
    const creditsBlock = wrapMenu();
    this.creditsMenu = creditsBlock.menu;
    this.creditsHelp = creditsBlock.help;
    credits.append(
      this.creditsRoll,
      creditsBlock.stage,
      hintWithKeys(['Esc'], 'Goes back. Arrow keys still move the menu.'),
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
     * "Race field" and "Freestyle city". What a world is like is not
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
    courses.append(el('h2', null, 'Courses'));
    this.worldStrip = el('div', 'card-strip');
    this.worldStrip.append(el('div', 'strip-label', 'Worlds'));
    this.mapCardHost = el('div', 'map-cards');
    this.worldStrip.append(this.mapCardHost);
    this.courseStrip = el('div', 'card-strip');
    this.courseStrip.append(el('div', 'strip-label', 'Most flown'));
    this.courseCardHost = el('div', 'map-cards course-cards');
    this.boardNote = el('div', 'board-note', '');
    this.courseStrip.append(this.courseCardHost, this.boardNote);
    const coursesBlock = wrapMenu();
    this.coursesMenu = coursesBlock.menu;
    this.coursesMenu.classList.add('menu-scroll');
    this.coursesHelp = coursesBlock.help;
    courses.append(
      this.worldStrip,
      this.courseStrip,
      coursesBlock.stage,
      hintWithKeys(['↑↓', 'Enter'], 'Arrow keys move, Enter chooses. On a radio: pitch to move, roll right to choose.'),
    );
    this.screens.courses = courses;

    const settings = el('div', 'screen screen-page screen-settings');
    settings.append(el('h2', null, 'Settings'));
    const settingsBlock = wrapMenu();
    this.settingsMenu = settingsBlock.menu;
    this.settingsMenu.classList.add('menu-scroll');
    this.settingsHelp = settingsBlock.help;
    this.craftSettingsFrame = el('div', 'craft-showcase-frame');
    this.craftSettingsFrame.append(this.craftCanvas);
    this.craftCaption = el('div', 'craft-showcase-cap', 'Acro. Sticks are rates. Hands off holds.');
    const showcase = el('div', 'craft-showcase');
    showcase.append(this.craftSettingsFrame, this.craftCaption);
    settingsBlock.stage.prepend(showcase);
    settings.append(settingsBlock.stage, el('div', 'hint', 'Mouse or arrow keys change a value. The quad follows the radio or gamepad.'));
    this.screens.settings = settings;

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
      document.createTextNode(' 10.10 colours and tabs, not that app. No Vue, no MSP, no iframe. Firmware is compiled '),
      bfLink,
      document.createTextNode(' 4.5.1. With thanks to the Betaflight developers. GPLv3.'),
    );
    fcHead.append(homage);
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
    this.fcCli = el('textarea', 'fc-cli');
    this.fcCli.spellcheck = false;
    this.fcCli.setAttribute('aria-label', 'Betaflight CLI dump');
    this.fcCli.hidden = true;
    this.fcCli.addEventListener('input', () => {
      this.fc.setDraft(this.fcCli.value);
      this.syncFcDirty();
    });
    this.fcCli.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.fcCli.blur();
      }
      e.stopPropagation();
    });
    this.fcAttitude = el('canvas', 'fc-attitude');
    this.fcAttitude.width = 220;
    this.fcAttitude.height = 220;
    this.fcAttitude.setAttribute('aria-label', 'Attitude');
    this.fcAttitude.hidden = true;
    fcWork.append(this.fcPages, fcBlock.stage, this.fcCli, this.fcAttitude);
    fcBody.append(this.fcTabs, fcWork);
    const fcStatus = el('div', 'fc-status', 'Connected: WASM  ·  Betaflight 4.5.1  ·  PID 1 kHz  ·  Profile 0  ·  Homage of Configurator 10.10, not that app');
    fc.append(fcHead, fcBody, fcStatus);
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
    this.calList = el('ol', 'cal-steps');
    const calBtns = el('div', 'cal-actions');
    this.calCancelBtn = btn('name-dialog-btn', 'Cancel');
    this.calSaveBtn = btn('name-dialog-btn on', 'Save mapping');
    this.calSaveBtn.disabled = true;
    this.calCancelBtn.addEventListener('click', () => this.act('calibrate-cancel'));
    this.calSaveBtn.addEventListener('click', () => this.act('calibrate-save'));
    calBtns.append(this.calCancelBtn, this.calSaveBtn);
    calibrate.append(
      this.calKicker,
      this.calPrompt,
      this.calHint,
      calSticks,
      this.calList,
      calBtns,
      hintWithKeys(['Esc'], 'Cancels. Nothing is saved until Save mapping.'),
    );
    this.screens.calibrate = calibrate;
    this.calCanSave = false;

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
      hintWithKeys(['Enter', 'Esc'], 'Enter uses the highlighted joystick. Escape is No, or skip if none is highlighted.'),
    );
    this.screens.padpick = padpick;
    this.padCardNodes = new Map();
    this.padInfo = { count: 0, using: 'Keyboard' };
    this.padPickReason = 'boot';
    this.padPickPhase = 'wiggle';

    const paused = el('div', 'screen screen-modal');
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
    this.resultsPlan = planCanvas(null, 'Course plan');
    this.resultsPlanWrap.append(this.resultsPlan);
    resultsTop.append(this.resultsPlanWrap);
    const resultsBlock = wrapMenu();
    this.resultsMenu = resultsBlock.menu;
    this.resultsHelp = resultsBlock.help;
    const resultsFoot = el('div', 'results-foot');
    resultsFoot.append(resultsBlock.stage);
    resultsCopy.append(resultsTop, resultsFoot);
    results.append(resultsCopy);
    this.screens.results = results;

    this.nameDialog = el('div', 'name-dialog');
    this.nameDialog.hidden = true;
    this.nameDialog.setAttribute('aria-modal', 'true');
    this.nameDialog.setAttribute('role', 'dialog');

    this.bugChip = btn('bug-chip', 'Report a bug');
    this.bugChip.title = 'F8 also opens this.';
    this.bugChip.addEventListener('click', () => this.openBugReport());

    for (const s of Object.values(this.screens)) {
      s.style.display = 'none';
      r.append(s);
    }
    r.append(this.banner, this.readout, this.bugChip, this.nameDialog);
    this.syncBugChip();
  }

  setShare(share) {
    this.share = share || null;
    this.timePosted = null;
    if (this.screen === 'title' || this.screen === 'courses' || this.screen === 'results') {
      this.renderMenu();
    }
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
   * A name is typed, not flown. The stick menu cannot enter one, so this is
   * a small overlay with a field. Resolves to the stored name, or null if
   * they cancel.
   */
  askName({ title, detail } = {}) {
    return this.askForm({
      title: title || 'Your name',
      detail: detail || 'Posted times and published courses carry this name. Changing it updates the board for courses you published from this browser.',
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
      }],
    }).then((values) => (values ? values.name : null));
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
    const done = this.nameWait;
    this.nameWait = null;
    this.bugFiling = false;
    if (done) {
      done(value);
    }
    this.syncBugChip();
    this.renderMenu();
  }

  syncBugChip() {
    if (!this.bugChip) {
      return;
    }
    const hide = this.nameDialog && !this.nameDialog.hidden;
    this.bugChip.hidden = hide;
    this.bugChip.classList.toggle('on-flight', this.screen === 'flight');
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
    return {
      href,
      screen: this.screen,
      map: s.map || '',
      courseId: (seat && (seat.shareId || (seat.doc && seat.doc.id))) || '',
      courseName: (seat && seat.name) || '',
      flightMode: s.flightMode || '',
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
    this.syncBugChip();

    const finish = (value) => {
      this.closeNameDialog(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
      }
    };
    this.nameWait = () => {};
    this.nameKeyHandler = onKey;
    this.nameDialog.addEventListener('keydown', onKey, true);
    this.nameClickHandler = (e) => {
      if (e.target === this.nameDialog) {
        finish(null);
      }
    };
    this.nameDialog.addEventListener('click', this.nameClickHandler);
    cancel.addEventListener('click', () => finish(null));
    send.addEventListener('click', async () => {
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
      send.disabled = true;
      send.textContent = 'Sending';
      try {
        const posted = await submitBug(payload);
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
        send.disabled = false;
        send.textContent = 'Send';
        err.textContent = e.message || 'The board could not take that report.';
      }
    });
    title.focus();
  }

  /* Menu definitions are rebuilt on show so values read correctly. */
  items() {
    const s = this.settings;
    if (this.screen === 'title') {
      /*
       * FIRST RUN IS TWO ROWS, not nine. Nothing here used to tell visit one
       * from visit one hundred, so a pilot who had never held a stick got the
       * same list as somebody coming back for a personal best, with the one
       * thing they needed sitting seventh. isFirstRun is a signal the product
       * already had and threw away: no stored settings, no lap on record.
       */
      if (this.firstRun) {
        return [
          {
            label: 'First flight',
            action: 'firstflight',
            primary: true,
            note: 'The race field, levelled off, with the sticks drawn on screen and a prompt at each step.',
          },
          {
            label: 'I have flown before',
            action: 'skipfirst',
            note: 'Straight to the full menu.',
          },
        ];
      }
      const m = MAPS.find((x) => x.id === s.map) ?? MAPS[0];
      const seat = m.id === 'custom' ? activeCourseSummary() : null;
      /*
       * NINE ROWS PLUS REPORT, ALWAYS. The course actions that used to
       * appear and vanish here live on the Courses screen and on Results,
       * where the course itself is what the player is looking at. Report a
       * bug is a stable last row so testers can send a ticket from title.
       */
      return [
        { label: 'Fly', action: 'fly', primary: true },
        {
          label: 'Course',
          value: seat ? seat.name : m.name,
          /* An action, not a value to step through. Choosing the map loads
           * one, which takes seconds, so stepping past a world with the
           * arrow key used to start building it. */
          action: 'courses',
          note: 'Worlds, your courses and the public board, in one place.',
        },
        tuneItem(s),
        { label: 'How to fly', action: 'howto', note: 'The sticks, live, and what the keys do.' },
        { label: 'Flight controller', action: 'fc', note: 'Betaflight 4.5.1 settings. Save writes a CLI dump. Grey options are named, not hidden.' },
        { label: 'Settings', action: 'settings' },
        {
          label: 'Leaderboard',
          action: 'leaderboard',
          note: 'The public board, with every course and its times. Opens in a new tab.',
        },
        {
          label: 'Credits',
          action: 'credits',
          note: 'Who made this, who flew it, and whose work it stands on.',
        },
        {
          label: 'Report a bug',
          action: 'reportbug',
          note: 'Opens a short form. The map, graphics and browser go with it. F8 does the same, including from flight.',
        },
      ];
    }
    if (this.screen === 'howto') {
      return [{ label: 'Back', action: 'back' }];
    }
    if (this.screen === 'credits') {
      return [{ label: 'Back', action: 'back' }];
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
      const listing = liveListing('custom');
      const loaded = hasLoadedTrack();
      const seat = loaded ? activeCourseSummary() : null;
      const cards = MAPS.filter((m) => m.id !== 'custom').map((m) => ({
        label: m.name,
        note: m.note,
        map: m,
        action: `map:${m.id}`,
      }));
      if (loaded && seat) {
        const chip = courseChip(listing);
        cards.push({
          label: seat.name,
          note: `${chip.note} ${seat.gates} gate${seat.gates === 1 ? '' : 's'}.`,
          course: { kind: 'current', seat, chip },
          action: 'map:custom',
        });
      }
      for (const t of this.boardCourses || []) {
        cards.push({
          label: t.name,
          note: t.author
            ? `Published by ${t.author}. Choosing it loads the course and flies it here.`
            : 'A published course. Choosing it loads the course and flies it here.',
          course: { kind: 'board', track: t },
          action: `board:${t.id}`,
        });
      }
      const rows = [
        {
          label: loaded ? 'Open in the track builder' : 'Build a course',
          action: 'trackbuilder',
          note: loaded
            ? 'Opens the track builder on the course above. New in there starts a blank one.'
            : 'Opens the track builder on an empty field.',
        },
        publishAction(listing, this.coursePublished),
        uploadAction(listing, { timePosted: this.timePosted }),
        remixAction(listing),
        editOwnAction(listing),
        {
          label: 'Open the board',
          action: 'leaderboard',
          note: 'The public page, with standings and every posted time. Opens in a new tab.',
        },
        { label: 'Back', action: 'back' },
      ];
      return [...cards, ...rows];
    }
    if (this.screen === 'settings') {
      const musicIds = ['rotation', ...TRACKS.map((t) => t.id)];
      const name = readPilotName();
      /*
       * Twenty rows in one undivided scroll, in an order that grew rather
       * than was chosen: a pilot's name sat next to a PID editor sat next to
       * a binaural tone. The headings are the groups the list already had.
       * `section: true` rows are not cursor stops, so arrowing down still
       * lands only on things that do something.
       */
      return [
        { label: 'Pilot', section: true },
        {
          label: 'Your name',
          value: name || 'Not set',
          action: 'setname',
          note: name
            ? 'Posted times and published courses carry this name. Changing it updates the board for courses you published from this browser.'
            : `Needed to publish a course or post a time. ${nameRules()}`,
        },
        { label: 'Flight', section: true },
        { label: 'Flight controller', action: 'fc', note: 'PID, filters and rates. Save writes a CLI dump into compiled Betaflight 4.5.1.' },
        {
          label: 'Rates',
          value: ratesSummary(s),
          action: 'fc-rates',
          note: 'Pilot rates. Changing a tune does not overwrite them. Opens the Rates page of the flight controller.',
        },
        choice(
          'Flight mode',
          'Acro: sticks are rates, hands off holds attitude. Angle: sticks are tilt, hands off levels. Keyboard flight always uses Angle. A radio uses this setting.',
          FLIGHT_MODES,
          s.flightMode === 'angle' ? 'angle' : 'acro',
          (id) => (id === 'angle' ? 'Angle' : 'Acro'),
          (id) => { s.flightMode = id; },
        ),
        { label: 'Camera', section: true },
        stepper(
          'Camera angle',
          `How far the camera tilts up from the airframe. ${CAMERA_ANGLE_MIN} is flat, looking along the nose. ${CAMERA_ANGLE_DEFAULT} is a typical cruise. 45 to ${CAMERA_ANGLE_MAX} is race. Left and right step one degree. The quad beside the list shows it.`,
          `${s.cameraAngle} degrees`,
          (d) => {
            s.cameraAngle = clampCameraAngle(s.cameraAngle + d);
          },
        ),
        choice(
          'Field of view',
          'Wider sees more, narrower magnifies. 75 matches what an FPV lens does to the middle of the frame; 85 gives some of that back for width.',
          CAMERA_FOVS,
          s.cameraFov,
          (n) => `${n} degrees vertical`,
          (n) => { s.cameraFov = n; },
        ),
        { label: 'Graphics', section: true },
        graphicsItem(s),
        gpuItem(this.gpuInfo),
        { label: 'Race', section: true },
        choice(
          'Pack charge',
          'A tired pack sags harder and gives less punch. Best laps are kept per charge level.',
          PACK_VOLTAGES,
          s.packVoltage,
          (n) => `${n.toFixed(2)} volts per cell`,
          (n) => { s.packVoltage = n; },
        ),
        choice(
          'Laps per run',
          'How many laps a run lasts before the result screen.',
          LAP_COUNTS,
          s.laps,
          (n) => `${n}`,
          (n) => { s.laps = n; },
        ),
        { label: 'Sound', section: true },
        toggle('Sound', 'All sound: motors, wind, music and cues.', s.sound, (v) => { s.sound = v; }),
        stepper('Volume', 'Overall level. Zero to ten.', `${s.volume}`, (d) => {
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
          'Generated drum and bass and lofi beds. Choose the record below.',
          s.musicLevel > 0 ? `${s.musicLevel}` : 'Off',
          (d) => { s.musicLevel = Math.max(0, Math.min(10, s.musicLevel + d)); },
        ),
        choice(
          'Music track',
          s.musicTrack === 'rotation'
            ? 'Every track in turn, drum and bass and lofi alternating.'
            : `${trackById(s.musicTrack).genre === 'dnb' ? 'Drum and bass' : 'Lofi'}, ${trackById(s.musicTrack).bpm} beats per minute.`,
          musicIds,
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
        { label: 'Sticks and diagnostics', section: true },
        {
          label: 'Choose joystick',
          value: (this.padInfo && this.padInfo.using) || 'Keyboard',
          action: 'choosepad',
          note: padChooseNote(this.padInfo),
        },
        toggle(
          'Performance readout',
          'Frame rate and draw counts, for tuning your machine.',
          s.readout,
          (v) => { s.readout = v; },
        ),
        { label: 'Calibrate sticks', action: 'calibrate', note: 'Centre, full range, then one named move per stick. Saved after you check it.' },
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
        toggle(
          'Flight log',
          'Record the run for download as a Betaflight blackbox CSV. Holds the whole flight in memory.',
          s.flightLog,
          (v) => { s.flightLog = v; },
        ),
        {
          label: 'Download flight log',
          action: 'downloadflightlog',
          note: 'Writes what was recorded as blackbox_decode CSV, which scripts/replay-log.js reads.',
        },
        { label: 'Back', action: 'back' },
      ];
    }
    if (this.screen === 'paused') {
      /* Nine rows, always, and Resume is the button. The conditional Edit a
       * copy that used to appear here belongs on the Courses screen. Report
       * a bug is the chip in the corner, or F8, so this list stays put. */
      return [
        { label: 'Resume', action: 'resume', primary: true },
        { label: 'Restart run', action: 'restart' },
        tuneItem(s),
        { label: 'Flight controller', action: 'fc', note: 'PID, filters and rates. Save during a run asks to restart.' },
        graphicsItem(s),
        { label: 'How to fly', action: 'howto' },
        { label: 'Settings', action: 'settings' },
        { label: 'Credits', action: 'credits', note: 'Who made this, who flew it, and whose work it stands on.' },
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
      if (this.osdMode === 'freestyle' || !listing) {
        return [
          { label: 'Fly again', action: 'restart', primary: true },
          { label: 'Back to title', action: 'title' },
        ];
      }
      return [
        { label: 'Fly again', action: 'restart', primary: true },
        uploadAction(listing, {
          fastestMs: this.resultsFastest,
          timePosted: this.timePosted,
        }),
        publishAction(listing, this.coursePublished),
        remixAction(listing),
        editOwnAction(listing),
        {
          label: 'Open the board',
          action: 'leaderboard',
          disabled: !(listing && (listing.published || listing.shareId || this.coursePublished)),
          note: listing && listing.name
            ? `The public page for ${listing.name}.`
            : 'The public board. A course has to be published before it has a page.',
        },
        { label: 'Back to title', action: 'title' },
      ];
    }
    if (this.screen === 'fc') {
      return this.fc.items();
    }
    return [];
  }

  renderMenu() {
    this.closeDrop();
    if (this.screen === 'courses') {
      this.renderMapCards();
      this.renderCourseCards();
    }
    if (this.screens && this.screens.title) {
      this.screens.title.classList.toggle('is-first', Boolean(this.firstRun));
    }
    const host = {
      title: this.titleMenu,
      howto: this.howtoMenu,
      credits: this.creditsMenu,
      courses: this.coursesMenu,
      settings: this.settingsMenu,
      fc: this.fcMenu,
      paused: this.pausedMenu,
      results: this.resultsMenu,
    }[this.screen];
    if (!host) {
      return;
    }
    const items = this.items();
    if (this.cursor >= items.length || !this.isStop(items[this.cursor])) {
      this.cursor = this.firstStop(items);
    }
    const scroll = host.scrollTop;
    host.textContent = '';
    /* The Courses screen draws its choices as cards above this menu, so the
     * rows here are only what is left over. */
    const rows = isCardScreen(this.screen)
      ? items.filter((it) => !it.map && !it.course)
      : items;
    const offset = items.length - rows.length;
    this.rowOffset = offset;
    this.menuRows = [];
    let fcBar = null;
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
      row.append(el('span', 'row-label', it.label));
      if (it.options) {
        row.append(this.makeDrop(it, i));
      } else if (it.step || it.adjust) {
        row.append(this.makeStepper(it, i));
      } else if (it.value != null) {
        const val = el('span', 'row-value', it.value);
        if (it.info) {
          val.title = it.value;
        }
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
         * the label only focuses them. Action rows still fire. */
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
    host.scrollTop = scroll;
    this.syncCursor(false);
    this.syncFcChrome();
  }

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
      if (this.fcPages) {
        paintPageStrip(this.fcPages, this.fc, (id) => {
          if (this.fc.confirm) {
            return;
          }
          this.fc.page = id;
          this.cursor = 0;
          this.renderMenu();
        });
      }
    }
    const confirm = Boolean(this.fc.confirm);
    const cliOn = on && this.fc.tab === 'cli' && !confirm;
    this.fcCli.hidden = !cliOn;
    if (cliOn && document.activeElement !== this.fcCli) {
      this.fcCli.value = this.fc.draft;
    }
    const setupOn = on && this.fc.tab === 'setup' && !confirm;
    this.fcAttitude.hidden = !setupOn;
    if (setupOn) {
      drawAttitude(this.fcAttitude, this.fc.attitude);
    }
    this.syncFcDirty();
  }

  syncFcDirty() {
    if (!this.fcDirty) {
      return;
    }
    this.fcDirty.textContent = this.fc.dirty() ? 'Unsaved' : '';
  }

  paintFcAttitude() {
    if (this.screen === 'fc' && this.fc.tab === 'setup' && !this.fc.confirm) {
      drawAttitude(this.fcAttitude, this.fc.attitude);
    }
  }

  helpNode() {
    return {
      title: this.titleHelp,
      howto: this.howtoHelp,
      credits: this.creditsHelp,
      courses: this.coursesHelp,
      settings: this.settingsHelp,
      fc: this.fcHelp,
      paused: this.pausedHelp,
      results: this.resultsHelp,
    }[this.screen];
  }

  syncCursor(scroll = true) {
    const items = this.items();
    this.menuRows.forEach((row, k) => {
      const i = k + this.rowOffset;
      row.classList.toggle('on', i === this.cursor);
    });
    const help = this.helpNode();
    if (help) {
      help.textContent = items[this.cursor]?.note || '';
    }
    const on = this.menuRows[this.cursor - this.rowOffset];
    if (scroll && on && typeof on.scrollIntoView === 'function') {
      on.scrollIntoView({ block: 'nearest' });
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
    this.setCursor(i);
  }

  setCursor(i) {
    if (i === this.cursor) {
      return;
    }
    this.closeDrop();
    this.cursor = i;
    if (this.screen === 'courses') {
      const worlds = this.mapCards || [];
      worlds.forEach((c, j) => c.card.classList.toggle('on', j === this.cursor));
      (this.courseCards || []).forEach((c, j) => {
        c.card.classList.toggle('on', j + worlds.length === this.cursor);
      });
    }
    this.syncCursor();
    if (this.onUiSound) {
      this.onUiSound('move');
    }
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

  makeDrop(it, i) {
    const wrap = el('div', 'row-control');
    const b = btn('drop-btn', it.value);
    b.setAttribute('aria-haspopup', 'listbox');
    b.setAttribute('aria-label', it.label);
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
    if (this.screen !== 'fc') {
      saveSettings(this.settings);
    }
    this.renderMenu();
    if (this.onUiSound) {
      this.onUiSound('adjust');
    }
    if (this.onSettings && this.screen !== 'fc') {
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
  renderMapCards() {
    const host = this.mapCardHost;
    if (!host) {
      return;
    }
    const items = this.items().filter((it) => it.map);
    if (!this.mapCards || this.mapCards.length !== items.length) {
      this.stopReels();
      host.textContent = '';
      this.mapCards = items.map((it, i) => {
        const card = el('div', 'map-card');
        const shot = el('div', 'map-reel');
        const body = el('div', 'map-card-body');
        const name = el('div', 'map-card-name', it.label);
        const tag = el('div', 'map-card-tag', '');
        const still = el('div', 'map-card-still', '');
        body.append(name, tag);
        card.append(shot, still, body);
        card.addEventListener('mousemove', (e) => this.hoverCursor(e, i));
        card.addEventListener('click', () => {
          this.cursor = i;
          this.select();
        });
        host.append(card);
        return {
          card, shot, tag, still, name, id: it.map.id, liveCanvas: null,
        };
      });
      this.startReels();
    }
    this.mapCards.forEach((c, i) => {
      c.card.classList.toggle('on', i === this.cursor);
      c.tag.textContent = c.id === this.settings.map ? 'Flying now' : '';
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
        const card = el('div', 'map-card course-card');
        const shot = el('div', 'map-reel');
        const plan = it.course.kind === 'board'
          ? it.course.track.plan
          : currentPlan();
        const canvas = planCanvas(plan, `Plan of ${it.label}`);
        shot.append(canvas);
        const body = el('div', 'map-card-body');
        const name = el('div', 'map-card-name', it.label);
        const meta = el('div', 'map-card-meta', '');
        if (it.course.kind === 'board') {
          const t = it.course.track;
          const bits = [t.author ? `by ${t.author}` : '', `${t.gates} gate${t.gates === 1 ? '' : 's'}`];
          if (t.recordMs != null) {
            bits.push(`record ${formatTime(t.recordMs)}`);
          }
          meta.textContent = bits.filter(Boolean).join('  ');
        } else {
          const size = fieldSize(plan);
          meta.textContent = [`${it.course.seat.gates} gate${it.course.seat.gates === 1 ? '' : 's'}`, size]
            .filter(Boolean)
            .join('  ');
        }
        const chip = el('div', 'course-chip', '');
        if (it.course.chip) {
          chip.textContent = it.course.chip.label;
          chip.classList.add(`tone-${it.course.chip.tone}`);
        } else {
          chip.textContent = 'On the board';
          chip.classList.add('tone-live');
        }
        const tag = el('div', 'map-card-tag', '');
        body.append(name, tag);
        card.append(shot, chip, body, meta);
        card.addEventListener('mousemove', (e) => this.hoverCursor(e, i));
        card.addEventListener('click', () => {
          this.cursor = i;
          this.select();
        });
        host.append(card);
        return { card, canvas, tag, kind: it.course.kind };
      });
      this.paintCoursePlans();
    }
    this.courseCards.forEach((c, k) => {
      const i = k + offset;
      c.card.classList.toggle('on', i === this.cursor);
      c.tag.textContent = c.kind === 'current' && this.settings.map === 'custom' ? 'Flying now' : '';
    });
  }

  /* A canvas reports no size until it is laid out, so the first paint waits
   * for the frame after the cards are in the document. */
  paintCoursePlans() {
    if (!this.courseCards || !this.courseCards.length) {
      return;
    }
    requestAnimationFrame(() => {
      for (const c of this.courseCards || []) {
        drawPlan(c.canvas, c.canvas.planData, {});
      }
    });
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
        const rest = list.filter((t) => t.id !== seatId);
        this.boardCourses = pickFeaturedTracks(rest, 5);
        if (this.boardCourses.length) {
          this.boardNote.textContent = rest.length > this.boardCourses.length
            ? 'Five from the board. Open the board for every course.'
            : '';
        } else if (list.length) {
          /* The only listing is the course already on a card above. */
          this.boardNote.textContent = '';
        } else {
          this.boardNote.textContent = 'No published courses on the board yet. Build one and publish it.';
        }
        if (this.screen === 'courses') {
          this.renderMenu();
        }
      })
      .catch(() => {
        this.boardLoading = false;
        this.boardCourses = [];
        this.boardNote.textContent = 'The board is not answering, so only your own courses are listed.';
        if (this.screen === 'courses') {
          this.renderMenu();
        }
      });
  }

  /*
   * Start the thumbnails. Cached clips play immediately. A miss records
   * once, one world at a time, then the iframe (or the live copy of the
   * title view) is thrown away.
   */
  startReels() {
    this.stopReels();
    const cards = this.mapCards ?? [];
    const current = this.settings.map;
    const ac = new AbortController();
    const session = { ac, urls: [], unsub: [] };
    this.reelSession = session;
    this.reelFreezeWorld = false;

    const onVis = () => {
      const hide = document.hidden || this.screen !== 'courses';
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
      c.liveCanvas = null;
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
      const currentMiss = misses.filter((c) => c.id === current);
      const otherMiss = misses.filter((c) => c.id !== current);
      for (const c of currentMiss) {
        if (this.reelSession !== session) {
          return;
        }
        await this.captureCurrentCard(c, session);
      }
      for (const c of otherMiss) {
        if (this.reelSession !== session) {
          return;
        }
        await this.captureRemoteCard(c, session);
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
    c.liveCanvas = null;
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
   * The world already on screen is the title shot. Copy it into a 480p
   * canvas for a few seconds rather than loading the same map a second
   * time, then keep the clip.
   */
  async captureCurrentCard(c, session) {
    const canvas = el('canvas', 'map-reel-view');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = CLIP_W;
    canvas.height = CLIP_H;
    canvas.dataset.clip = '1';
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.fillStyle = '#1a241c';
      ctx.fillRect(0, 0, CLIP_W, CLIP_H);
    }
    c.shot.append(canvas);
    c.liveCanvas = canvas;
    c.still.textContent = '';
    this.showReelWait(c, session);
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
        const blob = await recordCanvasStream(canvas, CLIP_MS_MAX, session.ac.signal);
        await putClip(c.clipKey, blob);
        if (this.reelSession !== session) {
          return;
        }
        this.attachClip(c, blob, session);
      });
    } catch (e) {
      if (e && e.name === 'AbortError') {
        return;
      }
      c.wait = null;
      c.waitJoke = null;
      c.shot.replaceChildren();
      c.still.textContent = 'Preview unavailable.';
    } finally {
      c.liveCanvas = null;
    }
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
        frame.src = `/src/share/orbit.html?map=${encodeURIComponent(c.id)}`;
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
   * Copy the title view onto the card for the world that is already loaded,
   * and onto the recorder, while a first clip is being made. After that
   * there is nothing to copy: the cards are videos.
   */
  paintMapThumbs(src) {
    if (this.screen !== 'courses' || !this.mapCards) {
      return;
    }
    const sw = src.width;
    const sh = src.height;
    if (!(sw > 0 && sh > 0)) {
      return;
    }
    for (const c of this.mapCards) {
      const dest = c.liveCanvas;
      if (!dest) {
        continue;
      }
      if (dest.dataset.clip !== '1') {
        const dw = Math.max(1, dest.clientWidth);
        const dh = Math.max(1, dest.clientHeight);
        if (dest.width !== dw || dest.height !== dh) {
          dest.width = dw;
          dest.height = dh;
        }
      }
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
      } catch (e) {
        /* A tainted read would take the frame with it. */
      }
    }
  }

  stopReels() {
    this.reelFreezeWorld = false;
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
        c.liveCanvas = null;
        c.clip = null;
        if (c.shot) {
          c.shot.replaceChildren();
        }
      }
    }
  }

  show(screen) {
    this.closeDrop();
    if (this.screen === 'courses' && screen !== 'courses') {
      /* Nothing draws a thumbnail for a screen nobody is looking at. */
      this.stopReels();
      this.mapCards = null;
      this.courseCards = null;
      this.courseCardKey = null;
    }
    this.screen = screen;
    /* this.screen is already the new one, so items() describes where we are
     * going. Settings opens on its first real row rather than on a heading. */
    this.cursor = this.firstStop(this.items());
    if (screen === 'courses') {
      this.loadBoardCourses();
    }
    if (screen === 'howto') {
      this.renderHowto();
    }
    for (const [name, node] of Object.entries(this.screens)) {
      node.style.display = name === screen ? '' : 'none';
    }
    /* Paused keeps the flight display up, dimmed: the lap clock and the
     * pack are what the player paused to look at. */
    this.osd.style.display = screen === 'flight' || screen === 'paused' ? '' : 'none';
    this.osd.className = screen === 'paused' ? 'osd dim' : 'osd';
    this.renderMenu();
    this.syncBugChip();
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
  openBoardCourse(id) {
    const track = (this.boardCourses || []).find((t) => t.id === id);
    if (!track || this.openingBoardCourse) {
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
      this.boardNote.textContent = '';
      this.act('map:custom');
    }).catch((err) => {
      this.openingBoardCourse = false;
      this.boardNote.textContent = `${track.name} could not be loaded. ${err.message ?? err}`;
    });
  }

  /*
   * The tutorial's one column, and the sticks above it. Rebuilt rather than
   * toggled because it is six lines of type and a switch nobody flips twice.
   */
  setHowtoSource(id) {
    this.howtoSource = id === 'radio' ? 'radio' : 'keyboard';
    this.renderHowto();
    if (this.onUiSound) {
      this.onUiSound('adjust');
    }
  }

  renderHowto() {
    if (!this.howtoKeys) {
      return;
    }
    const radio = this.howtoSource === 'radio';
    for (const [id, b] of Object.entries(this.howtoTabs)) {
      b.classList.toggle('on', (id === 'radio') === radio);
    }
    this.howtoKeys.textContent = '';
    const rows = radio
      ? [
        ['Left stick', 'Throttle up and down, yaw left and right. Mode 2, as on your radio.'],
        ['Right stick', 'Pitch forward and back, roll left and right.'],
        ['Before you fly', 'Put the radio in joystick mode before loading this page, then run Calibrate sticks in Settings.'],
        ['In the menus', 'Pitch moves the cursor, roll right selects, roll left goes back.'],
        ['Acro', 'Hands off holds the attitude you left it in. Every turn has to be flown back out again.'],
      ]
      : [
        ['W and S', 'Throttle. Tap for a nudge, hold to climb, long hold to punch. Let go and it holds height.'],
        ['A and D', 'Yaw, left and right on the spot.'],
        ['Up and down', 'Pitch. Up is stick forward, nose down, fly forward.'],
        ['Left and right', 'Roll.'],
        ['R, then Escape', 'Back to the start line, and pause.'],
        ['F8', 'Report a bug. Pauses if you are in the air, then opens the form.'],
      ];
    for (const [k, v] of rows) {
      this.howtoKeys.append(el('dt', null, k), el('dd', null, v));
    }
    this.howtoLive.textContent = radio
      ? 'Move your sticks. These follow the radio.'
      : 'Press the keys. These follow your hands.';
    this.howtoMode.textContent = radio
      ? 'A radio flies Acro by default: the sticks ask for a rate of rotation, and letting go asks for none, which holds whatever attitude the quad is in. Change it under Flight mode in Settings.'
      : 'Keys are on or off, so hold time is the analog: a tap moves the stick a little, a hold sits at a flyable amount, a long hold goes to full. Keyboard flight is Angle, so letting go brings the quad back to level.';
  }

  /* Live channels for the tutorial's gimbals, fed by the shell's loop. */
  setHowtoSticks(ch) {
    if (!this.howtoStickLeft || this.screen !== 'howto') {
      return;
    }
    placeSticks(this.howtoStickLeft, this.howtoStickRight, ch);
  }

  setCraftCaption(text) {
    if (this.craftCaption) {
      this.craftCaption.textContent = text;
    }
  }

  isModal() {
    return this.screen !== 'flight';
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
    const freestyle = this.osdMode === 'freestyle';
    const m = MAPS.find((x) => x.id === this.settings.map) ?? MAPS[0];
    if (this.brandSub) {
      this.brandSub.textContent = freestyle ? `${m.name}, free flight` : `${m.name}, time trial`;
    }
    this.titleBest.textContent = '';
    if (freestyle) {
      this.titleBest.textContent = 'No gates, no clock, no lap';
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
  showResults(log, best, recordAtStart) {
    this.resultsBody.textContent = '';
    this.resultsNote.textContent = '';
    const clean = log.filter((l) => Number.isFinite(l.ms)).map((l) => l.ms);
    const fastest = clean.length ? Math.min(...clean) : null;
    const slowest = clean.length ? Math.max(...clean) : null;
    const hadRecord = recordAtStart != null && Number.isFinite(recordAtStart);
    const isRecord = fastest != null && (!hadRecord || fastest < recordAtStart);
    const matched = fastest != null && hadRecord && fastest === recordAtStart;
    const screen = this.screens.results;
    screen.classList.toggle('is-record', Boolean(isRecord));
    screen.classList.toggle('is-empty', !clean.length);
    screen.classList.remove('is-in');
    void screen.offsetWidth;
    screen.classList.add('is-in');

    this.resultsKicker.textContent = this.resultsCourseName();
    if (!clean.length) {
      this.resultsHead.textContent = 'Run ended';
      this.resultsHeroTime.textContent = '';
      this.resultsHeroMeta.textContent = '';
      this.resultsHeroMeta.className = 'results-hero-meta';
      this.resultsBody.append(el('p', 'results-empty', 'No clean lap this run. Hitting the ground or a gate frame costs the time it takes to get going again. Only an out of sequence gate voids the lap and sends you back to the mint ring.'));
    } else {
      this.resultsHead.textContent = isRecord
        ? 'New track record'
        : (matched ? 'Matched the record' : 'Run complete');
      this.resultsHeroCap.textContent = clean.length === 1 ? 'Lap time' : 'Best lap';
      this.resultsHeroTime.textContent = formatTime(fastest);
      if (isRecord && hadRecord) {
        this.resultsHeroMeta.textContent = `${formatDelta(fastest - recordAtStart)}  previous ${formatTime(recordAtStart)}`;
        this.resultsHeroMeta.className = 'results-hero-meta gain';
      } else if (isRecord) {
        this.resultsHeroMeta.textContent = 'First record on this course';
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
    if (clean.length > 1) {
      const total = clean.reduce((a, b) => a + b, 0);
      const row = el('div', 'result-row total');
      const main = el('div', 'result-main');
      main.append(el('span', 'result-label', clean.length === log.length ? 'Total' : 'Clean laps total'));
      main.append(el('span', 'result-time', formatTime(total)));
      row.append(main);
      this.resultsBody.append(row);
    }
    /* The note is about the course that was FLOWN. It used to read
     * inspectCourse unconditionally, so a lap on the race field came back
     * with a line about whatever course happened to be on the builder's
     * canvas, named and everything. */
    if (this.settings.map !== 'custom') {
      this.resultsNote.textContent = '';
    } else if (this.share && this.share.id) {
      const by = this.share.author ? ` by ${this.share.author}` : '';
      this.resultsNote.textContent = `${this.share.name || 'This course'}${by} is on the public board. Upload a time under your name to appear on it.`;
    } else {
      try {
        const listing = inspectCourse();
        if (listing && listing.kind === 'remix') {
          const of = listing.sourceName ? ` of ${listing.sourceName}` : '';
          this.resultsNote.textContent = `${listing.name} is your copy${of}. Publish it under a new name to put it on the board.`;
        } else if (listing && listing.kind === 'local' && listing.canPublishNew) {
          this.resultsNote.textContent = `${listing.name} lives in this browser. Publish it to put it on the board, then you can upload a time.`;
        } else if (listing && listing.kind === 'owned' && listing.layoutDrift) {
          this.resultsNote.textContent = `${listing.name} has a layout that is not on the board yet. Update the course before uploading a time.`;
        }
      } catch (e) {
        /* A summary failure must not hide the times. */
      }
    }
    this.timePosted = null;
    this.coursePublished = null;
    this.resultsFastest = fastest;
    /* Which course this lap was flown on. The time and the document have to
     * travel together: publishing a DIFFERENT course while these results are
     * still on screen used to hand the new course this lap. */
    this.resultsDocId = null;
    if (fastest != null) {
      try {
        const listing = inspectCourse();
        this.resultsDocId = listing && listing.doc ? listing.doc.id : null;
        if (listing && listing.canPostTime && listing.shareId) {
          writePendingTime({ trackId: listing.shareId, lapMs: fastest });
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
  }

  setBanner(text, panelled = false) {
    this.banner.textContent = text || '';
    this.banner.style.opacity = text ? '1' : '0';
    this.banner.className = panelled ? 'banner panel' : 'banner';
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
   *   AIRTIME, not a lap. Freestyle is flown in packs, and how long you have
   *   been up is the number that decides when to come home. It is paired with
   *   the pack bar, which is the other half of the same decision.
   *   ALTITUDE ABOVE THE GROUND UNDER THE CRAFT. This one is not optional in
   *   a city. Cross one street and the surface under you moves seven metres,
   *   from the road to the overbridge deck; a height measured from the spawn,
   *   which is what this used to show, is a number that means nothing over a
   *   roof. The shell measures it against the surface query the collision
   *   test uses, so the readout and the thing that kills you agree.
   *   Speed, pack and throttle are the same in both, because they are
   *   properties of the machine and not of the game around it.
   */
  setOsd({ mode, lapMs, lastLapMs, gate, gateCount, gateCue, volts, packFrac, altitude, speedKph, throttle, flightMode }) {
    const freestyle = mode === 'freestyle';
    /* Before the first gate there is no lap to time, so the clock reads
     * zero and dims rather than showing a row of dashes. */
    const running = lapMs != null && Number.isFinite(lapMs);
    this.osdClockLabel.textContent = freestyle ? 'Airtime' : 'Lap';
    this.osdTimer.textContent = running ? formatTime(lapMs) : '0.00';
    this.osdTimer.className = running ? 'osd-timer' : 'osd-timer waiting';
    if (freestyle) {
      this.osdGate.textContent = '';
    } else if (gateCue) {
      this.osdGate.textContent = `Gate ${gate} of ${gateCount}, ${gateCue}`;
    } else {
      this.osdGate.textContent = `Gate ${gate} of ${gateCount}`;
    }
    this.osdPack.textContent = `${volts.toFixed(1)} volts`;
    this.osdLast.textContent = !freestyle && lastLapMs != null ? `Last lap ${formatTime(lastLapMs)}` : '';
    this.osdPackBar.style.width = `${Math.max(0, Math.min(1, packFrac)) * 100}%`;
    this.osdSpeed.textContent = `${speedKph.toFixed(0)} km/h`;
    if (this.osdFlight) {
      this.osdFlight.textContent = flightMode === 'angle' ? 'Angle' : 'Acro';
    }
    this.osdAlt.textContent = `${altitude.toFixed(1)} m above the ground`;
    this.osdThrBar.style.width = `${Math.max(0, Math.min(1, throttle)) * 100}%`;
  }

  /*
   * Keyboard stick ghost. Mode 2: left is yaw (x) and throttle (y, idle
   * at the bottom), right is roll (x) and pitch (y, stick forward is up,
   * matching the radio and the up arrow). Hidden when a radio is the
   * stick source.
   */
  setStickOverlay({ show, roll, pitch, yaw, throttle }) {
    if (!this.osdSticks) {
      return;
    }
    this.osdSticks.className = show ? 'osd-sticks' : 'osd-sticks is-off';
    if (!show) {
      return;
    }
    placeSticks(this.osdStickLeft, this.osdStickRight, { yaw, throttle, roll, pitch });
  }

  setCalibration(view) {
    if (!this.calPrompt) {
      return;
    }
    if (!view) {
      this.calCanSave = false;
      if (this.calSaveBtn) {
        this.calSaveBtn.disabled = true;
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
    const ch = view.channels || { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    placeSticks(this.calStickLeft, this.calStickRight, ch);
    /* The ORDER is input.js's CAL_STEPS, imported rather than re-typed:
     * this list used to restate it, so a step added to the calibration
     * would have run without ever appearing in the list beside it. Only the
     * wording is the UI's business. */
    this.calList.textContent = '';
    CAL_STEPS.forEach((id, i) => {
      const li = el('li', null, CAL_LABELS[id] ?? id);
      if (id === view.step) {
        li.className = 'on';
      } else if (i < view.stepIndex) {
        li.className = 'done';
      }
      this.calList.append(li);
    });
  }

  setPadInfo(info) {
    this.padInfo = info || { count: 0, using: 'Keyboard' };
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
    this.padHint.textContent = view.hint;
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
      const ax = pad.axes || [0, 0, 0, 0];
      const clamp = (v) => Math.max(-1, Math.min(1, v));
      placeNub(node.left.nub, clamp(ax[0]), clamp(-ax[1]));
      placeNub(node.right.nub, clamp(ax[2]), clamp(-ax[3]));
    }
  }

  persistSettings() {
    saveSettings(this.settings);
  }

  setGpuInfo(info) {
    this.gpuInfo = info || null;
    if (this.screen === 'settings') {
      this.renderMenu();
    }
  }

  setReadout(lines) {
    /*
     * 'block', not ''. The stylesheet's own rule for .readout is
     * `display: none`, so clearing the inline style hands the element back
     * to that rule and it stays hidden. The setting has therefore never
     * shown anything since the rule was written: the text was being
     * computed and written every frame into an element nobody could see.
     */
    this.readout.style.display = this.settings.readout ? 'block' : 'none';
    this.readout.textContent = this.settings.readout ? lines : '';
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

  firstStop(items) {
    const i = items.findIndex((it) => this.isStop(it));
    return i < 0 ? 0 : i;
  }

  move(dir) {
    const items = this.items();
    const n = items.length;
    if (!n) {
      return;
    }
    let next = (this.cursor + dir + n) % n;
    /* Step over headings. Bounded by n so a list of nothing but headings
     * cannot spin here. */
    for (let guard = 0; guard < n && !this.isStop(items[next]); guard += 1) {
      next = (next + dir + n) % n;
    }
    this.setCursor(next);
  }

  adjust(dir) {
    const it = this.items()[this.cursor];
    if (it && it.adjust) {
      it.adjust(dir);
      if (this.screen !== 'fc') {
        saveSettings(this.settings);
      }
      this.renderMenu();
      if (this.onUiSound) {
        this.onUiSound('adjust');
      }
      if (this.onSettings && this.screen !== 'fc') {
        this.onSettings(this.settings);
      }
    }
  }

  select() {
    const it = this.items()[this.cursor];
    if (!it) {
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
    if (it.adjust) {
      this.adjust(1);
      return;
    }
    if (this.onUiSound) {
      this.onUiSound('select');
    }
    this.act(it.action);
  }

  back() {
    if (this.dropEl) {
      this.closeDrop();
      if (this.onUiSound) {
        this.onUiSound('back');
      }
      return;
    }
    if (this.screen === 'title' || this.screen === 'flight') {
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
      if (this.fc.confirm === 'import-rates') {
        this.act('fc-import-cancel');
        return;
      }
      if (this.fc.confirm) {
        this.fc.confirm = null;
        this.cursor = 0;
        this.renderMenu();
        return;
      }
      this.act('fc-back');
      return;
    }
    this.act(this.returnTo === 'paused' ? 'paused' : 'title');
  }

  act(action) {
    /* The track builder is a separate page, so this is a navigation rather
     * than a screen. It has to be here and not in main.js's action handler
     * because leaving the page tears the simulator down, which is the whole
     * point: the builder shares no module, no canvas and no state with the
     * flight model, only the track document its schema.md describes. */
    if (action === 'trackbuilder') {
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
      window.location.href = 'src/trackbuilder/index.html';
      return;
    }
    /* Leaderboard and Choose new map are the same page. The board's
     * Fly this course already opens the sim in a new tab, so this tab
     * has to stay put. Navigating away here left the pilot with no sim
     * and a second one from Fly. share.board is the board origin when
     * a published course is loaded, otherwise the default board. */
    if (action === 'leaderboard') {
      window.open(boardPageUrl(this.share && this.share.board), '_blank', 'noopener');
      return;
    }
    if (action === 'reportbug') {
      this.openBugReport();
      return;
    }
    /*
     * First run. Choosing the first flight is also the moment the shell stops
     * being a first run, so the full menu is there when the player comes back
     * from the field, whatever happened out there.
     */
    if (action === 'firstflight' || action === 'skipfirst') {
      this.firstRun = false;
      this.settings.map = 'field';
      saveSettings(this.settings);
      this.renderMenu();
      if (action === 'skipfirst') {
        return;
      }
      this.guided = true;
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
      if (this.onAction) {
        this.onAction('fly', this.settings);
      }
      return;
    }
    /* A published course, chosen from the grid rather than from another tab. */
    if (action.startsWith('board:')) {
      this.openBoardCourse(action.slice('board:'.length));
      return;
    }
    if (action === 'howto' || action === 'settings' || action === 'courses' || action === 'credits') {
      this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
      this.show(action);
      return;
    }
    if (action === 'fc' || action === 'fc-rates') {
      this.returnTo = this.screen === 'paused'
        ? 'paused'
        : (this.screen === 'settings' ? 'settings' : 'title');
      if (this.onFcOpen) {
        this.onFcOpen(action === 'fc-rates' ? 'rates' : 'pid');
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
    if (action === 'fc-save-restart') {
      this.fc.confirm = null;
      this.fc.stopMotors();
      if (this.onFcSave) {
        this.onFcSave(this.fc.draft, { restart: true, presetId: this.fc.presetId });
      }
      return;
    }
    if (action === 'fc-wait') {
      this.fc.confirm = null;
      this.cursor = 0;
      this.renderMenu();
      return;
    }
    if (action === 'fc-import-keep' || action === 'fc-import-dump') {
      const policy = action === 'fc-import-keep' ? 'keep-mine' : 'use-dump';
      const text = this.fc.importText;
      const name = this.fc.importName;
      this.fc.confirm = null;
      if (this.onFcImport) {
        this.onFcImport(text, name, policy);
      }
      return;
    }
    if (action === 'fc-import-cancel') {
      this.fc.confirm = null;
      this.fc.discard();
      this.act('fc-back');
      return;
    }
    if (action === 'fc-focus-cli') {
      this.fcCli.hidden = false;
      this.fcCli.value = this.fc.draft;
      this.fcCli.focus();
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
      this.fc.stopMotors();
      this.fc.discard();
      const dest = this.returnTo === 'paused' || this.returnTo === 'settings'
        ? this.returnTo
        : 'title';
      this.show(dest);
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
      this.settings.map = id;
      saveSettings(this.settings);
      this.show(this.returnTo === 'paused' ? 'paused' : 'title');
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
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
    if (action === 'title' || action === 'paused') {
      this.show(action);
    }
    if (this.onAction) {
      this.onAction(action, this.settings);
    }
  }

  /* Returns true when the key was a menu key and the shell should not
   * treat it as a flight control. repeat is the browser's key-repeat
   * flag: a held or quickly tapped arrow must step the cursor, but Enter
   * and Escape must not fire again. */
  handleKey(code, repeat = false) {
    if (this.nameDialog && !this.nameDialog.hidden) {
      return true;
    }
    if (this.screen === 'fc' && this.fcCli && document.activeElement === this.fcCli) {
      if (code === 'Escape') {
        this.fcCli.blur();
      }
      return true;
    }
    const nav = code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight'
      || code === 'KeyW' || code === 'KeyS' || code === 'KeyA' || code === 'KeyD';
    if (repeat && !nav) {
      return this.screen !== 'flight';
    }
    if (code === 'F3') {
      this.settings.readout = !this.settings.readout;
      saveSettings(this.settings);
      this.setReadout('');
      return true;
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
      if (isCardScreen(this.screen)) {
        this.move(-1);
      } else {
        this.adjust(-1);
      }
      return true;
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      if (isCardScreen(this.screen)) {
        this.move(1);
      } else {
        this.adjust(1);
      }
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
    const now = {
      up: Boolean(nav.up),
      down: Boolean(nav.down),
      right: Boolean(nav.right),
      left: Boolean(nav.left),
      select: Boolean(nav.select),
      back: Boolean(nav.back),
    };
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
     * Title and Settings pose the airframe from the live stick channels.
     * Pitch and roll that fly it used to step the cursor. Keyboard owns
     * the rows; a radio switch still selects on the title so Fly is one
     * flick away. The pad is tracked so a held stick does not fire an
     * edge the moment the screen closes.
     */
    if (this.screen === 'settings' || this.screen === 'title') {
      if (this.screen === 'title' && now.select && !this.padPrev.select) {
        this.select();
      }
      this.padPrev = now;
      return;
    }
    const it = this.items()[this.cursor];
    const rollAdjusts = Boolean(it && it.adjust);
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
