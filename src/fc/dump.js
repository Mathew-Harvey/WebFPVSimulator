/*
 * dump.js: parse and serialize Betaflight CLI text, and the only place
 * a tune, a PID adjustment and a rate profile are joined.
 *
 * The UI never writes CLI text of its own: the menu offers the registry
 * tunes, the pilot's PID adjustment (configs/pids.js) and the pilot's
 * rates (configs/rates.js), and composeConfig is the one join, so boot
 * and the Tune row cannot diverge. The wider surface here (setCliValue, exportCli, the
 * use-dump policy, featureEnabled) is no longer reached from the shell. It
 * stays because scripts/fc-trace.js drives it against the compiled module:
 * those traces are what prove a CLI line written here actually lands in
 * Betaflight, which is the claim the two shipped tunes rest on.
 *
 * This file does not talk to WebGL.
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

import { normaliseRates, ratesDiff } from '../../configs/rates.js';

export const RATES_KEEP = 'keep-mine';
export const RATES_DUMP = 'use-dump';

/*
 * Where the Flight controller screen's saved dump lives. Its own key
 * rather than a field in the settings blob, because it is a 20 kB
 * document and the settings are read and rewritten on every knob turn.
 * The value stored is tuneBody(dump): the pilot's rates are stripped on
 * the way in and appended from the menu on every compose, so the saved
 * dump can never smuggle a rate profile past the Rates screen.
 */
export const FC_DUMP_KEY = 'webfpv.fc.v1';

/*
 * Keys the pilot owns. Switching a registry tune must not overwrite them,
 * so composeConfig strips every one of these out of the tune body and
 * appends the pilot's own instead. That is the whole reason the two shipped
 * tunes can be compared: the Karate diff cannot quietly halve the stick
 * authority on its way in.
 *
 * The use-dump half of that story, where a dropped dump's rate lines were
 * appended last so they won over the menu, has no caller in the shell any
 * more: the drop-a-diff import went with the flight-controller screen. It
 * is still reached by scripts/fc-trace.js F7 and F8, which is what makes
 * the keep-mine claim above testable rather than asserted.
 */
export const RATE_KEYS = new Set([
  'rates_type',
  'roll_rc_rate',
  'pitch_rc_rate',
  'yaw_rc_rate',
  'roll_expo',
  'pitch_expo',
  'yaw_expo',
  'roll_srate',
  'pitch_srate',
  'yaw_srate',
  'roll_rate_limit',
  'pitch_rate_limit',
  'yaw_rate_limit',
  'quickrates_rc_expo',
  'thr_mid',
  'thr_expo',
  'throttle_limit_type',
  'throttle_limit_percent',
]);

function setKey(line) {
  const t = line.trim();
  if (!t.startsWith('set ')) {
    return null;
  }
  const rest = t.slice(4);
  let i = 0;
  while (i < rest.length && rest[i] !== ' ' && rest[i] !== '=') {
    i += 1;
  }
  return i > 0 ? rest.slice(0, i) : null;
}

export function parseCli(text) {
  const sets = [];
  const commands = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    let k = 0;
    while (k < line.length && (line[k] === ' ' || line[k] === '\t')) {
      k += 1;
    }
    const t = line.slice(k);
    if (!t || t.startsWith('#')) {
      continue;
    }
    if (t.startsWith('set ')) {
      const key = setKey(t);
      if (!key) {
        continue;
      }
      const eq = t.indexOf('=');
      if (eq < 0) {
        continue;
      }
      let v = t.slice(eq + 1).trim();
      const sp = v.search(/\s/);
      if (sp >= 0) {
        v = v.slice(0, sp);
      }
      if (v.length === 0) {
        continue;
      }
      sets.push({ key, value: v });
      continue;
    }
    const sp = t.search(/\s/);
    const w0 = sp < 0 ? t : t.slice(0, sp);
    let rest = sp < 0 ? '' : t.slice(sp).trim();
    const sp2 = rest.search(/\s/);
    const w1 = sp2 < 0 ? rest : rest.slice(0, sp2);
    commands.push({ w0, w1 });
  }
  return { sets, commands };
}

export function cliMap(text) {
  const map = new Map();
  for (const s of parseCli(text).sets) {
    map.set(s.key, s.value);
  }
  return map;
}

export function cliGet(text, key) {
  return cliMap(text).get(key) ?? null;
}

export function dumpCarriesRates(text) {
  for (const s of parseCli(text).sets) {
    if (RATE_KEYS.has(s.key)) {
      return true;
    }
  }
  return false;
}

export function featureEnabled(text, name) {
  let on = null;
  const pos = `feature ${name}`;
  const neg = `feature -${name}`;
  for (const raw of (text ?? '').split('\n')) {
    const t = raw.replace(/\r$/, '').trim();
    if (t === pos) {
      on = true;
    } else if (t === neg) {
      on = false;
    }
  }
  return on;
}

export function setFeatureLine(text, name, on) {
  const want = on ? `feature ${name}` : `feature -${name}`;
  const pos = `feature ${name}`;
  const neg = `feature -${name}`;
  const lines = [];
  for (const raw of (text ?? '').split('\n')) {
    const t = raw.replace(/\r$/, '').trim();
    if (t === pos || t === neg) {
      continue;
    }
    lines.push(raw.replace(/\r$/, ''));
  }
  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }
  lines.push(want);
  return `${lines.join('\n')}\n`;
}

export function tuneBody(text) {
  const kept = [];
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    const t = line.trim();
    if (t.startsWith('set ')) {
      const key = setKey(t);
      if (key && RATE_KEYS.has(key)) {
        continue;
      }
    }
    if (t.startsWith('rateprofile ')) {
      continue;
    }
    kept.push(line);
  }
  let out = kept.join('\n');
  if (out.length && !out.endsWith('\n')) {
    out += '\n';
  }
  return out;
}

function hasCommand(text, cmd) {
  const want = cmd.trim();
  for (const raw of (text ?? '').split('\n')) {
    if (raw.replace(/\r$/, '').trim() === want) {
      return true;
    }
  }
  return false;
}

function isSimplifiedKey(key) {
  return key.startsWith('simplified_');
}

export function ensureSimplifiedApply(text) {
  /*
   * Apply has to be last. A WASM dump is the live PGs, including expert
   * P/I/D that simplified_tuning already wrote on the previous init. If
   * apply sits above those expert lines, moving a slider writes the
   * slider and changes nothing, which is a LIVE control that lies.
   */
  const kept = [];
  for (const raw of (text ?? '').split('\n')) {
    if (raw.replace(/\r$/, '').trim() === 'simplified_tuning apply') {
      continue;
    }
    kept.push(raw);
  }
  while (kept.length && kept[kept.length - 1] === '') {
    kept.pop();
  }
  kept.push('simplified_tuning apply');
  return `${kept.join('\n')}\n`;
}

function moveSetAfterApply(text, key) {
  const lines = (text ?? '').split('\n');
  let applyAt = -1;
  let keyAt = -1;
  let keyLine = null;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].replace(/\r$/, '').trim();
    if (t === 'simplified_tuning apply') {
      applyAt = i;
    }
    if (setKey(t) === key) {
      keyAt = i;
      keyLine = lines[i];
    }
  }
  if (applyAt < 0 || keyAt < 0 || keyAt > applyAt) {
    return text;
  }
  lines.splice(keyAt, 1);
  if (keyAt < applyAt) {
    applyAt -= 1;
  }
  lines.splice(applyAt + 1, 0, keyLine);
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

export function setCliValue(text, key, value) {
  const line = `set ${key} = ${value}`;
  const lines = (text ?? '').split('\n');
  let found = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (setKey(lines[i].replace(/\r$/, '').trim()) === key) {
      found = i;
    }
  }
  if (found >= 0) {
    lines[found] = line;
  } else {
    while (lines.length && lines[lines.length - 1] === '') {
      lines.pop();
    }
    lines.push(line);
  }
  let out = `${lines.join('\n').replace(/\n+$/, '')}\n`;
  if (isSimplifiedKey(key)) {
    out = ensureSimplifiedApply(out);
  } else if (hasCommand(out, 'simplified_tuning apply')) {
    out = moveSetAfterApply(out, key);
  }
  return out;
}

const WEIGHT_KEYS = ['rpm_filter_weights_1', 'rpm_filter_weights_2', 'rpm_filter_weights_3'];

export function exportCli(text) {
  const map = cliMap(text);
  const lines = [];
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    const key = setKey(line.trim());
    if (key && WEIGHT_KEYS.includes(key)) {
      continue;
    }
    lines.push(line);
  }
  if (WEIGHT_KEYS.some((k) => map.has(k))) {
    const w = WEIGHT_KEYS.map((k) => map.get(k) ?? '100').join(',');
    while (lines.length && lines[lines.length - 1] === '') {
      lines.pop();
    }
    lines.push(`set rpm_filter_weights = ${w}`);
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

/*
 * A dropped dump's rate profile, as the profile the menu holds.
 *
 * EVERY TYPE, not just ACTUAL. The old five knob model could only read an
 * ACTUAL dump, because a BETAFLIGHT roll_rc_rate of 100 is RC Rate 1.00 and
 * not 1000 deg/s of centre sensitivity, and writing that through the menu
 * would have replaced the profile the firmware was flying with a different
 * one. The menu now holds the same three uint8s per axis the firmware does,
 * plus the type they are read under, so a dump of any type reads straight
 * across and nothing has to be reinterpreted.
 *
 * Reached by scripts/fc-trace.js rather than by the shell: the drop-a-diff
 * import went with the flight-controller screen. It is what makes the
 * keep-mine claim in composeConfig testable rather than asserted.
 */
export function ratesFromDump(text) {
  const map = cliMap(text);
  const num = (key) => {
    const v = Number(map.get(key));
    return Number.isFinite(v) ? v : undefined;
  };
  return normaliseRates({
    type: map.get('rates_type'),
    roll: { rcRate: num('roll_rc_rate'), srate: num('roll_srate'), expo: num('roll_expo') },
    pitch: { rcRate: num('pitch_rc_rate'), srate: num('pitch_srate'), expo: num('pitch_expo') },
    yaw: { rcRate: num('yaw_rc_rate'), srate: num('yaw_srate'), expo: num('yaw_expo') },
    throttleCap: num('throttle_limit_percent'),
  });
}

export function expandRpmWeights(text) {
  const lines = [];
  let weights = null;
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    const key = setKey(line.trim());
    if (key === 'rpm_filter_weights') {
      const eq = line.indexOf('=');
      weights = eq >= 0 ? line.slice(eq + 1).trim() : '';
      continue;
    }
    lines.push(line);
  }
  if (weights == null) {
    return text ?? '';
  }
  const parts = weights.split(',').map((s) => s.trim());
  const names = WEIGHT_KEYS;
  for (let i = 0; i < names.length; i += 1) {
    const v = parts[i] && parts[i] !== '' ? parts[i] : '100';
    let found = false;
    for (let j = 0; j < lines.length; j += 1) {
      if (setKey(lines[j].trim()) === names[i]) {
        lines[j] = `set ${names[i]} = ${v}`;
        found = true;
        break;
      }
    }
    if (!found) {
      lines.push(`set ${names[i]} = ${v}`);
    }
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

/*
 * The one join. Tune body first, then the pilot's PID adjustment, then the
 * pilot's rates.
 *
 * `pidsText` is the CLI block configs/pids.js emits for the loaded tune,
 * and it is a STRING, already chosen for a tune id, because this module
 * does not know which tune it is composing: the caller does. It sits
 * AFTER the tune body so its `simplified_tuning apply` re-runs on top of
 * whatever slider state the tune set up, which is exactly what dragging a
 * slider in Configurator does with a preset loaded, and BEFORE the rates
 * so the rates stay the last word on their own keys. Empty by default, and
 * an empty block composes byte-identically to the pre-PID-screen text, so
 * stored best-lap keys survive for anyone who has not touched a slider.
 */
export function composeConfig(tuneText, rates, policy = RATES_KEEP, pidsText = '') {
  const kept = [];
  const dumpRateLines = [];
  const src = expandRpmWeights(tuneText ?? '');
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const t = line.trim();
    if (t.startsWith('set ')) {
      const key = setKey(t);
      if (key && RATE_KEYS.has(key)) {
        dumpRateLines.push(line);
        continue;
      }
    }
    if (t.startsWith('rateprofile ')) {
      continue;
    }
    kept.push(line);
  }
  let out = kept.join('\n');
  if (out.length && !out.endsWith('\n')) {
    out += '\n';
  }
  out += pidsText || '';
  const menuRates = ratesDiff(rates);
  /* The use-dump policy has no caller in the shell; scripts/fc-trace.js F7
   * is the only one left. Do not prune: it is the control the keep-mine
   * traces are measured against. */
  if (policy === RATES_DUMP && dumpRateLines.length > 0) {
    return out + menuRates + dumpRateLines.join('\n') + '\n';
  }
  return out + menuRates;
}

function cString(sim, ptr, n) {
  if (n <= 0) {
    return '';
  }
  const bytes = new Uint8Array(sim.e.memory.buffer, ptr, n);
  return new TextDecoder().decode(bytes);
}

export function moduleDump(sim, cap = 65536) {
  if (typeof sim.e.sim_bf_dump !== 'function') {
    throw new Error('sim.wasm does not export sim_bf_dump; rebuild with npm run build:wasm');
  }
  let size = cap;
  for (let i = 0; i < 4; i += 1) {
    const ptr = sim.e.malloc(size);
    if (!ptr) {
      throw new Error('sim.wasm malloc failed for dump buffer');
    }
    try {
      const n = sim.e.sim_bf_dump(ptr, size);
      if (n < 0) {
        throw new Error('sim_bf_dump failed');
      }
      if (n < size) {
        return cString(sim, ptr, n);
      }
      size = n + 2;
    } finally {
      sim.e.free(ptr);
    }
  }
  throw new Error('sim_bf_dump did not fit');
}

export function moduleGet(sim, key) {
  if (typeof sim.e.sim_bf_get !== 'function') {
    throw new Error('sim.wasm does not export sim_bf_get; rebuild with npm run build:wasm');
  }
  const kbytes = new TextEncoder().encode(`${key}\0`);
  const kp = sim.e.malloc(kbytes.length);
  const cap = 64;
  const op = sim.e.malloc(cap);
  if (!kp || !op) {
    throw new Error('sim.wasm malloc failed for get buffer');
  }
  try {
    new Uint8Array(sim.e.memory.buffer, kp, kbytes.length).set(kbytes);
    const n = sim.e.sim_bf_get(kp, op, cap);
    if (n < 0) {
      return null;
    }
    return cString(sim, op, Math.min(n, cap - 1));
  } finally {
    sim.e.free(kp);
    sim.e.free(op);
  }
}
