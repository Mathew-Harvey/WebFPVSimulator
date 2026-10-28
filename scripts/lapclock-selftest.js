/*
 * lapclock-selftest.js: every clock that prints a lap, asked the same
 * questions, in Node.
 *
 * There were six of them, written one at a time, and every one took the
 * seconds from the raw milliseconds and rounded on the way out, so none
 * carried the minute: a 59.996 s lap printed 60.00, a 1:59.996 one printed
 * 1:60.00, and the yard's clock, which padded before it rounded, printed
 * 69.996 s as 1:010.00. They round to the hundredth first now and carry
 * the minute, as the board's formatLap always did. A new lap clock belongs
 * in the list below.
 *
 * It is a script rather than a section of src/trackbuilder/selftest.js
 * because it imports the shell and the rooms, and scripts/props-check.js
 * holds that nothing under src/trackbuilder reaches the shell's marks.
 *
 * Run: node scripts/lapclock-selftest.js   (npm run lapclock:selftest)
 * Exit code is the failure count, like the other selftests.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 */

import { formatTime } from '../src/ui/ui.js';
import { lapText } from '../src/ui/yardhud.js';
import { fmtMs } from '../src/net/together.js';
import { fmt as raceFlashTime } from '../src/game/race.js';
import { lapCall } from '../src/render/voice.js';
import { formatLap } from '../src/picker/picker.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}

const clocks = [
  ['formatTime (the shell)', formatTime],
  ['lapText (the yard)', lapText],
  ['fmtMs (the rooms)', fmtMs],
  ['fmt (the race flash)', raceFlashTime],
  ['formatLap (the picker)', formatLap],
];
const asked = [[59996, '1:00.00'], [119996, '2:00.00'], [69996, '1:10.00'], [59994, '59.99'],
  [61234, '1:01.23'], [9996, '10.00'], [12340, '12.34'], [600000, '10:00.00']];
for (const [name, fn] of clocks) {
  const got = asked.map(([ms]) => fn(ms));
  check(`${name} carries the minute: 59.996 s is 1:00.00, 1:59.996 is 2:00.00, 69.996 s is 1:10.00`,
    asked.every(([, want], i) => got[i] === want), got.join(' '));
}
check('and the lap called out loud says a minute, never 60.00 seconds',
  lapCall(1, 59996) === 'Lap 1, 1 minute 0.00' && lapCall(2, 119996) === 'Lap 2, 2 minutes 0.00'
  && lapCall(3, 69996) === 'Lap 3, 1 minute 10.00',
  `${lapCall(1, 59996)} | ${lapCall(2, 119996)} | ${lapCall(3, 69996)}`);

console.log(failed ? `${failed} failed, ${passed} passed` : `all ${passed} passed`);
process.exit(failed);
