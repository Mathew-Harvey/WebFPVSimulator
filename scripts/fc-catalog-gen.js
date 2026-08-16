/*
 * fc-catalog-gen.js: write src/fc/catalog-data.js from the 4.5.1 valueTable
 * and the keys bf_settings.c actually writes.
 *
 * Do not edit catalog-data.js by hand. Change bf_settings.c or the status
 * rules in src/fc/catalog.js, then run this. lint:catalog fails if the
 * committed data lags the firmware table.
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

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFirmwareTables } from './fc-valuetable.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const { table, live } = await loadFirmwareTables(root);
const liveSet = new Set(live);

const rows = table.map((row) => ({
  key: row.key,
  type: row.type,
  lookup: row.lookup,
  pg: row.pg,
  min: row.min,
  max: row.max,
  array: row.array,
  live: liveSet.has(row.key),
}));

const extra = live.filter((k) => !table.some((r) => r.key === k));
for (const key of extra) {
  rows.push({
    key,
    type: 'UINT8',
    lookup: null,
    pg: 'RPM_FILTER_CONFIG',
    min: null,
    max: null,
    array: false,
    live: true,
  });
}

const header = `/*
 * catalog-data.js: generated from vendor/betaflight 4.5.1 valueTable and
 * src/native/bf/bf_settings.c. Do not edit. Run:
 *   node scripts/fc-catalog-gen.js
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

`;

const body =
  header +
  `export const VALUE_TABLE = ${JSON.stringify(rows, null, 2)};\n`;

const out = join(root, 'src/fc/catalog-data.js');
await writeFile(out, body, 'utf8');
const liveN = rows.filter((r) => r.live).length;
console.log(
  `fc-catalog-gen: wrote ${rows.length} keys (${table.length} valueTable, ${extra.length} bf_settings extras), ${liveN} live, to src/fc/catalog-data.js`,
);
