/*
 * input.js: stick input for the shell.
 *
 * Sources, in priority order:
 *   1. A radio or controller in joystick mode via the Gamepad API. The
 *      first pad in navigator.getGamepads() is the OS order, which on
 *      Windows follows the Game Controllers list and is not something a
 *      pilot can rearrange without unplugging. Settings, Choose joystick
 *      and the boot/hotplug picker learn which device they meant by a
 *      wiggle, then store id plus index. Axis order and polarity still
 *      differ per radio, so a calibration wizard (Settings, Calibrate
 *      sticks) learns the mapping the usual way: centre, full range, then
 *      one named deflection per channel with a return to rest between
 *      each, then a live check before anything is saved. Until calibrated
 *      a common AETR guess is used for flight, and menu navigation falls
 *      back to any axis at all, so the wizard is always reachable.
 *   2. Keyboard: WASD plus arrows mimic a Mode 2 radio. A/D are yaw,
 *      arrows are the right stick: up arrow pushes the stick forward
 *      (nose down), left and right arrows roll. Rate limited so it is
 *      flyable. W/S are a collective, not a latched slider: a radio
 *      throttle is analog and stays where the stick is, a key is digital
 *      and cannot. Hold time is the analog: a tap is a nudge, a longer
 *      hold moves the stick further, a long hold opens to full, and
 *      letting go springs back (to centre on the right stick, to hover
 *      on throttle once airborne). A connected radio keeps its own
 *      analog throttle.
 *
 * Channels are the sim_abi.h convention: roll +1 right, pitch +1 nose up
 * (stick pulled back), yaw +1 nose right, throttle 0..1.
 *
 * Every change is queued as a sample stamped with performance.now(); the
 * main loop maps those wall timestamps onto the simulated clock and the
 * module consumes them by timestamp, per STAGE1.md. WebHID raw report
 * input arrives in a later turn; joystick mode radios are gamepads and
 * take this path.
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

const STORE_KEY = 'webfpv_stick_map_v1';
const PAD_STORE_KEY = 'webfpv.pad.v1';

const DEFAULT_MAP = {
  /* AETR axis order, up and right positive, throttle low at -1. */
  roll: { axis: 0, center: 0, full: 1 },
  pitch: { axis: 1, center: 0, full: -1 },
  yaw: { axis: 3, center: 0, full: 1 },
  throttle: { axis: 2, low: -1, high: 1 },
};

export const CAL_STEPS = ['center', 'sweep', 'throttle', 'roll', 'pitch', 'yaw', 'confirm'];

/* How far a stick has to leave centre to count as a menu keypress. Shared
 * with main.js padNav, which used to spell it out four more times. */
export const NAV_DEFLECT = 0.55;
const IDENT_CHANNELS = ['throttle', 'roll', 'pitch', 'yaw'];

const CAL = {
  REST_MS: 900,
  REST_NOISE: 0.08,
  SWEEP_TRAVEL: 0.55,
  NEAR_REST: 0.2,
  SWEEP_REST_MS: 450,
  IDENT_DELTA: 0.45,
  IDENT_GAP: 0.18,
  IDENT_HOLD_MS: 400,
  RELEASE_MS: 280,
};

const PAD_PICK = {
  WIGGLE: 0.34,
  WIGGLE_MS: 160,
  IGNORE_MS: 450,
};

function cloneMap(map) {
  return {
    roll: { ...map.roll },
    pitch: { ...map.pitch },
    yaw: { ...map.yaw },
    throttle: { ...map.throttle },
    stored: Boolean(map.stored),
  };
}

function snapshotAxes(gp) {
  const n = Math.min(gp.axes.length, 8);
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = gp.axes[i];
  }
  return out;
}

function listGamepads() {
  const out = [];
  const list = typeof navigator !== 'undefined' && navigator.getGamepads
    ? navigator.getGamepads()
    : [];
  for (let i = 0; i < list.length; i += 1) {
    const gp = list[i];
    if (gp && gp.connected && gp.axes && gp.axes.length >= 4) {
      out.push(gp);
    }
  }
  return out;
}

function padKey(gp) {
  return `${gp.index}\0${gp.id || ''}`;
}

function shortPadName(id) {
  let name = String(id || 'Joystick').replace(/\s+/g, ' ').trim();
  name = name.replace(/\s*\(Vendor:.*$/i, '').trim();
  if (name.length < 4) {
    name = String(id || 'Joystick').trim() || 'Joystick';
  }
  if (name.length > 44) {
    return `${name.slice(0, 42)}...`;
  }
  return name;
}

function loadPadChoice() {
  try {
    const raw = JSON.parse(localStorage.getItem(PAD_STORE_KEY) || 'null');
    if (raw && raw.kind === 'none') {
      return { kind: 'none' };
    }
    if (raw && raw.kind === 'pad' && typeof raw.id === 'string' && Number.isInteger(raw.index)) {
      return { kind: 'pad', id: raw.id, index: raw.index };
    }
  } catch (e) {
    /* Private mode or a corrupt blob: fly the old first-pad rule. */
  }
  return { kind: 'auto' };
}

function savePadChoice(choice) {
  try {
    if (!choice || choice.kind === 'auto') {
      localStorage.removeItem(PAD_STORE_KEY);
      return;
    }
    if (choice.kind === 'none') {
      localStorage.setItem(PAD_STORE_KEY, JSON.stringify({ kind: 'none' }));
      return;
    }
    localStorage.setItem(PAD_STORE_KEY, JSON.stringify({
      kind: 'pad',
      id: choice.id,
      index: choice.index,
    }));
  } catch (e) {
    /* private mode */
  }
}

function maxAbsDelta(axes, rest) {
  return maxAbsDeltaExcept(axes, rest, -1);
}

function maxAbsDeltaExcept(axes, rest, except) {
  let worst = 0;
  const n = Math.min(axes.length, rest.length);
  for (let i = 0; i < n; i += 1) {
    if (i === except) {
      continue;
    }
    const d = Math.abs(axes[i] - rest[i]);
    if (d > worst) {
      worst = d;
    }
  }
  return worst;
}

function expandRange(min, max, axes) {
  const n = Math.min(axes.length, min.length);
  for (let i = 0; i < n; i += 1) {
    if (axes[i] < min[i]) {
      min[i] = axes[i];
    }
    if (axes[i] > max[i]) {
      max[i] = axes[i];
    }
  }
}

function travelCount(min, max, threshold) {
  let n = 0;
  for (let i = 0; i < min.length; i += 1) {
    if (max[i] - min[i] >= threshold) {
      n += 1;
    }
  }
  return n;
}

function usedAxes(draft) {
  const used = new Set();
  for (const ch of IDENT_CHANNELS) {
    const spec = draft[ch];
    if (spec && Number.isInteger(spec.axis)) {
      used.add(spec.axis);
    }
  }
  return used;
}

function pickUnusedAxis(axes, rest, used) {
  let best = -1;
  let bestAbs = 0;
  let secondAbs = 0;
  const n = Math.min(axes.length, rest.length);
  for (let i = 0; i < n; i += 1) {
    if (used.has(i)) {
      continue;
    }
    const a = Math.abs(axes[i] - rest[i]);
    if (a > bestAbs) {
      secondAbs = bestAbs;
      bestAbs = a;
      best = i;
    } else if (a > secondAbs) {
      secondAbs = a;
    }
  }
  return { best, bestAbs, secondAbs };
}

function channelSpec(axis, rest, sample, min, max) {
  const towardHigh = sample >= rest;
  return {
    axis,
    center: rest,
    pos: towardHigh ? max[axis] : min[axis],
    neg: towardHigh ? min[axis] : max[axis],
  };
}

function throttleSpec(axis, rest, sample, min, max) {
  const towardHigh = sample >= rest;
  return {
    axis,
    low: towardHigh ? min[axis] : max[axis],
    high: towardHigh ? max[axis] : min[axis],
  };
}

/*
 * Map a raw axis onto -1..1. pos is the raw value that means +1 on the
 * channel, neg is -1. Legacy maps store `full` as (pos - center) instead.
 */
function mapCentered(v, spec) {
  const center = spec.center;
  const pos = spec.pos != null ? spec.pos : center + (spec.full || 1);
  const neg = spec.neg != null ? spec.neg : center - (pos - center);
  if (v >= center) {
    const top = pos > center ? pos : neg;
    const sign = pos > center ? 1 : -1;
    return sign * (v - center) / ((top - center) || 1);
  }
  const bot = pos < center ? pos : neg;
  const sign = pos < center ? 1 : -1;
  return sign * (center - v) / ((center - bot) || 1);
}

function calTitle(c) {
  return {
    center: 'Centre',
    sweep: 'Full range',
    throttle: 'Throttle',
    roll: 'Roll',
    pitch: 'Pitch',
    yaw: 'Yaw',
    confirm: 'Check',
  }[c.step] || '';
}

function calPrompt(c) {
  if (c.step === 'center') {
    return 'Both sticks in the centre. Throttle all the way down. Hold still.';
  }
  if (c.step === 'sweep') {
    return 'Move both sticks through every corner, and the throttle up and down, then put them back.';
  }
  if (c.step === 'confirm') {
    return 'Move the sticks. Left is yaw and throttle, right is roll and pitch.';
  }
  if (c.phase === 'release') {
    return {
      throttle: 'Now put the throttle all the way back down.',
      roll: 'Let the right stick come back to the centre.',
      pitch: 'Let the right stick come back to the centre.',
      yaw: 'Let the left stick come back to the centre.',
    }[c.step] || 'Return to rest.';
  }
  return {
    throttle: 'Push the throttle all the way up and hold it.',
    roll: 'Hold the right stick fully to the right.',
    pitch: 'Pull the right stick fully back, toward you.',
    yaw: 'Hold the left stick fully to the right.',
  }[c.step] || '';
}

function calHint(c, travelled, need, gp) {
  if (!gp) {
    return 'Radio disconnected. Plug it back in, joystick mode.';
  }
  if (c.step === 'center') {
    return 'Waiting until the reading is steady.';
  }
  if (c.step === 'sweep') {
    return travelled < need
      ? `Keep going. Full travel on ${travelled} of ${need} axes so far.`
      : 'Back to rest to continue.';
  }
  if (c.step === 'confirm') {
    return 'Enter or Save mapping keeps it. Escape cancels.';
  }
  if (c.phase === 'release') {
    return 'One direction at a time. Diagonals are ignored.';
  }
  return 'Hold it there. Diagonals are ignored.';
}

const KEY_AXES = [
  /* channel, negative key, positive key */
  ['roll', 'ArrowLeft', 'ArrowRight'],
  ['pitch', 'ArrowUp', 'ArrowDown'], /* up arrow = stick forward = nose down = negative */
  ['yaw', 'KeyA', 'KeyD'],
];

/*
 * HOLD TIME TO STICK, which is the only analog a key can offer.
 *
 * RATE_UP of 9 reached full deflection in 110 ms, so a tap and a punch
 * were the same input. A radio stick can sit at 30 percent for a whole
 * straight. A key cannot: holding it used to run away to the stop.
 *
 * analogMag(heldMs) is the stick travel while the key is down:
 *   tap     ~90 ms  -> 0.16  a nudge, then spring back on release
 *   hold    240 ms  -> 0.34  a flyable cruise, and it STAYS there
 *   stretch 750 ms  still cruise, so a gate does not become a punch
 *   full   1250 ms  -> 1.00  committed, only a long hold
 *
 * Release springs to rest. Throttle rest is hover once airborne, else 0.
 * Hitch protection is on the hold clock (40 ms), not on a per-frame
 * stick step: the mag comes from time, so a slow frame cannot skip the
 * nudge band the way RATE_UP * 100 ms used to.
 */
function analogMag(heldMs) {
  const TAP_MS = 90;
  const TAP = 0.16;
  const CRUISE_MS = 240;
  const CRUISE = 0.34;
  const STRETCH_MS = 750;
  const FULL_MS = 1250;
  if (heldMs <= 0) {
    return 0;
  }
  if (heldMs <= TAP_MS) {
    return TAP * (heldMs / TAP_MS);
  }
  if (heldMs <= CRUISE_MS) {
    const u = (heldMs - TAP_MS) / (CRUISE_MS - TAP_MS);
    return TAP + (CRUISE - TAP) * u;
  }
  if (heldMs <= STRETCH_MS) {
    return CRUISE;
  }
  if (heldMs >= FULL_MS) {
    return 1;
  }
  const u = (heldMs - STRETCH_MS) / (FULL_MS - STRETCH_MS);
  return CRUISE + (1 - CRUISE) * u;
}

export class InputManager {
  constructor() {
    this.channels = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    this.queue = [];
    this.source = 'the keyboard';
    this.keys = new Set();
    this.kb = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    /* Keyboard collective, used only when no radio is the stick source.
     * kbAir: W has taken us off the pad and S has not yet parked us.
     * kbThrFromKeys: W or S actually drove throttle this session, so a
     * harness poke via __stick is left alone instead of sprung. */
    this.kbAir = false;
    this.kbThrFromKeys = false;
    this.kbHoldMs = { roll: 0, pitch: 0, yaw: 0, w: 0, s: 0 };
    this.kbHoldDir = { roll: 0, pitch: 0, yaw: 0 };
    this.map = this.loadMap();
    this.padChoice = loadPadChoice();
    this.padPick = null;
    this.padPickQueued = null;
    this.padPickResult = null;
    this.seenPadKeys = new Set();
    this.padWasPresent = false;
    this.calibration = null;
    this.calResult = null;
    this.lastWall = performance.now();
    this.padArmed = false; /* set once the pad's menu buttons are seen released */
    this.navRest = null;   /* axis rest values, for uncalibrated menu nav */
    this.onKey = null; /* main.js hooks non stick keys here; (code, repeat) */

    /*
     * STICK RATE, AND WHY IT IS NOT THE FRAME RATE ANY MORE.
     *
     * poll() used to be called once per rendered frame and main.js used the
     * newest sample for every RC frame in that render frame. At 60 fps the
     * flight controller therefore saw the same stick value four times and
     * then a jump, while updateRcRefreshRate told it the link was 250 Hz.
     * Two things follow, and the second is the one a pilot feels.
     *
     * Betaflight auto-tunes its rc smoothing cutoffs from the interval it
     * measures, so it filtered for a 250 Hz link and the 60 Hz staircase
     * walked through it. And feedforward is the DERIVATIVE of the setpoint
     * between rc frames, so it saw zero, zero, zero, spike: an impulse train
     * at frame rate instead of a signal. Feedforward is most of what makes a
     * quad feel connected to your thumb.
     *
     * So the pad is polled on its own timer now, independent of
     * requestAnimationFrame, and every sample carries the wall clock time it
     * was taken at. main.js maps those onto the RC grid by timestamp.
     *
     * Whether that actually yields fresher data is a property of the browser
     * and the device, not something this file can assert, so it is MEASURED:
     * padHz counts how often the Gamepad object's own timestamp changes, and
     * sampleHz counts what reaches the queue. If padHz sits at the frame rate
     * the browser is rAF-locked and only WebHID will fix it.
     */
    this.timer = null;
    this.padStamp = -1;
    this.padUpdates = 0;
    this.samplesTaken = 0;
    this.rateWindowMs = 0;
    this.padHz = 0;
    this.sampleHz = 0;

    window.addEventListener('keydown', (e) => {
      /*
       * A text field owns its own keys. This listener is on the window and
       * the fields below it (the pilot name, the course name, the board
       * address, the FC dump) do not stop propagation for anything but
       * Enter and Escape, so without this bail out the preventDefault below
       * ate the space bar: a pilot could not type a space in their own name,
       * and the arrows could not move the caret. Sticks are not flown from a
       * text box, so swallowing the whole event here is right.
       */
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return;
      }
      if (!e.repeat) {
        this.keys.add(e.code);
      }
      if (this.onKey) {
        this.onKey(e.code, e.repeat);
      }
      /* Repeats must preventDefault too. Skipping them used to let ArrowDown
       * scroll the menu while the cursor stayed put, then a synthetic
       * mousemove snapped the highlight back to the row under the mouse. */
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.seedPadRoster();
  }

  loadMap() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        return cloneMap({ ...DEFAULT_MAP, ...JSON.parse(raw), stored: true });
      }
    } catch {
      /* fall through to default */
    }
    return cloneMap({ ...DEFAULT_MAP, stored: false });
  }

  saveMap() {
    this.map.stored = true;
    localStorage.setItem(STORE_KEY, JSON.stringify(this.map));
  }

  firstGamepad() {
    const pads = listGamepads();
    if (!pads.length) {
      return null;
    }
    const choice = this.padChoice;
    if (choice && choice.kind === 'none') {
      return null;
    }
    if (choice && choice.kind === 'pad') {
      const exact = this.matchPad(pads, choice);
      if (exact) {
        return exact;
      }
      return null;
    }
    return pads[0];
  }

  matchPad(pads, choice) {
    if (!choice || choice.kind !== 'pad') {
      return null;
    }
    for (let i = 0; i < pads.length; i += 1) {
      if (pads[i].id === choice.id && pads[i].index === choice.index) {
        return pads[i];
      }
    }
    const sameId = [];
    for (let i = 0; i < pads.length; i += 1) {
      if (pads[i].id === choice.id) {
        sameId.push(pads[i]);
      }
    }
    return sameId.length === 1 ? sameId[0] : null;
  }

  setPadChoice(choice) {
    this.padChoice = choice;
    savePadChoice(choice);
    this.navRest = null;
    this.padArmed = false;
  }

  seedPadRoster() {
    const pads = listGamepads();
    this.seenPadKeys = new Set(pads.map(padKey));
    this.padWasPresent = Boolean(this.matchPad(pads, this.padChoice));
    if (pads.length >= 2) {
      this.padPickQueued = 'boot';
      return;
    }
    if (pads.length === 1 && !this.matchPad(pads, this.padChoice)) {
      this.setPadChoice({ kind: 'pad', id: pads[0].id, index: pads[0].index });
      this.padWasPresent = true;
    }
  }

  /*
   * Chrome often hides a pad until something on it moves, and Windows can
   * reorder the Game Controllers list on a replug, so the roster is polled
   * rather than trusted to gamepadconnected. A new key in the list is a
   * device the picker has not seen this session.
   */
  notePadRoster() {
    const pads = listGamepads();
    const nowKeys = new Set(pads.map(padKey));
    let added = 0;
    nowKeys.forEach((k) => {
      if (!this.seenPadKeys.has(k)) {
        added += 1;
      }
    });
    const prevCount = this.seenPadKeys.size;
    this.seenPadKeys = nowKeys;
    if (this.padPick) {
      return;
    }
    if (added > 0 && pads.length >= 2) {
      this.padPickQueued = prevCount === 0 ? 'boot' : 'hotplug';
      return;
    }
    if (added > 0 && pads.length === 1 && !this.matchPad(pads, this.padChoice)) {
      this.setPadChoice({ kind: 'pad', id: pads[0].id, index: pads[0].index });
    }
    if (this.padChoice && this.padChoice.kind === 'pad') {
      const found = this.matchPad(pads, this.padChoice);
      if (found) {
        this.padWasPresent = true;
      } else if (this.padWasPresent && pads.length >= 1) {
        this.padWasPresent = false;
        this.padPickQueued = this.padPickQueued || 'missing';
      } else {
        this.padWasPresent = false;
      }
    }
  }

  takePadPickQueue() {
    const reason = this.padPickQueued;
    this.padPickQueued = null;
    return reason;
  }

  requestPadPick(reason) {
    if (this.padPick) {
      return;
    }
    this.padPickQueued = reason || 'menu';
  }

  startPadPick(reason) {
    const pads = listGamepads();
    if (!pads.length) {
      return false;
    }
    this.padPick = {
      reason: reason || 'menu',
      phase: 'wiggle',
      candidateKey: null,
      blockedKey: null,
      ignoreUntil: 0,
      holdMs: 0,
      rest: new Map(),
      armed: false,
    };
    this.padPickResult = null;
    this.snapshotPadRests(pads);
    return true;
  }

  snapshotPadRests(pads) {
    const p = this.padPick;
    if (!p) {
      return;
    }
    const live = pads || listGamepads();
    const keep = new Set();
    for (let i = 0; i < live.length; i += 1) {
      const gp = live[i];
      const key = padKey(gp);
      keep.add(key);
      if (!p.rest.has(key) || p.rest.get(key).length !== Math.min(gp.axes.length, 8)) {
        p.rest.set(key, snapshotAxes(gp));
      }
    }
    p.rest.forEach((v, key) => {
      if (!keep.has(key)) {
        p.rest.delete(key);
        if (p.candidateKey === key) {
          p.phase = 'wiggle';
          p.candidateKey = null;
          p.holdMs = 0;
          p.armed = false;
        }
      }
    });
  }

  cancelPadPick() {
    this.padPick = null;
    this.padPickResult = 'cancelled';
  }

  skipPadPick() {
    this.setPadChoice({ kind: 'none' });
    this.padWasPresent = false;
    this.padPick = null;
    this.padPickResult = 'skipped';
  }

  acceptPadPick() {
    const p = this.padPick;
    if (!p || p.phase !== 'confirm' || !p.candidateKey) {
      return false;
    }
    const pads = listGamepads();
    const gp = pads.find((g) => padKey(g) === p.candidateKey);
    if (!gp) {
      return false;
    }
    this.setPadChoice({ kind: 'pad', id: gp.id, index: gp.index });
    this.padWasPresent = true;
    this.padPick = null;
    this.padPickResult = 'accepted';
    return true;
  }

  rejectPadPick() {
    const p = this.padPick;
    if (!p) {
      return;
    }
    const blocked = p.candidateKey;
    p.phase = 'wiggle';
    p.candidateKey = null;
    p.holdMs = 0;
    p.armed = false;
    p.blockedKey = blocked;
    p.ignoreUntil = performance.now() + PAD_PICK.IGNORE_MS;
    this.snapshotPadRests();
  }

  padPickView() {
    const p = this.padPick;
    if (!p) {
      return null;
    }
    const pads = listGamepads();
    this.snapshotPadRests(pads);
    const now = performance.now();
    const cards = [];
    for (let i = 0; i < pads.length; i += 1) {
      const gp = pads[i];
      const key = padKey(gp);
      const rest = p.rest.get(key) || snapshotAxes(gp);
      const motion = maxAbsDelta(snapshotAxes(gp), rest);
      const axes = [0, 0, 0, 0];
      for (let a = 0; a < 4; a += 1) {
        axes[a] = gp.axes[a] || 0;
      }
      cards.push({
        key,
        title: `Joystick ${i + 1}`,
        name: shortPadName(gp.id),
        motion,
        live: motion >= PAD_PICK.WIGGLE,
        chosen: p.candidateKey === key,
        axes,
      });
    }
    const chosen = cards.find((c) => c.chosen) || null;
    let prompt = 'Move the joystick you want to fly with.';
    let hint = 'Each box is one plugged-in device. The one you move lights up.';
    if (!cards.length) {
      prompt = 'No joystick found.';
      hint = 'Plug one in, set it to joystick mode, then move it.';
    } else if (p.phase === 'confirm' && chosen) {
      prompt = `Use ${chosen.title}?`;
      hint = 'Yes keeps it. No waits for another wiggle.';
    }
    const skipLabel = p.reason === 'menu' ? 'Cancel' : 'Use keyboard instead';
    return {
      phase: p.phase,
      reason: p.reason,
      prompt,
      hint,
      canAccept: p.phase === 'confirm' && Boolean(chosen),
      skipLabel,
      cooling: now < p.ignoreUntil,
      pads: cards,
    };
  }

  runPadPick(dtMs) {
    const p = this.padPick;
    if (!p) {
      return;
    }
    const pads = listGamepads();
    this.snapshotPadRests(pads);
    const now = performance.now();
    if (p.phase === 'confirm') {
      const gp = pads.find((g) => padKey(g) === p.candidateKey);
      if (!gp) {
        this.rejectPadPick();
        return;
      }
      const at = (i) => Boolean(gp.buttons && gp.buttons[i] && gp.buttons[i].pressed);
      const b = [at(0), at(1), at(2), at(3)];
      const any = b.some(Boolean);
      if (!p.armed) {
        if (!any) {
          p.armed = true;
        }
        return;
      }
      if (b[1]) {
        this.rejectPadPick();
        return;
      }
      if (b[0] || b[2] || b[3]) {
        this.acceptPadPick();
      }
      return;
    }
    if (now < p.ignoreUntil) {
      p.holdMs = 0;
      return;
    }
    let best = null;
    let bestMotion = 0;
    for (let i = 0; i < pads.length; i += 1) {
      const gp = pads[i];
      const key = padKey(gp);
      const rest = p.rest.get(key);
      if (!rest) {
        continue;
      }
      const motion = maxAbsDelta(snapshotAxes(gp), rest);
      if (p.blockedKey && key === p.blockedKey) {
        if (motion < PAD_PICK.WIGGLE) {
          p.blockedKey = null;
        } else {
          continue;
        }
      }
      if (motion > bestMotion) {
        bestMotion = motion;
        best = key;
      }
    }
    if (!best || bestMotion < PAD_PICK.WIGGLE) {
      p.holdMs = 0;
      return;
    }
    p.holdMs += dtMs;
    if (p.holdMs < PAD_PICK.WIGGLE_MS) {
      return;
    }
    p.phase = 'confirm';
    p.candidateKey = best;
    p.holdMs = 0;
    p.armed = false;
  }

  padSummary() {
    const pads = listGamepads();
    const selected = this.firstGamepad();
    let using = 'Keyboard';
    if (selected) {
      const n = pads.findIndex((g) => g.index === selected.index && g.id === selected.id) + 1;
      using = n > 0 ? `Joystick ${n}, ${shortPadName(selected.id)}` : shortPadName(selected.id);
    } else if (this.padChoice && this.padChoice.kind === 'none') {
      using = 'Keyboard';
    }
    return {
      count: pads.length,
      using,
    };
  }

  /*
   * Menu buttons on the first gamepad: index 1 goes back, indices 0, 2
   * and 3 select. Not every button, because a radio in joystick mode
   * reports its switches as buttons and a latched arming switch reads as
   * pressed forever: counting every button made a latched switch fire the
   * first menu item before the player saw the title.
   *
   * Nothing counts until the pad has been seen with both buttons
   * released, for the same reason.
   */
  padMenuButtons() {
    const gp = this.firstGamepad();
    if (!gp || !gp.buttons) {
      /* Disarm as well as bail. The release guard below only runs once per
       * arming, so a pad that goes away and comes back with a latched
       * switch still held would have kept the arming it earned before it
       * was unplugged, and fired the first menu item on sight. */
      this.padArmed = false;
      return { select: false, back: false };
    }
    const at = (i) => Boolean(gp.buttons[i] && gp.buttons[i].pressed);
    const b = [at(0), at(1), at(2), at(3)];
    if (!this.padArmed) {
      if (!b.some(Boolean)) {
        this.padArmed = true;
      }
      return { select: false, back: false };
    }
    /* Button 1 goes back, the rest select. A radio's switches land
     * anywhere in this range, so more than one selects; the release guard
     * above is what makes that safe. */
    return { select: b[0] || b[2] || b[3], back: b[1] };
  }

  /*
   * Cursor movement for a radio whose axis order is not known yet.
   *
   * Menu navigation cannot depend on calibration, because the way to
   * calibrate is a menu item: if the AETR guess is wrong the cursor will
   * not move and the fix is unreachable by the only device that needs
   * it. So while uncalibrated, ANY axis pushed away from where it rested
   * at page load moves the cursor, and the sign of that excursion is the
   * direction. It cannot tell pitch from roll without calibration, and it
   * does not need to.
   */
  navRaw() {
    const gp = this.firstGamepad();
    if (!gp) {
      /* Forget where the sticks rested. A different radio with the same
       * axis count would otherwise be measured against the last one's
       * resting position and read as permanently deflected. */
      this.navRest = null;
      return { up: false, down: false };
    }
    const axes = gp.axes;
    if (!this.navRest || this.navRest.length !== axes.length) {
      this.navRest = Array.from(axes);
      return { up: false, down: false };
    }
    let worst = 0;
    for (let i = 0; i < axes.length; i += 1) {
      const d = axes[i] - this.navRest[i];
      if (Math.abs(d) > Math.abs(worst)) {
        worst = d;
      }
    }
    return { up: worst > 0.55, down: worst < -0.55 };
  }

  /*
   * Calibration wizard. Standard radio / gamepad procedure, not a five
   * sentence overlay:
   *
   *   1. Centre: both gimbals still, throttle at the bottom, until the
   *      reading is steady. That snapshot is rest.
   *   2. Full range: move every stick through its travel, then return to
   *      rest. That records min and max per axis, both ends, so a lopsided
   *      gimbal still reaches +1 and -1.
   *   3. Identify: one named deflection per channel. The wizard will not
   *      take the next channel until every axis is back at rest, which is
   *      the thing the old overlay skipped: throttle is not spring centred,
   *      so holding it up and immediately asking for roll assigned all four
   *      channels to the throttle axis.
   *   4. Check: live Mode 2 gimbals from the draft map. Nothing is written
   *      to localStorage until this is accepted.
   *
   * The in-memory flight map is left alone until accept, so cancelling
   * mid-wizard cannot leave a half mapping in the sticks.
   */
  startCalibration() {
    this.calResult = null;
    this.calibration = {
      step: 'center',
      phase: 'hold',
      holdMs: 0,
      rest: null,
      restGuess: null,
      min: null,
      max: null,
      waiting: false,
      draft: { roll: null, pitch: null, yaw: null, throttle: null },
    };
  }

  cancelCalibration() {
    this.calibration = null;
    this.calResult = 'cancelled';
  }

  acceptCalibration() {
    const c = this.calibration;
    if (!c || c.step !== 'confirm') {
      return false;
    }
    if (!c.draft.roll || !c.draft.pitch || !c.draft.yaw || !c.draft.throttle) {
      return false;
    }
    this.map = cloneMap({ ...c.draft, stored: true });
    this.saveMap();
    this.calibration = null;
    this.calResult = 'saved';
    return true;
  }

  calibrationView() {
    const c = this.calibration;
    if (!c) {
      return null;
    }
    const stepIndex = Math.max(0, CAL_STEPS.indexOf(c.step));
    const travelled = c.min && c.max ? travelCount(c.min, c.max, CAL.SWEEP_TRAVEL) : 0;
    const need = c.min ? Math.min(4, c.min.length) : 4;
    const gp = this.firstGamepad();
    let channels = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    if (gp) {
      if (c.step === 'center' || c.step === 'sweep') {
        channels = this.readGamepad(gp, DEFAULT_MAP);
      } else {
        channels = this.readGamepad(gp, c.draft);
      }
    }
    return {
      step: c.step,
      phase: c.phase,
      stepIndex,
      stepCount: CAL_STEPS.length,
      waiting: Boolean(c.waiting) || !gp,
      travelled,
      need,
      canSave: c.step === 'confirm',
      channels,
      title: calTitle(c),
      prompt: calPrompt(c),
      hint: calHint(c, travelled, need, gp),
    };
  }

  runCalibration(gp, dtMs) {
    const c = this.calibration;
    if (!gp) {
      c.waiting = true;
      return;
    }
    c.waiting = false;
    const axes = snapshotAxes(gp);
    if (c.rest) {
      expandRange(c.min, c.max, axes);
    }
    if (c.step === 'center') {
      this.calCenter(c, axes, dtMs);
      return;
    }
    if (c.step === 'sweep') {
      this.calSweep(c, axes, dtMs);
      return;
    }
    if (IDENT_CHANNELS.includes(c.step)) {
      this.calIdentify(c, axes, dtMs);
    }
  }

  calCenter(c, axes, dtMs) {
    if (!c.restGuess || c.restGuess.length !== axes.length) {
      c.restGuess = axes.slice();
      c.holdMs = 0;
      return;
    }
    if (maxAbsDelta(axes, c.restGuess) > CAL.REST_NOISE) {
      c.restGuess = axes.slice();
      c.holdMs = 0;
      return;
    }
    c.holdMs += dtMs;
    if (c.holdMs < CAL.REST_MS) {
      return;
    }
    c.rest = c.restGuess.slice();
    c.min = c.rest.slice();
    c.max = c.rest.slice();
    c.step = 'sweep';
    c.holdMs = 0;
  }

  calSweep(c, axes, dtMs) {
    const need = Math.min(4, c.min.length);
    const travelled = travelCount(c.min, c.max, CAL.SWEEP_TRAVEL);
    const settled = maxAbsDelta(axes, c.rest) < CAL.NEAR_REST;
    if (travelled < need || !settled) {
      c.holdMs = 0;
      return;
    }
    c.holdMs += dtMs;
    if (c.holdMs < CAL.SWEEP_REST_MS) {
      return;
    }
    c.step = 'throttle';
    c.phase = 'hold';
    c.holdMs = 0;
  }

  calIdentify(c, axes, dtMs) {
    const channel = c.step;
    if (c.phase === 'hold') {
      const pick = pickUnusedAxis(axes, c.rest, usedAxes(c.draft));
      const unique = pick.bestAbs - pick.secondAbs >= CAL.IDENT_GAP;
      if (pick.best < 0 || pick.bestAbs < CAL.IDENT_DELTA || !unique) {
        c.holdMs = 0;
        return;
      }
      c.holdMs += dtMs;
      if (c.holdMs < CAL.IDENT_HOLD_MS) {
        return;
      }
      const sample = axes[pick.best];
      const rest = c.rest[pick.best];
      if (channel === 'throttle') {
        c.draft.throttle = throttleSpec(pick.best, rest, sample, c.min, c.max);
      } else {
        c.draft[channel] = channelSpec(pick.best, rest, sample, c.min, c.max);
      }
      c.phase = 'release';
      c.holdMs = 0;
      return;
    }
    const spec = c.draft[channel];
    const others = maxAbsDeltaExcept(axes, c.rest, spec ? spec.axis : -1);
    let parked = others <= CAL.NEAR_REST;
    if (parked && spec) {
      const v = axes[spec.axis];
      if (channel === 'throttle') {
        parked = Math.abs(v - spec.low) <= CAL.NEAR_REST
          || Math.abs(v - c.rest[spec.axis]) <= CAL.NEAR_REST;
      } else {
        parked = Math.abs(v - c.rest[spec.axis]) <= CAL.NEAR_REST;
      }
    }
    if (!parked) {
      c.holdMs = 0;
      return;
    }
    c.holdMs += dtMs;
    if (c.holdMs < CAL.RELEASE_MS) {
      return;
    }
    const next = CAL_STEPS[CAL_STEPS.indexOf(c.step) + 1] || 'confirm';
    c.step = next;
    c.phase = 'hold';
    c.holdMs = 0;
  }

  readGamepad(gp, map = this.map) {
    const ax = (i) => (i < gp.axes.length ? gp.axes[i] : 0);
    const dead = (v) => (Math.abs(v) < 0.012 ? 0 : v);
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const m = map;
    const norm = (spec) => {
      if (!spec || !Number.isInteger(spec.axis)) {
        return 0;
      }
      return dead(clamp(mapCentered(ax(spec.axis), spec)));
    };
    let throttle = 0;
    if (m.throttle && Number.isInteger(m.throttle.axis)) {
      const t = (ax(m.throttle.axis) - m.throttle.low) / ((m.throttle.high - m.throttle.low) || 1);
      throttle = Math.max(0, Math.min(1, t));
    }
    return {
      roll: norm(m.roll),
      pitch: norm(m.pitch),
      yaw: norm(m.yaw),
      throttle,
    };
  }

  readKeyboard(dtMs, springThr = false) {
    const dt = dtMs / 1000;
    const RATE_DOWN = 9.0;   /* return to rest per second */
    const THR_RATE = 0.9;    /* latched throttle travel per second, radio overlay only */
    const THR_SPRING = 2.6;
    /*
     * A CAP ON WHAT ONE FRAME CAN DO, and it is what makes the keyboard
     * playable on a slow machine.
     *
     * The rates above are per second, and poll() clamps a frame to 100 ms, so
     * at 10 frames per second or worse the smallest possible keypress moved the
     * stick 0.9 of full deflection. A pilot measured what that costs: 0.9 stick
     * is worth about 74 ms of full stick, which throws the craft more than a
     * metre off line, and a regulation gate's whole budget is 0.572 m either
     * side. The keyboard was a coin flip on exactly the hardware this project
     * is built for.
     *
     * Hold-time analog does not integrate RATE_UP any more, so a hitch cannot
     * skip the nudge band. The cap still applies to the spring back, and the
     * hold clock itself advances by at most 40 ms per poll.
     */
    const MAX_STEP = 0.18;
    const dtHold = Math.min(dtMs, 40);
    const step = (rate) => Math.min(rate * dt, MAX_STEP);
    for (const [ch, negKey, posKey] of KEY_AXES) {
      const want = (this.keys.has(posKey) ? 1 : 0) - (this.keys.has(negKey) ? 1 : 0);
      if (want === 0) {
        this.kbHoldMs[ch] = 0;
        this.kbHoldDir[ch] = 0;
        const cur = this.kb[ch];
        if (cur > 0) {
          this.kb[ch] = Math.max(0, cur - step(RATE_DOWN));
        } else if (cur < 0) {
          this.kb[ch] = Math.min(0, cur + step(RATE_DOWN));
        }
      } else {
        if (this.kbHoldDir[ch] !== want) {
          this.kbHoldMs[ch] = 0;
          this.kbHoldDir[ch] = want;
        }
        this.kbHoldMs[ch] += dtHold;
        this.kb[ch] = want * analogMag(this.kbHoldMs[ch]);
      }
    }
    const w = this.keys.has('KeyW');
    const s = this.keys.has('KeyS');
    if (!springThr) {
      const thrWant = (w ? 1 : 0) - (s ? 1 : 0);
      this.kb.throttle = Math.max(0, Math.min(1, this.kb.throttle + thrWant * step(THR_RATE)));
      return { ...this.kb };
    }
    this.applyKeyboardCollective(dtHold, w, s, step(THR_SPRING));
    return { ...this.kb };
  }

  /*
   * KEYBOARD COLLECTIVE, same analog as the other keys.
   *
   * W is left-stick forward on a Mode 2 radio: a tap nudges throttle up,
   * a hold climbs, a long hold punches. S is the other way. Rest is 0
   * on the pad. Once throttle has actually left the pad, rest becomes
   * hover so letting go holds height instead of dropping it. kbAir is
   * latched on release, not while W is held, so the first takeoff does
   * not jump from "mag from zero" to "mag from hover" mid-press.
   *
   * Only the keyboard-as-primary path calls this. A radio keeps analog
   * latch. __stick and a reset clear the flags so a written throttle is
   * not sprung out from under them.
   */
  applyKeyboardCollective(dtHold, w, s, springStep) {
    const HOVER = 0.22; /* a hair over measured hover 0.2051, so level holds */
    const LIFTOFF = 0.18;

    if (w && !s) {
      this.kbThrFromKeys = true;
      this.kbHoldMs.w += dtHold;
      this.kbHoldMs.s = 0;
      const mag = analogMag(this.kbHoldMs.w);
      this.kb.throttle = this.kbAir ? HOVER + mag * (1 - HOVER) : mag;
    } else if (s && !w) {
      this.kbThrFromKeys = true;
      this.kbHoldMs.s += dtHold;
      this.kbHoldMs.w = 0;
      const mag = analogMag(this.kbHoldMs.s);
      const rest = this.kbAir ? HOVER : 0;
      this.kb.throttle = rest * (1 - mag);
      if (this.kb.throttle <= 0.04) {
        this.kbAir = false;
        this.kb.throttle = 0;
      }
    } else {
      if (w && s) {
        this.kbThrFromKeys = true;
      }
      if (this.kbHoldMs.w > 0 && this.kb.throttle >= LIFTOFF) {
        this.kbAir = true;
      }
      this.kbHoldMs.w = 0;
      this.kbHoldMs.s = 0;
      if (!this.kbThrFromKeys) {
        return;
      }
      const target = this.kbAir ? HOVER : 0;
      if (this.kb.throttle < target) {
        this.kb.throttle = Math.min(target, this.kb.throttle + springStep);
      } else if (this.kb.throttle > target) {
        this.kb.throttle = Math.max(target, this.kb.throttle - springStep);
      }
    }
  }

  /* Zero the sticks and the collective so a reset or a harness poke
   * cannot be sprung toward hover on the next poll. */
  resetKeyboardSticks() {
    this.kb.roll = 0;
    this.kb.pitch = 0;
    this.kb.yaw = 0;
    this.kb.throttle = 0;
    this.kbAir = false;
    this.kbThrFromKeys = false;
    this.kbHoldMs = { roll: 0, pitch: 0, yaw: 0, w: 0, s: 0 };
    this.kbHoldDir = { roll: 0, pitch: 0, yaw: 0 };
  }

  /* Called once per animation frame. Emits one timestamped sample when
   * anything changed, plus a heartbeat sample every 100 ms. */
  poll(nowWall) {
    const dtMs = Math.min(nowWall - this.lastWall, 100);
    this.lastWall = nowWall;

    const gp = this.firstGamepad();
    this.notePadRoster();
    /* The Gamepad object's own timestamp is the only honest statement of when
     * the browser last refreshed it. Counting its changes is how we find out
     * whether polling faster than the frame rate buys anything at all. */
    if (gp && gp.timestamp !== this.padStamp) {
      this.padStamp = gp.timestamp;
      this.padUpdates += 1;
    }
    this.rateWindowMs += dtMs;
    if (this.rateWindowMs >= 500) {
      this.padHz = Math.round((this.padUpdates * 1000) / this.rateWindowMs);
      this.sampleHz = Math.round((this.samplesTaken * 1000) / this.rateWindowMs);
      this.padUpdates = 0;
      this.samplesTaken = 0;
      this.rateWindowMs = 0;
    }
    let next;
    if (this.padPick) {
      this.runPadPick(dtMs);
      next = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
      this.source = 'the joystick picker';
    } else if (this.calibration) {
      /* Unconditional: runCalibration's own first line sets waiting when
       * there is no pad, so the else arm here was a second copy that could
       * only ever agree with it. */
      this.runCalibration(gp, dtMs);
      next = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
      this.source = 'the calibration wizard';
    } else if (gp) {
      next = this.readGamepad(gp);
      this.source = this.map.stored ? 'a radio' : 'a radio that is not calibrated yet';
      /* Keyboard still works while a pad is plugged in: any held stick
       * key overrides that channel. */
      const kb = this.readKeyboard(dtMs, false);
      for (const ch of ['roll', 'pitch', 'yaw']) {
        if (kb[ch] !== 0) {
          next[ch] = kb[ch];
        }
      }
      if (this.keys.has('KeyW') || this.keys.has('KeyS')) {
        next.throttle = kb.throttle;
      } else {
        this.kb.throttle = next.throttle;
      }
    } else {
      next = this.readKeyboard(dtMs, true);
      this.source = 'the keyboard';
    }

    const changed =
      next.roll !== this.channels.roll ||
      next.pitch !== this.channels.pitch ||
      next.yaw !== this.channels.yaw ||
      next.throttle !== this.channels.throttle;
    this.heartbeatMs = (this.heartbeatMs ?? 0) + dtMs;
    if (changed || this.heartbeatMs >= 100) {
      this.heartbeatMs = 0;
      this.channels = next;
      this.queue.push({ wallT: nowWall, ...next });
      this.samplesTaken += 1;
      /* The integrator is frozen while the craft sits landed, so nothing
       * drains then. Bound it: the newest samples are the ones worth keeping. */
      if (this.queue.length > 2048) {
        this.queue.splice(0, this.queue.length - 512);
      }
    }
  }

  /*
   * Poll independently of the render loop. 2 ms is asked for; browsers clamp
   * setInterval and a busy frame delays it, which is exactly why every sample
   * is timestamped rather than assumed to be on a grid. Calling poll() from
   * the frame as well is harmless: dtMs is measured off lastWall, so the
   * keyboard integration cannot be double counted.
   */
  startPolling(periodMs = 2) {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => this.poll(performance.now()), periodMs);
  }

  stopPolling() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /*
   * Keyboard is the stick source when no radio has enumerated. WASD and
   * the arrows still overlay a connected pad channel by channel, but that
   * is not "using the keyboard rather than a controller": the pad is the
   * primary, and angle mode follows the setting.
   */
  isKeyboardPrimary() {
    return this.firstGamepad() === null;
  }

  stats() {
    return {
      padHz: this.padHz,
      sampleHz: this.sampleHz,
      queued: this.queue.length,
      source: this.source,
    };
  }

  drain() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
