/*
 * fc.js: the flight-controller screen, restored.
 *
 * Configurator-shaped tabs and fields. The UI never writes a PID. It edits
 * a CLI dump of the running module. Save is sim.init of that dump, and the
 * shell then adopts the result as the pilot's own tune, "Your edits" on
 * the Tune row, alongside the shipped three.
 *
 * HISTORY, because this file has been deleted once and that record is the
 * reason it looks the way it does. The first flight-controller screen was
 * removed for being unusable, and its jobs were split into the screens
 * that still exist: Rates, PIDs and the Tune row. The owner then asked for
 * the full surface back, minus exactly one thing: THERE IS NO WAY TO PASTE
 * OR UPLOAD CLI TEXT HERE. The CLI tab, the textarea and the drop-a-diff
 * import from the first version did not come back. Every field is edited
 * through a control with firmware bounds, and every edit still travels as
 * CLI through setCliValue, so the honesty of the first version survives
 * without its foot-gun.
 *
 * OWNERSHIP, so this screen and the simple ones cannot fight. Rates
 * belong to the Rates screen: the Rateprofile page here is a signpost plus
 * the leftovers, and Save routes any rate keys in the dump back INTO the
 * pilot's rate profile rather than around it. PIDs edited here become part
 * of the saved dump, which becomes the "custom" tune, whose baseline is
 * exactly what the PIDs screen then shows.
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

import { normaliseRates, RATE_DEFAULTS } from '../../configs/rates.js';
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
  cliMap,
  composeConfig,
  exportCli,
  featureEnabled,
  RATE_KEYS,
  RATES_KEEP,
  ratesFromDump,
  setCliValue,
  setFeatureLine,
} from '../fc/dump.js';

/* Configurator's tab list from the catalog, minus CLI: pasting a dump is
 * the one door the owner asked to keep shut. */
const TABS_SHOWN = TABS.filter((t) => t.id !== 'cli');

const PID_PAGES = [
  { id: 'pid', label: 'PID Profile Settings' },
  { id: 'filters', label: 'Filter Settings' },
  { id: 'rates', label: 'Rateprofile Settings' },
];

/* Step through a list with wraparound. */
export function cycle(list, value, dir) {
  const i = list.indexOf(value);
  const n = list.length;
  return list[((i < 0 ? 0 : i) + dir + n) % n];
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
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
    return 'Throttle and limits';
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
  return 0;
}

function fieldNote(field, session) {
  const look = (key) => session.cliValue(key);
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
    return 'Writes the slider, then simplified_tuning apply, then any expert lines below it. Betaflight does the math. The PIDs screen drives the same sliders with fewer steps.';
  }
  return field.key;
}

function ratesForCompose(draft) {
  return normaliseRates(ratesFromDump(draft));
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
    this.presetId = '';
    this.motorDuty = [0, 0, 0, 0];
    this.attitude = {
      w: 1, x: 0, y: 0, z: 0,
    };
    this.getFlightMode = () => 'acro';
    this.setFlightMode = () => {};
    this.getLaunchControl = () => false;
    this.setLaunchControl = () => {};
    this.motorTestAllowed = () => false;
    this.onMotorTest = () => {};
    this.exitAfterSave = false;
  }

  open(dumpText, opts = {}) {
    this.snapshot = dumpText ?? '';
    this.draft = this.snapshot;
    this.tab = opts.tab || 'pid';
    this.page = opts.page || 'pid';
    this.runActive = Boolean(opts.runActive);
    this.confirm = null;
    this.presetId = '';
    this.exitAfterSave = false;
    this.motorDuty = [0, 0, 0, 0];
  }

  /*
   * The parsed draft, built at most once per distinct draft text. cliMap
   * scans the whole 20 kB dump; items() runs per keystroke; without this
   * the Configuration tab fell below a readable frame rate. Keyed on the
   * string itself, so it can never go stale.
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

  /*
   * A registry tune into the draft, through the same composeConfig the
   * shell inits from, with the rates the DRAFT currently carries kept:
   * choosing a preset here changes the tune, never the stick. Save is
   * still required, exactly as Configurator's presets stage before Save.
   */
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

  /* Betaflight 4.5.1's own ACTUAL profile, the same numbers the Rates
   * screen's revert row writes, so the two doors agree about "default". */
  resetRatesToDefault() {
    const d = RATE_DEFAULTS;
    this.setValue('rates_type', d.type);
    this.setValue('roll_rc_rate', String(d.roll.rcRate));
    this.setValue('pitch_rc_rate', String(d.pitch.rcRate));
    this.setValue('yaw_rc_rate', String(d.yaw.rcRate));
    this.setValue('roll_srate', String(d.roll.srate));
    this.setValue('pitch_srate', String(d.pitch.srate));
    this.setValue('yaw_srate', String(d.yaw.srate));
    this.setValue('roll_expo', String(d.roll.expo));
    this.setValue('pitch_expo', String(d.pitch.expo));
    this.setValue('yaw_expo', String(d.yaw.expo));
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
          note: 'Save writes the dump through sim_init, which resets the craft. That is the same as changing a rate today. Escape cancels and stays here.',
        },
        {
          label: 'Wait until the result screen',
          action: 'fc-wait',
          note: 'Keeps the draft. Save when the run is over. Live PID mid-lap is out of this round. Escape cancels and stays here.',
        },
      ];
    }

    const tab = TABS_SHOWN.find((t) => t.id === this.tab) ?? TABS_SHOWN[0];
    const rows = [];
    rows.push({
      label: 'Tab',
      note: tab.grey ? tab.reason : 'Configurator tabs. Grey tabs can be read, not edited.',
      value: tab.label,
      current: tab.id,
      options: TABS_SHOWN.map((t) => ({ value: t.id, label: t.label })),
      pick: (v) => this.setTab(v),
      adjust: (d) => this.setTab(cycle(TABS_SHOWN.map((t) => t.id), this.tab, d)),
    });

    if (this.tab === 'pid') {
      const page = PID_PAGES.find((p) => p.id === this.page) ?? PID_PAGES[0];
      rows.push({
        label: 'Page',
        note: 'PID Tuning in 4.5.1 is PID Profile, Filters, and Rateprofile.',
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
        ? 'Writes the draft dump through sim_init and stays here. It becomes Your edits on the Tune row.'
        : 'No edits. Save does not re-init, so a live race is not killed for nothing.',
    });
    if (this.dirty()) {
      rows.push({
        label: 'Save and exit',
        action: 'fc-save-exit',
        rowClass: 'fc-btn',
        note: this.runActive
          ? 'Writes the dump, then asks whether to restart the run.'
          : 'Writes the dump through sim_init, then leaves this screen.',
      });
    }
    rows.push({
      label: 'Discard',
      action: 'fc-discard',
      rowClass: 'fc-btn',
      note: 'Restores the dump that was live when this screen opened. Stays here.',
    });
    rows.push({
      label: 'Export',
      action: 'fc-export',
      rowClass: 'fc-btn',
      note: 'Downloads CLI text a 4.5 Configurator can read. Does not Save. Text goes OUT of this simulator only; there is no door for pasting any back in.',
    });
    rows.push({
      label: this.dirty() ? 'Exit without saving' : 'Exit',
      action: 'fc-back',
      rowClass: 'fc-btn',
      note: this.dirty()
        ? 'Leaves and restores the dump that was live when this screen opened. Escape does the same.'
        : 'Leaves this screen. Escape does the same.',
    });

    if (this.tab === 'pid' && this.page === 'rates') {
      rows.push({
        label: 'Rates',
        value: 'On the Rates screen',
        note: 'Rates belong to you, not to a tune or a dump, and their own screen draws the curve your sticks ride. The Rates screen is the one editor; whatever it holds is appended to every Save from here. Below are the throttle and limit keys that are not part of the stick curve.',
        info: true,
      });
      rows.push({
        label: 'Open the Rates screen',
        action: 'rates',
        note: 'Leaves the flight controller. Unsaved edits here are kept until you exit.',
      });
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
        label: 'LAUNCH CONTROL',
        note: 'On or off, same Launch control in Settings. L on the keyboard is the mode switch on the start line. A real board uses an AUX range.',
        value: this.getLaunchControl() ? 'On' : 'Off',
        current: this.getLaunchControl(),
        options: [
          { value: true, label: 'On' },
          { value: false, label: 'Off' },
        ],
        pick: (v) => this.setLaunchControl(v === true || v === 'true'),
        adjust: () => this.setLaunchControl(!this.getLaunchControl()),
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
          note: 'Motor test uses sim_motor_override on the title, never mid-race. Open Flight controller from Settings on the title.',
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
      if (this.page === 'rates') {
        /* The Rates screen owns these; offering them here again as raw
         * CLI steppers is how the menu and the module learned to disagree
         * the first time round. */
        list = list.filter((f) => !RATE_KEYS.has(f.key));
      }
    }
    if (this.tab === 'presets' || this.tab === 'modes') {
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
    const page = this.tab === 'pid' ? this.page : '';
    enabled.sort((a, b) => fieldRank(a, page) - fieldRank(b, page));
    return enabled.concat(grey);
  }

  fieldItem(field, tabGrey) {
    const raw = this.cliValue(field.key);
    const dynMinOn = field.key === 'gyro_lpf1_static_hz'
      && Number(this.cliValue('gyro_lpf1_dyn_min_hz')) > 0;
    const enabled = !tabGrey && fieldEnabled(field) && !dynMinOn;
    const note = fieldNote(field, this);
    const greyClass = enabled ? (field.status === STATUS.GATED ? 'row-gated' : '') : 'row-grey';
    if (!enabled) {
      return {
        label: field.key,
        value: formatField(field, raw),
        note,
        info: true,
        disabled: true,
        rowClass: greyClass.trim(),
      };
    }
    const lut = field.lookup ? lookupValues(field.lookup) : null;
    if (lut && lut.length) {
      const current = lut.includes(raw) ? raw : (raw ?? lut[0]);
      return {
        label: field.key,
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
    /*
     * The simplified tuning keys draw as REAL SLIDERS, the control
     * Configurator gives them: they are the one family here whose whole
     * point is a sweep, and 0 to 200 percent is a track, not twelve arrow
     * presses. Everything else keeps the stepper; a filter cutoff is a
     * number you know, not a feel you drag toward.
     */
    if (field.key.startsWith('simplified_') && field.key !== 'simplified_pids_mode') {
      const spec = {
        cliMin: min, cliMax: max, scale: 1, decimals: 0, unit: '',
      };
      return {
        label: field.key,
        note,
        num: {
          spec, cli: cur, text: String(cur), unit: '',
        },
        range: { min, max },
        adjust: (d) => {
          this.setValue(field.key, String(clamp(cur + d, min, max)));
        },
        typed: (raw2) => {
          const t = String(raw2).trim();
          if (t === '') {
            return null;
          }
          const v = Math.round(Number(t));
          if (!Number.isFinite(v)) {
            return null;
          }
          return clamp(v, min, max);
        },
        set: (v) => {
          this.setValue(field.key, String(v));
        },
        rowClass: greyClass,
      };
    }
    /*
     * Every remaining field is a TYPED number row, the same control the
     * Rates screen earned when its lists could not hold a pilot's own
     * numbers. These were arrow steppers, and a board report made the
     * arithmetic plain: a filter cutoff spanning 1000 at one press per
     * unit is not a control, it is a punishment, and the alternative the
     * report reached for was pasting CLI, which is the one door this
     * screen does not have. The arrows stay, one firmware unit each,
     * taking the typed text as their base; the field takes the number a
     * pilot already knows. Commit is on blur or Enter, exactly as the
     * Rates screen argues.
     */
    const spec = {
      cliMin: min, cliMax: max, scale: 1, decimals: 0, unit: '',
    };
    return {
      label: field.key,
      note,
      num: {
        spec, cli: cur, text: String(cur), unit: '',
      },
      adjust: (d) => {
        this.setValue(field.key, String(clamp(cur + d, min, max)));
      },
      typed: (raw2) => {
        const t = String(raw2).trim();
        if (t === '') {
          return null;
        }
        const v = Math.round(Number(t));
        if (!Number.isFinite(v)) {
          return null;
        }
        return clamp(v, min, max);
      },
      set: (v) => {
        this.setValue(field.key, String(v));
      },
      rowClass: greyClass,
    };
  }
}

export function paintTabStrip(nav, session, onPick) {
  if (!nav.dataset.ready) {
    nav.textContent = '';
    for (const t of TABS_SHOWN) {
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
    const t = TABS_SHOWN.find((x) => x.id === b.dataset.id);
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
   * body y is nose DOWN, not nose up. Negating the pitch term is the frame
   * change, and it belongs here, at the instrument, because this is a
   * drawing and not the render boundary: the one conversion physics is
   * allowed lives in src/render/frame.js. Roll reads the same both ways.
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
