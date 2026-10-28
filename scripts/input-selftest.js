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
  /* Listeners are kept, so a section can fire the events a page would: fire()
   * is the stub's own, not the browser's. */
  const listeners = {};
  globalThis.window = {
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener() {},
    fire(type, ev) {
      for (const fn of listeners[type] || []) {
        fn(ev);
      }
    },
  };
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
  check('and the screen says roll is what it is waiting for', /Waiting for roll/.test(rig.view().hint), rig.view().hint);
  rig.ax(0, 0);
  check('roll let go: yaw arrives', rig.waitStep('yaw') === true);
}

section('a radio throttle that springs, held down at the centre step and let go on the left stick: bug-f06287ff');
{
  /*
   * A BETAFPV JoyStick on Windows, eight axes and no buttons: "calibration
   * menu process seems to stop around the point where i need to let the left
   * stick come back to center". Its throttle springs back to just under the
   * middle, -0.13 in the report, and this pilot held it down at the centre
   * step as the centre step says, so its REST IS THE BOTTOM, and the middle
   * is neither of the two places an identified throttle may park. They held
   * it through roll and pitch, which are the other hand, and yaw is the
   * first step that needs the left thumb for something else. "Let the left
   * stick come back to the centre" is an instruction to let go, the throttle
   * springs up, and the release waits for it to come back down while the
   * hint talked about diagonals. The wait is right and stays; the screen now
   * says what it is waiting for, and the prompt on that stick says to keep
   * the throttle down.
   */
  const rig = new Rig(makePad([0, 0, -1, 0, 0, -1, -1, 0], 0, 'BETAFPV JoyStick (Vendor: 0483 Product: 4321)'));
  rig.im.startCalibration();
  rig.waitStep('sweep');
  for (const i of [0, 1, 2, 3]) {
    rig.ax(i, 1); rig.step(); rig.ax(i, -1); rig.step(); rig.ax(i, i === 2 ? -1 : 0); rig.step();
  }
  rig.waitStep('throttle');
  rig.ax(2, 1); rig.waitPhase('release'); rig.ax(2, -1); rig.waitStep('roll');
  rig.ax(0, 1); rig.waitPhase('release'); rig.ax(0, 0); rig.waitStep('pitch');
  rig.ax(1, -1); rig.waitPhase('release'); rig.ax(1, 0); rig.waitStep('yaw');
  rig.ax(3, 1); rig.waitPhase('release');
  const prompt = rig.view().prompt;
  check('mode 2: the yaw release, on the stick that carries the throttle, says to keep the throttle down',
    /left stick.*throttle still all the way down/.test(prompt), prompt);
  /* The left thumb comes off: yaw centres, and the throttle springs up. */
  rig.ax(3, 0.02); rig.ax(2, -0.13);
  const stuck = rig.waitStep(SELECT_STEP, 1500) === false;
  const v = rig.view();
  check('the release waits, as it should for a throttle off its bottom',
    stuck && v.step === 'yaw' && v.phase === 'release', `${v.step} ${v.phase}`);
  check('and says what it is waiting for: the throttle, and what it reads',
    /throttle, which reads 4[34] percent/.test(v.hint), v.hint);
  check('and the way on for a throttle that springs back up', /hold it down/.test(v.hint), v.hint);
  rig.ax(2, -1);
  check('held down, the menu switch step arrives', rig.waitStep(SELECT_STEP) === true, rig.view().step);
  /* Mode 1 puts the throttle on the right stick with roll, so there it is
   * roll's release that has to say it, and yaw's must not. */
  const releasePrompt = (step) => {
    rig.im.calibration.step = step;
    rig.im.calibration.phase = 'release';
    return rig.view().prompt;
  };
  rig.im.setStickMode(1);
  const mode1 = { roll: releasePrompt('roll'), yaw: releasePrompt('yaw') };
  rig.im.setStickMode(2);
  check('mode 1: roll\'s release says it, and yaw\'s does not',
    /right stick.*throttle still all the way down/.test(mode1.roll) && !/throttle/.test(mode1.yaw),
    `${mode1.roll} | ${mode1.yaw}`);
}
{
  /* The stick just asked for has to come back too, and it is the prompt's
   * to say so, not the hint's: the hint names only some OTHER axis. */
  const rig = new Rig(makePad([0, 0, -1, 0], 4, 'Roll not let go'));
  rig.im.startCalibration();
  rig.waitStep('sweep');
  for (const i of [0, 1, 2, 3]) {
    rig.ax(i, 1); rig.step(); rig.ax(i, -1); rig.step(); rig.ax(i, i === 2 ? -1 : 0); rig.step();
  }
  rig.waitStep('throttle');
  rig.ax(2, 1); rig.waitPhase('release'); rig.ax(2, -1); rig.waitStep('roll');
  rig.ax(0, 1); rig.waitPhase('release');
  check('roll still held after it was identified: pitch does not arrive', rig.waitStep('pitch', 1500) === false);
  check('and the hint blames no other axis', /One direction at a time/.test(rig.view().hint), rig.view().hint);
  rig.ax(0, 0);
  check('roll let go: pitch arrives', rig.waitStep('pitch') === true);
}
{
  /* And when it is not a channel at all: a switch knocked during a release
   * is named by its axis, which is the number the strip above it shows. */
  const rig = new Rig(makePad([0, 0, -1, 0, -1], 4, 'Switch knocked'));
  rig.im.startCalibration();
  rig.waitStep('sweep');
  for (const i of [0, 1, 2, 3]) {
    rig.ax(i, 1); rig.step(); rig.ax(i, -1); rig.step(); rig.ax(i, i === 2 ? -1 : 0); rig.step();
  }
  rig.waitStep('throttle');
  rig.ax(2, 1); rig.waitPhase('release'); rig.ax(2, -1); rig.waitStep('roll');
  rig.ax(0, 1); rig.waitPhase('release');
  rig.ax(0, 0); rig.ax(4, 1);
  check('a switch knocked during the roll release: pitch does not arrive', rig.waitStep('pitch', 1500) === false);
  check('and the screen names the axis', /Waiting for axis 4/.test(rig.view().hint), rig.view().hint);
  rig.ax(4, -1);
  check('put back: pitch arrives', rig.waitStep('pitch') === true);
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

/* bug-c9423f3e, a Radiomaster Pocket in Firefox: "the throttle is mapped on
 * the yaw axes and the throttle movement is not detected". The throttle is
 * on axis 3, where AETR guesses yaw, parked at the bottom; a sprung stick is
 * on axis 2, where it guesses throttle. Neither verdict above catches it. */
section('the throttle-as-yaw verdict on an uncalibrated radio');
{
  const rig = new Rig(makePad([0, 0, 0, -1, 0, 0], 4, 'Pocket in Firefox'));
  rig.ax(2, 0.8); rig.step(); rig.ax(2, 0); rig.step();
  check('the sprung stick on the guessed throttle axis was off centre once, so the guess counts as "a radio", as the report said',
    rig.im.padSummary().mapUsable === true && rig.im.stats().source === 'a radio' && rig.im.padSummary().guessNoYaw === false);
  rig.run(3504);
  check('three and a half seconds of the throttle resting on the guessed yaw axis: not yet',
    rig.im.padSummary().guessYawParked === false);
  rig.run(704);
  check('past four: the verdict', rig.im.padSummary().guessYawParked === true);
  rig.ax(3, 0);
  rig.run(1008);
  check('and it stays: a throttle moved to the middle is still a throttle', rig.im.padSummary().guessYawParked === true);
  const rep = rig.im.mapReport();
  check('a report says which axes are flown, what every one reads, and the verdicts',
    Boolean(rep) && rep.map === 'guess' && rep.axes.yaw === 3 && rep.axes.throttle === 2
    && rep.live.length === 6 && rep.live[3] === 0 && rep.usable === true && rep.yawParked === true, JSON.stringify(rep));
  rig.im.setPadChoice({ kind: 'pad', id: 'Pocket in Firefox', index: 0 });
  check('choosing the pad again starts the question over', rig.im.padSummary().guessYawParked === false);
}
{
  const rig = new Rig(makePad([0, 0, -1, 0, 0, -1], 4, 'AETR radio'));
  rig.run(10000);
  check('an AETR radio resting for ten seconds, throttle parked where it is guessed: no verdict',
    rig.im.padSummary().guessYawParked === false);
  for (let t = 0; t < 6000; t += 16) {
    rig.ax(3, (t / 16) % 2 ? 0.62 : 0.6);
    rig.step();
  }
  check('a thumb holding yaw at sixty percent for six seconds, never still to a hundredth: no verdict',
    rig.im.padSummary().guessYawParked === false);
  rig.ax(3, 1);
  rig.run(3008);
  check('full yaw against the stop for three seconds: no verdict', rig.im.padSummary().guessYawParked === false);
  rig.run(1200);
  check('for four, the one false positive, and what it earns is an offer to calibrate',
    rig.im.padSummary().guessYawParked === true);
}
{
  /* The rest is timed on the wall clock, not on the polls' dtMs, which is
   * capped at 100 ms: a page whose main thread is held up for seconds (the
   * title's world still building) polls once either side of the stall, and
   * summed from dtMs the stall counted as a tenth of a second. lint:input
   * measured one of 5.2 s make this row 5.4 s late (POLISH-PLAN item 24). */
  const rig = new Rig(makePad([0, 0, 0, -1, 0, 0], 4, 'Pocket on a slow title'));
  rig.ax(2, 0.8); rig.step(); rig.ax(2, 0); rig.step();
  rig.step(3000);
  check('a three second stall with the throttle resting on the guessed yaw axis: not yet',
    rig.im.padSummary().guessYawParked === false);
  rig.step(1500);
  check('four and a half seconds of wall across two stalls, the throttle never moved: the verdict',
    rig.im.padSummary().guessYawParked === true);
}
{
  const rig = new Rig(makePad([0, 0, 0, -1, 0, 0], 4, 'Calibrated Pocket'));
  rig.im.map = { ...rig.im.map, stored: true };
  rig.run(6000);
  check('a calibrated map is never second guessed', rig.im.padSummary().guessYawParked === false);
}

/* ------------------------------------------------------------------------
 * 5c. The radio's restart switch. bug-a25bc2dd: "As people start to grind
 *     tracks they will need ready access to a restart race hot key... can
 *     be assigned to an AUX on the radio too." One flip, one restart; the
 *     flip that assigns it is not one; a latched switch never repeats.
 * ---------------------------------------------------------------------- */
section('the restart switch');
{
  const store = memoryStorage();
  const pad = makePad([0, 0, -1, 0, 0, -1], 8, 'Restart radio');
  const rig = new Rig(pad, store);
  const im = rig.im;
  const press = (i, on) => { pad.buttons[i].pressed = on; pad.buttons[i].value = on ? 1 : 0; pad.timestamp += 1; };
  rig.run(64);
  check('nothing assigned: the row says so and no flip restarts anything',
    im.padSummary().restart === null && im.takeRestart() === false);
  press(5, true);
  rig.run(64);
  press(5, false);
  rig.run(64);
  check('a button pressed before the row was chosen is not captured', im.padSummary().restart === null);
  im.beginRestartCapture();
  rig.run(32);
  check('choosing the row listens', im.padSummary().restartCapturing === true);
  rig.ax(0, 1); rig.ax(1, -1); rig.ax(2, 1); rig.ax(3, 1);
  rig.run(64);
  rig.ax(0, 0); rig.ax(1, 0); rig.ax(2, -1); rig.ax(3, 0);
  rig.run(64);
  check('the four sticks swept end to end are not taken for the switch',
    im.padSummary().restart === null && im.padSummary().restartCapturing === true);
  press(5, true);
  rig.run(32);
  check('a button pressed while it listens is the switch, and it is kept',
    im.padSummary().restart === 'Button 5' && im.padSummary().restartCapturing === false
    && JSON.parse(store.getItem('webfpv.restart.v1')).index === 5 && im.takeRestartResult() === 'saved');
  check('and the press that assigned it is not a restart', im.takeRestart() === false);
  press(5, false);
  rig.run(32);
  check('let go: nothing', im.takeRestart() === false);
  press(5, true);
  rig.run(32);
  check('pressed again: one restart', im.takeRestart() === true);
  rig.run(500);
  check('held: no second one', im.takeRestart() === false);
  const fresh = new InputManager();
  check('a new page on the same browser has it', fresh.padSummary().restart === 'Button 5');
  im.clearRestartSwitch();
  press(5, false); rig.run(32); press(5, true); rig.run(32);
  check('forgotten, the button restarts nothing', im.padSummary().restart === null && im.takeRestart() === false
    && store.getItem('webfpv.restart.v1') === null);
}
{
  /* A two position switch that arrives as an axis, the usual AUX. */
  const pad = makePad([0, 0, -1, 0, 0, -1], 0, 'Aux radio');
  const rig = new Rig(pad);
  const im = rig.im;
  rig.run(64);
  im.beginRestartCapture();
  rig.run(32);
  rig.ax(5, 1);
  rig.run(32);
  check('an AUX switch flipped while it listens is the switch, on the side it went to',
    im.padSummary().restart === 'Switch on axis 5');
  check('and that flip is not a restart', im.takeRestart() === false);
  rig.ax(5, -1); rig.run(32);
  check('off: nothing', im.takeRestart() === false);
  rig.ax(5, 1); rig.run(32);
  check('on: one restart', im.takeRestart() === true);
  rig.run(2000);
  check('left on for two seconds: still one', im.takeRestart() === false);
  rig.ax(5, 0); rig.run(32); rig.ax(5, 1); rig.run(32);
  check('a three position switch taken to the middle and back is a flip: the middle is off',
    im.takeRestart() === true);
}
{
  /* Stored for one radio, flown with another. */
  const store = memoryStorage();
  store.setItem('webfpv.restart.v1', JSON.stringify({ id: 'Some other radio', kind: 'button', index: 2, dir: 1 }));
  const pad = makePad([0, 0, -1, 0, 0, -1], 4, 'This radio');
  const rig = new Rig(pad, store);
  rig.run(32);
  pad.buttons[2].pressed = true; pad.timestamp += 1;
  rig.run(32);
  check('a switch kept for another radio does nothing on this one',
    rig.im.padSummary().restart === null && rig.im.takeRestart() === false);
}
{
  /* On when the page loads is not a flip. */
  const store = memoryStorage();
  store.setItem('webfpv.restart.v1', JSON.stringify({ id: 'Latched radio', kind: 'axis', index: 5, dir: 1 }));
  const pad = makePad([0, 0, -1, 0, 0, 1], 0, 'Latched radio');
  const rig = new Rig(pad, store);
  rig.run(200);
  check('a switch already on when the page loads is not a restart', rig.im.takeRestart() === false);
}

{
  /* The Auto reset switch, bug-918a8c99: a switch sets the setting to its
   * position, a button toggles it, and neither disturbs the restart switch. */
  const store = memoryStorage();
  const pad = makePad([0, 0, -1, 0, 0, -1], 8, 'Auto radio');
  const rig = new Rig(pad, store);
  const im = rig.im;
  rig.run(64);
  check('auto reset: nothing assigned, nothing taken',
    im.padSummary().autoReset === null && im.takeAutoResetSwitch() === null);
  im.beginAutoResetCapture();
  rig.run(32);
  check('auto reset: choosing the row listens', im.padSummary().autoResetCapturing === true);
  rig.ax(5, 1);
  rig.run(32);
  check('auto reset: an AUX flipped while it listens is kept, and is not itself a change',
    im.padSummary().autoReset === 'Switch on axis 5' && im.takeAutoResetResult() === 'saved'
    && JSON.parse(store.getItem('webfpv.autoreset.v1')).index === 5 && im.takeAutoResetSwitch() === null
    && im.takeRestart() === false);
  rig.ax(5, -1); rig.run(32);
  check('auto reset: the switch going off reports off', im.takeAutoResetSwitch() === false);
  rig.ax(5, 1); rig.run(32);
  check('auto reset: and on reports on, once', im.takeAutoResetSwitch() === true && im.takeAutoResetSwitch() === null);
  im.clearAutoResetSwitch();
  rig.ax(5, -1); rig.run(32);
  check('auto reset: forgotten, nothing is reported and the store is empty',
    im.takeAutoResetSwitch() === null && store.getItem('webfpv.autoreset.v1') === null);
}
{
  const pad = makePad([0, 0, -1, 0, 0, -1], 8, 'Auto button radio');
  const rig = new Rig(pad);
  const im = rig.im;
  const press = (i, on) => { pad.buttons[i].pressed = on; pad.buttons[i].value = on ? 1 : 0; pad.timestamp += 1; };
  rig.run(64);
  im.beginAutoResetCapture();
  rig.run(32);
  press(3, true); rig.run(32);
  check('auto reset: a button is kept and its assigning press is not a toggle',
    im.padSummary().autoReset === 'Button 3' && im.takeAutoResetSwitch() === null);
  press(3, false); rig.run(32);
  check('auto reset: letting go is not a toggle', im.takeAutoResetSwitch() === null);
  press(3, true); rig.run(32);
  check('auto reset: a press toggles, once', im.takeAutoResetSwitch() === 'toggle' && im.takeAutoResetSwitch() === null);
}
{
  /* Left on when the page loads: the saved setting stands. */
  const store = memoryStorage();
  store.setItem('webfpv.autoreset.v1', JSON.stringify({ id: 'Latched auto radio', kind: 'axis', index: 5, dir: 1 }));
  const pad = makePad([0, 0, -1, 0, 0, 1], 0, 'Latched auto radio');
  const rig = new Rig(pad, store);
  rig.run(200);
  check('auto reset: a switch already on at page load changes nothing', rig.im.takeAutoResetSwitch() === null);
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
  /* Since 2026-10-23 the whoop flies the five inch's plant at the five
   * inch's weight (configs/airframes.js), so it reads the five inch's table:
   * its 65 cap is the five inch's 51.1. */
  check('and it follows the weight, the pack and the cap',
    hoverStickPercent(100, '5inch', 60, 4.2) === 26 && hoverStickPercent(100, '5inch', 140, 4.2) === 42.8
    && hoverStickPercent(100, '5inch', 100, 3.8) === 38.8 && hoverStickPercent(65, 'whoop65', 100, 4.2) === hoverStickPercent(65, '5inch', 100, 4.2)
    && hoverStickPercent(65, 'whoop65', 100, 4.2) === 51.1,
    [hoverStickPercent(100, '5inch', 60, 4.2), hoverStickPercent(100, '5inch', 140, 4.2),
      hoverStickPercent(100, '5inch', 100, 3.8), hoverStickPercent(65, 'whoop65', 100, 4.2)].join(' '));
  const w80 = hoverStickPercent(100, '5inch', 80, 4.2);
  check('between columns it interpolates, inside half a point of the 30.7 measured at weight 80',
    Math.abs(w80 - 30.7) <= 0.5, String(w80));
  check('the whoop reads the five inch\'s table, as it flies its plant: 35.0 at 100, and 140 reads the five inch\'s 42.8',
    hoverStickPercent(100, 'whoop65', 100, 4.2) === 35 && hoverStickPercent(100, 'whoop65', 120, 4.2) === hoverStickPercent(100, '5inch', 120, 4.2)
    && hoverStickPercent(100, 'whoop65', 140, 4.2) === 42.8,
    [hoverStickPercent(100, 'whoop65', 100, 4.2), hoverStickPercent(100, 'whoop65', 120, 4.2),
      hoverStickPercent(100, 'whoop65', 140, 4.2)].join(' '));

  /*
   * MOTOR POWER (2026-10-08). A hotter wind turns the same prop on less duty,
   * so hover sits lower on the stick by about 1 / kV, and the keyboard
   * springs to it. The stops are flightcheck's own readings (--kv=0.8 and
   * 1.2), 100 must be the table's figure exactly, and the places between are
   * what flightcheck read at 90 and 110.
   */
  check('Motor power moves hover about 1 / kV: five inch 43.8 at 80 and 29.1 at 120 against 35.0, and the whoop the same',
    hoverStickPercent(100, '5inch', 100, 4.2, 100) === 35 && hoverStickPercent(100, '5inch', 100, 4.2, 80) === 43.8
    && hoverStickPercent(100, '5inch', 100, 4.2, 120) === 29.1 && hoverStickPercent(100, 'whoop65', 100, 4.2, 100) === 35
    && hoverStickPercent(100, 'whoop65', 100, 4.2, 80) === 43.8 && hoverStickPercent(100, 'whoop65', 100, 4.2, 120) === 29.1,
    [hoverStickPercent(100, '5inch', 100, 4.2, 80), hoverStickPercent(100, '5inch', 100, 4.2, 120),
      hoverStickPercent(100, 'whoop65', 100, 4.2, 80), hoverStickPercent(100, 'whoop65', 100, 4.2, 120)].join(' '));
  const kvAgainst = [
    ['5inch', 100, 4.2, 90, 100, 39.0], ['5inch', 100, 4.2, 110, 100, 31.7],
    ['5inch', 100, 4.2, 90, 65, 57.1], ['5inch', 100, 4.2, 110, 65, 46.2], ['5inch', 100, 4.2, 110, 40, 71.8],
    ['whoop65', 100, 4.2, 90, 100, 39.0], ['whoop65', 100, 4.2, 110, 100, 31.7], ['whoop65', 100, 4.2, 110, 65, 46.2],
  ].map(([af, w, v, kv, cap, want]) => [af, kv, cap, want, hoverStickPercent(cap, af, w, v, kv)]);
  check('between the stops it follows 1 / kV, inside a quarter of a point of what flightcheck read at 90 and 110',
    kvAgainst.every(([, , , want, got]) => Math.abs(got - want) <= 0.25),
    kvAgainst.map(([af, kv, cap, want, got]) => `${af} kv${kv} cap${cap} ${want}/${got.toFixed(2)}`).join(' '));
  check('and it composes with weight and pack: the heaviest column on a tired pack is 51.6 at 100, higher at 80 and lower at 120',
    hoverStickPercent(100, '5inch', 140, 3.5, 100) === 51.6 && hoverStickPercent(100, '5inch', 140, 3.5, 120) < 51.6
    && hoverStickPercent(100, '5inch', 140, 3.5, 80) > 51.6,
    [hoverStickPercent(100, '5inch', 140, 3.5, 80), hoverStickPercent(100, '5inch', 140, 3.5, 100),
      hoverStickPercent(100, '5inch', 140, 3.5, 120)].join(' '));
  check('an airframe that is not one, Object\'s own member names included, reads the five inch',
    ['constructor', '__proto__', 'toString', 'nope'].every((af) => hoverStickPercent(100, af) === 35));
  check('outside the slider it reads the stops, and junk or nothing reads the stock figure',
    hoverStickPercent(100, '5inch', 100, 4.2, 50) === 43.8 && hoverStickPercent(100, '5inch', 100, 4.2, 200) === 29.1
    && hoverStickPercent(100, '5inch', 100, 4.2, 'x') === 35 && hoverStickPercent(100, '5inch', 100, 4.2, null) === 35
    && hoverStickPercent(100, '5inch', 100, 4.2, undefined) === 35);

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

/*
 * 12. What the flight measured, for a feel report. bug-08577148: "floppy,
 *     bounces back after a stop", and in Spanish, it falls too fast and
 *     will not give the thrust to recover, on a TBS Mambo. Its report said
 *     padHz 12, read on the results screen with the sticks at rest, and
 *     said nothing at all about how far the throttle went.
 *
 *     The menus here move the sticks at 62.5 Hz and take the throttle to
 *     the top. The flight moves them at 31.25 Hz and never takes the
 *     throttle past 52 percent. Each phase boundary falls in the middle of
 *     a 512 ms rate window, so a window that straddled one would read 47 Hz
 *     and a record that let the menus in would read 63 or say 1.0. The
 *     record has to say 31 and 0.52, while the at-send reading, idle, says
 *     0, which is what eleven of the twenty two radio feel reports open on
 *     the 24th of September said.
 */
section('what the flight measured: a feel report\'s stick path is the flight\'s, not the menu\'s');
{
  const pad = makePad([0, 0, -1, 0], 4, 'Feel radio');
  const rig = new Rig(pad);
  const im = rig.im;
  im.map = {
    roll: { axis: 0, center: 0, full: 1 },
    pitch: { axis: 1, center: 0, full: 1 },
    yaw: { axis: 3, center: 0, full: 1 },
    throttle: { axis: 2, low: -1, high: 1 },
    reverse: {},
    stored: true,
  };
  /* One refresh of the radio: every axis at once and one timestamp, the
   * way a browser hands over a HID report. */
  const report = (roll, pitch, thr, yaw) => {
    pad.axes[0] = roll;
    pad.axes[1] = pitch;
    pad.axes[2] = thr;
    pad.axes[3] = yaw;
    pad.timestamp += 1;
  };
  const menu = (steps) => {
    for (let i = 0; i < steps; i += 1) {
      report(i % 2 ? 1 : -1, 0, 1, 0);
      rig.step(16);
    }
  };
  /* Throttle axis -1, -0.5, 0.04: the channel reads 0, 0.25 and 0.52. */
  const FLOWN = [[0, 0, -1, 0], [1, 0.25, -0.5, 0.25], [0, 0.5, 0.04, 0], [-1, 0.25, -0.5, -0.25]];
  const fly = (steps) => {
    for (let i = 0; i < steps; i += 1) {
      if (i % 2 === 0) {
        report(...FLOWN[(i / 2) % FLOWN.length]);
      }
      rig.step(16);
    }
  };
  menu(48);
  check('menus alone, full throttle and all: no flight, no record', im.flightReport() === null,
    JSON.stringify(im.flightReport()));
  im.flying = true;
  fly(128);
  im.flying = false;
  menu(64);
  for (let i = 0; i < 64; i += 1) {
    rig.step(16);
  }
  const at = im.stats();
  const rec = im.flightReport();
  check('the reading at the moment of sending, sticks at rest, is 0 Hz: the old report\'s answer',
    at.padHz === 0, JSON.stringify(at));
  check('the flight\'s ceiling is its own 31 Hz: no menu window, and no window across a boundary',
    rec && rec.padHzMax === 31 && rec.source === 'a radio', JSON.stringify(rec));
  check('the throttle went from 0 to 0.52 in flight, and the menus\' full throttle is not in it',
    rec && rec.travel.throttle[0] === 0 && rec.travel.throttle[1] === 0.52, JSON.stringify(rec && rec.travel));
  check('roll, pitch and yaw are the flight\'s travel to the hundredth',
    rec && rec.travel.roll.join() === '-1,1' && rec.travel.pitch.join() === '0,0.5'
    && rec.travel.yaw.join() === '-0.25,0.25', JSON.stringify(rec && rec.travel));
  check('and it says how much flight it covers: 128 polls of 16 ms, 2.0 s', rec && rec.seconds === 2,
    JSON.stringify(rec));
  im.flying = true;
  im.harnessChannels = { roll: 0, pitch: 0, yaw: 0, throttle: 0.9 };
  rig.step(16);
  im.harnessChannels = null;
  im.flying = false;
  const other = im.flightReport();
  check('another kind of source starts a record of its own rather than lending this one its travel',
    other && other.source === 'the harness override' && other.travel.throttle.join() === '0.9,0.9',
    JSON.stringify(other));
  /* bug-e82b8bb8: filed on the keyboard after a radio flew the complaint,
   * and the radio's record was the one thrown away. */
  check('and the radio\'s record rides under it as before, whole, rather than being dropped',
    other && other.before && other.before.source === 'a radio' && other.before.padHzMax === 31
      && other.before.travel.throttle.join() === '0,0.52' && other.before.seconds === 2,
    JSON.stringify(other && other.before));
  im.flying = true;
  fly(32);
  im.flying = false;
  const kept = im.flightReport();
  im.setPadChoice({ kind: 'pad', id: pad.id, index: 0 });
  check('and a pad chosen again forgets it, beside the stick resolution',
    kept !== null && kept.source === 'a radio' && im.flightReport() === null, JSON.stringify(kept));
}

section('a standard gamepad flies its sticks in the pilot\'s mode, not the radio guess: bug-aeb29de7, bug-6c81072b, bug-585786cd');
{
  /* The Standard Gamepad layout: 0 left right, 1 left down, 2 right right,
   * 3 right down. A DualSense in Chrome, nothing saved. */
  const std = (axes = [0, 0, 0, 0]) => ({ ...makePad(axes, 17, 'DualSense Wireless Controller (STANDARD GAMEPAD)'), mapping: 'standard' });
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  {
    const pad = std();
    const rig = new Rig(pad);
    const im = rig.im;
    rig.step();
    check('nothing touched: throttle 0, every other channel 0',
      im.channels.throttle === 0 && im.channels.roll === 0 && im.channels.pitch === 0 && im.channels.yaw === 0,
      JSON.stringify(im.channels));
    rig.ax(1, -1); rig.step();
    check('Mode 2, left stick fully up: full throttle, nothing else', near(im.channels.throttle, 1) && im.channels.pitch === 0,
      JSON.stringify(im.channels));
    rig.ax(1, 0.6); rig.step();
    check('left stick below centre is idle, not negative', im.channels.throttle === 0, JSON.stringify(im.channels));
    rig.ax(1, 0); rig.ax(0, 1); rig.step();
    check('left stick right is yaw right', near(im.channels.yaw, 1) && im.channels.roll === 0, JSON.stringify(im.channels));
    rig.ax(0, 0); rig.ax(2, 1); rig.step();
    check('right stick right is roll right', near(im.channels.roll, 1) && im.channels.yaw === 0, JSON.stringify(im.channels));
    rig.ax(2, 0); rig.ax(3, 1); rig.step();
    check('right stick pulled back is pitch up', near(im.channels.pitch, 1) && im.channels.throttle === 0, JSON.stringify(im.channels));
    rig.ax(3, 0);
    check('the standard layout is usable without the wizard, and not called calibrated',
      im.mapUsable() === true && im.padSummary().calibrated === false);
    const rep = im.mapReport();
    check('a ticket says it is the standard layout, in which mode',
      rep.map === 'standard' && rep.layout === 'standard' && rep.mode === 2 && rep.axes.throttle === 1 && rep.axes.yaw === 0,
      JSON.stringify(rep));
    im.setStickMode(1);
    rig.ax(3, -1); rig.step();
    check('Mode 1, right stick fully up: full throttle', near(im.channels.throttle, 1) && im.channels.pitch === 0,
      JSON.stringify(im.channels));
    rig.ax(3, 0); rig.ax(1, 1); rig.step();
    check('Mode 1, left stick pulled back: pitch up', near(im.channels.pitch, 1) && im.channels.throttle === 0,
      JSON.stringify(im.channels));
    rig.ax(1, 0); rig.ax(2, 1); rig.step();
    check('Mode 1, right stick right is still roll', near(im.channels.roll, 1), JSON.stringify(im.channels));
    rig.ax(2, 0);
  }
  {
    /* A throttle resting at the bottom of axis 3 and a yaw nobody touches
     * are what the radio verdicts are looking for. On a pad they mean a
     * thumb, and there is no guess about the order to be wrong. */
    const pad = std([0, 0, 0, -1]);
    const rig = new Rig(pad);
    rig.run(6000);
    const sum = rig.im.padSummary();
    check('the radio guess\'s verdicts stay quiet on a standard pad',
      sum.guessYawParked === false && sum.guessNoYaw === false, JSON.stringify(sum));
  }
  {
    /* What the two DualSense reports carried: the AETR guess, saved from
     * Check sticks and called calibrated. */
    const storage = memoryStorage();
    storage.setItem('webfpv_stick_map_v1', JSON.stringify({
      roll: { axis: 0, center: 0, full: 1 },
      pitch: { axis: 1, center: 0, full: -1 },
      yaw: { axis: 3, center: 0, full: 1 },
      throttle: { axis: 2, low: -1, high: 1 },
      reverse: { roll: false, pitch: true, yaw: false, throttle: false },
    }));
    const pad = std();
    const rig = new Rig(pad, storage);
    rig.ax(1, -1); rig.step();
    check('a saved AETR guess on a standard pad is set aside: left stick up is throttle',
      near(rig.im.channels.throttle, 1) && rig.im.mapReport().map === 'standard', JSON.stringify(rig.im.channels));
    check('and storage is left as it was, for the radio it may have been right for',
      JSON.parse(storage.getItem('webfpv_stick_map_v1')).throttle.axis === 2);
    const radio = makePad([0, 0, -1, 0], 4, 'AETR radio');
    const rrig = new Rig(radio, storage);
    rrig.ax(2, 1); rrig.step();
    check('the same saved map on a radio still flies it', near(rrig.im.channels.throttle, 1)
      && rrig.im.mapReport().map === 'calibrated', JSON.stringify(rrig.im.channels));
  }
  {
    /* A pad the wizard has been through keeps exactly what the wizard
     * learned, whichever sticks the pilot chose. */
    const storage = memoryStorage();
    storage.setItem('webfpv_stick_map_v1', JSON.stringify({
      roll: { axis: 2, center: 0.004, pos: 1, neg: -1 },
      pitch: { axis: 3, center: 0.004, pos: 1, neg: -1 },
      yaw: { axis: 0, center: 0.004, pos: 1, neg: -1 },
      throttle: { axis: 1, low: 0.004, high: 1, sprung: true },
    }));
    const pad = std();
    const rig = new Rig(pad, storage);
    rig.ax(1, 1); rig.step();
    check('a wizard map on a standard pad is the pilot\'s: left stick DOWN was their throttle',
      rig.im.channels.throttle > 0.99 && rig.im.mapReport().map === 'calibrated', JSON.stringify(rig.im.channels));
  }
  {
    /* bug-aeb29de7's other half: M on the check step redrew the gimbals to
     * agree with the wrong sticks. On a draft that is the standard layout,
     * the mode moves the channels too. */
    const pad = std();
    const rig = new Rig(pad);
    const im = rig.im;
    rig.step();
    check('Check sticks opens on the standard layout', im.startCalibrationCheck()
      && im.calibration.draft.throttle.axis === 1 && im.calibration.draft.yaw.axis === 0);
    im.reverseChannel('roll');
    im.setStickMode(1);
    const d = im.calibration.draft;
    check('M moves the channels with the drawing: Mode 1 throttle on the right stick, pitch on the left',
      d.throttle.axis === 3 && d.pitch.axis === 1 && d.roll.axis === 2 && d.yaw.axis === 0, JSON.stringify(d));
    check('and a reversal the pilot made rides across', d.reverse.roll === true);
    check('saving it makes it the pilot\'s own', im.acceptCalibration() && im.map.stored === true
      && im.map.throttle.axis === 3 && im.mapReport().map === 'calibrated');
    im.setStickMode(2);
    rig.step();
    check('which the mode no longer moves: it is theirs now', im.map.throttle.axis === 3);
  }
}

section('a radio whose four axes include one that never moves: bug-338cd29b');
{
  /* The TX15's report: four axes, throttle parked, axis 3 reading 0. */
  const pad = makePad([0, 0, -1, 0], 4, 'OpenTX TX15 Joystick');
  const rig = new Rig(pad);
  rig.im.startCalibration();
  check('the centre step passes', rig.waitStep('sweep'));
  for (const [i, lo, hi] of [[0, -1, 1], [1, -1, 1], [2, -1, 1]]) {
    rig.ax(i, lo); rig.run(64); rig.ax(i, hi); rig.run(64); rig.ax(i, i === 2 ? -1 : 0); rig.run(64);
  }
  const hint = rig.view().hint;
  check('three sticks swept and the fourth axis dead: the hint names axis 3 and where to fix it',
    /Axis 3 has not moved/.test(hint) && /USB joystick/.test(hint), hint);
  const wide = makePad([0, 0, -1, 0, 0, 0], 4, 'Six axis radio');
  const wrig = new Rig(wide);
  wrig.im.startCalibration();
  wrig.waitStep('sweep');
  for (const [i, lo, hi] of [[0, -1, 1], [1, -1, 1], [2, -1, 1]]) {
    wrig.ax(i, lo); wrig.run(64); wrig.ax(i, hi); wrig.run(64); wrig.ax(i, i === 2 ? -1 : 0); wrig.run(64);
  }
  check('a radio with axes to spare keeps the plain count, since a still slider is normal',
    /Full travel on 3 of 4/.test(wrig.view().hint), wrig.view().hint);
  check('and the four axis hint names the other place a stick is lost, the browser, and the screen that tells them apart',
    /Chrome on Android/.test(hint) && /Stick help/.test(hint), hint);
}

/* ------------------------------------------------------------------------
 * 9. The stick the pilot is flying without, on any map. The owner, 28
 *    September: tickets saying a controller "can't use yaw or pitch", and
 *    no way to tell a radio set up wrong from a fault here. bug-f532d90b,
 *    a LiteRadio 2 on a phone, "doesn't detect yaw movement", is the shape:
 *    four axes, one of which never moves.
 * ---------------------------------------------------------------------- */

/* A pilot flying: roll, pitch and the throttle swept through their travel
 * over and over, for `ms` of sim time, and nothing on the axes in `still`.
 * The sweep is a triangle so every level between the ends is visited, which
 * is what a thumb does and what tells a stick from a switch. */
function flyFor(rig, ms, lay) {
  const period = 1600;
  for (let t = 0; t < ms; t += 16) {
    const ph = (t % period) / period;
    const tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
    if (lay.roll != null) {
      rig.ax(lay.roll, tri * 0.9);
    }
    if (lay.pitch != null) {
      rig.ax(lay.pitch, -tri * 0.7);
    }
    if (lay.yaw != null) {
      rig.ax(lay.yaw, tri * 0.8);
    }
    if (lay.thr != null) {
      rig.ax(lay.thr, -0.6 + (tri + 1) * 0.5);
    }
    rig.step(16);
  }
  for (const i of [lay.roll, lay.pitch, lay.yaw]) {
    if (i != null) {
      rig.ax(i, 0);
    }
  }
}

section('a channel that never moves in real flying: the dead stick verdict');
{
  /* bug-f532d90b's shape: four axes, AETR guess, and axis 3, where the
   * guess reads yaw, reading exactly 0 for the whole flight. */
  const pad = makePad([0, 0, -1, 0], 16, 'STMicroelectronics BETAFPV Joystick');
  const rig = new Rig(pad);
  const im = rig.im;
  rig.run(100);
  check('nothing judged on the title', im.padSummary().deadChannels.length === 0);
  im.flying = true;
  flyFor(rig, 19000, { roll: 0, pitch: 1, thr: 2 });
  check('nineteen seconds of flying with yaw still: not yet', im.padSummary().deadChannels.length === 0,
    JSON.stringify(im.padSummary().deadChannels));
  flyFor(rig, 1500, { roll: 0, pitch: 1, thr: 2 });
  const sum = im.padSummary();
  check('past twenty, with roll, pitch and throttle all in use: yaw is dead',
    sum.deadChannels.length === 1 && sum.deadChannels[0] === 'yaw', JSON.stringify(sum.deadChannels));
  check('and it is the only one: the three that moved are not', !sum.deadChannels.includes('roll')
    && !sum.deadChannels.includes('throttle'));
  check('a four axis pad with no mapping is reported as one, for the shell to name the platform',
    sum.fourAxes === true && sum.axisCount === 4);
  const same = im.padSummary().deadChannels;
  flyFor(rig, 500, { roll: 0, pitch: 1, thr: 2 });
  check('the list is the same array until a verdict changes, so the shell can compare it cheaply',
    im.padSummary().deadChannels === same);
  const rep = im.mapReport();
  check('a report carries it, with how long the flight watched and the button count',
    rep.check && rep.check.dead.includes('yaw') && rep.check.flownS >= 20 && rep.buttons === 16
    && rep.guess === 'aetr', JSON.stringify(rep));
  for (let k = 0; k < 4; k += 1) {
    rig.ax(3, 1); rig.step(); rig.ax(3, -1); rig.step();
  }
  rig.ax(3, 0); rig.step();
  check('a switch thrown on the yaw axis is not yaw coming back: still dead',
    im.padSummary().deadChannels.includes('yaw'));
  flyFor(rig, 1600, { roll: 0, pitch: 1, thr: 2, yaw: 3 });
  check('yaw swept like a stick: the verdict comes down', im.padSummary().deadChannels.length === 0,
    JSON.stringify(im.padSummary().deadChannels));
  flyFor(rig, 30000, { roll: 0, pitch: 1, thr: 2 });
  check('and stays down for good on this pad and map, however long yaw then rests',
    im.padSummary().deadChannels.length === 0);
  im.setPadChoice({ kind: 'pad', id: pad.id, index: 0 });
  flyFor(rig, 21000, { roll: 0, pitch: 1, thr: 2 });
  check('choosing the pad again starts the question over, and it is asked again',
    im.padSummary().deadChannels.includes('yaw'));
}
{
  const rig = new Rig(makePad([0, 0, -1, 0], 16, 'Radio on the title'));
  rig.im.flying = false;
  flyFor(rig, 30000, { roll: 0, pitch: 1, thr: 2 });
  check('the same sticks swept in a menu judge nothing: only flight counts',
    rig.im.padSummary().deadChannels.length === 0);
}
{
  const rig = new Rig(makePad([0, 0, -1, 0], 16, 'Hovering'));
  rig.im.flying = true;
  flyFor(rig, 30000, { thr: 2 });
  check('a pilot only working the throttle is not judged on the rest: two others have to be in use',
    rig.im.padSummary().deadChannels.length === 0, JSON.stringify(rig.im.padSummary().deadChannels));
}
{
  /* The throttle axis never moving: nothing leaves the pad, so it is judged
   * sooner. */
  const rig = new Rig(makePad([0, 0, 0, 0], 16, 'No throttle'));
  rig.im.flying = true;
  flyFor(rig, 7000, { roll: 0, pitch: 1, yaw: 3 });
  check('seven seconds of wiggling every other stick on the pad: not yet',
    rig.im.padSummary().deadChannels.length === 0);
  flyFor(rig, 1500, { roll: 0, pitch: 1, yaw: 3 });
  check('past eight: the throttle is dead', rig.im.padSummary().deadChannels.includes('throttle'),
    JSON.stringify(rig.im.padSummary().deadChannels));
}
{
  /* Yaw flown on A and D over a radio whose yaw never arrives. The keys are
   * laid over the pad's channel, and the pad is what is being judged. */
  const rig = new Rig(makePad([0, 0, -1, 0], 16, 'Radio and keys'));
  rig.im.flying = true;
  rig.im.keys.add('KeyD');
  flyFor(rig, 21000, { roll: 0, pitch: 1, thr: 2 });
  rig.im.keys.delete('KeyD');
  check('yaw held on the keyboard does not hide a radio whose yaw never arrives',
    rig.im.padSummary().deadChannels.includes('yaw'));
}
{
  /* A six axis radio whose yaw is on axis 4, flown on the AETR guess: the
   * flight also says where the stick went. */
  const rig = new Rig(makePad([0, 0, -1, 0, 0, -1], 12, 'Six axis radio'));
  rig.im.flying = true;
  flyFor(rig, 21000, { roll: 0, pitch: 1, thr: 2, yaw: 4 });
  const rep = rig.im.mapReport();
  check('yaw dead on axis 3 and a stick swept on axis 4: the report names axis 4 as the stray',
    rep.check.dead.includes('yaw') && rep.check.stray.length === 1 && rep.check.stray[0] === 4,
    JSON.stringify(rep.check));
  check('and a six axis pad is not the four axis shape', rig.im.padSummary().fourAxes === false);
}

section('a saved map that reads an axis this pad does not have');
{
  const storage = memoryStorage();
  storage.setItem('webfpv_stick_map_v1', JSON.stringify({
    roll: { axis: 0, center: 0, pos: 1, neg: -1 },
    pitch: { axis: 1, center: 0, pos: -1, neg: 1 },
    yaw: { axis: 5, center: 0, pos: 1, neg: -1 },
    throttle: { axis: 2, low: -1, high: 1 },
  }));
  const phone = new Rig(makePad([0, 0, -1, 0], 16, 'Same radio, on a phone'), storage);
  phone.step();
  const sum = phone.im.padSummary();
  check('yaw saved on axis 5, and this pad has four: named at once, no flying needed',
    sum.missingChannels.length === 1 && sum.missingChannels[0] === 'yaw', JSON.stringify(sum.missingChannels));
  check('and in a report', phone.im.mapReport().check.missing.includes('yaw'));
  const desk = new Rig(makePad([0, 0, -1, 0, 0, 0], 12, 'Same radio, on the desk'), storage);
  desk.step();
  check('the same map on the radio it was made on names nothing',
    desk.im.padSummary().missingChannels.length === 0);
}

section('Firefox on Linux calls an EdgeTX radio a gamepad: bug-c9423f3e, bug-9cc39ca4');
{
  /* LinuxGamepad.cpp: axes 0 to 3 are X, Y, Rx, Ry, then Z, Rz and the
   * sliders. An AETR radio: aileron, elevator, rudder, channel 5, throttle,
   * channel 6, channel 7, channel 8. The throttle is parked at the bottom
   * and channel 5 is a switch at one end. */
  const ffRadio = (id = '1209-4f54-EdgeTX Radiomaster Pocket Joystick', axes = [0, 0, 0, -1, -1, 0, 0, 0]) => ({
    ...makePad(axes, 24, id), mapping: 'standard',
  });
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  {
    const rig = new Rig(ffRadio());
    const im = rig.im;
    rig.step();
    check('nothing touched: throttle at idle, and channel 5 flies nothing',
      im.channels.throttle === 0 && im.channels.pitch === 0 && im.channels.yaw === 0, JSON.stringify(im.channels));
    rig.ax(4, 1); rig.step();
    check('throttle stick fully up: full throttle, from axis 4', near(im.channels.throttle, 1), JSON.stringify(im.channels));
    rig.ax(4, -1); rig.ax(2, 1); rig.step();
    check('rudder right: yaw right, from axis 2, not the throttle it used to be',
      near(im.channels.yaw, 1) && im.channels.throttle === 0, JSON.stringify(im.channels));
    rig.ax(2, 0); rig.ax(1, 1); rig.step();
    check('elevator: pitch, not the throttle the standard layout made it',
      Math.abs(im.channels.pitch) > 0.99 && im.channels.throttle === 0, JSON.stringify(im.channels));
    rig.ax(1, 0); rig.ax(3, 1); rig.step();
    check('channel 5 thrown: nothing, where the standard layout read it as pitch',
      im.channels.pitch === 0 && im.channels.roll === 0 && im.channels.yaw === 0, JSON.stringify(im.channels));
    rig.ax(3, -1); rig.step();
    const rep = im.mapReport();
    check('a report says it is the Firefox guess', rep.map === 'guess' && rep.guess === 'firefox'
      && rep.axes.throttle === 4 && rep.axes.yaw === 2, JSON.stringify(rep));
    check('its throttle parked at the bottom makes it usable, the way the AETR guess earns it',
      im.mapUsable() === true);
  }
  {
    const pad = { ...makePad([0, 0, 0, 0], 17, '054c-0ce6-Sony Interactive Entertainment DualSense Wireless Controller'), mapping: 'standard' };
    const rig = new Rig(pad);
    rig.step();
    check('a real gamepad in Firefox keeps the standard layout', rig.im.mapReport().guess === 'standard');
  }
  {
    const pad = { ...makePad([0, 0, 0, 0, 0, 0], 17, 'Generic USB Joystick (STANDARD GAMEPAD Vendor: 0079 Product: 0006)'), mapping: 'standard' };
    const rig = new Rig(pad);
    rig.step();
    check('a pad named Joystick in Chrome is not Firefox\'s radio: standard layout', rig.im.mapReport().guess === 'standard');
  }
  {
    const rig = new Rig(ffRadio('1209-4f54-EdgeTX Radiomaster Pocket Joystick', [0, 0, 0, 0]));
    rig.step();
    check('four axes cannot carry a throttle on axis 4: standard layout', rig.im.mapReport().guess === 'standard');
  }
  {
    /* The saved AETR guess, as two DualSense pilots saved it from Check
     * sticks, on the Firefox radio: set aside, as on any standard pad. */
    const storage = memoryStorage();
    storage.setItem('webfpv_stick_map_v1', JSON.stringify({
      roll: { axis: 0, center: 0, full: 1 },
      pitch: { axis: 1, center: 0, full: -1 },
      yaw: { axis: 3, center: 0, full: 1 },
      throttle: { axis: 2, low: -1, high: 1 },
    }));
    const rig = new Rig(ffRadio(), storage);
    rig.ax(4, 1); rig.step();
    check('a saved AETR guess on the Firefox radio is set aside for the Firefox guess',
      near(rig.im.channels.throttle, 1) && rig.im.mapReport().guess === 'firefox', JSON.stringify(rig.im.channels));
  }
  {
    const storage = memoryStorage();
    storage.setItem('webfpv_stick_map_v1', JSON.stringify({
      roll: { axis: 0, center: 0, pos: 1, neg: -1 },
      pitch: { axis: 1, center: 0, pos: -1, neg: 1 },
      yaw: { axis: 2, center: 0, pos: 1, neg: -1 },
      throttle: { axis: 4, low: -1, high: 1 },
    }));
    const rig = new Rig(ffRadio(), storage);
    rig.step();
    check('a wizard map on the Firefox radio is the pilot\'s', rig.im.mapReport().map === 'calibrated');
  }
  {
    /*
     * THE STANDARD LAYOUT, SAVED, ON A RADIO THAT IS NOT ONE: bug-52a66f69,
     * "pitch is not reaching sim". From 27 September until the Firefox guess
     * landed on the 28th this radio flew the standard layout, and Check
     * sticks opens with whatever is flying as its draft, so a pilot who
     * pressed Save there wrote the standard layout down as their own map, and
     * a saved map outranks every guess from then on. The ticket is that map
     * on a Pocket: yaw, throttle, roll and pitch on axes 0, 1, 2 and 3, with
     * pitch dead because axis 3 is channel 5. The blob is made the way the
     * pilot made it, by the real Save on a real standard gamepad.
     */
    const stdPad = () => ({
      ...makePad([0, 0, 0, 0], 17, '054c-0ce6-Sony Interactive Entertainment DualSense Wireless Controller'),
      mapping: 'standard',
    });
    const saved = (reverse) => {
      const storage = memoryStorage();
      const maker = new Rig(stdPad(), storage);
      maker.step();
      maker.im.startCalibrationCheck();
      if (reverse) {
        maker.im.reverseChannel(reverse);
      }
      if (!maker.im.acceptCalibration()) {
        throw new Error('set up: Save refused the standard draft');
      }
      return storage;
    };
    {
      const storage = saved();
      const before = storage.getItem('webfpv_stick_map_v1');
      const rig = new Rig(ffRadio(), storage);
      rig.step();
      check('nothing touched, channel 5 parked at one end: every stick at rest, no pitch from a switch',
        rig.im.channels.pitch === 0 && rig.im.channels.roll === 0 && rig.im.channels.yaw === 0
        && rig.im.channels.throttle === 0, JSON.stringify(rig.im.channels));
      check('and it is the Firefox guess that flies it, not the saved layout',
        rig.im.mapReport().guess === 'firefox', JSON.stringify(rig.im.mapReport()));
      rig.ax(4, 1); rig.step();
      check('the throttle stick fully up is full throttle, from axis 4',
        near(rig.im.channels.throttle, 1), JSON.stringify(rig.im.channels));
      /* Channel 5 centred for this one, so a pitch that is only the parked
       * switch cannot pass for the elevator. */
      rig.ax(4, -1); rig.ax(3, 0); rig.ax(1, 1); rig.step();
      check('the elevator is pitch, not the throttle the saved layout made it',
        Math.abs(rig.im.channels.pitch) > 0.99 && rig.im.channels.throttle === 0, JSON.stringify(rig.im.channels));
      rig.ax(1, 0); rig.ax(3, 1); rig.step();
      check('channel 5 thrown is nothing, where the saved layout read it as pitch',
        rig.im.channels.pitch === 0 && rig.im.channels.roll === 0 && rig.im.channels.yaw === 0, JSON.stringify(rig.im.channels));
      check('storage is left alone: the same map is right on the gamepad it was made on',
        storage.getItem('webfpv_stick_map_v1') === before);
    }
    {
      const rig = new Rig(stdPad(), saved());
      rig.step();
      check('the same saved layout on a real gamepad in Firefox is still the pilot\'s own',
        rig.im.mapReport().map === 'calibrated' && rig.im.mapReport().axes.yaw === 0);
    }
    {
      const rig = new Rig(ffRadio(), saved('yaw'));
      rig.ax(4, 1); rig.step();
      check('a reversed channel on the saved layout does not make it the pilot\'s: the axes are still wrong',
        near(rig.im.channels.throttle, 1) && rig.im.mapReport().guess === 'firefox', JSON.stringify(rig.im.channels));
    }
    {
      /* The saved layout with one axis moved is somebody's measurement. */
      const storage = saved();
      const blob = JSON.parse(storage.getItem('webfpv_stick_map_v1'));
      blob.yaw = { ...blob.yaw, axis: 2 };
      storage.setItem('webfpv_stick_map_v1', JSON.stringify(blob));
      const rig = new Rig(ffRadio(), storage);
      rig.step();
      check('a map that is no longer exactly the standard layout stays the pilot\'s',
        rig.im.mapReport().map === 'calibrated' && rig.im.mapReport().axes.yaw === 2);
    }
  }
}

section('a standard gamepad that rests like a radio');
{
  const std = (axes) => ({ ...makePad(axes, 17, 'Mystery pad (STANDARD GAMEPAD Vendor: 1234 Product: 5678)'), mapping: 'standard' });
  {
    const rig = new Rig(std([0, -1, 0, 0]));
    rig.run(3504);
    check('an axis of the standard sticks held at the stop for three and a half seconds in a menu: not yet',
      rig.im.padSummary().radioAsGamepad === false);
    rig.run(704);
    check('past four, still to a hundredth: a radio dressed as a gamepad', rig.im.padSummary().radioAsGamepad === true);
    check('and the flight map is left as it is: the verdict only offers the wizard', rig.im.mapReport().guess === 'standard');
    rig.im.startCalibrationCheck();
    check('saving a mapping answers it', rig.im.acceptCalibration() && rig.im.padSummary().radioAsGamepad === false);
  }
  {
    const rig = new Rig(std([0, -1, 0, 0]));
    rig.im.flying = true;
    rig.run(10000);
    check('full throttle held on a real gamepad in flight for ten seconds: never', rig.im.padSummary().radioAsGamepad === false);
  }
  {
    const rig = new Rig(std([0, 0, 0, 0, 1, -1]));
    rig.run(10000);
    check('extra axes resting at the ends are a gamepad\'s dials, not its sticks: never',
      rig.im.padSummary().radioAsGamepad === false);
  }
}

section('stick help: what the screen reads while the pilot moves the stick that does not work');
{
  const pad = makePad([0, 0, -1, 0, 0, -1], 12, 'Six axis radio');
  const rig = new Rig(pad);
  const im = rig.im;
  check('with nothing open there is no watch', im.stickCheck === null);
  im.startStickCheck();
  rig.step();
  let v = im.stickCheckView();
  check('open: every axis, with the channel the map reads from it',
    v.axes.length === 6 && v.axes[3].channel === 'yaw' && v.axes[2].channel === 'throttle' && v.axes[4].channel === null,
    JSON.stringify(v.axes.map((a) => a.channel)));
  check('and nothing has moved yet', v.moving === null && v.strays.length === 0 && v.moved.length === 0);
  for (const x of [0.2, 0.45, 0.7, 0.95, 0.6]) {
    rig.ax(4, x); rig.step();
  }
  v = im.stickCheckView();
  check('a stick pushed on axis 4, which nothing reads: named as moving, and as a stray',
    v.moving && v.moving.axis === 4 && v.moving.channel === null && v.strays.length === 1 && v.strays[0] === 4,
    JSON.stringify({ moving: v.moving, strays: v.strays }));
  rig.ax(4, 0); rig.step();
  for (const x of [-0.3, -0.6, -0.9, -0.5, 0.2, 0.7]) {
    rig.ax(0, x); rig.step();
  }
  v = im.stickCheckView();
  check('roll moved: named with its channel, and counted as reaching the sim',
    v.moving && v.moving.axis === 0 && v.moving.channel === 'roll' && v.moved.includes('roll'),
    JSON.stringify({ moving: v.moving, moved: v.moved }));
  for (let k = 0; k < 3; k += 1) {
    rig.ax(5, 1); rig.step(); rig.ax(5, -1); rig.step();
  }
  v = im.stickCheckView();
  check('a switch thrown on axis 5 is not a stray stick', !v.strays.includes(5), JSON.stringify(v.strays));
  im.stopStickCheck();
  rig.step();
  check('closed: the watch is gone', im.stickCheck === null && im.stickCheckView().strays.length === 0);
}

section('stick help: which machine, and what the screen says');
{
  const {
    stickPlatform, stickBrowser, stickSay, platformHelp, lostStickNotice, channelList,
    radioBlind, noRadioNotice,
  } = await import('../src/ui/stickhelp.js');
  const phoneUa = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';
  const desktopLinux = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
  check('an Android phone is Android', stickPlatform({ userAgent: phoneUa }) === 'android');
  check('the same phone asking for the desktop site, a finger for a pointer: still Android, as four of the nine phone tickets were',
    stickPlatform({ userAgent: desktopLinux, maxTouchPoints: 5, coarse: true }) === 'android');
  check('a Linux laptop with a touch screen and a touchpad is Linux',
    stickPlatform({ userAgent: desktopLinux, maxTouchPoints: 10, coarse: false }) === 'linux');
  check('Client Hints are believed over the string', stickPlatform({ userAgent: desktopLinux, uaPlatform: 'Android' }) === 'android');
  check('an iPad asking for the desktop site says Macintosh with touch points: iPad',
    stickPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15', maxTouchPoints: 5 }) === 'ios');
  check('a Mac is a Mac', stickPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15' }) === 'mac');
  check('Windows is Windows', stickPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36' }) === 'windows');
  check('Safari, Firefox and Edge are told apart for the lines that name them',
    stickBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15') === 'safari'
    && stickBrowser('Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0') === 'firefox'
    && stickBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0') === 'chromium');
  check('channels read as a sentence', channelList(['yaw']) === 'yaw' && channelList(['yaw', 'throttle']) === 'yaw and throttle'
    && channelList(['roll', 'pitch', 'yaw']) === 'roll, pitch and yaw');

  const base = {
    pad: 'Radio', axisCount: 4, axes: [], moving: null, strays: [], moved: [], dead: [], missing: [], fourAxes: false,
  };
  check('no pad: the sentence says a browser needs to see it move first', /only once something on it moves/.test(stickSay({})));
  check('a missing axis outranks everything, and names the channel and the count',
    /reads yaw from an axis this pad does not have/.test(stickSay({ ...base, missing: ['yaw'], moving: { axis: 0, channel: 'roll' } }))
    && /It has 4/.test(stickSay({ ...base, missing: ['yaw'] })));
  check('an unread axis moving like a stick: the browser has it, the sim has it on the wrong channel',
    /Axis 4 is moving like a stick/.test(stickSay({ ...base, moving: { axis: 4, channel: null }, strays: [4] })));
  check('an unread axis that moved without being a stick is offered, not diagnosed',
    /If that is the stick that is not working/.test(stickSay({ ...base, moving: { axis: 5, channel: null } })));
  check('a read axis moving is named and said to arrive',
    stickSay({ ...base, moving: { axis: 3, channel: 'yaw' } }) === 'That is yaw, on axis 3, and it is reaching the sim.');
  check('a dead channel on a phone passing four axes says what no bar moving would mean',
    /Chrome is dropping it/.test(stickSay({ ...base, dead: ['yaw'], fourAxes: true }, 'android'))
    && !/Chrome/.test(stickSay({ ...base, dead: ['yaw'], fourAxes: true }, 'windows')));
  const android = platformHelp('android', 'chromium', { fourAxes: true, axisCount: 4 });
  /* bug-8acd3b2f, bug-abaabdde, bug-b2de5239, bug-da8c8d0e: five radios on
   * phones, all four axes and yaw gone. The recipe is the one both ends' code
   * says works (see platformHelp): the missing stick on channels 5 and 6, of
   * which Chrome keeps one, in a copy of the model. */
  const androidText = android.lines.join(' ');
  check('Android: which four channels Chrome keeps, and that one of throttle and yaw is the casualty',
    /only four of a radio's channels/.test(androidText) && /channels\s+1 and 2, one of channels 3 and 4, and one of channels 5 and 6/.test(androidText)
    && /arriving as 4 axes/.test(androidText));
  check('the fix on the radio: a copy of the model, channels 5 and 6 cleared and given the missing stick, then calibrate',
    /copy of the model/.test(androidText) && /clear channels 5 and 6/.test(androidText)
    && /one line whose source is the\s+stick that does not arrive/.test(androidText)
    && /Rud for yaw, Thr for throttle/.test(androidText) && /Calibrate\s+sticks/.test(androidText));
  check('worded as untried, asking to be told, and a computer for the radios that cannot change',
    /nobody has confirmed it on a phone yet/.test(androidText) && /Report a bug/.test(androidText)
    && /DJI controller/.test(androidText) && /computer/.test(androidText));
  check('Windows: joy.cpl as the test, and not as a calibration',
    /joy\.cpl/.test(platformHelp('windows').lines.join(' ')) && /changes nothing a browser reads/.test(platformHelp('windows').lines.join(' ')));
  check('Safari on a Mac is told to try another browser first, and Chrome on a Mac is not',
    /Try Chrome, Edge or Firefox/.test(platformHelp('mac', 'safari').lines[0])
    && !/Try Chrome/.test(platformHelp('mac', 'chromium').lines.join(' ')));

  /*
   * bug-616cc604: a Safari pilot with a radio plugged in was told, by every
   * banner and by the sentence on this screen, to plug it in and move a
   * stick. Eight WebKit tickets on the board read the keyboard and 0 Hz, and
   * a Pocket pilot spent an evening on cables and a hub.
   */
  const macSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15';
  const ipadChrome = 'Mozilla/5.0 (iPad; CPU OS 18_7_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/150.0.7871.51 Mobile/15E148 Safari/604.1';
  check('the ticket\'s own machine, Safari 27 on a Mac, is a browser that does not show a radio to a page',
    stickPlatform({ userAgent: macSafari }) === 'mac' && stickBrowser(macSafari) === 'safari'
    && radioBlind(stickPlatform({ userAgent: macSafari }), stickBrowser(macSafari)) !== null);
  check('so is an iPad, in Chrome or in Safari, since both are WebKit: bug-616cc604, bug-40980a75',
    radioBlind(stickPlatform({ userAgent: ipadChrome }), stickBrowser(ipadChrome)) !== null
    && radioBlind('ios', 'safari') !== null && radioBlind('ios', 'chromium') !== null);
  check('Chrome and Firefox on a Mac are not, and neither is a Safari named browser off Apple hardware',
    radioBlind('mac', 'chromium') === null && radioBlind('mac', 'firefox') === null
    && radioBlind('linux', 'safari') === null && radioBlind('windows', 'chromium') === null
    && radioBlind('android', 'chromium') === null);
  check('every surface has words on both: banner, note, how to, sentence and a block',
    ['mac', 'ios'].every((p) => {
      const b = radioBlind(p, 'safari');
      return ['banner', 'note', 'howto', 'say'].every((k) => typeof b[k] === 'string' && b[k].length > 20)
        && Array.isArray(b.lines) && b.lines.length >= 1;
    }));
  const safariBanner = noRadioNotice('mac', 'safari', 'move');
  const iosBanner = noRadioNotice('ios', 'safari', 'reload');
  check('the banner for a browser that can show a radio is the ordinary advice, word for word',
    noRadioNotice('windows', 'chromium', 'move') === 'No radio or gamepad found.\nPlug one in, set it to joystick mode, then move it.'
    && noRadioNotice('mac', 'firefox', 'reload') === 'No radio or gamepad found.\nPlug one in, set it to joystick mode, and reload.');
  check('on Safari the banner names it and the browsers to use, and does not say plug one in',
    /Safari/.test(safariBanner) && /Chrome, Edge or Firefox/.test(safariBanner) && !/Plug one in/.test(safariBanner)
    && safariBanner === noRadioNotice('mac', 'safari', 'reload'));
  check('on an iPhone or iPad it says a computer, and does not say plug one in',
    /computer/.test(iosBanner) && !/Plug one in/.test(iosBanner));
  check('both are two lines, as the other banners are, so they fit where the others do',
    safariBanner.split('\n').length === 2 && iosBanner.split('\n').length === 2);
  check('Stick help with no pad on Safari says so and names the other browsers, and does not ask for a stick to be moved',
    /Safari is not showing this page/.test(stickSay({}, 'mac', 'safari'))
    && /Chrome, Edge or Firefox/.test(stickSay({}, 'mac', 'safari')) && !/move a stick/.test(stickSay({}, 'mac', 'safari')));
  check('and on an iPad it says a computer, not a stick',
    /computer/.test(stickSay({}, 'ios', 'safari')) && !/move a stick/.test(stickSay({}, 'ios', 'safari')));
  check('with no pad in Chrome on a Mac it is the old sentence, word for word',
    stickSay({}, 'mac', 'chromium') === stickSay({}) && /only once something on it moves/.test(stickSay({}, 'mac', 'chromium')));
  check('with a pad reading, nothing about Safari is said, whatever the browser',
    !/Safari/.test(stickSay({ ...base, moving: { axis: 3, channel: 'yaw' } }, 'mac', 'safari')));
  check('Safari on a Mac: the block says a cable is unlikely to matter and gives the test that settles it',
    /unlikely to help/.test(platformHelp('mac', 'safari').lines[0])
    && /If it shows up there, it was Safari/.test(platformHelp('mac', 'safari').lines[0]));
  const iosBlock = platformHelp('ios', 'safari').lines.join(' ');
  check('iPhone and iPad: every browser is Safari underneath, a computer is the way, and Android is offered with its catch',
    /Every browser on an iPhone or iPad is Safari underneath/.test(iosBlock) && /computer/.test(iosBlock)
    && /drops some of its axes/.test(iosBlock));
  check('the in flight banner is two short lines naming the one thing to do',
    lostStickNotice('yaw') === 'Yaw is not reaching the sim.\nPause for Stick help.');
  /* CLAUDE.md: no em or en dashes in anything a pilot reads. */
  const every = [
    stickSay({}), stickSay({ ...base }), stickSay({ ...base, missing: ['yaw', 'pitch'] }),
    stickSay({ ...base, dead: ['yaw', 'throttle'], fourAxes: true }, 'android'),
    stickSay({}, 'mac', 'safari'), stickSay({}, 'ios', 'safari'), safariBanner, iosBanner,
    ...['mac', 'ios'].flatMap((p) => Object.values(radioBlind(p, 'safari')).flat()),
    ...['android', 'windows', 'mac', 'linux', 'ios', 'chromeos', 'other'].flatMap((p) => {
      const h = platformHelp(p, p === 'mac' ? 'safari' : 'firefox', { fourAxes: true, axisCount: 4 });
      return [h.title, ...h.lines];
    }),
  ].join('\n');
  check('no em or en dash in any of it', !/[\u2013\u2014]/.test(every));
}

/*
 * bug-616cc604 and the three Safari tickets before it read the same, `source`
 * the keyboard, `padHz` 0, `map` null, and a report could not say whether the
 * browser had handed the page nothing or handed it something the page then
 * dropped. browserPads is the field that says, and every shape it can meet is
 * here: what Chrome hands over with nothing to show, what a browser hands over
 * that this page will not fly, and the browser that has no such API or throws.
 */
section('what the browser listed: a report says whether it listed anything, and what the page dropped');
{
  const POCKET = 'RadioMaster Pocket Joystick (Vendor: 1209 Product: 4f54)';
  const rig = new Rig(makePad([0, 0, -1, 0, 0, -1, 0, 0], 24, POCKET));
  const im = rig.im;
  const listing = (fn) => {
    navigator.getGamepads = fn;
    return im.browserPads();
  };

  let r = im.browserPads();
  check('a radio the browser lists and this page flies: one listed, one used, its id and shape named',
    r.api === true && r.listed === 1 && r.used === 1 && r.list.length === 1
    && r.list[0].includes(POCKET) && /no mapping, 8 axes, 24 buttons, connected$/.test(r.list[0]), JSON.stringify(r));

  r = listing(() => [null, null, null, null]);
  check('four empty slots, which is what Chrome hands over with nothing to show, read as none listed: the tickets\' own case',
    r.api === true && r.listed === 0 && r.used === 0 && r.list.length === 0 && !('threw' in r), JSON.stringify(r));
  r = listing(() => []);
  check('an empty list reads the same', r.api === true && r.listed === 0 && r.used === 0);

  const three = makePad([0, 0, 0], 4, 'A device with three axes');
  r = listing(() => [three]);
  check('a pad listed with too few axes to fly is counted as listed and not used, and its axis count is the report',
    r.listed === 1 && r.used === 0 && /3 axes/.test(r.list[0]), JSON.stringify(r));
  const off = makePad([0, 0, -1, 0, 0, -1], 4, 'A pad that is not connected');
  off.connected = false;
  r = listing(() => [off]);
  check('a pad listed but not connected is counted as listed and not used, and says so',
    r.listed === 1 && r.used === 0 && /not connected$/.test(r.list[0]), JSON.stringify(r));

  const second = makePad([0, 0, -1, 0, 0, -1], 4, 'Second slot');
  second.index = 1;
  r = listing(() => [null, second]);
  check('a pad in the second slot is found, and its slot is in the line',
    r.listed === 1 && r.used === 1 && r.list[0].startsWith('#1 Second slot'), JSON.stringify(r));

  const crowd = Array.from({ length: 6 }, (_, i) => {
    const p = makePad([0, 0, -1, 0, 0, -1], 4, `${'x'.repeat(200)}${i}`);
    p.index = i;
    return p;
  });
  r = listing(() => crowd);
  check('six pads with two hundred character ids: all six counted, four written, each id cut, the whole under 700 characters',
    r.listed === 6 && r.list.length === 4 && r.list.every((l) => l.length < 130) && JSON.stringify(r).length < 700,
    `${r.listed} listed, ${r.list.length} written, ${JSON.stringify(r).length} chars`);

  r = listing(undefined);
  check('a browser with no Gamepad API says so, which is a different answer from an empty list',
    r.api === false && r.listed === 0 && r.used === 0, JSON.stringify(r));
  r = listing(() => { throw new DOMException('not allowed', 'SecurityError'); });
  check('a browser that throws from getGamepads is reported as having thrown, and does not take the report with it',
    r.api === true && r.threw === 'SecurityError' && r.listed === 0, JSON.stringify(r));

  /* The report is read when one is sent. The frame loop never asks for it, so
   * a pilot's frames do not pay for a string per pad. */
  let asked = 0;
  const realReport = im.browserPads;
  im.browserPads = function counted(...args) {
    asked += 1;
    return realReport.apply(this, args);
  };
  navigator.getGamepads = () => [rig.pad];
  rig.run(320);
  check('twenty frames of polling never build the report', asked === 0, `${asked} calls`);
  im.browserPads = realReport;
}
installEnv(null);

/*
 * bug-2d93629e, a TX15 pilot: "When pausing a game to change setting, the
 * interface/menu is displayed for a second then the resume is automatically
 * selected or clicked and the game resumes." Reproduced in the real shell by
 * replaying what a hand does with a radio just after Escape: a release with an
 * overshoot to -0.6 resumed it at 247 ms, a bump either way at one second
 * resumed it, and a switch on button 0 or 1 did. Each was Ui.pollPad calling
 * select or back, which are both Resume on the pause menu.
 *
 * The rule under test is the pure gate in src/input/padgate.js, stepped by
 * hand at 16 ms so nothing here depends on this machine's clock. The browser
 * half, the same replays through the real pause menu, is
 * scripts/input-check.js.
 */
section('a menu opened from flight waits for the sticks and asks a roll to be held: bug-2d93629e');
{
  const {
    newPadGate, openPadGate, closePadGate, stepPadGate, padDtMs, PAD_CALM, PAD_SETTLE_MS, PAD_DWELL_MS, PAD_DT_MAX_MS,
  } = await import('../src/input/padgate.js');
  const KEYS = ['up', 'down', 'left', 'right', 'select', 'back'];
  const flags = (over = {}) => ({
    up: false, down: false, left: false, right: false, select: false, back: false, ...over,
  });
  /*
   * Drive a gate the way pollPad does: one poll per 16 ms, the edge tracker
   * seeded from the flags while the gate is closed, and an action recorded on
   * each fresh crossing once it is open. `script` is a list of [from ms,
   * flags, calm], the last one whose start has passed being the sticks now.
   */
  const drive = (gate, script, totalMs) => {
    const fired = [];
    let prev = flags();
    for (let t = 0; t < totalMs; t += 16) {
      const seg = script.filter((s) => s[0] <= t).pop() || [0, flags(), true];
      const now = { ...seg[1] };
      if (stepPadGate(gate, now, seg[2], 16)) {
        for (const k of KEYS) {
          if (now[k] && !prev[k]) {
            fired.push(`${k}@${t}`);
          }
        }
      }
      prev = now;
    }
    return fired;
  };
  const opened = () => {
    const gate = newPadGate();
    openPadGate(gate);
    return gate;
  };
  const RIGHT = flags({ right: true });
  const LEFT = flags({ left: true });

  check('the numbers are sane: a settle longer than a release and a dwell longer than a bump, both under a second',
    PAD_SETTLE_MS >= 300 && PAD_SETTLE_MS <= 1000 && PAD_DWELL_MS >= 100 && PAD_DWELL_MS <= 400
    && PAD_CALM > 0 && PAD_CALM < 0.55);

  /* The pilot is at the title: nothing about it changes. */
  let g = newPadGate();
  check('a gate that was never opened is a pass through: a fresh flick acts at once, as section 5c of lint:input needs',
    drive(g, [[0, flags(), true], [64, RIGHT, false], [80, flags(), true]], 200).join() === 'right@64');

  /* The reproduction, one profile at a time, against a menu opened from flight. */
  g = opened();
  check('a quiet radio does nothing, however long the menu is up', drive(g, [[0, flags(), true]], 5000).length === 0);
  g = opened();
  check('a roll HELD when the menu opened and let go: nothing (this one the old seeding caught)',
    drive(g, [[0, RIGHT, false], [300, flags(), true]], 3000).length === 0);
  g = opened();
  check('a release with an overshoot to the other side, which resumed the old menu at 247 ms: nothing',
    drive(g, [[0, RIGHT, false], [150, flags(), true], [230, LEFT, false], [330, flags(), true]], 3000).length === 0);
  g = opened();
  check('a bump right at one second, 80 ms long, which resumed the old menu: nothing',
    drive(g, [[0, flags(), true], [1000, RIGHT, false], [1080, flags(), true]], 3000).length === 0);
  g = opened();
  check('and a bump left, which was Back, which is Resume: nothing',
    drive(g, [[0, flags(), true], [1000, LEFT, false], [1080, flags(), true]], 3000).length === 0);
  g = opened();
  check('bumps do not add up: three of 120 ms with rest between, which together outlast the dwell, do nothing',
    drive(g, [[0, flags(), true], [1000, RIGHT, false], [1120, flags(), true], [1500, RIGHT, false], [1620, flags(), true],
      [2000, RIGHT, false], [2120, flags(), true]], 3000).length === 0);
  g = opened();
  check('a flick as long as the dwell less one poll: nothing',
    drive(g, [[0, flags(), true], [1200, RIGHT, false], [1200 + PAD_DWELL_MS - 16, flags(), true]], 3000).length === 0);

  /* And the radio still drives the menu when the pilot means it. */
  g = opened();
  const held = drive(g, [[0, flags(), true], [1200, RIGHT, false], [1800, flags(), true]], 3000);
  check('a roll right held past the dwell after the settle acts, once, however long it is held',
    held.length === 1 && held[0].startsWith('right@') && Number(held[0].slice(6)) >= 1200 + PAD_DWELL_MS - 16
    && Number(held[0].slice(6)) <= 1200 + PAD_DWELL_MS + 16, held.join());
  g = opened();
  check('and a roll left the same way, which is Back',
    drive(g, [[0, flags(), true], [1200, LEFT, false], [1800, flags(), true]], 3000).length === 1);
  g = opened();
  const early = drive(g, [[0, flags(), true], [200, RIGHT, false], [700, flags(), true]], 3000);
  check('a push made inside the settle is swallowed whole, even held past the dwell, and not delayed into an act',
    early.length === 0, early.join());
  g = opened();
  const cursor = drive(g, [[0, flags(), true], [1000, flags({ down: true }), true], [1100, flags(), true],
    [1200, flags({ up: true }), true]], 2000);
  check('the cursor is not held: up and down act on their first poll once the settle is over',
    cursor.join() === 'down@1008,up@1200', cursor.join());
  g = opened();
  const buttons = drive(g, [[0, flags(), true], [100, flags({ select: true }), true], [300, flags(), true],
    [1000, flags({ select: true }), true], [1100, flags(), true], [1200, flags({ back: true }), true]], 2000);
  check('buttons are not held either, but a press inside the settle is swallowed like the rest',
    buttons.join() === 'select@1008,back@1200', buttons.join());

  /* The settle restarts on movement, and only counts time it saw. */
  g = opened();
  const fidget = [[0, flags(), true]];
  for (let t = 200; t < 2000; t += 200) {
    fidget.push([t, flags(), false], [t + 100, flags(), true]);
  }
  fidget.push([2000, RIGHT, false], [2600, flags(), true]);
  check('a radio that never rests for the whole settle is never listened to, so a fidgeting hand cannot press anything',
    drive(g, fidget, 2600).length === 0);
  g = opened();
  stepPadGate(g, flags(), true, 400);
  check('less than the settle of quiet does not open it, however it is added up',
    stepPadGate(g, flags(), true, PAD_SETTLE_MS - 400 - 1) === false && stepPadGate(g, flags(), true, 1) === true);

  /* Where the exposed stretch begins and ends. */
  g = opened();
  drive(g, [[0, flags(), true]], 1000);
  closePadGate(g);
  check('closing the gate, back in the air or on the title, gives the instant flick back',
    drive(g, [[0, flags(), true], [64, RIGHT, false], [80, flags(), true]], 200).join() === 'right@64');
  openPadGate(g);
  check('and opening it again starts the settle from nothing',
    drive(g, [[0, RIGHT, false], [PAD_SETTLE_MS - 16, flags(), true]], PAD_SETTLE_MS + 400).length === 0);

  /* A stalled frame, a fullscreen change, a tab coming forward: a long gap is
   * not quiet the gate saw. */
  check('the time credited to one poll is clamped, and the first poll and a clock that runs backwards are credited nothing',
    padDtMs(0, 123456) === 0 && padDtMs(1000, 1016) === 16 && padDtMs(1000, 900) === 0
    && padDtMs(1000, 1000 + 5000) === PAD_DT_MAX_MS && PAD_DT_MAX_MS <= PAD_SETTLE_MS / 2);
  check('so a menu that opens into a four second stall is not settled by the stall: it is credited the clamp and no more',
    stepPadGate(opened(), flags(), true, padDtMs(1, 4001)) === false);

  /* The module is the menus' and not the physics path's, and keeps no clock. */
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(new URL('../src/input/padgate.js', import.meta.url), 'utf8');
  check('the gate reads no clock and no random: the time is handed in, so the same polls give the same answer',
    !/performance|Date\b|setTimeout|Math\.random/.test(text.replace(/\/\*[\s\S]*?\*\//g, '')));
  check('no em or en dash in it', !/[\u2013\u2014]/.test(text));
}

/*
 * bug-d1d3f4fb, a Chromebook: "keyboard doesn't work it when I press the
 * keboard it doesn't move anything". The thumb sticks mount wherever the
 * browser reports touch points, and poll() took their branch and never read a
 * key. Reproduced in the real shell with touch emulation on: W, the arrows and
 * D left every channel at 0 with the plates up, and moved them to 0.34 on the
 * same page with touch off. The comment in touchsticks.js said a touchscreen
 * laptop keeps its keyboard.
 *
 * The rule under test is InputManager.hand: a stick key takes the sticks from
 * the thumbs, a finger takes them back, and the collective is carried across
 * in both directions. The keys are put through the listeners the constructor
 * registered, so the text field bail out and the repeat guard are the real
 * ones. The browser half, with real key and touch events, is
 * scripts/input-check.js.
 */
section('a device with thumbs and keys: a stick key takes the sticks, a finger takes them back: bug-d1d3f4fb');
{
  /* One InputManager on its own window stub, a clock stepped by hand, and, when
   * asked, thumb sticks that read what they are told: a sticky throttle, and a
   * log of every level the input manager set on them. */
  const rigWith = (withThumbs) => {
    installEnv(null);
    const win = globalThis.window;
    const im = new InputManager();
    let t = performance.now();
    const run = (ms) => {
      for (let e = 0; e < ms; e += 16) {
        t += 16;
        im.poll(t);
      }
    };
    const thumbs = {
      on: true,
      ch: {
        roll: 0, pitch: 0, yaw: 0, throttle: 0,
      },
      thrSet: [],
      active() { return this.on; },
      sample() { return { ...this.ch }; },
      reset() { this.ch = { roll: 0, pitch: 0, yaw: 0, throttle: 0 }; },
      setThrottle(v) { this.thrSet.push(v); this.ch.throttle = v; },
      setStickMode() {},
    };
    if (withThumbs) {
      im.attachTouch(thumbs);
    }
    return {
      im,
      thumbs,
      run,
      down: (code, extra = {}) => win.fire('keydown', {
        code, repeat: false, target: {}, preventDefault() {}, ...extra,
      }),
      up: (code) => win.fire('keyup', { code }),
      touch: (pointerType = 'touch') => win.fire('pointerdown', { pointerType }),
    };
  };

  let r = rigWith(true);
  r.thumbs.ch.throttle = 0.6;
  r.thumbs.ch.roll = 0.3;
  r.run(64);
  check('a phone, where no key is ever pressed: the thumbs have the sticks, and it is the touch primary',
    r.im.hand === 'thumbs' && r.im.isTouchPrimary() && r.im.source === 'the touch sticks'
    && r.im.channels.throttle === 0.6 && r.im.channels.roll === 0.3, JSON.stringify(r.im.channels));

  for (const code of ['Escape', 'KeyR', 'KeyM', 'Space', 'Enter', 'KeyQ']) {
    r.down(code);
    r.up(code);
  }
  r.run(32);
  check('a key that is not a stick key (Escape, R, M, Space, Enter, Q) does not take the sticks',
    r.im.hand === 'thumbs' && r.im.isTouchPrimary(), r.im.hand);
  r.down('KeyD', { target: { tagName: 'INPUT' } });
  r.down('KeyD', { target: { isContentEditable: true } });
  r.run(32);
  check('a stick key typed into a text field does not, and is not recorded as held',
    r.im.hand === 'thumbs' && !r.im.keys.has('KeyD'), `${r.im.hand} ${[...r.im.keys]}`);
  r.down('KeyD', { repeat: true });
  r.run(32);
  check('an auto repeat with no first press behind it does not either',
    r.im.hand === 'thumbs' && !r.im.keys.has('KeyD'), r.im.hand);

  r.down('KeyD');
  r.run(400);
  check('a stick key takes the sticks: the keyboard reads, yaw moves, the thumbs are no longer the source',
    r.im.hand === 'keys' && r.im.source === 'the keyboard' && r.im.channels.yaw > 0.2
    && !r.im.isTouchPrimary() && r.im.isKeyboardPrimary(), `${r.im.hand} ${r.im.source} ${JSON.stringify(r.im.channels)}`);
  check('and nothing of the thumbs leaks through: their roll of 0.3 is not flown',
    r.im.channels.roll === 0 && r.im.channels.pitch === 0, JSON.stringify(r.im.channels));
  check('the collective is carried across: a yaw key does not drop the throttle the thumbs left at 0.6',
    r.im.channels.throttle === 0.6, String(r.im.channels.throttle));
  check('with the airborne latch set, so the keys are in the air as the thumbs were',
    r.im.kbAir === true, String(r.im.kbAir));

  r.up('KeyD');
  r.down('KeyW');
  r.run(200);
  check('and W then climbs from hover, as it does for any keyboard pilot in the air, and not up from nothing',
    r.im.channels.throttle >= r.im.kbHover - 1e-9, `${r.im.channels.throttle} vs hover ${r.im.kbHover}`);
  r.up('KeyW');
  r.run(1500);
  check('and letting go rests at the measured hover, the spring the keyboard always had',
    r.im.channels.throttle === r.im.kbHover, String(r.im.channels.throttle));

  const level = r.im.channels.throttle;
  r.touch();
  check('a finger takes the sticks back: the thumbs are the primary and were told the level the keys left',
    r.im.hand === 'thumbs' && r.im.isTouchPrimary() && r.thumbs.thrSet.length === 1 && r.thumbs.thrSet[0] === level,
    `${r.im.hand} ${JSON.stringify(r.thumbs.thrSet)} vs ${level}`);
  r.run(64);
  check('and they fly at that level, with no punch to the throttle at the change of hand',
    r.im.source === 'the touch sticks' && r.im.channels.throttle === level, `${r.im.source} ${r.im.channels.throttle}`);

  r.down('KeyD');
  r.touch();
  r.run(200);
  check('a key still held when a finger lands does not win the hand back on every poll',
    r.im.hand === 'thumbs' && r.im.source === 'the touch sticks', `${r.im.hand} ${r.im.source}`);
  r.up('KeyD');
  r.down('KeyA');
  r.run(400);
  check('and a fresh press after that takes the sticks again, the other way',
    r.im.hand === 'keys' && r.im.channels.yaw < -0.2, `${r.im.hand} ${r.im.channels.yaw}`);
  r.up('KeyA');
  r.touch('mouse');
  r.touch('pen');
  r.run(32);
  check('a mouse or a pen is not a finger: the keys keep the sticks',
    r.im.hand === 'keys' && r.im.source === 'the keyboard', r.im.hand);

  /* On the ground the level is idle, and the keys must not start in the air. */
  r = rigWith(true);
  r.im.noteLanded(true);
  r.thumbs.ch.throttle = 0.1;
  r.run(32);
  r.down('KeyD');
  r.run(64);
  check('a quad on the pad with the thumbs at 0.1: the keys take it as it is and are not marked airborne',
    r.im.kbAir === false && r.im.channels.throttle === 0.1, `${r.im.kbAir} ${r.im.channels.throttle}`);

  /* The stick mode moves the keys, and so what counts as a stick key. */
  r = rigWith(true);
  r.im.setStickMode(1);
  const modeOk = r.im.isStickKey(r.im.throttleKeys.up) && r.im.isStickKey(r.im.throttleKeys.down)
    && r.im.keyAxes.every(([, neg, pos]) => r.im.isStickKey(neg) && r.im.isStickKey(pos)) && !r.im.isStickKey('KeyQ');
  r.down(r.im.throttleKeys.up);
  check('what counts as a stick key follows the stick mode: in Mode 1 the throttle key is one, and takes the sticks',
    modeOk && r.im.hand === 'keys', `${r.im.throttleKeys.up} ${r.im.hand}`);

  /* A desktop has no thumb sticks, and nothing here may change for it. */
  r = rigWith(false);
  r.down('KeyW');
  r.touch();
  r.run(400);
  check('with no thumb sticks mounted, a desktop: a key flies the keyboard as ever and a touch event is harmless',
    r.im.hand === 'thumbs' && !r.im.isTouchPrimary() && r.im.source === 'the keyboard' && r.im.channels.throttle > 0.2,
    `${r.im.hand} ${r.im.source} ${r.im.channels.throttle}`);
}

console.log(failed ?`\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
for (const f of fails) {
  console.log(`  FAIL ${f}`);
}
process.exitCode = failed ? 1 : 0;
