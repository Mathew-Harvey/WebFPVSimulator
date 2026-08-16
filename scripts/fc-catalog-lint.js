/*
 * fc-catalog-lint.js: fail if a 4.5.1 valueTable key is missing from the
 * catalog, or a LIVE catalog key is missing from bf_settings.c.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ABSENT_FIELDS,
  APPLIED_INERT_KEYS,
  FIELDS,
  GATED_KEYS,
  STATUS,
  TABS,
  catalogCounts,
} from '../src/fc/catalog.js';
import { loadFirmwareTables } from './fc-valuetable.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const REQUIRED_TABS = [
  'setup',
  'ports',
  'configuration',
  'pid',
  'receiver',
  'modes',
  'adjustments',
  'servos',
  'motors',
  'osd',
  'vtx',
  'led',
  'gps',
  'failsafe',
  'blackbox',
  'blackbox-viewer',
  'power',
  'presets',
  'cli',
  'flasher',
  'autotune',
  'flight-plan',
  'cloud-profile',
  'cloud-backups',
];

const { table, live } = await loadFirmwareTables(root);
const liveSet = new Set(live);
const tableKeys = new Set(table.map((r) => r.key));
const catalogCli = FIELDS.filter((f) => !f.key.startsWith('#'));
const catalogKeys = new Set(catalogCli.map((f) => f.key));

const failures = [];

for (const row of table) {
  if (!catalogKeys.has(row.key)) {
    failures.push(`valueTable key missing from catalog: ${row.key}`);
  }
}

for (const f of catalogCli) {
  if (!tableKeys.has(f.key) && !liveSet.has(f.key)) {
    failures.push(`catalog CLI key is neither valueTable nor bf_settings: ${f.key}`);
  }
}

for (const f of FIELDS) {
  if (!Object.prototype.hasOwnProperty.call(STATUS, f.status) || STATUS[f.status] !== f.status) {
    failures.push(`${f.key}: bad status ${f.status}`);
  }
  if (f.status !== STATUS.LIVE && (!f.reason || !String(f.reason).trim())) {
    failures.push(`${f.key}: ${f.status} is missing a reason string`);
  }
}

for (const f of FIELDS.filter((x) => x.status === STATUS.LIVE)) {
  if (!liveSet.has(f.key)) {
    failures.push(`LIVE catalog key missing from bf_settings.c: ${f.key}`);
  }
}

for (const key of GATED_KEYS) {
  const f = FIELDS.find((x) => x.key === key);
  if (!f) {
    failures.push(`GATED key missing from catalog: ${key}`);
  } else if (f.status !== STATUS.GATED) {
    failures.push(`${key}: expected GATED, got ${f.status}`);
  }
  if (!liveSet.has(key)) {
    failures.push(`GATED key missing from bf_settings.c: ${key}`);
  }
}

for (const key of APPLIED_INERT_KEYS) {
  const f = FIELDS.find((x) => x.key === key);
  if (!f) {
    failures.push(`APPLIED_INERT key missing from catalog: ${key}`);
  } else if (f.status !== STATUS.APPLIED_INERT) {
    failures.push(`${key}: expected APPLIED_INERT, got ${f.status}`);
  }
  if (!liveSet.has(key)) {
    failures.push(`APPLIED_INERT key missing from bf_settings.c: ${key}`);
  }
}

/*
 * A write-table key that is catalogued INERT is the d_min_roll class of
 * lie: the module stores it, the catalog greys it for the wrong reason,
 * or worse, greys a LIVE control. Every bf_settings.c key must be LIVE,
 * GATED, or APPLIED_INERT.
 */
const honestWrite = new Set(['LIVE', 'GATED', 'APPLIED_INERT']);
for (const key of liveSet) {
  const f = FIELDS.find((x) => x.key === key);
  if (!f) {
    failures.push(`bf_settings.c key missing from catalog: ${key}`);
  } else if (!honestWrite.has(f.status)) {
    failures.push(`bf_settings.c key ${key} is catalogued ${f.status}; must be LIVE, GATED, or APPLIED_INERT`);
  }
}

const tabIds = new Set(TABS.map((t) => t.id));
for (const id of REQUIRED_TABS) {
  if (!tabIds.has(id)) {
    failures.push(`required tab missing: ${id}`);
  }
}

for (const t of TABS) {
  if (t.grey && (!t.reason || !String(t.reason).trim())) {
    failures.push(`grey tab ${t.id} is missing a reason string`);
  }
}

if (ABSENT_FIELDS.length === 0) {
  failures.push('ABSENT_FIELDS is empty; Configurator chrome must be catalogued');
}

const counts = catalogCounts();
console.log('fc-catalog-lint: 4.5.1 valueTable against src/fc/catalog.js\n');
console.log(`  valueTable keys     ${table.length}`);
console.log(`  bf_settings.c keys  ${live.length}`);
console.log(`  catalog CLI keys    ${catalogCli.length}`);
console.log(`  LIVE                ${counts.LIVE}`);
console.log(`  GATED               ${counts.GATED}`);
console.log(`  APPLIED_INERT       ${counts.APPLIED_INERT}`);
console.log(`  INERT               ${counts.INERT}`);
console.log(`  ABSENT              ${counts.ABSENT}`);
console.log(`  tabs                ${TABS.length}`);

if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  for (const f of failures) {
    console.log(`  FAIL  ${f}`);
  }
  process.exit(1);
}

console.log('\nok  catalog covers valueTable, LIVE keys are in bf_settings.c');
process.exit(0);
