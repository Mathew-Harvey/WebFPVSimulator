/*
 * screens.js: the career's screens and its flying display.
 *
 * One layer over the game, #career, drawn as a manga magazine, the way the
 * front screen is (src/ui/gatepages.js): paper pages, ink panels with a
 * hard shadow, titles lettered in the game's hand. The faces:
 *
 *   COVER      the career's front page: one big Continue panel to the next
 *              lesson, the pilot's licence card, the tree in brief, and
 *              Set my level for a pilot who already flies
 *   TREE       the skill tree (./tree.js): every part as a panel, the links
 *              they grow along, and the chosen part's lessons beside it
 *   FORK       once, after the Rookie Licence: race or freestyle first
 *   LEVEL      Set my level, Open the whole tree, and the save code
 *   BRIEFING   a lesson's page: its picture, the coach, the job, the sticks
 *              and the stars to chase
 *   FLIGHT     the flying display (objective, clock, coach, height gauge,
 *              the marker on the next target)
 *   RESULTS    the medal, the stars, what it opened, what next
 *   PAINT      the Paint Shop: a livery for every part flown whole
 *   ACHIEVEMENTS  the Steam edition's list
 *
 * PICTURES THROUGH THE PAGE. A panel marked .cr-window is a hole in the
 * paper: the live world behind the career (the lesson's own world, on a
 * briefing) shows through it, framed in ink. The paper is one layer per
 * face, clipped round its windows when a face is drawn or the window
 * changes size. Nothing here runs per frame while a menu is up, and none
 * of these faces is up while a lesson flies.
 *
 * INPUT. Every face is a short list of things to press, walked with the
 * arrows, the D-pad or a stick, chosen with Enter or A, left with Escape or
 * B. The controller hands keys and pad edges in; nothing here listens to the
 * document for keys, so the game's own keys never fire twice.
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
import { lessonById } from './curriculum.js';
import {
  BRANCHES, LEVEL_QUESTIONS, PARTS, partById, partOf,
} from './tree.js';
import {
  TITLES, branchStats, lessonRecord, lessonUnlocked, levelAnswers, liveriesEarned, partStats, titleOf, totals,
} from './progress.js';
import {
  checkSvg, coachSvg, lessonGlyph, lockSvg, medalSvg, starSvg,
} from './icons.js';
import { sticksHtml } from './sticks.js';
import { sticksIn } from './words.js';
import { injectCareerStyle } from './style.js';
import { achievementSvg } from '../steam/achievementart.js';
import { LIVERIES, cssOf, liveryById } from '../render/livery.js';

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

/* A heading lettered in the game's hand, the words kept for a reader.
 * `maxW` is a share of the window the lettering may take at most. */
function lettered(text, px, fill = INKS.cream, cls = 'cr-title', maxW = 0.7) {
  const h = el('h2', cls);
  const canvas = el('canvas', 'cr-letters');
  canvas.setAttribute('aria-hidden', 'true');
  const words = el('span', 'cr-title-text', text);
  h.append(canvas, words);
  try {
    /* The outline the game's headings use (ui.js, letterHeading), thinner
     * as the size grows, and an en space between words: at these sizes the
     * hand's own space closes up under the outline and the shadow. */
    const inkW = Math.min(0.2, Math.max(0.1, 7 / px));
    paintTitle(canvas, [{ text: text.replace(/ /g, '\u2002'), fill }], px, { maxW: Math.max(240, window.innerWidth * maxW), inkW });
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
const STAR_COUNT = { gold: 3, silver: 2, bronze: 1 };

/* "Learn to fly, 3.4": the part a lesson is in and where in it. */
function lessonPlace(lesson) {
  const part = partOf(lesson.id);
  if (!part) {
    return `Lesson ${lesson.id.replace('-', '.')}`;
  }
  const i = part.lessons.indexOf(lesson.id);
  const branch = BRANCHES[part.branch];
  if (part.licence) {
    return part.title === lesson.title ? `${branch.title}, the checkride` : part.title;
  }
  return `${branch.title}, ${part.title} ${i + 1} of ${part.lessons.length}`;
}

/* Three stars, as many lit as the medal is worth. */
function starRow(medal, cls = 'cr-stars') {
  const row = el('span', cls);
  const n = STAR_COUNT[medal] || 0;
  row.innerHTML = [0, 1, 2].map((i) => starSvg(i < n)).join('');
  row.setAttribute('aria-label', `${n} of 3 stars`);
  return row;
}

/*
 * The keys a face names, in the hands the pilot has. A keycap reads Enter
 * to somebody at a keyboard and A to somebody on a pad; the legend the
 * same. Every cap carries its keyboard name in data-k and is repainted by
 * paintHands when the controller says the hands changed. A key with no
 * button on the pad is put away there: the thing it does is a button on
 * the page, a press away on the D-pad.
 */
const PAD_CAPS = {
  Enter: 'A', Esc: 'B', 'Q E': 'LB RB', R: '', T: '', L: '', K: '', P: '', Arrows: 'D-pad',
};

function keycap(key, cls = 'cr-key') {
  const k = el('span', cls, key);
  k.dataset.k = key;
  return k;
}

function button(label, key, cls = '') {
  const b = el('button', `cr-btn ${cls}`);
  b.type = 'button';
  b.append(el('span', 'cr-btn-label', label));
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
 * each with its stars, and a tick on the rungs the pilot has reached.
 */
function ladder(lesson, reached) {
  const box = el('div', 'cr-ladder');
  const rank = { gold: 3, silver: 2, bronze: 1 };
  const have = reached ? rank[reached] || 0 : 0;
  for (const m of ['gold', 'silver', 'bronze']) {
    const value = m === 'bronze' ? null : (lesson.medals && lesson.medals[m] != null ? lesson.medals[m] : null);
    if (m !== 'bronze' && value == null) {
      continue;
    }
    const got = have >= rank[m];
    const row = el('div', `cr-rung cr-rung-${m}${got ? ' is-got' : ''}`);
    row.append(starRow(m, 'cr-stars small'));
    row.append(el('b', null, MEDAL_NAME[m]));
    row.append(el('span', 'cr-rung-value', value == null ? 'any time' : medalValue(lesson, value)));
    const tick = el('span', 'cr-rung-tick');
    tick.innerHTML = got ? checkSvg() : '';
    row.append(tick);
    box.append(row);
  }
  return box;
}

/* A part a pilot may mark as flown already: any with lessons but the
 * licences at the top of the tree, which are flown or not at all. The
 * Rookie Licence may be, because it is the trunk's last part and a pilot
 * who flies Acro should not be held at the bottom of the tree. */
function knowable(part) {
  return !part.soon && (!part.licence || part.id === 'rk');
}

/* The next lesson as the cover and the results name it. */
function lessonOf(id) {
  return id ? lessonById(id) : null;
}

/*
 * A five inch from above, nose up, in a livery: the Paint Shop's picture
 * and the results'. Drawn, not rendered, so a page of them costs markup and
 * nothing else. The colours go where src/render/herocraft.js puts them:
 * the vinyl on the pack's label, its straps and the top plate's decals,
 * the chrome on the camera cage, the antenna mount and the motor caps.
 */
function quadSvg(livery) {
  const v = cssOf(livery.vinyl);
  const c = cssOf(livery.chrome);
  const ink = '#0b1116';
  const carbon = '#2a3038';
  const ends = [[46, 46], [154, 46], [46, 154], [154, 154]];
  const arms = ends.map(([x, y]) => `<line x1="100" y1="100" x2="${x}" y2="${y}" stroke="${ink}" stroke-width="22" stroke-linecap="round"/>`
    + `<line x1="100" y1="100" x2="${x}" y2="${y}" stroke="${carbon}" stroke-width="14" stroke-linecap="round"/>`).join('');
  const props = ends.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="38" fill="rgba(157,179,200,0.2)" stroke="${ink}" stroke-width="3"/>`
    + `<circle cx="${x}" cy="${y}" r="13" fill="#5b636e" stroke="${ink}" stroke-width="3"/>`
    + `<circle cx="${x}" cy="${y}" r="6" fill="${c}" stroke="${ink}" stroke-width="2"/>`).join('');
  return `<svg class="cr-quad" viewBox="0 0 200 200" aria-hidden="true">${props}${arms}`
    + `<rect x="72" y="60" width="56" height="84" rx="9" fill="${carbon}" stroke="${ink}" stroke-width="4"/>`
    + `<rect x="78" y="134" width="44" height="5" fill="${v}"/>`
    + `<rect x="80" y="72" width="40" height="58" rx="5" fill="#1a1e24" stroke="${ink}" stroke-width="3"/>`
    + `<rect x="80" y="90" width="40" height="22" fill="${v}" stroke="${ink}" stroke-width="3"/>`
    + `<rect x="76" y="78" width="48" height="5" fill="${v}" stroke="${ink}" stroke-width="1.5"/>`
    + `<rect x="76" y="119" width="48" height="5" fill="${v}" stroke="${ink}" stroke-width="1.5"/>`
    + `<rect x="85" y="40" width="30" height="26" rx="6" fill="${c}" stroke="${ink}" stroke-width="4"/>`
    + `<rect x="93" y="34" width="14" height="10" rx="3" fill="${ink}"/>`
    + `<path d="M91 142 L109 142 L105 162 L95 162 Z" fill="${c}" stroke="${ink}" stroke-width="3"/>`
    + `<line x1="100" y1="160" x2="100" y2="186" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`
    + '</svg>';
}

/* Two chips, vinyl and chrome: a livery at the size of a word. */
function liveryChips(livery) {
  const chips = el('span', 'cr-livery-chips');
  for (const hex of [livery.vinyl, livery.chrome]) {
    const i = el('i');
    i.style.background = cssOf(hex);
    chips.append(i);
  }
  return chips;
}

/* The part whose lessons earn a livery, or null for the house paint. */
function partOfLivery(id) {
  return PARTS.find((x) => x.livery === id) || null;
}

export class CareerScreens {
  constructor(handlers) {
    injectCareerStyle();
    this.h = handlers;
    this.root = el('div');
    this.root.id = 'career';
    this.root.hidden = true;
    this.root.append(el('div', 'cr-scrim'));
    const face = (cls) => {
      const s = el('section', `cr-screen has-paper ${cls}`);
      s.append(el('div', 'cr-paper'));
      return s;
    };
    this.cover = face('cr-cover');
    this.tree = face('cr-tree');
    this.fork = face('cr-fork');
    this.level = face('cr-level');
    this.brief = face('cr-brief');
    this.results = face('cr-results');
    this.paintShop = face('cr-paint');
    this.ach = el('section', 'cr-screen cr-ach');
    this.hud = el('div', 'cr-hud');
    this.root.append(this.cover, this.tree, this.fork, this.level, this.brief, this.results, this.paintShop, this.ach, this.hud);
    document.body.append(this.root);
    this.focus = [];
    this.focusAt = 0;
    this.treeAt = 'c1';
    this.zone = 'parts';
    this.lessonAt = 0;
    /* 'keys' or 'pad': what the keycaps and legends name. */
    this.hands = 'keys';
    this.buildHud();
    /* The paper is cut round the windows again when the window changes
     * size. A redraw, not a loop: the paper scrolls with its face. */
    window.addEventListener('resize', () => {
      this.cutWindows();
      if (this.screen === 'tree') {
        this.drawLinks();
      }
    });
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
    const menu = ['cover', 'tree', 'fork', 'level', 'briefing', 'results', 'paint', 'achievements'].includes(name);
    document.body.classList.toggle('career-menu', menu);
    document.body.classList.toggle('career-flight', name === 'flight');
    if (name !== 'flight') {
      document.body.classList.remove('career-score');
    }
  }

  get screen() {
    return this.root.hidden ? '' : this.root.dataset.screen;
  }

  /* The face that is up, as an element. */
  faceEl() {
    return {
      cover: this.cover, tree: this.tree, fork: this.fork, level: this.level, briefing: this.brief, results: this.results,
      paint: this.paintShop,
    }[this.screen] || null;
  }

  /* A fresh face: emptied but for its paper. */
  clear(face) {
    const paper = face.querySelector(':scope > .cr-paper');
    face.textContent = '';
    paper.style.clipPath = '';
    face.append(paper);
    face.scrollTop = 0;
    return face;
  }

  /*
   * THE WINDOWS. Every .cr-window on the face that is up is cut out of its
   * paper, one even-odd polygon for the page with a hole per window, in the
   * face's own pixels. Measured, so it follows the layout at any size.
   */
  cutWindows() {
    const face = this.faceEl();
    if (!face) {
      return;
    }
    const paper = face.querySelector(':scope > .cr-paper');
    if (!paper) {
      return;
    }
    /* The paper is as tall as everything on the face, not as the window,
     * or a page that scrolls runs out of paper and shows the world under
     * its foot. The last height is let go first, because the paper is part
     * of what scrolls and would otherwise keep a page that got shorter
     * as tall as it was. */
    paper.style.height = '';
    const base = face.getBoundingClientRect();
    const W = Math.max(1, base.width);
    const H = Math.max(1, face.scrollHeight, base.height);
    paper.style.height = `${H}px`;
    const wins = [...face.querySelectorAll('.cr-window')];
    if (!wins.length) {
      paper.style.clipPath = '';
      return;
    }
    const pts = ['0px 0px', `${W}px 0px`, `${W}px ${H}px`, `0px ${H}px`, '0px 0px'];
    for (const w of wins) {
      const r = w.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        continue;
      }
      /* Inside the ink border, so the frame is drawn on paper. */
      const inset = 3;
      const x0 = r.left - base.left + inset;
      const y0 = r.top - base.top + face.scrollTop + inset;
      const x1 = r.right - base.left - inset;
      const y1 = r.bottom - base.top + face.scrollTop - inset;
      pts.push(`${x0}px ${y0}px`, `${x1}px ${y0}px`, `${x1}px ${y1}px`, `${x0}px ${y1}px`, `${x0}px ${y0}px`, '0px 0px');
    }
    paper.style.clipPath = `polygon(evenodd, ${pts.join(', ')})`;
  }

  /* After a face is built: the windows cut once the layout has sizes. */
  settle() {
    this.paintHands();
    requestAnimationFrame(() => {
      this.cutWindows();
      if (this.screen === 'tree') {
        this.drawLinks();
      }
    });
  }

  /* ---------------------------------------------------------------- *
   * Focus: the things a key can press on the face that is up.
   * ---------------------------------------------------------------- */

  setFocus(list, at = 0) {
    this.focus = list.filter(Boolean);
    this.focusAt = Math.max(0, Math.min(at, this.focus.length - 1));
    this.paintFocus(false);
  }

  /* Only a key scrolls the page to the cursor. A page that has just opened
   * starts at its top, so a short window reads the title before the button,
   * and a mouse never drags the page under itself. */
  paintFocus(scroll = true) {
    this.focus.forEach((b, i) => b.classList.toggle('is-focus', i === this.focusAt));
    const on = this.focus[this.focusAt];
    if (scroll && on && on.scrollIntoView) {
      on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
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

  /* Hovering a button moves the cursor to it, so the keys and the mouse
   * never disagree about which one is lit. */
  hoverFocus(list) {
    list.forEach((b, i) => b && b.addEventListener('mouseenter', () => {
      const at = this.focus.indexOf(b);
      if (at >= 0) {
        this.focusAt = at;
        this.paintFocus(false);
      }
    }));
    return list;
  }

  /* Keys on a face that is one list: walk, press, leave. */
  listKey2(k) {
    if (k === 'left' || k === 'up') {
      this.moveFocus(-1);
    } else if (k === 'right' || k === 'down') {
      this.moveFocus(1);
    } else if (k === 'select') {
      this.pressFocus();
    }
  }

  /* ---------------------------------------------------------------- *
   * The licence card: who the pilot is in the career, in one panel.
   * ---------------------------------------------------------------- */

  licenceCard(p) {
    const t = totals(p);
    const card = el('div', 'cr-licence');
    const badge = el('div', 'cr-licence-badge');
    badge.innerHTML = lessonGlyph({ glyph: 'licence', objectives: [] });
    const words = el('div', 'cr-licence-words');
    words.append(el('span', 'cr-licence-kick', 'Pilot licence'));
    words.append(el('b', 'cr-licence-title', TITLES[titleOf(p)]));
    const line = el('span', 'cr-licence-line');
    line.innerHTML = `${starSvg(true)}<span>${t.stars} stars, ${t.done} of ${t.total} lessons</span>`;
    words.append(line);
    card.append(badge, words);
    return card;
  }

  /* ---------------------------------------------------------------- *
   * The cover.
   * ---------------------------------------------------------------- */

  showCover(p, {
    next, stickMode = 2, keys = false, steam = false, achievements = null, livery = LIVERIES[0].id,
  } = {}) {
    this.progress = p;
    this.stickMode = stickMode;
    this.keys = keys;
    this.screen = 'cover';
    const c = this.clear(this.cover);

    const head = el('header', 'cr-cover-head');
    const name = el('div', 'cr-cover-name');
    name.append(el('span', 'cr-kick', 'Career'), lettered('Pilot’s Path', 92, INKS.cream, 'cr-title cr-cover-title', 0.5));
    head.append(name, this.licenceCard(p));
    c.append(head);

    const grid = el('div', 'cr-cover-grid');
    const hero = el('div', 'cr-continue cr-window');
    const lesson = next && next.lesson ? lessonOf(next.lesson) : null;
    let kick = 'Up next';
    let title = 'Pick a way';
    let line = 'Your Rookie Licence opened both ways. Race or freestyle first?';
    let go = 'Pick a way';
    if (lesson) {
      kick = next.polish ? 'Go for a better medal' : 'Up next';
      title = lesson.title;
      line = sticksIn(lesson.briefing.goal, stickMode, { keys });
      go = next.polish ? 'Fly it again' : (p.runs ? 'Continue' : 'Start');
    } else if (!next) {
      kick = 'Every lesson, gold';
      title = 'WebFPV Pro';
      line = 'There is nothing left to win. Fly any lesson again from the tree.';
      go = 'Open the tree';
    }
    const cap = el('div', 'cr-continue-words');
    cap.append(el('span', 'cr-kick', kick));
    if (lesson) {
      cap.append(el('span', 'cr-continue-place', lessonPlace(lesson)));
    }
    cap.append(lettered(title, 84, INKS.cream, 'cr-title cr-continue-title', 0.5));
    cap.append(el('p', 'cr-caption', line));
    this.goBtn = button(go, 'Enter', 'primary big');
    this.goBtn.addEventListener('click', () => {
      if (lesson) {
        this.h.open(lesson.id, 'cover');
      } else if (next && next.fork) {
        this.h.toFork();
      } else {
        this.h.toTree();
      }
    });
    cap.append(this.goBtn);
    hero.append(cap);
    if (lesson) {
      const balloon = el('div', 'cr-cover-balloon', next.polish ? 'One more star!' : (p.runs ? 'You’re on it!' : 'Let’s fly!'));
      hero.append(balloon);
    }
    grid.append(hero);

    const side = el('div', 'cr-cover-side');
    const treeCard = el('div', 'cr-panel cr-treecard');
    treeCard.append(el('span', 'cr-kick', 'Your skill tree'));
    const ways = el('div', 'cr-ways');
    for (const b of ['race', 'freestyle']) {
      const s = branchStats(p, b);
      const box = el('div', `cr-way cr-way-${b}${s.open ? '' : ' is-locked'}`);
      box.append(el('b', 'cr-way-name', BRANCHES[b].title));
      box.append(el('span', 'cr-way-line', b === 'race' ? 'Gates, racing, the official tracks' : 'Gaps, flips, tricks and lines'));
      const stat = el('span', 'cr-way-stat');
      stat.innerHTML = s.open
        ? `${starSvg(true)}<span>${s.stars} of ${s.maxStars}</span>`
        : `${lockSvg()}<span>Opens at your Rookie Licence</span>`;
      box.append(stat);
      ways.append(box);
    }
    treeCard.append(ways);
    this.treeBtn = button('Open the tree', 'T');
    this.treeBtn.addEventListener('click', () => this.h.toTree());
    treeCard.append(this.treeBtn);
    side.append(treeCard);

    const levelCard = el('div', 'cr-panel cr-levelcard');
    levelCard.append(el('span', 'cr-kick', 'Already fly?'));
    levelCard.append(el('p', 'cr-panel-line', 'Fill in the tree up to what you can already do, then pick your own way through it.'));
    this.levelBtn = button('Set my level', 'L');
    this.levelBtn.addEventListener('click', () => this.h.toLevel());
    levelCard.append(this.levelBtn);
    side.append(levelCard);

    const paintCard = el('div', 'cr-panel cr-paintcard');
    const on = liveryById(livery);
    const pic = el('div', 'cr-paintcard-pic');
    pic.innerHTML = quadSvg(on);
    const pw = el('div', 'cr-paintcard-words');
    pw.append(el('span', 'cr-kick', 'Your quad'));
    const earned = 1 + liveriesEarned(p).length;
    pw.append(el('p', 'cr-panel-line', `${on.name} paint. ${earned} of ${LIVERIES.length} liveries earned: finish a part to earn its colours.`));
    this.paintBtn = button('Paint Shop', 'P');
    this.paintBtn.addEventListener('click', () => this.h.toPaint());
    pw.append(this.paintBtn);
    paintCard.append(pic, pw);
    side.append(paintCard);
    grid.append(side);
    c.append(grid);

    const foot = el('footer', 'cr-cover-foot');
    this.achBtn = null;
    if (achievements) {
      this.achBtn = button(`Achievements ${achievements.earned}/${achievements.total}`, null);
      this.achBtn.addEventListener('click', () => this.h.achievements());
      foot.append(this.achBtn);
    }
    this.coverBack = button('Back', 'Esc');
    this.coverBack.addEventListener('click', () => this.h.leave());
    foot.append(this.coverBack);
    foot.append(el('span', 'cr-save-note', steam
      ? 'Saved on this computer, and Steam Cloud keeps it with your account.'
      : 'Saved in this browser. Set my level has a save code to take it elsewhere.'));
    c.append(foot);
    c.append(legendBar([['Arrows', 'Move'], ['Enter', 'Choose'], ['T', 'Tree'], ['L', 'Set my level'], ['P', 'Paint Shop'], ['Esc', 'Back']]));
    const list = [this.goBtn, this.treeBtn, this.levelBtn, this.paintBtn, this.achBtn, this.coverBack];
    this.hoverFocus(list);
    this.setFocus(list, 0);
    this.settle();
  }

  coverKey(k) {
    if (k === 'back') {
      this.h.leave();
    } else if (k === 'tree') {
      this.h.toTree();
    } else if (k === 'level') {
      this.h.toLevel();
    } else if (k === 'paint') {
      this.h.toPaint();
    } else {
      this.listKey2(k);
    }
  }

  /* ---------------------------------------------------------------- *
   * The tree.
   * ---------------------------------------------------------------- */

  showTree(p, { part, current, stickMode = 2, keys = false } = {}) {
    this.progress = p;
    this.stickMode = stickMode;
    this.keys = keys;
    this.current = current || null;
    if (part && partById(part)) {
      this.treeAt = part;
    }
    this.zone = this.zone === 'lessons' ? 'lessons' : 'parts';
    this.screen = 'tree';
    this.renderTree();
  }

  renderTree() {
    const p = this.progress;
    const t = this.clear(this.tree);
    const grid = el('div', 'cr-tree-grid');
    this.treeGrid = grid;
    this.links = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.links.setAttribute('class', 'cr-links');
    this.links.setAttribute('aria-hidden', 'true');
    grid.append(this.links);
    this.partEls = new Map();
    /* The order the parts are listed in on a narrow window, where the tree
     * is a list: up the trunk, then each branch, then the crown. */
    const listOrder = ['trunk', 'race', 'freestyle', 'crown'].flatMap((b) => PARTS
      .filter((x) => x.branch === b)
      .sort((a, z) => (z.row - a.row) || (a.col - z.col))
      .map((x) => x.id));
    for (const part of PARTS) {
      const s = partStats(p, part);
      const node = el('button', `cr-part cr-part-${part.branch} is-${s.state}${part.licence ? ' is-licence' : ''}${this.current === part.id ? ' is-current' : ''}`);
      node.type = 'button';
      node.dataset.col = String(part.col);
      node.dataset.row = String(part.row);
      node.style.order = String(listOrder.indexOf(part.id) * 2);
      if (part.span) {
        node.dataset.span = String(part.span);
      }
      node.append(el('span', 'cr-part-kick', part.licence ? 'Licence' : BRANCHES[part.branch].title));
      node.append(el('span', 'cr-part-name', part.title));
      const foot = el('span', 'cr-part-foot');
      if (part.soon) {
        foot.append(el('span', 'cr-part-short', part.short));
        node.append(el('span', 'cr-stamp soon', 'Next issue'));
      } else {
        const pips = el('span', 'cr-pips');
        for (const m of s.medals) {
          pips.append(el('i', m ? `is-${m}` : ''));
        }
        foot.append(pips);
        const stat = el('span', 'cr-part-stat');
        if (s.state === 'locked') {
          stat.innerHTML = `${lockSvg()}`;
        } else {
          stat.innerHTML = `${starSvg(s.stars > 0)}<span>${s.stars}/${s.maxStars}</span>`;
        }
        foot.append(stat);
        if (s.state === 'known') {
          node.append(el('span', 'cr-stamp known', 'Known'));
        } else if (this.current === part.id) {
          node.append(el('span', 'cr-stamp here', 'You are here'));
        }
      }
      node.append(foot);
      node.addEventListener('mouseenter', () => {
        if (this.treeAt !== part.id) {
          this.treeAt = part.id;
          this.zone = 'parts';
          this.lessonAt = 0;
          this.markTree();
        }
      });
      node.addEventListener('click', () => {
        this.treeAt = part.id;
        this.zone = part.soon ? 'parts' : 'lessons';
        this.lessonAt = this.firstLessonAt(part);
        this.markTree();
      });
      grid.append(node);
      this.partEls.set(part.id, node);
    }

    /* The empty corner under the race branch holds the page's title and
     * the key to the tree; the one under freestyle, the chosen part. */
    const key = el('div', 'cr-tree-key');
    key.style.order = '-1';
    key.append(el('span', 'cr-kick', 'Career'), lettered('The Skill Tree', 64, INKS.cream, 'cr-title', 0.36));
    key.append(el('p', 'cr-panel-line', 'Learn to fly up the middle. Your Rookie Licence opens both ways at once. In a branch, three lessons of a part open the next, and a licence takes every part of its branch.'));
    const legend = el('div', 'cr-tree-legend');
    for (const [cls, words] of [['done', 'Flown'], ['current', 'You are here'], ['open', 'Open'], ['known', 'Known'], ['locked', 'Not yet'], ['soon', 'Next issue']]) {
      const item = el('span');
      item.append(el('i', `cr-swatch ${cls}`), document.createTextNode(words));
      legend.append(item);
    }
    key.append(legend);
    const keyBtns = el('div', 'cr-row');
    this.treeLevelBtn = button('Set my level', 'L', 'small');
    this.treeLevelBtn.addEventListener('click', () => this.h.toLevel());
    this.treeBackBtn = button('Back', 'Esc', 'small');
    this.treeBackBtn.addEventListener('click', () => this.h.toCover());
    keyBtns.append(this.treeLevelBtn, this.treeBackBtn);
    key.append(keyBtns);
    grid.append(key);

    this.sheet = el('div', 'cr-sheet');
    grid.append(this.sheet);
    t.append(grid);
    t.append(legendBar([['Arrows', 'Move'], ['Enter', 'Choose'], ['K', 'I can fly this'], ['L', 'Set my level'], ['Esc', 'Back']]));
    this.markTree();
    this.settle();
  }

  /* The lesson a part's sheet starts on: the first open one without a
   * medal, else the first. */
  firstLessonAt(part) {
    const p = this.progress;
    const i = part.lessons.findIndex((id) => lessonUnlocked(p, id) && !(lessonRecord(p, id) || {}).medal);
    return i >= 0 ? i : 0;
  }

  markTree() {
    for (const [id, node] of this.partEls) {
      node.classList.toggle('is-on', id === this.treeAt);
    }
    const chosen = this.partEls.get(this.treeAt);
    if (chosen && this.sheet) {
      this.sheet.style.order = String(Number(chosen.style.order) + 1);
    }
    this.paintSheet();
    /* In the list a small window gets, the part goes to the top so its
     * lessons, which follow it, are on the page too. The grid never scrolls. */
    const on = this.partEls.get(this.treeAt);
    if (on && on.scrollIntoView && this.zone === 'parts') {
      on.scrollIntoView({ block: 'start', inline: 'nearest' });
    }
    this.cutWindows();
  }

  paintSheet() {
    const p = this.progress;
    const part = partById(this.treeAt);
    const d = this.sheet;
    if (!d || !part) {
      return;
    }
    d.textContent = '';
    const s = partStats(p, part);
    const branch = BRANCHES[part.branch];
    d.className = `cr-sheet cr-sheet-${part.branch}`;
    d.append(el('span', 'cr-kick', part.licence ? 'Licence' : branch.title));
    d.append(el('b', 'cr-sheet-title', part.title));
    this.sheetLessons = [];
    this.knownBtn = null;
    if (part.soon) {
      d.append(el('p', 'cr-panel-line', `${part.short}. In the next issue: this part is being written, and opens here when it is.`));
      return;
    }
    d.append(el('p', 'cr-panel-line', s.state === 'locked' ? this.lockedLine(part) : (part.blurb || part.short)));
    const row = el('div', 'cr-sheet-lessons');
    part.lessons.forEach((id, i) => {
      const l = lessonById(id);
      const rec = lessonRecord(p, id);
      const open = lessonUnlocked(p, id);
      const tile = el('button', `cr-tile${open ? '' : ' is-locked'}${rec && rec.medal ? ` is-${rec.medal}` : ''}`);
      tile.type = 'button';
      const glyph = el('span', 'cr-tile-glyph');
      glyph.innerHTML = open ? lessonGlyph(l) : lockSvg();
      tile.append(glyph);
      tile.append(el('span', 'cr-tile-name', l.title));
      const foot = el('span', 'cr-tile-foot');
      foot.append(starRow(rec && rec.medal, 'cr-stars tiny'));
      const best = bestOf(l, rec);
      if (best) {
        foot.append(el('span', 'cr-tile-best', best));
      }
      tile.append(foot);
      tile.addEventListener('mouseenter', () => {
        this.zone = 'lessons';
        this.lessonAt = i;
        this.paintZone();
      });
      tile.addEventListener('click', () => {
        if (open) {
          this.h.open(id, 'tree');
        }
      });
      row.append(tile);
      this.sheetLessons.push(tile);
    });
    d.append(row);
    if (knowable(part) && s.state !== 'done') {
      const known = s.known;
      this.knownBtn = button(known ? 'Unmark: I have not flown this' : 'I can fly this already', 'K', 'small');
      this.knownBtn.addEventListener('click', () => this.h.markKnown(part.id, !known));
      d.append(this.knownBtn);
    }
    this.paintZone();
  }

  lockedLine(part) {
    if (part.after === 'branch') {
      return `Opens when every part of ${BRANCHES[part.branch].title} is finished.`;
    }
    const names = part.after.map((id) => partById(id)).filter(Boolean).map((x) => x.title);
    const trunk = part.branch === 'trunk' || part.branch === 'crown';
    const how = trunk ? 'Finish' : 'Fly three lessons of';
    if (part.id === 'pro') {
      return 'Opens when you hold both licences, race and freestyle.';
    }
    return `${how} ${names.join(' and ')} to open it, or mark what you can already fly in Set my level.`;
  }

  paintZone() {
    const tiles = this.sheetLessons || [];
    const items = [...tiles, this.knownBtn].filter(Boolean);
    items.forEach((b, i) => b.classList.toggle('is-focus', this.zone === 'lessons' && i === this.lessonAt));
    const on = items[this.lessonAt];
    if (this.zone === 'lessons' && on && on.scrollIntoView) {
      on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (this.partEls) {
      for (const [id, node] of this.partEls) {
        node.classList.toggle('is-focus', this.zone === 'parts' && id === this.treeAt);
      }
    }
  }

  /* The part nearest in a direction, by the panels' places on screen. */
  partToward(dir) {
    const from = this.partEls.get(this.treeAt);
    if (!from) {
      return null;
    }
    const a = from.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const [id, node] of this.partEls) {
      if (id === this.treeAt) {
        continue;
      }
      const b = node.getBoundingClientRect();
      const dx = b.left + b.width / 2 - ax;
      const dy = b.top + b.height / 2 - ay;
      const along = { left: -dx, right: dx, up: -dy, down: dy }[dir];
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 4) {
        continue;
      }
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best;
  }

  treeKey(k) {
    const part = partById(this.treeAt);
    if (k === 'level') {
      this.h.toLevel();
      return;
    }
    if (k === 'known' && part && knowable(part)) {
      this.h.markKnown(part.id, !partStats(this.progress, part).known);
      return;
    }
    if (this.zone === 'lessons') {
      const items = [...(this.sheetLessons || []), this.knownBtn].filter(Boolean);
      if (k === 'back' || k === 'up' || !items.length) {
        this.zone = 'parts';
        this.paintZone();
        return;
      }
      if (k === 'left' || k === 'right') {
        this.lessonAt = (this.lessonAt + (k === 'right' ? 1 : -1) + items.length) % items.length;
        this.paintZone();
      } else if (k === 'down') {
        this.lessonAt = items.length - 1;
        this.paintZone();
      } else if (k === 'select') {
        const b = items[this.lessonAt];
        if (b && !b.classList.contains('is-locked')) {
          b.click();
        }
      }
      return;
    }
    if (k === 'back') {
      this.h.toCover();
      return;
    }
    if (k === 'select') {
      if (part && !part.soon) {
        this.zone = 'lessons';
        this.lessonAt = this.firstLessonAt(part);
        this.paintZone();
      }
      return;
    }
    if (k === 'prevChapter' || k === 'nextChapter') {
      const order = PARTS.map((x) => x.id);
      const i = order.indexOf(this.treeAt);
      this.treeAt = order[(i + (k === 'nextChapter' ? 1 : -1) + order.length) % order.length];
      this.lessonAt = 0;
      this.markTree();
      return;
    }
    if (k === 'left' || k === 'right' || k === 'up' || k === 'down') {
      const to = this.partToward(k);
      if (to) {
        this.treeAt = to;
        this.lessonAt = 0;
        this.markTree();
      } else if (k === 'down') {
        /* Off the bottom of the tree: the part's lessons. */
        this.zone = 'lessons';
        this.lessonAt = this.firstLessonAt(part);
        this.paintZone();
      }
    }
  }

  /*
   * THE LINKS, drawn in one SVG over the grid from the panels' own boxes,
   * when the tree is drawn and when the window changes size. Square elbows
   * through the gutters, the way a page's panel borders run: straight up
   * from a part to the one above it, along a row to a neighbour, and round
   * through the gutter when there is a panel in the way.
   */
  drawLinks() {
    const svg = this.links;
    const grid = this.treeGrid;
    if (!svg || !grid || !grid.isConnected) {
      return;
    }
    const g = grid.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${Math.max(1, g.width)} ${Math.max(1, g.height)}`);
    svg.setAttribute('width', String(g.width));
    svg.setAttribute('height', String(g.height));
    const box = (id) => {
      const n = this.partEls.get(id);
      if (!n || n.offsetParent === null) {
        return null;
      }
      const r = n.getBoundingClientRect();
      return {
        l: r.left - g.left, r: r.right - g.left, t: r.top - g.top, b: r.bottom - g.top, cx: r.left - g.left + r.width / 2, cy: r.top - g.top + r.height / 2,
      };
    };
    const p = this.progress;
    let out = '';
    const line = (d, lit, soon) => {
      const mods = `${lit ? ' is-lit' : ''}${soon ? ' is-soon' : ''}`;
      out += `<path class="cr-link-ink${mods}" d="${d}"/><path class="cr-link${mods}" d="${d}"/>`;
    };
    for (const part of PARTS) {
      const parents = part.after === 'branch'
        ? PARTS.filter((x) => x.branch === part.branch && x.row === part.row + 1 && x.col >= part.col && x.col < part.col + (part.span || 1))
        : part.after.map((id) => partById(id)).filter(Boolean);
      const to = box(part.id);
      if (!to) {
        continue;
      }
      const lit = !part.soon && partStats(p, part).open;
      for (const from of parents) {
        const a = box(from.id);
        if (!a) {
          continue;
        }
        const soon = part.soon || from.soon;
        let d;
        const sameCol = to.l < a.cx && a.cx < to.r;
        if (sameCol && a.t > to.b) {
          d = `M${a.cx} ${a.t} V${to.b}`;
        } else if (Math.abs(a.cy - to.cy) < 4) {
          const between = PARTS.some((x) => x !== part && x !== from && x.row === from.row
            && ((x.col > Math.min(from.col, part.col) && x.col < Math.max(from.col, part.col))));
          if (!between) {
            d = a.cx < to.cx ? `M${a.r} ${a.cy} H${to.l}` : `M${a.l} ${a.cy} H${to.r}`;
          } else {
            const y = a.b + 12;
            const x0 = a.cx < to.cx ? a.r - 18 : a.l + 18;
            d = `M${x0} ${a.b} V${y} H${to.cx} V${to.b}`;
          }
        } else {
          const right = to.cx > a.cx;
          const gx = right ? a.r + 14 : a.l - 14;
          d = `M${right ? a.r : a.l} ${a.cy} H${gx} V${to.cy} H${right ? to.l : to.r}`;
        }
        line(d, lit, soon);
      }
    }
    svg.innerHTML = out;
  }

  /* ---------------------------------------------------------------- *
   * The fork: race or freestyle first.
   * ---------------------------------------------------------------- */

  showFork(p) {
    this.progress = p;
    this.screen = 'fork';
    const f = this.clear(this.fork);
    const side = (b, words, lines) => {
      const a = el('button', `cr-fork-side cr-fork-${b}`);
      a.type = 'button';
      a.append(el('span', 'cr-kick', words));
      /* A short window stacks the two ways, so the word is lettered to fit
       * the panel's height rather than half the page's width. */
      const px = Math.max(56, Math.min(120, Math.round(window.innerHeight * 0.13)));
      a.append(lettered(BRANCHES[b].title, px, INKS.cream, 'cr-title cr-fork-title', 0.3));
      const list = el('ul', 'cr-fork-list');
      for (const l of lines) {
        list.append(el('li', null, l));
      }
      a.append(list);
      a.append(el('span', 'cr-btn primary big', b === 'race' ? 'Start racing' : 'Start freestyle'));
      a.addEventListener('click', () => this.h.chooseBranch(b));
      return a;
    };
    this.forkRace = side('race', 'Way one', ['Gates, then laps on the official tracks.', 'Starts, race lines and a ghost to beat.', 'Your Pro Race Licence at the end.']);
    this.forkFree = side('freestyle', 'Way two', ['Gaps through containers and a building.', 'Flips and rolls, then the hard ones in halves.', 'Powerloops, Split-S and Matty Flips.']);
    const mid = el('div', 'cr-fork-mid');
    const stamp = el('div', 'cr-fork-stamp');
    stamp.append(el('span', null, 'Licensed'), el('b', null, 'Rookie'), el('span', null, 'WebFPV pilot'));
    const back = button('Back to the tree', 'Esc', 'small');
    back.addEventListener('click', () => this.h.toTree('rk'));
    mid.append(stamp, el('div', 'cr-fork-balloon', 'Which way first?'), el('p', 'cr-fork-note', 'Both are open now. This is only where you start.'), back);
    f.append(this.forkRace, mid, this.forkFree);
    f.append(legendBar([['Arrows', 'Choose'], ['Enter', 'Start'], ['Esc', 'Back to the tree']]));
    this.hoverFocus([this.forkRace, this.forkFree]);
    this.setFocus([this.forkRace, this.forkFree], p.first === 'freestyle' ? 1 : 0);
    this.settle();
  }

  forkKey(k) {
    if (k === 'back') {
      this.h.toTree('rk');
    } else {
      this.listKey2(k);
    }
  }

  /* ---------------------------------------------------------------- *
   * Set my level, the whole tree, and the save code.
   * ---------------------------------------------------------------- */

  showLevel(p, { steam = false, message = '' } = {}) {
    this.progress = p;
    this.screen = 'level';
    const v = this.clear(this.level);
    this.answers = this.answers && this.levelFresh === false ? this.answers : levelAnswers(p);
    this.levelFresh = false;
    const main = el('div', 'cr-level-main');
    main.append(el('span', 'cr-kick', 'Already fly?'), lettered('Set My Level', 80, INKS.cream, 'cr-title', 0.45));
    main.append(el('p', 'cr-panel-line wide', 'Tell us what you can already do. Those parts are marked as known and everything after them opens. Stars are still flown for, one run at a time.'));
    const qs = el('div', 'cr-panel cr-questions');
    const focus = [];
    for (const q of LEVEL_QUESTIONS) {
      const row = el('div', 'cr-q');
      row.append(el('span', 'cr-q-text', q.text));
      for (const [label, val] of [['Yes', true], ['Not yet', false]]) {
        const b = el('button', `cr-choice${this.answers[q.id] === val ? ' is-picked' : ''}`, label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(this.answers[q.id] === val));
        b.addEventListener('click', () => {
          this.answers[q.id] = val;
          const at = this.focusAt;
          const y = this.level.scrollTop;
          this.showLevel(this.progress, { steam });
          this.level.scrollTop = y;
          this.setFocus(this.focus, at);
        });
        row.append(b);
        focus.push(b);
      }
      qs.append(row);
    }
    main.append(qs);
    const acts = el('div', 'cr-row');
    const mark = button('Mark these as known', 'Enter', 'primary');
    mark.addEventListener('click', () => this.h.setLevel({ ...this.answers }));
    const all = button(p.openAll ? 'Close the whole tree again' : 'Open the whole tree', null);
    all.addEventListener('click', () => this.h.openAll(!p.openAll));
    acts.append(mark, all);
    let clearBtn = null;
    if (p.known.length) {
      clearBtn = button('Clear what I marked', null, 'small');
      clearBtn.addEventListener('click', () => this.h.clearKnown());
      acts.append(clearBtn);
    }
    main.append(acts);
    if (message) {
      main.append(el('p', 'cr-level-message', message));
    }
    focus.push(mark, all, clearBtn);

    const side = el('div', 'cr-level-side');
    const save = el('div', 'cr-panel cr-savecard');
    save.append(el('span', 'cr-kick', 'Keep your career'));
    save.append(el('p', 'cr-panel-line', steam
      ? 'Steam Cloud keeps your career with your account. A save code still takes it to the browser game and back.'
      : 'Your career lives in this browser. A save code takes it to another computer or browser: copy it here, paste it there.'));
    const copy = button('Copy save code', null);
    const paste = button('Load a code', null);
    const field = el('textarea', 'cr-code');
    field.rows = 3;
    field.spellcheck = false;
    field.setAttribute('aria-label', 'Save code');
    field.placeholder = 'WFPV2-...';
    field.hidden = true;
    const load = button('Load this code', null, 'primary small');
    load.hidden = true;
    const said = el('p', 'cr-code-said');
    copy.addEventListener('click', () => {
      field.hidden = false;
      field.readOnly = true;
      load.hidden = true;
      field.value = this.h.saveCode();
      field.select();
      this.cutWindows();
      const done = () => { said.textContent = 'Copied. Paste it into Load a code on the other computer.'; this.cutWindows(); };
      const fail = () => { said.textContent = 'Selected: copy it with Ctrl and C.'; this.cutWindows(); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(field.value).then(done, fail);
        } else {
          fail();
        }
      } catch (e) {
        fail();
      }
    });
    paste.addEventListener('click', () => {
      field.hidden = false;
      field.readOnly = false;
      field.value = '';
      load.hidden = false;
      said.textContent = 'Paste a code, then Load this code. It adds to your career, and never takes a medal away.';
      this.cutWindows();
      field.focus();
    });
    load.addEventListener('click', () => {
      said.textContent = this.h.loadCode(field.value);
      this.cutWindows();
    });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !field.readOnly) {
        e.preventDefault();
        said.textContent = this.h.loadCode(field.value);
        this.cutWindows();
      }
    });
    const codeRow = el('div', 'cr-row');
    codeRow.append(copy, paste);
    save.append(codeRow, field, load, said);
    side.append(save);
    const back = button('Back', 'Esc');
    back.addEventListener('click', () => this.h.levelBack());
    side.append(back);
    focus.push(copy, paste, back);
    v.append(main, side);
    v.append(legendBar([['Arrows', 'Move'], ['Enter', 'Choose'], ['Esc', 'Back']]));
    this.hoverFocus(focus);
    this.setFocus(focus, 0);
    this.settle();
  }

  levelKey(k) {
    if (k === 'back') {
      this.h.levelBack();
    } else {
      this.listKey2(k);
    }
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
    left.append(el('p', 'cr-sub', 'Kept on this computer, and on Steam whenever Steam is running. Shift and Tab opens the Steam overlay’s list too.'));
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

  /* ---------------------------------------------------------------- *
   * The briefing: the lesson's page.
   * ---------------------------------------------------------------- */

  showBriefing(lesson, {
    record, stickMode = 2, ready = false, keys = false, from = 'tree',
  } = {}) {
    this.screen = 'briefing';
    this.stickMode = stickMode;
    const b = this.clear(this.brief);
    const page = el('div', 'cr-brief-page');

    const hero = el('div', 'cr-brief-hero cr-window');
    const heroWords = el('div', 'cr-brief-hero-words');
    heroWords.append(el('span', 'cr-kick', lessonPlace(lesson)));
    heroWords.append(lettered(lesson.title, 96, INKS.cream, 'cr-title cr-brief-title', 0.5));
    const tags = el('div', 'cr-tags');
    tags.append(modeTag(lesson.mode));
    if (lesson.camera === 'chase') {
      tags.append(el('span', 'cr-tag', 'Chase camera'));
    }
    if (lesson.failOn && lesson.failOn.crash) {
      tags.append(el('span', 'cr-tag warn', 'No crashes'));
    }
    heroWords.append(tags);
    hero.append(heroWords);
    this.loadEl = el('div', `cr-load${ready ? ' ready' : ''}`, ready ? 'Ready.' : 'Getting the field ready...');
    hero.append(this.loadEl);
    page.append(hero);

    const coach = el('div', 'cr-brief-coach');
    const balloon = el('div', 'cr-balloon', sticksIn(lesson.briefing.why, stickMode, { keys }));
    const art = el('div', 'cr-coach-face');
    art.innerHTML = coachSvg();
    coach.append(balloon, art);
    page.append(coach);

    const job = el('div', 'cr-panel cr-brief-job');
    job.append(el('span', 'cr-kick', 'The job'));
    job.append(el('p', 'cr-goal', sticksIn(lesson.briefing.goal, stickMode, { keys })));
    const steps = el('ol', 'cr-steps');
    for (const s of lesson.briefing.steps) {
      steps.append(el('li', null, sticksIn(s, stickMode, { keys })));
    }
    job.append(steps);
    if (lesson.briefing.note) {
      job.append(el('p', 'cr-note', sticksIn(lesson.briefing.note, stickMode, { keys })));
    }
    page.append(job);

    const sticks = el('div', 'cr-panel cr-brief-sticks');
    sticks.append(el('span', 'cr-kick', 'The sticks'));
    const sw = el('div');
    sw.innerHTML = sticksHtml(lesson.briefing.sticks || [], stickMode);
    sticks.append(sw);
    if (keys) {
      /* Flying on the keyboard: the drawings are the sticks the keys stand
       * in for, so say which keys. The same map How to fly shows. */
      sticks.append(el('p', 'cr-keys-note', 'On the keyboard: W and S are the throttle, A and D yaw, and the arrows tilt the quad. A tap is a nudge, a hold is a push.'));
    }
    page.append(sticks);

    const go = el('div', 'cr-brief-go');
    const medals = el('div', 'cr-panel cr-brief-medals');
    medals.append(el('span', 'cr-kick', 'Stars'));
    medals.append(ladder(lesson, record ? record.medal : null));
    const best = bestOf(lesson, record);
    medals.append(el('p', 'cr-best', best ? `Your best: ${best}` : 'Your best: not flown yet'));
    go.append(medals);
    const actions = el('div', 'cr-row');
    this.flyBtn = button('Fly', 'Enter', 'primary big');
    this.flyBtn.disabled = !ready;
    this.flyBtn.addEventListener('click', () => this.h.fly());
    const back = button(from === 'cover' ? 'Back' : 'Back to the tree', 'Esc');
    back.addEventListener('click', () => this.h.backFromBriefing());
    actions.append(this.flyBtn, back);
    go.append(actions);
    page.append(go);
    b.append(page);
    b.append(legendBar([['Enter', 'Fly'], ['Esc', 'Back'], ['R', 'In flight: restart'], ['Esc', 'In flight: pause']]));
    this.hoverFocus([this.flyBtn, back]);
    this.setFocus([this.flyBtn, back], 0);
    this.settle();
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
    /* The counter's total and combo are shown for a lesson that is scored
     * by them: a score run, a combo, or close calls. */
    document.body.classList.toggle('career-score', lesson.objectives.some((o) => o.kind === 'score' || o.kind === 'combo' || o.kind === 'close'));
    this.objKicker.textContent = `${lessonPlace(lesson)}  ${lesson.title}`;
    this.listKey = '';
    this.coach(null);
    this.altEl.classList.remove('show');
    this.marker.classList.remove('show');
    /* The lesson's name, lettered, for a beat: the run has a title card
     * the way a chapter of a comic does. */
    this.card(lesson.title, { line: lessonPlace(lesson) });
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
   * it (where the lesson is, at the start of a run). Lettered the way a
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

  showResults(lesson, status, outcome, {
    next, progress, stickMode = 2, keys = false,
  } = {}) {
    this.screen = 'results';
    const r = this.clear(this.results);
    const failed = status.phase === 'failed';
    r.classList.toggle('is-failed', failed);
    r.classList.toggle('is-gold', !failed && status.medal === 'gold');
    const page = el('div', 'cr-res-page');
    const main = el('div', 'cr-res-main');
    main.append(el('span', 'cr-kick', `${lessonPlace(lesson)}: ${lesson.title}`));
    const extra = [];
    let paintBtn = null;
    if (failed) {
      const why = {
        crash: 'Crashed!', time: 'Out of time!', area: 'Out of bounds!', score: 'Not enough!', slow: 'Too slow!', laps: 'Out of laps!',
      }[status.failReason] || 'Try again!';
      main.append(lettered(why, 120, INKS.sakura, 'cr-title cr-res-word', 0.5));
      /* The lesson's own word for each way a run ends early, then the crash
       * tip, which is what most of them have. */
      const tips = {
        score: `${points(status.current && status.current.state ? status.current.state.best || 0 : 0)} banked. ${lesson.scoreTip || 'Link your lines: a combo pays more than the same moves one at a time.'}`,
        slow: lesson.slowTip,
        laps: lesson.lapsTip,
      };
      const tip = tips[status.failReason] || lesson.crashTip || 'Take a breath and try it again.';
      const coach = el('div', 'cr-res-coach');
      const art = el('div', 'cr-coach-face small');
      art.innerHTML = coachSvg();
      coach.append(art, el('div', 'cr-balloon left', sticksIn(tip, stickMode, { keys })));
      main.append(coach);
      /* What is still there to win, and the best the pilot already has. */
      const rec = progress ? lessonRecord(progress, lesson.id) : null;
      const stars = el('div', 'cr-panel cr-res-chase');
      stars.append(el('span', 'cr-kick', 'Stars to win'), ladder(lesson, rec ? rec.medal : null));
      const best = bestOf(lesson, rec);
      stars.append(el('p', 'cr-best', best ? `Your best: ${best}` : 'Your best: not finished yet'));
      main.append(stars);
    } else {
      const word = { gold: 'Gold!', silver: 'Silver!', bronze: 'Finished!' }[status.medal] || 'Finished!';
      const fill = { gold: INKS.amber, silver: '#d6dee6', bronze: INKS.cream }[status.medal] || INKS.cream;
      main.append(lettered(word, 150, fill, 'cr-title cr-res-word', 0.5));
      main.append(starRow(status.medal, 'cr-stars big'));
      const time = el('div', 'cr-panel cr-res-time');
      time.append(el('b', null, scored(lesson) ? points(status.result.score) : clock(status.result.ms)));
      const said = [];
      if (outcome && outcome.firstFinish) {
        said.push('First finish.');
      }
      if (outcome && outcome.betterMedal) {
        said.push('Better medal.');
      }
      if (outcome && outcome.betterTime && !scored(lesson)) {
        said.push('New best time.');
      }
      if (outcome && outcome.betterScore) {
        said.push('New best score.');
      }
      if (scored(lesson)) {
        said.push(`In ${clock(status.result.ms)}.`);
      }
      const line = [];
      if (status.crashes) {
        line.push(`${status.crashes} crash${status.crashes === 1 ? '' : 'es'}`);
      }
      line.push(`top speed ${Math.round(status.maxSpeed * 3.6)} km/h`);
      said.push(`${line.join(', ')}.`.replace(/^./, (c) => c.toUpperCase()));
      time.append(el('span', null, said.join(' ')));
      main.append(time);
      main.append(ladder(lesson, status.medal));

      /* What the run earned, as panels down the right of the page. */
      if (outcome && outcome.licence) {
        const lic = el('div', 'cr-panel cr-res-licence');
        const stamp = el('div', 'cr-fork-stamp small');
        stamp.append(el('span', null, 'Licensed'), el('b', null, TITLES[titleOf(progress)] || 'Pilot'));
        lic.append(stamp, el('p', 'cr-panel-line', `${partById(outcome.licence).title}: yours. It is on your licence card from now on.`));
        extra.push(lic);
      }
      if (outcome && outcome.opened && outcome.opened.length) {
        const op = el('div', 'cr-panel cr-res-opened');
        op.append(el('span', 'cr-kick sakura', 'Opened'));
        for (const id of outcome.opened) {
          const part = partById(id);
          if (part) {
            op.append(el('b', 'cr-res-opened-name', part.title));
          }
        }
        extra.push(op);
      }
      if (outcome && outcome.livery) {
        const l = liveryById(outcome.livery);
        const from = partOfLivery(l.id);
        const lv = el('div', 'cr-panel cr-res-livery');
        const pic = el('div', 'cr-res-livery-pic');
        pic.innerHTML = quadSvg(l);
        const words = el('div', 'cr-res-livery-words');
        words.append(el('span', 'cr-kick sakura', 'New livery'), el('b', 'cr-res-opened-name', l.name));
        words.append(el('p', 'cr-panel-line', `Every lesson of ${from ? from.title : 'it'} flown. Its colours are yours.`));
        paintBtn = button('Paint it on', 'P', 'small');
        paintBtn.addEventListener('click', () => {
          this.h.paint(l.id);
          paintBtn.querySelector('.cr-btn-label').textContent = 'On your quad';
          paintBtn.disabled = true;
        });
        words.append(paintBtn);
        lv.append(pic, words);
        extra.push(lv);
      }
      if (outcome && outcome.stars > 0) {
        const t = totals(progress);
        extra.push(el('div', 'cr-res-starsum', `+${outcome.stars} star${outcome.stars === 1 ? '' : 's'}, ${t.stars} in all`));
      }
    }
    /* Where the lesson's part stands now, pass or fail. */
    const part = partOf(lesson.id);
    if (part && progress) {
      const s = partStats(progress, part);
      const prog = el('div', 'cr-panel cr-res-part');
      prog.append(el('span', 'cr-kick', part.title));
      const bar = el('div', 'cr-meter');
      const fillEl = el('i');
      fillEl.style.width = `${Math.round((100 * s.done) / Math.max(1, s.total))}%`;
      bar.append(fillEl);
      prog.append(bar, el('span', 'cr-panel-line', s.done === s.total ? `Every lesson flown. ${s.stars} of ${s.maxStars} stars.` : `${s.done} of ${s.total} lessons. ${s.stars} of ${s.maxStars} stars.`));
      extra.push(prog);
    }
    page.append(main);
    if (extra.length) {
      const side = el('div', 'cr-res-side');
      side.append(...extra);
      page.append(side);
    }
    r.append(page);

    const actions = el('div', 'cr-res-actions');
    const retry = button('Fly again', 'R', failed ? 'primary big' : '');
    retry.addEventListener('click', () => this.h.retry());
    const treeBtn = button('The tree', 'T');
    treeBtn.addEventListener('click', () => this.h.toTree(partOf(lesson.id) ? partOf(lesson.id).id : null));
    const hubBtn = button('Career', 'Esc');
    hubBtn.addEventListener('click', () => this.h.toCover());
    let nextBtn = null;
    if (!failed && next) {
      const label = next.fork ? 'Next: pick a way' : (next.lesson ? `Next: ${lessonById(next.lesson).title}` : null);
      if (label) {
        nextBtn = button(label, 'Enter', 'primary big');
        nextBtn.addEventListener('click', () => this.h.next());
      }
    }
    actions.append(...[nextBtn, retry, treeBtn, hubBtn].filter(Boolean));
    r.append(actions);
    r.append(legendBar([['Enter', 'Choose'], ['R', 'Fly again'], ['T', 'Tree'], ...(paintBtn ? [['P', 'Paint it on']] : []), ['Esc', 'Career']]));
    this.resPaint = paintBtn;
    const list = [nextBtn, retry, treeBtn, hubBtn, paintBtn];
    this.hoverFocus(list);
    this.setFocus(list, 0);
    this.settle();
  }

  resultsKey(k) {
    if (k === 'tree') {
      const at = this.focus.find((b) => b && b.textContent.startsWith('The tree'));
      if (at) {
        at.click();
      }
    } else if (k === 'paint') {
      if (this.resPaint && !this.resPaint.disabled) {
        this.resPaint.click();
      }
    } else {
      this.listKey2(k);
    }
  }

  /* ---------------------------------------------------------------- *
   * The Paint Shop: every livery, the earned ones to pick from and the
   * rest with the part that earns them, and the quad drawn in whichever
   * the cursor is on. Picking one paints the quad in the world behind the
   * page at once (src/render/livery.js), and it stays on in every mode.
   * ---------------------------------------------------------------- */

  showPaint(p, { current = LIVERIES[0].id, said = '' } = {}) {
    this.progress = p;
    /* Painting redraws the page: it stays where it was scrolled to. */
    const y = this.screen === 'paint' ? this.paintShop.scrollTop : 0;
    this.screen = 'paint';
    const v = this.clear(this.paintShop);
    const earned = new Set([LIVERIES[0].id, ...liveriesEarned(p)]);
    const main = el('div', 'cr-paint-main');
    main.append(el('span', 'cr-kick', 'Your quad'), lettered('Paint Shop', 80, INKS.cream, 'cr-title', 0.45));
    main.append(el('p', 'cr-panel-line wide', 'Fly every lesson of a part and its colours are yours. The paint you pick is on your quad on every map and in every mode.'));
    const grid = el('div', 'cr-livery-grid');
    const tiles = [];
    for (const l of LIVERIES) {
      const part = partOfLivery(l.id);
      const has = earned.has(l.id);
      const on = l.id === current;
      const tile = el('button', `cr-livery${has ? '' : ' is-locked'}${on ? ' is-on' : ''}`);
      tile.type = 'button';
      tile.dataset.livery = l.id;
      tile.setAttribute('aria-pressed', String(on));
      tile.append(liveryChips(l), el('b', 'cr-livery-name', l.name));
      const line = el('span', 'cr-livery-line');
      if (on) {
        line.textContent = 'On your quad';
      } else if (has) {
        line.textContent = part ? part.title : 'The house paint';
      } else {
        line.innerHTML = `${lockSvg()}<span>Finish ${part.title}</span>`;
      }
      tile.append(line);
      tile.addEventListener('click', () => {
        if (has) {
          this.h.paint(l.id);
        } else {
          this.paintSaid.textContent = `Fly every lesson of ${part.title} to earn ${l.name}.`;
          this.previewLivery(l.id);
        }
      });
      tile.addEventListener('mouseenter', () => this.previewLivery(l.id));
      grid.append(tile);
      tiles.push(tile);
    }
    main.append(grid);
    this.paintTiles = tiles;

    const side = el('div', 'cr-paint-side');
    const show = el('div', 'cr-panel cr-paint-show');
    this.paintPic = el('div', 'cr-paint-pic');
    this.paintName = el('b', 'cr-paint-name');
    this.paintFrom = el('span', 'cr-paint-from');
    show.append(this.paintPic, this.paintName, this.paintFrom);
    side.append(show);
    this.paintSaid = el('p', 'cr-paint-said', said);
    side.append(this.paintSaid);
    const back = button('Back', 'Esc');
    back.addEventListener('click', () => this.h.paintBack());
    side.append(back);
    v.append(main, side);
    v.append(legendBar([['Arrows', 'Move'], ['Enter', 'Paint it on'], ['Esc', 'Back']]));
    const focus = [...tiles, back];
    this.hoverFocus(focus);
    const at = Math.max(0, tiles.findIndex((t) => t.dataset.livery === current));
    this.setFocus(focus, at);
    this.previewLivery(current);
    v.scrollTop = y;
    this.settle();
  }

  /* The quad on the right, in the livery the cursor is on. */
  previewLivery(id) {
    if (!this.paintPic) {
      return;
    }
    const l = liveryById(id);
    const part = partOfLivery(l.id);
    this.paintPic.innerHTML = quadSvg(l);
    this.paintName.textContent = l.name;
    this.paintFrom.textContent = part ? `For flying every lesson of ${part.title}` : 'The house paint, yours from the start';
  }

  /* The swatches are a grid: up and down move a row, and down off the last
   * row is Back. */
  paintKey(k) {
    if (k === 'back') {
      this.h.paintBack();
      return;
    }
    const tiles = this.paintTiles || [];
    const n = tiles.length;
    if ((k === 'up' || k === 'down') && n) {
      const top = tiles[0].offsetTop;
      let cols = tiles.findIndex((t) => t.offsetTop !== top);
      if (cols <= 0) {
        cols = n;
      }
      const i = this.focusAt;
      if (k === 'down') {
        this.focusAt = i >= n ? i : Math.min(n, i + cols);
      } else {
        this.focusAt = i >= n ? n - 1 : (i - cols >= 0 ? i - cols : i);
      }
      this.paintFocus();
    } else {
      this.listKey2(k);
    }
    const b = this.focus[this.focusAt];
    if (b && b.dataset.livery) {
      this.previewLivery(b.dataset.livery);
    }
  }
}
