/*
 * fc-valuetable.js: parse Betaflight 4.5.1 CLI keys out of settings.c and
 * the keys this module actually writes out of bf_settings.c.
 *
 * The catalog lint uses this so a firmware key that never made it into
 * src/fc/catalog-data.js is a build failure, and a LIVE catalog key that
 * is missing from bf_settings.c is also a failure. That is the drift that
 * used to let d_min_roll apply and change nothing.
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

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function parseParamNames(src) {
  const map = new Map();
  const re = /#define\s+(PARAM_NAME_\w+)\s+"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    map.set(m[1], m[2]);
  }
  return map;
}

function stripLineComment(line) {
  const i = line.indexOf('//');
  if (i < 0) {
    return line;
  }
  return line.slice(0, i);
}

function tableBody(src) {
  const start = src.indexOf('const clivalue_t valueTable[]');
  if (start < 0) {
    throw new Error('valueTable[] not found in settings.c');
  }
  const brace = src.indexOf('{', start);
  const end = src.indexOf('const uint16_t valueTableEntryCount', brace);
  if (brace < 0 || end < 0) {
    throw new Error('valueTable[] body not found in settings.c');
  }
  return src.slice(brace, end);
}

function splitEntries(body) {
  /* Skip the array's own opening brace, then each `{ ... }` at depth 1
   * is one clivalue_t initialiser. Nested braces are minmax/lookup. */
  const entries = [];
  let i = 1;
  const n = body.length;
  while (i < n) {
    while (i < n && body[i] !== '{') {
      i += 1;
    }
    if (i >= n) {
      break;
    }
    let depth = 0;
    const from = i;
    for (; i < n; i += 1) {
      const c = body[i];
      if (c === '{') {
        depth += 1;
      } else if (c === '}') {
        depth -= 1;
        if (depth === 0) {
          entries.push(body.slice(from, i + 1));
          i += 1;
          break;
        }
      }
    }
  }
  return entries;
}

function resolveKey(token, names) {
  if (token.startsWith('"')) {
    return token.slice(1, -1);
  }
  const key = names.get(token);
  if (!key) {
    throw new Error(`unresolved ${token} in valueTable`);
  }
  return key;
}

export function parseValueTable(src, names) {
  const raw = tableBody(src)
    .split('\n')
    .map(stripLineComment)
    .join('\n');
  const entries = splitEntries(raw);
  const rows = [];
  const seen = new Set();
  for (const entry of entries) {
    const km = entry.match(/^\{\s*(PARAM_NAME_\w+|"[^"]+")\s*,/);
    if (!km) {
      continue;
    }
    const key = resolveKey(km[1], names);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const varM = entry.match(/VAR_(UINT8|UINT16|INT8|INT16|UINT32)/);
    const lutM = entry.match(/TABLE_([A-Z0-9_]+)/);
    const pgM = entry.match(/PG_([A-Z0-9_]+)/);
    const minmaxU = entry.match(/minmaxUnsigned\s*=\s*\{\s*([^,}]+)\s*,\s*([^}]+)\s*\}/);
    const minmax = entry.match(/minmax\s*=\s*\{\s*([^,}]+)\s*,\s*([^}]+)\s*\}/);
    const array = /MODE_ARRAY/.test(entry);
    rows.push({
      key,
      type: varM ? varM[1] : 'UINT8',
      lookup: lutM ? lutM[1] : null,
      pg: pgM ? pgM[1] : null,
      min: minmaxU ? minmaxU[1].trim() : minmax ? minmax[1].trim() : null,
      max: minmaxU ? minmaxU[2].trim() : minmax ? minmax[2].trim() : null,
      array,
    });
  }
  return rows;
}

export function parseBfSettingsKeys(src, names) {
  const start = src.indexOf('void bf_settings_build(void)');
  const end = src.indexOf('static const char *const INERT_PREFIX');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('bf_settings_build body not found');
  }
  const body = src.slice(start, end);
  const keys = [];
  const seen = new Set();
  const re = /\b(?:U8|U16|I8|I16|LUT8|LUTI8)\(\s*(PARAM_NAME_\w+|"[^"]+")/g;
  let m;
  while ((m = re.exec(body))) {
    const key = resolveKey(m[1], names);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export async function loadFirmwareTables(root) {
  const names = parseParamNames(
    await readFile(join(root, 'vendor/betaflight/src/main/fc/parameter_names.h'), 'utf8'),
  );
  const table = parseValueTable(
    await readFile(join(root, 'vendor/betaflight/src/main/cli/settings.c'), 'utf8'),
    names,
  );
  const live = parseBfSettingsKeys(
    await readFile(join(root, 'src/native/bf/bf_settings.c'), 'utf8'),
    names,
  );
  return { names, table, live };
}
