/*
 * orbit-check.js: the thing a pilot orbits has to be in the obstacle field,
 * and a slow lap has to survive its own hysteresis.
 *
 * THE REPORT THIS ANSWERS. "The scoring system misses orbits and inverted
 * orbits." Two separate faults, both measured here, and neither of them was
 * in the recogniser's pattern table.
 *
 * ONE: THE TRAINING PARK'S MAST WAS NOT AN OBSTACLE. src/game/obstacles.js
 * clamps a collider's bottom to the ground before measuring its height, so
 * that the town's walls, which are authored reaching sixty metres
 * underground, are not counted as sixty metre poles. It asked for that
 * ground with the shell's height function and no hint, and that function
 * answers with the highest LANDABLE SURFACE at a point, not the terrain.
 *
 * The mast is four 0.32 m legs running from y 0.45 to y 34.45 with the mast
 * head deck at 34.75 directly over them. So the clamp lifted each leg's
 * bottom ABOVE ITS OWN TOP, the h <= 0 guard skipped it, and the only
 * obstacle within ten metres of the mast was the 2.9 m light pole above the
 * head. The park's headline orbit object could not be flown around at all.
 * Measured on the real town: 967 obstacles before, 1118 after, so 151 things
 * a pilot can fly around were being erased, every one of them a support
 * under a deck, a roof or a bridge.
 *
 * TWO: THE PATH HYSTERESIS WAS INVERTED. PATH_RATE_OFF was 0.12 against a
 * PATH_RATE_ON of 0.08, so a lap could open at a winding rate the next
 * millisecond was entitled to close it. A wide slow orbit, which is the
 * harder trick, was chopped into fragments 220 ms long, which is the off
 * hold exactly. Measured round the mast at 8 m: 5.0 s a lap ran as one piece
 * of 2.41 turns and scored; 7.0 s a lap came apart into thirteen fragments
 * whose longest was 1.00 turns and scored nothing.
 *
 * Deterministic: the real plant, the real colliders, the real recogniser, no
 * browser and no wall clock. Usage:
 *   node scripts/orbit-check.js
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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeRig, buildWorld, V, sub, mul, norm, len, rampPath, circlePath, dropPath,
} from './lib/flightrig.js';
import { Colliders } from '../src/game/collide.js';
import { deriveObstacles, ObstacleField, OB_POLE } from '../src/game/obstacles.js';
import { TrickDetector } from '../src/game/trickdetect.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const WASM = join(root, 'dist', 'sim.wasm');

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

console.log('\norbit-check: the mast is an obstacle, and a slow lap is one lap\n');

/*
 * THE DERIVATION, on its own, with the town's own numbers.
 *
 * This half needs no aircraft: it is the geometry test that erased the mast.
 * The height function stands in for the shell's, which answers with the top
 * of the stack when it is asked without a hint and with the surface under
 * the hint when it is given one, exactly as window.__surface reported on the
 * real town: 34.75 unhinted at the mast leg, 0.75 hinted at the leg's base.
 */
{
  const TOWER = {
    x: 96, z: 160, half: 1.5, leg: 0.16, h: 34, ground: 0.45, deck: 34.75,
  };
  const c = new Colliders();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      c.addBox(
        'wall',
        TOWER.x + sx * TOWER.half - TOWER.leg, TOWER.ground, TOWER.z + sz * TOWER.half - TOWER.leg,
        TOWER.x + sx * TOWER.half + TOWER.leg, TOWER.ground + TOWER.h,
        TOWER.z + sz * TOWER.half + TOWER.leg,
      );
    }
  }
  /* The head deck over them, which is what made the height function answer
   * with 34.75 in the first place. */
  c.addBox('wall', TOWER.x - 1.85, TOWER.deck - 0.3, TOWER.z - 1.85,
    TOWER.x + 1.85, TOWER.deck, TOWER.z + 1.85);
  c.build();

  const topOfStack = (x, z, fromY) => (
    fromY !== undefined && fromY < TOWER.deck ? TOWER.ground + 0.3 : TOWER.deck
  );
  const hinted = deriveObstacles(c, topOfStack);
  check(
    'the mast\'s four legs are obstacles a pilot can orbit',
    hinted.countOf(OB_POLE) >= 4,
    `${hinted.countOf(OB_POLE)} poles derived from four legs and a head deck`,
  );

  /* And the fault, restated, so the check is known to have teeth: ask the
   * same question without the hint and the legs vanish. */
  const unhinted = deriveObstacles(c, () => TOWER.deck);
  check(
    'and without the base hint they vanish, which is the bug this pins',
    unhinted.countOf(OB_POLE) === 0,
    `${unhinted.countOf(OB_POLE)} poles when the clamp is asked for the top of the stack`,
  );
}

if (!existsSync(WASM)) {
  console.log('\n  SKIP  dist/sim.wasm is not built, so nothing was flown');
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

const wasmBytes = readFileSync(WASM);
const diffText = readFileSync(join(root, 'configs', 'betaflight-default.diff'), 'utf8');

/* The mast, as the town builds it, for the aircraft to fly around. */
const T = {
  x: 96, z: 160, half: 1.5, leg: 0.16, h: 34, ground: 0.45,
};
const parts = [];
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    parts.push({
      kind: 'box',
      material: 'wall',
      x0: T.x + sx * T.half - T.leg,
      y0: T.ground,
      z0: T.z + sz * T.half - T.leg,
      x1: T.x + sx * T.half + T.leg,
      y1: T.ground + T.h,
      z1: T.z + sz * T.half + T.leg,
    });
  }
}
const world = buildWorld(parts, deriveObstacles, T.ground);

/*
 * An orbit, flown. The nose is held on the mast the whole way, which is what
 * makes it an Orbit rather than a coordinated turn that happens to go round
 * twice, and the recogniser measures that directly rather than inferring it
 * from the yaw.
 */
async function orbit({
  radius, secs, laps, alt, inverted, yaw,
}) {
  const rig = await makeRig({
    wasmBytes,
    diffText,
    colliders: world.colliders,
    field: world.field,
    spawn: V(T.x, T.ground, T.z - 20),
    spawnYaw: yaw ?? Math.PI,
    groundY: T.ground,
  });
  const centre = V(T.x, alt, T.z);
  let lap = circlePath(centre, V(1, 0, 0), V(0, 0, 1), radius, secs, 0, laps);
  if (inverted) {
    /* A lap is only flown belly up while the craft is FALLING harder than
     * gravity, because thrust points down only when the wanted force does. */
    lap = dropPath(lap, 11.4);
  }
  const d0 = lap(0);
  const vEnt = len(d0.v);
  const from = sub(d0.p, mul(norm(d0.v), 12));
  const look = (t, s) => Math.atan2(T.x - s.p.x, T.z - s.p.z);
  rig.hold(200, 0, 0, 0, 0.5);
  rig.settle(from, look(0, { p: from }), 2.0);
  rig.fly(rampPath(from, d0.p, (12 * 1.9) / Math.max(2, vEnt), vEnt), { heading: look });
  const r = rig.fly(lap, {
    heading: look,
    ky: inverted ? 1.6 : 3.0,
    yawMax: inverted ? 0.5 : 0.85,
    invertOk: Boolean(inverted),
  });
  rig.hold(600, 0, 0, 0, 0.45);
  return { tricks: rig.done(800).map((t) => t.name), err: r.worstErr };
}

const CASES = [
  {
    label: 'two laps at 6 m in five seconds', want: 'Orbit x2', radius: 6, secs: 5.0, laps: 2, alt: 8,
  },
  {
    label: 'two laps at 8 m in SEVEN seconds, which the old off gate cut up',
    want: 'Orbit x2',
    radius: 8,
    secs: 7.0,
    laps: 2,
    alt: 10,
  },
  {
    label: 'one lap belly up, which the catalogue prices five times higher',
    want: '1 Trippy Spin',
    radius: 5,
    secs: 2.3,
    laps: 1,
    alt: 24,
    inverted: true,
  },
];

for (const cse of CASES) {
  /* eslint-disable-next-line no-await-in-loop */
  const got = await orbit(cse);
  check(
    `${cse.label}: ${cse.want}`,
    got.tricks.includes(cse.want),
    `named ${got.tricks.join(' + ') || 'nothing'} (path error ${got.err.toFixed(1)} m)`,
  );
}

/*
 * AND THE ANSWER DOES NOT DEPEND ON WHICH WAY THE MAP FACES. The recogniser
 * is fed body rates in the plant's frame and geometry in the renderer's,
 * and the spawn rotation sits between them; a trick that scores at one yaw
 * and not at another is that seam leaking, which is the fault the contact
 * pass had.
 */
{
  const names = [];
  for (const yaw of [0, Math.PI / 2, Math.PI]) {
    /* eslint-disable-next-line no-await-in-loop */
    const got = await orbit({
      radius: 6, secs: 5.0, laps: 2, alt: 8, yaw,
    });
    names.push(got.tricks.join(' + ') || 'nothing');
  }
  check(
    'the same orbit scores the same at three spawn yaws',
    names.every((n) => n.includes('Orbit x2')),
    names.map((n, i) => `yaw ${[0, 90, 180][i]}: ${n}`).join(' | '),
  );
}

/*
 * ONE LAP IS A YAW SPIN, TWO ARE AN ORBIT, AND A LAP WITH THE NOSE
 * ELSEWHERE IS NEITHER.
 *
 * The pattern table had no entry for a single upright orbit, on the stated
 * grounds that one nose-in circle round a post IS a 360 of yaw and the yaw
 * run already names it. The conclusion is right; the premise was never
 * measured and is false. A rotation run opens at 172 deg/s and an orbit
 * yaws at a turn per lap, so a five second lap yaws at 72: the run never
 * opens, nothing is held, nothing is handed back, and the pilot gets
 * neither the orbit nor the yaw spin. That is "orbits do not register".
 */
{
  const one = await orbit({
    radius: 6, secs: 5.0, laps: 1, alt: 8,
  });
  check(
    'one tracked lap of the mast is the 360 of yaw it is, and scores',
    one.tricks.includes('Yaw Spin'),
    `named ${one.tricks.join(' + ') || 'nothing'}`,
  );
  const two = await orbit({
    radius: 6, secs: 5.0, laps: 2, alt: 8,
  });
  check(
    'and two laps are still an Orbit x2, not a Yaw Spin',
    two.tricks.includes('Orbit x2') && !two.tricks.includes('Yaw Spin'),
    `named ${two.tricks.join(' + ') || 'nothing'}`,
  );
}

/*
 * AND ORDINARY FLYING STILL SCORES NOTHING.
 *
 * This is the check that guards the off gate coming down. A lower gate holds
 * a lap open longer, and the thing that must not follow is a lap opening on
 * a craft that is merely flying PAST a post. The winding totals are what
 * refuse a fly past, not the rate gate, which is the argument the recogniser
 * has made since its first version; these two cases are that argument
 * measured on the real aircraft down a street of eight posts.
 *
 * A false positive is far worse than a missed trick: a score that goes up
 * for ordinary flying stops meaning anything.
 */
{
  const street = [];
  for (let i = 0; i < 8; i += 1) {
    street.push({
      kind: 'box',
      material: 'wall',
      x0: 10 + i * 8 - 0.16,
      y0: 0,
      z0: -0.16,
      x1: 10 + i * 8 + 0.16,
      y1: 6,
      z1: 0.16,
    });
  }
  const town = buildWorld(street, deriveObstacles, 0);
  const runs = [
    ['a straight run down a street of posts at 12 m/s', -4, 12, 6.5],
    ['the same flown closer to them, at 9 m/s', -2.5, 9, 9.0],
  ];
  for (const [label, z, speed, secs] of runs) {
    /* eslint-disable-next-line no-await-in-loop */
    const rig = await makeRig({
      wasmBytes,
      diffText,
      colliders: town.colliders,
      field: town.field,
      spawn: V(0, 0, -14),
      spawnYaw: Math.PI,
      groundY: 0,
    });
    rig.hold(200, 0, 0, 0, 0.5);
    rig.settle(V(4, 4, z), Math.atan2(1, 0), 2.0);
    rig.fly(rampPath(V(4, 4, z), V(78, 4, z), secs, speed), { heading: Math.atan2(1, 0) });
    const got = rig.done(900).map((t) => t.name);
    check(
      `${label}: nothing`,
      got.length === 0,
      got.length ? `named ${got.join(' + ')}` : 'silent, as it must be',
    );
  }
}

/*
 * AND THE SCORER IS NOT SILENCED BY THE STREET IT IS FLOWN DOWN.
 *
 * The negatives above ask that a fly past names nothing. This asks the
 * opposite and harder thing: that a trick flown WHILE flying past names
 * something. A path run opens on any pass of a post at flying speed and
 * takes over a second to decay, so on an ordinary street the runs overlap
 * and there is never a moment with none open. `hold()` and `releaseHeld()`
 * used to block on ANY open lap, so the buffer was never drained: measured,
 * sixty seconds down forty posts with a clean 360 roll every eight named
 * NOTHING, with four rotations stranded in pending and three held.
 *
 * It hid because every harness here ends on flush(), which closes the laps
 * first and therefore always releases. src/main.js has no flush call, so the
 * shell was the one place it bit. THIS SECTION DOES NOT FLUSH, on purpose.
 *
 * No plant: the path side reads position, so this is the real detector and
 * the real obstacle field driven at 1 kHz down a straight line.
 */
{
  const TURN_R = Math.PI * 2;
  const street = (spacing) => {
    const f = new ObstacleField();
    for (let i = 0; i < 80; i += 1) {
      f.add(OB_POLE, i * spacing, 6, 6, 0, 1, 0, 6);
    }
    return f.build();
  };
  for (const spacing of [15, 20, 26]) {
    const named = [];
    const det = new TrickDetector((t) => named.push(t.name), street(spacing));
    let phi = 0;
    let x = 0;
    const speed = 15;
    for (let ms = 0; ms < 60000; ms += 1) {
      const t = ms / 1000;
      /* A clean 360 roll every eight seconds, taking about a second. */
      const rolling = t > 4 && (t % 8) < 1.05;
      const p = rolling ? TURN_R / 1.05 : 0;
      phi += p * 0.001;
      x += speed * 0.001;
      det.step(
        0.001, p, 0, 0, Math.sin(phi / 2), 0, speed,
        x, 6, 0,
        1, 0, 0,
        0, Math.cos(phi), Math.sin(phi),
      );
    }
    /* Deliberately no flush. */
    check(
      `seven rolls flown down a street of posts ${spacing} m apart are named`,
      named.filter((n) => n === 'Roll').length === 7,
      `named ${named.length}: ${named.join(' + ') || 'NOTHING'}`,
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
