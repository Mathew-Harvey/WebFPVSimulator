/*
 * predict-selftest.js: the predicted view's arithmetic (src/render/
 * predict.js), in plain Node, against the facts it must keep.
 *
 * The prediction moves the drawn view by the state's velocity and body
 * rates over a horizon. Each check below is one of the things that would
 * make it quietly wrong: a displacement or a turn by the wrong amount, a
 * turn about the wrong axis because the frames were mixed, a camera that
 * drifts off its mount, or a prediction that does not compose. The same
 * two rules as the other selftests: a check is written against a case the
 * code could get wrong, and at the stop, not in a band.
 *
 * Usage:
 *   npm run predict:selftest
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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { moveRigid, mulQuat, predictDelta, rotateVec } from '../src/render/predict.js';
import { simQuatToThree } from '../src/render/frame.js';
import { Colliders } from '../src/game/collide.js';

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

function section(title) {
  console.log(`\n${title}`);
}

/* The shapes Three.js hands the module in the page, as little of them as
 * it touches. */
class Vec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
}

const DEG = Math.PI / 180;
const near = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps;
const angleOf = (q) => 2 * Math.acos(Math.min(1, Math.abs(q.w)));
const sameRotation = (a, b, eps = 1e-12) => {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  return Math.abs(Math.abs(dot) - 1) <= eps;
};
const unit = (q) => {
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  return q.set(q.x / n, q.y / n, q.z / n, q.w / n);
};
/* A state block with velocity and body rates set, the rest zero. */
const stateWith = (v, w) => {
  const s = new Float64Array(20);
  s[4] = v[0]; s[5] = v[1]; s[6] = v[2];
  s[11] = w[0]; s[12] = w[1]; s[13] = w[2];
  return s;
};
const H = 1000 / 60;
const NO_YAW = new Quat();

section('what one frame of prediction moves, and by how much');
{
  const dp = new Vec();
  const dq = new Quat();
  predictDelta(stateWith([12, 0, 0], [0, 0, 0]), H, NO_YAW, dp, dq);
  check('12 m/s straight ahead moves the view 0.2 m forward in a sixtieth of a second, into the screen',
    near(dp.x, 0) && near(dp.y, 0) && near(dp.z, -0.2), `${dp.x}, ${dp.y}, ${dp.z}`);
  check('and turns it not at all', near(dq.x, 0) && near(dq.y, 0) && near(dq.z, 0) && near(dq.w, 1));
  predictDelta(stateWith([0, 0, -5], [0, 0, 0]), H, NO_YAW, dp, dq);
  check('5 m/s falling moves it down, and only down', near(dp.x, 0) && near(dp.y, -5 / 60) && near(dp.z, 0),
    `${dp.x}, ${dp.y}, ${dp.z}`);
  const yaw90 = new Quat(0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4));
  predictDelta(stateWith([12, 0, 0], [0, 0, 0]), H, yaw90, dp, dq);
  check('a spawn turned a quarter left carries the displacement round with it',
    near(dp.x, -0.2) && near(dp.y, 0) && near(dp.z, 0, 1e-12), `${dp.x}, ${dp.y}, ${dp.z}`);
}
{
  const dp = new Vec();
  const dq = new Quat();
  predictDelta(stateWith([0, 0, 0], [670 * DEG, 0, 0]), H, NO_YAW, dp, dq);
  check('a 670 degree per second roll turns the view 11.17 degrees in a sixtieth',
    near(angleOf(dq) / DEG, 670 / 60, 1e-9), `${(angleOf(dq) / DEG).toFixed(6)} degrees`);
  const axis = new Vec(dq.x, dq.y, dq.z);
  const n = Math.hypot(axis.x, axis.y, axis.z);
  check('about the forward axis, which is -z on screen', near(axis.x / n, 0) && near(axis.y / n, 0) && near(axis.z / n, -1),
    `${axis.x / n}, ${axis.y / n}, ${axis.z / n}`);
}

section('the frames: a body rate predicted on the sim side and converted equals one converted and predicted');
{
  /* Any attitude, any rate. The drawn quaternion is simQuatToThree of the
   * sim's; the prediction multiplies the converted increment onto the drawn
   * quaternion. That is only right if converting the sim's own product
   * gives the same rotation, which is the claim predict.js stands on. */
  let worst = 0;
  const qSim = new Quat();
  for (let i = 0; i < 64; i += 1) {
    const a = Math.sin(i * 1.7) * 3;
    const b = Math.cos(i * 2.3) * 3;
    const c = Math.sin(i * 0.9 + 1) * 3;
    unit(qSim.set(Math.sin(a), Math.cos(b) * 0.5, Math.sin(c) * 0.7, Math.cos(a + b)));
    const rate = [Math.sin(i) * 12, Math.cos(i * 1.3) * 12, Math.sin(i * 0.7) * 6];
    const dp = new Vec();
    const dq = new Quat();
    predictDelta(stateWith([0, 0, 0], rate), H, NO_YAW, dp, dq);
    const drawn = simQuatToThree(qSim.w, qSim.x, qSim.y, qSim.z, new Quat());
    const viaDrawn = mulQuat(drawn, dq, new Quat());
    /* The sim side: q_sim times the body increment, in the sim's own
     * (w, x, y, z), then converted. */
    const t = H / 1000;
    const w = Math.hypot(rate[0], rate[1], rate[2]);
    const s = Math.sin(0.5 * w * t) / w;
    const inc = new Quat(rate[0] * s, rate[1] * s, rate[2] * s, Math.cos(0.5 * w * t));
    const simProduct = mulQuat(qSim, inc, new Quat());
    const viaSim = simQuatToThree(simProduct.w, simProduct.x, simProduct.y, simProduct.z, new Quat());
    const dot = Math.abs(viaDrawn.x * viaSim.x + viaDrawn.y * viaSim.y + viaDrawn.z * viaSim.z + viaDrawn.w * viaSim.w);
    worst = Math.max(worst, Math.abs(1 - dot));
  }
  check('64 attitudes and rates: the same rotation both ways', worst < 1e-12, `worst 1 - |dot| ${worst.toExponential(2)}`);
}

section('prediction composes, and a camera stays on its mount');
{
  const st = stateWith([8, -3, 2], [4, -2, 7]);
  const whole = new Quat();
  const half = new Quat();
  const dp = new Vec();
  predictDelta(st, H, NO_YAW, dp, whole);
  predictDelta(st, H / 2, NO_YAW, dp, half);
  const twice = mulQuat(half, half, new Quat());
  check('two half frames of a constant rate are one whole frame', sameRotation(whole, twice), JSON.stringify(twice));
}
{
  /* A craft drawn somewhere, turned somehow, with a camera bolted forward
   * and up and tilted, as main.js's fpvPos and fpvQuat are. */
  const p = new Vec(3, 2, -7);
  const q = unit(new Quat(0.2, 0.4, -0.1, 0.9));
  const mount = new Vec(0, 0.018, -0.05);
  const camPos = rotateVec(q, new Vec(mount.x, mount.y, mount.z));
  camPos.set(camPos.x + p.x, camPos.y + p.y, camPos.z + p.z);
  const tilt = new Quat(Math.sin(15 * DEG), 0, 0, Math.cos(15 * DEG));
  const camQuat = mulQuat(q, tilt, new Quat());
  const dp = new Vec();
  const dq = new Quat();
  predictDelta(stateWith([15, 4, -2], [9, -5, 3]), H, NO_YAW, dp, dq);
  moveRigid(camPos, camQuat, p, q, dp, dq, new Quat(), new Vec());
  const q2 = mulQuat(q, dq, new Quat());
  const p2 = new Vec(p.x + dp.x, p.y + dp.y, p.z + dp.z);
  /* In the moved craft's own frame the camera must be where it was bolted. */
  const inv = new Quat(-q2.x, -q2.y, -q2.z, q2.w);
  const rel = rotateVec(inv, new Vec(camPos.x - p2.x, camPos.y - p2.y, camPos.z - p2.z));
  check('the camera is still bolted where it was, forward and up of the craft',
    near(rel.x, mount.x, 1e-12) && near(rel.y, mount.y, 1e-12) && near(rel.z, mount.z, 1e-12),
    `${rel.x}, ${rel.y}, ${rel.z}`);
  const relQ = mulQuat(inv, camQuat, new Quat());
  check('and still tilted by the same camera angle', sameRotation(relQ, tilt), JSON.stringify(relQ));
}
{
  const dp = new Vec();
  const dq = new Quat();
  predictDelta(stateWith([0, 0, 0], [0, 0, 0]), H, NO_YAW, dp, dq);
  const camPos = new Vec(1, 2, 3);
  const camQuat = unit(new Quat(0.1, 0.2, 0.3, 0.9));
  const before = { ...camQuat };
  moveRigid(camPos, camQuat, new Vec(1, 1.9, 3.05), unit(new Quat(0, 0.3, 0, 0.95)), dp, dq, new Quat(), new Vec());
  check('a craft at rest moves the camera nowhere', near(camPos.x, 1) && near(camPos.y, 2) && near(camPos.z, 3)
    && sameRotation(camQuat, before), `${camPos.x}, ${camPos.y}, ${camPos.z}`);
}

/*
 * THE EYE'S SWEEP (Colliders.sweepPoint): the predicted view moves the eye
 * on by up to 25 ms of travel, and this is the one query that stops it
 * short of a solid. A ball of radius r from a to b: the earliest t it
 * touches, -1 for open air, 0 when it starts touching.
 */
{
  const c = new Colliders();
  /* A wall whose near face is x = 1, a post at x = 0, z = 5, and a car. */
  c.addBox('wall', 1, 0, -2, 1.4, 3, 2);
  c.addPost('tree', 0, 5, 0, 3, 0.2);
  c.addMoving('train', 0.5, 0.5, 0.5);
  c.build();
  c.seatMoving(0, 0, 1, -8);
  const r = 0.01;
  const open = c.sweepPoint(0, 1, 0, -0.3, 1, 0, r);
  check('open air: the eye goes the whole way', open === -1, String(open));
  const t = c.sweepPoint(0.7, 1, 0, 1.03, 1, 0, r);
  /* The ball touches at x = 1 - r: (0.99 - 0.7) / 0.33. */
  check('into a wall: the eye stops a radius short of its face', near(t, 0.29 / 0.33, 1e-9), String(t));
  const inside = c.sweepPoint(1.2, 1, 0, 1.3, 1, 0, r);
  check('starting inside a wall stops it where it is', inside === 0, String(inside));
  const post = c.sweepPoint(0, 1, 4.5, 0, 1, 4.9, r);
  /* The post's face is at z = 4.8, the ball's at 4.79: (4.79 - 4.5) / 0.4. */
  check('into a post: a radius short of the capsule (stored as float32)', near(post, 0.29 / 0.4, 1e-6), String(post));
  const car = c.sweepPoint(0, 1, -7, 0, 1, -7.6, r);
  /* The car's face is at z = -7.5, the ball's at -7.49: 0.49 / 0.6. */
  check('into a moving box where it is now', near(car, 0.49 / 0.6, 1e-9), String(car));
  const along = c.sweepPoint(0.9, 1, -1, 0.9, 1, 1, r);
  check('along a wall a hand off its face: open', along === -1, String(along));
  const still = c.sweepPoint(0.995, 1, 0, 0.995, 1, 0, r);
  check('a point already within the radius, not moving: 0', still === 0, String(still));
}

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
for (const f of fails) {
  console.log(`  FAIL ${f}`);
}
process.exitCode = failed ? 1 : 0;
