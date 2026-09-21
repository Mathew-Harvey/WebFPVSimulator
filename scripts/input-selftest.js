/*
 * input-selftest.js: the calibration wizard and the stick mapping, driven in
 * plain Node against a synthetic radio, with one assertion per defect that
 * has already shipped once.
 *
 * Every check in here is a bug that reached the public board between the
 * 18th and the 21st of September 2026, was reproduced, fixed, and closed.
 * Each names its ticket. The probes that found them were written in a
 * scratch directory and died with the container, which is how a fix gets
 * to be un-fixed a month later by somebody tidying up. This file is those
 * probes, kept.
 *
 * TWO RULES, LEARNED THE HARD WAY IN THE SAME WEEK.
 *
 * The first is that a test written in the same sitting as the code inherits
 * the code's assumptions and can only confirm them. The review of the 19th
 * found three defects that the probes beside them could not see, because
 * every axis on the synthetic radio rested at 0 or -1 and swept
 * symmetrically, and every assertion was a band the raw arithmetic happened
 * to satisfy. So the radios here are deliberately awkward: yaw on axis 4
 * with a slider on axis 3, a throttle that springs to the middle, a stick
 * with its endpoints wound in to half travel, a pilot who obeys the prompt
 * and holds the throttle down. And the assertions are at the STOP, "full
 * stick reads exactly 1.0", rather than in a band.
 *
 * The second is that a latch must be tested in both directions. The no-yaw
 * warning was probed going false to true and never asked whether it could
 * come back, and it could not: a false positive stayed up for the rest of
 * the session. Every latch here is driven there and back.
 *
 * No browser. InputManager wants a window to hang key listeners on, a
 * localStorage and a navigator.getGamepads, and all three are shimmed at
 * the top of each rig so the class under test is the shipped one. The
 * browser half of the same regressions, the screens and the touch plates,
 * is scripts/input-check.js.
 *
 * Usage:
 *   npm run input:selftest
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

/* ------------------------------------------------------------------------
 * The environment InputManager expects, as little of it as it touches.
 * ---------------------------------------------------------------------- */

function memoryStorage({ throwOn = null } = {}) {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (throwOn && String(k).includes(throwOn)) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      store.set(k, String(v));
    },
    removeItem: (k) => { store.delete(k); },
  };
}

function installEnv(pad, storage) {
  globalThis.localStorage = storage || memoryStorage();
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  /* Node 22 has a navigator with no getGamepads on it; the property is
   * assignable. Older Nodes have none, so build one. */
  const gp = () => (pad ? [pad] : []);
  try {
    navigator.getGamepads = gp;
  } catch (e) {
    globalThis.navigator = { getGamepads: gp };
  }
}

function makePad(axes, buttons = 0, id = 'Selftest radio') {
  return {
    index: 0,
    id,
    connected: true,
    mapping: '',
    timestamp: 1,
    axes: axes.slice(),
    buttons: Array.from({ length: buttons }, () => ({ pressed: false, value: 0 })),
  };
}

/* The module is imported AFTER the first shim exists, because the
 * constructor reaches for window on its first line of real work. */
installEnv(null);
const { InputManager, calSteps, SELECT_STEP } = await import('../src/input/input.js');
const {
  stickChannels, stickCaption, stickSideOf, normaliseStickMode, STICK_MODES,
} = await import('../src/input/stickmode.js');

/*
 * A rig is one InputManager on one synthetic radio with its own clock. The
 * clock is stepped by hand, sixteen milliseconds at a time, so every timing
 * constant in the wizard is exercised at a realistic frame cadence and
 * nothing here depends on how fast this machine is.
 */
class Rig {
  constructor(pad, storage) {
    installEnv(pad, storage);
    this.pad = pad;
    this.im = new InputManager();
    this.t = performance.now();
  }

  ax(i, v) {
    this.pad.axes[i] = v;
    this.pad.timestamp += 1;
  }

  step(ms = 16) {
    this.t += ms;
    this.im.poll(this.t);
  }

  run(ms) {
    for (let e = 0; e < ms; e += 16) {
      this.step(16);
    }
  }

  view() {
    return this.im.calibrationView();
  }

  /* Step until the wizard is on `name` in its hold phase, or give up. The
   * limit is sim time, not wall time. */
  waitStep(name, limitMs = 6000) {
    for (let e = 0; e < limitMs; e += 16) {
      this.step(16);
      const v = this.view();
      if (v && v.step === name && v.phase === 'hold') {
        return true;
      }
    }
    return false;
  }

  waitPhase(phase, limitMs = 6000) {
    for (let e = 0; e < limitMs; e += 16) {
      this.step(16);
      const v = this.view();
      if (v && v.phase === phase) {
        return true;
      }
    }
    return false;
  }
}

/*
 * Drive the wizard the way a pilot does, on a radio described by `lay`:
 *   roll, pitch, yaw, thr   the axis index of each channel
 *   thrRest                 where the throttle sits at the centre step
 *   thrReturn               where the pilot puts it at the release step
 *                           (a parked radio: the bottom; a gamepad: lets
 *                           go, so back to rest; a sprung radio obeying
 *                           the prompt: the bottom)
 *   full                    how far the sticks reach, 1 unless wound in
 * Returns false at the first step that never arrived.
 */
function driveWizard(rig, lay) {
  const full = lay.full ?? 1;
  const flight = [lay.roll, lay.pitch, lay.yaw, lay.thr];
  rig.im.startCalibration();
  if (!rig.waitStep('sweep')) {
    return 'centre never settled';
  }
  const rest = rig.pad.axes.slice();
  for (const i of flight) {
    rig.ax(i, full); rig.step();
    rig.ax(i, -full); rig.step();
    rig.ax(i, rest[i]); rig.step();
  }
  if (!rig.waitStep('throttle')) {
    return 'sweep never completed';
  }
  const ident = [
    ['throttle', lay.thr, full, lay.thrReturn ?? rest[lay.thr]],
    ['roll', lay.roll, full, rest[lay.roll]],
    ['pitch', lay.pitch, -full, rest[lay.pitch]],
    ['yaw', lay.yaw, full, rest[lay.yaw]],
  ];
  for (const [name, axis, push, back] of ident) {
    if (rig.view().step !== name) {
      return `expected step ${name}, on ${rig.view().step}`;
    }
    rig.ax(axis, push);
    if (!rig.waitPhase('release')) {
      return `${name} never identified`;
    }
    rig.ax(axis, back);
    const steps = rig.view().steps;
    const next = steps[steps.indexOf(name) + 1];
    if (!rig.waitStep(next)) {
      return `${name} never released to ${next}`;
    }
    /* And then the hand comes off. On a sprung throttle whose pilot held
     * it down as told, this is the moment it springs back to the middle,
     * one step too late for the detector to see: bug-851a43b7 in one
     * line. Every other axis is already at rest, so this is a no-op for
     * them. */
    rig.ax(axis, rest[axis]);
    rig.step();
  }
  return true;
}

/* ------------------------------------------------------------------------
 * 1. The step list: a four axis radio is never asked for a menu switch.
 *    bug-89b2c85c, "at step 7 of calibration i can't continue, i don't
 *    have any button on my radio".
 * ---------------------------------------------------------------------- */
section('calSteps: the menu switch is only asked when there is an axis to answer with');
check('a radio with buttons is never asked', !calSteps(true, 8).includes(SELECT_STEP));
check('four axes and no buttons: not asked, because all four are claimed',
  !calSteps(false, 4).includes(SELECT_STEP));
check('six axes and no buttons: asked, before the check step',
  calSteps(false, 6).indexOf(SELECT_STEP) === calSteps(false, 6).indexOf('confirm') - 1);

/* ------------------------------------------------------------------------
 * 2. The whole wizard on the awkward radio: yaw on axis 4, a slider on
 *    axis 3 that never moves, six axes, no buttons.
 *    bug-89b2c85c (Skip), bug-27386f07 (the axis strip), review of the
 *    19th (lo and hi are the sweep's, not a width centred on rest).
 * ---------------------------------------------------------------------- */
section('the wizard on a radio the guess gets wrong');
{
  const rig = new Rig(makePad([0, 0, -1, 0, 0, -1], 0, 'Pocket'));
  const lay = {
    roll: 0, pitch: 1, yaw: 4, thr: 2, thrRest: -1, thrReturn: -1,
  };
  rig.im.startCalibration();
  check('six axes and no buttons make eight steps', rig.view().stepCount === 8);
  check('the strip carries every axis from step one', rig.view().axes.length === 6);
  const drove = driveWizard(rig, lay);
  check('every flight channel identifies and releases', drove === true, String(drove));
  const v = rig.view();
  check('it is now asking for the menu switch', v.step === SELECT_STEP);
  check('and offers to skip it', v.canSkip === true);
  const a4 = v.axes[4];
  const a3 = v.axes[3];
  check('the strip records the sweep as its two ends: yaw axis -1 to 1',
    a4 && a4.lo === -1 && a4.hi === 1, JSON.stringify(a4));
  check('and the slider that never moved as 0 to 0',
    a3 && a3.lo === 0 && a3.hi === 0, JSON.stringify(a3));
  check('the claimed axes are marked', v.axes[0].mapped && v.axes[4].mapped && !v.axes[3].mapped);
  check('skip moves to the check step', rig.im.skipCalibrationSelect() && rig.view().step === 'confirm');
  check('and the check step can save', rig.view().canSave === true);
  check('accept keeps the map', rig.im.acceptCalibration() === true);
  const m = rig.im.map;
  check('yaw was learned on axis 4, not the guess\'s axis 3', m.yaw.axis === 4);
  check('the menu switch is null, as on a radio with buttons', m.select === null);
  check('the result is saved, with storage working', rig.im.calResult === 'saved');
}

/* ------------------------------------------------------------------------
 * 3. The preview on the step that asks for movement, on the ruler the
 *    assignment will use. bug-122503e9, "stuck on roll, no input during
 *    that time"; review of the 19th, the raw unit ruler.
 * ---------------------------------------------------------------------- */
section('the preview during identification');
{
  const rig = new Rig(makePad([0, 0, -1, 0], 4));
  rig.im.startCalibration();
  rig.waitStep('sweep');
  for (const i of [0, 1, 2, 3]) {
    rig.ax(i, 1); rig.step(); rig.ax(i, -1); rig.step(); rig.ax(i, i === 2 ? -1 : 0); rig.step();
  }
  rig.waitStep('throttle');
  /* Rest is -1 and the sweep reached +1, so the reach is two units. A raw
   * unit ruler read 0.3 here and 1.0 at half stick. */
  rig.ax(2, -0.4); rig.step();
  check('throttle preview at 0.6 units of a 2 unit reach reads 0.30',
    Math.abs(rig.view().channels.throttle - 0.30) < 1e-9, String(rig.view().channels.throttle));
  rig.ax(2, 1); rig.waitPhase('release'); rig.ax(2, -1); rig.waitStep('roll');
  rig.ax(0, 0.3); rig.step();
  check('roll preview at 0.3 of a 1 unit reach reads 0.30, and it is not zero',
    Math.abs(rig.view().channels.roll - 0.30) < 1e-9, String(rig.view().channels.roll));
  check('the preview is the channel being asked for and nothing else',
    rig.view().channels.pitch === 0 && rig.view().channels.yaw === 0);
}
{
  /* A radio with its endpoints wound in to half travel. Full stick on it
   * is 0.5 in raw units, and the wizard records 0.5 as full, so the
   * preview must read 1.0 there: this is the assertion at the stop. */
  const rig = new Rig(makePad([0, 0, -1, 0], 4, 'Wound in'));
  rig.im.startCalibration();
  rig.waitStep('sweep');
  for (const i of [0, 1, 2, 3]) {
    const f = i === 2 ? 1 : 0.5;
    rig.ax(i, f); rig.step(); rig.ax(i, -f); rig.step(); rig.ax(i, i === 2 ? -1 : 0); rig.step();
  }
  rig.waitStep('throttle');
  rig.ax(2, 1); rig.waitPhase('release'); rig.ax(2, -1); rig.waitStep('roll');
  rig.ax(0, 0.5); rig.step();
  check('on a wound in radio, full stick previews as exactly 1.0',
    rig.view().channels.roll === 1, String(rig.view().channels.roll));
}

/* ------------------------------------------------------------------------
 * 4. Three throttles. A gamepad that springs, a radio that parks, and the
 *    radio that springs but whose pilot holds it down when told to.
 *    bug-93400859 (the gamepad), bug-851a43b7 (the LiteRadio), review of
 *    the 21st (the zero press guard).
 * ---------------------------------------------------------------------- */
section('a gamepad throttle that springs back, and the pilot lets go');
{
  const rig = new Rig(makePad([0, 0, 0, 0], 4, 'Xbox'));
  const drove = driveWizard(rig, {
    roll: 0, pitch: 1, yaw: 3, thr: 2, thrRest: 0, thrReturn: 0,
  });
  check('the wizard completes', drove === true, String(drove));
  check('the check step is quiet, the spring was detected on its own',
    rig.view().canZeroThrottle === false);
  rig.im.acceptCalibration();
  const t = rig.im.map.throttle;
  check('zero throttle is at rest, not at the bottom of the stick',
    t.low === 0 && t.high === 1 && t.sprung === true, JSON.stringify(t));
  rig.ax(2, 0); rig.step();
  check('hands off reads exactly 0, where it read 0.5', rig.im.channels.throttle === 0);
  rig.ax(2, 1); rig.step();
  check('full up reads exactly 1', rig.im.channels.throttle === 1);
  rig.ax(2, -1); rig.step();
  check('past centre the other way is idle, not negative', rig.im.channels.throttle === 0);
}

section('a radio throttle that parks at the bottom, which must not be touched');
{
  const rig = new Rig(makePad([0, 0, -1, 0], 4, 'TX16S'));
  const drove = driveWizard(rig, {
    roll: 0, pitch: 1, yaw: 3, thr: 2, thrRest: -1, thrReturn: -1,
  });
  check('the wizard completes', drove === true, String(drove));
  rig.im.acceptCalibration();
  const t = rig.im.map.throttle;
  check('the map is the plain one', t.low === -1 && t.high === 1 && !t.sprung, JSON.stringify(t));
  rig.ax(2, -1); rig.step();
  check('bottom reads 0', rig.im.channels.throttle === 0);
  rig.ax(2, 0); rig.step();
  check('middle reads 0.5, because on this throttle the middle IS half', rig.im.channels.throttle === 0.5);
}

section('a radio throttle that springs, and the pilot holds it down as told');
{
  const rig = new Rig(makePad([0, 0, 0, 0], 2, 'LiteRadio 3'));
  const drove = driveWizard(rig, {
    roll: 0, pitch: 1, yaw: 3, thr: 2, thrRest: 0, thrReturn: -1,
  });
  check('the wizard completes', drove === true, String(drove));
  /* The pilot lets go now, on the check step, and the stick springs to
   * the middle. This is the case the detector cannot see, and the file
   * says so; what is asserted is the way out. */
  rig.ax(2, 0); rig.step();
  const v = rig.view();
  check('the check step reads 50 percent with the stick at rest',
    v.throttlePercent === 50 && v.channels.throttle === 0.5, String(v.throttlePercent));
  check('and offers to move zero here', v.canZeroThrottle === true);
  check('and says the number out loud', /50 percent/.test(v.hint), v.hint);
  const lowBefore = rig.im.calibration.draft.throttle.low;
  rig.ax(2, 0.9); rig.step();
  check('the offer is refused with the stick most of the way up',
    rig.im.zeroThrottleHere() === false && rig.im.calibration.draft.throttle.low === lowBefore);
  rig.ax(2, 0); rig.step();
  check('and taken with the stick at rest', rig.im.zeroThrottleHere() === true);
  check('after which the check step reads 0 and stops offering',
    rig.view().channels.throttle === 0 && rig.view().canZeroThrottle === false);
  rig.im.acceptCalibration();
  const t = rig.im.map.throttle;
  check('the saved map has zero at rest and is marked sprung',
    t.low === 0 && t.high === 1 && t.sprung === true, JSON.stringify(t));
  rig.ax(2, 0); rig.step();
  check('hands off reads exactly 0', rig.im.channels.throttle === 0);
  rig.ax(2, 1); rig.step();
  check('full up reads exactly 1', rig.im.channels.throttle === 1);
  rig.ax(2, -1); rig.step();
  check('full down reads 0', rig.im.channels.throttle === 0);
}

/* ------------------------------------------------------------------------
 * 5. The guess check past the throttle, and the latch in both directions.
 *    bug-3d72d9a4, bug-94f7e52b, bug-13519874 (no yaw on a guessed map
 *    whose throttle happened to be right); review of the 19th (a wrong
 *    verdict that could not clear).
 * ---------------------------------------------------------------------- */
section('the no-yaw verdict on an uncalibrated radio');
{
  const rig = new Rig(makePad([0, 0, -1, 0, 0, -1], 4, 'Pocket'));
  rig.run(100);
  check('the throttle parked, so the old check is satisfied',
    rig.im.padSummary().mapUsable === true && rig.im.padSummary().calibrated === false);
  check('nothing has been swept, so no verdict yet', rig.im.padSummary().guessNoYaw === false);
  const sweep = () => {
    for (const v of [0.2, 0.45, 0.7, 0.95, 0.45, -0.3, -0.75, 0]) {
      rig.ax(4, v); rig.step();
    }
  };
  sweep();
  check('yaw on axis 4 swept like a gimbal while the guessed axis 3 sat still: verdict',
    rig.im.padSummary().guessNoYaw === true);
  check('and the old check still says the guess is usable, which is the gap this closes',
    rig.im.padSummary().mapUsable === true);
  rig.ax(3, 0.5); rig.step(); rig.ax(3, 0); rig.step();
  check('the guessed yaw axis moved once: the verdict clears', rig.im.padSummary().guessNoYaw === false);
  sweep();
  check('and stays clear however much the stray axis is swept afterwards',
    rig.im.padSummary().guessNoYaw === false);
}
{
  /* A two position switch on an unnamed axis must not count as a gimbal. */
  const rig = new Rig(makePad([0, 0, -1, 0, 0, -1], 4, 'Switchy'));
  rig.run(100);
  for (let k = 0; k < 6; k += 1) {
    rig.ax(5, 1); rig.step(); rig.ax(5, -1); rig.step();
  }
  check('a switch thrown six times on an unnamed axis is not a swept stick',
    rig.im.padSummary().guessNoYaw === false);
}

/* ------------------------------------------------------------------------
 * 6. The save that used to say "saved" over a throw. bug-ed4d2bce.
 * ---------------------------------------------------------------------- */
section('saving when storage refuses');
{
  const rig = new Rig(makePad([0, 0, -1, 0], 4), memoryStorage({ throwOn: 'stick_map' }));
  const drove = driveWizard(rig, {
    roll: 0, pitch: 1, yaw: 3, thr: 2, thrRest: -1, thrReturn: -1,
  });
  check('the wizard completes', drove === true, String(drove));
  check('accept still succeeds', rig.im.acceptCalibration() === true);
  check('but the result says the map did not stick', rig.im.calResult === 'saved-unstored');
  check('while the map stays calibrated for this session', rig.im.map.stored === true);
  check('saveMap itself returns false', rig.im.saveMap() === false);
}

/* ------------------------------------------------------------------------
 * 7. The stick mode table, and the keyboard reading it by direction.
 *    bug-94da186c, bug-a8cd61db. The sign trap: forward on a pitch stick
 *    is nose down and NEGATIVE, forward on a throttle is POSITIVE.
 * ---------------------------------------------------------------------- */
section('stickmode: the table');
{
  const want = {
    1: ['yaw', 'pitch', 'roll', 'throttle'],
    2: ['yaw', 'throttle', 'roll', 'pitch'],
    3: ['roll', 'pitch', 'yaw', 'throttle'],
    4: ['roll', 'throttle', 'yaw', 'pitch'],
  };
  for (const m of STICK_MODES) {
    const c = stickChannels(m);
    const got = [c.left.horiz, c.left.vert, c.right.horiz, c.right.vert];
    check(`mode ${m} is ${want[m].join('/')}`, got.join() === want[m].join(), got.join('/'));
  }
  check('anything that is not a mode is Mode 2',
    [normaliseStickMode('x'), normaliseStickMode(9), normaliseStickMode(null), normaliseStickMode(undefined)]
      .every((m) => m === 2));
  check('mode 1 puts pitch on the left and throttle on the right',
    stickSideOf(1, 'pitch') === 'left' && stickSideOf(1, 'throttle') === 'right');
  check('captions name the horizontal first', stickCaption(1, 'right') === 'Roll, throttle'
    && stickCaption(2, 'left') === 'Yaw, throttle');
}

section('stickmode: the keyboard');
{
  const rig = new Rig(null);
  const im = rig.im;
  const hold = (code, ms) => { im.keys.add(code); rig.run(ms); };
  const release = (code, ms = 400) => { im.keys.delete(code); rig.run(ms); };

  check('mode 2 by default: W and S are the throttle',
    im.throttleKeys.up === 'KeyW' && im.throttleKeys.down === 'KeyS');
  const thr0 = im.channels.throttle;
  hold('KeyW', 700);
  check('mode 2: W held raises throttle', im.channels.throttle > thr0 + 0.2, `${thr0} -> ${im.channels.throttle}`);
  check('mode 2: and touches no other channel', im.channels.pitch === 0 && im.channels.roll === 0);
  release('KeyW');
  hold('ArrowUp', 700);
  check('mode 2: up arrow is pitch, and forward is nose down, so NEGATIVE',
    im.channels.pitch < -0.2, String(im.channels.pitch));
  /* Keep the arrow held across the mode change: this is the stranded
   * deflection the change has to clear. */
  const thrBefore = im.kb.throttle;
  im.setStickMode(1);
  check('the mode change zeroes the spring centred channels', im.kb.pitch === 0 && im.kb.roll === 0);
  check('and keeps the collective where it was', im.kb.throttle === thrBefore);
  release('ArrowUp');
  check('mode 1: the arrows are the throttle',
    im.throttleKeys.up === 'ArrowUp' && im.throttleKeys.down === 'ArrowDown');
  check('mode 1: W and S are pitch, with W the negative key',
    im.keyAxes.some(([ch, neg, pos]) => ch === 'pitch' && neg === 'KeyW' && pos === 'KeyS'));
  /* Relative to where it sat, because a key nothing listens to leaves the
   * collective at hover, which is above zero and proves nothing. */
  const thr1 = im.channels.throttle;
  hold('ArrowUp', 700);
  check('mode 1: up arrow raises throttle', im.channels.throttle > thr1 + 0.2, `${thr1} -> ${im.channels.throttle}`);
  check('mode 1: and does not pitch', im.channels.pitch === 0);
  release('ArrowUp');
  hold('KeyW', 700);
  check('mode 1: W is pitch, and forward is STILL nose down',
    im.channels.pitch < -0.2, String(im.channels.pitch));
  release('KeyW');
  im.setStickMode(3);
  check('mode 3: A and D are roll, the arrows left and right are yaw',
    im.keyAxes.some(([ch, neg, pos]) => ch === 'roll' && neg === 'KeyA' && pos === 'KeyD')
    && im.keyAxes.some(([ch, neg, pos]) => ch === 'yaw' && neg === 'ArrowLeft' && pos === 'ArrowRight'));
}

/* ------------------------------------------------------------------------
 * 8. The wizard names the stick the pilot's mode puts the channel on.
 * ---------------------------------------------------------------------- */
section('stickmode: the wizard names the right hand');
{
  const rig = new Rig(makePad([0, 0, -1, 0], 4));
  rig.im.startCalibration();
  rig.waitStep('sweep');
  for (const i of [0, 1, 2, 3]) {
    rig.ax(i, 1); rig.step(); rig.ax(i, -1); rig.step(); rig.ax(i, i === 2 ? -1 : 0); rig.step();
  }
  rig.waitStep('throttle');
  rig.ax(2, 1); rig.waitPhase('release'); rig.ax(2, -1); rig.waitStep('roll');
  rig.ax(0, 1); rig.waitPhase('release'); rig.ax(0, 0); rig.waitStep('pitch');
  check('mode 2: pitch is the right stick', /right stick/.test(rig.view().prompt), rig.view().prompt);
  rig.im.setStickMode(1);
  check('mode 1: pitch is the left stick', /left stick/.test(rig.view().prompt), rig.view().prompt);
  rig.im.setStickMode(2);
}

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
for (const f of fails) {
  console.log(`  FAIL ${f}`);
}
process.exitCode = failed ? 1 : 0;
