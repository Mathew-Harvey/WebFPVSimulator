/*
 * animation.js: the city's moving parts, on the physics clock.
 *
 * THE PROBLEM THIS FILE EXISTS TO SOLVE. The town has one moving part that
 * touches collision: the level crossing. Its two booms are colliders whose
 * top toggles between parked and 1.25 m when an arm sequence crosses 0.55,
 * and that sequence integrates the raw frame delta, and it is driven by the
 * train's position, which is itself `x = wrap(x + speed * dt)`. So the
 * geometry a quad can hit is a function of how many frames the browser
 * happened to deliver.
 *
 * RE MEASURED, because the design that raised this quoted numbers this
 * project could not reproduce. Running the town's own rule for ten seconds of
 * simulated time puts the train at
 *
 *     dt 1/50    234.999999999999488
 *     dt 1/60    235.000000000003382
 *     dt 1/120   234.999999999997897
 *     dt 1/144   235.000000000007219
 *     dt 1/240   234.999999999994401
 *     exact      235.000000000000000
 *
 * a spread of 1.3e-11 m, where the design reported 1.5e-10. Either way the
 * NUMBER is not the argument, and it would be dishonest to pretend it is:
 * a hundredth of a nanometre never moved a boom. The argument is that the
 * quantity is frame rate dependent AT ALL, and that the arm threshold is a
 * STEP function sitting on top of it, so a difference that is invisible in
 * the position is a binary difference in whether a barrier is solid at the
 * moment a quad reaches it. This project's first rule is that a dropped frame
 * changes nothing about the trajectory, and a collider that moves with frame
 * time breaks that rule from the scenery side. A closed form has no
 * accumulator, so there is nothing to compare.
 *
 * THE FIX IS A CLOSED FORM, NOT A SMALLER STEP. Everything that touches
 * collision here is a pure function of the integer fixed step count the shell
 * already keeps, so the same step index gives a bit identical world on any
 * machine at any frame rate, and there is no accumulator to drift.
 *
 *   train x     x0 + SPEED * step * 0.001, wrapped
 *   arm state   a saturating ramp whose phase is read straight off x
 *   boom boxes  set from that arm state through Colliders.setBoxExtentY
 *
 * The town's own `world.update(dt)` is still called, for the vending
 * machines, the traffic, the shutter, the cat and the petals. None of those
 * touches a collider, so frame time is the right clock for them, and letting
 * the town drive its own decoration is what keeps this file small. What it
 * computes about the train and the booms is then overwritten by the closed
 * form, so what is drawn and what is solid are the same thing.
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

/*
 * Every one of these is read out of the vendored town rather than guessed.
 * planet.js R = 160, train.js speed = 23.5 and dir = 1, index.js APPROACH,
 * CLEAR and the two arm rates in updateSequence.
 */
export const CITY_ANIM = {
  R: 160,
  SPEED: 23.5,
  APPROACH: 165,
  CLEAR: 62,
  ARM_DOWN_S: 3.4,
  ARM_UP_S: 3.0,
  /*
   * OURS, not the town's, and it is 0.90 rather than 0.55 on purpose.
   *
   * The town toggles its own boom collider at armT 0.55, which is fine for a
   * walker who is stopped by the machine housing anyway. For a quad the box is
   * the only thing there, and at 0.55 the drawn arm is still 36 degrees above
   * horizontal with the road visibly open under it: measured on the town's own
   * easing, `e = 1 - (2 - 2t)^2 / 2` and `angle = (1 - e) * (pi/2) * 0.99`.
   * That put an invisible full width slab across an open looking road for
   * 1.53 s of every lowering and 1.35 s of every raising, 2.88 s of a 42.78 s
   * cycle, which is a crash into nothing. At 0.90 the arm is within 1.8
   * degrees of horizontal, so the barrier appears when it looks closed.
   */
  ARM_THRESHOLD: 0.90,
  /*
   * Where the train starts, in metres of track before the crossing. 425 puts
   * it 260 m short of the point that trips the bells, so a pilot who spawns
   * and takes off has about eleven seconds before the lamps start and about
   * fifteen before the booms are down. Long enough not to be a cutscene,
   * short enough that it happens.
   */
  X0: -425,
  /* Past this the train is outside the fog and outside the authored rail, so
   * it is simply not drawn. */
  VISIBLE_RANGE: 200,
};

export const CIRCUMFERENCE = 2 * Math.PI * CITY_ANIM.R;
/* Seconds the crossing spends closed, which is how far apart the two arm
 * ramps are. (APPROACH + CLEAR) metres at SPEED. */
export const CLOSED_S = (CITY_ANIM.APPROACH + CITY_ANIM.CLEAR) / CITY_ANIM.SPEED;

/* The town's own wrap, restated here so this file can be tested without a
 * WebGL context. Identical arithmetic to planet.js wrapDelta. */
export function wrapDelta(x) {
  const c = CIRCUMFERENCE;
  let d = x % c;
  if (d > c / 2) {
    d -= c;
  }
  if (d < -c / 2) {
    d += c;
  }
  return d;
}

/*
 * The crossing's whole state as a pure function of the fixed step count.
 * Exported on its own so a test can call it without building a town.
 *
 *   step        integer count of 1 ms fixed steps since the run started
 *   returns     { offset, armT, down, closing, blink }
 *
 * offset is the train's signed distance from the crossing, negative before
 * it. armT is 0 for arms up and 1 for arms fully down.
 */
export function crossingState(step) {
  const a = CITY_ANIM;
  const x = a.X0 + a.SPEED * step * 0.001;
  const offset = wrapDelta(x);
  /*
   * Seconds since the train last entered the approach. The window opens at
   * offset = -APPROACH, so shifting by APPROACH before the wrap puts the
   * opening at phase zero and makes the whole cycle one modulo.
   */
  const phase = ((x + a.APPROACH) % CIRCUMFERENCE + CIRCUMFERENCE) % CIRCUMFERENCE;
  const tau = phase / a.SPEED;
  let armT;
  if (tau < CLOSED_S) {
    armT = tau / a.ARM_DOWN_S;
    if (armT > 1) {
      armT = 1;
    }
  } else {
    armT = 1 - (tau - CLOSED_S) / a.ARM_UP_S;
    if (armT < 0) {
      armT = 0;
    }
  }
  return {
    offset,
    armT,
    down: armT > a.ARM_THRESHOLD,
    closing: tau < CLOSED_S,
    /* 1.6 cycles a second, the town's own rate, as a closed form. */
    blink: (step * 0.001 * 1.6) % 1,
  };
}

/*
 * The two boom colliders.
 *
 * The town gives a boom a box with a top of 1.25 and no bottom, because a
 * walker cannot duck under a barrier and there was no reason to say where it
 * starts. A quad can, and going under a lowered boom is one of the lines this
 * town offers, so the box is given the ARM's own extent instead of the
 * walker's abstraction, read off the geometry in railway.js:
 *
 *     pivot height   0.2 + 0.92 + 0.12          = 1.240 m
 *     arm section    BoxGeometry(seg, 0.17, ..) = +/- 0.085 m
 *     hanging lamps  box at y -0.14, 0.11 tall  = -0.195 m at the lowest
 *
 * so the assembly occupies 1.045 to 1.325 m and the road under it is open by
 * a metre. A quad sweeps 0.1735 m of collision radius, so the gap is real.
 */
const BOOM_Y0 = 1.045;
const BOOM_Y1 = 1.325;
/* Parked: a paper thin box under the road, which nothing can reach. Using a
 * degenerate or inverted box instead would put a lo > hi pair into the
 * distance solver, and that is a silent wrong answer rather than a loud one. */
const BOOM_PARKED_Y0 = -0.60;
const BOOM_PARKED_Y1 = -0.59;

/*
 * Find the town's two boom colliders and say so loudly if they are not there.
 *
 * They are the only two colliders the town parks below ground, and they are
 * the last two it pushes. Both facts are checked, because an upstream change
 * that broke either one would otherwise leave the crossing silently
 * permeable, and a barrier a quad flies through is worse than one that is
 * never there.
 */
export function findBoomBlocks(cityColliders) {
  const parked = [];
  for (let i = 0; i < cityColliders.length; i += 1) {
    if (cityColliders[i].top === -1) {
      parked.push(i);
    }
  }
  const n = cityColliders.length;
  if (parked.length !== 2 || parked[0] !== n - 2 || parked[1] !== n - 1) {
    throw new Error(
      `city: expected the two level crossing booms to be the last two colliders parked at top -1, ` +
      `found ${parked.length} parked at indices [${parked.join(', ')}] of ${n}`,
    );
  }
  return parked;
}

/*
 * Wire the closed form to a built town and a built collider set.
 *
 * `boomBoxIndex` maps the town's collider index to ours. They are the same
 * index only because src/maps/city/index.js adds the town's colliders in
 * order and before anything else; that is asserted rather than assumed.
 */
export function cityAnimation(world, colliders, boomIndices) {
  /* Identified by the caller, before anything ran the town forward. See the
   * note at the call site in index.js. */
  const booms = boomIndices ?? findBoomBlocks(world.colliders);
  for (const i of booms) {
    if (!colliders.fbox[i]) {
      throw new Error(`city: collider ${i} should be a box`);
    }
  }
  const train = world.train;
  const crossing = world.crossing;
  train.group.visible = true;

  let lastStep = 0;
  let armDown = null;
  let state = crossingState(0);

  function update(step) {
    /* The town's own decoration, on frame time, because none of it is solid.
     * The delta is taken from the fixed step count rather than from
     * requestAnimationFrame so a paused shell does not hand it a one second
     * jump when it resumes. */
    let dt = (step - lastStep) * 0.001;
    if (dt < 0) {
      dt = 0;
    } else if (dt > 0.25) {
      dt = 0.25;
    }
    lastStep = step;
    world.update(dt);

    /* Now overwrite everything that either is solid or shows what is solid. */
    state = crossingState(step);
    train.x = CITY_ANIM.X0 + CITY_ANIM.SPEED * step * 0.001;
    /* Flat, along the rails, which are authored along x at z = 0. The town's
     * own train.update spins the cars about the planet axis, which without
     * the bake would swing them off the rail and under the ground. */
    train.group.position.set(state.offset, 0, 0);
    train.group.visible = Math.abs(state.offset) < CITY_ANIM.VISIBLE_RANGE;

    crossing.setArms(state.armT);
    crossing.setLamps(state.closing || state.armT > 0.02, state.blink);

    if (state.down !== armDown) {
      armDown = state.down;
      const y0 = state.down ? BOOM_Y0 : BOOM_PARKED_Y0;
      const y1 = state.down ? BOOM_Y1 : BOOM_PARKED_Y1;
      for (const i of booms) {
        /* One guarded call for both ends. Writing fay directly and then
         * setBoxTop meant the lo <= hi invariant the box solver depends on
         * was maintained by convention across two files, and an inverted
         * box rejects every query silently. */
        colliders.setBoxExtentY(i, y0, y1);
      }
    }
  }

  /* Seat everything at step zero so the first frame is already correct rather
   * than showing one frame of the town's own defaults. */
  update(0);

  /*
   * The boom collider's extent with the arms DOWN.
   *
   * At step zero the booms are parked, so a reference measured then reads the
   * paper thin box under the road and tells a check nothing about the barrier
   * a quad meets. This seats the crossing at the first step where the arms are
   * down, reads the box, and puts the state back. Scanned rather than
   * computed, so it stays right if the phase arithmetic changes.
   */
  function boomExtentDown() {
    const period = Math.round((CIRCUMFERENCE / CITY_ANIM.SPEED) * 1000);
    let found = -1;
    for (let s = 0; s < period; s += 25) {
      if (crossingState(s).down) {
        found = s;
        break;
      }
    }
    if (found < 0) {
      return { y0: null, y1: null };
    }
    const was = lastStep;
    update(found);
    const i = booms[0];
    const out = { y0: colliders.fay[i], y1: colliders.fby[i], step: found };
    lastStep = was;
    update(0);
    return out;
  }

  return {
    update,
    boomExtentDown,
    stats: () => ({
      trainOffset: state.offset,
      armT: state.armT,
      boomsDown: state.down,
      boomIndices: booms,
      loopPeriodS: CIRCUMFERENCE / CITY_ANIM.SPEED,
      closedS: CLOSED_S,
    }),
  };
}
