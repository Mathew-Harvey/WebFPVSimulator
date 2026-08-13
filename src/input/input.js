/*
 * input.js: stick input for the shell.
 *
 * Sources, in priority order:
 *   1. A radio or controller in joystick mode via the Gamepad API. Axis
 *      order and polarity differ per radio, so a calibration wizard
 *      (Settings, Calibrate sticks) learns the mapping by watching the
 *      sticks and stores it in localStorage. Until calibrated a common
 *      AETR guess is used for flight, and menu navigation falls back to
 *      any axis at all, so the wizard is always reachable.
 *   2. Keyboard: WASD plus arrows mimic a Mode 2 radio. W/S move the
 *      throttle and hold it (no spring). A/D are yaw, arrows are the
 *      right stick: up arrow pushes the stick forward (nose down), left
 *      and right arrows roll. Rate limited so it is flyable.
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

const DEFAULT_MAP = {
  /* AETR axis order, up and right positive, throttle low at -1. */
  roll: { axis: 0, center: 0, full: 1 },
  pitch: { axis: 1, center: 0, full: -1 },
  yaw: { axis: 3, center: 0, full: 1 },
  throttle: { axis: 2, low: -1, high: 1 },
};

const KEY_AXES = [
  /* channel, negative key, positive key */
  ['roll', 'ArrowLeft', 'ArrowRight'],
  ['pitch', 'ArrowUp', 'ArrowDown'], /* up arrow = stick forward = nose down = negative */
  ['yaw', 'KeyA', 'KeyD'],
];

export class InputManager {
  constructor() {
    this.channels = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    this.queue = [];
    this.source = 'the keyboard';
    this.keys = new Set();
    this.kb = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    this.map = this.loadMap();
    this.calibration = null;
    this.lastWall = performance.now();
    this.padArmed = false; /* set once the pad's menu buttons are seen released */
    this.navRest = null;   /* axis rest values, for uncalibrated menu nav */
    this.onKey = null; /* main.js hooks non stick keys here */

    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        return;
      }
      this.keys.add(e.code);
      if (this.onKey) {
        this.onKey(e.code);
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  loadMap() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        return { ...DEFAULT_MAP, ...JSON.parse(raw), stored: true };
      }
    } catch {
      /* fall through to default */
    }
    return { ...DEFAULT_MAP, stored: false };
  }

  saveMap() {
    this.map.stored = true;
    localStorage.setItem(STORE_KEY, JSON.stringify(this.map));
  }

  firstGamepad() {
    for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
      if (gp && gp.connected && gp.axes.length >= 4) {
        return gp;
      }
    }
    return null;
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

  /* Calibration wizard state machine, driven from poll(). */
  startCalibration() {
    this.calibration = { stage: 0, holdMs: 0, rest: null };
  }

  calibrationPrompt() {
    if (!this.calibration) {
      return null;
    }
    const prompts = [
      'Step 1 of 5\nHands off the sticks, throttle right down.',
      'Step 2 of 5\nHold the throttle all the way up.',
      'Step 3 of 5\nHold the right stick fully to the right.',
      'Step 4 of 5\nPull the right stick fully back.',
      'Step 5 of 5\nHold the left stick fully to the right.',
    ];
    return prompts[this.calibration.stage] ?? null;
  }

  runCalibration(gp, dtMs) {
    const c = this.calibration;
    const axes = gp.axes.slice(0, Math.min(gp.axes.length, 8));
    c.holdMs += dtMs;
    if (c.stage === 0) {
      if (c.holdMs > 1500) {
        c.rest = axes.slice();
        c.stage = 1;
        c.holdMs = 0;
      }
      return;
    }
    /* Find the axis with the largest steady excursion from rest. */
    let best = -1;
    let bestDelta = 0;
    for (let i = 0; i < axes.length; i += 1) {
      const d = axes[i] - c.rest[i];
      if (Math.abs(d) > Math.abs(bestDelta)) {
        bestDelta = d;
        best = i;
      }
    }
    if (Math.abs(bestDelta) < 0.45) {
      c.holdMs = 0;
      return;
    }
    if (c.holdMs < 900) {
      return;
    }
    const target = ['throttle', 'roll', 'pitch', 'yaw'][c.stage - 1];
    if (target === 'throttle') {
      this.map.throttle = { axis: best, low: c.rest[best], high: axes[best] };
    } else {
      this.map[target] = { axis: best, center: c.rest[best], full: bestDelta };
    }
    c.stage += 1;
    c.holdMs = 0;
    if (c.stage > 4) {
      this.saveMap();
      this.calibration = null;
    }
  }

  readGamepad(gp) {
    const ax = (i) => (i < gp.axes.length ? gp.axes[i] : 0);
    const dead = (v) => (Math.abs(v) < 0.012 ? 0 : v);
    const m = this.map;
    const norm = (spec) => {
      const v = (ax(spec.axis) - spec.center) / (spec.full || 1);
      return dead(Math.max(-1, Math.min(1, v)));
    };
    const t = (ax(m.throttle.axis) - m.throttle.low) / ((m.throttle.high - m.throttle.low) || 1);
    return {
      roll: norm(m.roll),
      pitch: norm(m.pitch),
      yaw: norm(m.yaw),
      throttle: Math.max(0, Math.min(1, t)),
    };
  }

  readKeyboard(dtMs) {
    const dt = dtMs / 1000;
    const RATE_UP = 9.0;     /* stick deflection per second when held */
    const RATE_DOWN = 14.0;  /* return to centre per second */
    const THR_RATE = 0.9;    /* throttle travel per second */
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
     * 0.18 per frame is the resolution a 60 frames per second machine already
     * gets, so this changes nothing there and turns a slow machine from
     * bang bang into merely coarse.
     */
    const MAX_STEP = 0.18;
    const step = (rate) => Math.min(rate * dt, MAX_STEP);
    for (const [ch, negKey, posKey] of KEY_AXES) {
      const want = (this.keys.has(posKey) ? 1 : 0) - (this.keys.has(negKey) ? 1 : 0);
      const cur = this.kb[ch];
      if (want !== 0) {
        this.kb[ch] = Math.max(-1, Math.min(1, cur + want * step(RATE_UP)));
      } else if (cur > 0) {
        this.kb[ch] = Math.max(0, cur - step(RATE_DOWN));
      } else if (cur < 0) {
        this.kb[ch] = Math.min(0, cur + step(RATE_DOWN));
      }
    }
    const thrWant = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    this.kb.throttle = Math.max(0, Math.min(1, this.kb.throttle + thrWant * step(THR_RATE)));
    return { ...this.kb };
  }

  /* Called once per animation frame. Emits one timestamped sample when
   * anything changed, plus a heartbeat sample every 100 ms. */
  poll(nowWall) {
    const dtMs = Math.min(nowWall - this.lastWall, 100);
    this.lastWall = nowWall;

    const gp = this.firstGamepad();
    let next;
    if (this.calibration && gp) {
      this.runCalibration(gp, dtMs);
      next = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
      this.source = 'the calibration wizard';
    } else if (gp) {
      next = this.readGamepad(gp);
      this.source = this.map.stored ? 'a radio' : 'a radio that is not calibrated yet';
      /* Keyboard still works while a pad is plugged in: any held stick
       * key overrides that channel. */
      const kb = this.readKeyboard(dtMs);
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
      next = this.readKeyboard(dtMs);
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
    }
  }

  drain() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
