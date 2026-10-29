/*
 * dogfighthud.js: the dogfight's HUD, as drawn in the owner's mockup of
 * 2026-10-29 (/mnt/project-files/dogfight/shots/hud.png in the project's
 * files): the reticle, brackets on the bots with their health, the lead
 * diamond, LOCK, the damage each hit did, the missile warning on the edge
 * it is coming from, arrows to the bots off screen, the round's clock and
 * score, who popped whom, and the pilot's own health, gun heat and missile
 * rack. Then POP and the count back when the pilot is popped, and the
 * round's results.
 *
 * COST. One 2D canvas the size of the window, cleared and drawn once a
 * frame with a handful of strokes: the brackets, the reticle and the
 * numbers. Everything else is DOM, written only when its value changes.
 * The lettered callouts (LOCK!, MISSILE!, POP!) are painted once, when the
 * HUD is built, and shown and hidden after that. Fetched only when a
 * dogfight is flown, with the game.
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

import * as THREE from 'three';
import { paintCall, INKS } from './lettering.js';
import {
  MAX_PILOTS, ME, MISSILE, GUN, BOT_NAMES, LOCK_COS,
} from '../game/dogfight.js';

const INK = '#0b1116';
const CREAM = '#f3ead4';
const AMBER = '#ffd45c';
const MINT = '#7dffb4';
const BAIL = '#ff7d96';

const CSS = `
.df-hud { position: absolute; inset: 0; pointer-events: none; overflow: hidden; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; z-index: 3; }
.df-hud.is-off, .df-hud .is-off { display: none !important; }
.df-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.df-score { position: absolute; left: 50%; top: 92px; transform: translateX(-50%); display: flex; align-items: stretch; }
.df-score > div { border: 3px solid ${INK}; background: #f7f0dc; color: ${INK}; padding: 5px 12px; font: 900 14px/1.1 inherit; font-weight: 900; display: grid; place-items: center; white-space: nowrap; }
.df-score .df-me { background: ${MINT}; }
.df-score .df-clock { background: ${INK}; color: ${AMBER}; font-size: 22px; padding: 4px 16px; min-width: 86px; }
.df-feed { position: absolute; right: 18px; top: 110px; display: grid; gap: 6px; justify-items: end; }
.df-slip { background: #f7f0dc; color: ${INK}; border: 3px solid ${INK}; padding: 5px 10px; font-size: 13px; font-weight: 800; box-shadow: 3px 3px 0 ${INK}; transition: opacity .6s; }
.df-slip b { font-weight: 900; }
.df-slip .df-you { color: #0a7a44; }
.df-slip.is-old { opacity: 0; }
.df-me-panel { position: absolute; left: 22px; bottom: 132px; width: 250px; }
.df-lbl { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; font-weight: 900; letter-spacing: .14em; color: ${CREAM}; text-shadow: 0 2px 0 ${INK}; margin: 0 0 4px; }
.df-lbl em { font-size: 26px; font-style: italic; letter-spacing: 0; }
.df-bar { height: 12px; border: 2px solid ${INK}; background: rgba(11,17,22,.55); position: relative; box-shadow: 2px 2px 0 ${INK}; margin-bottom: 9px; }
.df-bar i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: left center; }
.df-bar.is-thin { height: 8px; }
.df-rack { display: flex; gap: 6px; align-items: center; }
.df-rack svg { width: 14px; height: 28px; }
.df-rack span { font-size: 11px; font-weight: 800; letter-spacing: .1em; color: ${CREAM}; text-shadow: 0 2px 0 ${INK}; margin-left: 6px; }
.df-call { position: absolute; }
.df-banner { position: absolute; left: 50%; bottom: 150px; transform: translateX(-50%); text-align: center; color: ${CREAM}; text-shadow: 0 2px 0 ${INK}, 0 0 8px rgba(0,0,0,.6); font-size: 20px; font-weight: 800; max-width: 80%; }
.df-pop { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; gap: 14px; background: rgba(11,17,22,.35); }
.df-pop .df-say { background: #fff; border: 3px solid ${INK}; border-radius: 22px; padding: 10px 20px; font: 700 20px/1.2 "Comic Neue", "Comic Sans MS", system-ui, sans-serif; color: ${INK}; }
.df-pop .df-back { color: ${CREAM}; font-size: 18px; font-weight: 900; letter-spacing: .14em; text-shadow: 0 2px 0 ${INK}; text-align: center; }
.df-pop .df-back b { color: ${AMBER}; font-size: 34px; }
.df-edge { position: absolute; top: 0; bottom: 0; width: 140px; }
.df-edge.is-left { left: 0; background: linear-gradient(90deg, rgba(255,125,150,.55), transparent); }
.df-edge.is-right { right: 0; background: linear-gradient(270deg, rgba(255,125,150,.55), transparent); }
.df-hurt { position: absolute; inset: 0; box-shadow: inset 0 0 90px rgba(255,125,150,.75); opacity: 0; transition: opacity .35s; }
.df-hurt.is-on { opacity: 1; transition: none; }
.df-result { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(760px, 92vw); background: #f7f0dc; border: 4px solid ${INK}; box-shadow: 10px 10px 0 ${INK}; color: ${INK}; pointer-events: auto; }
.df-result h2 { margin: 0; background: ${INK}; color: ${MINT}; padding: 12px 18px; font-size: 30px; font-style: italic; font-weight: 900; letter-spacing: .02em; }
.df-result h2 small { display: block; font-size: 11px; color: #e8a8b8; letter-spacing: .16em; font-style: normal; margin-bottom: 4px; }
.df-result .df-cols { display: grid; grid-template-columns: 1fr 230px; gap: 14px; padding: 14px 16px; }
.df-result table { width: 100%; border-collapse: collapse; background: #fff; border: 3px solid ${INK}; font-size: 15px; font-weight: 700; }
.df-result th { text-align: left; font-size: 10px; letter-spacing: .14em; color: #5d6b78; padding: 6px 8px; border-bottom: 3px solid ${INK}; }
.df-result td { padding: 7px 8px; border-bottom: 2px solid #efe5c9; }
.df-result td.n, .df-result th.n { text-align: center; }
.df-result tr.is-me td { background: #fff6cf; font-weight: 900; }
.df-result .df-bot { font-size: 10px; color: #5d6b78; letter-spacing: .1em; margin-left: 6px; }
.df-medal { border: 3px solid ${INK}; background: #fff; padding: 7px 10px; margin-bottom: 8px; }
.df-medal b { display: block; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
.df-medal span { font-size: 13px; color: #5d6b78; font-weight: 600; }
.df-result .df-row { display: flex; gap: 12px; align-items: center; padding: 10px 16px 14px; border-top: 3px solid ${INK}; background: #efe5c9; flex-wrap: wrap; }
.df-btn { border: 3px solid ${INK}; background: #f7f0dc; font: 900 15px/1 inherit; font-weight: 900; letter-spacing: .1em; padding: 11px 18px; box-shadow: 4px 4px 0 ${INK}; text-transform: uppercase; cursor: pointer; color: ${INK}; }
.df-btn.is-go { background: ${AMBER}; }
.df-result .df-keys { margin-left: auto; font-size: 12px; color: #5d6b78; font-weight: 700; }
.df-touch { position: absolute; right: 0; bottom: 0; width: 1px; height: 1px; }
.df-fire { position: absolute; border: 4px solid ${INK}; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 900; letter-spacing: .1em; box-shadow: 3px 4px 0 ${INK}; pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none; color: ${INK}; }
.df-fire.is-gun { right: 200px; bottom: 130px; width: 80px; height: 80px; background: ${AMBER}; }
.df-fire.is-missile { right: 206px; bottom: 36px; width: 66px; height: 66px; background: ${BAIL}; font-size: 10px; }
.df-fire.is-down { transform: translate(2px, 3px); box-shadow: 1px 1px 0 ${INK}; }
@media (max-width: 700px) { .df-me-panel { transform: scale(.8); transform-origin: left bottom; left: 10px; bottom: auto; top: 54px; } .df-feed { top: 60px; transform: scale(.85); transform-origin: right top; } }
`;

/* Squares a frame may mark before it falls back to clearing everything. */
const DIRTY_MAX = 64;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

function clockText(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

const ROCKET = (fill) => `<svg viewBox="0 0 16 32"><path d="M8 1 C12 6 12 12 12 22 L4 22 C4 12 4 6 8 1 Z" fill="${fill}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M4 18 L1 26 L4 24 Z M12 18 L15 26 L12 24 Z" fill="#e8a8b8" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const ROCKET_EMPTY = `<svg viewBox="0 0 16 32"><path d="M8 1 C12 6 12 12 12 22 L4 22 C4 12 4 6 8 1 Z" fill="none" stroke="#9db3c8" stroke-width="2" stroke-dasharray="3 2"/></svg>`;

/* The name a slot goes by on the HUD. */
export function nameOf(slot) {
  return slot === ME ? 'YOU' : (BOT_NAMES[slot - 1] || 'BOT');
}

export class DogfightHud {
  /*
   * root: the HUD layer. input: the InputManager, for the touch buttons.
   * onAgain, onChange, onLeave: the results' three buttons.
   */
  constructor(root, { input = null, onAgain = null, onChange = null, onLeave = null } = {}) {
    if (!document.getElementById('df-hud-css')) {
      const st = document.createElement('style');
      st.id = 'df-hud-css';
      st.textContent = CSS;
      document.head.append(st);
    }
    this.input = input;
    this.root = el('div', 'df-hud is-off');
    this.canvas = el('canvas', 'df-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.hurt = el('div', 'df-hurt');
    this.edgeL = el('div', 'df-edge is-left is-off');
    this.edgeR = el('div', 'df-edge is-right is-off');

    this.score = el('div', 'df-score');
    this.scoreMe = el('div', 'df-me', 'YOU 0');
    this.scoreClock = el('div', 'df-clock', '3:00');
    this.scoreBest = el('div', null, '');
    this.score.append(this.scoreMe, this.scoreClock, this.scoreBest);
    this.feed = el('div', 'df-feed');

    this.me = el('div', 'df-me-panel');
    const hl = el('div', 'df-lbl');
    this.hpText = el('em', null, '100');
    hl.append(el('span', null, 'HEALTH'), this.hpText);
    this.hpBar = el('div', 'df-bar');
    this.hpFill = el('i');
    this.hpFill.style.background = MINT;
    this.hpBar.append(this.hpFill);
    const gl = el('div', 'df-lbl');
    this.hotText = el('span', null, '');
    this.hotText.style.color = AMBER;
    gl.append(el('span', null, 'GUN'), this.hotText);
    this.heatBar = el('div', 'df-bar is-thin');
    this.heatFill = el('i');
    this.heatFill.style.background = AMBER;
    this.heatBar.append(this.heatFill);
    const ml = el('div', 'df-lbl', null);
    ml.append(el('span', null, 'MISSILES'));
    this.rack = el('div', 'df-rack');
    this.me.append(hl, this.hpBar, gl, this.heatBar, ml, this.rack);

    this.banner = el('div', 'df-banner is-off');

    /* The lettered callouts, painted once. */
    this.lockCall = el('canvas', 'df-call is-off');
    this.warnCall = el('canvas', 'df-call is-off');
    this.popCall = el('canvas', 'df-pop-call');

    this.pop = el('div', 'df-pop is-off');
    this.popSay = el('div', 'df-say', '');
    this.popBack = el('div', 'df-back', '');
    this.pop.append(this.popCall, this.popSay, this.popBack);

    this.result = el('div', 'df-result is-off');
    this.onAgain = onAgain;
    this.onChange = onChange;
    this.onLeave = onLeave;

    this.touch = el('div', 'df-touch is-off');
    this.gunBtn = el('div', 'df-fire is-gun', 'GUN');
    this.missileBtn = el('div', 'df-fire is-missile', 'MISSILE');
    this.wireTouch();
    this.touch.append(this.gunBtn, this.missileBtn);

    this.root.append(this.canvas, this.hurt, this.edgeL, this.edgeR, this.score, this.feed, this.me,
      this.banner, this.lockCall, this.warnCall, this.pop, this.result, this.touch);
    root.append(this.root);
    this.painted = false;
    this.visible = false;
    this.last = {};
    this.numbers = [];
    this.v = new THREE.Vector3();
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.lockSeen = -1;
    /* What was drawn last frame, as squares, so a frame clears those and
     * not the whole window: a full screen clear was most of the HUD's
     * cost on a software rasteriser, 0.6 ms a frame. */
    this.dirty = new Float32Array(DIRTY_MAX * 3);
    this.dirtyN = 0;
  }

  /* A square round (x, y) of half side r was drawn into. */
  mark(x, y, r) {
    if (this.dirtyN >= DIRTY_MAX) {
      return;
    }
    const j = this.dirtyN * 3;
    this.dirty[j] = x;
    this.dirty[j + 1] = y;
    this.dirty[j + 2] = r;
    this.dirtyN += 1;
  }

  /* Touch: two buttons that hold and press, through the input manager so
   * the gun and missile are read in one place. */
  wireTouch() {
    const hold = (btn, down) => {
      btn.classList.toggle('is-down', down);
    };
    this.gunBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.input) this.input.touchGun = true;
      hold(this.gunBtn, true);
      this.gunBtn.setPointerCapture?.(e.pointerId);
    });
    const up = () => {
      if (this.input) this.input.touchGun = false;
      hold(this.gunBtn, false);
    };
    this.gunBtn.addEventListener('pointerup', up);
    this.gunBtn.addEventListener('pointercancel', up);
    this.missileBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.input) this.input.missileFired = true;
      hold(this.missileBtn, true);
    });
    const mup = () => hold(this.missileBtn, false);
    this.missileBtn.addEventListener('pointerup', mup);
    this.missileBtn.addEventListener('pointercancel', mup);
  }

  paintOnce() {
    if (this.painted) {
      return;
    }
    this.painted = true;
    try {
      paintCall(this.lockCall, { word: 'LOCK!', fill: INKS.bail, size: 24 });
      paintCall(this.warnCall, { word: 'MISSILE!', fill: INKS.bail, size: 22, balloon: true });
      paintCall(this.popCall, { word: 'POP!', fill: INKS.bail, size: 96, balloon: true });
    } catch (e) {
      /* No canvas text (a test page): the HUD works without the lettering. */
    }
  }

  setVisible(on, { touch = false } = {}) {
    this.touch.classList.toggle('is-off', !(on && touch));
    if (on === this.visible) {
      return;
    }
    this.visible = on;
    this.root.classList.toggle('is-off', !on);
    if (on) {
      this.paintOnce();
    } else if (this.input) {
      this.input.touchGun = false;
    }
  }

  resize() {
    /* The window's size, which costs nothing to read. The layer's own
     * clientWidth forced the page's layout every frame, and that was most
     * of what the HUD cost: 0.5 ms of a frame. */
    const w = window.innerWidth;
    const h = window.innerHeight;
    /* Lines and numbers read at one pixel a pixel; a 4K panel at 2x
     * would be four times the canvas to clear and compose. */
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    if (w === this.w && h === this.h && dpr === this.dpr) {
      return;
    }
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    /* Setting the size cleared it. */
    this.dirtyN = 0;
  }

  /* World to screen, CSS pixels. z > 1 is behind the eye. */
  project(x, y, z, camera) {
    this.v.set(x, y, z).project(camera);
    return {
      x: (this.v.x * 0.5 + 0.5) * this.w,
      y: (-this.v.y * 0.5 + 0.5) * this.h,
      behind: this.v.z > 1 || this.v.z < -1,
    };
  }

  /* A slip in the feed: who popped whom, with what. */
  slip(by, to, weapon) {
    const s = el('div', 'df-slip');
    const who = (i) => {
      const b = el('b', i === ME ? 'df-you' : null, nameOf(i));
      return b;
    };
    s.append(who(by), document.createTextNode(' popped '), who(to));
    if (weapon === 'missile') {
      const ic = el('span');
      ic.innerHTML = ROCKET(AMBER);
      ic.firstChild.setAttribute('width', '8');
      ic.firstChild.setAttribute('height', '16');
      s.append(document.createTextNode(' '), ic);
    }
    this.feed.append(s);
    while (this.feed.childElementCount > 4) {
      this.feed.firstChild.remove();
    }
    setTimeout(() => s.classList.add('is-old'), 5000);
    setTimeout(() => s.remove(), 5700);
  }

  /* One of the game's events, as the HUD shows it. Returns a sound to play,
   * or null. */
  event(e, g, nowMs) {
    if (e.type === 'hit') {
      if (e.by === ME) {
        this.numbers.push({
          x: e.x, y: e.y, z: e.z, n: e.dmg, big: e.big, at: nowMs,
        });
        if (this.numbers.length > 24) {
          this.numbers.shift();
        }
        this.hitTick = nowMs;
        return 'clip';
      }
      if (e.to === ME) {
        this.hurtAt = nowMs;
        this.hurtFrom = { x: e.fromX, y: e.fromY, z: e.fromZ };
        this.hurt.classList.add('is-on');
        requestAnimationFrame(() => this.hurt.classList.remove('is-on'));
        return null;
      }
      return null;
    }
    if (e.type === 'pop') {
      this.slip(e.by, e.to, e.weapon);
      if (e.to === ME) {
        const who = e.by >= 0 && e.by !== ME ? nameOf(e.by) : 'Somebody';
        this.popSay.textContent = `${who} got you with ${e.weapon === 'missile' ? 'a missile' : 'the gun'}!`;
        return 'crash';
      }
      return e.by === ME ? 'gate' : null;
    }
    if (e.type === 'lock') {
      return 'select';
    }
    return null;
  }

  /*
   * Once a drawn frame. g: the game. t: between its last two feeds.
   * camera: the FPV camera. nowMs: wall time. extra: { best, rules }.
   */
  frame(g, t, camera, nowMs, extra = {}) {
    if (!this.visible) {
      return;
    }
    this.resize();
    const L = this.last;
    const ctx = this.ctx;
    const k = g.k;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.dirtyN >= DIRTY_MAX) {
      ctx.clearRect(0, 0, this.w, this.h);
    } else {
      for (let n = 0; n < this.dirtyN; n += 1) {
        const j = n * 3;
        const r = this.dirty[j + 2];
        ctx.clearRect(this.dirty[j] - r, this.dirty[j + 1] - r, r * 2, r * 2);
      }
    }
    this.dirtyN = 0;
    const alive = g.alive[ME] === 1;

    /* The reticle: where the gun points. The camera looks along it. */
    const cx = this.w / 2;
    const cy = this.h / 2;
    const rr = Math.max(34, Math.min(this.w, this.h) * 0.075);
    if (alive) {
      this.mark(cx, cy, rr + 6);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(243,234,212,0.9)';
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy - 8);
      ctx.moveTo(cx, cy + 8); ctx.lineTo(cx, cy + 16);
      ctx.moveTo(cx - 16, cy); ctx.lineTo(cx - 8, cy);
      ctx.moveTo(cx + 8, cy); ctx.lineTo(cx + 16, cy);
      ctx.stroke();
      /* A hit lands: an X in the reticle for a moment. */
      if (this.hitTick && nowMs - this.hitTick < 160) {
        ctx.strokeStyle = BAIL;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy - 12); ctx.lineTo(cx - 5, cy - 5);
        ctx.moveTo(cx + 12, cy - 12); ctx.lineTo(cx + 5, cy - 5);
        ctx.moveTo(cx - 12, cy + 12); ctx.lineTo(cx - 5, cy + 5);
        ctx.moveTo(cx + 12, cy + 12); ctx.lineTo(cx + 5, cy + 5);
        ctx.stroke();
      }
    }

    /* The bots: brackets in view, arrows off it. */
    const lockOn = g.lockOn[ME];
    const lockU = lockOn >= 0 ? Math.min(1, g.lockMs[ME] / MISSILE.lockMs) : 0;
    let lockShown = false;
    const u = 1 - t;
    const mx = g.x[ME];
    const my = g.y[ME];
    const mz = g.z[ME];
    let leadDone = false;
    const offscreen = [];
    for (let i = 0; i < MAX_PILOTS; i += 1) {
      if (i === ME || !g.inFight[i] || !g.alive[i]) {
        continue;
      }
      const x = g.xPrev[i] * u + g.x[i] * t;
      const y = g.yPrev[i] * u + g.y[i] * t;
      const z = g.zPrev[i] * u + g.z[i] * t;
      const dx = x - mx;
      const dy = y - my;
      const dz = z - mz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const p = this.project(x, y, z, camera);
      const on = !p.behind && p.x > 8 && p.x < this.w - 8 && p.y > 8 && p.y < this.h - 8;
      if (!on) {
        offscreen.push({ i, d, p });
        continue;
      }
      const locking = i === lockOn && alive;
      const s = Math.max(12, Math.min(46, (40 * k * 6) / Math.max(d, 0.1)));
      const grow = locking ? s + (1 - lockU) * 26 : s;
      const shielded = !g.hittable(i);
      this.mark(p.x, p.y, grow + 40);
      ctx.strokeStyle = locking ? (lockU >= 1 ? '#ff3b5c' : BAIL) : (shielded ? 'rgba(157,179,200,0.8)' : AMBER);
      ctx.lineWidth = locking ? 4 : 3;
      const c = Math.max(6, grow * 0.35);
      const h2 = grow * 0.7;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const ex = p.x + sx * grow;
        const ey = p.y + sy * h2;
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - sx * c, ey);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex, ey - sy * c);
      }
      ctx.stroke();
      /* Health pips under it. */
      const pips = 6;
      const left = Math.ceil((g.hp[i] / g.hpMax) * pips);
      for (let n = 0; n < pips; n += 1) {
        ctx.fillStyle = n < left ? MINT : 'rgba(11,17,22,0.55)';
        ctx.fillRect(p.x - 25 + n * 9, p.y + h2 + 6, 7, 4);
      }
      if (d > 30 * k) {
        ctx.font = '800 11px system-ui, sans-serif';
        ctx.fillStyle = CREAM;
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(d / k)} m`, p.x, p.y + h2 + 22);
      }
      if (locking && lockU >= 1) {
        lockShown = true;
        this.lockCall.style.left = `${Math.round(p.x + grow + 8)}px`;
        this.lockCall.style.top = `${Math.round(p.y - 10)}px`;
      }
      /* The lead diamond, on the lock or the nearest one in the circle. */
      if (alive && !leadDone && (locking || d < GUN.range * k)) {
        const front = (dx * camFwd(camera).x + dy * camFwd(camera).y + dz * camFwd(camera).z) / Math.max(d, 1e-6);
        if (front > LOCK_COS - 0.03 || locking) {
          const tof = d / (GUN.speed * k);
          const lx = x + (g.vx[i] - g.vx[ME]) * tof;
          const ly = y + (g.vy[i] - g.vy[ME]) * tof;
          const lz = z + (g.vz[i] - g.vz[ME]) * tof;
          const q = this.project(lx, ly, lz, camera);
          if (!q.behind) {
            this.mark(q.x, q.y, 12);
            ctx.fillStyle = MINT;
            ctx.strokeStyle = INK;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(q.x, q.y - 8); ctx.lineTo(q.x + 8, q.y); ctx.lineTo(q.x, q.y + 8); ctx.lineTo(q.x - 8, q.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            leadDone = true;
          }
        }
      }
    }
    this.lockCall.classList.toggle('is-off', !lockShown);
    /* The nearest three off screen, as arrows on the edge. */
    offscreen.sort((a, b) => a.d - b.d);
    for (let n = 0; n < Math.min(3, offscreen.length); n += 1) {
      const o = offscreen[n];
      this.edgeArrow(ctx, o.p, AMBER, nameOf(o.i));
    }

    /* A missile coming: the edge it is on, and MISSILE! */
    const inc = alive ? g.incoming(ME) : -1;
    let warnSide = 0;
    if (inc >= 0) {
      const p = this.project(g.mx[inc], g.my[inc], g.mz[inc], camera);
      const at = this.edgeArrow(ctx, p, BAIL, null, true);
      warnSide = at.x < this.w / 2 ? -1 : 1;
      this.warnCall.classList.remove('is-off');
      this.warnCall.style.left = `${Math.round(warnSide < 0 ? 52 : this.w - 52 - (this.warnCall.width || 140))}px`;
      this.warnCall.style.top = `${Math.round(Math.max(60, Math.min(this.h - 120, at.y - 24)))}px`;
    } else {
      this.warnCall.classList.add('is-off');
    }
    if (L.warnSide !== warnSide) {
      L.warnSide = warnSide;
      this.edgeL.classList.toggle('is-off', warnSide !== -1);
      this.edgeR.classList.toggle('is-off', warnSide !== 1);
    }

    /* The damage numbers, rising and fading. */
    ctx.textAlign = 'center';
    for (let n = this.numbers.length - 1; n >= 0; n -= 1) {
      const d = this.numbers[n];
      const age = nowMs - d.at;
      if (age > 900) {
        this.numbers.splice(n, 1);
        continue;
      }
      const p = this.project(d.x, d.y, d.z, camera);
      if (p.behind) {
        continue;
      }
      const size = d.big ? 30 : 20;
      ctx.font = `italic 900 ${size}px system-ui, sans-serif`;
      ctx.globalAlpha = age > 600 ? 1 - (age - 600) / 300 : 1;
      const yy = p.y - 18 - age * 0.04;
      const xx = p.x + 18 + ((n * 7) % 13);
      this.mark(xx, yy - size * 0.4, size * 1.6);
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.strokeText(d.big ? `${d.n}!` : String(d.n), xx, yy);
      ctx.fillStyle = d.big ? BAIL : AMBER;
      ctx.fillText(d.big ? `${d.n}!` : String(d.n), xx, yy);
      ctx.globalAlpha = 1;
    }

    /* The score and the clock. */
    const meScore = g.pops[ME];
    let bestBot = -1;
    for (let i = 1; i < MAX_PILOTS; i += 1) {
      if (g.inFight[i] && (bestBot < 0 || g.pops[i] > g.pops[bestBot])) {
        bestBot = i;
      }
    }
    const left = g.roundMs ? g.leftMs() : -1;
    const clock = left >= 0 ? clockText(left) : (g.popsToWin ? `FIRST TO ${g.popsToWin}` : 'FREE');
    if (L.meScore !== meScore) {
      L.meScore = meScore;
      this.scoreMe.textContent = `YOU ${meScore}`;
    }
    if (L.clock !== clock) {
      L.clock = clock;
      this.scoreClock.textContent = clock;
    }
    const best = bestBot >= 0 ? `${nameOf(bestBot)} ${g.pops[bestBot]}` : '';
    if (L.best !== best) {
      L.best = best;
      this.scoreBest.textContent = best;
      this.scoreBest.classList.toggle('is-off', !best);
    }

    /* The pilot's own panel. */
    const hp = Math.max(0, Math.round(g.hp[ME]));
    if (L.hp !== hp) {
      L.hp = hp;
      this.hpText.textContent = String(hp);
      const f = hp / g.hpMax;
      this.hpFill.style.transform = `scaleX(${f})`;
      this.hpFill.style.background = f > 0.5 ? MINT : (f > 0.25 ? AMBER : BAIL);
    }
    const heat = Math.round(g.heat[ME] * 50) / 50;
    if (L.heat !== heat) {
      L.heat = heat;
      this.heatFill.style.transform = `scaleX(${heat})`;
    }
    const hot = g.hot[ME] ? 'HOT' : '';
    if (L.hot !== hot) {
      L.hot = hot;
      this.hotText.textContent = hot;
      this.heatFill.style.background = hot ? BAIL : AMBER;
    }
    const next = g.rack[ME] < MISSILE.rack && g.reloadAt[ME] > 0
      ? Math.max(1, Math.ceil((g.reloadAt[ME] - g.clockMs) / 1000)) : 0;
    const rackKey = `${g.rack[ME]}:${next}`;
    if (L.rack !== rackKey) {
      L.rack = rackKey;
      let html = '';
      for (let n = 0; n < MISSILE.rack; n += 1) {
        html += n < g.rack[ME] ? ROCKET(AMBER) : ROCKET_EMPTY;
      }
      if (next) {
        html += `<span>NEXT ${next} s</span>`;
      }
      this.rack.innerHTML = html;
    }

    /* Popped, waiting to come back, and the words before a round. */
    const out = !alive && !g.over;
    const back = out ? Math.max(1, Math.ceil((g.backAt[ME] - g.clockMs) / 1000)) : 0;
    if (L.out !== out || L.back !== back) {
      L.out = out;
      L.back = back;
      this.pop.classList.toggle('is-off', !out);
      this.popBack.innerHTML = out ? `BACK IN <b>${back}</b>` : '';
    }
    let banner = '';
    if (!g.over && alive) {
      if (g.startedMs < 0) {
        const n = g.rules.bots;
        banner = n ? `Take off to start. ${n === 1 ? 'One bot is' : `${n} bots are`} waiting.` : 'Take off to start the round.';
      } else if (g.shieldUntil[ME] === Infinity) {
        banner = 'Take off. You have a shield until you fire.';
      }
    }
    if (L.banner !== banner) {
      L.banner = banner;
      this.banner.textContent = banner;
      this.banner.classList.toggle('is-off', !banner);
    }

    /* The results. */
    if (L.over !== g.over) {
      L.over = g.over;
      this.result.classList.toggle('is-off', !g.over);
      if (g.over) {
        this.showResult(g, extra);
      }
    }
    const nextRound = g.over ? Math.max(1, Math.ceil((extra.nextMs || 0) / 1000)) : 0;
    if (g.over && this.resultKeys && L.nextRound !== nextRound) {
      L.nextRound = nextRound;
      this.resultKeys.textContent = `Next round in ${nextRound} s`;
    }
  }

  /* An arrow on the screen's edge toward something off it. Returns where
   * on the edge it was drawn. */
  edgeArrow(ctx, p, colour, label, big = false) {
    const cx = this.w / 2;
    const cy = this.h / 2;
    let dx = p.x - cx;
    let dy = p.y - cy;
    if (p.behind) {
      dx = -dx;
      dy = -dy;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        dy = 1;
      }
    }
    const m = 34;
    const sx = (cx - m) / Math.max(Math.abs(dx), 1e-6);
    const sy = (cy - m) / Math.max(Math.abs(dy), 1e-6);
    const s = Math.min(sx, sy);
    const x = cx + dx * s;
    const y = cy + dy * s;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const r = big ? 22 : 15;
    this.mark(x, y, r + 4);
    ctx.fillStyle = colour;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + ux * r, y + uy * r);
    ctx.lineTo(x - ux * r * 0.6 - uy * r * 0.8, y - uy * r * 0.6 + ux * r * 0.8);
    ctx.lineTo(x - ux * r * 0.2, y - uy * r * 0.2);
    ctx.lineTo(x - ux * r * 0.6 + uy * r * 0.8, y - uy * r * 0.6 - ux * r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (label) {
      this.mark(x - ux * 34, y - uy * 30, 44);
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeText(label, x - ux * 34, y - uy * 30 + 4);
      ctx.fillStyle = CREAM;
      ctx.fillText(label, x - ux * 34, y - uy * 30 + 4);
    }
    return { x, y };
  }

  showResult(g, extra) {
    const rows = g.standings();
    const top = rows[0];
    const meRow = rows.find((r) => r.slot === ME);
    const won = top && top.slot === ME && (rows.length === 1 || rows[1].pops < top.pops);
    const tie = top && rows.length > 1 && rows[1].pops === top.pops && (top.slot === ME || rows[1].slot === ME);
    const title = won ? 'YOU WIN!' : (tie ? 'A DRAW!' : `${nameOf(top.slot)} WINS`);
    const h = el('h2');
    h.append(el('small', null, extra.kicker || 'Dogfight'), document.createTextNode(title));
    const table = el('table');
    const head = el('tr');
    head.append(el('th', null, 'PILOT'), el('th', 'n', 'POPS'), el('th', 'n', 'POPPED'), el('th', 'n', 'HITS'));
    table.append(head);
    for (const r of rows) {
      const tr = el('tr', r.slot === ME ? 'is-me' : null);
      const name = el('td', null, nameOf(r.slot));
      if (r.bot) {
        name.append(el('span', 'df-bot', 'BOT'));
      }
      const acc = r.shots ? `${Math.round((r.hits / r.shots) * 100)}%` : '0%';
      tr.append(name, el('td', 'n', String(r.pops)), el('td', 'n', String(r.popped)), el('td', 'n', acc));
      table.append(tr);
    }
    const medals = el('div');
    const medal = (b, s) => {
      const m = el('div', 'df-medal');
      m.append(el('b', null, b), el('span', null, s));
      medals.append(m);
    };
    if (meRow) {
      if (meRow.longest > 0) {
        medal('Longest missile', `${Math.round(meRow.longest)} m`);
      }
      medal('Best streak', `${meRow.bestStreak} ${meRow.bestStreak === 1 ? 'pop' : 'pops'} without being popped`);
      medal('Dodged', `${meRow.dodged} ${meRow.dodged === 1 ? 'missile' : 'missiles'} turned away`);
      if (extra.best != null) {
        medal('Your best here', extra.newBest ? `${extra.best} pops, a new best` : `${extra.best} pops`);
      }
    }
    const cols = el('div', 'df-cols');
    cols.append(table, medals);
    const row = el('div', 'df-row');
    const again = el('button', 'df-btn is-go', 'Again');
    const change = el('button', 'df-btn', 'Change the fight');
    const leave = el('button', 'df-btn', 'Leave');
    again.type = 'button';
    change.type = 'button';
    leave.type = 'button';
    again.addEventListener('click', () => this.onAgain && this.onAgain());
    change.addEventListener('click', () => this.onChange && this.onChange());
    leave.addEventListener('click', () => this.onLeave && this.onLeave());
    /* The next round starts on its own, so a pilot on a radio who cannot
     * reach the buttons is never stuck here. */
    const keys = el('span', 'df-keys', '');
    this.resultKeys = keys;
    row.append(again, change, leave, keys);
    this.result.replaceChildren(h, cols, row);
  }

  dispose() {
    this.root.remove();
  }
}

/* The camera's forward in the world, re-used. */
const fwdScratch = new THREE.Vector3();
function camFwd(camera) {
  return camera.getWorldDirection(fwdScratch);
}
