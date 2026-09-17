/*
 * cal-selftest.js: drive the calibration wizard with radios that exist.
 *
 * Two bug reports arrived on the same day, both filed from screen
 * "calibrate", both saying the wizard stops and never starts again.
 * SUPER6003: "when I reach YAW configuration it freezez, I can mouve the
 * sticks but YAW doesent configure". Jerome, on a BetaFPV handset: "I
 * expect a way to map but you system waits for me to move stick in postion
 * that use the 3pos switch to do".
 *
 * Neither report could be answered from what it carried, because
 * ui.bugSnapshot records the GPU, the viewport and the pack voltage and
 * nothing at all about the radio. So this file exists instead: it runs the
 * real state machine in src/input/input.js against radios described by
 * their axes, with a pilot who does exactly what each prompt says, and
 * reports which shapes reach the Check step and which wedge.
 *
 * Every radio below is one a pilot can own. A shape that cannot be
 * calibrated here cannot be calibrated at webfpv.org either, and the
 * pilot's only exit is Escape, which starts the same wizard that wedges
 * the same way.
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
 * input.js is written for a browser and reaches for four globals at
 * construction. They are stubbed rather than mocked: the wizard itself
 * reads none of them, so a stub that does nothing is the whole truth.
 */
let PADS = [];
const memory = new Map();
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = { addEventListener() {}, removeEventListener() {}, hidden: false };
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
if (!globalThis.performance) {
  globalThis.performance = { now: () => 0 };
}
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => PADS },
  configurable: true,
  writable: true,
});

const { InputManager } = await import('../src/input/input.js');

/* The wizard's own numbers, restated here only to explain a wedge. The
 * check never compares against them, so a tuned constant cannot make a
 * radio pass by moving a threshold. */
const IDENT_DELTA = 0.45;
const IDENT_GAP = 0.18;
const NEAR_REST = 0.2;

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
  fails.push(`${what}${detail ? `  (${detail})` : ''}`);
  console.log(`  FAIL  ${what}${detail ? `  ${detail}` : ''}`);
}

/*
 * A RADIO, described the way the Gamepad API would report it.
 *
 *   n         how many axes it reports
 *   roll pitch yaw thr   which axis index carries each gimbal
 *   rest      where each axis sits when nothing is touched
 *   travel    how far a gimbal reaches, in raw axis units either side
 *   with      axes that move whenever the named gimbal moves, and by how
 *             much: a mirrored channel, or a gate that is not square
 *   stray     a switch the pilot knocked during the sweep and left there
 *   also      a second gimbal the pilot moves at the same time, which is
 *             how a diagonal is described
 *
 * AND A PILOT, who is closed loop rather than on a stopwatch.
 *
 * The first draft of this file held each deflection for a fixed 900 ms and
 * then moved on, which is not what a person does. Somebody told "hold it
 * there" by a screen that is not responding holds it there, and keeps
 * holding, and that difference decides whether a wizard that needs a
 * moment to resolve something looks broken or looks slow. So the pilot
 * here watches the step and reacts to it, and the only numbers left are
 * how long they are willing to wait before giving up, which is the thing
 * being measured.
 */
const PATIENCE_MS = 6000;
const TICK_MS = 16;

function play(radio) {
  const rest = new Array(radio.n).fill(0);
  Object.assign(rest, radio.rest || {});
  const stray = radio.stray || {};
  let knocked = {};
  const frame = (over) => {
    const a = rest.slice();
    Object.assign(a, knocked, over);
    return a;
  };
  /*
   * A deflection goes TOWARD THE STOP, not rest plus a constant. Written
   * the naive way, a throttle resting at -1 with a travel of 1 reached 0,
   * so half the throttle range was never swept and the recorded low came
   * out at -2, outside anything a Gamepad can report. Nothing noticed
   * until the centre assertion below went in. An axis runs -1 to 1, travel
   * is the fraction of the distance to the stop that this gimbal actually
   * covers, and endpoint trim is travel below 1.
   */
  const reach = (name, dir) => {
    const idx = radio[name];
    const full = (radio.travel && radio.travel[name]) ?? 1;
    const to = dir > 0
      ? rest[idx] + (1 - rest[idx]) * full
      : rest[idx] - (rest[idx] + 1) * full;
    const over = { [idx]: to };
    Object.assign(over, (radio.with && radio.with[name]) || {});
    if (dir > 0) {
      Object.assign(over, (radio.also && radio.also[name]) || {});
    }
    return over;
  };

  const pad = {
    index: 0,
    id: radio.id || 'Test Radio',
    connected: true,
    mapping: '',
    axes: rest.slice(),
    buttons: new Array(radio.buttons ?? 4).fill({ pressed: false, value: 0 }),
  };
  PADS = [pad];
  const im = new InputManager();
  im.startCalibration();

  /* The furthest from rest this step has seen, kept for the explanation,
   * and the last hands off frame, kept for the same reason. */
  let held = rest.slice();
  let heldWhy = '';
  let heldFar = -1;
  let hands = rest.slice();
  let seenStep = '';

  const tick = (axes) => {
    pad.axes = axes.slice();
    im.runCalibration(pad, TICK_MS);
    const c = im.calibration;
    if (!c) {
      return null;
    }
    if (c.step !== seenStep) {
      seenStep = c.step;
      heldFar = -1;
    }
    if (c.rest) {
      let far = 0;
      for (let i = 0; i < c.rest.length; i += 1) {
        far = Math.max(far, Math.abs((axes[i] ?? 0) - c.rest[i]));
      }
      if (far > heldFar) {
        heldFar = far;
        held = axes.slice();
        /* And the wizard's reason from THIS frame, the one where the pilot
         * was pushing hardest. Read from the hands off tail instead it
         * always says "nothing has moved", which is true and useless: the
         * sentence worth judging is the one a pilot sees while holding. */
        heldWhy = c.why;
      }
    }
    return c.step;
  };

  /* Centre, then the sweep, then each channel in whatever order the wizard
   * asks for it. The pilot never looks at the step list, only at the step
   * they are on, exactly like somebody reading the screen. */
  const until = (want, act) => {
    for (let t = 0; t < PATIENCE_MS; t += TICK_MS) {
      const axes = act(t);
      hands = axes;
      const step = tick(axes);
      if (step === null || !want(step)) {
        return true;
      }
    }
    return false;
  };

  until((step) => step === 'center', () => frame({}));

  /* The sweep: everything to both ends and back, twice, and then the
   * pilot STOPS and watches the screen. That last part matters. A pilot
   * who keeps waggling forever never gives the wizard a quiet moment to
   * end the step on, and an earlier draft of this file did exactly that
   * and then read the resulting stall as a bug in the wizard. The stray
   * switch is knocked on the first pass and left. */
  const order = ['roll', 'pitch', 'yaw', 'thr'];
  const SLOT_MS = 150;
  const PASSES = 2;
  const waggleMs = order.length * 2 * SLOT_MS * PASSES;
  until((step) => step === 'sweep', (t) => {
    knocked = stray;
    if (t >= waggleMs) {
      return frame({});
    }
    const slot = Math.floor(t / SLOT_MS) % (order.length * 2);
    return frame(reach(order[Math.floor(slot / 2)], slot % 2 === 0 ? 1 : -1));
  });

  /* Each identify step, held until the wizard reacts. A release is the
   * pilot letting go, which is the same frame every time. */
  const asked = { throttle: 'thr', roll: 'roll', pitch: 'pitch', yaw: 'yaw' };
  for (let n = 0; n < 6; n += 1) {
    const c = im.calibration;
    if (!c || c.step === 'confirm') {
      break;
    }
    /* The menu switch, asked for only of a radio reporting no buttons at
     * all. The pilot throws the switch the radio description nominates. */
    const throwIt = c.step === 'select' && Number.isInteger(radio.menu)
      ? { [radio.menu]: rest[radio.menu] === 1 ? -1 : 1 }
      : null;
    const name = asked[c.step];
    if (!name && !throwIt) {
      break;
    }
    const was = c.step;
    const ok = until((step) => step === was, () => {
      const live = im.calibration;
      if (live && live.phase === 'release') {
        return frame({});
      }
      return frame(throwIt || reach(name, 1));
    });
    if (!ok) {
      break;
    }
  }
  /* Hands off at the end whatever happened, so the sweep explanation is
   * judged the way the pilot would judge it. */
  until(() => false, () => frame({}));

  return {
    cal: im.calibration,
    draft: im.calibration ? im.calibration.draft : null,
    trueRest: rest.slice(),
    axes: held,
    why: heldWhy,
    rested: hands,
  };
}

/*
 * Why a wedged wizard is wedged, read off its own state rather than
 * guessed. The wizard shows the pilot none of this, which is the other
 * half of both reports: it does not say it is stuck, so it looks frozen.
 */
function whyStuck(cal, axes, rested) {
  const rest = cal.rest || [];
  const delta = (i) => Math.abs((axes[i] ?? 0) - (rest[i] ?? 0));
  if (cal.step === 'center') {
    return 'the reading never held still';
  }
  if (cal.step === 'sweep') {
    /* Judged with the pilot's hands off, because the sweep's own gate is
     * that every axis has come back, and a gimbal at full throw is not the
     * thing holding it open. */
    let worst = 0;
    for (let i = 1; i < rest.length; i += 1) {
      if (Math.abs(rested[i] - rest[i]) > Math.abs(rested[worst] - rest[worst])) {
        worst = i;
      }
    }
    const off = Math.abs(rested[worst] - rest[worst]);
    return `with the sticks down, axis ${worst} still sits ${off.toFixed(2)} from its rest, `
      + `so nothing is ever within ${NEAR_REST} of centre and the sweep never ends`;
  }
  const used = new Set(['throttle', 'roll', 'pitch', 'yaw', 'select']
    .map((k) => cal.draft[k])
    .filter((spec) => spec && Number.isInteger(spec.axis))
    .map((spec) => spec.axis));
  const free = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (!used.has(i)) {
      free.push({ i, d: delta(i) });
    }
  }
  free.sort((a, b) => b.d - a.d);
  const best = free[0] || { i: -1, d: 0 };
  const second = free[1] || { d: 0 };
  if (!free.length) {
    return 'every axis this radio reports is already assigned';
  }
  if (best.d < IDENT_DELTA) {
    return `the furthest free axis moved ${best.d.toFixed(2)}, under the ${IDENT_DELTA} `
      + 'a channel has to travel to be identified';
  }
  if (best.d - second.d < IDENT_GAP) {
    return `axis ${best.i} moved ${best.d.toFixed(2)} and axis ${free[1].i} moved `
      + `${second.d.toFixed(2)} with it, a gap of ${(best.d - second.d).toFixed(2)} `
      + `under the ${IDENT_GAP} the wizard needs to tell them apart`;
  }
  return `stuck in the ${cal.phase} phase`;
}

/*
 * THE CONTRACT. Every radio here has to reach the Check step.
 *
 * Not one of them is exotic. Four axes and four gimbals is the baseline.
 * Eight axes is any EdgeTX handset in joystick mode. A switch left off its
 * detent is what happens when a pilot reads "move everything" and does. A
 * gimbal that does not reach the raw stop is endpoint trim. An aux that
 * moves with a gimbal is a mirrored channel or a gate that is not square.
 * A throttle on a three position switch is the radio Jerome plugged in.
 */
const RADIOS = [
  {
    name: 'four axes, AETR, throttle resting low',
    radio: { n: 4, roll: 0, pitch: 1, thr: 2, yaw: 3, rest: { 2: -1 } },
  },
  {
    name: 'eight axes, switches left where they rest',
    radio: {
      n: 8, roll: 0, pitch: 1, thr: 2, yaw: 3,
      rest: { 2: -1, 4: -1, 5: -1, 6: -1, 7: -1 },
    },
  },
  {
    name: 'eight axes, a three position switch left on its middle detent',
    radio: {
      n: 8, roll: 0, pitch: 1, thr: 2, yaw: 3,
      rest: { 2: -1, 4: -1, 5: -1, 6: -1, 7: -1 },
      stray: { 5: 0 },
    },
  },
  {
    name: 'eight axes, an arm switch flicked and left up',
    radio: {
      n: 8, roll: 0, pitch: 1, thr: 2, yaw: 3,
      rest: { 2: -1, 4: -1, 5: -1, 6: -1, 7: -1 },
      stray: { 5: 1 },
    },
  },
  {
    name: 'yaw trimmed to 40 percent of raw travel',
    radio: {
      n: 4, roll: 0, pitch: 1, thr: 2, yaw: 3, rest: { 2: -1 },
      travel: { yaw: 0.4 },
    },
  },
  {
    name: 'yaw mirrored onto a second axis',
    radio: {
      n: 6, roll: 0, pitch: 1, thr: 2, yaw: 3, rest: { 2: -1 },
      with: { yaw: { 4: 1 } },
    },
    /* The two axes carry the same channel, so either one flies. */
    wants: { roll: [0], pitch: [1], yaw: [3, 4], throttle: [2] },
  },
  {
    name: 'a left gate that is not square, so yaw right drags an aux',
    radio: {
      n: 6, roll: 0, pitch: 1, thr: 2, yaw: 3, rest: { 2: -1 },
      with: { yaw: { 4: 0.9 } },
    },
  },
  {
    name: 'throttle on a three position switch, returned to its bottom detent',
    radio: { n: 6, roll: 0, pitch: 1, thr: 2, yaw: 3, rest: { 2: -1, 4: -1, 5: -1 } },
  },
  /*
   * The two the gap rule exists for. A pilot asked for full right who also
   * pulls back is describing a diagonal, and the wizard must still come
   * out with roll on the roll axis. The loose one resolves on the gap
   * alone. The corner is a genuine tie on deflection, and is the case the
   * ambiguity escape has to get right rather than merely survive.
   */
  {
    /* Every switch arrives as an axis and there is nothing to press, so the
     * wizard asks for one channel to BE the button. See SELECT_STEP. */
    name: 'a radio reporting no buttons at all, which must name a menu switch',
    radio: {
      n: 6, roll: 0, pitch: 1, thr: 2, yaw: 3, menu: 4,
      rest: { 2: -1, 4: -1, 5: -1 }, buttons: 0,
    },
    wants: {
      roll: [0], pitch: [1], yaw: [3], throttle: [2], select: [4],
    },
  },
  {
    /* A gimbal that does not spring back to exactly where it started. The
     * sweep must keep its real centre rather than taking the drift as one,
     * which is the hazard that comes with letting a knocked switch
     * through. */
    name: 'a gimbal that springs back 0.05 short of where it started',
    radio: {
      n: 4, roll: 0, pitch: 1, thr: 2, yaw: 3, rest: { 2: -1 },
      stray: { 0: 0.05 },
    },
  },
  {
    name: 'a loose diagonal, full right and 70 percent back',
    radio: {
      n: 4, roll: 0, pitch: 1, thr: 2, yaw: 3, rest: { 2: -1 },
      also: { roll: { 1: 0.7 } },
    },
  },
  {
    name: 'a full corner, right and back to both stops',
    radio: {
      n: 4, roll: 0, pitch: 1, thr: 2, yaw: 3, rest: { 2: -1 },
      also: { roll: { 1: 1 } },
    },
  },
];

/*
 * Reaching the Check step is not the contract. A wizard that gives up and
 * assigns whatever moved would reach it every time and hand the pilot a
 * quad that rolls when they yaw, so what each channel LANDED ON is checked
 * too. A channel may list more than one acceptable axis only where the
 * radio genuinely reports it twice, and then either is right.
 */
/*
 * THE ONE THAT STILL CANNOT BE CALIBRATED, AND MUST SAY SO.
 *
 * An axis whose whole travel is under IDENT_FLOOR is not distinguishable
 * from a noisy one that is sitting still, and no amount of cleverness here
 * changes that: the radio is not sending enough to tell. The wizard is
 * allowed to stop. What it is not allowed to do is stop SILENTLY, which is
 * the behaviour both reports described. So the contract for this one is
 * the sentence, not the outcome.
 */
console.log('calibration wizard, against radios that exist\n');
{
  const out = play({
    n: 4, roll: 0, pitch: 1, thr: 2, yaw: 3, rest: { 2: -1 },
    travel: { yaw: 0.2 },
  });
  const cal = out.cal;
  const stuck = cal && cal.step === 'yaw';
  const said = Boolean(out.why && out.why.includes('Axis 3'));
  check(
    'a yaw with 0.2 of travel stops the wizard, and the wizard says why',
    stuck && said,
    stuck ? `said ${JSON.stringify(out.why)}` : `went to ${cal ? cal.step : 'confirm'}`,
  );
  console.log(`        the pilot is told: ${JSON.stringify(out.why)}`);
}

for (const entry of RADIOS) {
  const out = play(entry.radio);
  if (out.cal && out.cal.step !== 'confirm') {
    check(entry.name, false, `wedged at ${out.cal.step}, ${whyStuck(out.cal, out.axes, out.rested)}`);
    continue;
  }
  const want = entry.wants || {
    roll: [entry.radio.roll],
    pitch: [entry.radio.pitch],
    yaw: [entry.radio.yaw],
    throttle: [entry.radio.thr],
  };
  const wrong = [];
  for (const [channel, allowed] of Object.entries(want)) {
    const got = out.draft && out.draft[channel];
    const axis = got && Number.isInteger(got.axis) ? got.axis : -1;
    if (!allowed.includes(axis)) {
      wrong.push(`${channel} landed on axis ${axis}, wanted ${allowed.join(' or ')}`);
      continue;
    }
    /*
     * And it has to be centred where the stick actually rests. The sweep
     * takes its settled reading as this radio's rest, which is what lets a
     * knocked switch through, and the price of getting that wrong is a
     * gimbal centred off centre: a quad that slides sideways with the
     * sticks untouched. Worth asserting rather than hoping.
     */
    if (channel === 'select' || axis < 0) {
      continue;
    }
    const truth = out.trueRest[axis];
    const centre = channel === 'throttle' ? got.low : got.center;
    if (Math.abs(centre - truth) > 0.1) {
      wrong.push(`${channel} centred at ${centre.toFixed(2)}, but axis ${axis} rests at ${truth}`);
    }
  }
  check(entry.name, wrong.length === 0, wrong.join('; '));
}

console.log(failed ? `\n${failed} of ${passed + failed} wedged` : `\nall ${passed} passed`);
for (const f of fails) {
  console.log(`  ${f}`);
}
process.exitCode = failed ? 1 : 0;
