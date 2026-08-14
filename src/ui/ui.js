/*
 * ui.js: the product shell. Title, how to fly, settings, pause, results,
 * and the flight overlay.
 *
 * Why this exists: the page used to load straight into a falling quad with
 * a monospace debug dump in the corner. That reads as a tech demo. A
 * player arriving cold needs a title to land on, a way to start, a way to
 * learn the sticks, a way to change the few settings that matter, and a
 * result to read at the end of a run.
 *
 * Every screen is navigable from the keyboard alone and from a radio or
 * gamepad alone. On a radio there are no reliable menu buttons, so the
 * sticks drive the menu: pitch moves the cursor, roll right selects, roll
 * left goes back. Any gamepad button also selects. The screens say so.
 * Rows that hold a value also have a mouse control: up and down arrows
 * for a stepped number, a dropdown for a named list.
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
import { TRACKS, trackById } from '../render/tracks.js';
import { TUNES, tuneById } from '../../configs/registry.js';
import {
  RATE_DEFAULTS,
  RATE_MAX_CHOICES,
  RATE_CENTRE_CHOICES,
  RATE_EXPO_CHOICES,
} from '../../configs/rates.js';

const SETTINGS_KEY = 'webfpv.settings.v2';

export const CAMERA_ANGLES = [15, 20, 25, 30, 35, 40];
/* Vertical field of view, degrees. 100 is the long-standing default; the
 * list brackets real FPV cameras, whose diagonal runs about 135 to 160
 * degrees depending on lens and sensor. */
export const CAMERA_FOVS = [90, 100, 110, 120];
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
  cameraAngle: 30,
  cameraFov: 100,
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
  /* The outdoors between runs: low air and birdsong that fade with speed. */
  ambienceLevel: 4,
  focusTone: false,
  readout: false,
};

export function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch (e) {
    stored = {};
  }
  const s = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof stored[k] === typeof DEFAULTS[k]) {
      s[k] = stored[k];
    }
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

/* A menu plus a side column for its note, so the note cannot resize the rows. */
function wrapMenu() {
  const stage = el('div', 'menu-stage');
  const menu = el('div', 'menu');
  const help = el('div', 'menu-help');
  stage.append(menu, help);
  return { stage, menu, help };
}

/* Step a value through a list, wrapping. */
function cycle(list, value, dir) {
  const i = list.indexOf(value);
  const n = list.length;
  return list[((i < 0 ? 0 : i) + dir + n) % n];
}

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

export class Ui {
  constructor(root) {
    this.root = root;
    this.settings = loadSettings();
    this.screen = 'title';
    this.cursor = 0;
    this.onAction = null;    /* (action, settings) => void */
    this.onSettings = null;  /* (settings) => void */
    this.onUiSound = null;   /* (kind) => void: 'move', 'adjust', 'select', 'back' */
    this.padPrev = { up: false, down: false, left: false, right: false, select: false, back: false };
    this.dropEl = null;
    this.dropIndex = null;
    this.menuRows = [];
    this.rowOffset = 0;
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
    this.osdAlt = el('div', 'osd-sub', '');
    this.osdThrBar = el('div', 'bar-fill warm');
    const thrBar = el('div', 'bar');
    thrBar.append(this.osdThrBar);
    const flightBlock = el('div', 'osd-corner osd-right');
    flightBlock.append(this.osdSpeed, this.osdAlt, el('div', 'osd-label', 'Throttle'), thrBar);
    this.osd.append(top, packBlock, flightBlock);
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
    const brand = el('div', 'brand');
    this.brandSub = el('div', 'brand-sub', '');
    brand.append(el('h1', null, 'WEBFPV'), this.brandSub);
    this.titleBest = el('div', 'brand-best', '');
    brand.append(this.titleBest);
    const titleBlock = wrapMenu();
    this.titleMenu = titleBlock.menu;
    this.titleHelp = titleBlock.help;
    title.append(brand, titleBlock.stage, el('div', 'hint', 'Arrow keys move, Enter selects. On a radio: pitch to move, roll right to select.'));
    this.screens.title = title;

    const howto = el('div', 'screen screen-page');
    howto.append(el('h2', null, 'How to fly'));
    const cols = el('div', 'cols');
    const kb = el('div', 'col');
    kb.append(el('h3', null, 'Keyboard'));
    const kbList = el('dl');
    for (const [k, v] of [
      ['W and S', 'Throttle up and down. It stays where you leave it.'],
      ['A and D', 'Yaw left and right, turning the nose.'],
      ['Up and down arrows', 'Pitch. Up arrow tips the nose down and flies you forward.'],
      ['Left and right arrows', 'Roll left and right.'],
      ['Escape', 'Pause.'],
      ['R', 'Put the quad back on the start line.'],
    ]) {
      kbList.append(el('dt', null, k), el('dd', null, v));
    }
    kb.append(kbList);
    const pad = el('div', 'col');
    pad.append(el('h3', null, 'Radio or gamepad'));
    const padList = el('dl');
    for (const [k, v] of [
      ['Plug in', 'Put your radio in joystick mode before loading the page.'],
      ['Calibrate', 'Choose Calibrate sticks in Settings, then follow the prompts.'],
      ['Left stick', 'Throttle and yaw, as on a Mode 2 radio.'],
      ['Right stick', 'Pitch and roll.'],
      ['Menus', 'Pitch moves the cursor, roll right selects, roll left goes back.'],
    ]) {
      padList.append(el('dt', null, k), el('dd', null, v));
    }
    pad.append(padList);
    cols.append(kb, pad);
    howto.append(cols);
    howto.append(el('p', 'lede', 'This quad does not hold itself level. Let go of the sticks and it keeps whatever attitude you left it in, so every turn has to be flown back out again. A quad has no brakes and no wings. Throttle sets how hard the props push, and the only way to slow down or change direction is to point the quad somewhere else and push. Fly through the pulsing gate: green is the way through, red is the wrong face. The pane jumps to the next gate when you pass. Touching a gate frame is a crash.'));
    const howtoBlock = wrapMenu();
    this.howtoMenu = howtoBlock.menu;
    this.howtoHelp = howtoBlock.help;
    howto.append(howtoBlock.stage);
    this.screens.howto = howto;

    /*
     * The map screen. Cards rather than a row of text, and each card plays a
     * short flight through the world it offers.
     *
     * WHY A SCREEN AND NOT A ROW. Choosing the world is the biggest choice a
     * player makes and it takes seconds to honour, and until now it was a
     * name on a menu row that you stepped through with the arrow keys: a
     * player who had never flown either one was choosing between the strings
     * "Race field" and "Freestyle city". What a world is like is not
     * something a sentence gets across, so the cards show it.
     *
     * The thumbnails are built in src/ui/mapreel.js, which is imported
     * lazily the first time this screen opens. That is not tidiness: the
     * city's own modules must never be fetched until the city is chosen
     * (check 16 asserts it), and the reel module reaches for the track
     * builder's data to draw a designed course, so none of it belongs on the
     * boot path.
     */
    const maps = el('div', 'screen screen-page');
    maps.append(el('h2', null, 'Choose a world'));
    this.mapCardHost = el('div', 'map-cards');
    this.mapsHelp = el('div', 'menu-help menu-help-below');
    this.mapsMenu = el('div', 'menu');
    maps.append(this.mapCardHost, this.mapsHelp, this.mapsMenu,
      el('div', 'hint', 'Arrow keys move, Enter chooses. On a radio: pitch to move, roll right to choose.'));
    this.screens.maps = maps;

    const settings = el('div', 'screen screen-page screen-settings');
    settings.append(el('h2', null, 'Settings'));
    const settingsBlock = wrapMenu();
    this.settingsMenu = settingsBlock.menu;
    this.settingsMenu.classList.add('menu-scroll');
    this.settingsHelp = settingsBlock.help;
    this.craftCanvas = el('canvas', 'craft-view');
    this.craftCanvas.setAttribute('aria-hidden', 'true');
    this.craftCaption = el('div', 'craft-showcase-cap', 'Acro. Sticks are rates. Hands off holds.');
    const showcase = el('div', 'craft-showcase');
    const frame = el('div', 'craft-showcase-frame');
    frame.append(this.craftCanvas);
    showcase.append(frame, this.craftCaption);
    settingsBlock.stage.prepend(showcase);
    settings.append(settingsBlock.stage, el('div', 'hint', 'Arrows and dropdowns change a value. On a radio, roll changes it. The quad on the left follows the sticks.'));
    this.screens.settings = settings;

    const paused = el('div', 'screen screen-modal');
    paused.append(el('h2', null, 'Paused'));
    const pausedBlock = wrapMenu();
    this.pausedMenu = pausedBlock.menu;
    this.pausedHelp = pausedBlock.help;
    paused.append(pausedBlock.stage);
    this.screens.paused = paused;

    const results = el('div', 'screen screen-page');
    this.resultsHead = el('h2', null, 'Run complete');
    this.resultsBody = el('div', 'results');
    const resultsBlock = wrapMenu();
    this.resultsMenu = resultsBlock.menu;
    this.resultsHelp = resultsBlock.help;
    results.append(this.resultsHead, this.resultsBody, resultsBlock.stage);
    this.screens.results = results;

    for (const s of Object.values(this.screens)) {
      s.style.display = 'none';
      r.append(s);
    }
    r.append(this.banner, this.readout);
  }

  /* Menu definitions are rebuilt on show so values read correctly. */
  items() {
    const s = this.settings;
    if (this.screen === 'title') {
      const m = MAPS.find((x) => x.id === s.map) ?? MAPS[0];
      return [
        { label: 'Fly', action: 'fly' },
        {
          label: 'Map',
          value: m.name,
          /* An action, not a value to step through. Choosing the world loads
           * one, which takes seconds, so stepping past a world with the
           * arrow key used to start building it: the map screen makes the
           * choice deliberate and shows what each one is. */
          action: 'maps',
          note: m.note,
        },
        tuneItem(s),
        { label: 'How to fly', action: 'howto' },
        { label: 'Settings', action: 'settings' },
        {
          label: 'Track builder',
          action: 'trackbuilder',
          note: 'Design a course. Place gates, set which way each one is flown, and derive the racing line.',
        },
      ];
    }
    if (this.screen === 'howto') {
      return [{ label: 'Back', action: 'back' }];
    }
    if (this.screen === 'maps') {
      return [
        ...MAPS.map((m) => ({
          label: m.name,
          note: m.note,
          map: m,
          action: `map:${m.id}`,
        })),
        { label: 'Back', action: 'back' },
      ];
    }
    if (this.screen === 'settings') {
      const musicIds = ['rotation', ...TRACKS.map((t) => t.id)];
      return [
        choice(
          'Rate, roll and pitch',
          'ACTUAL rates. How fast the quad spins with the stick against the stop, exactly. Betaflight ships 670.',
          RATE_MAX_CHOICES,
          s.rateMax,
          (n) => `${n} deg/s`,
          (n) => { s.rateMax = n; },
        ),
        choice(
          'Rate, yaw',
          'Yaw is usually set a little below roll and pitch, but that is taste.',
          RATE_MAX_CHOICES,
          s.rateYawMax,
          (n) => `${n} deg/s`,
          (n) => { s.rateYawMax = n; },
        ),
        choice(
          'Centre sensitivity',
          'How lively the middle of the stick is, where you fly most of a lap. It is the slope of the curve at centre, not the rate at half stick: 70 with a 670 max gives 185 deg/s at half. Betaflight ships 70.',
          RATE_CENTRE_CHOICES,
          s.rateCentre,
          (n) => `${n} deg/s per stick at centre`,
          (n) => { s.rateCentre = n; },
        ),
        choice(
          'Expo',
          'Bends the curve between centre and full stick. Softer middle, same ends.',
          RATE_EXPO_CHOICES,
          s.rateExpo,
          (n) => (n === 0 ? 'None' : (n / 100).toFixed(2)),
          (n) => { s.rateExpo = n; },
        ),
        choice(
          'Camera angle',
          'How far the camera tilts up. More angle suits more speed. The quad beside the list shows it.',
          CAMERA_ANGLES,
          s.cameraAngle,
          (n) => `${n} degrees`,
          (n) => { s.cameraAngle = n; },
        ),
        choice(
          'Field of view',
          'Wider sees more and feels roomier, narrower magnifies. Real FPV cameras sit around 110.',
          CAMERA_FOVS,
          s.cameraFov,
          (n) => `${n} degrees vertical`,
          (n) => { s.cameraFov = n; },
        ),
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
        stepper(
          'Ambience',
          'The outdoors: low air and birdsong. It fades away as speed builds.',
          s.ambienceLevel > 0 ? `${s.ambienceLevel}` : 'Off',
          (d) => { s.ambienceLevel = Math.max(0, Math.min(10, s.ambienceLevel + d)); },
        ),
        toggle(
          'Binaural tone',
          'A quiet 1000 Hz tone, 6 Hz apart between the ears. Needs headphones to do anything at all.',
          s.focusTone,
          (v) => { s.focusTone = v; },
        ),
        toggle(
          'Performance readout',
          'Frame rate and draw counts, for tuning your machine.',
          s.readout,
          (v) => { s.readout = v; },
        ),
        { label: 'Calibrate sticks', action: 'calibrate', note: 'Teach the game your radio, one stick at a time.' },
        { label: 'Back', action: 'back' },
      ];
    }
    if (this.screen === 'paused') {
      return [
        { label: 'Resume', action: 'resume' },
        { label: 'Restart run', action: 'restart' },
        tuneItem(s),
        { label: 'How to fly', action: 'howto' },
        { label: 'Settings', action: 'settings' },
        { label: 'Quit to title', action: 'title' },
      ];
    }
    if (this.screen === 'results') {
      return [
        { label: 'Fly again', action: 'restart' },
        { label: 'Back to title', action: 'title' },
      ];
    }
    return [];
  }

  renderMenu() {
    this.closeDrop();
    if (this.screen === 'maps') {
      this.renderMapCards();
    }
    const host = {
      title: this.titleMenu,
      howto: this.howtoMenu,
      maps: this.mapsMenu,
      settings: this.settingsMenu,
      paused: this.pausedMenu,
      results: this.resultsMenu,
    }[this.screen];
    if (!host) {
      return;
    }
    const items = this.items();
    if (this.cursor >= items.length) {
      this.cursor = 0;
    }
    const scroll = host.scrollTop;
    host.textContent = '';
    /* The map screen draws its worlds as cards above this menu, so the rows
     * here are only what is left over, which is Back. */
    const rows = this.screen === 'maps' ? items.filter((it) => !it.map) : items;
    const offset = items.length - rows.length;
    this.rowOffset = offset;
    this.menuRows = [];
    rows.forEach((it, k) => {
      const i = k + offset;
      const row = el('div', 'row');
      row.append(el('span', 'row-label', it.label));
      if (it.options) {
        row.append(this.makeDrop(it, i));
      } else if (it.step || it.adjust) {
        row.append(this.makeStepper(it, i));
      } else if (it.value != null) {
        row.append(el('span', 'row-value', it.value));
      }
      /* A browser player reaches for the mouse. A menu that only answers
       * to arrow keys reads as broken, not as keyboard first. */
      /* mousemove, not mouseenter: the menu is rebuilt on every value
       * change, and a fresh element appearing under a stationary pointer
       * fires enter, which dragged the cursor back to wherever the mouse
       * happened to be resting and made the arrow keys look broken. */
      row.addEventListener('mousemove', () => {
        if (this.cursor !== i) {
          this.setCursor(i);
        }
      });
      row.addEventListener('click', (e) => {
        if (e.target.closest('.row-control')) {
          return;
        }
        this.closeDrop();
        this.cursor = i;
        this.syncCursor(false);
        /* Value rows change through the arrows or the dropdown. Clicking
         * the label only focuses them. Action rows still fire. */
        if (!it.adjust && !it.options && !it.step) {
          this.select();
        }
      });
      host.append(row);
      this.menuRows.push(row);
    });
    host.scrollTop = scroll;
    this.syncCursor(false);
  }

  helpNode() {
    return {
      title: this.titleHelp,
      howto: this.howtoHelp,
      maps: this.mapsHelp,
      settings: this.settingsHelp,
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

  setCursor(i) {
    if (i === this.cursor) {
      return;
    }
    this.closeDrop();
    this.cursor = i;
    if (this.screen === 'maps' && this.mapCards) {
      this.mapCards.forEach((c, j) => c.card.classList.toggle('on', j === this.cursor));
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
   * doing that here would throw away three canvases and three reels twenty
   * times a second as somebody arrowed along the row.
   */
  renderMapCards() {
    const host = this.mapCardHost;
    if (!host) {
      return;
    }
    const items = this.items().filter((it) => it.map);
    if (!this.mapCards || this.mapCards.length !== items.length) {
      host.textContent = '';
      this.mapCards = items.map((it, i) => {
        const card = el('div', 'map-card');
        const shot = el('canvas', 'map-reel');
        const body = el('div', 'map-card-body');
        const name = el('div', 'map-card-name', it.label);
        const tag = el('div', 'map-card-tag', '');
        const still = el('div', 'map-card-still', '');
        body.append(name, tag);
        card.append(shot, still, body);
        card.addEventListener('mousemove', () => {
          if (this.cursor !== i) {
            this.setCursor(i);
          }
        });
        card.addEventListener('click', () => {
          this.cursor = i;
          this.select();
        });
        host.append(card);
        return {
          card, shot, tag, still, id: it.map.id,
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
   * Start the thumbnails. The module arrives through a dynamic import, so a
   * player who never opens this screen never fetches a line of it, and the
   * whole thing is guarded: a thumbnail that cannot be built is a card with
   * a sentence on it, never a screen that fails to open.
   */
  startReels() {
    this.stopReels();
    const cards = this.mapCards ?? [];
    const session = {};
    this.reelSession = session;
    import('./mapreel.js').then(async ({ reelFor, makeReel }) => {
      if (this.reelSession !== session) {
        return;
      }
      const live = [];
      for (const c of cards) {
        let reel = null;
        try {
          reel = await reelFor(c.id);
        } catch (e) {
          reel = null;
        }
        if (this.reelSession !== session) {
          return;
        }
        if (!reel) {
          c.still.textContent = c.id === 'custom'
            ? 'Nothing built yet. Open the track builder from the title screen.'
            : 'No preview.';
          continue;
        }
        c.still.textContent = '';
        live.push({ card: c, reel: makeReel(c.shot, reel) });
      }
      if (!live.length || this.reelSession !== session) {
        return;
      }
      /*
       * One clock for every card, at 20 frames a second rather than the
       * display's rate. These are 240 pixel canvases behind a menu, and the
       * world is still being rendered behind them at the display's rate;
       * spending a full frame budget on three thumbnails would make the
       * menu the most expensive screen in the product.
       */
      const start = performance.now();
      let lastDraw = 0;
      const tick = (now) => {
        if (this.reelSession !== session || this.screen !== 'maps') {
          return;
        }
        this.reelRaf = requestAnimationFrame(tick);
        if (now - lastDraw < 50) {
          return;
        }
        lastDraw = now;
        for (const l of live) {
          const w = l.card.shot.clientWidth;
          const h = l.card.shot.clientHeight;
          if (w > 0 && h > 0 && (l.card.shot.width !== w || l.card.shot.height !== h)) {
            l.card.shot.width = w;
            l.card.shot.height = h;
          }
          l.reel.frame((now - start) * 0.001);
        }
      };
      this.reelRaf = requestAnimationFrame(tick);
    }).catch(() => {
      for (const c of cards) {
        c.still.textContent = 'No preview.';
      }
    });
  }

  stopReels() {
    this.reelSession = null;
    if (this.reelRaf != null) {
      cancelAnimationFrame(this.reelRaf);
      this.reelRaf = null;
    }
  }

  show(screen) {
    this.closeDrop();
    if (this.screen === 'maps' && screen !== 'maps') {
      /* Nothing draws a thumbnail for a screen nobody is looking at. */
      this.stopReels();
      this.mapCards = null;
    }
    this.screen = screen;
    this.cursor = 0;
    for (const [name, node] of Object.entries(this.screens)) {
      node.style.display = name === screen ? '' : 'none';
    }
    /* Paused keeps the flight display up, dimmed: the lap clock and the
     * pack are what the player paused to look at. */
    this.osd.style.display = screen === 'flight' || screen === 'paused' ? '' : 'none';
    this.osd.className = screen === 'paused' ? 'osd dim' : 'osd';
    this.renderMenu();
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
    if (freestyle) {
      this.titleBest.textContent = 'No gates, no clock, no lap';
      this.osdBest.textContent = '';
      return;
    }
    this.titleBest.textContent = ms != null ? `Track record ${formatTime(ms)}` : 'No lap recorded yet';
    this.osdBest.textContent = ms != null ? `Record ${formatTime(ms)}` : 'No record yet';
  }

  /*
   * log is the race's record of every lap attempted, in order, clean or
   * thrown away. Voided attempts keep their lap number and appear as
   * rows: renumbering the survivors tells the player they flew a
   * different race from the one they remember.
   */
  showResults(log, best) {
    this.resultsBody.textContent = '';
    const clean = log.filter((l) => Number.isFinite(l.ms)).map((l) => l.ms);
    const fastest = clean.length ? Math.min(...clean) : null;
    this.resultsHead.textContent = clean.length ? 'Run complete' : 'Run ended';
    if (!clean.length) {
      this.resultsBody.append(el('p', 'lede', 'No clean lap this run. Touching a gate or hitting the ground voids the lap it happens on, and the clock starts again at the mint ring.'));
    }
    log.forEach((entry) => {
      const row = el('div', `result-row${entry.ms == null ? ' void' : ''}`);
      row.append(el('span', 'result-label', `Lap ${entry.n}`));
      if (entry.ms == null) {
        row.append(el('span', 'result-time', 'void'));
        row.append(el('span', 'result-why', (entry.reason || '').replace(/\n/g, ' ').toLowerCase()));
      } else {
        row.append(el('span', 'result-time', formatTime(entry.ms)));
        if (entry.ms === fastest) {
          row.append(el('span', 'result-tag', 'fastest'));
        }
      }
      this.resultsBody.append(row);
    });
    if (clean.length) {
      const total = clean.reduce((a, b) => a + b, 0);
      const row = el('div', 'result-row total');
      row.append(el('span', 'result-label', clean.length === log.length ? 'Total' : 'Clean laps total'));
      row.append(el('span', 'result-time', formatTime(total)));
      this.resultsBody.append(row);
    }
    if (best != null) {
      this.resultsBody.append(el('p', 'lede', `Track record ${formatTime(best)}.`));
    }
    this.show('results');
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
  setOsd({ mode, lapMs, lastLapMs, gate, gateCount, gateCue, volts, packFrac, altitude, speedKph, throttle }) {
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
    this.osdAlt.textContent = `${altitude.toFixed(1)} m above the ground`;
    this.osdThrBar.style.width = `${Math.max(0, Math.min(1, throttle)) * 100}%`;
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
  move(dir) {
    const n = this.items().length;
    if (!n) {
      return;
    }
    this.setCursor((this.cursor + dir + n) % n);
  }

  adjust(dir) {
    const it = this.items()[this.cursor];
    if (it && it.adjust) {
      it.adjust(dir);
      saveSettings(this.settings);
      this.renderMenu();
      if (this.onUiSound) {
        this.onUiSound('adjust');
      }
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
    }
  }

  select() {
    const it = this.items()[this.cursor];
    if (!it) {
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
    if (this.screen === 'results') {
      this.act('title');
      return;
    }
    if (this.screen === 'paused') {
      /* Escape opened the pause screen, so Escape closes it again. */
      this.act('resume');
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
    if (action === 'howto' || action === 'settings' || action === 'maps') {
      this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
      this.show(action);
      return;
    }
    /*
     * Choosing a world. It goes through onSettings rather than onAction
     * because a map change IS a settings change, and the shell's
     * applySettings is the one place that knows a changed map means a swap.
     */
    if (action.startsWith('map:')) {
      this.settings.map = action.slice(4);
      saveSettings(this.settings);
      this.show(this.returnTo === 'paused' ? 'paused' : 'title');
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
      return;
    }
    if (action === 'back') {
      this.show(this.returnTo === 'paused' ? 'paused' : 'title');
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
   * treat it as a flight control. */
  handleKey(code) {
    if (code === 'F3') {
      this.settings.readout = !this.settings.readout;
      saveSettings(this.settings);
      this.setReadout('');
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
      /* The map screen lays its worlds out in a row, so left and right are
       * what a player reaches for. Nothing on it has a value to adjust. */
      if (this.screen === 'maps') {
        this.move(-1);
      } else {
        this.adjust(-1);
      }
      return true;
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      if (this.screen === 'maps') {
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
   * triggered, so a held stick moves one row.
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
