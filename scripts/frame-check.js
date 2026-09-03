/*
 * frame-check.js: the two frames meet once, and a direction carries the
 * spawn rotation with it.
 *
 * WHY THIS EXISTS. Three times now the same bug has been written into this
 * repository, and twice it shipped:
 *
 *   the parked cars' roof lift, where a direction was compared in the wrong
 *   frame;
 *   the ground plane's slope, where the plane's POINT went through
 *   worldPosToSim and undid the spawn yaw and its NORMAL went through
 *   threeDirToSim and did not, so a hillside reached the plant as a roll
 *   rather than a pitch on every map whose spawn is not axis aligned;
 *   and the obstacle contact normal, which had the same fault for four more
 *   days and is why a wall tap welded the craft to the wall in the town.
 *
 * Each time it survived because it is INVISIBLE ON A LEVEL FLOOR. A yaw
 * about world up leaves a vertical normal exactly where it was, so the
 * ground model, the roof test, the pad and the whole race field read
 * straight, and only a VERTICAL face shows the error. The freestyle city
 * spawns at yaw pi, which turns a wall's outward normal into its own
 * negative, and the plant then reads a craft flying into a wall as one
 * leaving it and declines the contact.
 *
 * So this check asserts the two things that would have caught it:
 *
 *   1. THE ALGEBRA. A world direction converted for the plant must keep the
 *      sign of its dot product with the craft's own velocity, at every spawn
 *      yaw. The check also asserts that the BARE permutation fails that, so
 *      it is known to have teeth rather than merely being green.
 *   2. THE SEAM. src/main.js must not call threeDirToSim anywhere except
 *      inside worldDirToSim, which is the one place the spawn rotation is
 *      taken out. A future edit that reaches for the permutation directly
 *      fails here rather than in a pilot's flight two months later.
 *
 * No dependencies and no browser: this is arithmetic and one grep.
 *
 * Usage:
 *   node scripts/frame-check.js
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  simPosToThree, threePosToSim, threeDirToSim,
} from '../src/render/frame.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
function check(name, ok, note) {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
  }
  if (note) {
    console.log(`        ${note}`);
  }
}

/* A three.js quaternion about +Y by `a`, applied to a vector. Written out
 * because this file has no renderer in it and must not grow one. The shell
 * builds the same rotation with qSpawn.setFromAxisAngle(AXIS_Y, startYaw). */
function rotY(v, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * v.x + s * v.z, y: v.y, z: -s * v.x + c * v.z };
}

const out = () => ({
  x: 0,
  y: 0,
  z: 0,
  set(a, b, c) {
    this.x = a;
    this.y = b;
    this.z = c;
  },
});

/* The shell's own two conversions, restated. worldDirToSim is the one under
 * test; simDirToWorld is the forward path poseFromState and the `vel` hook
 * take, which is what makes the round trip meaningful. */
function worldDirToSim(v, yaw) {
  const un = rotY(v, -yaw);
  return threeDirToSim(un.x, un.y, un.z, out());
}
function simDirToWorld(v, yaw) {
  const t = simPosToThree(v.x, v.y, v.z, out());
  return rotY({ x: t.x, y: t.y, z: t.z }, yaw);
}
/* What the contact pass used to do, kept so the check can prove it is not
 * asserting something that was already true. */
function bareDirToSim(v) {
  return threeDirToSim(v.x, v.y, v.z, out());
}

const YAWS = [
  ['0', 0],
  ['90', Math.PI / 2],
  ['180', Math.PI],
  ['270', -Math.PI / 2],
  ['37', 0.6457718],
];

/* Plant velocities to fly at a face: forward, sideways, climbing, and a
 * diagonal that lies along no axis of either frame. */
const VELS = [
  ['forward', { x: 10, y: 0, z: 0 }],
  ['sideways', { x: 0, y: 8, z: 0 }],
  ['climbing', { x: 0, y: 0, z: 6 }],
  ['diagonal', { x: 5, y: -4, z: 3 }],
];

console.log('frame-check: a direction carries the spawn rotation\n');

/*
 * 1. THE CONTACT INVARIANT.
 *
 * A contact normal points OUT of the solid, so it opposes a craft arriving
 * at it. That is true in world space by construction and must survive the
 * conversion, in every frame, at every spawn yaw. It is the one property of
 * a contact normal that does not depend on the geometry it came from.
 */
let worstGood = 0;
let bareWrong = 0;
for (const [yawName, yaw] of YAWS) {
  for (const [velName, vSim] of VELS) {
    const vW = simDirToWorld(vSim, yaw);
    const m = Math.sqrt(vW.x * vW.x + vW.y * vW.y + vW.z * vW.z);
    /* The face the craft is flying at: its outward normal opposes travel. */
    const nW = { x: -vW.x / m, y: -vW.y / m, z: -vW.z / m };
    const good = worldDirToSim(nW, yaw);
    const dotGood = good.x * vSim.x + good.y * vSim.y + good.z * vSim.z;
    check(
      `yaw ${yawName} deg, ${velName}: the converted normal opposes the plant's own velocity`,
      dotGood < 0,
      `n . v = ${dotGood.toFixed(3)}, want negative (approaching)`,
    );
    if (dotGood > worstGood) {
      worstGood = dotGood;
    }
    const bare = bareDirToSim(nW);
    const dotBare = bare.x * vSim.x + bare.y * vSim.y + bare.z * vSim.z;
    if (!(dotBare < -1e-9)) {
      bareWrong += 1;
    }
  }
}

/*
 * 2. THE CHECK HAS TEETH.
 *
 * If the bare permutation satisfied the invariant too, everything above
 * would be green whether or not the shell does the right thing. It does not:
 * at a quarter turn the normal comes out PERPENDICULAR to the travel, which
 * turns a head on hit into a graze, and at a half turn it comes out exactly
 * reversed, which is the town.
 */
check(
  'the bare permutation fails the same invariant, so this check can fail',
  bareWrong > 0,
  `${bareWrong} of ${YAWS.length * VELS.length} cases wrong without the spawn rotation`,
);

/*
 * 3. THE ROUND TRIP. A direction out and back is the direction, at any yaw.
 */
for (const [yawName, yaw] of YAWS) {
  let worst = 0;
  for (const [, vSim] of VELS) {
    const back = worldDirToSim(simDirToWorld(vSim, yaw), yaw);
    const e = Math.max(
      Math.abs(back.x - vSim.x), Math.abs(back.y - vSim.y), Math.abs(back.z - vSim.z),
    );
    if (e > worst) {
      worst = e;
    }
  }
  check(
    `yaw ${yawName} deg: a direction survives the round trip`,
    worst < 1e-9,
    `worst component error ${worst.toExponential(2)}`,
  );
}

/*
 * 4. A POSITION AND A DIRECTION AGREE.
 *
 * The whole fault was the two halves of one conversion disagreeing, so
 * assert they cannot: the difference of two converted POINTS must equal the
 * converted DIFFERENCE, which is what it means for the direction path to be
 * the linear part of the position path.
 */
for (const [yawName, yaw] of YAWS) {
  const start = { x: 12, y: -30, z: 4 };
  const a = { x: 3, y: 5, z: -2 };
  const b = { x: -1, y: 2, z: 7 };
  const toSimPoint = (w) => {
    const p = rotY({ x: w.x - start.x, y: w.y - start.y, z: w.z - start.z }, -yaw);
    return threePosToSim(p.x, p.y, p.z, out());
  };
  const pa = toSimPoint(a);
  const pb = toSimPoint(b);
  const diff = { x: pb.x - pa.x, y: pb.y - pa.y, z: pb.z - pa.z };
  const dir = worldDirToSim({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, yaw);
  const e = Math.max(
    Math.abs(diff.x - dir.x), Math.abs(diff.y - dir.y), Math.abs(diff.z - dir.z),
  );
  check(
    `yaw ${yawName} deg: the direction path is the linear part of the position path`,
    e < 1e-9,
    `worst component error ${e.toExponential(2)}`,
  );
}

/*
 * 5. THE SEAM, as a lint on the source.
 *
 * The arithmetic above is only about the arithmetic. What keeps the SHELL
 * honest is that it has exactly one door: every direction it hands the plant
 * goes through worldDirToSim, which takes the spawn rotation out. A call to
 * the bare permutation anywhere else in main.js is the bug being written
 * again, and it is cheap to refuse.
 */
const mainSrcRaw = readFileSync(join(root, 'src', 'main.js'), 'utf8');
/*
 * COMMENTS DO NOT COUNT. The scan below is a grep, and this file is written
 * in a house style that explains a fault by naming the function that caused
 * it, so the word it is looking for appears in prose all over the shell. A
 * lint that fires on its own documentation is a lint people turn off.
 */
const mainSrc = mainSrcRaw
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');
const lines = mainSrc.split('\n');
const callSites = [];
for (let i = 0; i < lines.length; i += 1) {
  if (/\bthreeDirToSim\s*\(/.test(lines[i])) {
    callSites.push(i + 1);
  }
}
/* Where worldDirToSim's body is, so a call inside it can be told from one
 * outside it. The helper is short; the window is generous. */
const helperAt = lines.findIndex((l) => /function\s+worldDirToSim\s*\(/.test(l));
const inHelper = (n) => helperAt >= 0 && n > helperAt && n <= helperAt + 8;
const strays = callSites.filter((n) => !inHelper(n));
check(
  'src/main.js reaches for the bare permutation only inside worldDirToSim',
  helperAt >= 0 && strays.length === 0,
  helperAt < 0
    ? 'worldDirToSim not found in src/main.js'
    : `${callSites.length} call site(s), ${strays.length} outside the helper${strays.length ? ` at line ${strays.join(', ')}` : ''}`,
);

/*
 * AND THE HELPER ITSELF HAS TO UNDO THE SPAWN ROTATION, which is the whole
 * of the fix and the one thing everything above this line could not see.
 *
 * The algebra at the top of this file is asserted about a RESTATEMENT of the
 * seam, written here, because src/main.js cannot be imported into Node: it
 * pulls in three.js and a document. So deleting the one line that de-rotates
 * inside the shell's own helper would leave every one of those checks green,
 * which is a check that cannot fail, which is worse than no check. This is
 * the assertion that binds them to the shell. It is a lint on the source and
 * says so; the behavioural half is scripts/wall-check.js flying the rig's
 * copy of the same seam, and the shell's own is window.__contacts() reporting
 * `outbound` on a real flight.
 */
const helperBody = helperAt >= 0 ? lines.slice(helperAt, helperAt + 8).join('\n') : '';
check(
  'and worldDirToSim undoes the spawn rotation before the permutation',
  /applyQuaternion\s*\(\s*qSpawnInv\s*\)/.test(helperBody)
    && /\bthreeDirToSim\s*\(/.test(helperBody),
  helperAt < 0
    ? 'worldDirToSim not found'
    : `body: ${helperBody.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')}`.slice(0, 160),
);

/* And the import must still exist, so the lint above cannot pass by the
 * function having been renamed out from under it. */
check(
  'src/main.js still imports threeDirToSim from frame.js',
  /import\s*\{[^}]*\bthreeDirToSim\b[^}]*\}\s*from\s*'\.\/render\/frame\.js'/.test(mainSrc),
  null,
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
