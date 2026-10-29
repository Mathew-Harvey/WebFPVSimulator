/*
 * dogfightpages.js: the two manga pages between picking an arena and
 * flying a dogfight, as drawn in the owner's mockups of 2026-10-29
 * (/mnt/project-files/dogfight/shots/setup.png and arm.png).
 *
 *   SET THE FIGHT   how many bots, how good, how long the round, and how
 *                   hard a hit lands. Remembered in this browser.
 *   ARM UP          which button or switch fires the gun and which the
 *                   missile, with a lamp that lights when it is pressed so
 *                   the pilot sees it works before taking off. Shown the
 *                   first time a pilot fights, and from Set the fight's
 *                   Buttons after that.
 *
 * Both sit on the overlay askQuad uses (ui.nameDialog), with its quiet
 * start, its keys on the document and its radio routing (ui.quadDialog):
 * up and down move between rows, left and right change one, the menu
 * switch is Fight, back is Back. Fetched only when a pilot picks Dogfight.
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

import { normaliseRules, MAX_BOTS } from '../game/dogfight.js';
import { normaliseRibbonRules } from '../game/ribbons.js';
import { normaliseGoatRules } from '../game/goatround.js';
import { normaliseDriftRules } from '../game/driftround.js';
import { normaliseBallRules } from '../game/quadball.js';

const RULES_KEY = 'webfpv.dogfight.rules.v1';
const RIBBON_KEY = 'webfpv.ribbons.rules.v1';
const GOATS_KEY = 'webfpv.goats.rules.v1';
const DRIFT_KEY = 'webfpv.drift.rules.v1';
const BALL_KEY = 'webfpv.ball.rules.v1';
const ARMED_KEY = 'webfpv.dogfight.armed.v1';
/* The overlay's quiet start, as askConfirm's: input already queued when
 * the page opened is not an answer. */
const DEAF_MS = 300;

const CSS = `
.name-dialog-box.qp-page.df-page { height: auto; max-height: calc(100vh - 32px); }
.df-page .df-body { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; padding: 14px 18px; min-height: 0; overflow: auto; }
.df-rows { display: grid; gap: 10px; align-content: start; }
.df-row { display: grid; grid-template-columns: 150px minmax(0, 1fr); align-items: center; gap: 12px; padding: 10px 12px; background: #fff; border: 3px solid var(--ink-line); cursor: pointer; }
.df-row.is-at { box-shadow: 0 0 0 4px var(--amber), 6px 6px 0 4px var(--ink-line); }
.df-row-name { font: 900 15px/1.1 var(--ui-font); letter-spacing: .1em; text-transform: uppercase; }
.df-row-name small { display: block; margin-top: 3px; font: 700 12px/1.2 var(--ui-font); letter-spacing: 0; text-transform: none; color: var(--qp-quiet); }
.df-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.df-chip { appearance: none; cursor: pointer; min-width: 40px; padding: 8px 12px; font: 900 14px/1 var(--ui-font); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-line); background: var(--qp-paper); border: 3px solid var(--ink-line); border-radius: 0; }
.df-chip.is-on { background: var(--amber); box-shadow: 3px 3px 0 var(--ink-line); }
.df-chip:focus-visible { outline: 3px solid var(--sakura); outline-offset: 2px; }
.df-side { position: relative; display: grid; align-content: start; gap: 10px; }
.df-says { position: relative; padding: 12px 16px; background: #fff; border: 3px solid var(--ink-line); border-radius: 22px; font: 700 16px/1.25 "Comic Sans MS", "Chalkboard SE", "Comic Neue", var(--ui-font); }
.df-says::after { content: ""; position: absolute; left: 30px; bottom: -14px; border: 9px solid transparent; border-top: 14px solid var(--ink-line); border-bottom: 0; }
.df-card { padding: 10px 12px; background: var(--qp-paper-2); border: 3px solid var(--ink-line); font: 700 13px/1.35 var(--ui-font); }
.df-card b { display: block; font: 900 11px/1 var(--ui-font); letter-spacing: .14em; text-transform: uppercase; margin-bottom: 5px; }
.df-arm { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; padding: 14px 18px; min-height: 0; overflow: auto; }
.df-weapon { display: grid; grid-template-rows: auto auto 1fr auto; gap: 10px; padding: 12px 14px; background: #fff; border: 4px solid var(--ink-line); }
.df-weapon.is-at { box-shadow: 0 0 0 5px var(--amber), 8px 8px 0 5px var(--ink-line); }
.df-weapon h3 { margin: 0; font: 900 30px/1 var(--ui-font); font-style: italic; letter-spacing: .04em; color: var(--amber); -webkit-text-stroke: 1.5px var(--ink-line); }
.df-weapon.is-missile h3 { color: var(--sakura); }
.df-weapon p { margin: 0; font: 600 14px/1.35 var(--ui-font); color: var(--qp-quiet); }
.df-binds { display: grid; gap: 6px; align-content: start; }
.df-bind { display: flex; justify-content: space-between; gap: 10px; padding: 7px 10px; background: var(--qp-paper); border: 2px solid var(--ink-line); font: 800 14px/1.2 var(--ui-font); }
.df-bind span { color: var(--qp-quiet); font-weight: 700; }
.df-bind.is-live { background: #fff6cf; }
.df-test { display: flex; align-items: center; gap: 12px; }
.df-lamp { width: 30px; height: 30px; border-radius: 50%; border: 3px solid var(--ink-line); background: #d8d0bb; flex: none; }
.df-lamp.is-on { background: var(--mint); box-shadow: 0 0 14px var(--mint); }
.df-listen { padding: 10px 12px; background: var(--ink-line); color: var(--amber); font: 900 15px/1.3 var(--ui-font); letter-spacing: .04em; }
@media (max-width: 860px) {
  .df-page .df-body { grid-template-columns: 1fr; }
  .df-side { display: none; }
  .df-row { grid-template-columns: 1fr; }
  .df-arm { grid-template-columns: 1fr; }
}
`;

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

function btn(cls, text) {
  const n = el('button', cls, text);
  n.type = 'button';
  return n;
}

function css() {
  if (!document.getElementById('df-page-css')) {
    const st = document.createElement('style');
    st.id = 'df-page-css';
    st.textContent = CSS;
    document.head.append(st);
  }
}

export function loadRules(key = RULES_KEY, normalise = normaliseRules) {
  try {
    return normalise(JSON.parse(localStorage.getItem(key) || 'null'));
  } catch (e) {
    return normalise(null);
  }
}

function saveRules(r, key = RULES_KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(r));
  } catch (e) {
    /* Private window: the rules last the session. */
  }
}

/* Whether this browser has been through Arm up. */
export function armed() {
  try {
    return localStorage.getItem(ARMED_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function markArmed() {
  try {
    localStorage.setItem(ARMED_KEY, '1');
  } catch (e) {
    /* As above. */
  }
}

/* The page's frame: a lettered head, a body, the caption's buttons. */
function page(ui, kicker, titleWords, alt, label) {
  css();
  const box = el('div', 'name-dialog-box qp-page df-page');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', label);
  const head = el('div', 'qp-head');
  const title = el('h2', 'qp-title');
  title.append(document.createTextNode(titleWords));
  if (alt) {
    title.append(document.createTextNode(' '), el('span', 'qp-alt', alt));
  }
  head.append(el('div', 'qp-kicker', kicker), title);
  const caption = el('div', 'qp-caption');
  return { box, head, title, caption };
}

/* Show a page on the overlay and wire the keys, the resize lettering and
 * the quiet start. `keys(e)` returns true when it took the key. */
function show(ui, kit, p, body, keys, resolve) {
  p.box.append(p.head, body, p.caption);
  ui.nameWait = resolve;
  ui.quadDialog = true;
  ui.nameDialog.textContent = '';
  ui.nameDialog.append(p.box);
  ui.nameDialog.hidden = false;
  const letter = () => {
    if (!p.box.isConnected) {
      window.removeEventListener('resize', letter);
      return;
    }
    kit.letterHeading(p.title);
  };
  letter();
  window.addEventListener('resize', letter);
  const openedAt = performance.now();
  const onKey = (e) => {
    if (!p.box.isConnected) {
      document.removeEventListener('keydown', onKey, true);
      return;
    }
    if (keys(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  document.addEventListener('keydown', onKey, true);
  return (v) => {
    if (performance.now() - openedAt < DEAF_MS) {
      return false;
    }
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', letter);
    ui.closeNameDialog(v);
    return true;
  };
}

const ROWS = [
  {
    id: 'bots',
    name: 'Bots',
    small: 'Quads that fly and fight on their own',
    options: Array.from({ length: MAX_BOTS + 1 }, (_, n) => ({ v: n, label: n ? String(n) : 'None' })),
  },
  {
    id: 'skill',
    name: 'Bot skill',
    small: 'How well they fly and aim',
    options: [{ v: 'rookie', label: 'Rookie' }, { v: 'pilot', label: 'Pilot' }, { v: 'ace', label: 'Ace' }],
  },
  {
    id: 'round',
    name: 'Round',
    small: 'When the fight ends',
    options: [
      { v: '3m', label: '3 minutes' }, { v: '5m', label: '5 minutes' },
      { v: 'first10', label: 'First to 10' }, { v: 'none', label: 'No end' },
    ],
  },
  {
    id: 'hits',
    name: 'Hits',
    small: 'How much a quad can take',
    options: [{ v: 'arcade', label: 'Arcade' }, { v: 'hard', label: 'Hard' }],
  },
];

/* Ribbon cutting's round (src/game/ribbons.js): the bots as the fight's,
 * the round's clock, and how long everybody's ribbon is. */
const RIBBON_ROWS = [
  {
    id: 'bots',
    name: 'Bots',
    small: 'Quads with ribbons that fly on their own',
    options: ROWS[0].options,
  },
  {
    id: 'skill',
    name: 'Bot skill',
    small: 'How well they chase a ribbon',
    options: ROWS[1].options,
  },
  {
    id: 'length',
    name: 'Ribbons',
    small: 'Long ones are easier to cut',
    options: [{ v: 'short', label: 'Short' }, { v: 'normal', label: 'Normal' }, { v: 'long', label: 'Long' }],
  },
  {
    id: 'round',
    name: 'Round',
    small: 'When the clock runs out',
    options: [{ v: '2m', label: '2 minutes' }, { v: '4m', label: '4 minutes' }, { v: 'none', label: 'No clock' }],
  },
];

/* Goat herding's round (src/game/goatround.js): the bots, how well they
 * herd, and the round's clock. */
const GOAT_ROWS = [
  {
    id: 'bots',
    name: 'Bots',
    small: 'Quads that herd goats too',
    options: ROWS[0].options,
  },
  {
    id: 'skill',
    name: 'Bot skill',
    small: 'How well they herd',
    options: ROWS[1].options,
  },
  {
    id: 'round',
    name: 'Round',
    small: 'When it ends',
    options: [{ v: '3m', label: '3 minutes' }, { v: '5m', label: '5 minutes' }, { v: 'all', label: 'All home' }],
  },
];

/* Drift Matsuri's round (src/game/driftround.js): the bots that film too,
 * and how well. The take is the map's own, a minute long. */
const DRIFT_ROWS = [
  {
    id: 'bots',
    name: 'Bots',
    small: 'Camera quads filming too',
    options: ROWS[0].options,
  },
  {
    id: 'skill',
    name: 'Bot skill',
    small: 'How well they film',
    options: ROWS[1].options,
  },
];

/* Quad Ball's match (src/game/quadball.js): how many a side, how well the
 * bots play, and when it ends. The pilot and the bots they are given fill
 * the first side. */
const BALL_ROWS = [
  {
    id: 'size',
    name: 'A side',
    small: 'You and bots against bots',
    options: [{ v: 1, label: '1 v 1' }, { v: 2, label: '2 v 2' }, { v: 3, label: '3 v 3' }],
  },
  {
    id: 'skill',
    name: 'Bot skill',
    small: 'How well they play',
    options: ROWS[1].options,
  },
  {
    id: 'round',
    name: 'Match',
    small: 'When it ends',
    options: [{ v: '3m', label: '3 minutes' }, { v: '5m', label: '5 minutes' }, { v: 'first5', label: 'First to 5' }],
  },
];

function saysForBall(r) {
  const side = r.size === 1 ? 'One on one' : `${r.size} a side`;
  const lvl = r.skill === 'rookie' ? 'rookie' : (r.skill === 'ace' ? 'ace' : 'pilot');
  const end = { '3m': 'Most goals in three minutes wins.', '5m': 'Most goals in five minutes wins.', first5: 'First to five goals wins.' }[r.round];
  const tie = r.round === 'first5' ? '' : ' Level at the whistle is a golden goal.';
  return `${side}, you and the bots at ${lvl} level. Push the ball into the other goal. ${end}${tie}`;
}

function saysForDrift(r) {
  const who = r.bots === 0 ? 'Just you and the cars: a take to beat your best.'
    : `${r.bots === 1 ? 'One bot' : `${r.bots} bots`} at ${r.skill === 'rookie' ? 'rookie' : (r.skill === 'ace' ? 'ace' : 'pilot')} level, filming too.`;
  return `${who} Everybody films one minute. The best reel wins.`;
}

function saysForGoats(r) {
  const who = r.bots === 0 ? 'Just you and the goats.'
    : `${r.bots === 1 ? 'One bot' : `${r.bots} bots`} at ${r.skill === 'rookie' ? 'rookie' : (r.skill === 'ace' ? 'ace' : 'pilot')} level, herding too.`;
  const end = { '3m': 'Most goats home in three minutes wins.', '5m': 'Most goats home in five minutes wins.', all: 'The round ends when every goat is home. Most goats wins.' }[r.round];
  return `${who} ${end}`;
}

function saysForRibbon(r) {
  const who = r.bots === 0 ? 'Nobody else is flying yet, so this is a practice flight with your ribbon.'
    : `${r.bots === 1 ? 'One bot' : `${r.bots} bots`} at ${r.skill === 'rookie' ? 'rookie' : (r.skill === 'ace' ? 'ace' : 'pilot')} level, each with a ribbon.`;
  const end = r.bots === 0 ? ''
    : { '2m': 'Last with a ribbon wins. If the clock runs out first, the longest ribbon wins.', '4m': 'Last with a ribbon wins. If the clock runs out first, the longest ribbon wins.', none: 'No clock: the last with a ribbon wins.' }[r.round];
  return `${who} ${end}`.trim();
}

/* What the balloon says about the rules picked. */
function saysFor(r) {
  const who = r.bots === 0 ? 'Nobody else is flying yet, so this is target practice.'
    : `${r.bots === 1 ? 'One bot' : `${r.bots} bots`} at ${r.skill === 'rookie' ? 'rookie' : (r.skill === 'ace' ? 'ace' : 'pilot')} level.`;
  const end = { '3m': 'Most pops in three minutes wins.', '5m': 'Most pops in five minutes wins.', first10: 'First to pop ten quads wins.', none: 'No clock: fight until you leave.' }[r.round];
  const hit = r.hits === 'hard' ? 'Hard hits: fewer hits pop you and you wait longer to come back.' : 'Popped is not out: you are back in three seconds.';
  return `${who} ${end} ${hit}`;
}

/*
 * SET THE FIGHT. Resolves { rules, buttons } or null for Back. `buttons`
 * says Buttons was pressed, so Arm up comes next.
 */
export function askFight(ui, kit, mapName) {
  return askRules(ui, kit, mapName, {
    kicker: 'Dogfight',
    words: ['Set the', 'fight'],
    label: `Set the fight on ${mapName}`,
    rows: ROWS,
    key: RULES_KEY,
    normalise: normaliseRules,
    says: saysFor,
    how: 'Hit a quad to take its health. Empty is a pop, with confetti. Each pop is a point. A missile follows a quad once the box goes red.',
    go: 'Fight!',
    buttons: true,
  });
}

/*
 * SET THE RIBBONS, ribbon cutting's page, the same page with its own rows
 * and no buttons to pick: nothing is fired. Resolves { rules } or null.
 */
export function askRibbon(ui, kit, mapName) {
  return askRules(ui, kit, mapName, {
    kicker: 'Ribbon cutting',
    words: ['Set the', 'ribbons'],
    label: `Set the ribbons on ${mapName}`,
    rows: RIBBON_ROWS,
    key: RIBBON_KEY,
    normalise: normaliseRibbonRules,
    says: saysForRibbon,
    how: 'Every quad trails a ribbon. Fly through somebody else\'s to cut it. Keep yours away from them. Cut short, a ribbon is gone and so is its pilot. The last with a ribbon wins.',
    go: 'Fly!',
    buttons: false,
  });
}

/*
 * SET THE HERD, goat herding's page: the same page with its own rows and
 * no buttons to pick. Resolves { rules } or null.
 */
export function askGoats(ui, kit, mapName) {
  return askRules(ui, kit, mapName, {
    kicker: 'Goat herding',
    words: ['Set the', 'herd'],
    label: `Set the herd on ${mapName}`,
    rows: GOAT_ROWS,
    key: GOATS_KEY,
    normalise: normaliseGoatRules,
    says: saysForGoats,
    how: "Fly low behind a goat and it runs away from you. Push it into Heads' garage. Every goat is whoever pushed it in last, so steal them at the door.",
    go: 'Herd!',
    buttons: false,
  });
}

/*
 * SET THE MATCH, Quad Ball's page: the same page with its own rows and no
 * buttons to pick. Resolves { rules } or null.
 */
export function askBall(ui, kit, mapName) {
  return askRules(ui, kit, mapName, {
    kicker: 'Quad Ball',
    words: ['Set the', 'match'],
    label: `Set the match on ${mapName}`,
    rows: BALL_ROWS,
    key: BALL_KEY,
    normalise: normaliseBallRules,
    says: saysForBall,
    how: 'Fly into the ball to hit it. The harder you fly at it the harder it goes. Pink defends the west goal and attacks the east one; mint is the other way round. After a goal everybody gets a few seconds to fly back for the kickoff.',
    go: 'Kick off!',
    buttons: false,
  });
}

/*
 * SET THE SHOOT, Drift Matsuri's page: the same page with its own rows and
 * no buttons to pick. Resolves { rules } or null.
 */
export function askDrift(ui, kit, mapName) {
  return askRules(ui, kit, mapName, {
    kicker: 'Drift Matsuri',
    words: ['Set the', 'shoot'],
    label: `Set the shoot on ${mapName}`,
    rows: DRIFT_ROWS,
    key: DRIFT_KEY,
    normalise: normaliseDriftRules,
    says: saysForDrift,
    how: 'Film the drift battles for one minute. Close, smooth, the car in the middle of the picture, both cars of a battle, and the clipping zones all score. The best reel wins.',
    go: 'Roll!',
    buttons: false,
  });
}

/* The setup page both games share: rows of chips, a balloon that says what
 * they add up to, and Go, Back and, for the dogfight, Buttons. */
function askRules(ui, kit, mapName, spec) {
  const ROWS = spec.rows;
  const rules = loadRules(spec.key, spec.normalise);
  return new Promise((resolve) => {
    const p = page(ui, spec.kicker, spec.words[0], spec.words[1], spec.label);
    const body = el('div', 'df-body');
    const rowsEl = el('div', 'df-rows');
    const side = el('div', 'df-side');
    const says = el('div', 'df-says');
    const arena = el('div', 'df-card');
    arena.append(el('b', null, 'Arena'), document.createTextNode(mapName));
    const how = el('div', 'df-card');
    how.append(el('b', null, 'How it works'), document.createTextNode(spec.how));
    side.append(says, arena, how);
    let at = 0;
    const rowEls = ROWS.map((row, ri) => {
      const r = el('div', 'df-row');
      const name = el('div', 'df-row-name', row.name);
      name.append(el('small', null, row.small));
      const chips = el('div', 'df-chips');
      chips.setAttribute('role', 'radiogroup');
      chips.setAttribute('aria-label', row.name);
      const chipEls = row.options.map((o) => {
        const c = btn('df-chip', o.label);
        c.setAttribute('role', 'radio');
        c.addEventListener('click', () => {
          rules[row.id] = o.v;
          at = ri;
          paint();
        });
        chips.append(c);
        return c;
      });
      r.addEventListener('click', () => {
        at = ri;
        paint();
      });
      r.append(name, chips);
      rowsEl.append(r);
      return { r, chipEls };
    });
    const paint = () => {
      ROWS.forEach((row, ri) => {
        const { r, chipEls } = rowEls[ri];
        r.classList.toggle('is-at', ri === at);
        row.options.forEach((o, oi) => {
          const on = rules[row.id] === o.v;
          chipEls[oi].classList.toggle('is-on', on);
          chipEls[oi].setAttribute('aria-checked', on ? 'true' : 'false');
        });
        /* Skill means nothing with no bots. */
        if (row.id === 'skill') {
          r.style.opacity = rules.bots ? '' : '0.5';
        }
      });
      says.textContent = spec.says(rules);
    };
    body.append(rowsEl, side);
    const go = btn('qp-btn qp-fly', spec.go);
    const buttons = btn('qp-btn', 'Buttons');
    const back = btn('qp-btn', 'Back');
    const keys = el('span', 'qp-keys');
    keys.innerHTML = `<kbd>↑</kbd> <kbd>↓</kbd> row · <kbd>←</kbd> <kbd>→</kbd> change · <kbd>Enter</kbd> ${spec.buttons ? 'fight' : 'fly'} · <kbd>Esc</kbd> back`;
    p.caption.append(go);
    if (spec.buttons) {
      p.caption.append(buttons);
    }
    p.caption.append(back, keys);
    const step = (d) => {
      const row = ROWS[at];
      const i = row.options.findIndex((o) => o.v === rules[row.id]);
      const n = row.options.length;
      rules[row.id] = row.options[(Math.max(0, i) + d + n) % n].v;
      paint();
    };
    let close = null;
    const answer = (wantButtons) => {
      const r = spec.normalise(rules);
      saveRules(r, spec.key);
      close({ rules: r, buttons: wantButtons });
    };
    close = show(ui, kit, p, body, (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        at = (at + (e.key === 'ArrowDown' ? 1 : ROWS.length - 1)) % ROWS.length;
        paint();
        rowEls[at].r.scrollIntoView({ block: 'nearest' });
        return true;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        step(e.key === 'ArrowRight' ? 1 : -1);
        return true;
      }
      if (e.key === 'Enter') {
        if (e.target === buttons || e.target === back) {
          return false;
        }
        answer(false);
        return true;
      }
      if (e.key === 'Escape') {
        close(null);
        return true;
      }
      return false;
    }, resolve);
    go.addEventListener('click', () => answer(false));
    buttons.addEventListener('click', () => answer(true));
    back.addEventListener('click', () => close(null));
    paint();
    go.focus();
  });
}

/*
 * ARM UP. Resolves true for Ready, false for Back. While it is up the
 * weapons are live in the input manager so the lamps can light; they go
 * back to how they were when it closes.
 */
export function askArm(ui, kit, input) {
  return new Promise((resolve) => {
    const p = page(ui, 'Dogfight', 'Arm', 'up', 'Pick your gun and missile buttons');
    const body = el('div', 'df-arm');
    const wasLive = input.weaponsLive;
    input.weaponsLive = true;
    const W = [
      { id: 'gun', name: 'GUN', says: 'Hold it to fire. It gets hot if you hold it too long, so fire in bursts.' },
      { id: 'missile', name: 'MISSILE', says: 'Press once to fire. Keep a quad in the box until it goes red, and the missile follows it.' },
    ];
    let at = 0;
    const panels = W.map((w, wi) => {
      const d = el('div', `df-weapon is-${w.id}`);
      d.tabIndex = -1;
      const h = el('h3', null, w.name);
      const sp = el('p', null, w.says);
      const binds = el('div', 'df-binds');
      const test = el('div', 'df-test');
      const lamp = el('span', 'df-lamp');
      const pick = btn('qp-btn', 'Pick a button or switch');
      test.append(lamp, pick);
      d.append(h, sp, binds, test);
      d.addEventListener('click', () => {
        at = wi;
        paintAt();
      });
      pick.addEventListener('click', (e) => {
        e.stopPropagation();
        at = wi;
        listen(w.id);
      });
      body.append(d);
      return { d, binds, lamp, pick, w };
    });
    let listening = null;
    let flashUntil = 0;
    const padNow = () => (typeof input.firstGamepad === 'function' ? input.firstGamepad() : null);
    const paintBinds = () => {
      const gp = padNow();
      const labels = input.weaponLabels(gp);
      for (const pn of panels) {
        const L = labels[pn.w.id];
        pn.binds.textContent = '';
        if (listening === pn.w.id) {
          pn.binds.append(el('div', 'df-listen', 'Flick the switch, press the button or press a key now. Esc to stop.'));
          continue;
        }
        const row = (where, what, live) => {
          const r = el('div', `df-bind${live ? ' is-live' : ''}`);
          r.append(el('span', null, where), document.createTextNode(what));
          pn.binds.append(r);
        };
        const kind = gp ? (gp.mapping === 'standard' ? 'Gamepad' : 'Radio') : null;
        if (kind) {
          row(kind, L.pad || 'Not picked yet', true);
        }
        row('Keyboard', L.key, !kind);
        row('Phone or tablet', 'The button on the screen', false);
      }
    };
    const paintAt = () => {
      panels.forEach((pn, i) => pn.d.classList.toggle('is-at', i === at));
    };
    const listen = (which) => {
      listening = which;
      input.beginWeaponCapture(which);
      /* The radio's switch is the answer here, not a menu press. */
      ui.quadDialog = false;
      paintBinds();
    };
    const stopListening = () => {
      if (listening) {
        input.cancelWeaponCapture();
        listening = null;
        ui.quadDialog = true;
        paintBinds();
      }
    };
    /* The lamps and the pick's answer, a frame at a time while the page
     * is up. Polled here because the input manager polls the pad in the
     * frame loop, which runs under every menu. */
    let raf = 0;
    const tick = () => {
      if (!p.box.isConnected) {
        /* Closed by another route, a dialog opened over it. */
        input.cancelWeaponCapture();
        input.weaponsLive = wasLive;
        input.touchGun = false;
        return;
      }
      const res = input.takeWeaponResult();
      if (res) {
        listening = null;
        ui.quadDialog = true;
        paintBinds();
      }
      panels[0].lamp.classList.toggle('is-on', !listening && input.gunHeld());
      if (!listening && input.takeMissile()) {
        flashUntil = performance.now() + 400;
      }
      panels[1].lamp.classList.toggle('is-on', performance.now() < flashUntil);
      raf = requestAnimationFrame(tick);
    };
    const ready = btn('qp-btn qp-fly', 'Ready');
    const back = btn('qp-btn', 'Back');
    const keys = el('span', 'qp-keys');
    keys.innerHTML = '<kbd>←</kbd> <kbd>→</kbd> gun or missile · <kbd>P</kbd> pick · <kbd>Enter</kbd> ready · <kbd>Esc</kbd> back';
    p.caption.append(ready, back, keys);
    const done = (v) => {
      stopListening();
      if (close(v)) {
        cancelAnimationFrame(raf);
        input.weaponsLive = wasLive;
        input.touchGun = false;
        input.missileFired = false;
        if (v) {
          markArmed();
        }
      }
    };
    const close = show(ui, kit, p, body, (e) => {
      if (listening) {
        if (e.key === 'Escape') {
          stopListening();
          return true;
        }
        return false;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        at = 1 - at;
        paintAt();
        return true;
      }
      if (e.code === 'KeyP') {
        listen(panels[at].w.id);
        return true;
      }
      if (e.key === 'Enter') {
        if (e.target === back || panels.some((pn) => pn.pick === e.target)) {
          return false;
        }
        done(true);
        return true;
      }
      if (e.key === 'Escape') {
        done(false);
        return true;
      }
      return false;
    }, (v) => {
      resolve(v);
    });
    ready.addEventListener('click', () => done(true));
    back.addEventListener('click', () => done(false));
    paintBinds();
    paintAt();
    raf = requestAnimationFrame(tick);
    ready.focus();
  });
}
