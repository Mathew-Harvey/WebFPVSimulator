/*
 * pids.js: the pilot's PID adjustment, and the only place it is decided.
 *
 * WHAT THIS IS. The flight-controller screen went because eight tabs and a
 * CLI textarea helped nobody, and for a while the PIDs went with it: two
 * fixed tunes and no way to move them. A beta tester then reported both
 * tunes floppy and said they used to push the PIDs to 200-300 percent.
 * This module is the answer: Betaflight Configurator's own tuning sliders,
 * and an expert table for setting PIDs directly, with no CLI paste
 * anywhere. The crapshack tune is the same report answered with a preset;
 * this is it answered with a control.
 *
 * NOTHING HERE COMPUTES A PID. A slider adjustment is emitted as the
 * firmware's own `set simplified_*` keys followed by the real CLI command
 * `simplified_tuning apply`, so the arithmetic that turns a master
 * multiplier of 185 into P83 is Betaflight's config/simplified_tuning.c,
 * compiled into the module, exactly as it is when Configurator drags a
 * slider. The expert table is emitted as plain `set p_roll = ...` lines
 * with `simplified_pids_mode = OFF`, which is exactly what Configurator's
 * expert mode writes. Per CLAUDE.md: the behaviour was already compiled,
 * this file only asks for it.
 *
 * PER TUNE, NOT PER PILOT, and this is the decision that makes the tunes
 * stay comparable. Rates are global because how far the stick goes belongs
 * to the hand that holds it; PIDs belong to the tune, so an adjustment is
 * keyed by tune id and switching tunes switches to that tune's own
 * adjustment (usually none). A single global override would make the Tune
 * row a lie: every choice would fly the same numbers.
 *
 * SPARSE ON PURPOSE. A slider the pilot has not moved is not stored and
 * not emitted, so the tune's own value keeps governing it; move the master
 * on Karate and Karate's I, D and feedforward sliders keep doing their
 * work underneath it, which is what Configurator does with a preset
 * loaded. Putting a slider back on the tune's own value deletes the
 * override rather than storing a copy, so "back where it was" and "stock"
 * are the same state and the same config text, and the best-lap record key
 * (a hash of that text) agrees.
 *
 * UNITS AND BOUNDS. Sliders are the firmware's uint8 percent, 100 is the
 * tune's own scale. The compiled CLI shim does not enforce the valueTable
 * ranges (it took 250 and flew it, measured), so the menu owns the clamp:
 * 200 is SIMPLIFIED_TUNING_MAX and the six sliders that scale a gain are
 * floored at 30 here, because a master of zero is a craft with no
 * controller, reported as a physics bug by whoever types it. Zero of
 * feedforward and zero of dynamic damping are real setups and stay legal.
 * The expert table uses the firmware's own bounds from the 4.5.1
 * valueTable: PID_GAIN_MAX 250, D_MIN_GAIN_MAX 250, F_GAIN_MAX 1000.
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

import { TUNES } from './registry.js';

/*
 * One slider, in the shape src/ui/ui.js number() rows read: cliMin and
 * cliMax are the stored bounds, scale and decimals say how the number is
 * written, unit is printed after the field. One arrow press is one
 * percent, because the firmware holds whole percent and there is nothing
 * finer to move to.
 */
function slider(cli, label, cliMin, note) {
  return {
    cli, label, cliMin, cliMax: 200, scale: 1, decimals: 0, unit: '%', note,
  };
}

/* Configurator's slider set, master first because it is the one the
 * feedback asked for. The keys are this module's own short names; the CLI
 * key each one writes is in `cli`. */
export const SLIDER_KEYS = ['master', 'pi', 'i', 'd', 'dmax', 'ff', 'pitchPi', 'pitchD'];

export const SLIDERS = {
  master: slider('simplified_master_multiplier', 'Master multiplier', 30,
    'Everything at once: P, I, D and feedforward all scale together, ratios kept. This is the "make it stiffer" knob, and the one the flight feel feedback asked for. The Crapshack tune ships at 185.'),
  pi: slider('simplified_pi_gain', 'Tracking, P and I', 30,
    'How hard the quad chases the rate the stick asks for. Low is lazy and smooth, high snaps onto the setpoint and holds it.'),
  i: slider('simplified_i_gain', 'Drift and wobble, I', 30,
    'The slow-error term on its own. Too low drifts off attitude in wind-up moves; too high winds during a long throw and dumps it as a twitch when the stick centres. On this plant the twitch arrives well before the drift.'),
  d: slider('simplified_d_gain', 'Damping, D', 30,
    'Resists rotation, smooths stops, calms propwash. On a real quad D is paid for in motor heat and gyro noise; this model’s gyro is clean, so damping is nearly free and the stiff tunes run it high.'),
  dmax: slider('simplified_dmax_gain', 'Dynamic damping, D max', 0,
    'How much extra D arrives during fast moves and stops, on top of the base D. Zero holds D constant.'),
  ff: slider('simplified_feedforward_gain', 'Stick response, FF', 0,
    'Feedforward pushes on stick movement itself, before any error exists. High is immediate; too high overshoots the start of every move. Zero flies on P and D alone.'),
  pitchPi: slider('simplified_pitch_pi_gain', 'Pitch tracking', 30,
    'Pitch P and I relative to roll. A quad is longer than it is wide, so pitch usually carries a few percent more.'),
  pitchD: slider('simplified_pitch_d_gain', 'Pitch damping', 30,
    'Pitch D relative to roll, for the same reason pitch tracking exists.'),
};

/* The expert table, Configurator's columns in Configurator's order. The
 * naming trap is written down where it bites: the column Configurator
 * calls D is the CLI's d_min_*, and the column it calls D Max is the
 * CLI's d_*, because Betaflight 4.3 renamed the display and not the
 * firmware. pidCliKey below is the one place the mapping exists. */
export const PID_AXES = ['roll', 'pitch', 'yaw'];
export const PID_FIELDS = ['p', 'i', 'd', 'dmax', 'f'];

function pidField(label, cliMax, note) {
  return {
    label, cliMin: 0, cliMax, scale: 1, decimals: 0, unit: '', note,
  };
}

export const PID_FIELD_SPECS = {
  p: pidField('P', 250,
    'Proportional: how hard the quad pushes toward the rate the stick asks for, right now. The stiffness knob.'),
  i: pidField('I', 250,
    'Integral: holds attitude against slow, persistent error. Too high winds during a held move and twitches when the stick centres.'),
  d: pidField('D', 250,
    'Damping. This is the CLI’s d_min: the D flown most of the time. Configurator calls it D, the firmware calls it d_min, and both mean this number.'),
  dmax: pidField('D max', 250,
    'The ceiling D rises to during fast moves and stops. This is the CLI’s d_roll / d_pitch / d_yaw. Set at or below D and the firmware simply flies D constant.'),
  f: pidField('Feedforward', 1000,
    'Pushes on stick movement itself, before any error exists. The immediacy knob.'),
};

export function pidCliKey(field, axis) {
  const stem = { p: 'p', i: 'i', d: 'd_min', dmax: 'd', f: 'f' }[field];
  return `${stem}_${axis}`;
}

/*
 * Betaflight 4.5.1's own factory PIDs, in this module's display shape (d
 * is d_min, dmax is d). From pgResetTemplate in flight/pid.c, and read
 * back identically from the compiled module. The panel notches its bars
 * with these, and the expert table falls back to them when it has to be
 * seeded before the module has been read.
 */
export const STOCK_PIDS = Object.freeze({
  roll: Object.freeze({ p: 45, i: 80, d: 30, dmax: 40, f: 120 }),
  pitch: Object.freeze({ p: 47, i: 84, d: 34, dmax: 46, f: 125 }),
  yaw: Object.freeze({ p: 45, i: 80, d: 0, dmax: 0, f: 120 }),
});

function clampTo(spec, value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.max(spec.cliMin, Math.min(spec.cliMax, n));
}

/*
 * Clamp a stored adjustment onto what the firmware and the menu will take.
 * Same contract as normaliseRates: a localStorage blob from an older
 * build, a hand edit, or a bug upstream cannot put an out-of-range number
 * into a uint8 field or an unknown tune id into the emitter. An expert
 * entry whose table is incomplete falls back to sliders rather than
 * flying a half-table, and an entry adjusting nothing is dropped, so
 * "stock" has exactly one representation.
 */
export function normalisePids(p) {
  const out = {};
  if (!p || typeof p !== 'object') {
    return out;
  }
  for (const t of TUNES) {
    const e = p[t.id];
    if (!e || typeof e !== 'object') {
      continue;
    }
    const given = e.sliders && typeof e.sliders === 'object' ? e.sliders : {};
    const sliders = {};
    for (const k of SLIDER_KEYS) {
      const v = clampTo(SLIDERS[k], given[k]);
      if (v != null && k in given) {
        sliders[k] = v;
      }
    }
    let pids = null;
    if (e.pids && typeof e.pids === 'object') {
      pids = {};
      for (const axis of PID_AXES) {
        const a = e.pids[axis] && typeof e.pids[axis] === 'object' ? e.pids[axis] : {};
        pids[axis] = {};
        for (const f of PID_FIELDS) {
          const v = clampTo(PID_FIELD_SPECS[f], a[f]);
          if (v == null) {
            pids = null;
            break;
          }
          pids[axis][f] = v;
        }
        if (!pids) {
          break;
        }
      }
    }
    const mode = e.mode === 'expert' && pids ? 'expert' : 'sliders';
    if (!pids && Object.keys(sliders).length === 0) {
      continue;
    }
    const entry = { mode, sliders };
    if (pids) {
      entry.pids = pids;
    }
    out[t.id] = entry;
  }
  return out;
}

/* The stored entry for one tune, or null. The rows mutate this through
 * the helpers below; loadSettings has already normalised it. */
export function pidsEntry(p, tuneId) {
  const e = p && typeof p === 'object' ? p[tuneId] : null;
  return e && typeof e === 'object' ? e : null;
}

function ensureEntry(p, tuneId) {
  if (!pidsEntry(p, tuneId)) {
    p[tuneId] = { mode: 'sliders', sliders: {} };
  }
  return p[tuneId];
}

/* Drop an entry that no longer adjusts anything, so that walking a slider
 * back to the tune's own value IS reverting and the record key agrees. */
function pruneEntry(p, tuneId) {
  const e = pidsEntry(p, tuneId);
  if (e && e.mode !== 'expert' && Object.keys(e.sliders).length === 0 && !e.pids) {
    delete p[tuneId];
  }
}

/*
 * Move one slider. `tuneValue` is the value the TUNE itself holds for
 * this slider, read out of the running module; landing back on it deletes
 * the override instead of storing a copy of the tune.
 */
export function setPidSlider(p, tuneId, key, value, tuneValue) {
  const v = clampTo(SLIDERS[key], value);
  if (v == null) {
    return;
  }
  const e = ensureEntry(p, tuneId);
  if (tuneValue != null && v === tuneValue) {
    delete e.sliders[key];
  } else {
    e.sliders[key] = v;
  }
  pruneEntry(p, tuneId);
}

/*
 * Enter or leave the expert table. Entering seeds the table from `seed`,
 * which the caller reads out of the running module, so the first edit
 * starts from exactly what is flying; the stored slider overrides are
 * kept, inactive, so leaving expert restores them. Leaving keeps the
 * table too, inactive, so a pilot can flip back without losing work.
 */
export function setPidsExpert(p, tuneId, on, seed) {
  const e = ensureEntry(p, tuneId);
  if (on) {
    e.mode = 'expert';
    if (!e.pids) {
      const src = seed || STOCK_PIDS;
      e.pids = {};
      for (const axis of PID_AXES) {
        e.pids[axis] = {};
        for (const f of PID_FIELDS) {
          e.pids[axis][f] = clampTo(PID_FIELD_SPECS[f], src[axis] ? src[axis][f] : null)
            ?? STOCK_PIDS[axis][f];
        }
      }
    }
  } else {
    e.mode = 'sliders';
  }
  pruneEntry(p, tuneId);
}

export function clearPidsFor(p, tuneId) {
  if (p && typeof p === 'object') {
    delete p[tuneId];
  }
}

export function pidsAdjusted(p, tuneId) {
  return pidsDiffFor(p, tuneId) !== '';
}

/*
 * The adjustment as Betaflight CLI text, appended to the tune by
 * composeConfig in src/fc/dump.js, BEFORE the rates block so the rates
 * stay the last word on their own keys. Empty when nothing is adjusted,
 * and that emptiness is a contract: an untouched tune composes to exactly
 * the text it composed to before this module existed, so every stored
 * best lap keeps its key.
 *
 * The sliders block does not set simplified_pids_mode. The tune's own
 * mode governs, which is why the master reaches yaw on the default and
 * Crapshack (RPY) and leaves Karate's yaw alone (RP), exactly as
 * Configurator behaves with those presets loaded.
 */
export function pidsDiffFor(p, tuneId) {
  const e = normalisePids(p)[tuneId];
  if (!e) {
    return '';
  }
  if (e.mode === 'expert') {
    const lines = [
      '',
      '# PIDs, set by hand on the PIDs screen. See configs/pids.js.',
      'profile 0',
      'set simplified_pids_mode = OFF',
    ];
    for (const axis of PID_AXES) {
      for (const f of PID_FIELDS) {
        lines.push(`set ${pidCliKey(f, axis)} = ${e.pids[axis][f]}`);
      }
    }
    lines.push('');
    return lines.join('\n');
  }
  const keys = SLIDER_KEYS.filter((k) => k in e.sliders);
  if (keys.length === 0) {
    return '';
  }
  const lines = [
    '',
    '# PID sliders, from the PIDs screen. See configs/pids.js.',
    'profile 0',
  ];
  for (const k of keys) {
    lines.push(`set ${SLIDERS[k].cli} = ${e.sliders[k]}`);
  }
  lines.push('simplified_tuning apply', '');
  return lines.join('\n');
}

/* One phrase for the menu row, so the pilot can see whether the tune
 * under the cursor is stock without opening the screen. */
export function pidsSummary(p, tuneId) {
  const e = normalisePids(p)[tuneId];
  if (!e) {
    return 'Stock';
  }
  if (e.mode === 'expert') {
    return 'Set by hand';
  }
  const keys = SLIDER_KEYS.filter((k) => k in e.sliders);
  if (keys.length === 0) {
    return 'Stock';
  }
  if ('master' in e.sliders) {
    const rest = keys.length - 1;
    return rest === 0
      ? `Master ${e.sliders.master}%`
      : `Master ${e.sliders.master}%, ${rest} more slider${rest === 1 ? '' : 's'}`;
  }
  return `${keys.length} slider${keys.length === 1 ? '' : 's'} moved`;
}
