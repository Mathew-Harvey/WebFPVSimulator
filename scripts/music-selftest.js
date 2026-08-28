/*
 * music-selftest.js: prove the bed plays the right crate at the right level.
 *
 * src/render/music.js now carries two crates on one media element and
 * swaps between them off the screen the player is looking at. That is a
 * state machine, and it is a state machine that runs entirely inside a
 * browser: an HTMLAudioElement, a MediaElementSource, a GainNode and a
 * fade scheduled against an AudioContext clock. Nothing in tests/ can see
 * any of it. Check 14 taps one key on the title screen and reads three
 * numbers, so it can tell you the bed is playing and cannot tell you
 * WHICH bed, at WHICH level, or whether a settings write in the menus
 * just cut the menu record off mid bar.
 *
 * The failures that shape has are all quiet ones:
 *
 *   the menu bed plays at the flight level, so the thing that was asked
 *     for as unobtrusive is the loudest thing on the title screen
 *   the flight crate plays in the menus, or the menu crate in flight
 *   a skip in the menus writes a menu id into the Music track setting,
 *     which is a list of flight ids, and the setting silently reverts
 *   a settings write in the menus reloads the element, so every stepper
 *     press on the Sound screen restarts the bed
 *   the swap never lands, because it waits on a tick that never comes
 *   the menu pick is a constant rather than a roll
 *
 * None of those would show up as an error anywhere. So this drives the
 * real class against a fake element and a fake context and asserts the
 * behaviour directly. It costs about a second and needs no browser.
 *
 * Usage:
 *   node scripts/music-selftest.js
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

import { TRACKS, MENU_TRACKS, trackUrl } from '../src/render/tracks.js';

/*
 * The two bus gains, restated. Not imported, because music.js does not
 * export them and should not: a constant a check reads out of the file it
 * is checking cannot fail. These are the numbers the mix was decided on,
 * written down twice on purpose, and if music.js moves one of them this
 * is the thing that says so.
 */
const MUSIC_BUS = 0.60;
const MENU_BUS = 0.20;

const fails = [];
function check(what, cond, note = '') {
  if (!cond) {
    fails.push(`${what}${note ? `  (${note})` : ''}`);
  }
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${note ? `  ${note}` : ''}`);
}

/*
 * The fakes. An AudioParam that remembers what it was ramped to, because
 * the fade is the part of the swap that has no other observable effect,
 * and a media element that does what a real one does about src, preload
 * and the events music.js listens for. Nothing here models decoding: the
 * questions are about which URL, which gain and which order.
 */
class Param {
  constructor(v) {
    this.value = v;
    this.ramps = [];
  }

  cancelScheduledValues() {
    this.ramps.length = 0;
  }

  setValueAtTime(v) {
    this.value = v;
  }

  linearRampToValueAtTime(v, t) {
    this.ramps.push([v, t]);
    /* The fake jumps to the end of the ramp. Every assertion here is about
     * the target, never about a value part way along a curve. */
    this.value = v;
  }

  setTargetAtTime(v) {
    this.value = v;
  }
}

class FakeNode {
  constructor(kind) {
    this.kind = kind;
    this.gain = new Param(1);
    this.out = [];
  }

  connect(n) {
    this.out.push(n);
  }
}

class FakeCtx {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
  }

  createGain() {
    return new FakeNode('gain');
  }

  createMediaElementSource() {
    return new FakeNode('source');
  }
}

class FakeAudio {
  constructor() {
    this.srcValue = '';
    this.paused = true;
    this.currentTime = 0;
    this.duration = NaN;
    this.readyState = 0;
    this.loop = false;
    this.muted = false;
    this.preload = '';
    this.playsInline = false;
    this.bufferedEnd = 0;
    this.handlers = {};
    FakeAudio.made.push(this);
  }

  /* One buffered range, ending where the fake says it does. */
  get buffered() {
    const end = this.bufferedEnd;
    return { length: end > 0 ? 1 : 0, end: () => end };
  }

  set src(v) {
    this.srcValue = v;
    /* A new src is a new load: no metadata, no position, as in a browser. */
    this.readyState = 0;
    this.duration = NaN;
    this.currentTime = 0;
  }

  get src() {
    return this.srcValue;
  }

  setAttribute() {}

  removeAttribute() {
    this.srcValue = '';
  }

  load() {}

  canPlayType() {
    return 'probably';
  }

  addEventListener(k, fn) {
    (this.handlers[k] ??= []).push(fn);
  }

  fire(k) {
    for (const fn of this.handlers[k] ?? []) {
      fn();
    }
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  /* What a browser does once the file's header has arrived. */
  arrive(duration) {
    this.duration = duration;
    this.readyState = 4;
    this.fire('loadedmetadata');
  }
}
FakeAudio.made = [];

const conn = { saveData: false };
Object.defineProperty(globalThis, 'navigator', {
  value: { connection: conn },
  configurable: true,
});
globalThis.Audio = FakeAudio;

/* Imported AFTER the globals, because music.js reads Audio through them. */
const { Music } = await import('../src/render/music.js');

const idOf = (url) => (url.split('/').pop() ?? '').split('.')[0];
const isMenu = (url) => MENU_TRACKS.some((t) => t.id === idOf(url));
const isFlight = (url) => TRACKS.some((t) => t.id === idOf(url));
/* play() resolves on a microtask and tick() will not warm while a play is
 * pending. In a browser that is one frame; here it is one turn. */
const settle = () => new Promise((r) => { setTimeout(r, 0); });

const nodes = [];
const ctx = new FakeCtx();
const m = new Music();
m.setEnabled(true);
m.setLevel(0.5);
m.attach(ctx, new FakeNode('dest'), (n) => {
  nodes.push(n);
  return n;
});
const el = m.el;
await settle();

/* A swap is armed by setContext and landed by a tick after the fall. This
 * runs both halves and is what the shell does across two frames. */
function swapTo(context) {
  m.setContext(context);
  ctx.currentTime += 0.4;
  m.tick(ctx.currentTime);
}

console.log('the bed opens in the menus');
check('the graph is four nodes', nodes.length === 4, `${nodes.length}`);
check('the element holds a menu record', isMenu(el.src), idOf(el.src));
check('the bus is the menu bus', Math.abs(m.gain.gain.value - 0.5 * MENU_BUS) < 1e-9,
  `${m.gain.gain.value} against ${0.5 * MENU_BUS}`);
check('the menu bed does not loop', el.loop === false);
check('preload is still none', el.preload === 'none');
check('status names the crate', m.status().context === 'menu');
const openedOn = idOf(el.src);

console.log('\nthe menus buy the flight track');
el.arrive(240);
el.currentTime = 61.5;
el.bufferedEnd = 95;
await settle();
m.tick(ctx.currentTime);
check('the warm is the flight track, not the next menu one',
  m.warmId === TRACKS[m.flightIndex].id, m.warmId || 'nothing');
const warmEl = FakeAudio.made[FakeAudio.made.length - 1];
check('the warm element asks for that file',
  warmEl.src === trackUrl(TRACKS[m.flightIndex].id, m.ext));
check('the warm is muted and preloads', warmEl.muted === true && warmEl.preload === 'auto');
m.dropWarm();
el.bufferedEnd = 66;
await settle();
m.tick(ctx.currentTime);
check('nothing is warmed while the menu bed is only 4.5 s ahead of itself',
  m.warmId === '', m.warmId || 'nothing');
el.bufferedEnd = 95;
conn.saveData = true;
await settle();
m.tick(ctx.currentTime);
check('nothing is warmed at all under Save-Data', m.warmId === '', m.warmId || 'nothing');
conn.saveData = false;

console.log('\nthe swap into flight');
const leftAt = el.currentTime;
m.setContext('flight');
check('setContext arms rather than swaps',
  m.context === 'menu' && m.pendingContext === 'flight');
check('the swap gain is on its way to zero', m.swap.gain.ramps.some(([v]) => v === 0));
ctx.currentTime += 0.1;
m.tick(ctx.currentTime);
check('a tick inside the fall does not swap', m.context === 'menu');
ctx.currentTime += 0.3;
m.tick(ctx.currentTime);
check('a tick after the fall does', m.context === 'flight');
check('the element holds a flight record', isFlight(el.src), idOf(el.src));
check('the bus is the flight bus', Math.abs(m.gain.gain.value - 0.5 * MUSIC_BUS) < 1e-9,
  `${m.gain.gain.value} against ${0.5 * MUSIC_BUS}`);
check('the swap gain is on its way back up', m.swap.gain.ramps.some(([v]) => v === 1));
check('the menu record kept its place', Math.abs(m.resumeAt[openedOn] - leftAt) < 1e-9,
  `${m.resumeAt[openedOn]} against ${leftAt}`);
check('the flight bus is three times the menu bus', Math.abs(MUSIC_BUS / MENU_BUS - 3) < 1e-9);

console.log('\nthe Music track setting is about the flight crate only');
el.arrive(200);
el.currentTime = 30;
m.setTrack('neon-horizon');
check('picking a track in flight loads it', idOf(el.src) === 'neon-horizon', idOf(el.src));
check('a pinned flight track loops', el.loop === true);
swapTo('menu');
check('a pinned flight track does not make the MENU bed loop', el.loop === false);
const held = el.src;
m.setTrack('tarmac-pulse');
check('a settings write in the menus leaves the element alone', el.src === held);
check('but the choice is remembered',
  m.selection === 'tarmac-pulse' && TRACKS[m.flightIndex].id === 'tarmac-pulse');
swapTo('flight');
check('and it is what plays on the way back', idOf(el.src) === 'tarmac-pulse', idOf(el.src));

console.log('\nskip, end and the resume');
swapTo('menu');
el.arrive(240);
const wasOn = idOf(el.src);
m.skip(1);
check('a menu skip stays inside the menu crate', isMenu(el.src), idOf(el.src));
check('and it moves', idOf(el.src) !== wasOn);
check('a menu skip does not rewrite the flight selection', m.selection === 'tarmac-pulse');
check('a skip asks for the top of the record', m.seekTo === 0, `${m.seekTo}`);
const beforeEnd = idOf(el.src);
el.fire('ended');
check('the menu crate walks on ended rather than looping', idOf(el.src) !== beforeEnd,
  idOf(el.src));
m.seekTo = 295;
el.duration = 302;
el.currentTime = 0;
m.onMeta();
check('a resume inside the last 15 s is refused', el.currentTime === 0, `${el.currentTime}`);
m.seekTo = 120;
el.currentTime = 0;
m.onMeta();
check('a resume with room left is honoured', el.currentTime === 120, `${el.currentTime}`);

console.log('\nthe resume, end to end');
/*
 * Leave a menu record part way through and keep going back until the roll
 * lands on it again, then check it picks up where it was. Driven rather
 * than asserted in one shot because the pick IS a roll: the assertion is
 * about the record that comes back, not about which one comes back.
 */
swapTo('menu');
el.arrive(240);
el.currentTime = 88.25;
const parked = idOf(el.src);
let returns = 0;
do {
  swapTo('flight');
  swapTo('menu');
  returns += 1;
} while (idOf(el.src) !== parked && returns < 40);
check('the roll came back to the parked record inside forty returns',
  idOf(el.src) === parked, `${returns} returns`);
check('and it is parked to resume where it was',
  Math.abs(m.seekTo - 88.25) < 1e-9, `${m.seekTo} against 88.25`);
el.arrive(240);
check('and the element is seeked there once the metadata lands',
  Math.abs(el.currentTime - 88.25) < 1e-9, `${el.currentTime}`);

console.log('\nthe roll');
/*
 * Both menu records have to come up across a run of returns. A pick that
 * is secretly a constant passes every other assertion in this file, and
 * 'played at random' is the requirement. Forty returns makes a two sided
 * miss about one in five hundred billion, which is not a flake anyone
 * will meet.
 */
const seen = new Set();
for (let i = 0; i < 40; i += 1) {
  swapTo('flight');
  swapTo('menu');
  seen.add(idOf(el.src));
}
check('every menu record comes up across forty returns',
  seen.size === MENU_TRACKS.length, `${[...seen].join(', ')}`);

console.log('\na swap nobody can hear lands at once');
m.setEnabled(false);
m.setContext('flight');
check('with music off the context changes immediately, without waiting on a tick',
  m.context === 'flight' && m.pendingContext === '');
m.setEnabled(true);
check('and the bus comes back on the right bed',
  Math.abs(m.gain.gain.value - 0.5 * MUSIC_BUS) < 1e-9, `${m.gain.gain.value}`);

console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
for (const f of fails) {
  console.log(`  FAIL ${f}`);
}
process.exitCode = fails.length ? 1 : 0;
