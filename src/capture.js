/*
 * capture.js: the capture mode, for footage of the mini games that does not
 * depend on how fast the machine is.
 *
 * WHAT IT IS FOR. A headless Chromium without a GPU renders this page at one
 * to three frames a second of real time, and the game loop, the mini game
 * clocks and every HUD fade read the wall clock, so footage taken that way
 * stutters and differs from one run to the next. Capture mode takes the wall
 * clock away. One external step is exactly one 1/60 s frame of virtual time,
 * however long the frame takes to draw, and the same seed with the same
 * number of steps gives the same pictures.
 *
 * OFF BY DEFAULT, AND ABSENT. boot.js imports this module only when the URL
 * says ?capture=1, so a pilot never downloads a byte of it and nothing in the
 * normal build reads the clock any differently: with the flag off,
 * requestAnimationFrame, performance.now and Date.now are the browser's own
 * and window.__capture does not exist. The few guarded lines in main.js all
 * test window.__capture.
 *
 * WHAT IT REPLACES, before any game code runs:
 *   - requestAnimationFrame and cancelAnimationFrame: a queue that runs only
 *     when stepped, each callback handed the virtual time.
 *   - performance.now, Date.now and new Date() with no arguments: virtual
 *     time, from a fixed epoch, moving only on a step.
 *   - setTimeout and setInterval: a virtual timer queue, fired in due order
 *     as a step carries the clock past them. Nothing in the page's gameplay
 *     therefore waits on the wall clock. What stays on the wall clock is
 *     only what is not the page's own: network, WebAssembly compilation and
 *     module loading finish when they finish, and the harness's own waits
 *     (this file keeps the browser's real setTimeout for them). That is
 *     harmless because nothing is drawn or simulated between steps.
 *   - Math.random: a seeded generator (mulberry32), so bots, cars, riders,
 *     the ball and the ribbons repeat. The URL's seed also replaces the two
 *     Date.now() seeds main.js gives the mini games.
 *   - CSS transitions and animations: every running Animation is set to the
 *     virtual time on each step, so a fade is where the clock says it is.
 *   - Audio: AudioContext is removed, so audio.js finds none and starts
 *     none, and media elements do not play.
 * Not replaced, and not used by anything that is drawn: crypto.getRandomValues
 * (ids and keys), the network, and the page's own real wall clock for the
 * harness.
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

/* One frame of virtual time, ms. */
const FRAME_MS = 1000 / 60;
/* performance.now() at frame 0 (a page that reads 0 as "unset" stays well),
 * and the Date at frame 0: 2026-01-01T00:00:00Z, fixed. */
const PERF_EPOCH = 1000;
const DATE_EPOCH = Date.UTC(2026, 0, 1);
/* A guard on a zero delay timer that keeps re-arming itself. */
const TIMER_FIRE_CAP = 20000;

/* The browser's own, kept for the harness's waits before anything is
 * replaced. */
const real = {
  raf: window.requestAnimationFrame.bind(window),
  setTimeout: window.setTimeout.bind(window),
  Date,
};
const realSleep = (ms) => new Promise((r) => real.setTimeout(r, ms));

const params = new URLSearchParams(window.location.search);
const seedRaw = Number(params.get('seed'));
const SEED = params.has('seed') && Number.isFinite(seedRaw) ? (seedRaw >>> 0) : 1;

/* ------------------------------ the clock ------------------------------ */

let frameNo = 0;
let vt = 0;
const perfNow = () => PERF_EPOCH + vt;
const dateNow = () => DATE_EPOCH + Math.floor(vt);

let rafSeq = 0;
let rafQueue = new Map();
window.requestAnimationFrame = (cb) => {
  rafSeq += 1;
  rafQueue.set(rafSeq, cb);
  return rafSeq;
};
window.cancelAnimationFrame = (id) => {
  rafQueue.delete(id);
};

performance.now = perfNow;
window.Date = new Proxy(real.Date, {
  construct(target, args, newTarget) {
    return Reflect.construct(target, args.length === 0 ? [dateNow()] : args, newTarget);
  },
  apply() {
    return new real.Date(dateNow()).toString();
  },
  get(target, key, receiver) {
    if (key === 'now') {
      return dateNow;
    }
    return Reflect.get(target, key, receiver);
  },
});

/* Timers: a list kept in due order. Few at a time, so a linear insert. */
let timerSeq = 0;
const timers = [];
function addTimer(fn, delay, args, repeat) {
  if (typeof fn !== 'function') {
    return 0;
  }
  timerSeq += 1;
  const d = Math.max(0, Number(delay) || 0);
  const every = repeat ? Math.max(1, d) : 0;
  /* An interval ticks on the absolute grid of its period, as a hardware
   * clock does, and not from the moment it happened to be created: the input
   * poll is a 2 ms interval, and which frame the page booted on must not
   * shift where its samples fall against the physics. */
  const t = {
    id: timerSeq, fn, args, every, due: every ? (Math.floor(vt / every) + 1) * every : vt + d, seq: timerSeq,
  };
  let i = timers.length;
  while (i > 0 && (timers[i - 1].due > t.due)) {
    i -= 1;
  }
  timers.splice(i, 0, t);
  return t.id;
}
function removeTimer(id) {
  const i = timers.findIndex((t) => t.id === id);
  if (i >= 0) {
    timers.splice(i, 1);
  }
}
window.setTimeout = (fn, delay, ...args) => addTimer(fn, delay, args, false);
window.setInterval = (fn, delay, ...args) => addTimer(fn, delay, args, true);
window.clearTimeout = removeTimer;
window.clearInterval = removeTimer;

function runTimersUpTo(target) {
  let fired = 0;
  while (timers.length && timers[0].due <= target) {
    const t = timers.shift();
    vt = Math.max(vt, t.due);
    if (t.every) {
      t.due += t.every;
      let i = timers.length;
      while (i > 0 && timers[i - 1].due > t.due) {
        i -= 1;
      }
      timers.splice(i, 0, t);
    }
    try {
      t.fn(...t.args);
    } catch (e) {
      window.reportError(e);
    }
    fired += 1;
    if (fired > TIMER_FIRE_CAP) {
      console.error('capture: timer storm, giving up this step');
      break;
    }
  }
  vt = target;
}

/* ------------------------------ the dice ------------------------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEED ^ 0x9e3779b9);

/* -------------------------------- audio -------------------------------- */

/* audio.js starts a context only when it finds one: with none, start() returns
 * and the rest of the mixer idles. Media elements (the music) resolve play()
 * without sound. */
window.AudioContext = undefined;
window.webkitAudioContext = undefined;
if (window.HTMLMediaElement) {
  window.HTMLMediaElement.prototype.play = function play() {
    return Promise.resolve();
  };
}

/* ------------------------- CSS animations by clock ---------------------- */

const animStart = new WeakMap();
function settleAnimations() {
  if (!document.getAnimations) {
    return;
  }
  for (const a of document.getAnimations()) {
    const t0 = animStart.get(a);
    if (t0 === undefined) {
      animStart.set(a, vt);
      a.pause();
      a.currentTime = 0;
      continue;
    }
    const timing = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    const cur = vt - t0;
    if (timing && Number.isFinite(timing.endTime) && cur >= timing.endTime) {
      a.finish();
    } else {
      a.currentTime = cur;
    }
  }
}

/* ------------------------------- stepping ------------------------------- */

const hooks = { host: null, pilot: null };

async function stepOne() {
  frameNo += 1;
  const target = frameNo * FRAME_MS;
  runTimersUpTo(target);
  const queued = rafQueue;
  rafQueue = new Map();
  const stamp = perfNow();
  for (const cb of queued.values()) {
    try {
      cb(stamp);
    } catch (e) {
      window.reportError(e);
    }
  }
  settleAnimations();
  /* Drawn: the browser's own next frame has presented what the callbacks
   * painted. A page that never gets one (hidden) falls through after a
   * few seconds rather than hang the run. */
  await new Promise((resolve) => {
    let done = false;
    const fin = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    real.raf(() => real.raf(fin));
    real.setTimeout(fin, 8000);
  });
}

let stepping = Promise.resolve();
function step(n = 1) {
  const count = Math.max(1, Math.floor(Number(n) || 1));
  const run = async () => {
    for (let i = 0; i < count; i += 1) {
      await stepOne();
    }
    return frameNo;
  };
  stepping = stepping.then(run, run);
  return stepping;
}

/* Step until a condition holds, with a real wait between steps so the page's
 * own asynchronous work (fetch, wasm, imports) lands BETWEEN frames and not
 * during one. That is what makes the frame a load completes on, and so every
 * phase that hangs off it (the run's reset against the 16.667 ms frame, the
 * input poll's grid), the same from run to run. It is the one place real time
 * is waited on, and it is a wait, not a read: no clock the page can see moves. */
const SETTLE_MS = 350;
async function stepUntil(test, what, maxSteps = 6000) {
  for (let i = 0; i < maxSteps; i += 1) {
    let ok = false;
    try {
      ok = Boolean(test());
    } catch (e) {
      ok = false;
    }
    if (ok) {
      await realSleep(SETTLE_MS);
      return i;
    }
    await step(1);
    await realSleep(SETTLE_MS);
  }
  throw new Error(`capture: never reached ${what}`);
}

/* ------------------------------ the camera ------------------------------ */

const v3 = () => ({ x: 0, y: 0, z: 0 });
const cam = {
  mode: 'off', // 'off' | 'fixed' | 'follow' | 'path'
  pos: null, look: null, fov: 0,
  follow: null, path: null, pathStart: 0,
  eye: v3(), aim: v3(), have: false, savedFov: 0,
  sub: v3(), prevSub: v3(), vel: v3(), dir: v3(),
};
const tmpA = v3();
const tmpB = v3();

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* A subject: one name, or several joined with + whose midpoint is used. */
function resolveSubject(name, out) {
  const parts = String(name).split('+');
  let ok = 0;
  out.x = 0;
  out.y = 0;
  out.z = 0;
  for (const p of parts) {
    if (hooks.host && hooks.host.subject(p.trim(), tmpA)) {
      out.x += tmpA.x;
      out.y += tmpA.y;
      out.z += tmpA.z;
      ok += 1;
    }
  }
  if (!ok) {
    return false;
  }
  out.x /= ok;
  out.y /= ok;
  out.z /= ok;
  return true;
}

function pathAt(keys, tMs, out) {
  const last = keys[keys.length - 1];
  const t = Math.min(tMs, last.t);
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) {
    i += 1;
  }
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = Math.max(1e-6, b.t - a.t);
  let u = Math.max(0, Math.min(1, (t - a.t) / span));
  u = u * u * (3 - 2 * u);
  out.pos = [0, 1, 2].map((k) => lerp(a.pos[k], b.pos[k], u));
  out.look = [0, 1, 2].map((k) => lerp(a.look[k], b.look[k], u));
  out.fov = a.fov && b.fov ? lerp(a.fov, b.fov, u) : (a.fov || b.fov || 0);
}

const pathOut = { pos: null, look: null, fov: 0 };

/* Called by main.js once a frame, after the game has updated and just before
 * the harness camera is applied. Decides the eye and the aim, and hands them
 * to window.__setCam, the existing harness camera, so there is one camera
 * system and not two. */
function tick() {
  if (hooks.pilot) {
    hooks.pilot(vt);
  }
  if (cam.mode === 'off') {
    return;
  }
  const host = hooks.host;
  let eye = null;
  let aim = null;
  let fov = cam.fov;
  if (cam.mode === 'fixed') {
    eye = cam.pos;
    aim = cam.look;
  } else if (cam.mode === 'path') {
    pathAt(cam.path, vt - cam.pathStart, pathOut);
    eye = pathOut.pos;
    aim = pathOut.look;
    fov = pathOut.fov || cam.fov;
  } else if (cam.mode === 'follow') {
    const f = cam.follow;
    if (!resolveSubject(f.target, cam.sub)) {
      return;
    }
    const s = cam.sub;
    if (!cam.have) {
      cam.prevSub.x = s.x;
      cam.prevSub.y = s.y;
      cam.prevSub.z = s.z;
    }
    /* Velocity per second from the last frame, smoothed: the heading the
     * offset hangs off, and the look ahead. */
    const k = 0.15;
    cam.vel.x = lerp(cam.vel.x, (s.x - cam.prevSub.x) * 60, k);
    cam.vel.y = lerp(cam.vel.y, (s.y - cam.prevSub.y) * 60, k);
    cam.vel.z = lerp(cam.vel.z, (s.z - cam.prevSub.z) * 60, k);
    cam.prevSub.x = s.x;
    cam.prevSub.y = s.y;
    cam.prevSub.z = s.z;
    const hl = Math.hypot(cam.vel.x, cam.vel.z);
    if (hl > 0.5) {
      cam.dir.x = lerp(cam.dir.x, cam.vel.x / hl, 0.12);
      cam.dir.z = lerp(cam.dir.z, cam.vel.z / hl, 0.12);
    }
    let dl = Math.hypot(cam.dir.x, cam.dir.z);
    if (dl < 1e-3) {
      cam.dir.x = 0;
      cam.dir.z = -1;
      dl = 1;
    }
    const fx = cam.dir.x / dl;
    const fz = cam.dir.z / dl;
    /* offset: [side, up, back] in metres in that heading frame; or a world
     * offset when the caller asks for one. */
    const o = f.offset;
    let ox;
    let oy;
    let oz;
    if (f.world) {
      [ox, oy, oz] = o;
    } else {
      /* right of the heading is (-fz, fx) in this Y up frame. */
      ox = -fz * o[0] - fx * o[2];
      oy = o[1];
      oz = fx * o[0] - fz * o[2];
    }
    const ahead = f.lookAhead;
    eye = [s.x + ox, s.y + oy, s.z + oz];
    aim = [s.x + cam.vel.x * ahead, s.y + cam.vel.y * ahead + (f.aimUp || 0), s.z + cam.vel.z * ahead];
  }
  if (!eye || !aim) {
    return;
  }
  const sm = cam.mode === 'follow' ? cam.follow.smooth : 0;
  if (!cam.have || sm <= 0) {
    cam.eye.x = eye[0];
    cam.eye.y = eye[1];
    cam.eye.z = eye[2];
    cam.aim.x = aim[0];
    cam.aim.y = aim[1];
    cam.aim.z = aim[2];
    cam.have = true;
  } else {
    const a = 1 - sm;
    cam.eye.x = lerp(cam.eye.x, eye[0], a);
    cam.eye.y = lerp(cam.eye.y, eye[1], a);
    cam.eye.z = lerp(cam.eye.z, eye[2], a);
    cam.aim.x = lerp(cam.aim.x, aim[0], a);
    cam.aim.y = lerp(cam.aim.y, aim[1], a);
    cam.aim.z = lerp(cam.aim.z, aim[2], a);
  }
  window.__setCam(cam.eye.x, cam.eye.y, cam.eye.z, cam.aim.x, cam.aim.y, cam.aim.z);
  if (host && fov > 0) {
    host.fov(fov);
  }
}

function camRelease() {
  cam.mode = 'off';
  cam.have = false;
  if (window.__setCam) {
    window.__setCam(null);
  }
  if (hooks.host) {
    hooks.host.fov(0);
  }
}

function num3(v, what) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) {
    throw new Error(`capture: ${what} must be [x, y, z] in metres`);
  }
  return v.slice();
}

/* ------------------------------- overlays ------------------------------- */

let hideStyle = null;
/*
 * What each switch hides, by the classes the shell draws them with. Every rule
 * is a CSS visibility, so it changes what is drawn and nothing the game
 * reads: the elements stay in the page and keep updating.
 *   tips:    the first flight guidance: the amber lines the shell prints
 *            mid screen (.banner, the words of src/ui/firstflight.js) and the
 *            Weight card that introduces the sliders.
 *   hints:   each mode's own amber start line (.df-banner on the Quad Ball,
 *            Dogfight, Ribbon and Drift HUDs: "Take off to start", ...).
 *   leftTab: the readouts against the left edge: the SCORE tab, the mode's
 *            left panel (YOUR GOALS, HEALTH, ...), Drift's film slate, and the
 *            AIR / timer readout.
 *   chips:   the Report bug and Pause buttons and the music player, which
 *            are the page's and not the game's.
 *   hud:     everything the shell lays over the picture.
 */
const HIDE_RULES = {
  tips: ['.banner', '.osd-air-hint'],
  hints: ['.df-banner'],
  leftTab: ['.score-hud', '.df-me-panel', '.film-slate', '.film-rec', '.osd-clock'],
  chips: ['.bug-chip', '.music-dock'],
  hud: ['#ui'],
};
function hide(opts = {}) {
  const css = [];
  for (const key of Object.keys(HIDE_RULES)) {
    if (opts[key] === true) {
      for (const sel of HIDE_RULES[key]) {
        css.push(`${sel}{visibility:hidden !important}`);
      }
    }
  }
  if (!hideStyle) {
    hideStyle = document.createElement('style');
    hideStyle.id = 'capture-hide';
    document.head.appendChild(hideStyle);
  }
  hideStyle.textContent = css.join('\n');
  return css.length;
}

/* ------------------------------- the game ------------------------------- */

const MODES = {
  ball: { map: 'ball' },
  drift: { map: 'drift' },
  dogfight: { map: 'city' },
  ribbon: { map: 'city' },
  moto: { map: 'moto' },
};

function ready() {
  return stepUntil(() => window.__shellReady === true
    && window.__map && window.__map().ready, 'the shell and its map', 20000)
    .then(() => step(1))
    .then(() => frameNo);
}

async function start(mode, opts = {}) {
  const m = MODES[mode];
  if (!m) {
    throw new Error(`capture: unknown mode ${mode}`);
  }
  await ready();
  const ui = window.__ui;
  if (window.__map().id !== m.map) {
    throw new Error(`capture: ${mode} runs on the ${m.map} map; open /index.html?capture=1&map=${m.map}&craft=5inch&fly=1`);
  }
  /* The quad picker, answered as a pilot answers it. */
  await stepUntil(() => document.querySelector('.qp-page') || ui.screen === 'flight', 'the quad picker', 600).catch(() => {});
  if (document.querySelector('.qp-page')) {
    await step(40);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  }
  await stepUntil(() => ui.screen === 'flight', 'the flight screen', 1200);
  const bots = opts.bots ?? 2;
  const skill = opts.skill ?? 'rookie';
  if (mode === 'dogfight') {
    ui.dogfight = { bots, skill, round: opts.round ?? '3m', hits: opts.hits ?? 'arcade' };
  } else if (mode === 'ribbon') {
    ui.dogfight = {
      game: 'ribbon', bots, skill, length: opts.length ?? 'normal', round: opts.round ?? '2m',
    };
  } else if (mode === 'drift') {
    ui.dogfight = { game: 'drift', bots, skill };
  } else if (mode === 'ball') {
    ui.dogfight = {
      game: 'ball', size: opts.size ?? 2, skill, round: opts.round ?? '3m',
    };
  }
  if (mode !== 'moto') {
    await stepUntil(() => window.__dogfight && window.__dogfight(), `the ${mode} game`, 1200);
  }
  await step(2);
  /* The page's own asynchronous loading lands a frame earlier or later from
   * run to run. Everything periodic here (the 2 ms input poll, the 1 ms
   * physics step against a 16.667 ms frame) repeats every three frames, so
   * ending on a multiple of three puts every run in the same phase. */
  while (frameNo % 3 !== 0) {
    await step(1);
  }
  return { mode, seed: SEED, bots, skill, frame: frameNo };
}

/* A stick script: [[tMs, roll, pitch, yaw, throttle], ...] in virtual ms from
 * when it was set, linear between keys, held after the last. */
function setPilot(keys) {
  if (!keys) {
    hooks.pilot = null;
    return;
  }
  if (!Array.isArray(keys) || !keys.length) {
    throw new Error('capture: pilot wants [[tMs, roll, pitch, yaw, throttle], ...]');
  }
  const t0 = vt;
  hooks.pilot = (now) => {
    const t = now - t0;
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1][0] <= t) {
      i += 1;
    }
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const u = b[0] > a[0] ? Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0]))) : 0;
    window.__stick(lerp(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u), lerp(a[4], b[4], u));
  };
}

window.__capture = {
  step,
  now: () => perfNow(),
  frame: () => frameNo,
  ready,
  start,
  seed: SEED,
  hide,
  pilot: setPilot,
  cam(c) {
    if (c == null) {
      camRelease();
      return;
    }
    cam.pos = num3(c.pos, 'pos');
    cam.look = num3(c.look, 'look');
    cam.fov = Number(c.fov) || 0;
    cam.mode = 'fixed';
    cam.have = false;
  },
  follow(target, o = {}) {
    cam.follow = {
      target,
      offset: num3(o.offset ?? [0, 3, 8], 'offset'),
      lookAhead: Number.isFinite(o.lookAhead) ? o.lookAhead : 0.4,
      smooth: Number.isFinite(o.smooth) ? Math.max(0, Math.min(0.99, o.smooth)) : 0.9,
      world: o.world === true,
      aimUp: Number(o.aimUp) || 0,
    };
    cam.fov = Number(o.fov) || 0;
    cam.mode = 'follow';
    cam.have = false;
    cam.vel.x = 0;
    cam.vel.y = 0;
    cam.vel.z = 0;
    cam.dir.x = 0;
    cam.dir.z = -1;
  },
  path(keys) {
    if (!Array.isArray(keys) || keys.length < 1) {
      throw new Error('capture: path wants [{t, pos, look, fov}, ...]');
    }
    cam.path = keys.map((k) => ({
      t: Number(k.t) || 0, pos: num3(k.pos, 'pos'), look: num3(k.look, 'look'), fov: Number(k.fov) || 0,
    })).sort((a, b) => a.t - b.t);
    cam.pathStart = vt;
    cam.mode = 'path';
    cam.have = false;
  },
  /* main.js hands in how to find a subject and how to set the lens, and takes
   * the per frame tick. */
  attach(host) {
    hooks.host = host;
  },
  tick,
};
