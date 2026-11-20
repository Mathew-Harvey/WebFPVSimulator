#!/usr/bin/env node
/*
 * review-splits-selftest.js: src/review/splits.js, driven in Node.
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
  LEVEL_MS, chasedLabel, compareSplits, deltaText, sectionName, sectionTimes, toneOf,
} from '../src/review/splits.js';

let failures = 0;

function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const near = (a, b) => Math.abs(a - b) < 1e-9;

console.log('names');
check('the first section runs from the start', sectionName(0, 4) === 'The start to gate 1');
check('a middle one gate to gate', sectionName(1, 4) === 'Gate 1 to gate 2');
check('the last one to the finish', sectionName(3, 4) === 'Gate 3 to the finish');
check('a one gate course is the start to the finish', sectionName(0, 1) === 'The start to the finish');

console.log('times');
check('each section is the difference of two splits', JSON.stringify(sectionTimes([1000, 2500, 4200])) === '[1000,1500,1700]');
check('no splits, no sections', sectionTimes([]).length === 0);

console.log('tone and text');
check('faster is gained', toneOf(-230) === 'gained' && deltaText(-230) === '-0.23 s');
check('slower is lost', toneOf(410) === 'lost' && deltaText(410) === '+0.41 s');
check('under the level line is level, both ways', toneOf(LEVEL_MS - 1) === 'level' && toneOf(-(LEVEL_MS - 1)) === 'level' && deltaText(3) === '0.00 s');
check('at the line it is a difference', toneOf(LEVEL_MS) === 'lost' && toneOf(-LEVEL_MS) === 'gained');
check('nothing to compare is level, not a number', toneOf(NaN) === 'level');

console.log('the comparison');
{
  const lap = { splits: [1000, 2600, 4100], durationMs: 4100 };
  const ref = { splits: [1100, 2500, 4300], durationMs: 4300 };
  const c = compareSplits(lap, ref);
  check('matched, with nothing to explain', c.matched === true && c.why === '');
  check('three sections', c.sections.length === 3);
  const [a, b, d] = c.sections;
  check('the first gained a tenth', near(a.deltaMs, -100) && a.tone === 'gained' && a.lapMs === 1000 && a.refMs === 1100);
  check('the second lost two tenths', near(b.deltaMs, 200) && b.tone === 'lost' && b.lapMs === 1600 && b.refMs === 1400);
  check('the third gained three tenths', near(d.deltaMs, -300) && d.tone === 'gained');
  check('the sections add up to the lap', near(c.sections.reduce((s, x) => s + x.deltaMs, 0), c.total.deltaMs));
  check('the lap gained two tenths', near(c.total.deltaMs, -200) && c.total.tone === 'gained');
  check('names follow the course', a.name === 'The start to gate 1' && d.name === 'Gate 2 to the finish');
}
{
  const c = compareSplits({ splits: [1000, 2000], durationMs: 2000 }, null);
  check('no ghost: the lap\'s own times and a sentence', !c.matched && /No ghost/.test(c.why) && c.sections[1].lapMs === 1000 && c.sections[1].refMs === null && c.sections[1].tone === 'none' && c.total.deltaMs === null);
}
{
  const c = compareSplits({ splits: [1000, 2000], durationMs: 2000 }, { splits: [900, 1500, 2100], durationMs: 2100 });
  check('a ghost of another course shape: only the lap time', !c.matched && /line up/.test(c.why) && c.sections.every((s) => s.deltaMs === null) && near(c.total.deltaMs, -100));
}

console.log('the ghost\'s name');
check('a lap that beat the best it chased names it the previous best', chasedLabel('Best  12.50', true, 12000, 12500) === 'Previous best  12.50');
check('a lap slower than the best it chased still says Best', chasedLabel('Best  12.50', true, 13000, 12500) === 'Best  12.50');
check('a rival keeps its name', chasedLabel('Rival  12.50', false, 12000, 12500) === 'Rival  12.50');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
