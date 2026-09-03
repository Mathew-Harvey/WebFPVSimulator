/*
 * scorehud.js: the freestyle score, on the screen, the way Tony Hawk does it.
 *
 * THE THING BEING COPIED, precisely, because "like Tony Hawk" is not a
 * specification. THPS puts four separate readouts on screen and each one
 * does a different job:
 *
 *   1. The running total, top left, permanent, and it only ever goes up.
 *   2. The trick name, shouted the instant the trick is recognised, one
 *      line per trick, stacking upward and fading out on its own.
 *   3. The live combo: the points in the chain and the multiplier they will
 *      be worth, sitting under the names, redrawn every frame so the number
 *      climbs while you are still flying.
 *   4. The verdict. The combo line either banks, and the number flies into
 *      the total, or it BAILS in red and the number goes to nothing.
 *
 * Number 4 is the one that matters. A score that only counts up is a
 * counter. A score that can be lost in front of you is a game, and the whole
 * reason the combo is drawn separately from the total is so that the pilot
 * can see exactly how much is at risk before they decide to try one more
 * thing.
 *
 * WHERE IT SITS. Down the left, because the existing flight OSD has the top
 * centre (lap clock), both bottom corners (pack and speed) and the bottom
 * centre (the stick ghost). The left column between the top and the bottom
 * corner is the only run of screen this can have without covering something
 * a pilot is already reading, and it happens to be where THPS puts it.
 *
 * NO ANIMATION LOOP. Everything that moves is a CSS keyframe on a node that
 * removes itself when the animation ends. This file never asks for a frame,
 * never holds a timer that outlives the run, and does no work at all on a
 * frame where nothing changed except the combo bar, because a rAF driven
 * overlay competing with the render loop is how a smooth sim gets a stutter
 * that nobody can find.
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

/* Local, because ui.js keeps its own copy private and this file is meant to
 * be readable without it. */
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

/*
 * How many trick names may stack up before the oldest is dropped.
 *
 * A twelve trick combo would otherwise write a column of names taller than
 * the screen. Six is what fits beside the quad at 720p without reaching the
 * pack readout, and the combo line under them says how many there really
 * are, so nothing is hidden, only elided.
 */
const NAME_STACK_MAX = 6;

/* How long a name stays up. Long enough to read at speed, short enough that
 * a fast chain does not become a wall of text. Must match the CSS. */
const NAME_LIFE_MS = 2200;

/*
 * THE COMBO TIERS, and what each one is called.
 *
 * A multiplier is a number and a number is not a feeling. Tony Hawk never
 * shouted the multiplier at you, it shouted a WORD, and the word is what
 * tells a pilot they are into something worth not binning. The threshold is
 * the multiplier the scorer already computes, so this adds no state and no
 * second opinion about how well the run is going.
 *
 * The Japanese half is not decoration. The town is a Japanese one, it reads
 * its own signage, and the score is the only thing on screen that was
 * speaking a different language from the place it sits in. Each is the
 * ordinary spoken word a person would actually use, not a translation of
 * the English one.
 */
const TIERS = [
  { at: 2, en: 'Nice', jp: 'いいね' },
  { at: 3, en: 'Sweet', jp: 'すごい' },
  { at: 4, en: 'Wild', jp: 'やばい' },
  { at: 5, en: 'Perfect', jp: '最高' },
];

function tierFor(mult) {
  let hit = null;
  for (const t of TIERS) {
    if (mult >= t.at) {
      hit = t;
    }
  }
  return hit;
}

/*
 * A ray fan, thrown behind a trick name and thrown away again.
 *
 * One node, one keyframe, self removing: the rule this file opens with. The
 * colour follows the execution, so a bumped trick bursts in the same pink
 * its name is written in and the pilot never has to read the tag to know
 * something was clipped.
 */
function burst(host, colour) {
  const n = el('div', 'score-burst');
  if (colour) {
    n.style.setProperty('--burst', colour);
  }
  host.append(n);
  const drop = () => {
    if (n.parentNode === host) {
      host.removeChild(n);
    }
  };
  n.addEventListener('animationend', drop, { once: true });
  setTimeout(drop, 900);
}

export class ScoreHud {
  constructor(root) {
    this.root = el('div', 'score-hud is-off');

    this.totalBox = el('div', 'score-total');
    this.totalBox.append(el('div', 'score-label', 'Score'));
    this.totalValue = el('div', 'score-value score-cut', '0');
    this.totalBox.append(this.totalValue);
    /*
     * NO CLOCK HERE, deliberately.
     *
     * A run is two minutes now and it needs a clock, and this looked like
     * the place for one: it is where the score is. It is not. Freestyle
     * already draws a clock in the OSD's top centre slot, where the lap
     * clock lives and where a pilot's eye already goes for one, and a
     * second clock beside the score is two answers to the same question.
     * See setOsd in src/ui/ui.js, which counts the run down in that slot
     * and used to count an airtime up in it.
     */

    /* The trick names, newest at the bottom so the eye does not have to
     * track upward to find the thing that just happened. */
    this.names = el('div', 'score-names');

    this.comboBox = el('div', 'score-combo is-off');
    this.comboPoints = el('span', 'score-combo-points', '0');
    this.comboMult = el('span', 'score-combo-mult', '');
    const line = el('div', 'score-combo-line score-cut');
    line.append(this.comboPoints, this.comboMult);
    this.comboBar = el('div', 'score-combo-fill');
    const bar = el('div', 'score-combo-bar');
    bar.append(this.comboBar);
    this.comboBox.append(line, bar);

    /* The tier badge lives on the combo line, beside the number it is
     * describing, because it is a word for that number and nothing else. */
    this.tier = el('span', 'score-tier');
    this.tier.hidden = true;
    this.tierEn = el('span', 'score-tier-en');
    this.tierJp = el('span', 'score-tier-jp');
    this.tier.append(this.tierEn, this.tierJp);
    line.append(this.tier);

    /* Banked and bailed both land here, in the middle of the screen, because
     * that is the one moment the pilot should look away from the quad. */
    this.verdict = el('div', 'score-verdict score-cut');

    /* Speed lines down both edges, driven entirely by a class on the root.
     * Behind everything, so it can never sit over a number. */
    this.lines = el('div', 'score-lines');

    this.root.append(this.lines, this.totalBox, this.names, this.comboBox, this.verdict);
    root.append(this.root);

    this.shownTotal = -1;
    this.shownPoints = -1;
    this.shownMult = -1;
    this.shownTier = -1;
    this.visible = false;
  }

  setVisible(on) {
    if (on === this.visible) {
      return;
    }
    this.visible = on;
    this.root.className = on ? this.rootClass() : `${this.rootClass()} is-off`;
    if (!on) {
      this.clearTransient();
    }
  }

  /* The root carries the combo tier, because the speed lines are drawn from
   * it and they belong to the whole frame rather than to the combo box. */
  rootClass() {
    const t = this.shownMult >= 5 ? 5 : (this.shownMult >= 4 ? 4 : (this.shownMult >= 3 ? 3 : 0));
    return t ? `score-hud tier-${t}` : 'score-hud';
  }

  /* Wipe the names, the combo line and any verdict, leaving the total. Used
   * on a map change and when the flight screen is left. */
  clearTransient() {
    this.names.textContent = '';
    this.comboBox.className = 'score-combo is-off';
    this.verdict.className = 'score-verdict score-cut';
    this.verdict.textContent = '';
    this.shownPoints = -1;
    this.shownMult = -1;
    this.shownTier = -1;
    this.tier.hidden = true;
    if (this.visible) {
      this.root.className = 'score-hud';
    }
  }

  reset() {
    this.clearTransient();
    this.totalValue.textContent = '0';
    this.shownTotal = 0;
  }

  /*
   * Once a frame, from the scorer's view(). Every write is guarded on the
   * value having changed, because setting textContent to the string it
   * already holds still costs a style invalidation, and this runs at frame
   * rate over a 1 kHz simulation.
   */
  update(view) {
    if (!view) {
      return;
    }
    if (view.total !== this.shownTotal) {
      this.shownTotal = view.total;
      this.totalValue.textContent = formatScore(view.total);
    }
    const c = view.combo;
    if (!c) {
      if (this.comboBox.className !== 'score-combo is-off') {
        this.comboBox.className = 'score-combo is-off';
        this.shownPoints = -1;
        this.shownMult = -1;
      }
      return;
    }
    if (this.comboBox.className !== 'score-combo') {
      this.comboBox.className = 'score-combo';
    }
    if (c.points !== this.shownPoints) {
      this.shownPoints = c.points;
      this.comboPoints.textContent = formatScore(c.points);
    }
    if (c.mult !== this.shownMult) {
      this.shownMult = c.mult;
      this.comboMult.textContent = c.mult > 1 ? ` x ${c.mult}` : '';
      /* Tier: the colour of the number, the badge beside it and the speed
       * lines down the frame are one decision made once, here. */
      const t = tierFor(c.mult);
      const step = t ? t.at : 0;
      if (step !== this.shownTier) {
        this.shownTier = step;
        this.comboBox.className = step ? `score-combo tier-${step}` : 'score-combo';
        if (t) {
          this.tier.hidden = false;
          this.tierEn.textContent = t.en;
          this.tierJp.textContent = t.jp;
          /* Restart the badge's landing animation on each new tier. */
          this.tier.style.animation = 'none';
          void this.tier.offsetWidth;
          this.tier.style.animation = '';
        } else {
          this.tier.hidden = true;
        }
        if (this.visible) {
          this.root.className = this.rootClass();
        }
      }
    }
    /* The bar is a transform, not a width: a width change relayouts the
     * whole overlay every frame and a transform does not. */
    this.comboBar.style.transform = `scaleX(${c.remain})`;
  }

  /* The scorer's queued events, at most a handful a frame. */
  events(list) {
    if (!list) {
      return;
    }
    for (const e of list) {
      if (e.kind === 'trick') {
        this.pushName(e.name, e.points, e.execution);
      } else if (e.kind === 'bank') {
        this.showVerdict(`+${formatScore(e.points)}`, 'is-bank');
        this.ring('');
      } else if (e.kind === 'bail') {
        this.showVerdict(e.points > 0 ? `Bailed  -${formatScore(e.points)}` : 'Bailed', 'is-bail');
        this.ring('is-bail');
        this.names.textContent = '';
      }
    }
  }

  /*
   * One trick name. The execution shows as a colour rather than as a second
   * line: clean is cream, sloppy is amber, a bump is amber and struck
   * through in the sense that its number is already halved, and the number
   * beside the name is what it was actually worth after every penalty, not
   * the catalogue price. A pilot who flies the same trick four times should
   * be able to SEE the repeat penalty happening.
   */
  pushName(name, points, execution) {
    const row = el('div', 'score-name score-cut');
    if (execution === 'SLOPPY') {
      row.classList.add('is-sloppy');
    } else if (execution === 'BUMP') {
      row.classList.add('is-bump');
    }
    /* The ink burst goes on the ROW, so it travels with the name up the
     * stack and cannot be left behind pointing at nothing, and it goes on
     * FIRST so the type is painted over it. See .score-name > span. */
    burst(row, execution === 'BUMP'
      ? '#ff7d96'
      : (execution === 'SLOPPY' ? 'var(--amber)' : 'var(--cream)'));
    row.append(el('span', 'score-name-text', name));
    row.append(el('span', 'score-name-points', formatScore(points)));
    if (execution !== 'CLEAN') {
      row.append(el('span', 'score-name-tag', execution.toLowerCase()));
    }
    this.names.append(row);
    while (this.names.childElementCount > NAME_STACK_MAX) {
      this.names.removeChild(this.names.firstChild);
    }
    /* animationend is not guaranteed on a node whose animation never runs,
     * for instance under prefers-reduced-motion, so the timer is the one
     * that actually removes it and the event only makes it prompt. */
    const drop = () => {
      if (row.parentNode === this.names) {
        this.names.removeChild(row);
      }
    };
    row.addEventListener('animationend', drop, { once: true });
    setTimeout(drop, NAME_LIFE_MS + 400);
  }

  /*
   * A hard ring, once, on a bank or a bail. Two of them a hundred
   * milliseconds apart, because one ring reads as a circle and two read as
   * an impact, which is the whole grammar of the thing being borrowed.
   */
  ring(cls) {
    for (const late of ['', 'is-late']) {
      const n = el('div', `score-ring ${cls} ${late}`.trim());
      this.root.append(n);
      const drop = () => {
        if (n.parentNode === this.root) {
          this.root.removeChild(n);
        }
      };
      n.addEventListener('animationend', drop, { once: true });
      setTimeout(drop, 1200);
    }
  }

  showVerdict(text, cls) {
    this.verdict.textContent = text;
    /* Restart the animation on a node that may already be running one. */
    this.verdict.className = 'score-verdict score-cut';
    void this.verdict.offsetWidth;
    this.verdict.className = `score-verdict score-cut is-on ${cls}`;
  }

  dispose() {
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }
}
