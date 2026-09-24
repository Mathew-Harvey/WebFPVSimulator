/*
 * input-selftest.js: the calibration wizard and the stick mapping, driven in
 * plain Node against a synthetic radio, with one assertion per defect that
 * has already shipped once.
 *
 * Every check in here is a bug that reached the public board from the 18th
 * of September 2026 on, was reproduced, fixed, and closed.
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
const {
  InputManager, calSteps, SELECT_STEP, KEY_THROTTLE_MODES, normaliseKeyThrottle,
} = await import('../src/input/input.js');
const { hoverStickPercent } = await import('../configs/rates.js');
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
 *   holdAfter               where the throttle is HELD from the end of its
 *                           own step until the check step, when given.
 *                           Unset, the hand comes off and it returns to
 *                           rest, which every other axis always does.
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
     * them. Unless the layout says the throttle stays held, which is the
     * pilot who never lets go until the check step. */
    const after = name === 'throttle' && lay.holdAfter !== undefined ? lay.holdAfter : rest[axis];
    rig.ax(axis, after);
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

section('a radio throttle that springs, and the pilot never lets go until the check step');
{
  /*
   * The same pilot, one step further into doing as they were told. The
   * release prompt says "all the way back down", they hold it there, and
   * the roll step's release used to wait for that throttle to come back to
   * rest, a place nobody had mentioned, with a hint about diagonals. The
   * first draft of this file found it by being that pilot and never getting
   * past roll. An identified throttle sitting at its bottom is parked.
   */
  const rig = new Rig(makePad([0, 0, 0, 0], 2, 'LiteRadio 3, held'));
  const drove = driveWizard(rig, {
    roll: 0, pitch: 1, yaw: 3, thr: 2, thrRest: 0, thrReturn: -1, holdAfter: -1,
  });
  check('the wizard completes with the throttle held down throughout', drove === true, String(drove));
  check('the check step reads 0 while it is still held, and offers nothing',
    rig.view().throttlePercent === 0 && rig.view().canZeroThrottle === false);
  rig.ax(2, 0); rig.step();
  check('the hand comes off: 50 percent, and the offer', rig.view().throttlePercent === 50 && rig.view().canZeroThrottle === true);
  check('which is taken', rig.im.zeroThrottleHere() === true && rig.view().throttlePercent === 0);
  rig.im.acceptCalibration();
  const t = rig.im.map.throttle;
  check('and saved with zero at rest', t.low === 0 && t.high === 1 && t.sprung === true, JSON.stringify(t));
}
{
  /* A gamepad whose spring was detected, so `low` already moved to rest,
   * and whose pilot then holds the stick at its physical bottom through
   * the roll step. The bottom is the sweep's far end, which is what the
   * release check looks at, not `low`. */
  const rig = new Rig(makePad([0, 0, 0, 0], 4, 'Xbox, stick held down'));
  const drove = driveWizard(rig, {
    roll: 0, pitch: 1, yaw: 3, thr: 2, thrRest: 0, thrReturn: 0, holdAfter: -1,
  });
  check('a detected spring, then the stick held at the bottom: the wizard still completes', drove === true, String(drove));
  rig.im.acceptCalibration();
  const t = rig.im.map.throttle;
  check('and the map is the gamepad\'s', t.low === 0 && t.high === 1 && t.sprung === true, JSON.stringify(t));
}
{
  /* The discipline this loosens for the throttle is kept for every other
   * axis: a spring centred stick held during another channel's release
   * still blocks it, because it has one resting place and being anywhere
   * else is a hold. */
  const rig = new Rig(makePad([0, 0, -1, 0], 4, 'TX16S, roll held'));
  rig.im.startCalibration();
  rig.waitStep('sweep');
  for (const i of [0, 1, 2, 3]) {
    rig.ax(i, 1); rig.step(); rig.ax(i, -1); rig.step(); rig.ax(i, i === 2 ? -1 : 0); rig.step();
  }
  rig.waitStep('throttle');
  rig.ax(2, 1); rig.waitPhase('release'); rig.ax(2, -1); rig.waitStep('roll');
  rig.ax(0, 1); rig.waitPhase('release'); rig.ax(0, 0); rig.waitStep('pitch');
  rig.ax(1, -1); rig.waitPhase('release');
  /* Pitch comes back, but roll is held at 0.6 while it does. */
  rig.ax(1, 0); rig.ax(0, 0.6);
  check('roll held during the pitch release: yaw does not arrive', rig.waitStep('yaw', 1500) === false);
  check('the throttle at its bottom was not the reason', rig.pad.axes[2] === -1 && rig.view().step === 'pitch');
  rig.ax(0, 0);
  check('roll let go: yaw arrives', rig.waitStep('yaw') === true);
}

/* ------------------------------------------------------------------------
 * 4b. A channel that came out backwards, and the way to turn it round.
 *     bug-b0d085f0, "cant calibrate the sticks correctly. some are
 *     inverted and there's no option to change it". The wizard takes its
 *     direction from the direction the pilot pushes, so one wrong push at
 *     one of six steps is a channel backwards for good, and until this
 *     there was no way to see it or change it.
 * ---------------------------------------------------------------------- */
section('a backwards channel, and the reverse that fixes it');
{
  /* A pilot who pushed the pitch stick FORWARD on the step that said to
   * pull it back. Everything else done correctly. */
  const rig = new Rig(makePad([0, 0, -1, 0], 4, 'Pushed the wrong way'));
  rig.im.startCalibration();
  rig.waitStep('sweep');
  for (const i of [0, 1, 2, 3]) {
    rig.ax(i, 1); rig.step(); rig.ax(i, -1); rig.step(); rig.ax(i, i === 2 ? -1 : 0); rig.step();
  }
  rig.waitStep('throttle');
  rig.ax(2, 1); rig.waitPhase('release'); rig.ax(2, -1); rig.waitStep('roll');
  rig.ax(0, 1); rig.waitPhase('release'); rig.ax(0, 0); rig.waitStep('pitch');
  /* The prompt says pull back, which is +1 on this radio. They push. */
  rig.ax(1, 1); rig.waitPhase('release'); rig.ax(1, 0); rig.waitStep('yaw');
  rig.ax(3, 1); rig.waitPhase('release'); rig.ax(3, 0); rig.waitStep('confirm');
  rig.ax(1, 1); rig.step();
  check('the wrong push is recorded faithfully, so pitch reads backwards',
    rig.view().channels.pitch === 1, String(rig.view().channels.pitch));
  check('and the check step names the channel being moved', rig.view().moving === 'pitch', String(rig.view().moving));
  check('and offers to reverse it', rig.view().canReverse === true);
  check('and says so in the hint', /press R to reverse pitch/.test(rig.view().hint), rig.view().hint);
  check('reversing returns the channel it turned round', rig.im.reverseMovingChannel() === 'pitch');
  check('the same stick now reads the other way', rig.view().channels.pitch === -1, String(rig.view().channels.pitch));
  check('and the button offer becomes the way back', /Un-reverse|reversed/.test(rig.view().hint) || rig.view().reverse.pitch === true);
  rig.im.acceptCalibration();
  check('the saved map carries the reversal', rig.im.map.reverse.pitch === true
    && rig.im.map.reverse.roll === false, JSON.stringify(rig.im.map.reverse));
  rig.ax(1, 1); rig.step();
  check('and flight reads it reversed', rig.im.channels.pitch === -1, String(rig.im.channels.pitch));
  rig.ax(1, -1); rig.step();
  check('both ways', rig.im.channels.pitch === 1, String(rig.im.channels.pitch));
}
{
  /* Every channel, including the throttle, whose reversal is the dangerous
   * one: a throttle mapped backwards is full power with the stick down. */
  const rig = new Rig(makePad([0, 0, -1, 0], 4, 'All four'));
  const drove = driveWizard(rig, {
    roll: 0, pitch: 1, yaw: 3, thr: 2, thrRest: -1, thrReturn: -1,
  });
  check('the wizard completes', drove === true, String(drove));
  rig.im.acceptCalibration();
  check('nothing is reversed to begin with',
    Object.values(rig.im.map.reverse).every((v) => v === false), JSON.stringify(rig.im.map.reverse));
  rig.ax(0, 1); rig.ax(3, 1); rig.ax(1, -1); rig.ax(2, 1); rig.step();
  const before = { ...rig.im.channels };
  check('all four read full one way', before.roll === 1 && before.yaw === 1
    && before.pitch === 1 && before.throttle === 1, JSON.stringify(before));
  rig.im.map.reverse = {
    roll: true, pitch: true, yaw: true, throttle: true,
  };
  rig.step();
  const after = { ...rig.im.channels };
  check('reversed, the three centred channels negate',
    after.roll === -1 && after.yaw === -1 && after.pitch === -1, JSON.stringify(after));
  check('and the throttle counts down from one rather than going negative',
    after.throttle === 0, String(after.throttle));
  rig.ax(2, -1); rig.step();
  check('a reversed throttle reads FULL with the stick at the bottom, which is why it is offered at all',
    rig.im.channels.throttle === 1, String(rig.im.channels.throttle));
  /* And the -0 trap: poll compares samples with !==, and -0 !== 0 is
   * false but Object.is says otherwise, so a bare negation here would be
   * a value that looks unchanged to one test and changed to another. */
  rig.ax(0, 0); rig.ax(1, 0); rig.ax(3, 0); rig.step();
  check('a reversed channel at rest is +0, not -0',
    Object.is(rig.im.channels.roll, 0) && Object.is(rig.im.channels.pitch, 0)
    && Object.is(rig.im.channels.yaw, 0), JSON.stringify([rig.im.channels.roll, rig.im.channels.pitch]));
  const q = rig.im.queue.length;
  rig.run(200);
  check('and does not emit a change on every poll for ever', rig.im.queue.length - q < 4,
    `${rig.im.queue.length - q} samples in 200 ms`);
}
{
  /* The pointer is the stick, so it must refuse a diagonal rather than
   * guess which of two live channels the pilot meant. */
  const rig = new Rig(makePad([0, 0, -1, 0], 4, 'Diagonal'));
  driveWizard(rig, {
    roll: 0, pitch: 1, yaw: 3, thr: 2, thrRest: -1, thrReturn: -1,
  });
  rig.ax(0, 1); rig.ax(1, -1); rig.step();
  check('roll and pitch together name nothing', rig.view().moving === null, String(rig.view().moving));
  check('so the offer is withheld', rig.view().canReverse === false);
  check('and the key does nothing', rig.im.reverseMovingChannel() === null);
  rig.ax(1, 0); rig.step();
  check('one stick alone names it again', rig.view().moving === 'roll', String(rig.view().moving));
  rig.ax(0, 0.2); rig.step();
  check('a stick barely off centre is not a deliberate aim', rig.view().moving === null, String(rig.view().moving));
}

/* ------------------------------------------------------------------------
 * 4c. Reaching that screen without doing the whole wizard again, which is
 *     the other half of "no option to change it".
 * ---------------------------------------------------------------------- */
section('the check step, opened on its own against the saved map');
{
  const rig = new Rig(makePad([0, 0, -1, 0], 4, 'Already calibrated'));
  driveWizard(rig, {
    roll: 0, pitch: 1, yaw: 3, thr: 2, thrRest: -1, thrReturn: -1,
  });
  rig.im.acceptCalibration();
  const saved = JSON.stringify(rig.im.map);
  check('it opens', rig.im.startCalibrationCheck() === true);
  const v = rig.view();
  check('straight onto the check step, one step long', v.step === 'confirm' && v.stepCount === 1, JSON.stringify([v.step, v.stepCount]));
  check('and says which of the two screens it is', v.checkOnly === true);
  check('with the saved mapping already in it', rig.im.calibration.draft.yaw.axis === rig.im.map.yaw.axis);
  check('the strip still shows every axis', v.axes.length === 4);
  rig.ax(3, 1); rig.step();
  check('a stick names its channel', rig.view().moving === 'yaw', String(rig.view().moving));
  check('reversing it works here too', rig.im.reverseMovingChannel() === 'yaw');
  check('the SAVED map is untouched until save', JSON.stringify(rig.im.map) === saved);
  rig.im.cancelCalibration();
  check('escape leaves it exactly as it was', JSON.stringify(rig.im.map) === saved
    && rig.im.map.reverse.yaw === false, JSON.stringify(rig.im.map.reverse));
  rig.im.startCalibrationCheck();
  rig.ax(3, 1); rig.step();
  rig.im.reverseMovingChannel();
  check('and saving writes it back', rig.im.acceptCalibration() === true && rig.im.map.reverse.yaw === true);
  check('without disturbing the axis assignments', rig.im.map.yaw.axis === 3 && rig.im.map.roll.axis === 0);
}
{
  const rig = new Rig(null);
  check('with no radio there is nothing to check, and it says so rather than opening',
    rig.im.startCalibrationCheck() === false && rig.im.calibration === null);
}
{
  /* A mapping stored before any of this existed has no reverse block at
   * all, and must load with every channel the right way round rather than
   * with undefined holes that read as neither true nor false. */
  const store = memoryStorage();
  store.setItem('webfpv_stick_map_v1', JSON.stringify({
    roll: { axis: 0, center: 0, pos: 1, neg: -1 },
    pitch: { axis: 1, center: 0, pos: -1, neg: 1 },
    yaw: { axis: 3, center: 0, pos: 1, neg: -1 },
    throttle: { axis: 2, low: -1, high: 1 },
  }));
  const rig = new Rig(makePad([0, 0, -1, 0], 4, 'Old map'), store);
  check('an old stored map loads with all four channels forward',
    JSON.stringify(rig.im.map.reverse) === JSON.stringify({
      roll: false, pitch: false, yaw: false, throttle: false,
    }), JSON.stringify(rig.im.map.reverse));
  rig.ax(0, 1); rig.step();
  check('and flies exactly as it did', rig.im.channels.roll === 1, String(rig.im.channels.roll));
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

/* ------------------------------------------------------------------------
 * 9. The keyboard throttle. bug-3a7be142, "whenever I press W or S, it
 *    snaps strangely, and doesn't hold position like a real radio". The
 *    keys sprang back to 0.22 while the shipped quad hovers at 0.350, so
 *    letting go of W lost a metre in half a second. Asserted at the stop:
 *    the spring clamps onto its target, so "rests at hover" is an equality.
 * ---------------------------------------------------------------------- */
section('the keyboard throttle: hover is the measured one');
{
  check('the table reads 35.0 at the shipped weight on a fresh pack, as the menu always did',
    hoverStickPercent(100) === 35 && hoverStickPercent(100, '5inch', 100, 4.2) === 35);
  check('and it follows the weight, the pack and the cap',
    hoverStickPercent(100, '5inch', 60, 4.2) === 26 && hoverStickPercent(100, '5inch', 140, 4.2) === 42.8
    && hoverStickPercent(100, '5inch', 100, 3.8) === 38.8 && hoverStickPercent(65, 'whoop65', 100, 4.2) === 51.1,
    [hoverStickPercent(100, '5inch', 60, 4.2), hoverStickPercent(100, '5inch', 140, 4.2),
      hoverStickPercent(100, '5inch', 100, 3.8), hoverStickPercent(65, 'whoop65', 100, 4.2)].join(' '));
  const w80 = hoverStickPercent(100, '5inch', 80, 4.2);
  check('between columns it interpolates, inside half a point of the 30.7 measured at weight 80',
    Math.abs(w80 - 30.7) <= 0.5, String(w80));

  const rig = new Rig(null);
  const im = rig.im;
  const hold = (code, ms) => { im.keys.add(code); rig.run(ms); };
  const release = (code, ms = 400) => { im.keys.delete(code); rig.run(ms); };
  check('told nothing, the keys rest at the shipped hover rather than 0.22',
    Math.abs(im.kbHover - 0.35) < 1e-12, String(im.kbHover));
  im.setKeyHover(0.511);
  check('setKeyHover takes the run\'s own hover', im.kbHover === 0.511);
  im.setKeyHover('not a number');
  check('and ignores what is not a number', im.kbHover === 0.511, String(im.kbHover));
  hold('KeyW', 1264);
  check('W held off the pad goes to the top', im.channels.throttle === 1, String(im.channels.throttle));
  release('KeyW');
  check('let go in the air, it rests on hover exactly', im.channels.throttle === 0.511, String(im.channels.throttle));
  hold('KeyS', 304);
  const sink = im.channels.throttle;
  check('S sinks from there', sink > 0.04 && sink < 0.511, String(sink));
  release('KeyS');
  check('and let go of S, back on hover', im.channels.throttle === 0.511, String(im.channels.throttle));
}

section('the keyboard throttle: a tap on the pad does not launch, a press past takeoff does');
{
  const rig = new Rig(null);
  const im = rig.im;
  const hold = (code, ms) => { im.keys.add(code); rig.run(ms); };
  const release = (code, ms = 400) => { im.keys.delete(code); rig.run(ms); };
  im.noteLanded(true);
  hold('KeyW', 112);
  const tap = im.channels.throttle;
  check('a short tap stays under takeoff', tap > 0.1 && tap < 0.25, String(tap));
  release('KeyW');
  check('let go, it goes back to idle rather than up to hover', im.channels.throttle === 0, String(im.channels.throttle));
  hold('KeyW', 304);
  check('a longer press passes takeoff', im.channels.throttle >= 0.25, String(im.channels.throttle));
  /* Released while main.js still has the craft down: it has not read the
   * sample that lifts it yet. The latch must survive that gap. */
  release('KeyW', 48);
  im.noteLanded(true);
  rig.run(400);
  check('let go before the shell has lifted it, it still rests at hover',
    im.channels.throttle === im.kbHover, String(im.channels.throttle));
  im.noteLanded(false);
  rig.run(200);
  check('and still does once it is flying', im.channels.throttle === im.kbHover, String(im.channels.throttle));
}

section('the keyboard throttle: touching down parks it, a touch and go does not');
{
  const rig = new Rig(null);
  const im = rig.im;
  const hold = (code, ms) => { im.keys.add(code); rig.run(ms); };
  const release = (code, ms = 400) => { im.keys.delete(code); rig.run(ms); };
  im.noteLanded(false);
  hold('KeyW', 1264);
  release('KeyW');
  hold('KeyS', 304);
  im.noteLanded(true);
  release('KeyS');
  check('down on S and let go, it goes to idle rather than back up to hover',
    im.channels.throttle === 0, String(im.channels.throttle));
  rig.run(1000);
  check('and stays there, so a landed quad does not leave by itself', im.channels.throttle === 0);
  im.noteLanded(false);
  hold('KeyW', 1264);
  release('KeyW');
  hold('KeyW', 208);
  const brushing = im.channels.throttle;
  im.noteLanded(true);
  rig.run(64);
  /* Clearing the latch here would drop the stick from "hover and up" to
   * "idle and up" under a held key, a dip of a quarter of the stick. */
  check('brushing the ground with W held does not dip the throttle under the key',
    im.channels.throttle >= brushing, `${brushing} -> ${im.channels.throttle}`);
  release('KeyW');
  check('and let go, it is still on hover, flying',
    im.channels.throttle === im.kbHover, String(im.channels.throttle));
}

section('the keyboard throttle that stays put');
{
  check('two modes, and anything else is the spring',
    KEY_THROTTLE_MODES.join() === 'hover,hold' && normaliseKeyThrottle('hold') === 'hold'
    && normaliseKeyThrottle('x') === 'hover' && normaliseKeyThrottle(undefined) === 'hover');
  const rig = new Rig(null);
  const im = rig.im;
  const hold = (code, ms) => { im.keys.add(code); rig.run(ms); };
  const release = (code, ms = 1000) => { im.keys.delete(code); rig.run(ms); };
  im.setKeyThrottle('hold');
  hold('KeyW', 96);
  const tap = im.channels.throttle;
  check('a tap moves it about a percent', tap > 0.008 && tap < 0.015, String(tap));
  release('KeyW');
  check('and it stays where it was left', im.channels.throttle === tap, String(im.channels.throttle));
  hold('KeyW', 1200);
  check('a long hold reaches the top', im.channels.throttle === 1, String(im.channels.throttle));
  release('KeyW');
  check('and stays at the top, with no spring back to hover', im.channels.throttle === 1);
  hold('KeyS', 400);
  const down = im.channels.throttle;
  release('KeyS');
  check('S brings it down and it stays there', down < 1 && down > 0.5 && im.channels.throttle === down, String(down));
  im.noteLanded(true);
  rig.run(500);
  check('touching down changes nothing, a radio throttle does not know', im.channels.throttle === down);
  /* The same hold, sliced three ways. The travel is the difference of one
   * curve, so the slices cannot change it: the poll rate is not the pilot. */
  const travel = (stepMs) => {
    const r = new Rig(null);
    r.im.setKeyThrottle('hold');
    r.im.lastWall = r.t;
    r.im.keys.add('KeyW');
    for (let e = 0; e < 480; e += stepMs) {
      r.step(stepMs);
    }
    return r.im.kb.throttle;
  };
  const t2 = travel(2);
  const t16 = travel(16);
  const t40 = travel(40);
  check('the same 480 ms hold travels the same at 2, 16 and 40 ms polls',
    Math.abs(t2 - t16) < 1e-9 && Math.abs(t16 - t40) < 1e-9, `${t2} ${t16} ${t40}`);
}

section('the keyboard throttle: switching back to the spring');
{
  const rig = new Rig(null);
  const im = rig.im;
  const hold = (code, ms) => { im.keys.add(code); rig.run(ms); };
  const release = (code, ms = 48) => { im.keys.delete(code); rig.run(ms); };
  im.setKeyThrottle('hold');
  hold('KeyW', 560);
  release('KeyW');
  const up = im.channels.throttle;
  im.setKeyThrottle('hover');
  rig.run(400);
  check('in the air, it rests at hover rather than springing to idle under a flying quad',
    up >= 0.25 && im.channels.throttle === im.kbHover, `${up} -> ${im.channels.throttle}`);
  im.setKeyThrottle('hold');
  hold('KeyW', 560);
  release('KeyW');
  im.noteLanded(true);
  im.setKeyThrottle('hover');
  rig.run(400);
  check('on the ground, it goes to idle', im.channels.throttle === 0, String(im.channels.throttle));
}

/* A crash recovery sets the craft down on a flat surface through the same
 * reset R uses, so the keys come back exactly as R leaves them: at idle,
 * with the airborne latch off, so letting go cannot spring a parked quad
 * up to hover and relaunch it by itself. */
section('the keyboard throttle: a reset, R or a crash recovery, parks the keys at idle');
{
  const rig = new Rig(null);
  const im = rig.im;
  const hold = (code, ms) => { im.keys.add(code); rig.run(ms); };
  const release = (code, ms = 400) => { im.keys.delete(code); rig.run(ms); };
  im.noteLanded(false);
  hold('KeyW', 1264);
  release('KeyW');
  const flying = im.channels.throttle;
  im.resetKeyboardSticks();
  rig.run(1000);
  check('flying at hover, then reset: the keys rest at idle, latch off',
    flying === im.kbHover && im.channels.throttle === 0 && !im.kbAir, `${flying} -> ${im.channels.throttle}`);
}

/* ------------------------------------------------------------------------
 * 10. The joystick picker's picture. bug-9983ae9a, a Flysky SM001: "On the
 *     test image you can see on one side the bullet is moving for both
 *     sticks but not as they should." The cards drew raw axes 0 and 1 as
 *     the left stick and 2 and 3 as the right, a gamepad's layout. A radio
 *     that reports throttle first, the order Spektrum and JR use, moved
 *     the left plate for its throttle AND its roll. The picture is drawn
 *     through the mapping the page will fly now.
 * ---------------------------------------------------------------------- */
section('the joystick picker draws what the page will fly, not raw axes');
{
  /* Throttle first: [throttle, roll, pitch, yaw, switch, switch]. */
  const rig = new Rig(makePad([-1, 0, 0, 0, -1, -1], 4, 'Throttle first radio'));
  const im = rig.im;
  im.startPadPick('menu');
  rig.run(48);
  const card = () => im.padPickView().pads[0];
  check('a card carries the sticks as flight reads them, and no raw axes',
    card() && card().sticks && !('axes' in card()), JSON.stringify(card()));
  check('and says it is the built in guess while nothing is calibrated', im.padPickView().mapKnown === false);
  /* At rest, the guess reads this radio's parked throttle, on axis 0, as a
   * roll stick held hard over. That is what the quad would do, and the old
   * picture could not show it: it drew axis 0 as a gamepad's left stick. */
  const idle = card().sticks;
  check('uncalibrated, the picture shows the parked throttle read as full roll, as the quad would fly it',
    idle.roll === -1, JSON.stringify(idle));
  /* The pilot pushes their roll stick, which this radio reports on axis 1. */
  rig.ax(1, 1);
  rig.run(32);
  const guess = card().sticks;
  check('and a push on the roll stick moves the guess\'s pitch, and only its pitch',
    guess.pitch !== idle.pitch && guess.roll === idle.roll && guess.yaw === idle.yaw && guess.throttle === idle.throttle,
    `${JSON.stringify(idle)} -> ${JSON.stringify(guess)}`);
  rig.ax(1, 0);
  rig.run(32);
  /* What the wizard saves for this radio: each channel where it really is. */
  im.map = {
    roll: { axis: 1, center: 0, full: 1 },
    pitch: { axis: 2, center: 0, full: -1 },
    yaw: { axis: 3, center: 0, full: 1 },
    throttle: { axis: 0, low: -1, high: 1 },
    reverse: {},
    stored: true,
  };
  check('calibrated, it says so', im.padPickView().mapKnown === true);
  rig.ax(1, 1);
  rig.run(32);
  const known = card().sticks;
  check('and the same push is roll, full right, and nothing else',
    known.roll === 1 && known.pitch === 0 && known.yaw === 0, JSON.stringify(known));
  rig.ax(1, 0);
  rig.ax(0, 1);
  rig.run(32);
  check('the throttle stick is the throttle, at the top',
    card().sticks.throttle === 1 && card().sticks.roll === 0, JSON.stringify(card().sticks));
  im.cancelPadPick();
}

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
for (const f of fails) {
  console.log(`  FAIL ${f}`);
}
process.exitCode = failed ? 1 : 0;
