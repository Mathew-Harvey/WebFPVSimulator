/*
 * chasehud.js: the chase on the screen. The Tail meter while a tail builds,
 * and a callout for each thing the chase scores or loses (src/game/chase.js,
 * FREESTYLE-MAPS-PLAN.md section 7 item 4, Stage E).
 *
 * THE SAME CLOTHES AS THE SCORE. Outlined type that reads over a lit road
 * (.score-cut), cream for the words, amber for the number at risk, mint for
 * what has been banked and the saturated sakura the score bails in for what
 * has been lost; the callouts are lettered in ink with a ray fan thrown
 * behind them, like the found mark's. Modest on purpose: Stage F restyles
 * everything on this layer into the manga lettering of section 3.2.
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
    this.root.className = on ? 'chase-hud' : 'chase-hud is-off';
    if (!on) {
      this.clearTransient();
    }
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
    call.append(el('div', 'chase-call-burst'), el('div', 'chase-call-word', t.word), el('div', 'chase-call-line', t.line));
    this.calls.append(call);
    while (this.calls.childElementCount > CALL_STACK_MAX) {
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

  dispose() {
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }
}
