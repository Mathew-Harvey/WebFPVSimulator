/*
 * dump.js: parse and serialize Betaflight CLI text, and the only place
 * a tune and a rate profile are joined.
 *
 * The UI never writes a PID. It edits a dump. Save means sim.init(text),
 * the same call a dropped file already uses. composeConfig is the one
 * join so pause-menu Tune, drop-file, and FC Save cannot diverge.
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

import { ratesDiff } from '../../configs/rates.js';

export const RATES_KEEP = 'keep-mine';
export const RATES_DUMP = 'use-dump';

/*
 * Keys the pilot owns. Switching a registry tune must not overwrite them.
 * A dropped dump that carries a rateprofile is stripped unless the import
 * policy is use-dump, and even then the dump's rate lines are appended
 * last so they win over the menu without leaving a second source of truth
 * in the tune body.
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

export function serializeSets(sets) {
  return sets.map((s) => `set ${s.key} = ${s.value}`).join('\n');
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

export function ratesSettingsFromDump(text) {
  const map = cliMap(text);
  const centre = Number(map.get('roll_rc_rate'));
  const max = Number(map.get('roll_srate'));
  const yaw = Number(map.get('yaw_srate'));
  const expo = Number(map.get('roll_expo'));
  const cap = Number(map.get('throttle_limit_percent'));
  const out = {};
  if (Number.isFinite(centre)) {
    out.rateCentre = centre * 10;
  }
  if (Number.isFinite(max)) {
    out.rateMax = max * 10;
  }
  if (Number.isFinite(yaw)) {
    out.rateYawMax = yaw * 10;
  }
  if (Number.isFinite(expo)) {
    out.rateExpo = expo;
  }
  if (Number.isFinite(cap)) {
    out.throttleCap = cap;
  }
  return out;
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

export function composeConfig(tuneText, rates, policy = RATES_KEEP) {
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
  const menuRates = ratesDiff(rates);
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
