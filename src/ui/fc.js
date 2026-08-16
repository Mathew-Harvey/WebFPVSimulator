/*
 * fc.js: the flight-controller screen.
 *
 * Configurator-shaped tabs and fields. The UI never writes a PID. It edits
 * a CLI dump. Save is sim.init of that dump, the same call a dropped file
 * already uses. Grey-out is catalog.status, one disabled style, no per-tab
 * special cases.
 *
 * Colours and tab names are a homage of Betaflight Configurator 10.10
 * (firmware 4.5.1). This is not that app: no Vue, no MSP, no iframe.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { RATE_DEFAULTS } from '../../configs/rates.js';
import { TUNES, tunePath } from '../../configs/registry.js';
import {
  FEATURES,
  FIELDS,
  STATUS,
  TABS,
  fieldBounds,
  fieldEnabled,
  lookupValues,
  tabFields,
} from '../fc/catalog.js';
import {
  cliGet,
  composeConfig,
  exportCli,
  featureEnabled,
  RATES_KEEP,
  ratesSettingsFromDump,
  setCliValue,
  setFeatureLine,
} from '../fc/dump.js';

const PID_PAGES = [
  { id: 'pid', label: 'PID' },
  { id: 'filters', label: 'Filters' },
  { id: 'rates', label: 'Rates' },
];

function cycle(list, value, dir) {
  const i = list.indexOf(value);
  const n = list.length;
  return list[((i < 0 ? 0 : i) + dir + n) % n];
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function stepFor(_min, _max) {
  return 1;
}

function actualRateLabel(key) {
  const axis = key.split('_')[0];
  if (key.endsWith('_rc_rate')) {
    return `${axis} centre`;
  }
  if (key.endsWith('_srate')) {
    return `${axis} max rate`;
  }
  return key;
}

function isActualRateKey(key) {
  return /(_rc_rate|_srate)$/.test(key);
}

function formatField(field, raw) {
  if (raw == null || raw === '') {
    return 'unset';
  }
  if (field.units) {
    return `${raw} ${field.units}`;
  }
  return String(raw);
}

function sectionFor(field, page) {
  const k = field.key;
  if (page === 'pid') {
    if (k.startsWith('simplified_')) {
      return 'Simplified tuning';
    }
    if (/^[pidf]_/.test(k) || k.startsWith('d_min')) {
      return 'PID';
    }
    if (k.startsWith('iterm_')) {
      return 'Iterm relax';
    }
    if (k.startsWith('anti_gravity')) {
      return 'Anti gravity';
    }
    if (k.startsWith('tpa_') || k.startsWith('throttle_boost')) {
      return 'TPA';
    }
    if (k.startsWith('feedforward_')) {
      return 'Feedforward';
    }
    if (k.startsWith('angle_') || k.startsWith('horizon_') || k.startsWith('level_')) {
      return 'Angle';
    }
    return 'Advanced';
  }
  if (page === 'filters') {
    if (k.startsWith('simplified_')) {
      return 'Simplified filters';
    }
    if (k.startsWith('gyro_lpf')) {
      return 'Gyro lowpass';
    }
    if (k.startsWith('dyn_notch')) {
      return 'Dynamic gyro notch';
    }
    if (k.startsWith('dterm_') || k.startsWith('yaw_lowpass')) {
      return 'D term';
    }
    if (k.startsWith('rpm_')) {
      return 'RPM filter';
    }
    return 'Filters';
  }
  if (page === 'rates') {
    if (k === 'rates_type' || /_rc_rate$|_srate$|_expo$|_rate_limit$/.test(k) || k.startsWith('quickrates')) {
      return 'Rates';
    }
    return 'Throttle';
  }
  if (field.tab === 'receiver') {
    if (k.startsWith('rc_smoothing')) {
      return 'RC smoothing';
    }
    if (/check$|mid_rc|airmode_start/.test(k)) {
      return 'Receiver';
    }
    return 'Radio link';
  }
  if (field.tab === 'motors') {
    if (/^dshot_|^motor_poles|^bidir/.test(k)) {
      return 'DShot';
    }
    return 'Mixer';
  }
  if (field.tab === 'configuration') {
    return 'Configuration';
  }
  return '';
}

function fieldRank(field, page) {
  const k = field.key;
  if (page === 'pid') {
    if (k.startsWith('simplified_')) {
      return 0;
    }
    if (/^[pidf]_/.test(k) || k.startsWith('d_min')) {
      return 1;
    }
    return 2;
  }
  if (page === 'filters') {
    if (k.startsWith('simplified_')) {
      return 0;
    }
    if (k.startsWith('gyro_lpf')) {
      return 1;
    }
    if (k.startsWith('dyn_notch')) {
      return 2;
    }
    if (k.startsWith('dterm_') || k.startsWith('yaw_lowpass')) {
      return 3;
    }
    if (k.startsWith('rpm_')) {
      return 4;
    }
    return 5;
  }
  if (page === 'rates') {
    if (k === 'rates_type') {
      return 0;
    }
    if (/_rc_rate$/.test(k)) {
      return 1;
    }
    if (/_srate$/.test(k) || k.endsWith('_rate_limit')) {
      return 2;
    }
    if (/expo/.test(k)) {
      return 3;
    }
    return 4;
  }
  return 0;
}

function fieldNote(field, draft, session) {
  const look = (key) => (session ? session.cliValue(key) : cliGet(draft, key));
  if (field.key === 'gyro_lpf1_static_hz' && Number(look('gyro_lpf1_dyn_min_hz')) > 0) {
    return 'Firmware inits LPF1 from gyro_lpf1_dyn_min_hz while that is above 0. Set dyn min to 0 to make this cutoff live. Same as 4.5.1.';
  }
  if (field.status === STATUS.GATED) {
    return field.reason;
  }
  if (!fieldEnabled(field)) {
    return field.reason;
  }
  if (field.key.startsWith('simplified_')) {
    return 'Writes the slider, then simplified_tuning apply, then any expert lines below it. Betaflight does the math.';
  }
  return field.key;
}

function ratesForCompose(draft) {
  return { ...RATE_DEFAULTS, ...ratesSettingsFromDump(draft) };
}

export class FcSession {
  constructor() {
    this.snapshot = '';
    this.draft = '';
    /* See cliMapCached: the parsed draft and the text it was parsed from. */
    this.cliCache = null;
    this.cliCacheText = null;
    this.tab = 'pid';
    this.page = 'pid';
    this.runActive = false;
    this.confirm = null;
    this.importText = '';
    this.importName = '';
    this.presetId = '';
    this.motorDuty = [0, 0, 0, 0];
    this.attitude = { w: 1, x: 0, y: 0, z: 0 };
    this.getFlightMode = () => 'acro';
    this.setFlightMode = () => {};
    this.motorTestAllowed = () => false;
    this.onMotorTest = () => {};
  }

  open(dumpText, opts = {}) {
    this.snapshot = dumpText ?? '';
    this.draft = this.snapshot;
    this.tab = opts.tab || 'pid';
    this.page = opts.page || 'pid';
    this.runActive = Boolean(opts.runActive);
    this.confirm = null;
    this.importText = '';
    this.importName = '';
    this.presetId = '';
    this.motorDuty = [0, 0, 0, 0];
  }

  openImport(text, name) {
    this.importText = text ?? '';
    this.importName = name || 'dropped.diff';
    this.confirm = 'import-rates';
    this.tab = 'cli';
    this.draft = this.importText;
  }

  /*
   * The parsed draft, built at most once per distinct draft text.
   *
   * cliGet is cliMap().get(), and cliMap splits and scans the WHOLE dump.
   * fieldItem asked for one key per field, items() ran fieldItem for every
   * visible field, and the menu calls items() several times per keystroke,
   * so a cursor move on Configuration (126 fields) re-parsed a 20 kB dump
   * hundreds of times and the screen fell below a readable frame rate while
   * scrolling.
   *
   * Keyed on the text, not invalidated by hand. draft is assigned from a
   * dozen places here and directly from main.js when a config load lands,
   * and a cache cleared at each of those is a cache that goes stale the day
   * a thirteenth is added. Strings are immutable, so holding the one it was
   * built from is the whole check.
   */
  cliMapCached() {
    if (!this.cliCache || this.cliCacheText !== this.draft) {
      this.cliCache = cliMap(this.draft);
      this.cliCacheText = this.draft;
    }
    return this.cliCache;
  }

  cliValue(key) {
    return this.cliMapCached().get(key) ?? null;
  }

  dirty() {
    return this.draft !== this.snapshot;
  }

  discard() {
    this.draft = this.snapshot;
    this.confirm = null;
    this.presetId = '';
    this.stopMotors();
  }

  setTab(id) {
    this.tab = id;
    if (id === 'pid' && !PID_PAGES.some((p) => p.id === this.page)) {
      this.page = 'pid';
    }
  }

  setDraft(text) {
    this.draft = text ?? '';
    this.presetId = '';
  }

  setValue(key, value) {
    const f = FIELDS.find((row) => row.key === key);
    if (!f || !fieldEnabled(f)) {
      return;
    }
    this.draft = setCliValue(this.draft, key, value);
    this.presetId = '';
  }

  setFeature(name, on) {
    const row = FEATURES.find((f) => f.name === name);
    if (!row || row.status !== STATUS.LIVE) {
      return;
    }
    this.draft = setFeatureLine(this.draft, name, on);
    this.presetId = '';
  }

  async applyPreset(id) {
    const path = tunePath(id);
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error(`preset ${id} HTTP ${res.status}`);
    }
    const text = await res.text();
    this.draft = composeConfig(text, ratesForCompose(this.draft), RATES_KEEP);
    this.presetId = id;
    this.tab = 'pid';
    this.page = 'pid';
  }

  stopMotors() {
    this.motorDuty = [0, 0, 0, 0];
    this.onMotorTest(-1, -1);
  }

  setMotorDuty(index, duty) {
    if (!this.motorTestAllowed()) {
      return;
    }
    const d = clamp(duty, 0, 1);
    if (index < 0) {
      this.motorDuty = [d, d, d, d];
      this.onMotorTest(-1, d > 0 ? d : -1);
      if (d === 0) {
        this.onMotorTest(-1, -1);
      }
      return;
    }
    this.motorDuty[index] = d;
    this.onMotorTest(index, d > 0 ? d : -1);
  }

  exportText() {
    return exportCli(this.draft);
  }

  items() {
    if (this.confirm === 'save-run') {
      return [
        {
          label: 'Save and restart the run',
          action: 'fc-save-restart',
          note: 'Save writes the dump through sim_init, which resets the craft. That is the same as changing a rate today.',
        },
        {
          label: 'Wait until the result screen',
          action: 'fc-wait',
          note: 'Keeps the draft. Save when the run is over. Live PID mid-lap is out of this round.',
        },
      ];
    }
    if (this.confirm === 'import-rates') {
      return [
        {
          label: 'Keep my rates',
          action: 'fc-import-keep',
          note: `Default. Loads ${this.importName} as a tune and keeps the rates already on this radio.`,
        },
        {
          label: 'Use dump rates',
          action: 'fc-import-dump',
          note: `Takes rateprofile lines from ${this.importName}. Same as flashing a tune that carried the pilot's rates.`,
        },
        {
          label: 'Cancel',
          action: 'fc-import-cancel',
          note: 'Leaves the live dump alone.',
        },
      ];
    }

    const tab = TABS.find((t) => t.id === this.tab) ?? TABS[0];
    const rows = [];
    rows.push({
      label: 'Tab',
      note: tab.grey ? tab.reason : 'Configurator tabs. Grey tabs can be read, not edited.',
      value: tab.label,
      current: tab.id,
      options: TABS.map((t) => ({ value: t.id, label: t.label })),
      pick: (v) => this.setTab(v),
      adjust: (d) => this.setTab(cycle(TABS.map((t) => t.id), this.tab, d)),
    });

    if (this.tab === 'pid') {
      const page = PID_PAGES.find((p) => p.id === this.page) ?? PID_PAGES[0];
      rows.push({
        label: 'Page',
        note: 'PID Tuning in 4.5.1 is PID, Filters, and Rates.',
        value: page.label,
        current: page.id,
        options: PID_PAGES.map((p) => ({ value: p.id, label: p.label })),
        pick: (v) => { this.page = v; },
        adjust: (d) => { this.page = cycle(PID_PAGES.map((p) => p.id), this.page, d); },
      });
    }

    rows.push({
      label: 'Save',
      action: 'fc-save',
      rowClass: 'fc-btn',
      note: this.dirty()
        ? 'Writes the draft dump through sim_init, then adopts the module clock so stick lag cannot return.'
        : 'No edits. Save does not re-init, so a live race is not killed for nothing.',
    });
    rows.push({
      label: 'Discard',
      action: 'fc-discard',
      rowClass: 'fc-btn',
      note: 'Restores the dump that was live when this screen opened.',
    });
    rows.push({
      label: 'Export',
      action: 'fc-export',
      rowClass: 'fc-btn',
      note: 'Downloads CLI text a 4.5 Configurator can read. Does not Save.',
    });
    rows.push({
      label: 'Back',
      action: 'fc-back',
      rowClass: 'fc-btn',
      note: 'Leaves this screen. Unsaved edits are discarded.',
    });

    if (this.tab === 'cli') {
      rows.push({
        label: 'Edit dump',
        action: 'fc-focus-cli',
        note: 'The textarea is the dump. Typing here is the same as editing fields. Save is sim_init of this text.',
      });
      return rows;
    }

    if (this.tab === 'presets') {
      for (const t of TUNES) {
        rows.push({
          label: t.name,
          action: `fc-preset:${t.id}`,
          note: `${t.note} Keep-mine rates. Save still required.`,
        });
      }
      rows.push({
        label: 'firmware-presets',
        value: 'Unavailable',
        note: 'Optional later: fetch from betaflight/firmware-presets 4.5 branch only. Master presets would be a version lie.',
        info: true,
        disabled: true,
        rowClass: 'row-grey',
      });
      return rows;
    }

    if (this.tab === 'modes') {
      const angle = this.getFlightMode() === 'angle';
      rows.push({
        label: 'ARM',
        value: 'Always on',
        note: 'The sim is always armed. A real board uses an AUX range.',
        info: true,
        disabled: true,
        rowClass: 'row-grey',
      });
      rows.push({
        label: 'ANGLE',
        note: 'On or off, same sim_set_angle_mode as Flight mode in Settings. A real board uses an AUX range. Keyboard flight always uses Angle.',
        value: angle ? 'On' : 'Off',
        current: angle,
        options: [
          { value: true, label: 'On' },
          { value: false, label: 'Off' },
        ],
        pick: (v) => this.setFlightMode(v === true || v === 'true'),
        adjust: () => this.setFlightMode(!angle),
      });
      rows.push({
        label: 'HORIZON',
        value: 'Unavailable',
        note: 'No AUX channels until they are fed from the gamepad.',
        info: true,
        disabled: true,
        rowClass: 'row-grey',
      });
      rows.push({
        label: 'GPS RESCUE',
        value: 'Unavailable',
        note: 'No GPS sensor in the plant.',
        info: true,
        disabled: true,
        rowClass: 'row-grey',
      });
      return rows;
    }

    if (this.tab === 'setup') {
      rows.push({
        label: 'Attitude',
        value: 'Live',
        note: 'Horizon from the plant quaternion (sim_state). The simulated gyro needs no calibration.',
        info: true,
      });
    }

    if (this.tab === 'configuration') {
      rows.push({
        label: 'Features',
        info: true,
        disabled: true,
        rowClass: 'fc-section',
        note: 'feature lines in the dump. Same path a preset uses.',
      });
      for (const feat of FEATURES) {
        const live = feat.status === STATUS.LIVE;
        const on = featureEnabled(this.draft, feat.name);
        const shown = on == null ? (live ? 'unset' : 'Off') : (on ? 'On' : 'Off');
        if (!live) {
          rows.push({
            label: `feature ${feat.name}`,
            value: shown,
            note: feat.reason,
            info: true,
            disabled: true,
            rowClass: 'row-grey',
          });
          continue;
        }
        const current = Boolean(on);
        rows.push({
          label: `feature ${feat.name}`,
          note: feat.reason,
          value: current ? 'On' : 'Off',
          current,
          options: [
            { value: true, label: 'On' },
            { value: false, label: 'Off' },
          ],
          pick: (v) => this.setFeature(feat.name, v === true || v === 'true'),
          adjust: () => this.setFeature(feat.name, !current),
        });
      }
    }

    if (this.tab === 'motors') {
      const allowed = this.motorTestAllowed();
      if (!allowed) {
        rows.push({
          label: 'Motor test',
          value: 'Unavailable',
          note: 'Motor test uses sim_motor_override on the title, never mid-race. Open Flight controller from the title.',
          info: true,
          disabled: true,
          rowClass: 'row-grey',
        });
      } else {
        rows.push({
          label: 'All motors',
          note: 'Title only. sim_motor_override, the same ABI check 8 uses. Stop before you Save.',
          value: `${Math.round(this.motorDuty[0] * 100)} %`,
          step: true,
          adjust: (d) => this.setMotorDuty(-1, this.motorDuty[0] + d * 0.05),
        });
        for (let i = 0; i < 4; i += 1) {
          rows.push({
            label: `Motor ${i + 1}`,
            note: 'Betaflight order: 1 rear right, 2 front right, 3 rear left, 4 front left.',
            value: `${Math.round(this.motorDuty[i] * 100)} %`,
            step: true,
            adjust: (d) => this.setMotorDuty(i, this.motorDuty[i] + d * 0.05),
          });
        }
        rows.push({
          label: 'Stop motors',
          action: 'fc-motors-stop',
          note: 'Clears sim_motor_override.',
        });
      }
    }

    const fields = this.visibleFields();
    if (tab.grey && fields.length === 0) {
      rows.push({
        label: tab.label,
        value: 'Unavailable',
        note: tab.reason,
        info: true,
        disabled: true,
        rowClass: 'row-grey',
      });
    }
    let lastSection = '';
    for (const field of fields) {
      const section = sectionFor(field, this.tab === 'pid' ? this.page : '');
      if (section && section !== lastSection) {
        lastSection = section;
        rows.push({
          label: section,
          info: true,
          disabled: true,
          rowClass: 'fc-section',
          note: 'Configurator group. Values still travel as CLI.',
        });
      }
      rows.push(this.fieldItem(field, tab.grey));
    }
    return rows;
  }

  visibleFields() {
    let list = tabFields(this.tab);
    if (this.tab === 'pid') {
      list = list.filter((f) => f.page === this.page);
    }
    if (this.tab === 'cli' || this.tab === 'presets' || this.tab === 'modes') {
      return [];
    }
    const enabled = [];
    const grey = [];
    for (const f of list) {
      if (f.key.startsWith('#')) {
        grey.push(f);
        continue;
      }
      if (fieldEnabled(f)) {
        enabled.push(f);
      } else {
        grey.push(f);
      }
    }
    enabled.sort((a, b) => fieldRank(a, this.page) - fieldRank(b, this.page));
    return enabled.concat(grey);
  }

  fieldItem(field, tabGrey) {
    const raw = this.cliValue(field.key);
    const dynMinOn = field.key === 'gyro_lpf1_static_hz'
      && Number(this.cliValue('gyro_lpf1_dyn_min_hz')) > 0;
    const enabled = !tabGrey && fieldEnabled(field) && !dynMinOn;
    const note = fieldNote(field, this.draft, this);
    const actual = isActualRateKey(field.key) && this.cliValue('rates_type') === 'ACTUAL';
    const label = actual ? actualRateLabel(field.key) : field.key;
    const greyClass = enabled ? (field.status === STATUS.GATED ? 'row-gated' : '') : 'row-grey';
    if (!enabled) {
      return {
        label,
        value: formatField(field, raw),
        note,
        info: true,
        disabled: true,
        rowClass: 'row-grey',
      };
    }
    const lut = field.lookup ? lookupValues(field.lookup) : null;
    if (lut && lut.length) {
      const current = lut.includes(raw) ? raw : (raw ?? lut[0]);
      return {
        label,
        note,
        value: formatField(field, current),
        current,
        options: lut.map((c) => ({ value: c, label: c })),
        pick: (v) => this.setValue(field.key, v),
        adjust: (d) => this.setValue(field.key, cycle(lut, current, d)),
        rowClass: greyClass,
      };
    }
    const { min, max } = fieldBounds(field);
    const n = Number(raw);
    const cur = Number.isFinite(n) ? n : min;
    const shown = actual ? cur * 10 : cur;
    const lo = actual ? min * 10 : min;
    const hi = actual ? max * 10 : max;
    const step = actual ? 10 : stepFor(min, max);
    return {
      label,
      note: actual
        ? `Configurator display. CLI is ${field.key} = ${cur} (tens of deg/s). Export writes that.`
        : note,
      value: actual ? `${shown} deg/s` : formatField(field, String(cur)),
      step: true,
      adjust: (d) => {
        const nextShown = clamp(shown + d * step, lo, hi);
        const nextCli = actual ? nextShown / 10 : nextShown;
        this.setValue(field.key, String(nextCli));
      },
      rowClass: greyClass,
    };
  }
}

export function paintTabStrip(nav, session, onPick) {
  if (!nav.dataset.ready) {
    nav.textContent = '';
    for (const t of TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fc-tab';
      b.dataset.id = t.id;
      b.textContent = t.label;
      b.addEventListener('click', () => onPick(t.id));
      nav.append(b);
    }
    nav.dataset.ready = '1';
  }
  for (const b of nav.children) {
    const t = TABS.find((x) => x.id === b.dataset.id);
    b.classList.toggle('on', session.tab === b.dataset.id);
    b.classList.toggle('grey', Boolean(t && t.grey));
  }
}

export function paintPageStrip(nav, session, onPick) {
  if (!nav) {
    return;
  }
  const show = session.tab === 'pid' && !session.confirm;
  nav.hidden = !show;
  if (!show) {
    return;
  }
  if (!nav.dataset.ready) {
    nav.textContent = '';
    for (const p of PID_PAGES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fc-page';
      b.dataset.id = p.id;
      b.textContent = p.label;
      b.addEventListener('click', () => onPick(p.id));
      nav.append(b);
    }
    nav.dataset.ready = '1';
  }
  for (const b of nav.children) {
    b.classList.toggle('on', session.page === b.dataset.id);
  }
}

/*
 * A Configurator-shaped horizon from the plant quaternion. Body-to-world,
 * z up. Not Betaflight's Three.js widget and not their assets.
 */
export function drawAttitude(canvas, q) {
  if (!canvas) {
    return;
  }
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx || w < 8 || h < 8) {
    return;
  }
  const qw = q.w;
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const sinr = 2 * (qw * qx + qy * qz);
  const cosr = 1 - 2 * (qx * qx + qy * qy);
  const roll = Math.atan2(sinr, cosr);
  /*
   * The sign is the whole point here. This instrument is drawn the way an
   * aviation horizon is drawn, which assumes the aerospace NED frame: x
   * forward, y RIGHT, z DOWN. The quaternion it is fed is the plant's, and
   * that frame is x forward, y LEFT, z UP, so a positive rotation about
   * body y is nose DOWN, not nose up. Reading NED pitch off it put the
   * ground up when the nose went down. Negating the pitch term is the frame
   * change, and it belongs here, at the instrument, because this is a
   * drawing and not the render boundary: the one conversion that physics is
   * allowed lives in src/render/frame.js. Roll needs no such fix, it reads
   * the same in both frames.
   */
  const sinp = 2 * (qz * qx - qw * qy);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
  ctx.fillStyle = '#3a81c5';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-roll);
  const y = pitch * (h / Math.PI);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(-w, y, w * 2, h * 2);
  ctx.strokeStyle = '#ffbb00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#ffbb00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.2, h / 2);
  ctx.lineTo(w * 0.45, h / 2);
  ctx.moveTo(w * 0.55, h / 2);
  ctx.lineTo(w * 0.8, h / 2);
  ctx.moveTo(w / 2 - 6, h / 2);
  ctx.lineTo(w / 2 + 6, h / 2);
  ctx.stroke();
}

export function downloadCli(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'betaflight.diff';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
