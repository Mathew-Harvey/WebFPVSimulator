/*
 * patreon-selftest.js: check the Patreon note has the live prices.
 *
 * The old tiers were $5, $12 and $25. The dashboard now shows $3, $8 and
 * $20, and that is what PATREON_NOTE carries. GST was removed: Patreon
 * itself shows the inclusive price and handles the reporting, not the
 * creator. This check proves the note is up to date and nothing else in
 * the tree names a stale price.
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

import { PATREON_NOTE } from '../src/share/patreon.js';

let passed = 0;
let failed = 0;
const fails = [];

function check(what, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${what}`);
    return;
  }
  failed += 1;
  fails.push(`${what}${detail ? `, ${detail}` : ''}`);
  console.log(`  FAIL  ${what}${detail ? `, ${detail}` : ''}`);
}

console.log('patreon-selftest');

/* The note must carry the current tier prices. */
check('PATREON_NOTE includes $3', PATREON_NOTE.includes('$3'));
check('PATREON_NOTE includes $8', PATREON_NOTE.includes('$8'));
check('PATREON_NOTE includes $20', PATREON_NOTE.includes('$20'));

/* And must not mention the old prices. */
check('PATREON_NOTE does not mention $5', !PATREON_NOTE.includes('$5'));
check('PATREON_NOTE does not mention $12', !PATREON_NOTE.includes('$12'));
check('PATREON_NOTE does not mention $25', !PATREON_NOTE.includes('$25'));

/* GST was removed. Patreon handles the inclusive price. */
check('PATREON_NOTE does not mention GST', !PATREON_NOTE.includes('GST'));

console.log(failed ? `\n${failed} failed` : '\nall passed');
for (const f of fails) {
  console.log(`  FAIL ${f}`);
}
process.exitCode = failed ? 1 : 0;
