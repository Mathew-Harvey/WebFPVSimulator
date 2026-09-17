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
 */
function play(radio) {
  const rest = new Array(radio.n).fill(0);
  Object.assign(rest, radio.rest || {});
  const stray = radio.stray || {};
  const at = (over) => {
    const a = rest.slice();
    Object.assign(a, stray, over);
    return a;
  };
  const reach = (name, dir) => {
    const idx = radio[name];
    const full = (radio.travel && radio.travel[name]) ?? 1;
    const over = { [idx]: rest[idx] + dir * full };
    Object.assign(over, (radio.with && radio.with[name]) || {});
    return over;
  };

  const script = [{ what: 'centre', axes: rest.slice(), ms: 1400 }];
  /* Sweep: every gimbal to both ends, the throttle up and down, then back.
   * The stray switch joins the axes from here on, because the pilot knocks
   * it during exactly this step and does not put it back. */
  for (const name of ['roll', 'pitch', 'yaw', 'thr']) {
    script.push({ what: `sweep ${name}`, axes: at(reach(name, 1)), ms: 150 });
    script.push({ what: `sweep ${name}`, axes: at(reach(name, -1)), ms: 150 });
  }
  script.push({ what: 'back to rest', axes: at({}), ms: 1000 });
  /* Identify, in the wizard's order, one named deflection each. */
  script.push({ what: 'throttle up', axes: at(reach('thr', 1)), ms: 900 });
  script.push({ what: 'throttle down', axes: at({}), ms: 900 });
  for (const name of ['roll', 'pitch', 'yaw']) {
    script.push({ what: `${name} held`, axes: at(reach(name, 1)), ms: 900 });
    script.push({ what: `${name} released`, axes: at({}), ms: 900 });
  }

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
  /* The frame worth explaining is the one where the pilot was holding the
   * stick the wizard asked for, not the one after they let go. Keep, per
   * step, the sample that was furthest from rest while that step was up. */
  let where = null;
  const reached = (step, axes) => {
    const c = im.calibration;
    if (!c || !c.rest) {
      return;
    }
    let far = 0;
    for (let i = 0; i < c.rest.length; i += 1) {
      far = Math.max(far, Math.abs((axes[i] ?? 0) - c.rest[i]));
    }
    if (!where || where.step !== c.step || far > where.far) {
      where = { step: c.step, far, axes: axes.slice(), doing: step.what };
    }
  };
  /* The pilot's hands are off at the end of the script whatever happened,
   * so the last frame is the honest answer to "is everything back". */
  let finalAxes = rest.slice();
  for (const step of script) {
    pad.axes = step.axes.slice();
    for (let t = 0; t < step.ms; t += 16) {
      if (!im.calibration) {
        break;
      }
      im.runCalibration(pad, 16);
      reached(step, step.axes);
      finalAxes = step.axes;
    }
  }
  return {
    cal: im.calibration,
    axes: where ? where.axes : rest,
    rested: finalAxes,
    doing: where ? where.doing : '',
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
];

console.log('calibration wizard, against radios that exist\n');
for (const entry of RADIOS) {
  const out = play(entry.radio);
  const reached = !out.cal || out.cal.step === 'confirm';
  check(
    entry.name,
    reached,
    reached ? '' : `wedged at ${out.cal.step}, ${whyStuck(out.cal, out.axes, out.rested)}`,
  );
}

console.log(failed ? `\n${failed} of ${passed + failed} wedged` : `\nall ${passed} passed`);
for (const f of fails) {
  console.log(`  ${f}`);
}
process.exitCode = failed ? 1 : 0;
