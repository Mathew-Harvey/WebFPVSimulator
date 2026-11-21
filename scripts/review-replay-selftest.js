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
  LEAD_MS, MAX_FRAME_MS, Playhead, TAIL_MS, gogglePose, orbitDir, orbitFit, poseAt, sectionTimeline, slerp, splitPanes,
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

console.log('side by side');
{
  const [a, b] = splitPanes(1280, 720);
  check('a wide screen: two pictures side by side, the flight\'s shape, as large as fits', near(a.w, 640) && near(a.h, 360) && near(b.x, 640) && near(a.y, b.y));
  check('the pair in the middle, the bar\'s room below it', near(a.y, 180) && near(a.y + a.h, 540));
  const [c, d] = splitPanes(390, 760);
  check('a phone held upright: one over the other, the screen\'s width', near(c.w, 390) && near(c.h, 390 * 9 / 16) && near(d.y, c.y + c.h) && near(c.x, d.x));
  check('and the pair in the middle of its height', near(c.y, (760 - 2 * c.h) / 2));
  const [e] = splitPanes(2000, 400);
  check('a very wide screen: as tall as the screen, in the middle across', near(e.h, 400) && near(e.w, 400 * 16 / 9) && near(e.x, (2000 - 2 * e.w) / 2));
  const lens = { forward: 0.1, up: 0.02 };
  const level = { x: 1, y: 2, z: 3, q: [0, 0, 0, 1] };
  const g = gogglePose(level, lens, 2, 0);
  check('the goggles are at the lens: ahead along -z and up, scaled to the scene', near(g.pos[0], 1) && near(g.pos[1], 2.04) && near(g.pos[2], 3 - 0.2));
  const turned = gogglePose({ ...level, q: [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)] }, lens, 1, 0);
  check('a quad turned a quarter left has its lens out to the left', near(turned.pos[0], 1 - 0.1, 1e-12) && near(turned.pos[2], 3, 1e-12));
  const t = 30 * Math.PI / 180;
  const up = gogglePose(level, lens, 1, t);
  /* The look, -z turned by q: its height is 2 (w x - y z). */
  const lookY = 2 * (up.q[3] * up.q[0] - up.q[1] * up.q[2]);
  check('uptilt turns the look up by the tilt', near(lookY, Math.sin(t), 1e-12), String(lookY));
}

console.log('the orbit');
{
  const d0 = orbitDir(0, 0);
  check('heading 0, level: the camera south of the pair, looking north', near(d0[0], 0) && near(d0[1], 0) && near(d0[2], 1));
  const d1 = orbitDir(Math.PI / 2, Math.PI / 4);
  check('a quarter turn and half way up: east and above, a unit', near(d1[0], Math.SQRT1_2, 1e-12) && near(d1[1], Math.SQRT1_2, 1e-12) && near(Math.hypot(...d1), 1, 1e-12));
  check('two quads together: the nearest it comes, in plant metres', near(orbitFit(0, 2, 70), 1.5 * 2));
  const far = orbitFit(20, 1, 70);
  check('two quads far apart: far enough back that both are in the picture', near(far, (10 + 0.5) / Math.tan(35 * Math.PI / 180), 1e-12));
  check('and further for further apart', orbitFit(30, 1, 70) > far);
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
