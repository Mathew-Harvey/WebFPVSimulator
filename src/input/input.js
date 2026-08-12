/*
 * input.js: stick input for the shell.
 *
 * Sources, in priority order:
 *   1. A radio or controller in joystick mode via the Gamepad API. Axis
 *      order and polarity differ per radio, so a calibration wizard (M
 *      key) learns the mapping by watching the sticks and stores it in
 *      localStorage. Until calibrated a common AETR guess is used.
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
    this.source = 'keyboard';
    this.keys = new Set();
    this.kb = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    this.map = this.loadMap();
    this.calibration = null;
    this.lastWall = performance.now();
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

  /* Pressed states of the first gamepad's buttons, for menu navigation.
   * Radios in joystick mode expose their switches here, and a game
   * controller its face buttons; either can confirm a menu choice. */
  padButtons() {
    const gp = this.firstGamepad();
    if (!gp || !gp.buttons) {
      return [];
    }
    return Array.from(gp.buttons, (b) => Boolean(b && b.pressed));
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
      'CALIBRATE 1/5: throttle DOWN, sticks centred, hands off',
      'CALIBRATE 2/5: hold THROTTLE full UP',
      'CALIBRATE 3/5: hold ROLL full RIGHT',
      'CALIBRATE 4/5: hold PITCH full BACK (nose up)',
      'CALIBRATE 5/5: hold YAW full RIGHT',
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
    for (const [ch, negKey, posKey] of KEY_AXES) {
      const want = (this.keys.has(posKey) ? 1 : 0) - (this.keys.has(negKey) ? 1 : 0);
      const cur = this.kb[ch];
      if (want !== 0) {
        this.kb[ch] = Math.max(-1, Math.min(1, cur + want * RATE_UP * dt));
      } else if (cur > 0) {
        this.kb[ch] = Math.max(0, cur - RATE_DOWN * dt);
      } else if (cur < 0) {
        this.kb[ch] = Math.min(0, cur + RATE_DOWN * dt);
      }
    }
    const thrWant = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    this.kb.throttle = Math.max(0, Math.min(1, this.kb.throttle + thrWant * THR_RATE * dt));
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
      this.source = 'calibrating';
    } else if (gp) {
      next = this.readGamepad(gp);
      this.source = this.map.stored ? 'gamepad' : 'gamepad (uncalibrated, press M)';
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
      this.source = 'keyboard (WASD + arrows)';
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
