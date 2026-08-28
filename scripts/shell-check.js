/*
 * shell-check.js: the first check that can see the menu shell.
 *
 * WHY THIS EXISTS. Nothing in tests/ or scripts/ loaded index.html. Check 13
 * loads tests/browser/harness.html, which is 43 lines and does not import
 * the shell, and the only reference to src/ui/ui.js anywhere in either
 * directory was one SETTINGS_KEY import in shots.js. So a rewrite of ui.js
 * could break Escape on four screens, strand the cursor on the flight
 * controller list, and leave `npm run verify` reporting exactly what it
 * reported before. Every regression would have been found by a pilot.
 *
 * It is a cheap lint, not part of `npm run verify`, because verify builds
 * the WASM module and this has nothing to say about the flight model. Same
 * shape as lint:fc, lint:presets and lint:catalog: run it on a shell change
 * and it answers in about a minute.
 *
 * WHAT IT ASSERTS, per screen:
 *
 *   reach   every item where isStop() is true is reachable from the first
 *           stop by SOME key: repeated ArrowDown, or Home then PageDown.
 *           Arrows alone is the wrong test, because arrows deliberately
 *           step over the 542 firmware keys this build does not implement.
 *           Reachable by some key is the property that actually matters.
 *   help    every stop that carries a note can be reached, because the help
 *           column is items[cursor].note and a row the cursor cannot hold
 *           is a row whose explanation is gone. On the flight controller
 *           that is 542 sentences, which is why the arrows skip them
 *           instead of the list dropping them.
 *   escape  Escape from the screen lands on a screen that exists.
 *   fit     the menu's scrollHeight minus its clientHeight, recorded as a
 *           budget rather than asserted at zero.
 *
 * THE BUDGETS ARE A BASELINE, NOT A TARGET. The title menu already overflows
 * on a short window and the project forbids moving a threshold to make a
 * check pass, so the recorded numbers are today's overflow. The check fails
 * when a screen gets WORSE than its baseline, and prints a note when one
 * gets better so the baseline can be re-recorded deliberately.
 *
 * Usage:
 *   node scripts/shell-check.js               check against the baseline
 *   node scripts/shell-check.js --record      rewrite the baseline
 *   node scripts/shell-check.js --w=1280 --h=720
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

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BASELINE = join(root, 'tests', 'shell-baseline.json');

/*
 * The screens this walks. `flight` is excluded because it has no menu at
 * all, and calibrate and padpick are excluded because their items() returns
 * nothing and their state machine is driven by a stick rather than a cursor.
 * Everything else in this.screens is here.
 */
const SCREENS = [
  'title', 'courses', 'freestyle', 'quad', 'pilot', 'launch', 'rates', 'pids', 'fc',
  'paused', 'results', 'howto', 'credits',
];

/*
 * Walk one screen inside the page and report what the cursor can reach.
 *
 * This runs in the browser because the answer depends on the live item
 * list, which is rebuilt on every keypress and reads stored settings, the
 * loaded track and the board. Reimplementing that in Node would be checking
 * a copy of the shell rather than the shell.
 */
/*
 * Every walk below starts PAST the Race or Freestyle gate.
 *
 * A fresh load opens on that gate: two cards, and the menu these checks are
 * about is behind it. The mode is set rather than pressed, because act()
 * would also navigate to a picker when there is nothing seated, and each
 * walk drives its own navigation. The first run flag goes with it, so the
 * primary row is Fly rather than the guided First flight. The gate itself is
 * checked in BEHAVIOUR, through act(), which is the way a pilot answers it.
 */
const PAST_GATE = "ui.firstRun = false; if (!ui.mode) { ui.mode = 'race'; }";

const WALK = `(() => {
  const ui = window.__ui;
  ${PAST_GATE}
  const out = {};
  const screens = ${JSON.stringify(SCREENS)};
  for (const name of screens) {
    try {
      ui.show(name);
      /* The firmware bench travels its 542 unimplemented keys only when the
       * pilot asks. Turn that on here, because the property under test is
       * that every row CAN be reached, not that the default walks them. */
      if (name === 'fc' && ui.fc) { ui.fc.walkAll = true; }
      const items = ui.items();
      const stops = [];
      for (let i = 0; i < items.length; i += 1) {
        if (ui.isStop(items[i])) { stops.push(i); }
      }
      if (!stops.length) {
        out[name] = {
          stops: 0, arrow: 0, reached: 0, unreachable: [], notesLost: 0, overflow: 0,
        };
        continue;
      }

      /* Walk with the same calls the keys use, so the check cannot pass
       * against a walk the pilot does not get. */
      const seen = new Set();

      ui.setCursor(ui.firstStop(items));
      seen.add(ui.cursor);
      let arrow = 1;
      for (let step = 0; step < items.length * 2; step += 1) {
        const before = ui.cursor;
        ui.move(1);
        if (ui.cursor === before || seen.has(ui.cursor)) { break; }
        seen.add(ui.cursor);
        arrow += 1;
      }

      /* Then Home and PageDown, which land on the rows the arrows skip. */
      ui.jumpEdge(-1);
      seen.add(ui.cursor);
      for (let step = 0; step < items.length + 4; step += 1) {
        const before = ui.cursor;
        ui.pageMove(1);
        seen.add(ui.cursor);
        if (ui.cursor === before) { break; }
      }
      ui.jumpEdge(1);
      seen.add(ui.cursor);

      /* And measure the default travel, which is the number the change
       * exists to reduce. */
      let arrowDefault = arrow;
      if (name === 'fc' && ui.fc) {
        ui.fc.walkAll = false;
        const fresh = ui.items();
        ui.setCursor(ui.firstStop(fresh));
        const walked = new Set([ui.cursor]);
        for (let step = 0; step < fresh.length * 2; step += 1) {
          const before = ui.cursor;
          ui.move(1);
          if (ui.cursor === before || walked.has(ui.cursor)) { break; }
          walked.add(ui.cursor);
        }
        arrowDefault = walked.size;
        ui.fc.walkAll = true;
      }

      const unreachable = stops.filter((i) => !seen.has(i));
      const notesLost = unreachable.filter((i) => items[i] && items[i].note).length;

      const scroller = ui.root.querySelector(
        '.screen-' + name + ' .menu-scroll, .screen-' + name + ' .menu'
      );
      const overflow = scroller
        ? Math.max(0, Math.round(scroller.scrollHeight - scroller.clientHeight))
        : 0;

      out[name] = {
        stops: stops.length,
        arrow: arrowDefault,
        reached: seen.size,
        unreachable: unreachable
          .map((i) => (items[i] && items[i].label) || ('index ' + i))
          .slice(0, 8),
        notesLost,
        overflow,
      };
    } catch (e) {
      out[name] = { error: String(e && e.message ? e.message : e) };
    }
  }
  return JSON.stringify(out);
})()`;

/*
 * The firmware bench, tab by tab. The headline defect was measured on the
 * Configuration tab: 141 arrow stops and 3 things you can change. This is
 * the assertion that the fix actually reached it, and that nothing became
 * unreachable in the process.
 */
const FC_TABS = `(() => {
  const ui = window.__ui;
  const out = {};
  ui.show('fc');
  for (const id of ['setup', 'configuration', 'pid', 'receiver', 'motors']) {
    try {
      ui.fc.setTab(id);

      ui.fc.walkAll = false;
      let items = ui.items();
      ui.setCursor(ui.firstStop(items));
      const walked = new Set([ui.cursor]);
      for (let step = 0; step < items.length * 2; step += 1) {
        const before = ui.cursor;
        ui.move(1);
        if (ui.cursor === before || walked.has(ui.cursor)) { break; }
        walked.add(ui.cursor);
      }

      ui.fc.walkAll = true;
      items = ui.items();
      let stops = 0;
      for (let i = 0; i < items.length; i += 1) {
        if (ui.isStop(items[i])) { stops += 1; }
      }
      ui.setCursor(ui.firstStop(items));
      const all = new Set([ui.cursor]);
      for (let step = 0; step < items.length * 2; step += 1) {
        const before = ui.cursor;
        ui.move(1);
        if (ui.cursor === before || all.has(ui.cursor)) { break; }
        all.add(ui.cursor);
      }

      out[id] = { stops, arrowDefault: walked.size, arrowAll: all.size };
    } catch (e) {
      out[id] = { error: String(e && e.message ? e.message : e) };
    }
  }
  ui.fc.walkAll = false;
  ui.fc.setTab('setup');
  return JSON.stringify(out);
})()`;

/*
 * STABLE IDS. Focus memory, and everything that comes after it, is built on
 * the claim that a row can be named across two rebuilds of the list. Three
 * things have to hold for that to be worth anything, and none of them is
 * visible from the walk:
 *
 *   every row HAS one, or the rows without are invisible to focus memory;
 *   they are UNIQUE within a screen, or a restore lands on the wrong row;
 *   they are STABLE across a rebuild that changed nothing, or every id is
 *   a fresh one and the memory never hits.
 *
 * The third is the one a derived id can quietly fail: items() runs the
 * whole builder again on every render, so an id that came from anything
 * that moves, an index, a counter, a value, would differ between two calls
 * a microsecond apart with the pilot having touched nothing.
 */
const IDS = `(() => {
  const ui = window.__ui;
  ${PAST_GATE}
  const out = {};
  for (const name of ${JSON.stringify(SCREENS)}) {
    try {
      ui.show(name);
      const first = ui.items();
      const second = ui.items();
      const ids = first.map((it) => (it ? it.id : null));
      const missing = [];
      for (let i = 0; i < first.length; i += 1) {
        if (!ids[i]) { missing.push(first[i] && first[i].label ? first[i].label : 'row ' + i); }
      }
      const seen = new Map();
      const dupes = [];
      for (const id of ids) {
        if (!id) { continue; }
        if (seen.has(id)) { dupes.push(id); } else { seen.set(id, 1); }
      }
      const unstable = [];
      for (let i = 0; i < Math.min(first.length, second.length); i += 1) {
        const a = first[i] ? first[i].id : null;
        const b = second[i] ? second[i].id : null;
        if (a !== b) { unstable.push(a + ' -> ' + b); }
      }
      out[name] = {
        rows: first.length,
        missing,
        dupes,
        unstable,
        lengthChanged: first.length !== second.length,
      };
    } catch (e) {
      out[name] = { error: String(e && e.message ? e.message : e) };
    }
  }
  return JSON.stringify(out);
})()`;

/*
 * Behaviours the walk cannot see, each asserted against the thing it is
 * meant to prevent rather than against its own implementation.
 */
const BEHAVIOUR = `(() => {
  const ui = window.__ui;
  const out = {};

  /* Focus memory. Settings, move down a few rows, leave, come back: the
   * cursor belongs on the row it was on, not on row 0 of 30. */
  try {
    ui.show('pilot');
    ui.move(1); ui.move(1); ui.move(1);
    const want = ui.items()[ui.cursor].label;
    ui.show('rates');
    ui.show('pilot');
    const got = ui.items()[ui.cursor].label;
    out.focusMemory = { want, got, ok: want === got };
  } catch (e) {
    out.focusMemory = { error: String(e && e.message ? e.message : e) };
  }

  /* A screen never visited still opens on its first stop rather than
   * throwing or landing on a heading. */
  try {
    ui.cursorMemory = {};
    ui.show('pilot');
    const it = ui.items()[ui.cursor];
    out.freshOpen = { label: it && it.label, ok: ui.isStop(it) };
  } catch (e) {
    out.freshOpen = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * ENTER MUST NOT CHANGE A LONG VALUE LIST.
   *
   * This is the bug the row grammar exists to make unrepresentable: driving
   * the shipped build, one Enter one row below where it was meant changed
   * the flight tune from Betaflight default to Karate race 6S, with nothing
   * confirming it and nothing announcing it. select() called adjust(1) on
   * any row that had an adjust.
   *
   * Asserted on the value, not on the code path: press Enter on the row and
   * the tune must be the tune it was.
   */
  try {
    /* The Tune row lives in the Quad room now: it is the machine's, and
     * the title carries a Quad row that names it rather than a copy of it. */
    ui.show('quad');
    const i = ui.items().findIndex((it) => it && it.id === 'quad:tune');
    ui.setCursor(i);
    const before = ui.items()[i].value;
    ui.select();
    const after = ui.items()[i].value;
    out.enterOnList = {
      found: i >= 0,
      before,
      after,
      unchanged: before === after,
      opened: Boolean(ui.dropEl),
    };
    ui.closeDrop();
  } catch (e) {
    out.enterOnList = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * A SWITCH IS A SWITCH: Enter flips it, and Enter again puts it back.
   * Left sets it off and Right sets it on, rather than both cycling, which
   * is what a two item popup's adjust used to do.
   */
  try {
    ui.show('pilot');
    /* By ID, not by label. Pilot carries a Sound HEADING and a Sound
     * SWITCH, and looking up the label found the heading, which is the
     * exact collision stable ids were added to remove. */
    const i = ui.items().findIndex((it) => it && it.id === 'pilot:sound');
    ui.setCursor(i);
    const start = ui.items()[i].on;
    ui.select();
    const flipped = ui.items()[i].on;
    ui.select();
    const back = ui.items()[i].on;
    ui.adjust(-1);
    const off = ui.items()[i].on;
    ui.adjust(-1);
    const stillOff = ui.items()[i].on;
    ui.adjust(1);
    const on = ui.items()[i].on;
    /* Put it back the way it was found. */
    ui.adjust(start ? 1 : -1);
    out.switchRow = {
      found: i >= 0,
      isSwitch: Boolean(ui.items()[i] && ui.items()[i].sw),
      flips: flipped === !start,
      flipsBack: back === start,
      leftIsOff: off === false && stillOff === false,
      rightIsOn: on === true,
      noPopup: !(ui.items()[i] && ui.items()[i].options),
    };
  } catch (e) {
    out.switchRow = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * NO TWO ITEM POPUP SURVIVES ANYWHERE. The complaint was not about one
   * row, it was that every on and off in the product opened a menu to
   * answer a yes or no, so the assertion sweeps every screen rather than
   * naming the rows that used to do it.
   */
  try {
    const offenders = [];
    for (const name of ${JSON.stringify(SCREENS)}) {
      ui.show(name);
      for (const it of ui.items()) {
        /* The renderer's OWN predicate, so this cannot drift from what is
         * actually drawn. A two option row that fits on the row is a
         * segment strip and is the fix; a two option row that does not is
         * still a menu opened to answer yes or no. */
        if (it && it.options && it.options.length === 2 && !ui.fitsAsSegments(it)) {
          offenders.push(name + ':' + it.label);
        }
      }
    }
    out.noTinyPopups = { offenders };
  } catch (e) {
    out.noTinyPopups = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * ONE FOCUS AUTHORITY.
   *
   * Xbox Accessibility Guideline 112: exactly one element is focused,
   * always, and focus is application state rather than a CSS pseudo-class.
   * The shell painted a cursor bar with a class while document.activeElement
   * was somewhere else entirely, which is two authorities that agree only by
   * not being asked. Asserted three ways.
   */
  try {
    ui.show('pilot');
    ui.setCursor(ui.firstStop(ui.items(), ui.rowOffset));
    /* Put focus in the menu, the way Tab would. */
    const first = ui.menuRows.find((r) => r.classList.contains('row'));
    if (first) { first.focus(); }
    ui.move(1);
    ui.move(1);
    const painted = ui.menuRows.filter((r) => r.classList.contains('on')).length;
    const at = ui.menuRows[ui.cursor - ui.rowOffset];
    const focusFollows = at === document.activeElement;
    /* Exactly one row is Tab reachable, and it is that one. */
    const tabbable = ui.menuRows.filter((r) => r.classList.contains('row') && r.tabIndex === 0);
    const selected = ui.menuRows.filter((r) => r.getAttribute('aria-selected') === 'true');

    /*
     * And focus arriving from OUTSIDE the shell moves the cursor: a screen
     * reader or a Tab press lands on a row, and the cursor has to be there
     * too or the next arrow press jumps somewhere else.
     */
    const rows = ui.menuRows.filter((r) => r.classList.contains('row'));
    const target = rows[rows.length - 1];
    let cursorFollowedFocus = false;
    if (target) {
      target.focus();
      cursorFollowedFocus = ui.menuRows[ui.cursor - ui.rowOffset] === target;
    }
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    out.focusAuthority = {
      painted,
      focusFollows,
      tabbable: tabbable.length,
      selected: selected.length,
      cursorFollowedFocus,
    };
  } catch (e) {
    out.focusAuthority = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * THE CURSOR BELONGS TO A ROW, NOT AN INDEX.
   *
   * A filter that removes rows above the cursor slides everything up under
   * it, so an index-based cursor stays at 27 and is now pointing at a
   * different key. The bench has four filters, so this is the screen that
   * proves it: land on a key, turn on show-only-modified, and the cursor
   * must still be on a row rather than at the same number.
   */
  try {
    ui.show('fc');
    const wasTab = ui.fc.tab;
    ui.fc.setTab('pid');
    ui.fc.discard();
    ui.fc.setValue('p_roll', String(Number(ui.fc.cliValue('p_roll') || 0) + 3));
    ui.renderMenu();
    const i = ui.items().findIndex((it) => it && it.key === 'p_roll');
    ui.setCursor(i);
    const before = ui.items()[ui.cursor].key;
    const beforeIndex = ui.cursor;
    /* The filter drops every row above it. */
    ui.fc.onlyModified = true;
    ui.renderMenu();
    const after = ui.items()[ui.cursor] ? ui.items()[ui.cursor].key : null;
    const movedIndex = ui.cursor !== beforeIndex;
    ui.fc.onlyModified = false;
    ui.fc.discard();
    ui.fc.setTab(wasTab);
    ui.renderMenu();
    out.stickyCursor = {
      before, after, sameRow: before === after, movedIndex,
    };
  } catch (e) {
    out.stickyCursor = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * THE BENCH CAN BE SEARCHED, AND THE HELP SAYS SOMETHING.
   *
   * 696 keys across 23 flat tabs with no grouping and no cross-tab search
   * is a memory test: a pilot who has read a guide naming a key has to know
   * which tab Betaflight files it under before they can find it. And
   * fieldNote() ended in a bare return of field.key, so the help column beside 115
   * typed rows read the key name back at somebody looking at a row labelled
   * with that key name.
   */
  try {
    ui.show('fc');
    const startTab = ui.fc.tab;
    ui.fc.search = 'failsafe_procedure';
    let rows = ui.items();
    const exact = rows.find((it) => it && it.key === 'failsafe_procedure');
    const foundAcrossTabs = Boolean(exact) && ui.fc.tab === startTab;

    /* Ranking: an exact hit and a prefix hit must beat a substring. */
    ui.fc.search = 'd_min';
    rows = ui.items();
    const keys = rows.filter((it) => it && it.key && it.key !== 'fc-search').map((it) => it.key);
    const firstIsPrefix = Boolean(keys.length) && keys[0].startsWith('d_min');

    /* The cap has to be honest: a search that matches more than it shows
     * must say so, or a pilot concludes the key is not there. */
    ui.fc.search = '_';
    rows = ui.items();
    const moreLine = rows.find((it) => it && /more not shown/.test(String(it.label || '')));
    const shown = rows.filter((it) => it && it.key && it.key !== 'fc-search').length;

    /* A miss says so rather than showing an empty list. */
    ui.fc.search = 'zzzz_not_a_key';
    rows = ui.items();
    const missLine = rows.find((it) => it && /No key contains/.test(String(it.label || '')));

    /*
     * Leaving the field with Down must take the FOCUS into the results, not
     * only the painted bar. The first cut blurred the field and let focus
     * fall to the body, so the cursor walked the results with nothing
     * focused: a screen reader followed none of it and Tab restarted from
     * the top of the page.
     */
    ui.fc.search = 'gyro';
    ui.renderMenu();
    ui.setCursor(ui.firstStop(ui.items(), ui.rowOffset));
    ui.focusCursorRow();
    const fieldRow = ui.menuRows[ui.cursor - ui.rowOffset];
    const input = fieldRow && fieldRow.querySelector('.row-textfield');
    let focusLeftTheField = false;
    if (input) {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      focusLeftTheField = document.activeElement
        === ui.menuRows[ui.cursor - ui.rowOffset]
        && document.activeElement !== input;
    }

    ui.fc.search = null;
    ui.items();
    out.benchSearch = {
      focusLeftTheField,
      foundAcrossTabs,
      firstIsPrefix,
      capped: Boolean(moreLine) && shown <= 60,
      shown,
      saysMiss: Boolean(missLine),
      tabRestored: ui.fc.tab === startTab,
    };
  } catch (e) {
    out.benchSearch = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * NO HELP TEXT REPEATS ITS OWN ROW LABEL. Swept over every typed row on
   * every tab rather than spot checked, because the defect was a fallthrough
   * that covered 115 of them at once.
   */
  try {
    const offenders = [];
    let checked = 0;
    ui.show('fc');
    const startTab = ui.fc.tab;
    ui.fc.walkAll = true;
    for (const tab of ['setup', 'configuration', 'pid', 'receiver', 'motors']) {
      ui.fc.setTab(tab);
      for (const it of ui.items()) {
        if (!it || !it.key || it.key === 'fc-search') { continue; }
        checked += 1;
        const note = String(it.note || '').trim();
        if (!note || note === it.key || note === it.label) {
          offenders.push(tab + ':' + it.key);
        }
      }
    }
    ui.fc.walkAll = false;
    ui.fc.setTab(startTab);
    out.benchHelp = { checked, offenders };
  } catch (e) {
    out.benchHelp = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * SHOW ONLY WHAT I CHANGED. A pilot ten minutes into an edit had no way
   * to see what Save is about to write except by walking every tab.
   */
  try {
    ui.show('fc');
    const wasTab = ui.fc.tab;
    ui.fc.setTab('pid');
    const before = ui.fc.modifiedKeys().size;
    ui.fc.setValue('p_roll', String(Number(ui.fc.cliValue('p_roll') || 0) + 3));
    const after = ui.fc.modifiedKeys().size;
    ui.fc.onlyModified = true;
    const rows = ui.items().filter((it) => it && it.key && it.key !== 'fc-search');
    const onlyTheOne = rows.length === 1 && rows[0].key === 'p_roll';
    ui.fc.onlyModified = false;
    ui.fc.discard();
    const cleaned = ui.fc.modifiedKeys().size;
    /* Put the bench back on the tab it was found on. Leaving it elsewhere
     * changes how many rows the id sweep below counts, which made the
     * reported total move between runs for no product reason. */
    ui.fc.setTab(wasTab);
    out.benchModified = {
      startedClean: before === 0,
      sawTheEdit: after === 1,
      onlyTheOne,
      rows: rows.length,
      discardClears: cleaned === 0,
    };
  } catch (e) {
    out.benchModified = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * THE LIST DOES NOT MOVE UNDER THE POINTER.
   *
   * Reported as "the menu is a bit laggy throughout, following the mouse",
   * and it was not slow code. setCursor called syncCursor with scrolling
   * ON, so hovering a row scrolled that row into view. The row is already
   * in view, by definition, and near the ends of a scroller a nearest
   * block scroll still shifts the list a few pixels, sliding a
   * DIFFERENT row under a stationary pointer, which fires another mousemove
   * and moves the cursor again.
   *
   * Measured by sweeping the pointer down the rows and summing every
   * scrollTop change: 750 px of travel on the Pilot room before the fix.
   */
  try {
    const out2 = {};
    for (const name of ['pilot', 'fc']) {
      ui.show(name);
      const host = ui.menuRows[0].parentElement;
      host.scrollTop = 0;
      let jump = 0;
      let last = host.scrollTop;
      let x = 0;
      const rows = ui.menuRows.filter((r) => r.classList.contains('row'));
      for (const r of rows.slice(0, 25)) {
        const b = r.getBoundingClientRect();
        if (b.height === 0) { continue; }
        for (let k = 0; k < 3; k += 1) {
          x += 1;
          /* The clientX has to CHANGE or pointerMoved rejects the event as
           * a rebuilt row appearing under a still pointer, which is a real
           * guard and would make this check measure nothing. */
          r.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 200 + (x % 3),
            clientY: Math.round(b.top + (b.height / 2)),
          }));
          jump += Math.abs(host.scrollTop - last);
          last = host.scrollTop;
        }
      }
      out2[name] = jump;
    }
    ui.show('title');
    out.hoverScroll = out2;
  } catch (e) {
    out.hoverScroll = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * A DOOR IS NOT A ONE WAY DOOR.
   *
   * The Race and Freestyle rooms and the launch card all carry a Tune row
   * that is a door into Quad, and act() set returnTo to 'title' from
   * anywhere that was not paused. So a pilot who changed a tune from the
   * Freestyle room and pressed Back landed on the title instead of the room
   * they were standing in. Reported exactly that way.
   *
   * Asserted on the trip, not on the pointer: walk in through the door,
   * press Back, and check where you are.
   */
  try {
    const trips = {};
    const go = (id) => {
      const i = ui.items().findIndex((it) => it && it.id === id);
      if (i < 0) { return false; }
      ui.setCursor(i);
      ui.select();
      return true;
    };
    const reset = (room) => {
      ui.show('title');
      ui.roomFrom = null;
      ui.returnTo = null;
      ui.show(room);
    };

    for (const room of ['freestyle', 'launch', 'pilot']) {
      reset(room);
      trips[room] = go(room + ':a-quad')
        ? (() => { const at = ui.screen; ui.back(); return { at, back: ui.screen }; })()
        : { missing: true };
    }

    /* Two hops. Quad's Rates row is a signpost into Pilot's screen, so the
     * way back out is Quad and then the room Quad was opened from. */
    reset('freestyle');
    go('freestyle:a-quad');
    go('quad:a-rates');
    const deep = [ui.screen];
    ui.back(); deep.push(ui.screen);
    ui.back(); deep.push(ui.screen);
    trips.deep = deep;

    /* A paused run still wins. returnTo is the pause chain and losing it
     * strands a flight. */
    ui.show('title');
    ui.returnTo = 'paused';
    ui.roomFrom = 'freestyle';
    ui.show('quad');
    ui.back();
    trips.paused = ui.screen;

    ui.returnTo = null;
    ui.roomFrom = null;
    ui.show('title');
    out.roomReturn = trips;
  } catch (e) {
    out.roomReturn = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * THE LAUNCH CARD IS FOR A MEASURED RUN, and only for one.
   *
   * Freestyle has no clock, no lap, no ghost and no board, so a card asking
   * what the run counts as would be ceremony in front of a flight that
   * counts as nothing. Fly must go straight to the air there, and must stop
   * at the card when there is a time to be set.
   */
  try {
    const seen = [];
    const tryFly = (map) => {
      const before = ui.settings.map;
      const heldMode = ui.mode;
      ui.settings.map = map;
      /* The seat and the mode are one state now: a pilot sitting in a
       * gateless world got there by answering Freestyle, and Fly checks
       * that they agree before it launches anything. */
      ui.mode = 'freestyle';
      ui.show('title');
      /* onAction is what launches. Stub it so the check does not start a
       * run it would then have to get out of. */
      const realAction = ui.onAction;
      let launched = false;
      ui.onAction = (a) => { if (a === 'fly') { launched = true; } };
      try {
        ui.act('fly');
      } finally {
        ui.onAction = realAction;
      }
      const landed = ui.screen;
      ui.settings.map = before;
      ui.mode = heldMode;
      ui.show('title');
      return { map, landed, launched };
    };
    /* A dressed world is freestyle by MAPS[].mode and must fly straight. */
    seen.push(tryFly('city'));
    seen.push(tryFly('bando'));
    out.launchGate = { seen };
  } catch (e) {
    out.launchGate = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * ONE ROOM PER THING.
   *
   * Tune, PIDs and Rates were built once and spread onto four screens, so
   * "where do I change my rates" had four correct answers with different
   * surrounding context. This asserts the fix on the shipped lists rather
   * than on the intent: an EDITABLE copy, one that changes the value in
   * place, may exist on at most one screen. A DOOR, a navigation row that
   * opens the room where the real one lives, may exist anywhere, because a
   * signpost is not a second answer.
   *
   * Tune is allowed two: its room, and the pause menu, where "does this
   * feel wrong" is the question being asked and the row is the answer.
   */
  try {
    const homes = { tune: [], pids: [], rates: [] };
    const doors = { tune: [], pids: [], rates: [] };
    const which = (it) => {
      if (!it || !it.label) { return null; }
      if (it.label === 'Tune') { return 'tune'; }
      if (it.label === 'PIDs') { return 'pids'; }
      if (it.label === 'Rates') { return 'rates'; }
      return null;
    };
    for (const name of ${JSON.stringify(SCREENS)}) {
      ui.show(name);
      for (const it of ui.items()) {
        const k = which(it);
        if (!k) { continue; }
        /* Editable means it changes the value where it stands. */
        if (it.options || it.sw || it.num || it.step) {
          homes[k].push(name);
        } else if (it.action) {
          doors[k].push(name);
        }
      }
    }
    out.oneHome = {
      tune: homes.tune,
      pids: homes.pids,
      rates: homes.rates,
      tuneDoors: doors.tune,
      pidsDoors: doors.pids,
      ratesDoors: doors.rates,
    };
  } catch (e) {
    out.oneHome = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * THE MID-RUN WARNING CANNOT BE LOST BY ROUTE.
   *
   * Changing a tune, a PID or a rate during a run puts the quad back on the
   * start line, and only the pause menu's own copies said so. Pause reached
   * Settings by a route that showed the same rows without it, so whether a
   * pilot was told depended on which of four doors they came through. The
   * warning belongs to the ROOM being entered from a paused run, not to one
   * screen's copy of a row.
   */
  try {
    const warn = 'back on the start line';
    const scan = (screen, returnTo) => {
      ui.returnTo = returnTo;
      ui.show(screen);
      const rows = ui.items().filter((it) => it && (it.label === 'Tune' || it.label === 'PIDs' || it.label === 'Rates'));
      return {
        rows: rows.length,
        warned: rows.filter((it) => String(it.note || '').includes(warn)).length,
      };
    };
    const quadPaused = scan('quad', 'paused');
    const pilotPaused = scan('pilot', 'paused');
    const quadTitle = scan('quad', 'title');
    const pilotTitle = scan('pilot', 'title');
    ui.returnTo = 'title';
    ui.show('title');
    out.midRun = {
      quadPaused, pilotPaused, quadTitle, pilotTitle,
    };
  } catch (e) {
    out.midRun = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * THE RADIO DEAD ENDS. A pad whose switches arrive as axes reports no
   * buttons, so padMenuButtons answers a permanent no and the cursor walks
   * a list nothing can be selected from. The screens cannot be driven by a
   * real radio here, headless Chromium has no gamepad, so both halves are
   * exercised directly: the shell with a synthetic padSummary, and the
   * input layer with a synthetic gamepad.
   */
  try {
    const input = window.__input;
    const before = ui.padInfo;
    const rowAt0 = (info) => {
      ui.setPadInfo(info);
      /* The sweep above ends on credits, which pins #credits, and show()
       * maps a request for the title back onto a pinned screen. Without
       * this the whole block silently measured the credits screen. */
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      ui.show('title');
      const first = ui.items()[0];
      return {
        onTitle: ui.screen === 'title',
        label: first ? first.label : null,
        action: first ? first.action : null,
        cls: first ? first.rowClass : null,
      };
    };

    const noButtons = rowAt0({
      count: 1, using: 'Joystick 1, TX16S', buttons: 0, hasSelect: false, calibrated: false,
    });
    const uncal = rowAt0({
      count: 1, using: 'Joystick 1, TX16S', buttons: 12, hasSelect: false, calibrated: false,
    });
    const fine = rowAt0({
      count: 1, using: 'Joystick 1, TX16S', buttons: 12, hasSelect: false, calibrated: true,
    });
    const keyboard = rowAt0({ count: 0, using: 'Keyboard' });
    ui.setPadInfo(before);
    ui.show('title');

    out.padBanner = {
      /* onTitle on every one of them, so a redirect can never fake a pass
       * by measuring a screen with no warning row on it. */
      onTitle: [noButtons, uncal, fine, keyboard].every((r) => r && r.onTitle),
      noButtons: Boolean(noButtons.onTitle && noButtons.cls === 'row-warn' && noButtons.action === 'calibrate'),
      uncalibrated: Boolean(uncal.onTitle && uncal.cls === 'row-warn' && uncal.action === 'calibrate'),
      /*
       * The two cases must say DIFFERENT things. Both are a warning row
       * pointing at calibration, so a check that only looked at the class
       * and the action passed while the no-buttons branch was deleted and
       * the uncalibrated one answered for both. A pilot whose radio reports
       * no buttons needs to be told about the hold gesture; "not calibrated
       * yet" does not tell them how to press the row that fixes it.
       */
      distinct: Boolean(noButtons.label && uncal.label && noButtons.label !== uncal.label),
      namesTheCause: Boolean(noButtons.label && /button/i.test(noButtons.label)),
      /* A working radio and a keyboard must NOT get a warning row: a banner
       * that is always there is a banner nobody reads. */
      quietWhenFine: !(fine && fine.cls === 'row-warn'),
      quietOnKeyboard: !(keyboard && keyboard.cls === 'row-warn'),
    };

    /*
     * The input half. A pad with no buttons must still be able to press
     * something, or the banner is advice a pilot cannot take.
     */
    const fakePad = { index: 0, id: 'fake', axes: [0, 0, 0, 0], buttons: [] };
    const realFirst = input.firstGamepad;
    input.firstGamepad = () => fakePad;
    const savedMap = input.map;
    const savedRest = input.navRest;
    try {
      input.map = { ...savedMap, select: null };
      input.navRest = [0, 0, 0, 0];
      input.holdMs = 0;
      input.holdFired = false;
      input.holdAt = 0;

      /* Centred: nothing. */
      const atRest = input.padMenuButtons().select;

      /*
       * Held past the threshold: one press, and only one.
       *
       * holdSelect reads its own clock, so the bank is set up relative to
       * performance.now() rather than to an invented timestamp. Each call
       * below adds one clamped tick of at most 100 ms.
       */
      const now = () => performance.now();
      fakePad.axes = [0, 0, 0, 0.9];

      /* 100 ms banked, one tick short of nothing: well under the hold. */
      input.holdMs = 0;
      input.holdFired = false;
      input.holdAt = now() - 100;
      const early = input.padMenuButtons().select;

      /* 650 ms banked plus a 100 ms tick clears the 700 ms hold. */
      input.holdMs = 650;
      input.holdFired = false;
      input.holdAt = now() - 100;
      const fired = input.padMenuButtons().select;

      /* Still held. The latch must not let it press again. */
      input.holdAt = now() - 100;
      const again = input.padMenuButtons().select;

      /* Released and held again: it presses once more, or a radio gets one
       * press per page load. */
      fakePad.axes = [0, 0, 0, 0];
      input.holdAt = now();
      input.padMenuButtons();
      fakePad.axes = [0, 0, 0, 0.9];
      input.holdMs = 650;
      input.holdAt = now() - 100;
      const rearmed = input.padMenuButtons().select;

      /* An assigned menu switch behaves like a button: level, edge latched
       * by the caller, and no hold needed. */
      input.map = {
        ...savedMap,
        select: {
          axis: 3, center: 0, pos: 1, neg: -1,
        },
      };
      fakePad.axes = [0, 0, 0, 0.9];
      const switchOn = input.padMenuButtons().select;
      fakePad.axes = [0, 0, 0, 0];
      const switchOff = input.padMenuButtons().select;

      out.padSelect = {
        quietAtRest: atRest === false,
        notBeforeTheHold: early === false,
        firesOnHold: fired === true,
        oncePerHold: again === false,
        rearmsAfterRelease: rearmed === true,
        assignedSwitchOn: switchOn === true,
        assignedSwitchOff: switchOff === false,
      };
    } finally {
      input.firstGamepad = realFirst;
      input.map = savedMap;
      input.navRest = savedRest;
    }
  } catch (e) {
    out.padBanner = { error: String(e && e.message ? e.message : e) };
  }

  /* Escape on the firmware bench with unsaved edits must not discard.
   * Dirty the draft through the same setter the rows use. */
  try {
    ui.show('fc');
    const before = ui.fc.dirty();
    ui.fc.setValue('p_roll', String(Number(ui.fc.cliValue('p_roll') || 0) + 3));
    const dirty = ui.fc.dirty();
    ui.back();
    out.discardGuard = {
      wasClean: before === false,
      dirty,
      stayed: ui.screen === 'fc',
      panel: ui.fc.confirm === 'leave',
      stillDirty: ui.fc.dirty(),
    };
    /* Put it back the way it was found. */
    ui.fc.confirm = null;
    ui.fc.discard();
    ui.show('title');
  } catch (e) {
    out.discardGuard = { error: String(e && e.message ? e.message : e) };
  }

  /*
   * THE GATE. A visit opens on one question, Race or Freestyle, drawn as two
   * cards, and the menu behind it names a track or a map, never a mode. Two
   * things would quietly come back: a Race row and a Freestyle row on the
   * front page, or the cards turning back into plain rows.
   *
   * Answered through act(), which is what a keypress calls, so the seat has
   * to follow the answer as well as the flag.
   */
  try {
    const held = ui.mode;
    const heldFirst = ui.firstRun;
    ui.firstRun = false;
    ui.mode = null;
    ui.show('title');
    const gateItems = ui.items().filter((it) => ui.isStop(it));
    const gate = gateItems.map((it) => it.label);
    const drawn = ui.root.querySelectorAll('.screen-title .gate-card').length;
    const art = [...ui.root.querySelectorAll('.screen-title .gate-card-shot')]
      .map((n) => n.getAttribute('src'));
    /*
     * Race is pressed for real. Freestyle is only set, because answering it
     * can seat a world, and seating a world hands main.js a swap: the city
     * is nineteen thousand meshes and this check has nothing to say about
     * it. What act() does on the way is the same code either way.
     */
    ui.act('mode-race');
    const landed = ui.screen;
    const seated = ui.seatMatchesMode();
    ui.show('title');
    const race = ui.items().map((it) => it.label);
    ui.mode = 'freestyle';
    const free = ui.items().map((it) => it.label);
    ui.mode = held;
    ui.firstRun = heldFirst;
    ui.show('title');
    out.modeGate = {
      gate,
      drawn,
      art,
      asksTwo: gate.includes('Race') && gate.includes('Freestyle') && !gate.includes('Fly'),
      /* Two cards drawn, both with a picture, and neither of them a row:
       * the whole point of the screen is that it is not a menu. */
      asCards: drawn === 2 && art.length === 2 && art.every(Boolean)
        && gateItems.filter((it) => !it.card).length === 0,
      /* Answering it either seats something to fly or opens the picker for
       * the thing it could not seat. Landing on a menu with neither is the
       * failure: a Fly row over an empty seat. */
      answered: seated || landed === 'courses',
      landed,
      race,
      free,
      raceNamesTrack: race.includes('Track') && !race.includes('Race') && !race.includes('Freestyle'),
      freeNamesMap: free.includes('Map') && !free.includes('Race') && !free.includes('Freestyle'),
    };
  } catch (e) {
    out.modeGate = { error: String(e && e.message ? e.message : e) };
  }

  return JSON.stringify(out);
})()`;

/*
 * Escape from every screen has to land somewhere real. back() has eight
 * branches and a four variable return chain, which is exactly the shape
 * that strands a pilot when one of them is edited.
 */
const ESCAPE = `(() => {
  const ui = window.__ui;
  ${PAST_GATE}
  const known = new Set(Object.keys(ui.screens).concat(['flight']));
  const out = {};
  for (const name of ${JSON.stringify(SCREENS)}) {
    try {
      ui.show(name);
      ui.back();
      out[name] = { to: ui.screen, known: known.has(ui.screen) };
    } catch (e) {
      out[name] = { error: String(e && e.message ? e.message : e) };
    }
  }
  return JSON.stringify(out);
})()`;

function parseArgs(argv) {
  const opts = { w: 1600, h: 900, record: false };
  for (const a of argv) {
    const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
    if (!m) {
      continue;
    }
    if (m[1] === 'record') {
      opts.record = true;
    } else if (m[2] !== undefined) {
      opts[m[1]] = /^\d+$/.test(m[2]) ? Number(m[2]) : m[2];
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const page = await openPage({
    root,
    width: opts.w,
    height: opts.h,
    /* Pin the graphics preset for the same reason the window is pinned: a
     * measurement taken at two different presets reports a regression that
     * is only a setting. And skip the first run split, because this check
     * is about the returning pilot's twelve rows. */
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.graphics = 'low';
      s.graphicsAuto = false;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* Storage refused. The run still boots. */ }`],
  });

  let failures = [];
  const notes = [];
  try {
    await page.until('window.__shellReady === true', 90000);
    await page.until('!!window.__ui', 10000);

    const walk = JSON.parse(await page.evaluate(WALK));
    const escape = JSON.parse(await page.evaluate(ESCAPE));
    const fcTabs = JSON.parse(await page.evaluate(FC_TABS));
    const behaviour = JSON.parse(await page.evaluate(BEHAVIOUR));
    const ids = JSON.parse(await page.evaluate(IDS));
    /* Leave the shell where it started, so a failing run does not also
     * leave a half torn down screen behind it. */
    await page.evaluate('window.__ui.show("title")');

    const baseline = existsSync(BASELINE)
      ? JSON.parse(await readFile(BASELINE, 'utf8'))
      : null;

    if (opts.record) {
      const record = {};
      for (const name of SCREENS) {
        record[name] = { overflow: walk[name] ? walk[name].overflow ?? 0 : 0 };
      }
      await writeFile(
        BASELINE,
        `${JSON.stringify({
          note: 'Today\'s overflow, in CSS pixels, at the window below. Not a target: a screen may already overflow. The check fails when a screen gets worse than this.',
          window: { w: opts.w, h: opts.h },
          screens: record,
        }, null, 2)}\n`,
      );
      console.log(`recorded baseline at ${opts.w}x${opts.h}: ${BASELINE}`);
    }

    const rows = [];
    for (const name of SCREENS) {
      const w = walk[name];
      const e = escape[name];
      if (!w || w.error) {
        failures.push(`${name}: walk failed: ${w ? w.error : 'no result'}`);
        continue;
      }
      if (w.unreachable.length) {
        failures.push(
          `${name}: ${w.unreachable.length} stop(s) unreachable by any key: ${w.unreachable.join(', ')}`,
        );
      }
      if (w.notesLost) {
        failures.push(
          `${name}: ${w.notesLost} unreachable row(s) carry a note, so their help can never be shown`,
        );
      }
      if (!e || e.error) {
        failures.push(`${name}: Escape failed: ${e ? e.error : 'no result'}`);
      } else if (!e.known) {
        failures.push(`${name}: Escape landed on unknown screen "${e.to}"`);
      }

      const base = baseline && baseline.window.w === opts.w && baseline.window.h === opts.h
        ? (baseline.screens[name] || {}).overflow
        : undefined;
      if (base !== undefined && w.overflow > base) {
        failures.push(`${name}: overflow grew from ${base} to ${w.overflow} px`);
      } else if (base !== undefined && w.overflow < base) {
        notes.push(`${name}: overflow improved from ${base} to ${w.overflow} px, re-record the baseline`);
      }

      rows.push(
        `  ${name.padEnd(10)} stops ${String(w.stops).padStart(4)}` +
        `  arrow ${String(w.arrow).padStart(4)}` +
        `  reached ${String(w.reached).padStart(4)}` +
        `  overflow ${String(w.overflow).padStart(4)} px` +
        `  escape -> ${e && e.to ? e.to : '?'}`,
      );
    }

    let idRows = 0;
    for (const name of SCREENS) {
      const r = ids[name];
      if (!r || r.error) {
        failures.push(`ids on ${name}: ${r ? r.error : 'no result'}`);
        continue;
      }
      idRows += r.rows;
      if (r.missing.length) {
        failures.push(
          `ids on ${name}: ${r.missing.length} row(s) carry no id: ${r.missing.slice(0, 4).join(', ')}`,
        );
      }
      if (r.dupes.length) {
        failures.push(
          `ids on ${name}: ${r.dupes.length} duplicate id(s): ${r.dupes.slice(0, 4).join(', ')}`,
        );
      }
      if (r.lengthChanged) {
        failures.push(`ids on ${name}: two calls to items() returned different lengths`);
      }
      if (r.unstable.length) {
        failures.push(
          `ids on ${name}: ${r.unstable.length} id(s) changed between two rebuilds: ${r.unstable.slice(0, 4).join(', ')}`,
        );
      }
    }
    notes.push(`ids: ${idRows} rows across ${SCREENS.length} screens, all named, unique and stable`);

    const b = behaviour;
    if (!b.focusMemory || b.focusMemory.error) {
      failures.push(`focus memory: ${b.focusMemory ? b.focusMemory.error : 'no result'}`);
    } else if (!b.focusMemory.ok) {
      failures.push(
        `focus memory: left Settings on "${b.focusMemory.want}", came back on "${b.focusMemory.got}"`,
      );
    }
    if (!b.freshOpen || b.freshOpen.error || !b.freshOpen.ok) {
      failures.push(`fresh open: ${b.freshOpen && b.freshOpen.error ? b.freshOpen.error : 'did not land on a stop'}`);
    }
    if (!b.enterOnList || b.enterOnList.error) {
      failures.push(`Enter on a list: ${b.enterOnList ? b.enterOnList.error : 'no result'}`);
    } else {
      const e2 = b.enterOnList;
      if (!e2.found) {
        failures.push('Enter on a list: the Tune row was not found, so nothing was exercised');
      }
      if (!e2.unchanged) {
        failures.push(
          `Enter on a list: Enter changed the tune from "${e2.before}" to "${e2.after}"`,
        );
      }
      if (!e2.opened) {
        failures.push('Enter on a list: Enter did not open the picker either, so the row is dead');
      }
    }

    if (!b.switchRow || b.switchRow.error) {
      failures.push(`switch row: ${b.switchRow ? b.switchRow.error : 'no result'}`);
    } else {
      const sw = b.switchRow;
      if (!sw.found) {
        failures.push('switch row: the Sound row was not found, so nothing was exercised');
      }
      if (!sw.isSwitch) {
        failures.push('switch row: Sound is not a switch');
      }
      if (sw.options) {
        failures.push('switch row: Sound still carries an option list');
      }
      if (!sw.flips) {
        failures.push('switch row: Enter did not flip it');
      }
      if (!sw.flipsBack) {
        failures.push('switch row: Enter again did not put it back');
      }
      if (!sw.leftIsOff) {
        failures.push('switch row: Left does not set it off, it cycles');
      }
      if (!sw.rightIsOn) {
        failures.push('switch row: Right does not set it on');
      }
      if (!sw.noPopup) {
        failures.push('switch row: it would still open a popup');
      }
    }

    if (!b.modeGate || b.modeGate.error) {
      failures.push(`the gate: ${b.modeGate ? b.modeGate.error : 'no result'}`);
    } else {
      const g = b.modeGate;
      if (!g.asksTwo) {
        failures.push(`the gate: a fresh visit opens on ${g.gate.join(', ') || 'nothing'}, not on Race or Freestyle`);
      }
      if (!g.asCards) {
        failures.push(
          `the gate: ${g.drawn} card(s) drawn with art ${JSON.stringify(g.art)}, so the question is a menu again`,
        );
      }
      if (!g.answered) {
        failures.push(`the gate: answering Race left nothing seated and stayed on ${g.landed}`);
      }
      if (!g.raceNamesTrack) {
        failures.push(`the title in Race names ${g.race.join(', ')}, which is not a Track row without a mode beside it`);
      }
      if (!g.freeNamesMap) {
        failures.push(`the title in Freestyle names ${g.free.join(', ')}, which is not a Map row without a mode beside it`);
      }
    }

    if (!b.noTinyPopups || b.noTinyPopups.error) {
      failures.push(`two item popups: ${b.noTinyPopups ? b.noTinyPopups.error : 'no result'}`);
    } else if (b.noTinyPopups.offenders.length) {
      failures.push(
        `two item popups: ${b.noTinyPopups.offenders.length} row(s) still open a menu to answer`
        + ` yes or no: ${b.noTinyPopups.offenders.slice(0, 5).join(', ')}`,
      );
    }

    if (!b.focusAuthority || b.focusAuthority.error) {
      failures.push(`focus authority: ${b.focusAuthority ? b.focusAuthority.error : 'no result'}`);
    } else {
      const fa = b.focusAuthority;
      if (fa.painted !== 1) {
        failures.push(`focus authority: ${fa.painted} rows look selected, not 1`);
      }
      if (!fa.focusFollows) {
        failures.push('focus authority: the browser focus is not on the row the cursor is on');
      }
      if (fa.tabbable !== 1) {
        failures.push(`focus authority: ${fa.tabbable} rows are Tab reachable, not 1`);
      }
      if (fa.selected !== 1) {
        failures.push(`focus authority: ${fa.selected} rows report aria-selected, not 1`);
      }
      if (!fa.cursorFollowedFocus) {
        failures.push('focus authority: focus arriving from Tab or a screen reader does not move the cursor');
      }
    }

    if (!b.stickyCursor || b.stickyCursor.error) {
      failures.push(`sticky cursor: ${b.stickyCursor ? b.stickyCursor.error : 'no result'}`);
    } else {
      const sc = b.stickyCursor;
      if (!sc.movedIndex) {
        failures.push('sticky cursor: the filter did not change the row index, so nothing was exercised');
      }
      if (!sc.sameRow) {
        failures.push(
          `sticky cursor: a filter moved the cursor from "${sc.before}" to "${sc.after}"`,
        );
      }
    }

    if (!b.benchSearch || b.benchSearch.error) {
      failures.push(`bench search: ${b.benchSearch ? b.benchSearch.error : 'no result'}`);
    } else {
      const bs = b.benchSearch;
      if (!bs.foundAcrossTabs) {
        failures.push('bench search: failsafe_procedure is not findable without knowing its tab');
      }
      if (!bs.firstIsPrefix) {
        failures.push('bench search: a prefix hit does not rank above a substring hit');
      }
      if (!bs.capped) {
        failures.push(`bench search: a search matching more than it shows does not say so (${bs.shown} rows)`);
      }
      if (!bs.saysMiss) {
        failures.push('bench search: a search that matches nothing shows an empty list rather than saying so');
      }
      if (!bs.tabRestored) {
        failures.push('bench search: leaving search moved the pilot to a different tab');
      }
      if (!bs.focusLeftTheField) {
        failures.push('bench search: Down out of the search field leaves the focus behind, on nothing');
      }
    }

    if (!b.benchHelp || b.benchHelp.error) {
      failures.push(`bench help: ${b.benchHelp ? b.benchHelp.error : 'no result'}`);
    } else if (b.benchHelp.offenders.length) {
      failures.push(
        `bench help: ${b.benchHelp.offenders.length} of ${b.benchHelp.checked} row(s) have help that is`
        + ` empty or just the key name: ${b.benchHelp.offenders.slice(0, 5).join(', ')}`,
      );
    } else {
      notes.push(`bench help: ${b.benchHelp.checked} rows across 5 tabs, none repeating its own label`);
    }

    if (!b.benchModified || b.benchModified.error) {
      failures.push(`bench modified: ${b.benchModified ? b.benchModified.error : 'no result'}`);
    } else {
      const bm = b.benchModified;
      if (!bm.startedClean) {
        failures.push('bench modified: the draft was already dirty, so nothing was exercised');
      }
      if (!bm.sawTheEdit) {
        failures.push('bench modified: an edited key is not reported as modified');
      }
      if (!bm.onlyTheOne) {
        failures.push(`bench modified: show-only-modified listed ${bm.rows} rows for one edit`);
      }
      if (!bm.discardClears) {
        failures.push('bench modified: discarding the draft leaves keys reported as modified');
      }
    }

    if (!b.hoverScroll || b.hoverScroll.error) {
      failures.push(`hover scroll: ${b.hoverScroll ? b.hoverScroll.error : 'no result'}`);
    } else {
      for (const [name, px] of Object.entries(b.hoverScroll)) {
        if (px > 0) {
          failures.push(`hover scroll: the ${name} list moved ${px}px under the pointer during a sweep`);
        }
      }
    }

    if (!b.roomReturn || b.roomReturn.error) {
      failures.push(`room return: ${b.roomReturn ? b.roomReturn.error : 'no result'}`);
    } else {
      const rr = b.roomReturn;
      for (const room of ['freestyle', 'launch', 'pilot']) {
        const t = rr[room];
        if (!t || t.missing) {
          failures.push(`room return: ${room} has no door into Quad, so nothing was exercised`);
          continue;
        }
        if (t.at !== 'quad') {
          failures.push(`room return: the Quad door on ${room} opened "${t.at}"`);
        }
        if (t.back !== room) {
          failures.push(`room return: Back from Quad opened from ${room} landed on "${t.back}"`);
        }
      }
      const d = rr.deep || [];
      if (d.join(' -> ') !== 'rates -> quad -> freestyle') {
        failures.push(`room return: freestyle to quad to rates and back twice went "${d.join(' -> ')}"`);
      }
      if (rr.paused !== 'paused') {
        failures.push(`room return: a paused run lost its pause chain, Back landed on "${rr.paused}"`);
      }
    }

    if (!b.launchGate || b.launchGate.error) {
      failures.push(`launch gate: ${b.launchGate ? b.launchGate.error : 'no result'}`);
    } else {
      for (const r of b.launchGate.seen) {
        if (r.landed === 'launch') {
          failures.push(`launch gate: Fly on the freestyle world "${r.map}" stopped at the launch card`);
        }
        if (!r.launched) {
          failures.push(`launch gate: Fly on the freestyle world "${r.map}" did not launch at all`);
        }
      }
    }

    if (!b.oneHome || b.oneHome.error) {
      failures.push(`one room per thing: ${b.oneHome ? b.oneHome.error : 'no result'}`);
    } else {
      const oh = b.oneHome;
      /* Tune is allowed its room and the pause menu, and nowhere else. */
      if (oh.tune.length > 2) {
        failures.push(`one room per thing: Tune is editable on ${oh.tune.length} screens: ${oh.tune.join(', ')}`);
      }
      if (oh.pids.length > 1) {
        failures.push(`one room per thing: PIDs is editable on ${oh.pids.length} screens: ${oh.pids.join(', ')}`);
      }
      if (oh.rates.length > 1) {
        failures.push(`one room per thing: Rates is editable on ${oh.rates.length} screens: ${oh.rates.join(', ')}`);
      }
      /* And each still has to exist SOMEWHERE, or the split deleted it. */
      if (!oh.tune.length) {
        failures.push('one room per thing: Tune cannot be changed anywhere');
      }
      if (!oh.pids.length && !oh.pidsDoors.length) {
        failures.push('one room per thing: PIDs is not reachable from anywhere');
      }
      if (!oh.ratesDoors.length) {
        failures.push('one room per thing: Rates is not reachable from anywhere');
      }
    }

    if (!b.midRun || b.midRun.error) {
      failures.push(`mid-run warning: ${b.midRun ? b.midRun.error : 'no result'}`);
    } else {
      const mr = b.midRun;
      for (const [name, r] of [['Quad', mr.quadPaused], ['Pilot', mr.pilotPaused]]) {
        if (!r.rows) {
          failures.push(`mid-run warning: ${name} entered from a paused run has no tuning row to warn about`);
        } else if (r.warned < r.rows) {
          failures.push(
            `mid-run warning: ${name} entered from a paused run warns on ${r.warned} of ${r.rows} tuning rows`,
          );
        }
      }
      /* And it is NOT shown from the title, where it is not true and would
       * be the kind of always-on warning nobody reads. */
      for (const [name, r] of [['Quad', mr.quadTitle], ['Pilot', mr.pilotTitle]]) {
        if (r.warned) {
          failures.push(`mid-run warning: ${name} warns about a run that is not happening`);
        }
      }
    }

    if (!b.padBanner || b.padBanner.error) {
      failures.push(`radio banner: ${b.padBanner ? b.padBanner.error : 'no result'}`);
    } else {
      const pb = b.padBanner;
      if (!pb.onTitle) {
        failures.push('radio banner: one of the cases did not land on the title, so it measured nothing');
      }
      if (!pb.noButtons) {
        failures.push('radio banner: a pad reporting no buttons gets no warning row on the title');
      }
      if (!pb.uncalibrated) {
        failures.push('radio banner: an uncalibrated pad gets no warning row on the title');
      }
      if (!pb.distinct) {
        failures.push('radio banner: the no-buttons and uncalibrated cases say the same thing');
      }
      if (!pb.namesTheCause) {
        failures.push('radio banner: the no-buttons row does not mention buttons');
      }
      if (!pb.quietWhenFine) {
        failures.push('radio banner: a working, calibrated pad is warned at anyway');
      }
      if (!pb.quietOnKeyboard) {
        failures.push('radio banner: a keyboard-only visitor is warned about a radio');
      }
    }

    if (!b.padSelect || b.padSelect.error) {
      failures.push(`radio select: ${b.padSelect ? b.padSelect.error : 'no result'}`);
    } else {
      const ps = b.padSelect;
      if (!ps.quietAtRest) {
        failures.push('radio select: a pad at rest presses something');
      }
      if (!ps.notBeforeTheHold) {
        failures.push('radio select: a brief stick excursion presses, so the cursor cannot move');
      }
      if (!ps.firesOnHold) {
        failures.push('radio select: holding a stick never presses, so the pad has no Enter at all');
      }
      if (!ps.oncePerHold) {
        failures.push('radio select: a held stick presses repeatedly rather than once');
      }
      if (!ps.rearmsAfterRelease) {
        failures.push('radio select: releasing and holding again does not press, so a radio gets one press per page load');
      }
      if (!ps.assignedSwitchOn) {
        failures.push('radio select: an assigned menu switch does not press');
      }
      if (!ps.assignedSwitchOff) {
        failures.push('radio select: an assigned menu switch presses while it is off');
      }
    }

    if (!b.discardGuard || b.discardGuard.error) {
      failures.push(`discard guard: ${b.discardGuard ? b.discardGuard.error : 'no result'}`);
    } else {
      const d = b.discardGuard;
      if (!d.dirty) {
        failures.push('discard guard: the draft did not become dirty, so the guard was not exercised');
      }
      if (!d.stayed) {
        failures.push('discard guard: Escape left the firmware bench with unsaved edits');
      }
      if (!d.panel) {
        failures.push('discard guard: Escape did not raise the leave panel');
      }
      if (!d.stillDirty) {
        failures.push('discard guard: the draft was discarded without an answer');
      }
    }

    console.log(`shell check at ${opts.w}x${opts.h}`);
    console.log(rows.join('\n'));

    console.log('\n  firmware bench, arrow travel per tab');
    for (const [id, t] of Object.entries(fcTabs)) {
      if (t.error) {
        failures.push(`fc tab ${id}: ${t.error}`);
        continue;
      }
      /* Walking every key must reach every key. This is the property the
       * skip mechanism has to preserve and the one a naive fix breaks. */
      if (t.arrowAll < t.stops) {
        failures.push(
          `fc tab ${id}: walk-every-key reaches ${t.arrowAll} of ${t.stops} stops`,
        );
      }
      if (t.arrowDefault > t.stops) {
        failures.push(`fc tab ${id}: default travel ${t.arrowDefault} exceeds ${t.stops} stops`);
      }
      const saved = t.stops - t.arrowDefault;
      console.log(
        `  ${id.padEnd(14)} stops ${String(t.stops).padStart(4)}` +
        `  arrows stop on ${String(t.arrowDefault).padStart(4)}` +
        `  (${saved} skipped)`,
      );
    }

    /*
     * The console has to be clean too: a shell that throws on a screen
     * transition is a regression whether or not the cursor still moves.
     *
     * A failed network fetch is NOT that. The board is a separate service on
     * a separate origin and the product is required to work without it, so a
     * refused connection here is the offline path being exercised rather
     * than a defect. It is printed, so a run that is quietly missing the
     * board still says so, and it does not fail the check.
     */
    const offline = page.errors.filter((m) => /net::ERR_|Failed to load resource/.test(m));
    const real = page.errors.filter((m) => !/net::ERR_|Failed to load resource/.test(m));
    if (offline.length) {
      notes.push(`${offline.length} network fetch(es) refused, the board is not running here`);
    }
    if (real.length) {
      failures = failures.concat(real.map((m) => `console: ${m}`));
    }
  } finally {
    await page.close();
  }

  for (const n of notes) {
    console.log(`note: ${n}`);
  }
  if (failures.length) {
    console.error(`\nFAIL, ${failures.length} problem(s):`);
    for (const f of failures) {
      console.error(`  ${f}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('\nPASS');
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
