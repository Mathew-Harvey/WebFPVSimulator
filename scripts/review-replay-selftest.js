#!/usr/bin/env node
/*
 * review-replay-selftest.js: src/review/replay.js, driven in Node.
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
  LEAD_MS, MAX_FRAME_MS, Playhead, TAIL_MS, poseAt, sectionTimeline, slerp,
} from '../src/review/replay.js';

let failures = 0;

function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

console.log('turning');
{
  const id = [0, 0, 0, 1];
  const half = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)];
  const mid = slerp(id, half, 0.5);
  check('half way between level and a quarter turn is an eighth', near(mid[1], Math.sin(Math.PI / 8), 1e-9) && near(mid[3], Math.cos(Math.PI / 8), 1e-9));
  check('the ends are the ends', near(slerp(id, half, 0)[3], 1) && near(slerp(id, half, 1)[1], half[1]));
  const neg = half.map((v) => -v);
  const viaNeg = slerp(id, neg, 0.5);
  check('the shorter way round, whatever the sign', near(Math.abs(viaNeg[1]), Math.sin(Math.PI / 8), 1e-9));
  check('always a unit', near(Math.hypot(...slerp([0, 0, 0, 1], [0, 0, 1e-6, 1], 0.3)), 1, 1e-12));
}

console.log('a pose at a moment');
{
  const line = {
    t: [0, 100, 200], x: [0, 1, 2], y: [1, 1, 1], z: [0, -1, -2],
    qx: [0, 0, 0], qy: [0, Math.sin(Math.PI / 4), Math.sin(Math.PI / 4)], qz: [0, 0, 0], qw: [1, Math.cos(Math.PI / 4), Math.cos(Math.PI / 4)],
  };
  const p = poseAt(line, 50);
  check('between two samples, half way', near(p.x, 0.5) && near(p.z, -0.5) && near(p.y, 1));
  check('turned half way', near(p.q[1], Math.sin(Math.PI / 8), 1e-9));
  check('held at the first before the line', near(poseAt(line, -50).x, 0) && near(poseAt(line, -50).q[3], 1));
  check('held at the last after it', near(poseAt(line, 500).x, 2));
}

console.log('the section\'s timeline');
{
  const tl = sectionTimeline([1000, 3000], [900, 2600]);
  check('your section and the ghost\'s, timed', tl.youMs === 2000 && tl.ghostMs === 1700);
  check('from a little before your first gate', tl.startMs === 1000 - LEAD_MS);
  check('to a little after the later of the two finishes', tl.endMs === 1000 + 2000 + TAIL_MS);
  check('the ghost starts the section with you', tl.ghostAt(1000) === 900 && tl.ghostAt(1500) === 1400);
  check('and is where it was when you finish, ahead by the time it gained', tl.ghostAt(3000) - 900 === 2000 && tl.ghostAt(3000) > 2600);
  const slow = sectionTimeline([0, 1000], [0, 1500]);
  check('a slower ghost keeps the timeline running until it finishes', slow.endMs === 1500 + TAIL_MS);
  const alone = sectionTimeline([0, 1000], null);
  check('no ghost: your section alone', alone.ghostAt(500) === null && alone.endMs === 1000 + TAIL_MS);
}

console.log('the playhead');
{
  const p = new Playhead(0, 1000);
  p.advance(50);
  check('still until played', p.t === 0);
  p.toggle();
  p.advance(50);
  check('played, it moves with the wall', p.t === 50);
  p.advance(5000);
  check('a long frame moves it no further than a short one', p.t === 50 + MAX_FRAME_MS);
  for (let k = 0; k < 20; k += 1) {
    p.advance(100);
  }
  check('it stops at the end', p.t === 1000 && !p.playing);
  p.toggle();
  check('play at the end starts again from the start', p.t === 0 && p.playing);
  p.seek(-100);
  check('a seek is kept inside', p.t === 0);
  p.seek(400);
  p.toggle();
  check('pause holds where it is', p.t === 400 && !p.playing);
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
