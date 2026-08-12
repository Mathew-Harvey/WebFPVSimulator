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

const SETTINGS_KEY = 'webfpv.settings.v2';

export const CAMERA_ANGLES = [15, 20, 25, 30, 35, 40];
export const PACK_VOLTAGES = [4.2, 3.8, 3.5];
export const LAP_COUNTS = [1, 3, 5];

const DEFAULTS = {
  cameraAngle: 30,
  packVoltage: 4.2,
  laps: 3,
  sound: true,
  volume: 6,
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

/* Step a value through a list, wrapping. */
function cycle(list, value, dir) {
  const i = list.indexOf(value);
  const n = list.length;
  return list[((i < 0 ? 0 : i) + dir + n) % n];
}

export class Ui {
  constructor(root) {
    this.root = root;
    this.settings = loadSettings();
    this.screen = 'title';
    this.cursor = 0;
    this.onAction = null;    /* (action, settings) => void */
    this.onSettings = null;  /* (settings) => void */
    this.padPrev = { up: false, down: false, left: false, right: false, select: false, back: false };
    this.build();
    this.show('title');
  }

  build() {
    const r = this.root;
    r.textContent = '';

    /* Flight overlay: the on screen display a pilot actually reads. */
    this.osd = el('div', 'osd');
    this.osdTimer = el('div', 'osd-timer', '--.--');
    this.osdGate = el('div', 'osd-gate', '');
    this.osdBest = el('div', 'osd-best', '');
    const top = el('div', 'osd-top');
    top.append(this.osdTimer, this.osdGate, this.osdBest);
    this.osdPack = el('div', 'osd-value', '');
    this.osdPackBar = el('div', 'bar-fill');
    const packBar = el('div', 'bar');
    packBar.append(this.osdPackBar);
    const packBlock = el('div', 'osd-corner osd-left');
    this.osdAmps = el('div', 'osd-sub', '');
    packBlock.append(el('div', 'osd-label', 'Pack'), this.osdPack, this.osdAmps, packBar);
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
    brand.append(el('h1', null, 'WEBFPV'), el('div', 'brand-sub', 'Valley Circuit time trial'));
    this.titleBest = el('div', 'brand-best', '');
    brand.append(this.titleBest);
    this.titleMenu = el('div', 'menu');
    title.append(brand, this.titleMenu, el('div', 'hint', 'Arrow keys move, Enter selects. On a radio: pitch to move, roll right to select.'));
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
    howto.append(el('p', 'lede', 'A quad has no brakes and no wings. Throttle sets how hard the props push, and the only way to slow down or change direction is to point the quad somewhere else and push. Fly through the mint ring to start the clock, then chase the amber rings in order. Touching a gate frame voids the lap.'));
    this.howtoMenu = el('div', 'menu');
    howto.append(this.howtoMenu);
    this.screens.howto = howto;

    const settings = el('div', 'screen screen-page');
    settings.append(el('h2', null, 'Settings'));
    this.settingsMenu = el('div', 'menu');
    settings.append(this.settingsMenu, el('div', 'hint', 'Left and right change a value. On a radio, roll changes it.'));
    this.screens.settings = settings;

    const paused = el('div', 'screen screen-modal');
    paused.append(el('h2', null, 'Paused'));
    this.pausedMenu = el('div', 'menu');
    paused.append(this.pausedMenu);
    this.screens.paused = paused;

    const results = el('div', 'screen screen-page');
    this.resultsHead = el('h2', null, 'Run complete');
    this.resultsBody = el('div', 'results');
    this.resultsMenu = el('div', 'menu');
    results.append(this.resultsHead, this.resultsBody, this.resultsMenu);
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
      return [
        { label: 'Fly', action: 'fly' },
        { label: 'How to fly', action: 'howto' },
        { label: 'Settings', action: 'settings' },
      ];
    }
    if (this.screen === 'howto') {
      return [{ label: 'Back', action: 'back' }];
    }
    if (this.screen === 'settings') {
      return [
        {
          label: 'Camera angle',
          value: `${s.cameraAngle} degrees`,
          note: 'How far the camera tilts up. More angle suits more speed.',
          adjust: (d) => { s.cameraAngle = cycle(CAMERA_ANGLES, s.cameraAngle, d); },
        },
        {
          label: 'Pack charge',
          value: `${s.packVoltage.toFixed(2)} volts per cell`,
          note: 'A tired pack sags harder and gives less punch. Best laps are kept per charge level.',
          adjust: (d) => { s.packVoltage = cycle(PACK_VOLTAGES, s.packVoltage, d); },
        },
        {
          label: 'Laps per run',
          value: `${s.laps}`,
          note: 'How many laps a run lasts before the result screen.',
          adjust: (d) => { s.laps = cycle(LAP_COUNTS, s.laps, d); },
        },
        {
          label: 'Sound',
          value: s.sound ? 'On' : 'Off',
          note: 'Motors, wind and gate tones.',
          adjust: () => { s.sound = !s.sound; },
        },
        {
          label: 'Volume',
          value: `${s.volume}`,
          note: 'Zero to ten.',
          adjust: (d) => { s.volume = Math.max(0, Math.min(10, s.volume + d)); },
        },
        {
          label: 'Performance readout',
          value: s.readout ? 'On' : 'Off',
          note: 'Frame rate and draw counts, for tuning your machine.',
          adjust: () => { s.readout = !s.readout; },
        },
        { label: 'Calibrate sticks', action: 'calibrate', note: 'Teach the game your radio, one stick at a time.' },
        { label: 'Back', action: 'back' },
      ];
    }
    if (this.screen === 'paused') {
      return [
        { label: 'Resume', action: 'resume' },
        { label: 'Restart run', action: 'restart' },
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
    const host = {
      title: this.titleMenu,
      howto: this.howtoMenu,
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
    host.textContent = '';
    items.forEach((it, i) => {
      const row = el('div', `row${i === this.cursor ? ' on' : ''}`);
      row.append(el('span', 'row-label', it.label));
      if (it.value != null) {
        row.append(el('span', 'row-value', it.value));
      }
      host.append(row);
      if (it.note && i === this.cursor) {
        host.append(el('div', 'row-note', it.note));
      }
    });
  }

  show(screen) {
    this.screen = screen;
    this.cursor = 0;
    for (const [name, node] of Object.entries(this.screens)) {
      node.style.display = name === screen ? '' : 'none';
    }
    this.osd.style.display = screen === 'flight' ? '' : 'none';
    this.renderMenu();
  }

  isModal() {
    return this.screen !== 'flight';
  }

  setBest(ms) {
    this.titleBest.textContent = ms != null ? `Track record ${formatTime(ms)}` : 'No lap recorded yet';
    this.osdBest.textContent = ms != null ? `Record ${formatTime(ms)}` : 'No record yet';
  }

  showResults(laps, best, voided) {
    this.resultsBody.textContent = '';
    const clean = laps.filter((l) => Number.isFinite(l));
    this.resultsHead.textContent = clean.length ? 'Run complete' : 'Run ended';
    if (!clean.length) {
      this.resultsBody.append(el('p', 'lede', 'No clean lap this run. A gate tap voids the lap it happens on, so the clock starts again at the mint ring.'));
    }
    clean.forEach((ms, i) => {
      const row = el('div', 'result-row');
      row.append(el('span', 'result-label', `Lap ${i + 1}`));
      row.append(el('span', 'result-time', formatTime(ms)));
      if (ms === Math.min(...clean)) {
        row.append(el('span', 'result-tag', 'fastest'));
      }
      this.resultsBody.append(row);
    });
    if (clean.length) {
      const total = clean.reduce((a, b) => a + b, 0);
      const row = el('div', 'result-row total');
      row.append(el('span', 'result-label', 'Total'));
      row.append(el('span', 'result-time', formatTime(total)));
      this.resultsBody.append(row);
    }
    if (voided > 0) {
      this.resultsBody.append(el('p', 'lede', voided === 1 ? 'One lap was voided by a gate touch.' : `${voided} laps were voided by a gate touch.`));
    }
    if (best != null) {
      this.resultsBody.append(el('p', 'lede', `Track record ${formatTime(best)}.`));
    }
    this.show('results');
  }

  setBanner(text) {
    this.banner.textContent = text || '';
    this.banner.style.opacity = text ? '1' : '0';
  }

  /*
   * Flight overlay values. Prose and units a pilot reads: seconds, volts,
   * metres, kilometres per hour. No identifiers, no raw state.
   */
  setOsd({ lapMs, gate, gateCount, volts, amps, packFrac, altitude, speedKph, throttle }) {
    /* Before the first gate there is no lap to time, so the clock reads
     * zero and dims rather than showing a row of dashes. */
    const running = lapMs != null && Number.isFinite(lapMs);
    this.osdTimer.textContent = running ? formatTime(lapMs) : '0.00';
    this.osdTimer.className = running ? 'osd-timer' : 'osd-timer waiting';
    this.osdGate.textContent = `Gate ${gate} of ${gateCount}`;
    this.osdPack.textContent = `${volts.toFixed(1)} volts`;
    this.osdAmps.textContent = `${amps.toFixed(0)} amps drawn`;
    this.osdPackBar.style.width = `${Math.max(0, Math.min(1, packFrac)) * 100}%`;
    this.osdSpeed.textContent = `${speedKph.toFixed(0)} km/h`;
    this.osdAlt.textContent = `${altitude.toFixed(0)} m above the valley`;
    this.osdThrBar.style.width = `${Math.max(0, Math.min(1, throttle)) * 100}%`;
  }

  setReadout(lines) {
    this.readout.style.display = this.settings.readout ? '' : 'none';
    this.readout.textContent = this.settings.readout ? lines : '';
  }

  /* Cursor movement and selection, shared by keyboard and sticks. */
  move(dir) {
    const n = this.items().length;
    if (!n) {
      return;
    }
    this.cursor = (this.cursor + dir + n) % n;
    this.renderMenu();
  }

  adjust(dir) {
    const it = this.items()[this.cursor];
    if (it && it.adjust) {
      it.adjust(dir);
      saveSettings(this.settings);
      this.renderMenu();
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
    this.act(it.action);
  }

  back() {
    if (this.screen === 'title' || this.screen === 'flight') {
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
    this.act(this.returnTo === 'paused' ? 'paused' : 'title');
  }

  act(action) {
    if (action === 'howto' || action === 'settings') {
      this.returnTo = this.screen === 'paused' ? 'paused' : 'title';
      this.show(action);
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
    if (code === 'ArrowUp' || code === 'KeyW') {
      this.move(-1);
      return true;
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      this.move(1);
      return true;
    }
    if (code === 'ArrowLeft' || code === 'KeyA') {
      this.adjust(-1);
      return true;
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      this.adjust(1);
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
   * Stick navigation. channels are the normalised sticks, buttons the
   * gamepad button states. Edge triggered so a held stick moves one row.
   */
  pollPad(channels, buttons) {
    if (this.screen === 'flight') {
      this.padPrev = { up: false, down: false, left: false, right: false, select: false, back: false };
      return;
    }
    const anyButton = buttons.some(Boolean);
    const now = {
      up: channels.pitch > 0.55,
      down: channels.pitch < -0.55,
      right: channels.roll > 0.55,
      left: channels.roll < -0.55,
      select: anyButton,
      back: false,
    };
    const it = this.items()[this.cursor];
    const rollAdjusts = Boolean(it && it.adjust);
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
    this.padPrev = now;
  }
}
