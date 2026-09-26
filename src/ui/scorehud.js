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
 * THE COUNTER (FREESTYLE-MAPS-PLAN.md section 7, Stage C). The names in 2 are
 * no longer only tricks. One combo is fed by five kinds of thing, and every
 * one of them is a line in the same stack, because it is one chain: a trick,
 * a named gap, a close call (a skim, under, a thread, a low pass), the
 * chase, and the STF mark. The chase's own big callout is the chase HUD's,
 * down the right beside its Tail meter (src/ui/chasehud.js); here it is a
 * small line in the chain, so the stack still reads as the whole combo. A
 * skim is held, like a manual, so it has a meter while it is held (5, below).
 *
 *   5. The skim meter. While a skim is held: SKIM, the seconds held, the
 *      clearance, and a bar that fills as the gap closes. The Tail meter's
 *      construction, on this side, directly over the combo line it keeps
 *      alive; the names step up out of its way while it is up.
 *
 * THE LETTERING (section 3.2 item 3). On a freestyle map the names and the
 * verdict are hand lettered manga text (src/ui/lettering.js): heavy slanted
 * capitals in a thick ink line, a burst balloon behind a big gap and a big
 * banked combo, and a small katakana sound effect beside the big callouts.
 * The total and the combo line are the same hand in CSS rather than on a
 * canvas, because they change on any frame the chain does and a text node
 * is cheaper to rewrite than a canvas is to repaint. Clean FPV, and every
 * race track, gets the plain HUD text this overlay had before: see
 * setManga.
 *
 * WHERE IT SITS. Down the left, because the existing flight OSD has the top
 * centre (lap clock), both bottom corners (pack and speed) and the bottom
 * centre (the stick ghost). The left column between the top and the bottom
 * corner is the only run of screen this can have without covering something
 * a pilot is already reading, and it happens to be where THPS puts it.
 *
 * AND NEVER THE CENTRE THIRD. Section 3.3: nothing drawn in flight covers
 * the middle third of the frame. The verdict used to land in the middle of
 * the screen, "the one moment the pilot should look away from the quad";
 * it lands on the combo line now, the number it is the verdict on, and
 * every lettered callout is fitted to the outer third of the window at the
 * moment it is drawn (sideRoom), so a long gap name at phone width is
 * lettered smaller rather than reaching across the pilot's line of sight.
 *
 * NO ANIMATION LOOP. Everything that moves is a CSS keyframe on a node that
 * removes itself when the animation ends. This file never asks for a frame,
 * never holds a timer that outlives the run, and does no work at all on a
 * frame where nothing changed except the combo bar, because a rAF driven
 * overlay competing with the render loop is how a smooth sim gets a stutter
 * that nobody can find. A callout paints its canvas once, when it arrives.
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
import {
  INKS, SFX, callSize, letterCanvas, paintCall, paintSfx, sideRoom,
} from './lettering.js';

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
 * How many names may stack up before the oldest is dropped.
 *
 * A twelve trick combo would otherwise write a column of names taller than
 * the screen. Six is what fits beside the quad at 720p without reaching the
 * pack readout, and the combo line under them says how many there really
 * are, so nothing is hidden, only elided. Three on a short screen, a phone
 * on its side, where six lettered rows reached up over the total.
 */
const NAME_STACK_MAX = 6;
const NAME_STACK_SHORT = 3;
const SHORT_SCREEN_PX = 560;

/*
 * A SHORT SCREEN, a phone on its side, has about a hundred pixels between
 * the total and the combo line, which is three plain lines or one balloon.
 * So there a big gap is lettered and gets its sound effect but not its
 * balloon, the banked combo's balloon is smaller and its spikes shorter,
 * the stack keeps two lines while the skim meter is up, and the meter sits
 * under the total instead of lifting the names (index.html). Read when a
 * callout is drawn, which is when it matters, and never per frame.
 */
function shortScreen() {
  return typeof window !== 'undefined' && window.innerHeight < SHORT_SCREEN_PX;
}

/* How long a name stays up. Long enough to read at speed, short enough that
 * a fast chain does not become a wall of text. Must match the CSS. */
const NAME_LIFE_MS = 2200;

/* The left column's margin, .score-names' `left` in index.html: what the
 * lettering subtracts from the outer third to find its room. */
const COLUMN_LEFT = 22;

/*
 * WHAT IS BIG, which is what earns a burst balloon, and the numbers are
 * the scorer's own so this adds no opinion of its own about the run:
 *
 *   a gap of tier 1000 or more   the named gaps an author prices highest
 *                                (100, 250, 500, 1000, 2500): the crane,
 *                                the water tower, not the kerb
 *   a combo banked at x3 or more the tier this overlay already calls Sweet,
 *                                the first one with speed lines
 */
export const GAP_BALLOON_TIER = 1000;
export const BANK_BALLOON_MULT = 3;

/* A skim held this long gets its sound effect: a brush past a wall is not
 * an event, two seconds along one is. */
export const SKIM_SFX_MS = 1500;

/*
 * The skim meter's bar is closeness, not time: full at contact, empty at a
 * metre, which is the plan's "within about a metre" (section 7 item 3). The
 * seconds are already written beside it, big; the bar says the thing the
 * number does not, how close the craft is right now.
 */
export const SKIM_BAR_M = 1;

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

/* Seconds, one decimal, for a held thing. */
function secs(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}

/*
 * WHAT A LINE IN THE STACK SAYS, for every kind the scorer sends, in one
 * table so the lettering and the plain text cannot say different things.
 * Null for a kind this stack has nothing to say about (bank, bail and
 * finish are the verdict's). Exported for the checks.
 *
 *   word     the name, lettered in capitals
 *   pts      the points it was worth after every penalty
 *   tag      a qualifier: the execution, a repeat, the seconds held
 *   fill     its colour: cream for tricks (amber sloppy, sakura bumped),
 *            amber for gaps, the sky for close calls, the chase HUD's for
 *            the chase
 *   big      a burst balloon behind it
 *   sfx      its sound effect, or null
 *   small    a line smaller than the rest, for what has its big moment
 *            somewhere else: the chase (down the right) and the mark
 *
 * The gap's `repeat` is read as how many times this gap was crossed earlier
 * in the run, 0 the first time, and `true` as 1; the tag then says which
 * crossing this was.
 */
export function stackCall(e) {
  if (!e) {
    return null;
  }
  const pts = formatScore(e.points || 0);
  switch (e.kind) {
    case 'trick': {
      const ex = e.execution || 'CLEAN';
      return {
        word: e.name,
        pts,
        tag: ex !== 'CLEAN' ? ex.toLowerCase() : null,
        fill: ex === 'BUMP' ? INKS.sakura : (ex === 'SLOPPY' ? INKS.amber : INKS.cream),
        burst: ex === 'BUMP' ? INKS.bail : (ex === 'SLOPPY' ? INKS.amber : INKS.cream),
        big: false,
        sfx: null,
        small: false,
      };
    }
    case 'gap': {
      const before = typeof e.repeat === 'number' ? e.repeat : (e.repeat ? 1 : 0);
      return {
        word: e.name || 'Gap',
        pts,
        tag: before > 0 ? `x${before + 1}` : null,
        fill: INKS.amber,
        burst: INKS.amber,
        big: (e.tier || 0) >= GAP_BALLOON_TIER,
        sfx: SFX.gap,
        small: false,
      };
    }
    case 'skim':
      return {
        word: e.name || 'Skim',
        pts,
        tag: e.holdMs > 0 ? secs(e.holdMs) : null,
        fill: INKS.sky,
        burst: INKS.sky,
        big: false,
        sfx: e.holdMs >= SKIM_SFX_MS ? SFX.skim : null,
        small: false,
      };
    case 'under':
    case 'thread':
    case 'lowpass':
      return {
        word: e.name || (e.kind === 'lowpass' ? 'Low pass' : e.kind),
        pts,
        tag: null,
        fill: INKS.sky,
        burst: INKS.sky,
        big: false,
        sfx: e.kind === 'thread' ? SFX.thread : null,
        small: false,
      };
    case 'tail':
      return {
        word: e.name || 'Tail',
        pts,
        tag: e.holdMs > 0 ? secs(e.holdMs) : null,
        fill: e.drift ? INKS.drift : INKS.cream,
        burst: null,
        big: false,
        sfx: null,
        small: true,
      };
    case 'chase-thread':
    case 'hurdle':
      return {
        word: e.name || (e.kind === 'hurdle' ? 'Hurdle' : 'Thread'),
        pts,
        tag: null,
        fill: INKS.cream,
        burst: null,
        big: false,
        sfx: null,
        small: true,
      };
    case 'egg':
      return {
        word: `${e.name || 'STF'} mark`,
        pts,
        tag: null,
        fill: INKS.cream,
        burst: null,
        big: false,
        sfx: null,
        small: true,
      };
    default:
      return null;
  }
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

/* The sound effect's cell for a callout of `size`: small, as the owner
 * asked, and never smaller than reads. */
function sfxCell(size) {
  return Math.round(Math.min(26, Math.max(14, size * 0.72)));
}

/*
 * Plain type held to the outer third as the lettering is (sideRoom): a long
 * name or a verdict at phone width is set smaller rather than reaching into
 * the middle. One layout read, when the line arrives.
 */
function fitPlain(node) {
  node.style.fontSize = '';
  const room = sideRoom(COLUMN_LEFT);
  const w = node.offsetWidth;
  if (w > room) {
    const px = parseFloat(getComputedStyle(node).fontSize) || 16;
    node.style.fontSize = `${Math.floor(px * (room / w))}px`;
  }
}

/*
 * A lettered callout and its sound effect, into `host`: the effect painted
 * first so the word knows how much room it leaves, the word fitted to what
 * is left of the outer third, and the effect tucked against the word's end,
 * a little into it on a plain line and well into the top corner of a
 * balloon, so it reads as the balloon's and not the line above's.
 */
function placeSfx(host, word, fx, sfx, size, big, spec) {
  let room = sideRoom(COLUMN_LEFT);
  let tuck = 0;
  if (fx) {
    const w = paintSfx(fx, sfx, sfxCell(size), INKS.cream).w;
    tuck = Math.round(w * (big ? 0.55 : 0.12));
    room -= w - tuck;
  }
  const drawn = paintCall(word, { ...spec, maxW: room });
  host.append(word);
  if (fx) {
    fx.style.marginLeft = `${-tuck}px`;
    if (big) {
      fx.style.marginTop = `${Math.round(drawn.h * 0.14)}px`;
    }
    host.append(fx);
  }
}

export class ScoreHud {
  constructor(root) {
    this.root = el('div', 'score-hud is-off');
    this.manga = false;

    this.totalBox = el('div', 'score-total');
    /*
     * THE LABEL CARRIES THE WARNING, because the Freestyle screen's warning
     * is read once and then the pilot flies for an hour.
     *
     * The recogniser is not finished: it misses shapes it should name and
     * puts the wrong name on some it catches. A pilot who is told a Split-S
     * was a Half Matty learns the wrong thing about their own flying, and
     * the only defence against that is for the overlay saying it to admit
     * what it is, in the one place the pilot is already looking. It is a
     * word beside the label rather than a banner, because a banner over the
     * town would be worse than the thing it is apologising for, and it sits
     * next to "SCORE" so it reads as a qualifier on the number rather than
     * as an event that just happened.
     *
     * TRICK NAMES ONLY, since the counter. Gaps, close calls, the chase and
     * the mark are geometry and cannot misname anything (section 7,
     * "Reliability"), so the tag says what it is about and is up only once
     * the run has named a trick: with trick scoring off it would be a
     * warning about nothing on the screen.
     */
    const label = el('div', 'score-label', 'Score');
    this.beta = el('span', 'score-beta', 'trick names in development');
    this.beta.hidden = true;
    label.append(this.beta);
    this.totalBox.append(label);
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

    /* The names, newest at the bottom so the eye does not have to track
     * upward to find the thing that just happened. */
    this.names = el('div', 'score-names');

    /*
     * THE SKIM METER, the Tail meter's construction (src/ui/chasehud.js):
     * the kind and the clearance over the seconds held, big, and a bar.
     * Over the combo line, because a skim is what is keeping that number
     * alive while it is held.
     */
    this.skimBox = el('div', 'skim-meter is-off');
    const skimHead = el('div', 'skim-meter-head score-cut');
    this.skimGap = el('span', 'skim-meter-gap', '');
    skimHead.append(el('span', 'skim-meter-kind', 'Skim'), this.skimGap);
    const skimLine = el('div', 'skim-meter-line score-cut');
    this.skimTime = el('span', 'skim-meter-time', '0.0');
    skimLine.append(this.skimTime, el('span', 'skim-meter-unit', 's'));
    const skimBar = el('div', 'skim-meter-bar');
    this.skimFill = el('div', 'skim-meter-fill');
    skimBar.append(this.skimFill);
    this.skimBox.append(skimHead, skimLine, skimBar);

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

    /* Banked and bailed both land on the combo line, the number they are
     * the verdict on: see the header for why not the middle any more. */
    this.verdict = el('div', 'score-verdict score-cut');

    /* Speed lines down both edges, driven entirely by a class on the root.
     * Behind everything, so it can never sit over a number. */
    this.lines = el('div', 'score-lines');

    this.root.append(this.lines, this.totalBox, this.names, this.skimBox, this.comboBox, this.verdict);
    root.append(this.root);

    this.shownTotal = -1;
    this.shownPoints = -1;
    this.shownMult = -1;
    this.shownTier = -1;
    this.shownSkim = false;
    this.shownSkimTenths = -1;
    this.shownSkimCm = -1;
    this.shownSkimFill = -1;
    this.visible = false;
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

  /*
   * THE MANGA LAYER, ON OR OFF. On for a freestyle map unless the pilot
   * chose Clean FPV; off on every race track. Off is the plain HUD text
   * this overlay had before the lettering: the same four readouts, the
   * same words and numbers, no canvas, no balloon, no sound effect, no ray
   * fans, rings or speed lines. Takes effect from the next callout; the
   * total and the combo line change at once, being CSS.
   */
  setManga(on) {
    const m = Boolean(on);
    if (m === this.manga) {
      return;
    }
    this.manga = m;
    this.root.className = this.rootClass();
  }

  /* The root carries the combo tier, because the speed lines are drawn from
   * it and they belong to the whole frame rather than to the combo box; the
   * skim, because the names step up out of the meter's way; and which
   * lettering is in use. */
  rootClass() {
    const t = this.shownMult >= 5 ? 5 : (this.shownMult >= 4 ? 4 : (this.shownMult >= 3 ? 3 : 0));
    return `score-hud ${this.manga ? 'is-manga' : 'is-clean'}${t ? ` tier-${t}` : ''}`
      + `${this.shownSkim ? ' is-skim' : ''}${this.visible ? '' : ' is-off'}`;
  }

  /* Wipe the names, the combo line, the skim meter and any verdict, leaving
   * the total. Used on a map change and when the flight screen is left. */
  clearTransient() {
    this.names.textContent = '';
    this.comboBox.className = 'score-combo is-off';
    this.verdict.className = 'score-verdict score-cut';
    this.verdict.textContent = '';
    this.shownPoints = -1;
    this.shownMult = -1;
    this.shownTier = -1;
    this.tier.hidden = true;
    this.skimOff();
    this.root.className = this.rootClass();
  }

  reset() {
    this.clearTransient();
    this.totalValue.textContent = '0';
    this.shownTotal = 0;
    this.beta.hidden = true;
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
    if (view.trickCount > 0 && this.beta.hidden) {
      this.beta.hidden = false;
    }
    this.skim(view.skim);
    const c = view.combo;
    if (!c) {
      if (this.comboBox.className !== 'score-combo is-off') {
        this.comboBox.className = 'score-combo is-off';
        this.shownPoints = -1;
        this.shownMult = -1;
      }
      return;
    }
    if (this.comboBox.className === 'score-combo is-off') {
      this.comboBox.className = this.shownTier > 0 ? `score-combo tier-${this.shownTier}` : 'score-combo';
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
      }
      this.root.className = this.rootClass();
    }
    /* The bar is a transform, not a width: a width change relayouts the
     * whole overlay every frame and a transform does not. */
    this.comboBar.style.transform = `scaleX(${c.remain})`;
  }

  /*
   * The skim meter, from view.skim: { on, holdMs, clearance }, clearance in
   * metres. Null or off takes it down. Written only when what it shows has
   * moved: a tenth of a second, a centimetre, or a pixel's worth of bar.
   */
  skim(s) {
    if (!s || !s.on) {
      if (this.shownSkim) {
        this.skimOff();
        this.root.className = this.rootClass();
      }
      return;
    }
    if (!this.shownSkim) {
      this.shownSkim = true;
      this.skimBox.className = 'skim-meter';
      this.root.className = this.rootClass();
    }
    const tenths = Math.floor((s.holdMs || 0) / 100);
    if (tenths !== this.shownSkimTenths) {
      this.shownSkimTenths = tenths;
      this.skimTime.textContent = (tenths / 10).toFixed(1);
    }
    const gap = s.clearance > 0 ? s.clearance : 0;
    const cm = Math.round(gap * 100);
    if (cm !== this.shownSkimCm) {
      this.shownSkimCm = cm;
      this.skimGap.textContent = `${(cm / 100).toFixed(2)} m`;
    }
    const f = gap >= SKIM_BAR_M ? 0 : 1 - gap / SKIM_BAR_M;
    if (f - this.shownSkimFill > 0.004 || this.shownSkimFill - f > 0.004) {
      this.shownSkimFill = f;
      this.skimFill.style.transform = `scaleX(${f})`;
    }
  }

  skimOff() {
    this.shownSkim = false;
    this.shownSkimTenths = -1;
    this.shownSkimCm = -1;
    this.shownSkimFill = -1;
    this.skimBox.className = 'skim-meter is-off';
  }

  /* The scorer's queued events, at most a handful a frame. */
  events(list) {
    if (!list) {
      return;
    }
    for (const e of list) {
      if (e.kind === 'bank') {
        const big = e.mult >= BANK_BALLOON_MULT;
        this.showVerdict({
          word: `+${formatScore(e.points)}`, fill: INKS.mint, big, sfx: big ? SFX.bank : null,
        }, 'is-bank');
        this.ring('');
      } else if (e.kind === 'bail') {
        this.showVerdict({
          word: 'Bailed', pts: e.points > 0 ? `-${formatScore(e.points)}` : null, fill: INKS.bail, big: false, sfx: null,
        }, 'is-bail');
        this.ring('is-bail');
        this.names.textContent = '';
      } else {
        if (e.kind === 'trick') {
          this.beta.hidden = false;
        }
        const call = stackCall(e);
        if (call) {
          this.pushName(call, e.kind);
        }
      }
    }
  }

  /*
   * One line in the stack. The execution shows as a colour rather than as
   * a second line: clean is cream, sloppy is amber, a bump is sakura, and
   * the number beside the name is what it was actually worth after every
   * penalty, not the catalogue price. A pilot who flies the same trick four
   * times should be able to SEE the repeat penalty happening.
   */
  pushName(given, kind) {
    const call = given.big && shortScreen() ? { ...given, big: false } : given;
    const row = el('div', `score-name score-cut is-${kind}${call.big ? ' is-big' : ''}${call.small ? ' is-small' : ''}`);
    /* The ink burst goes on the ROW, so it travels with the name up the
     * stack and cannot be left behind pointing at nothing, and it goes on
     * FIRST so the type is painted over it. See .score-name > span. A
     * balloon is its own burst, and a small line has its moment elsewhere. */
    if (call.burst && !call.big) {
      burst(row, call.burst);
    }
    if (this.manga) {
      this.letterRow(row, call);
      this.names.append(row);
    } else {
      /* The plain line wears the lettering's colour, so the two layers
       * colour code the same way: amber gaps, sky close calls. */
      row.style.color = call.fill;
      row.append(el('span', 'score-name-text', call.word));
      row.append(el('span', 'score-name-points', call.pts));
      if (call.tag) {
        row.append(el('span', 'score-name-tag', call.tag));
      }
      this.names.append(row);
      fitPlain(row);
    }
    const max = shortScreen() ? (this.shownSkim ? NAME_STACK_SHORT - 1 : NAME_STACK_SHORT) : NAME_STACK_MAX;
    while (this.names.childElementCount > max) {
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
    row.addEventListener('animationend', (ev) => {
      if (ev.target === row) {
        drop();
      }
    });
    setTimeout(drop, NAME_LIFE_MS + 400);
  }

  /*
   * The lettered line: the word, its points and its tag on one canvas,
   * fitted to the outer third, and its sound effect, if it has one, on a
   * second canvas beside it that lands a beat later. The room the effect
   * takes comes off the word's, so the two together never pass the third.
   */
  letterRow(row, call) {
    const size = callSize(call.big ? 1.3 : (call.small ? 0.8 : 1));
    const fx = call.sfx ? letterCanvas('lettering-sfx') : null;
    const word = letterCanvas('lettering');
    placeSfx(row, word, fx, call.sfx, size, call.big, {
      word: call.word,
      pts: call.pts,
      tag: call.tag,
      fill: call.fill,
      size,
      balloon: call.big,
    });
  }

  /*
   * A hard ring, once, on a bank or a bail. Two of them a hundred
   * milliseconds apart, because one ring reads as a circle and two read as
   * an impact, which is the whole grammar of the thing being borrowed.
   * Round the verdict, on the combo line. The manga layer's: Clean FPV
   * hides it in the CSS.
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

  /*
   * The verdict, on the combo line: the banked number in mint or BAILED in
   * the saturated sakura, lettered on the manga layer, with a balloon and
   * ドン behind a big bank, and plain type on Clean FPV.
   */
  showVerdict(v, cls) {
    this.verdict.textContent = '';
    if (this.manga) {
      const short = shortScreen();
      const size = callSize(v.big ? (short ? 1.35 : 1.75) : (short ? 1.3 : 1.55));
      placeSfx(this.verdict, letterCanvas('lettering'), v.sfx ? letterCanvas('lettering-sfx') : null, v.sfx, size, v.big, {
        word: v.word, pts: v.pts, fill: v.fill, ptsFill: v.fill, size, balloon: v.big, reach: short ? 0.6 : 0,
      });
    } else {
      this.verdict.textContent = v.pts ? `${v.word}  ${v.pts}` : v.word;
      fitPlain(this.verdict);
    }
    /* Restart the animation on a node that may already be running one. */
    this.verdict.className = 'score-verdict score-cut';
    void this.verdict.offsetWidth;
    this.verdict.className = `score-verdict score-cut is-on ${cls}${v.big ? ' is-big' : ''}`;
  }

  dispose() {
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }
}
