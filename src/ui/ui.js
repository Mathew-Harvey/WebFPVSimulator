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
import { TRACKS, trackById, musicIds } from '../render/tracks.js';
import { CUSTOM_TUNE, TUNES, tuneById } from '../../configs/registry.js';
import {
  RATE_DEFAULTS,
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
  ratesFromLegacy,
  ratesSummary,
} from '../../configs/rates.js';
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
import { boardPageUrl, fetchTrackList, pickFeaturedTracks } from '../share/board.js';
import { BOARD_WINDOW, openNamedWindow } from '../share/windows.js';
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
  cameraTiltRad,
  clampCameraAngle,
} from '../render/lens.js';
import { JOKE_MS, quotedJoke } from './loading.js';
import { fillCredits } from './credits.js';
import { mountRatesPanel } from './ratespanel.js';
import { mountPidsPanel } from './pidspanel.js';
import { touchWanted } from '../input/touchsticks.js';
import {
  downloadCli, drawAttitude, FcSession, paintPageStrip, paintTabStrip,
} from './fc.js';
import { FC_DUMP_KEY } from '../fc/dump.js';

/* Whether a Flight controller save exists, which is what puts Your edits
 * on the Tune row. Read fresh each time: the pilot can save one two rows
 * away from the row that offers it. */
function hasFcDump() {
  try {
    return Boolean(localStorage.getItem(FC_DUMP_KEY));
  } catch (e) {
    return false;
  }
}

/* The tune ids the row can offer right now. */
function tuneChoices() {
  return [...TUNES.map((t) => t.id), ...(hasFcDump() ? [CUSTOM_TUNE.id] : [])];
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
export const LAP_COUNTS = [1, 3, 5];
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
   * Whether the flight feel question has been offered. It offers itself
   * exactly once, after the first finished race, and never again: the
   * moment the dialog opens this flips and is saved, whatever the pilot
   * does with it. The rows on Results and the pause menu are the way back
   * in; an automatic prompt that returns is how feedback dies.
   */
  feelAsked: false,
  /*
   * Whether the thumb-rates hand-off has happened. A fresh profile on a
   * touch device starts on TOUCH_RATE_DEFAULTS directly; an existing
   * profile still flying the stock defaults is switched ONCE, the first
   * time touch actually flies, by adoptTouchRates in src/main.js, with a
   * notice saying where to change them. A pilot with their own rates is
   * never touched, and this flag is what keeps all of it to one offer.
   */
  touchRatesOffered: false,
  /* Betaflight ANGLE_MODE. 'acro' is the default and the radio default.
   * Keyboard flight always raises angle, regardless of this value. */
  flightMode: 'acro',
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
   * A string so the typeof gate accepts it, and an unknown id (including
   * the old generated-bed ids) falls back to rotation. */
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
    ['tune', tuneChoices()],
    ['link', Object.keys(LINK_PRESETS)],
    ['cameraFov', CAMERA_FOVS],
    ['renderScale', RENDER_SCALES],
    ['fpsCap', FPS_CAPS],
    ['flightStyle', FLIGHT_STYLES],
    ['laps', LAP_COUNTS],
    ['packVoltage', PACK_VOLTAGES],
    ['musicTrack', musicIds()],
    ['ghost', ['off', 'best', 'previous']],
  ]) {
    if (!allowed.includes(s[key])) {
      s[key] = DEFAULTS[key];
    }
  }
  /* Angle is a range, not a list: a stored 40 from the old six-step menu
   * must survive, a stored 90 must not, and 45 has to be legal now. */
  s.cameraAngle = clampCameraAngle(s.cameraAngle);
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
  /* The PID adjustment, clamped onto what the firmware and the menu will
   * take. An unknown tune id, an out-of-range slider or a half-complete
   * expert table cannot survive a localStorage edit into the emitter. */
  s.pids = normalisePids(s.pids);
  /* A profile whose pitch differs from its roll has to show three axes,
   * whatever the stored menu shape says, or the rows would be editing a
   * pitch the pilot cannot see. */
  if (!pitchMatchesRoll(s.rates)) {
    s.ratesSplitPitch = true;
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

/*
 * A course card's identity, stable across the rebuilds items() does on every
 * render. The card objects themselves are made fresh each time, so the chosen
 * card is remembered by this key rather than by reference.
 */
function courseCardKey(card) {
  if (!card || !card.course) {
    return null;
  }
  return card.course.kind === 'board'
    ? `board:${card.course.track.id}`
    : 'current';
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
 */
function courseCardRows(subject) {
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
      note: board
        ? `Load ${name} from the board and fly it here.`
        : `Fly ${name} on the race field.`,
    },
    {
      label: 'Open in the track builder',
      action: 'card-builder',
      note: board
        ? `Open ${name} in the builder without flying it. Somebody else's course opens as a copy under your own name.`
        : `Open ${name} in the builder. Nothing is flown.`,
    },
  ];
  if (board) {
    rows.push({
      label: 'Open on the board',
      action: 'card-board',
      note: `The public page for ${name}, with its standings. Opens in a new tab.`,
    });
  }
  rows.push({ label: 'Back to the list', action: 'card-back' });
  return rows;
}

/*
 * The tune, as named choices.
 *
 * A tune is P, I, D, feedforward and filtering: what a freshly flashed
 * quad flies, a 6S race tune, and the stiff Crapshack cut for this plant.
 * None carries rates, which is why switching between them changes how the
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
  return choice(
    'Tune',
    `${tuneById(s.tune).note} PIDs, filters and feedforward. Your rates are kept.${midRun ? MID_RUN_WARNING : ''}`,
    tuneChoices(),
    s.tune,
    (id) => tuneById(id).name,
    (id) => { s.tune = id; },
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
    value: ratesSummary(s.rates),
    action: 'rates',
    note: `How far the sticks go, and how sharply. Yours, not the tune's. A radio in Acro flies this curve; keyboard flight is Angle.${midRun ? MID_RUN_WARNING : ''}`,
  };
}

/* The way back into the flight feel question, after its one automatic
 * offer. On Results and the pause menu only: those are the two places a
 * pilot has just been flying, which is when a feel report is worth
 * anything. */
function feelItem() {
  return {
    label: 'Flight feel',
    action: 'feel',
    note: 'Tell the tune work how the quad flies. One word is enough; your tune, PID adjustment and rates go with it.',
  };
}

/* The way in to the PIDs screen, with the adjustment on the row so a stock
 * tune reads as stock without opening it. */
function pidsItem(s, midRun) {
  return {
    label: 'PIDs',
    value: pidsSummary(s.pids, s.tune),
    action: 'pids',
    note: `How hard the controller holds what the sticks ask. Betaflight's own tuning sliders on the tune above, or every PID by hand. Each tune keeps its own adjustment.${midRun ? MID_RUN_WARNING : ''}`,
  };
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
    /* The Ghost row's contents, pushed by the shell through setGhostRow,
     * because the shell is the side that knows what can be chased. Null
     * hides the row, which is every freestyle map. */
    this.ghostRow = null;
    this.boardLoading = false;
    this.openingBoardCourse = false;
    this.onBoardCourse = null; /* (track) => Promise<boolean> */
    this.screen = 'title';
    this.cursor = 0;
    /* Which course card the player has chosen, by courseCardKey, and the
     * last one they were on. The first says whose list is showing; the
     * second is where Back to the list puts the cursor. */
    this.cardSubject = null;
    this.lastCardKey = null;
    this.onAction = null;    /* (action, settings) => void */
    this.onSettings = null;  /* (settings) => void */
    this.onMusicSkip = null; /* (dir) => void, -1 previous, +1 next */
    {
      const sel = this.settings.musicTrack;
      const tr = sel === 'rotation' ? TRACKS[0] : trackById(sel);
      this.musicNow = {
        id: tr.id,
        name: tr.name,
        selection: sel,
        index: Math.max(0, TRACKS.indexOf(tr)),
      };
    }
    /* Where the live sticks are, for the Rates curve. Written by the frame
     * loop through paintRates, read by the panel on every redraw. */
    this.ratesStick = { roll: 0, pitch: 0, yaw: 0 };
    /* Asked at most once a session, so oscillating across 40 does not nag. */
    this.yawTipAsked = false;
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
    /* The gap to the ghost, lit for a few seconds after each gate. Mint
     * when you are ahead of it, amber when it is ahead of you, the same
     * reading as everything else on this overlay: mint is the good news. */
    this.osdGhost = el('div', 'osd-ghost is-off', '');
    const top = el('div', 'osd-top');
    top.append(this.osdClockLabel, this.osdTimer, this.osdGate, this.osdLast, this.osdBest, this.osdGhost);
    this.osdPack = el('div', 'osd-value', '');
    this.osdPackBar = el('div', 'bar-fill');
    const packBar = el('div', 'bar');
    packBar.append(this.osdPackBar);
    const packBlock = el('div', 'osd-corner osd-left');
    packBlock.append(el('div', 'osd-label', 'Pack'), this.osdPack, packBar);
    this.osdHits = el('div', 'osd-sub osd-hits', '');
    packBlock.append(this.osdHits);
    this.osdSpeed = el('div', 'osd-value', '');
    this.osdFlight = el('div', 'osd-sub osd-mode', '');
    this.osdLaunch = el('div', 'osd-launch is-off', '');
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
    this.osd.append(top, packBlock, flightBlock, sticks, this.osdLaunch, this.buildTargetLock());
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
    /* Beta notice. The only line on this screen that is about the
     * software rather than about flying, so it wears the amber an
     * instrument wears rather than the mint a record does, and it sits
     * directly under the wordmark: a pilot who is about to meet a bug
     * should have been told before the lap, not after it. It is not
     * dismissible, because the thing it warns about has not stopped
     * being true by the second visit. */
    const beta = el('p', 'beta-note');
    beta.append(
      el('span', 'beta-tag', 'Beta'),
      el('span', null, 'Expect bugs and rough edges. It is still being built, and it will improve.'),
    );
    brand.append(beta);
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

    const howtoBlock = wrapMenu();
    this.howtoMenu = howtoBlock.menu;
    this.howtoHelp = howtoBlock.help;
    howto.append(howtoBlock.stage, hintWithKeys(['Esc'], 'Goes back. Arrow keys still move the menu.'));
    this.screens.howto = howto;
    this.howtoSource = touchWanted() ? 'touch' : 'keyboard';
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
      hintWithKeys(['↑↓', 'Enter', 'Esc'], 'Arrow keys move, Enter chooses. Escape goes back. On a radio: pitch to move, roll right to choose.'),
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
    settings.append(settingsBlock.stage, hintWithKeys(['Esc'], 'Goes back. Changes are already stored. Arrow keys still move the menu.'));
    this.screens.settings = settings;

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
      'How far the sticks go. Pick the rate system you think in and type your own numbers: all five of Betaflight\'s are here and the quad flies whichever you choose. Rates belong to you, not to the tune, so they stay put when you switch tunes. A radio in Acro flies this curve; keyboard flight is Angle and ignores it.',
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
    const ratesHint = hintWithKeys(['↑↓', '←→', 'Enter', 'Esc'], '');
    this.ratesHint = ratesHint.querySelector('.hint-copy');
    rates.append(ratesBlock.stage, ratesHint);
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
    pids.append(el('h2', null, 'PIDs'));
    pids.append(el(
      'p',
      'rates-lede',
      'How hard the flight controller works. The sliders are Betaflight\'s own, applied by the firmware itself, and they adjust the tune you have loaded: 100 is that tune\'s stock, the master multiplier scales everything at once. Each tune keeps its own adjustment. Rates live on their own screen and are untouched by anything here.',
    ));
    this.pidsPanel = mountPidsPanel();
    const pidsBlock = wrapMenu();
    this.pidsMenu = pidsBlock.menu;
    this.pidsMenu.classList.add('menu-scroll');
    this.pidsHelp = pidsBlock.help;
    pidsBlock.stage.prepend(this.pidsPanel.root);
    const pidsHint = hintWithKeys(['↑↓', '←→', 'Enter', 'Esc'], '');
    this.pidsHint = pidsHint.querySelector('.hint-copy');
    pids.append(pidsBlock.stage, pidsHint);
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
    paused.append(pausedBlock.stage, hintWithKeys(['Esc'], 'Resumes. Resume is also the first row.'));
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
    resultsFoot.append(resultsBlock.stage, hintWithKeys(['Esc'], 'Goes back to the title. Back to title is also a row.'));
    resultsCopy.append(resultsTop, resultsFoot);
    results.append(resultsCopy);
    this.screens.results = results;

    this.nameDialog = el('div', 'name-dialog');
    this.nameDialog.hidden = true;
    this.nameDialog.setAttribute('aria-modal', 'true');
    this.nameDialog.setAttribute('role', 'dialog');

    this.bugChip = btn('bug-chip', 'Report bug, give feedback');
    this.bugChip.title = 'F8 also opens this.';
    this.bugChip.addEventListener('click', () => this.openBugReport());

    this.musicDock = el('div', 'music-dock');
    this.musicDock.setAttribute('role', 'group');
    this.musicDock.setAttribute('aria-label', 'Music');
    this.musicPrev = btn('music-skip', '‹');
    this.musicPrev.setAttribute('aria-label', 'Previous track');
    this.musicPrev.tabIndex = -1;
    this.musicNext = btn('music-skip', '›');
    this.musicNext.setAttribute('aria-label', 'Next track');
    this.musicNext.tabIndex = -1;
    this.musicTitle = el('div', 'music-title', TRACKS[0].name);
    this.musicTitle.setAttribute('aria-live', 'polite');
    this.musicDock.append(this.musicPrev, this.musicTitle, this.musicNext);
    const keepFocusOff = (e) => e.preventDefault();
    this.musicPrev.addEventListener('mousedown', keepFocusOff);
    this.musicNext.addEventListener('mousedown', keepFocusOff);
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
    r.append(this.banner, this.readout, this.bugChip, this.musicDock, this.nameDialog);
    this.syncBugChip();
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
    this.syncMusicDock();
  }

  skipMusic(dir) {
    if (typeof this.onMusicSkip === 'function') {
      this.onMusicSkip(dir);
    }
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
    const hide = dialog
      || this.screen === 'calibrate'
      || this.screen === 'padpick'
      || !this.settings.sound;
    this.musicDock.hidden = hide;
    const flying = this.screen === 'flight' || this.screen === 'paused';
    this.musicDock.classList.toggle('on-flight', flying);
    this.musicDock.classList.toggle('is-muted', this.settings.musicLevel <= 0);
    const name = (this.musicNow && this.musicNow.name) || TRACKS[0].name;
    this.musicTitle.textContent = name;
    this.musicTitle.title = name;
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
      /* The rate profile, because the report that started this screen's
       * rewrite was about rates and did not carry them: an agent reading
       * "cannot set my rates" had no way to see what the pilot was on. */
      rates: ratesSummary(s.rates || {}),
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
    this.syncBugChip();

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
    const issueRow = chipRow(ISSUES, (id, chips) => {
      if (issues.has(id)) {
        issues.delete(id);
      } else {
        issues.add(id);
      }
      chips.get(id).classList.toggle('on', issues.has(id));
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
      wordsLabel, words,
      nameLabel, reporter,
      err, row,
    );
    this.nameDialog.textContent = '';
    this.nameDialog.append(box);
    this.nameDialog.hidden = false;
    this.syncBugChip();

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
       * TEN ROWS PLUS REPORT, ALWAYS. The course actions that used to
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
        ...this.ghostItems(),
        tuneItem(s),
        pidsItem(s),
        ratesItem(s),
        { label: 'How to fly', action: 'howto', note: 'The sticks, live, and what the keys do.' },
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
          label: 'Report bug, give feedback',
          action: 'reportbug',
          note: 'A bug ticket or flight feel feedback, both land on the board. The map, graphics and browser go with it. F8 does the same, including from flight.',
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
      /* A card the player has chosen owns the list until they go back. The
       * cards themselves stay, so the strip still reads as where they are. */
      const chosen = this.cardSubject
        ? cards.find((c) => c.course && courseCardKey(c) === this.cardSubject)
        : null;
      if (chosen) {
        return [...cards, ...courseCardRows(chosen)];
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
      const ids = musicIds();
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
        choice(
          'Flight style',
          s.flightStyle === 'arcade'
            ? 'Arcade: the ideal quad. No propwash shake, no gyro noise, no build asymmetry, so any tune flies glass smooth. Times flown here stay off the public board. Takes effect from the next run.'
            : 'Expert: the full physics, propwash, gyro noise and build tolerance included, which is what every board time is flown on. Arcade turns the imperfections off for a friendlier machine.',
          FLIGHT_STYLES,
          s.flightStyle === 'arcade' ? 'arcade' : 'expert',
          (id) => (id === 'arcade' ? 'Arcade' : 'Expert'),
          (id) => { s.flightStyle = id; },
        ),
        tuneItem(s),
        pidsItem(s),
        ratesItem(s),
        {
          label: 'Flight controller',
          action: 'fc',
          note: 'The whole board, Configurator-shaped: every PID, filter, feature and firmware key the module compiles, tab by tab. Save becomes Your edits on the Tune row. There is no CLI paste.',
        },
        choice(
          'Flight mode',
          'Acro: sticks are rates, hands off holds attitude. Angle: sticks are tilt, hands off levels. Keyboard flight always uses Angle. A radio uses this setting.',
          FLIGHT_MODES,
          s.flightMode === 'angle' ? 'angle' : 'acro',
          (id) => (id === 'angle' ? 'Angle' : 'Acro'),
          (id) => { s.flightMode = id; },
        ),
        toggle(
          'Launch control',
          'Betaflight race start, off by default. When on, press L on the start line, pitch forward, centre the stick, then punch throttle. The quad holds the angle until you go.',
          Boolean(s.launchControl),
          (v) => { s.launchControl = Boolean(v); },
        ),
        { label: 'Camera', section: true },
        stepper(
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
          `${s.cameraAngle} degrees`,
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
        ),
        choice(
          'Field of view',
          'Wider sees more, narrower magnifies. 75 matches what an FPV lens does to the middle of the frame; 85 gives some of that back for width; 115 is the widest this projection can honestly offer, about 145 degrees corner to corner, and the gates will look smaller for it.',
          CAMERA_FOVS,
          s.cameraFov,
          (n) => `${n} degrees vertical`,
          (n) => { s.cameraFov = n; },
        ),
        { label: 'Graphics', section: true },
        graphicsItem(s),
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
          'Recorded tracks. Rotation walks the crate. The skip buttons on screen jump a track.',
          s.musicLevel > 0 ? `${s.musicLevel}` : 'Off',
          (d) => { s.musicLevel = Math.max(0, Math.min(10, s.musicLevel + d)); },
        ),
        choice(
          'Music track',
          s.musicTrack === 'rotation'
            ? 'Every track in turn.'
            : 'This track loops until you skip or pick another.',
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
      /* Eleven rows, always, and Resume is the button. The conditional Edit
       * a copy that used to appear here belongs on the Courses screen.
       * Report a bug is the chip in the corner, or F8, so this list stays
       * put. Flight feel sits by the tuning rows because "this feels off"
       * is the moment a pilot pauses, and the report carries the tune and
       * PIDs they are paused on. */
      return [
        { label: 'Resume', action: 'resume', primary: true },
        { label: 'Restart run', action: 'restart' },
        ...this.ghostItems(),
        tuneItem(s, true),
        pidsItem(s, true),
        ratesItem(s, true),
        feelItem(),
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
          feelItem(),
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
      const hover = hoverStickPercent(r.throttleCap);
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
      return [
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
        {
          label: 'Revert to defaults',
          action: 'rates-default',
          disabled: !ratesChanged(s),
          note: ratesChanged(s)
            ? `Back to what a freshly flashed Betaflight 4.5.1 flies: Actual rates, ${formatRate(rateField('ACTUAL', 'rcRate'), RATE_DEFAULTS.roll.rcRate)} deg/s at centre, ${formatRate(rateField('ACTUAL', 'srate'), RATE_DEFAULTS.roll.srate)} deg/s at the stop on every axis, no expo, no throttle limit.`
            : 'Already on the Betaflight 4.5.1 defaults.',
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
       * nothing else, and 100 always means "this tune's own scale". The
       * expert table writes the PIDs themselves with the sliders off,
       * which is Configurator's expert mode. Everything is keyed by the
       * tune on the row above: adjust Karate and the default stays stock.
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
       * 100 where Crapshack ships 185, an arrow press would store an
       * override computed from that wrong base with no tune value to
       * forget it against, and the expert toggle would seed the table from
       * stock instead of from what is about to fly. So the window shows
       * one info row instead of controls. It lasts one local fetch; on a
       * slow network it is the same honesty the panel caption already has.
       */
      const rows = [
        tuneItem(s),
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
          label: 'Every setting',
          action: 'fc',
          note: 'The full Flight controller screen: filters, features and every firmware key, not just the PIDs. Configurator-shaped. No CLI paste.',
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
      /* Before the adjust branch: a typed row has arrows too, and the
       * stepper alone would be the old list row without the field that is
       * the whole point of it. */
      if (it.num && it.range) {
        row.append(this.makeSliderControl(it, i));
      } else if (it.num) {
        row.append(this.makeNumber(it, i));
      } else if (it.options) {
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
    host.scrollTop = scroll;
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
    if (this.ratesHint) {
      /* Same sentence the pause menu's row carries, because a pilot who got
       * here from a paused run needs it on the screen they are editing. */
      this.ratesHint.textContent = this.returnTo === 'paused'
        ? 'Arrow keys move, left and right change a value, Enter types one. Escape leaves a field, then goes back. A change reaches the quad at once, and puts it back on the start line.'
        : 'Arrow keys move, left and right change a value, Enter types one. Escape leaves a field, then goes back. Changes are stored and reach the quad at once.';
    }
    this.ratesPanel.paint(this.settings.rates, this.ratesStick);
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
    if (this.pidsHint) {
      this.pidsHint.textContent = this.returnTo === 'paused'
        ? 'Arrow keys move, left and right change a value, Enter types one. Escape leaves a field, then goes back. A change reaches the quad at once, and puts it back on the start line.'
        : 'Arrow keys move, left and right change a value, Enter types one. Escape leaves a field, then goes back. Changes are stored and reach the quad at once.';
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
    const confirm = Boolean(this.fc.confirm);
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
    const dest = ['paused', 'settings', 'pids'].includes(this.fcFrom)
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
      credits: this.creditsHelp,
      courses: this.coursesHelp,
      settings: this.settingsHelp,
      rates: this.ratesHelp,
      pids: this.pidsHelp,
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
      const note = items[this.cursor]?.note || '';
      help.textContent = note;
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
      const here = this.items()[i];
      if (here && here.course) {
        this.lastCardKey = courseCardKey(here);
      }
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
    range.step = '1';
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
      this.ratesPanel.paint(this.settings.rates, this.ratesStick);
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
    saveSettings(this.settings);
    this.renderMenu();
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
    saveSettings(this.settings);
    this.renderMenu();
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
        return { card, canvas, tag, kind: it.course.kind, key: courseCardKey(it) };
      });
      this.paintCoursePlans();
    }
    this.courseCards.forEach((c, k) => {
      const i = k + offset;
      c.card.classList.toggle('on', i === this.cursor);
      /* The list below belongs to one card. Say which, or the screen is back
       * to looking like a strip of cards over an unrelated menu. */
      c.card.classList.toggle('chosen', Boolean(this.cardSubject) && c.key === this.cardSubject);
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
      this.cardSubject = null;
      this.lastCardKey = null;
    }
    /* ratesFrom belongs to one visit to the Rates screen. Leaving that screen
     * for anywhere else drops it, so a later show('rates') that did not come
     * through act('rates'), a world swap keeping the pilot in place, cannot
     * inherit a stale origin and send Escape to the wrong list. Re-showing
     * rates over itself is exactly that case and must NOT clear it. */
    if (this.screen === 'rates' && screen !== 'rates') {
      this.ratesFrom = null;
    }
    if (this.screen === 'pids' && screen !== 'pids') {
      this.pidsFrom = null;
    }
    if (this.screen === 'fc' && screen !== 'fc') {
      this.fcFrom = null;
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
      window.location.href = 'src/trackbuilder/index.html';
    };
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
        ['Left thumb', 'Yaw and throttle. Throttle STAYS where you leave it, like a real radio: trim a hover, lift the thumb, it holds.'],
        ['Right thumb', 'Roll and pitch. Forward is nose down, fly forward. Springs back to centre when you let go.'],
        ['The whole corner', 'The pad is bigger than the drawing: the stick is wherever your thumb lands in the lower corner, and deflection is the drag from there.'],
        ['Landscape', 'Turn the phone sideways. The pads sit under both thumbs, the way a radio sits in both hands.'],
        ['Pause', 'The Pause chip, top right. Crashes recover on their own; time is the penalty.'],
      ]
      : source === 'radio'
      ? [
        ['Left stick', 'Throttle up and down, yaw left and right. Mode 2, as on your radio.'],
        ['Right stick', 'Pitch forward and back, roll left and right.'],
        ['Before you fly', 'Put the radio in joystick mode before loading this page, then run Calibrate sticks in Settings.'],
        ['In the menus', 'Pitch moves the cursor, roll right selects, roll left goes back.'],
        ['Acro', 'Hands off holds the attitude you left it in. Every turn has to be flown back out again.'],
      ]
      : source === 'launch'
        ? [
          ['What it is', 'Betaflight race start. Pitch the quad, let go of the stick, and it holds that angle at idle until you punch throttle. No looping off the blocks.'],
          ['Turn it on', 'Settings, Launch control, On. It stays off until you do. Then press L on the start line, before you raise throttle.'],
          ['Set the angle', 'Throttle at idle. Pitch forward until the OSD reads around 30 to 40 degrees. Centre the stick. The motors hold it.'],
          ['Go', 'Punch throttle past about 20 percent. The hold dumps, the props bite, and you are flying. L again resets it after a launch.'],
          ['Keyboard', 'Up arrow is pitch forward. W is throttle. Launch control switches you to Acro for the hold, then Angle comes back after you go.'],
          ['Radio', 'Same sequence as a real board. L is the mode switch. Fine-tune launch_angle_limit and launch_trigger_throttle_percent on the Flight controller screen.'],
        ]
      : [
        ['W and S', 'Throttle. Tap for a nudge, hold to climb, long hold to punch. Let go and it holds height.'],
        ['A and D', 'Yaw, left and right on the spot.'],
        ['Up and down', 'Pitch. Up is stick forward, nose down, fly forward.'],
        ['Left and right', 'Roll.'],
        ['L', 'Launch control, if you turned it on in Settings. Pitch, centre, punch.'],
        ['R, then Escape', 'Back to the start line, and pause.'],
        ['F8', 'Report a bug or give feedback. Pauses if you are in the air, then opens the form.'],
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
      ? 'Thumb sticks are a real proportional stick, so they fly whichever Flight mode is set in Settings: Acro, like a radio, by default. Angle is gentler while you learn: let go of the right pad and the quad levels itself.'
      : source === 'radio'
        ? 'A radio flies Acro by default: the sticks ask for a rate of rotation, and letting go asks for none, which holds whatever attitude the quad is in. Change it under Flight mode in Settings.'
        : source === 'launch'
          ? 'Off by default, because a punch from a hold is violent and not everyone wants it. Turn it on in Settings, then L on the pad. The green LAUNCH readout is the pitch angle. It blinks when throttle is close to firing.'
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
  showResults(log, best, recordAtStart, ghostNote = null) {
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
    /* The one automatic offer of the flight feel question, because this is
     * the only place a first race finishes. */
    this.maybeOfferFeel();
  }

  setBanner(text, panelled = false) {
    this.banner.textContent = text || '';
    this.banner.style.opacity = text ? '1' : '0';
    this.banner.className = panelled ? 'banner panel' : 'banner';
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
  setOsd({ mode, lapMs, lastLapMs, gate, gateCount, gateCue, volts, packFrac, altitude, speedKph, throttle, flightMode, bounces, launchState, launchPitch, ghostGapMs, ghostFinal }) {
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
    if (this.osdGhost) {
      if (ghostGapMs == null || freestyle) {
        this.osdGhost.className = 'osd-ghost is-off';
        this.osdGhost.textContent = '';
      } else {
        /* Negative is you ahead of the ghost. The sign is spelled out so
         * the readout cannot be mistaken for a lap time. */
        const ahead = ghostGapMs <= 0;
        const gap = `${ahead ? '-' : '+'}${(Math.abs(ghostGapMs) / 1000).toFixed(2)}`;
        this.osdGhost.textContent = `${ghostFinal ? 'Ghost lap' : 'Ghost'} ${gap}`;
        this.osdGhost.className = `osd-ghost ${ahead ? 'ahead' : 'behind'}`;
      }
    }
    this.osdPackBar.style.width = `${Math.max(0, Math.min(1, packFrac)) * 100}%`;
    this.osdSpeed.textContent = `${speedKph.toFixed(0)} km/h`;
    if (this.osdFlight) {
      this.osdFlight.textContent = launchState === 1 || launchState === 2
        ? 'Launch'
        : (flightMode === 'angle' ? 'Angle' : 'Acro');
    }
    if (this.osdLaunch) {
      const on = launchState > 0;
      this.osdLaunch.className = 'osd-launch'
        + (on ? '' : ' is-off')
        + (launchState === 2 ? ' is-hot' : '')
        + (launchState === 3 ? ' is-go' : '');
      if (!on) {
        this.osdLaunch.textContent = '';
      } else if (launchState === 3) {
        this.osdLaunch.textContent = 'GO';
      } else {
        const deg = Math.round(launchPitch || 0);
        this.osdLaunch.textContent = deg > 2 ? `LAUNCH ${deg}` : 'LAUNCH';
      }
    }
    this.osdAlt.textContent = `${altitude.toFixed(1)} m above the ground`;
    this.osdThrBar.style.width = `${Math.max(0, Math.min(1, throttle)) * 100}%`;
    if (this.osdHits) {
      /*
       * IT COUNTS UP NOW, AND IT COSTS NOTHING.
       *
       * This row used to read "Hits left 2 of 3" and it was a durability
       * model: the third firm contact of a lap ended the run. The rule is a
       * prop strike now, an airframe cannot be spent, and a countdown to a
       * thing that no longer happens is worse than no row at all. What is
       * still worth telling a pilot is how much they are bouncing, so the
       * row says that, in the neutral colour, and it says nothing at all
       * until there is something to say.
       */
      if (!bounces) {
        this.osdHits.textContent = '';
      } else {
        this.osdHits.textContent = bounces === 1 ? '1 bounce' : `${bounces} bounces`;
        this.osdHits.className = 'osd-sub osd-hits';
      }
    }
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
      this.writeSettings();
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
    /* A typed row opens for typing. Stepping it with Enter would be the
     * old list row's behaviour and would put the caret nowhere, which is
     * the whole complaint this screen exists to answer. */
    if (it.num) {
      this.focusNumber(this.cursor);
      return;
    }
    if (it.adjust) {
      this.adjust(1);
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
      this.cardSubject = courseCardKey(it);
      if (this.onUiSound) {
        this.onUiSound('select');
      }
      this.renderMenu();
      this.renderCourseCards();
      /* Land on Fly it, so the quick path stays Enter then Enter. */
      this.setCursor(this.firstStop(this.items(), this.rowOffset));
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
      /* Escape cancels a confirm before it leaves the screen, so a pilot
       * asked "restart the run?" is not thrown off the editor for
       * flinching. */
      if (this.fc.confirm) {
        this.fc.confirm = null;
        this.cursor = 0;
        this.renderMenu();
        return;
      }
      this.act('fc-back');
      return;
    }
    if (this.screen === 'rates' && this.ratesFrom === 'settings') {
      /* Settings is a page, not a mode: the shell has nothing to do when it
       * comes back up, so show() rather than act(), which would rewrite
       * returnTo and strand a pilot who paused a run to get here. */
      this.ratesFrom = null;
      this.show('settings');
      return;
    }
    if (this.screen === 'pids' && this.pidsFrom === 'settings') {
      /* Same contract as Rates above. */
      this.pidsFrom = null;
      this.show('settings');
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
    /* Leaderboard and Choose new map are the same page. The board opens
     * courses in the simulator, so this tab has to stay put. Navigating
     * away here left the pilot with no sim and a second one from Fly.
     * The board is a named tab: a pilot who has been to the board once
     * goes back to that same tab rather than collecting a row of them.
     * share.board is the board origin when a published course is loaded,
     * otherwise the default board. */
    if (action === 'leaderboard') {
      openNamedWindow(boardPageUrl(this.share && this.share.board), BOARD_WINDOW);
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
    /*
     * The rows a chosen course card offers. `cardSubject` says which course
     * they belong to, so none of them has to guess at the seat.
     */
    if (action === 'card-back') {
      this.cardSubject = null;
      this.renderMenu();
      this.renderCourseCards();
      this.setCursor(this.cardCursor());
      return;
    }
    if (action === 'card-fly' || action === 'card-builder' || action === 'card-board') {
      const card = this.subjectCard();
      if (!card) {
        this.cardSubject = null;
        this.renderMenu();
        return;
      }
      if (action === 'card-fly') {
        this.cardSubject = null;
        this.act(card.action);
        return;
      }
      if (action === 'card-board') {
        openNamedWindow(boardPageUrl(card.course.track.board), BOARD_WINDOW);
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
    if (action === 'howto' || action === 'settings' || action === 'courses' || action === 'credits') {
      this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
      this.show(action);
      return;
    }
    if (action === 'rates') {
      /* Escape and Back go where the pilot came from, so Rates reached from
       * the pause menu mid-race does not dump them on the title screen.
       * From the flight controller's signpost row, returnTo is left alone:
       * it may be carrying a paused run two screens up, and this row must
       * not be the reason Escape quits it. */
      if (this.screen === 'settings') {
        this.ratesFrom = 'settings';
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
      /* Same going-back contract as Rates, for the same reason. */
      if (this.screen === 'settings') {
        this.pidsFrom = 'settings';
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
      this.fcFrom = ['paused', 'settings', 'pids'].includes(this.screen)
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
      this.padPrev = now;
      return;
    }
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
    if (this.screen === 'settings' || this.screen === 'title' || this.screen === 'rates' || this.screen === 'pids' || this.screen === 'fc') {
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
