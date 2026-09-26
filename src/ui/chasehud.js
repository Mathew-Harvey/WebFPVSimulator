/*
 * chasehud.js: the chase on the screen. The Tail meter while a tail builds,
 * and a callout for each thing the chase scores or loses (src/game/chase.js,
 * FREESTYLE-MAPS-PLAN.md section 7 item 4, Stage E).
 *
 * THE SAME CLOTHES AS THE SCORE. Outlined type that reads over a lit road
 * (.score-cut), cream for the words, amber for the number at risk, mint for
 * what has been banked and the saturated sakura the score bails in for what
 * has been lost. On a freestyle map the callouts are hand lettered, in the
 * hand the score's names are (src/ui/lettering.js, section 3.2 item 3),
 * with a ray fan thrown behind them and a small sound effect beside a
 * banked tail and a thread: ブーン for a tail, キキーッ for the drift car's,
 * ギュン for a thread. Clean FPV gives them back as plain type. The meter is
 * the same on both: it is an instrument, not a callout.
 *
 * DOWN THE RIGHT, UNDER THE MARK. The left column is the score's, the top
 * centre is the run clock's, the bottom corners are the pack's and the
 * speed's and the middle third is the pilot's, who is looking at the car.
 * The meter sits on the right a little under the middle, over the speed
 * corner, where a glance off the car finds it; the callouts stack upward
 * from just over it, so the word and the meter it came from are one place.
 *
 * WHAT THE METER SAYS AT A GLANCE: TAIL and the car's name, the seconds
 * held, big, in amber because they are at risk until they bank, and a bar
 * that fills over ten seconds (TAIL_FULL_MS). Mint while held; amber and
 * blinking while the craft is out of the band and the grace runs, which is
 * the one moment the pilot has to do something about it. The drift car's
 * meter carries an x2 chip and an orange fill, because its tail is worth
 * double.
 *
 * NO ANIMATION LOOP, the rule src/ui/scorehud.js opens with: every moving
 * thing is a keyframe on a node a timer removes, and meter() writes nothing
 * on a frame where nothing it shows has changed.
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

import { formatScore } from '../game/score.js';
import { TAIL_DRIFT_WEIGHT } from '../game/chase.js';
import {
  INKS, SFX, callSize, letterCanvas, paintCall, paintSfx, sideRoom,
} from './lettering.js';

/* Local, as scorehud.js keeps its own. */
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

/* How long a callout is up, in ms. The chase-call keyframes in index.html
 * run this long: change both. */
export const CHASE_CALL_MS = 1800;

/* At most this many callouts at once; the oldest goes. A thread and a tail
 * banking together is two, and three is already a lot to read at speed. */
const CALL_STACK_MAX = 3;

/* A phone on its side: see the media query under .chase-calls. */
function shortScreen() {
  return typeof window !== 'undefined' && window.innerHeight < 560;
}

/* The column's margin at its widest, .chase-calls' `right` in index.html
 * (clamp(18px, 3vw, 40px)): what the lettering takes off the outer third. */
const COLUMN_RIGHT = 40;

/*
 * The sound effect a callout carries, or null. A banked tail and a thread,
 * the chase's big moments (decision 11: gaps, combos and a banked tail);
 * not a hurdle, which is a hop, and never a loss.
 */
export function chaseSfx(e) {
  if (!e || e.kind === 'lost' || !(e.value > 0)) {
    return null;
  }
  if (e.kind === 'tail') {
    return e.drift ? SFX.drift : SFX.tail;
  }
  return e.kind === 'thread' ? SFX.thread : null;
}

/*
 * What a callout says for an event: the word, big, and the line under it.
 * Returns null for an event this HUD has nothing to say about. Exported so
 * the shell's announcer can say the same thing the screen does.
 */
export function chaseCallText(e) {
  if (!e) {
    return null;
  }
  if (e.kind === 'lost') {
    return {
      word: `${e.name} lost`,
      line: e.why === 'contact' ? 'Hit a car' : 'Crashed',
      lost: true,
    };
  }
  if (!(e.value > 0)) {
    return null;
  }
  const pts = `+${formatScore(e.value)}`;
  if (e.kind === 'tail') {
    return { word: e.name, line: `${(e.ms / 1000).toFixed(1)} s  ${pts}`, lost: false };
  }
  return { word: e.name, line: pts, lost: false };
}

export class ChaseHud {
  constructor(root) {
    this.root = el('div', 'chase-hud is-off');

    this.box = el('div', 'chase-meter is-off');
    const head = el('div', 'chase-meter-head score-cut');
    head.append(el('span', 'chase-meter-kind', 'Tail'));
    /* What the drift car's tail is worth against an ordinary car's: the
     * label already says which car it is, the chip says why it matters. */
    this.drift = el('span', 'chase-meter-drift', `x${TAIL_DRIFT_WEIGHT}`);
    this.drift.hidden = true;
    this.car = el('span', 'chase-meter-car', '');
    head.append(this.drift, this.car);
    const line = el('div', 'chase-meter-line score-cut');
    this.time = el('span', 'chase-meter-time', '0.0');
    this.pts = el('span', 'chase-meter-pts', '');
    line.append(this.time, el('span', 'chase-meter-unit', 's'), this.pts);
    const bar = el('div', 'chase-meter-bar');
    this.fill = el('div', 'chase-meter-fill');
    bar.append(this.fill);
    this.box.append(head, line, bar);

    this.calls = el('div', 'chase-calls');

    this.root.append(this.box, this.calls);
    root.append(this.root);

    this.visible = false;
    this.manga = false;
    this.clearShown();
  }

  clearShown() {
    this.shownOn = false;
    this.shownCls = '';
    this.shownSlot = -1;
    this.shownTenths = -1;
    this.shownValue = -1;
    this.shownFill = -1;
  }

  setVisible(on) {
    if (on === this.visible) {
      return;
    }
    this.visible = on;
    this.root.className = this.rootClass();
    if (!on) {
      this.clearTransient();
    }
  }

  rootClass() {
    return `chase-hud ${this.manga ? 'is-manga' : 'is-clean'}${this.visible ? '' : ' is-off'}`;
  }

  /*
   * The manga layer on or off, as the score's is (ScoreHud.setManga): on a
   * freestyle map unless the pilot chose Clean FPV. Off gives the callouts
   * back as plain type; the meter is the same either way.
   */
  setManga(on) {
    const m = Boolean(on);
    if (m === this.manga) {
      return;
    }
    this.manga = m;
    this.root.className = this.rootClass();
  }

  /* The meter down and the callouts gone: a new run, a new map, or the
   * flight screen left. */
  clearTransient() {
    this.calls.textContent = '';
    this.box.className = 'chase-meter is-off';
    this.clearShown();
  }

  reset() {
    this.clearTransient();
  }

  /*
   * Once a frame, from chase.view(). Null, or a view with nothing open,
   * takes the meter down. Every write is guarded on a change, as the
   * score's are.
   */
  meter(v) {
    if (!v || !v.on) {
      if (this.shownOn) {
        this.box.className = 'chase-meter is-off';
        this.clearShown();
      }
      return;
    }
    this.shownOn = true;
    const cls = `chase-meter${v.drift ? ' is-drift' : ''}${v.grace ? ' is-grace' : ''}`;
    if (cls !== this.shownCls) {
      this.shownCls = cls;
      this.box.className = cls;
    }
    if (v.slot !== this.shownSlot) {
      this.shownSlot = v.slot;
      this.car.textContent = v.label || 'Car';
      this.drift.hidden = !v.drift;
    }
    const tenths = Math.floor(v.heldMs / 100);
    if (tenths !== this.shownTenths) {
      this.shownTenths = tenths;
      this.time.textContent = (tenths / 10).toFixed(1);
    }
    if (v.value !== this.shownValue) {
      this.shownValue = v.value;
      this.pts.textContent = v.value > 0 ? `+${formatScore(v.value)}` : '';
    }
    /* A transform, not a width, for the score bar's reason; and only when it
     * has moved by a pixel's worth or so, which at 10 s full is 20 ms. */
    const f = v.fill > 1 ? 1 : (v.fill > 0 ? v.fill : 0);
    if (f - this.shownFill > 0.002 || this.shownFill - f > 0.002 || (f === 1 && this.shownFill !== 1)) {
      this.shownFill = f;
      this.fill.style.transform = `scaleX(${f})`;
    }
  }

  /* chase.drainEvents()' list, or null. */
  events(list) {
    if (!list) {
      return;
    }
    for (const e of list) {
      this.event(e);
    }
  }

  /* One event: a callout, if it says anything. */
  event(e) {
    const t = chaseCallText(e);
    if (!t || !this.visible) {
      return;
    }
    const call = el('div', `chase-call${t.lost ? ' is-lost' : ''}${e.drift ? ' is-drift' : ''}`);
    /* The burst first, so the type paints over the rays by DOM order: see
     * .score-name > span in index.html for why not a z-index. */
    call.append(el('div', 'chase-call-burst'));
    if (this.manga) {
      this.letter(call, e, t);
    } else {
      call.append(el('div', 'chase-call-word', t.word), el('div', 'chase-call-line', t.line));
    }
    this.calls.append(call);
    /* Two on a phone on its side, where three lettered callouts hanging
     * from under the meter reach down over the speed readout. */
    const max = shortScreen() ? CALL_STACK_MAX - 1 : CALL_STACK_MAX;
    while (this.calls.childElementCount > max) {
      this.calls.removeChild(this.calls.firstChild);
    }
    /* The timer removes it rather than animationend, which is not promised
     * on a node whose animation never runs (reduced motion). */
    setTimeout(() => {
      if (call.parentNode === this.calls) {
        this.calls.removeChild(call);
      }
    }, CHASE_CALL_MS + 200);
  }

  /*
   * The lettered callout: the word and the line under it, right set, on one
   * canvas fitted to the outer third, and its sound effect on a canvas of
   * its own on the inside of the word, landing a beat later. The colours
   * are the plain callout's: cream, the drift car's orange, sakura for a
   * loss; mint for the line that pays and slate for the one that says why.
   */
  letter(call, e, t) {
    const size = callSize(shortScreen() ? 1 : 1.2);
    const sfx = chaseSfx(e);
    let room = sideRoom(COLUMN_RIGHT);
    const row = el('div', 'chase-call-row');
    if (sfx) {
      const fx = letterCanvas('lettering-sfx');
      const w = paintSfx(fx, sfx, Math.round(Math.min(26, Math.max(14, size * 0.72))), INKS.cream).w;
      const tuck = Math.round(w * 0.12);
      fx.style.marginRight = `${-tuck}px`;
      room -= w - tuck;
      row.append(fx);
    }
    const word = letterCanvas('lettering');
    paintCall(word, {
      word: t.word,
      fill: t.lost ? INKS.bail : (e.drift ? INKS.drift : INKS.cream),
      line: t.line,
      lineFill: t.lost ? INKS.slate : INKS.mint,
      size,
      align: 'right',
      maxW: room,
    });
    row.append(word);
    call.append(row);
  }

  dispose() {
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }
}
