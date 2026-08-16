/*
 * fc.js: the flight-controller screen.
 *
 * Configurator-shaped tabs and fields. The UI never writes a PID. It edits
 * a CLI dump. Save is sim.init of that dump, the same call a dropped file
 * already uses. Grey-out is catalog.status, one disabled style, no per-tab
 * special cases.
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

import {
  FIELDS,
  STATUS,
  TABS,
  fieldBounds,
  fieldEnabled,
  lookupValues,
  tabFields,
} from '../fc/catalog.js';
import { cliGet, exportCli, setCliValue } from '../fc/dump.js';

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

function fieldNote(field) {
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

export class FcSession {
  constructor() {
    this.snapshot = '';
    this.draft = '';
    this.tab = 'pid';
    this.page = 'pid';
    this.runActive = false;
    this.confirm = null;
  }

  open(dumpText, opts = {}) {
    this.snapshot = dumpText ?? '';
    this.draft = this.snapshot;
    this.tab = opts.tab || 'pid';
    this.page = opts.page || 'pid';
    this.runActive = Boolean(opts.runActive);
    this.confirm = null;
  }

  dirty() {
    return this.draft !== this.snapshot;
  }

  discard() {
    this.draft = this.snapshot;
    this.confirm = null;
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
      note: this.dirty()
        ? 'Writes the draft dump through sim_init, then adopts the module clock so stick lag cannot return.'
        : 'No edits. Save does not re-init, so a live race is not killed for nothing.',
    });
    rows.push({
      label: 'Discard',
      action: 'fc-discard',
      note: 'Restores the dump that was live when this screen opened.',
    });
    rows.push({
      label: 'Export',
      action: 'fc-export',
      note: 'Downloads CLI text a 4.5 Configurator can read. Does not Save.',
    });
    rows.push({
      label: 'Back',
      action: 'fc-back',
      note: 'Leaves this screen. Unsaved edits are discarded.',
    });

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
    for (const field of fields) {
      rows.push(this.fieldItem(field, tab.grey));
    }
    return rows;
  }

  visibleFields() {
    let list = tabFields(this.tab);
    if (this.tab === 'pid') {
      list = list.filter((f) => f.page === this.page);
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
    const raw = cliGet(this.draft, field.key);
    const enabled = !tabGrey && fieldEnabled(field);
    const note = fieldNote(field);
    const label = field.key;
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
    const actual = isActualRateKey(field.key) && cliGet(this.draft, 'rates_type') === 'ACTUAL';
    const shown = actual ? cur * 10 : cur;
    const lo = actual ? min * 10 : min;
    const hi = actual ? max * 10 : max;
    const step = actual ? 10 : stepFor(min, max);
    return {
      label,
      note: actual
        ? 'ACTUAL rates. Firmware stores tens of deg/s. This row shows deg/s, same as the Settings summary.'
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
