/*
 * screens.js: the career's screens and its flying display.
 *
 * One layer over the game, #career, with four faces: the hub (chapters and
 * lessons), the briefing (what, why, how, and the sticks), the flying
 * display (objective, clock, coach, height gauge, the marker on the next
 * target) and the results (the medal, the time, what next). The game's own
 * menus sit underneath and are hidden while a career face is up; the game's
 * own display stays on while flying, because the volts, the speed and the
 * mode are the pilot's instruments and the career adds to them.
 *
 * INPUT. Every face is a short list of things to press, walked with the
 * arrows, the D-pad or a stick, chosen with Enter or A, left with Escape or
 * B. The controller hands keys and pad edges in; nothing here listens to the
 * document, so the game's own keys never fire twice.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

import { INKS, paintCall, paintTitle } from '../ui/lettering.js';
import { CHAPTERS } from './curriculum.js';
import {
  chapterUnlocked, lessonRecord, lessonUnlocked, totals,
} from './progress.js';
import {
  checkSvg, lessonGlyph, lockSvg, medalSvg,
} from './icons.js';
import { sticksHtml } from './sticks.js';
import { sticksIn } from './words.js';
import { injectCareerStyle } from './style.js';
import { achievementSvg } from '../steam/achievementart.js';

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

/* m:ss.t, the way a lap clock reads. */
export function clock(ms) {
  if (!Number.isFinite(ms)) {
    return '--:--.-';
  }
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${d}`;
}

/* A lesson scored in points rather than timed (its medals say metric:
 * 'score'), and a medal target or a result in that lesson's own unit. */
function scored(lesson) {
  return Boolean(lesson.medals && lesson.medals.metric === 'score');
}

function points(n) {
  return `${Math.round(n).toLocaleString('en-GB')} pts`;
}

function medalValue(lesson, v) {
  return scored(lesson) ? points(v) : clock(v);
}

/* The pilot's best on a lesson, in its unit, or null. */
function bestOf(lesson, rec) {
  if (!rec) {
    return null;
  }
  if (scored(lesson)) {
    return Number.isFinite(rec.bestScore) ? points(rec.bestScore) : null;
  }
  return Number.isFinite(rec.bestMs) ? clock(rec.bestMs) : null;
}

/* A heading lettered in the game's hand, the words kept for a reader. */
function lettered(text, px, fill = INKS.cream, cls = 'cr-title') {
  const h = el('h2', cls);
  const canvas = el('canvas', 'cr-letters');
  canvas.setAttribute('aria-hidden', 'true');
  const words = el('span', 'cr-title-text', text);
  h.append(canvas, words);
  try {
    paintTitle(canvas, [{ text, fill }], px, { maxW: Math.max(320, window.innerWidth * 0.7) });
  } catch (e) {
    words.style.color = 'inherit';
    words.style.position = 'static';
    canvas.remove();
  }
  return h;
}

function modeTag(mode) {
  return el('span', `cr-tag ${mode === 'angle' ? 'angle' : 'acro'}`, mode === 'angle' ? 'Angle' : 'Acro');
}

/* The medals' names as the player reads them: finishing is the bronze. */
const MEDAL_NAME = { gold: 'Gold', silver: 'Silver', bronze: 'Finish' };

/*
 * The keys a face names, in the hands the pilot has. A keycap reads Enter
 * to somebody at a keyboard and A to somebody on a pad; the legend the
 * same. Every cap carries its keyboard name in data-k and is repainted by
 * paintHands when the controller says the hands changed. A key with no
 * button on the pad (R, the keyboard's retry) is put away there: the
 * button it sits on is still a press away on the D-pad.
 */
const PAD_CAPS = {
  Enter: 'A', Esc: 'B', 'Q E': 'LB RB', R: '', Arrows: 'D-pad',
};

function keycap(key, cls = 'cr-key') {
  const k = el('span', cls, key);
  k.dataset.k = key;
  return k;
}

function button(label, key, cls = '') {
  const b = el('button', `cr-btn ${cls}`);
  b.type = 'button';
  b.append(document.createTextNode(label));
  if (key) {
    b.append(keycap(key));
  }
  return b;
}

/* A legend bar: [[key, words], ...], the key named for the hands. */
function legendBar(entries) {
  const legend = el('div', 'cr-legend');
  for (const [key, words] of entries) {
    const span = el('span');
    span.append(keycap(key, 'cr-legend-key'), document.createTextNode(words));
    legend.append(span);
  }
  return legend;
}

/*
 * The medal ladder a lesson sets: gold's mark, silver's, and the finish,
 * each named, with a tick on the rungs the pilot has reached. `reached` is
 * the medal to tick down from (a result's, or the pilot's best), or null.
 */
function ladder(lesson, reached, { compact = false } = {}) {
  const box = el('div', `cr-ladder${compact ? ' compact' : ''}`);
  const rank = { gold: 3, silver: 2, bronze: 1 };
  const have = reached ? rank[reached] || 0 : 0;
  for (const m of ['gold', 'silver', 'bronze']) {
    const value = m === 'bronze' ? null : (lesson.medals && lesson.medals[m] != null ? lesson.medals[m] : null);
    if (m !== 'bronze' && value == null) {
      continue;
    }
    const got = have >= rank[m];
    const row = el('div', `cr-rung${got ? ' is-got' : ''}`);
    const icon = el('span', 'cr-medal-box');
    icon.innerHTML = medalSvg(m);
    row.append(icon, el('b', null, MEDAL_NAME[m]));
    row.append(el('span', 'cr-rung-value', value == null ? (m === 'bronze' ? 'any time' : '') : medalValue(lesson, value)));
    const tick = el('span', 'cr-rung-tick');
    tick.innerHTML = got ? checkSvg() : '';
    row.append(tick);
    box.append(row);
  }
  return box;
}

export class CareerScreens {
  constructor(handlers) {
    injectCareerStyle();
    this.h = handlers;
    this.root = el('div');
    this.root.id = 'career';
    this.root.hidden = true;
    this.root.append(el('div', 'cr-scrim'));
    this.hub = el('section', 'cr-screen cr-hub');
    this.brief = el('section', 'cr-screen cr-brief');
    this.results = el('section', 'cr-screen cr-results');
    this.ach = el('section', 'cr-screen cr-ach');
    this.hud = el('div', 'cr-hud');
    this.root.append(this.hub, this.brief, this.results, this.ach, this.hud);
    document.body.append(this.root);
    this.focus = [];
    this.focusAt = 0;
    this.chapter = 0;
    this.lessonAt = 0;
    this.zone = 'lessons';
    /* 'keys' or 'pad': what the keycaps and legends name. */
    this.hands = 'keys';
    this.buildHud();
  }

  /* The hands changed: every cap and legend on the page says so. */
  setHands(hands) {
    const h = hands === 'pad' ? 'pad' : 'keys';
    if (h === this.hands) {
      return;
    }
    this.hands = h;
    this.paintHands();
  }

  paintHands() {
    for (const n of this.root.querySelectorAll('[data-k]')) {
      const key = n.dataset.k;
      const cap = this.hands === 'pad' ? (PAD_CAPS[key] ?? key) : key;
      n.textContent = cap;
      /* A pad's buttons are drawn, not printed (src/steam/sheet.js). */
      if (this.hands === 'pad' && cap) {
        n.dataset.glyph = cap;
      } else {
        delete n.dataset.glyph;
      }
      const row = n.classList.contains('cr-legend-key') ? n.parentElement : n;
      row.hidden = !cap;
    }
  }

  set screen(name) {
    this.root.dataset.screen = name || '';
    this.root.hidden = !name;
    document.body.classList.toggle('career-menu', name === 'hub' || name === 'briefing' || name === 'results' || name === 'achievements');
    document.body.classList.toggle('career-flight', name === 'flight');
    if (name !== 'flight') {
      document.body.classList.remove('career-score');
    }
  }

  get screen() {
    return this.root.hidden ? '' : this.root.dataset.screen;
  }

  /* ---------------------------------------------------------------- *
   * Focus: the things a key can press on the face that is up.
   * ---------------------------------------------------------------- */

  setFocus(list, at = 0) {
    this.focus = list.filter(Boolean);
    this.focusAt = Math.max(0, Math.min(at, this.focus.length - 1));
    this.paintFocus();
  }

  paintFocus() {
    this.focus.forEach((b, i) => b.classList.toggle('is-focus', i === this.focusAt));
  }

  moveFocus(d) {
    if (!this.focus.length) {
      return;
    }
    this.focusAt = (this.focusAt + d + this.focus.length) % this.focus.length;
    this.paintFocus();
  }

  pressFocus() {
    const b = this.focus[this.focusAt];
    if (b && !b.disabled) {
      b.click();
    }
  }

  /* ---------------------------------------------------------------- *
   * The hub.
   * ---------------------------------------------------------------- */

  showHub(progress, { chapter, lesson, stickMode = 2, keys = false } = {}) {
    this.progress = progress;
    this.stickMode = stickMode;
    this.keys = keys;
    if (chapter != null) {
      this.chapter = chapter;
    }
    if (lesson != null) {
      this.lessonAt = lesson;
    }
    this.zone = 'lessons';
    this.screen = 'hub';
    this.renderHub();
  }

  renderHub() {
    const p = this.progress;
    const hub = this.hub;
    hub.textContent = '';
    const t = totals(p);

    const head = el('div', 'cr-hub-head');
    const left = el('div');
    left.append(el('div', 'cr-kicker', 'WebFPV'), lettered('Career', 76, INKS.cream));
    left.append(el('p', 'cr-sub', 'From your first hover to a pro licence. Every lesson is one skill, with a briefing, a coach in your ear and a medal to chase.'));
    const tally = el('div', 'cr-tally');
    for (const m of ['gold', 'silver', 'bronze']) {
      const it = el('div', 'cr-tally-item');
      const box = el('div', 'cr-medal-box');
      box.innerHTML = medalSvg(m);
      it.append(box, document.createTextNode(String(t[m])));
      tally.append(it);
    }
    tally.append(el('span', 'cr-tally-done', `${t.done} of ${t.total} lessons`));
    if (p.finishedAt) {
      tally.append(el('span', 'cr-tag acro', 'Pro licence'));
    }
    head.append(left, tally);
    hub.append(head);

    const chips = el('div', 'cr-chapters');
    this.chipEls = CHAPTERS.map((c, i) => {
      const open = chapterUnlocked(p, i);
      const chip = el('div', `cr-chip${open ? '' : ' is-locked'}${i === this.chapter ? ' is-on' : ''}`);
      chip.setAttribute('role', 'tab');
      chip.append(el('span', 'cr-num', String(i + 1).padStart(2, '0')));
      const words = el('div');
      words.append(el('div', 'cr-chip-name', c.title));
      const bar = el('div', 'cr-chip-bar');
      const fill = el('i');
      const done = c.lessons.filter((l) => lessonRecord(p, l.id)?.medal).length;
      fill.style.width = `${(100 * done) / c.lessons.length}%`;
      bar.append(fill);
      words.append(bar);
      chip.append(words);
      if (!open) {
        const lk = el('span', 'cr-chip-lock');
        lk.innerHTML = lockSvg();
        chip.append(lk);
      }
      chip.addEventListener('click', () => {
        this.chapter = i;
        this.lessonAt = 0;
        this.zone = 'lessons';
        this.renderHub();
      });
      chips.append(chip);
      return chip;
    });
    /* Ten chapters never fit across one row, and a strip that simply clips
     * reads as eight chapters. The wrap fades the edge that has more behind
     * it, so the cut looks like a cut and the legend's Q E means something.
     * Read on scroll and once after layout, because the first paint has no
     * widths yet. */
    const wrap = el('div', 'cr-chapters-wrap');
    wrap.append(chips);
    const edges = () => {
      const more = chips.scrollWidth - chips.clientWidth;
      wrap.classList.toggle('more-l', chips.scrollLeft > 4);
      wrap.classList.toggle('more-r', more > 4 && chips.scrollLeft < more - 4);
    };
    chips.addEventListener('scroll', edges, { passive: true });
    this.chipsEdges = edges;
    requestAnimationFrame(edges);
    hub.append(wrap);

    const ch = CHAPTERS[this.chapter];
    const open = chapterUnlocked(p, this.chapter);
    const chHead = el('div', 'cr-chapter-head');
    chHead.append(lettered(`${this.chapter + 1}. ${ch.title}`, 40, INKS.sakura), modeTag(ch.mode));
    chHead.append(el('p', 'cr-blurb', open
      ? ch.blurb
      : `Locked. Finish every lesson in ${CHAPTERS[this.chapter - 1].title} to open it, or open every chapter below.`));
    hub.append(chHead);

    const grid = el('div', 'cr-lessons');
    this.lessonAt = Math.min(this.lessonAt, ch.lessons.length - 1);
    this.cardEls = ch.lessons.map((l, i) => {
      const unlocked = lessonUnlocked(p, l.id);
      const rec = lessonRecord(p, l.id);
      const card = el('div', `cr-card${unlocked ? '' : ' is-locked'}${i === this.lessonAt ? ' is-on' : ''}`);
      card.setAttribute('role', 'button');
      const top = el('div', 'cr-card-top');
      top.append(el('span', 'cr-card-num', l.id.replace('-', '.')), modeTag(l.mode));
      const glyph = el('div', 'cr-card-glyph');
      glyph.innerHTML = lessonGlyph(l);
      const name = el('div', 'cr-card-name', l.title);
      const body = el('div', 'cr-card-body');
      body.append(glyph, name);
      const foot = el('div', 'cr-card-foot');
      const best = bestOf(l, rec);
      foot.append(el('span', 'cr-card-best', best ? `Best ${best}` : (unlocked ? 'Not flown yet' : 'Locked')));
      const medal = el('div', 'cr-card-medal');
      medal.innerHTML = medalSvg(rec && rec.medal);
      foot.append(medal);
      card.append(top, body, foot);
      if (!unlocked) {
        const lk = el('div', 'cr-card-lockmark');
        lk.innerHTML = lockSvg();
        body.append(lk);
      }
      card.addEventListener('mouseenter', () => {
        this.lessonAt = i;
        this.zone = 'lessons';
        this.markHub();
      });
      card.addEventListener('click', () => {
        this.lessonAt = i;
        this.openSelected();
      });
      grid.append(card);
      return card;
    });
    hub.append(grid);

    const detail = el('div', 'cr-detail');
    this.detailEl = detail;
    hub.append(detail);
    this.paintDetail();

    hub.append(legendBar([['Arrows', 'Choose'], ['Q E', 'Chapter'], ['Enter', 'Briefing'], ['Esc', 'Back']]));
    this.paintHands();
    this.markHub();
  }

  paintDetail() {
    const ch = CHAPTERS[this.chapter];
    const l = ch.lessons[this.lessonAt];
    const p = this.progress;
    const d = this.detailEl;
    d.textContent = '';
    const words = el('div');
    words.append(el('div', 'cr-kicker', `Lesson ${l.id.replace('-', '.')}  ${l.title}`));
    words.append(el('p', 'cr-goal', sticksIn(l.briefing.goal, this.stickMode, { keys: this.keys })));
    const targets = el('div', 'cr-targets');
    for (const m of ['gold', 'silver']) {
      if (l.medals && l.medals[m] != null) {
        const tg = el('span', 'cr-target');
        const box = el('span', 'cr-medal-box');
        box.innerHTML = medalSvg(m);
        tg.append(box, document.createTextNode(`${m === 'gold' ? 'Gold' : 'Silver'} `), el('b', null, medalValue(l, l.medals[m])));
        targets.append(tg);
      }
    }
    const best = bestOf(l, lessonRecord(p, l.id));
    if (best) {
      const tg = el('span', 'cr-target');
      tg.append(document.createTextNode('Your best '), el('b', null, best));
      targets.append(tg);
    }
    words.append(targets);
    const actions = el('div', 'cr-actions');
    const unlocked = lessonUnlocked(p, l.id);
    this.openBtn = button(unlocked ? 'Briefing' : 'Locked', 'Enter', 'primary');
    this.openBtn.disabled = !unlocked;
    this.openBtn.addEventListener('click', () => this.openSelected());
    this.openAllBtn = null;
    if (!p.openAll && !CHAPTERS.every((c, i) => chapterUnlocked(p, i))) {
      this.openAllBtn = button('I already fly: open every chapter', null);
      this.openAllBtn.addEventListener('click', () => this.h.openAll());
    }
    this.backBtn = button('Back', 'Esc');
    this.backBtn.addEventListener('click', () => this.h.leave());
    /* Every achievement, earned or not, with how far along the counted
     * ones are: the career is where a pilot looks for what to do next. */
    this.achBtn = null;
    const count = this.h.achievementCount ? this.h.achievementCount() : null;
    if (count) {
      this.achBtn = button(`Achievements ${count.earned}/${count.total}`, null);
      this.achBtn.addEventListener('click', () => this.h.achievements());
    }
    actions.append(...this.hubActions());
    d.append(words, actions);
  }

  hubActions() {
    return [this.openAllBtn, this.achBtn, this.backBtn, this.openBtn].filter(Boolean);
  }

  markHub() {
    if (this.chipEls) {
      this.chipEls.forEach((c, i) => {
        c.classList.toggle('is-on', i === this.chapter);
        c.classList.toggle('is-focus', this.zone === 'chapters' && i === this.chapter);
      });
      const chip = this.chipEls[this.chapter];
      if (chip && chip.scrollIntoView) {
        chip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
    if (this.cardEls) {
      this.cardEls.forEach((c, i) => c.classList.toggle('is-on', i === this.lessonAt && this.zone === 'lessons'));
      const on = this.cardEls[this.lessonAt];
      if (on && on.scrollIntoView) {
        on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
    if (this.detailEl) {
      this.paintDetail();
    }
    const btns = this.hubActions();
    btns.forEach((b, i) => b.classList.toggle('is-focus', this.zone === 'actions' && i === this.actionAt));
  }

  /* ---------------------------------------------------------------- *
   * Achievements: every one, earned first in the game's own order, each
   * with its picture (src/steam/achievementart.js), the day it was earned,
   * or how far along a counted one is. `list` is the platform's.
   * ---------------------------------------------------------------- */

  showAchievements(list) {
    this.screen = 'achievements';
    const a = this.ach;
    a.textContent = '';
    const earned = list.filter((x) => x.unlocked).length;
    const head = el('div', 'cr-ach-head');
    const left = el('div');
    left.append(el('div', 'cr-kicker', 'WebFPV'), lettered('Achievements', 64, INKS.cream));
    left.append(el('p', 'cr-sub', 'Kept on this computer, and on Steam whenever Steam is running. Shift and Tab opens the Steam overlay\u2019s list too.'));
    const count = el('div', 'cr-ach-count', String(earned));
    count.append(el('small', null, `of ${list.length}`));
    head.append(left, count);
    a.append(head);
    const grid = el('div', 'cr-ach-grid');
    const order = [...list.filter((x) => x.unlocked), ...list.filter((x) => !x.unlocked)];
    for (const x of order) {
      const tile = el('div', `cr-ach-tile${x.unlocked ? '' : ' is-locked'}`);
      const icon = el('div', 'cr-ach-icon');
      icon.innerHTML = achievementSvg(x, x.unlocked);
      const words = el('div');
      words.append(el('div', 'cr-ach-name', x.name), el('div', 'cr-ach-desc', x.desc));
      if (x.unlocked && x.at) {
        const day = new Date(x.at);
        words.append(el('div', 'cr-ach-when', Number.isNaN(day.getTime())
          ? 'Earned'
          : `Earned ${day.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`));
      } else if (!x.unlocked && Number.isFinite(x.value) && Number.isFinite(x.max) && x.max > 0) {
        const bar = el('div', 'cr-ach-bar');
        const fill = el('i');
        fill.style.width = `${Math.min(100, (100 * x.value) / x.max)}%`;
        bar.append(fill);
        /* A stat kept in seconds reads in minutes. */
        const secs = Boolean(x.stat && /_s$/.test(x.stat.id));
        const v = secs ? Math.floor(x.value / 60) : x.value;
        const m = secs ? Math.round(x.max / 60) : x.max;
        words.append(bar, el('div', 'cr-ach-of', `${Math.min(v, m)} of ${m}${secs ? ' minutes' : ''}`));
      }
      tile.append(icon, words);
      grid.append(tile);
    }
    this.achGrid = grid;
    a.append(grid);
    const foot = el('div', 'cr-ach-foot');
    const back = button('Back', 'Esc', 'primary');
    back.addEventListener('click', () => this.h.closeAchievements());
    foot.append(back);
    a.append(foot);
    a.append(legendBar([['Arrows', 'Scroll'], ['Esc', 'Back to the career']]));
    this.paintHands();
  }

  achKey(k) {
    const g = this.achGrid;
    if (!g) {
      return;
    }
    const tile = g.firstElementChild;
    const step = tile ? tile.getBoundingClientRect().height + 12 : 80;
    if (k === 'up' || k === 'prevChapter') {
      g.scrollBy({ top: -step * (k === 'up' ? 1 : 4) });
    } else if (k === 'down' || k === 'nextChapter') {
      g.scrollBy({ top: step * (k === 'down' ? 1 : 4) });
    } else if (k === 'select') {
      this.h.closeAchievements();
    }
  }

  openSelected() {
    const l = CHAPTERS[this.chapter].lessons[this.lessonAt];
    if (lessonUnlocked(this.progress, l.id)) {
      this.h.open(l.id);
    }
  }

  /*
   * The hub's keys. Three zones, top to bottom: the chapter strip, the
   * lessons, the buttons. Up and down move between them, left and right
   * walk along the one the cursor is in, and Q and E (the shoulders on a
   * pad) change chapter from anywhere. Walking off the end of a chapter's
   * lessons steps into the next chapter, so the whole career is one row
   * to a pilot who only presses right.
   */
  hubKey(k) {
    const ch = CHAPTERS[this.chapter];
    const actions = this.hubActions();
    if (k === 'back') {
      this.h.leave();
      return;
    }
    if (k === 'prevChapter' || k === 'nextChapter') {
      this.chapter = (this.chapter + (k === 'nextChapter' ? 1 : -1) + CHAPTERS.length) % CHAPTERS.length;
      this.lessonAt = 0;
      this.renderHub();
      return;
    }
    if (this.zone === 'chapters') {
      if (k === 'left' || k === 'right') {
        this.chapter = (this.chapter + (k === 'right' ? 1 : -1) + CHAPTERS.length) % CHAPTERS.length;
        this.lessonAt = 0;
        this.renderHub();
        this.zone = 'chapters';
        this.markHub();
      } else if (k === 'down' || k === 'select') {
        this.zone = 'lessons';
        this.markHub();
      }
      return;
    }
    if (this.zone === 'actions') {
      if (k === 'left' || k === 'right') {
        this.actionAt = (this.actionAt + (k === 'right' ? 1 : -1) + actions.length) % actions.length;
      } else if (k === 'up') {
        this.zone = 'lessons';
      } else if (k === 'select') {
        const b = actions[this.actionAt];
        if (b && !b.disabled) {
          b.click();
        }
        return;
      }
      this.markHub();
      return;
    }
    if (k === 'left') {
      if (this.lessonAt > 0) {
        this.lessonAt -= 1;
      } else {
        this.chapter = (this.chapter - 1 + CHAPTERS.length) % CHAPTERS.length;
        this.lessonAt = CHAPTERS[this.chapter].lessons.length - 1;
        this.renderHub();
        return;
      }
    } else if (k === 'right') {
      if (this.lessonAt < ch.lessons.length - 1) {
        this.lessonAt += 1;
      } else {
        this.chapter = (this.chapter + 1) % CHAPTERS.length;
        this.lessonAt = 0;
        this.renderHub();
        return;
      }
    } else if (k === 'down') {
      this.zone = 'actions';
      this.actionAt = actions.indexOf(this.openBtn);
    } else if (k === 'up') {
      this.zone = 'chapters';
    } else if (k === 'select') {
      this.openSelected();
      return;
    }
    this.markHub();
  }

  /* ---------------------------------------------------------------- *
   * The briefing.
   * ---------------------------------------------------------------- */

  showBriefing(lesson, {
    record, stickMode = 2, ready = false, keys = false,
  } = {}) {
    this.screen = 'briefing';
    this.stickMode = stickMode;
    const b = this.brief;
    b.textContent = '';
    const card = el('div', 'cr-brief-card');
    const main = el('div');
    const kick = el('div', 'cr-kicker');
    kick.append(document.createTextNode(`Lesson ${lesson.id.replace('-', '.')}  `));
    main.append(kick, lettered(lesson.title, 64, INKS.cream));
    const tags = el('div');
    tags.style.display = 'flex';
    tags.style.gap = '8px';
    tags.style.marginTop = '10px';
    tags.append(modeTag(lesson.mode));
    if (lesson.camera === 'chase') {
      tags.append(el('span', 'cr-tag', 'Chase camera'));
    }
    main.append(tags);
    main.append(el('p', 'cr-goal', sticksIn(lesson.briefing.goal, stickMode, { keys })));
    main.append(el('p', 'cr-why', sticksIn(lesson.briefing.why, stickMode, { keys })));
    const steps = el('ol', 'cr-steps');
    for (const s of lesson.briefing.steps) {
      steps.append(el('li', null, sticksIn(s, stickMode, { keys })));
    }
    main.append(steps);
    if (lesson.briefing.note) {
      main.append(el('div', 'cr-note', sticksIn(lesson.briefing.note, stickMode, { keys })));
    }
    const side = el('div', 'cr-brief-side');
    const sticks = el('div', 'cr-panel');
    sticks.append(el('h4', null, 'The sticks'));
    const sw = el('div');
    sw.innerHTML = sticksHtml(lesson.briefing.sticks || [], stickMode);
    sticks.append(sw);
    if (keys) {
      /* Flying on the keyboard: the drawings are the sticks the keys stand
       * in for, so say which keys. The same map How to fly shows. */
      sticks.append(el('p', 'cr-keys-note', 'On the keyboard: W and S are the throttle, A and D yaw, and the arrows tilt the quad. A tap is a nudge, a hold is a push.'));
    }
    side.append(sticks);
    const medals = el('div', 'cr-panel');
    medals.append(el('h4', null, 'Medals'));
    medals.append(ladder(lesson, record ? record.medal : null, { compact: true }));
    const best = bestOf(lesson, record);
    if (best) {
      medals.append(el('p', 'cr-res-line', `Your best: ${best}`));
    }
    side.append(medals);
    this.loadEl = el('div', `cr-load${ready ? ' ready' : ''}`, ready ? 'Ready.' : 'Getting the field ready...');
    side.append(this.loadEl);
    const actions = el('div', 'cr-brief-actions');
    this.flyBtn = button('Fly', 'Enter', 'primary');
    this.flyBtn.disabled = !ready;
    this.flyBtn.addEventListener('click', () => this.h.fly());
    const back = button('Back', 'Esc');
    back.addEventListener('click', () => this.h.backToHub());
    actions.append(this.flyBtn, back);
    side.append(actions);
    card.append(main, side);
    b.append(card);
    b.append(legendBar([['Enter', 'Fly'], ['Esc', 'Back to the career'], ['R', 'In flight: restart'], ['Esc', 'In flight: pause']]));
    this.paintHands();
    this.setFocus([this.flyBtn, back], 0);
  }

  setReady(ready, text) {
    if (this.flyBtn) {
      this.flyBtn.disabled = !ready;
    }
    if (this.loadEl) {
      this.loadEl.textContent = text || (ready ? 'Ready. Take off when you are.' : 'Getting the field ready...');
      this.loadEl.classList.toggle('ready', Boolean(ready));
    }
  }

  /* ---------------------------------------------------------------- *
   * The flying display.
   * ---------------------------------------------------------------- */

  buildHud() {
    const hud = this.hud;
    this.objBox = el('div', 'cr-obj');
    this.objKicker = el('div', 'cr-obj-kicker');
    this.objText = el('div', 'cr-obj-text');
    const bar = el('div', 'cr-bar');
    this.objBar = el('i');
    bar.append(this.objBar);
    this.objList = el('ul', 'cr-list');
    this.objBox.append(this.objKicker, this.objText, bar, this.objList);
    this.timerEl = el('div', 'cr-timer');
    this.coachEl = el('div', 'cr-coach');
    this.altEl = el('div', 'cr-alt');
    this.altBand = el('div', 'cr-alt-band');
    this.altMark = el('div', 'cr-alt-mark');
    this.altLabel = el('div', 'cr-alt-label');
    this.altEl.append(this.altBand, this.altMark, this.altLabel);
    this.marker = el('div', 'cr-marker');
    this.marker.append(el('div', 'cr-marker-dot'), el('div', 'cr-marker-arrow'));
    this.markerDist = el('div', 'cr-marker-dist');
    this.marker.append(this.markerDist);
    this.popEl = el('div', 'cr-pop');
    this.flashEl = el('div', 'cr-flash');
    hud.append(this.objBox, this.timerEl, this.coachEl, this.altEl, this.marker, this.popEl, this.flashEl);
    this.listKey = '';
  }

  showFlight(lesson) {
    this.screen = 'flight';
    document.body.classList.toggle('career-score', lesson.objectives.some((o) => o.kind === 'score'));
    this.objKicker.textContent = `Lesson ${lesson.id.replace('-', '.')}  ${lesson.title}`;
    this.listKey = '';
    this.coach(null);
    this.altEl.classList.remove('show');
    this.marker.classList.remove('show');
    /* The lesson's name, lettered, for a beat: the run has a title card
     * the way a chapter of a comic does. */
    this.card(lesson.title, { line: `Lesson ${lesson.id.replace('-', '.')}` });
  }

  paintStatus(status, stickMode = 2, keys = false) {
    const cur = status.current;
    this.objText.textContent = cur ? sticksIn(cur.text, stickMode, { keys }) : 'Done';
    this.objBar.style.width = `${Math.round(100 * (cur ? cur.progress : 1))}%`;
    const key = status.list.map((x) => `${x.done ? 1 : 0}${x.active ? 1 : 0}`).join('');
    if (key !== this.listKey) {
      this.listKey = key;
      this.objList.textContent = '';
      for (const it of status.list) {
        const li = el('li', it.done ? 'is-done' : (it.active ? 'is-active' : ''), sticksIn(it.text, stickMode, { keys }));
        this.objList.append(li);
      }
    }
    const started = status.phase !== 'ready';
    this.timerEl.innerHTML = '';
    this.timerEl.append(document.createTextNode(clock(status.elapsedMs)));
    this.timerEl.append(el('small', null, started ? 'TIME' : 'TAKE OFF TO START'));
  }

  coach(text, tone = 'info') {
    if (!text) {
      this.coachEl.classList.remove('show');
      return;
    }
    this.coachEl.textContent = text;
    this.coachEl.classList.toggle('warn', tone === 'warn');
    this.coachEl.classList.add('show');
  }

  /* The height gauge: 0 to top metres, the band to hold, where the quad is. */
  altitude(height, band, top = 8) {
    if (!band) {
      this.altEl.classList.remove('show');
      return;
    }
    this.altEl.classList.add('show');
    const h = this.altEl.clientHeight || 300;
    const y = (m) => h - (Math.max(0, Math.min(top, m)) / top) * h;
    this.altBand.style.top = `${y(band[1])}px`;
    this.altBand.style.height = `${Math.max(4, y(band[0]) - y(band[1]))}px`;
    this.altMark.style.top = `${y(height) - 2}px`;
    this.altMark.classList.toggle('in', height >= band[0] && height <= band[1]);
    this.altLabel.style.top = `${y(height) - 9}px`;
    this.altLabel.textContent = `${height.toFixed(1)} m`;
  }

  /* The marker on the next target: on it when it is on screen, at the edge
   * pointing to it when it is not. x and y are CSS pixels. */
  target(m) {
    if (!m) {
      this.marker.classList.remove('show');
      return;
    }
    this.marker.classList.add('show');
    this.marker.classList.toggle('edge', Boolean(m.edge));
    this.marker.style.left = `${m.x}px`;
    this.marker.style.top = `${m.y}px`;
    const arrow = this.marker.querySelector('.cr-marker-arrow');
    if (arrow) {
      arrow.style.transform = `rotate(${m.angle || 0}rad)`;
    }
    this.markerDist.textContent = Number.isFinite(m.dist) ? `${Math.round(m.dist)} m` : '';
  }

  pop(node, ms = 900) {
    this.popEl.textContent = '';
    this.popEl.append(node);
    this.popEl.classList.add('show');
    clearTimeout(this.popTimer);
    this.popTimer = setTimeout(() => this.popEl.classList.remove('show'), ms);
  }

  flash(text, ms = 1300) {
    this.flashEl.textContent = text;
    this.flashEl.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flashEl.classList.remove('show'), ms);
  }

  stamp(text, fill = INKS.amber, px = 72, ms = 900) {
    const c = el('canvas');
    try {
      paintTitle(c, [{ text, fill }], px, { maxW: window.innerWidth * 0.8 });
      this.pop(c, ms);
    } catch (e) {
      this.flash(text, ms);
    }
  }

  /* A title card in the manga hand: the word, and a smaller line under
   * it (the lesson's number at the start of a run). Lettered the way a
   * callout is, without the balloon, and kept to the upper third. */
  card(word, { fill = INKS.cream, line = '', lineFill = INKS.amber, px = 60, ms = 3000 } = {}) {
    const c = el('canvas');
    try {
      paintCall(c, {
        word, fill, size: Math.min(px, Math.round(window.innerHeight * 0.06)), line, lineFill,
        seed: word, maxW: Math.min(window.innerWidth * 0.5, 760),
      });
      this.pop(c, ms);
    } catch (e) {
      this.flash(word, ms);
    }
  }

  /* ---------------------------------------------------------------- *
   * The results.
   * ---------------------------------------------------------------- */

  showResults(lesson, status, outcome, { next, stickMode = 2, keys = false } = {}) {
    this.screen = 'results';
    const r = this.results;
    r.textContent = '';
    const failed = status.phase === 'failed';
    const card = el('div', `cr-res-card${failed ? ' failed' : ''}`);
    card.append(el('div', 'cr-kicker', `Lesson ${lesson.id.replace('-', '.')}  ${lesson.title}`));
    if (failed) {
      const why = {
        crash: 'Crashed', time: 'Out of time', area: 'Out of bounds', score: 'Not enough',
      }[status.failReason] || 'Try again';
      card.append(lettered(why, 64, INKS.sakura));
      const tip = status.failReason === 'score'
        ? `${points(status.current && status.current.state ? status.current.state.best || 0 : 0)} banked. ${lesson.scoreTip || 'Link your lines: a combo pays more than the same moves one at a time.'}`
        : (lesson.crashTip || 'Take a breath and try it again.');
      card.append(el('p', 'cr-res-tip', sticksIn(tip, stickMode, { keys })));
    } else {
      /* The last lesson of the career, finished for the first time: the
       * licence is the word, not the lesson. */
      const licensed = Boolean(outcome && outcome.careerFinished);
      card.append(lettered(licensed ? 'Licensed' : 'Complete', Math.min(64, Math.round(window.innerHeight * 0.065)), licensed ? INKS.sakura : INKS.mint));
      const medal = el('div', 'cr-res-medal');
      medal.innerHTML = medalSvg(status.medal);
      card.append(medal);
      /* The medal's name, shouted: a burst balloon in the manga hand, the
       * way a callout lands a trick. Gold in gold, silver in silver, and a
       * finish in cream. */
      const shout = el('div', 'cr-res-shout');
      const word = el('canvas');
      try {
        const fill = { gold: INKS.amber, silver: '#d6dee6', bronze: INKS.cream }[status.medal] || INKS.cream;
        paintCall(word, {
          word: MEDAL_NAME[status.medal] || 'Finish', fill, size: Math.max(30, Math.min(52, window.innerHeight * 0.05)),
          balloon: true, seed: `medal-${status.medal}`, reach: 0.7, maxW: Math.min(420, window.innerWidth * 0.4),
        });
        shout.append(word);
      } catch (e) {
        shout.append(el('b', null, MEDAL_NAME[status.medal] || 'Finish'));
      }
      card.append(shout);
      card.append(el('div', 'cr-res-time', scored(lesson) ? points(status.result.score) : clock(status.result.ms)));
      if (scored(lesson)) {
        card.append(el('p', 'cr-res-line', `In ${clock(status.result.ms)}`));
      }
      const badges = el('div', 'cr-res-badges');
      if (licensed) {
        badges.append(el('span', 'cr-badge sakura', 'Pro licence: every lesson flown'));
      }
      if (outcome && outcome.firstFinish) {
        badges.append(el('span', 'cr-badge', 'First finish'));
      }
      if (outcome && outcome.betterMedal) {
        badges.append(el('span', 'cr-badge amber', 'Better medal'));
      }
      if (outcome && outcome.betterTime && !scored(lesson)) {
        badges.append(el('span', 'cr-badge amber', 'New best time'));
      }
      if (outcome && outcome.betterScore) {
        badges.append(el('span', 'cr-badge amber', 'New best score'));
      }
      if (outcome && outcome.opened) {
        const c = CHAPTERS.find((x) => x.id === outcome.opened);
        badges.append(el('span', 'cr-badge sakura', `Opened: ${c ? c.title : 'the next chapter'}`));
      }
      card.append(badges);
      card.append(ladder(lesson, status.medal));
      const line = [];
      if (status.crashes) {
        line.push(`${status.crashes} crash${status.crashes === 1 ? '' : 'es'}`);
      }
      line.push(`top speed ${Math.round(status.maxSpeed * 3.6)} km/h`);
      card.append(el('p', 'cr-res-line', line.join(', ')));
    }
    const actions = el('div', 'cr-res-actions');
    const retry = button('Retry', 'R', failed ? 'primary' : '');
    retry.addEventListener('click', () => this.h.retry());
    const hubBtn = button('Career', 'Esc');
    hubBtn.addEventListener('click', () => this.h.backToHub());
    let nextBtn = null;
    if (!failed && next) {
      nextBtn = button(`Next: ${next.title}`, 'Enter', 'primary');
      nextBtn.addEventListener('click', () => this.h.next());
    }
    actions.append(...[nextBtn, retry, hubBtn].filter(Boolean));
    card.append(actions);
    r.append(card);
    this.paintHands();
    this.setFocus([nextBtn, retry, hubBtn], 0);
  }

  /* Keys on the briefing and the results: walk, press, leave. */
  listKey2(k) {
    if (k === 'left' || k === 'up') {
      this.moveFocus(-1);
    } else if (k === 'right' || k === 'down') {
      this.moveFocus(1);
    } else if (k === 'select') {
      this.pressFocus();
    }
  }
}
