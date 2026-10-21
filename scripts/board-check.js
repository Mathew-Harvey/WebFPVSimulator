/*
 * board-check.js: the leaderboard is part of the game.
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

/*
 * WHY THIS EXISTS, and why it is not part of shell-check.js.
 *
 * Two things were reported together and they are one thing:
 *
 *   the Race room showed the five most flown tracks and told the pilot to
 *   go to the board for the rest, so a room called Race declined to list
 *   the races;
 *   and "Open the board" is jargon that LEAVES, to a page whose own way
 *   back reloads the simulator at the title and throws away what was
 *   seated. "What does this mean to a new user", exactly.
 *
 * Neither can be checked without a board. shell-check.js runs with none on
 * purpose, and reports "3 network fetch(es) refused" as a note, which is
 * the right shape for a check about the shell's own structure and blind to
 * everything here. So this one BRINGS a board: it spawns the real server
 * from the sibling repository against a scratch file, publishes tracks and
 * times into it, and drives the simulator against that.
 *
 * If the sibling repository is not checked out it says so and skips rather
 * than failing, because a missing sibling is not a defect in this one.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { MAPS_SHOWN } from '../src/share/board.js';
import { starterMap } from '../src/maps/built/starter.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BOARD_REPO = join(dirname(root), 'WebFPVSimulator-LeaderBoard');
const PORT = 3187;
const ORIGIN = `http://127.0.0.1:${PORT}`;

/* More than the five the room used to cap at, so "all of them" is a
 * measurably different number from "the featured ones". */
const TRACKS = [
  ['trk-c0000001', 'Bluegrass Circuit', 14, 'mothcircuit'],
  ['trk-c0000002', 'Celtic Riser', 22, 'hendrix fpv'],
  ['trk-c0000003', 'Fractal Current', 9, 'pinerun'],
  ['trk-c0000004', 'Copper Gully', 11, 'sugarK'],
  ['trk-c0000005', 'Shroom Spiral', 17, 'bandolier'],
  ['trk-c0000006', 'Neon Horizon', 12, 'mothcircuit'],
  ['trk-c0000007', 'Barnstorm Break', 8, 'pinerun'],
  ['trk-c0000008', 'Long Paddock', 19, 'sugarK'],
];
const PILOTS = ['sugarK', 'mothcircuit', 'pinerun', 'hendrix fpv', 'bandolier', 'tinnie'];

/*
 * Freestyle maps, two more than the Freestyle room shows, so "the ten
 * newest" is a measurably different set from "all of them". Each is the
 * starter yard under its own id and name, published oldest first: the board
 * stamps publishedUtc itself, so the order they go up in is the order the
 * room must list them in, newest first.
 */
const MAP_NAMES = [
  'Kawa Lot', 'Tsuki Works', 'Old Mill', 'Rooftop Run', 'Canal Yard', 'Depot Nine',
  'Sakura Row', 'Pylon Park', 'Harbour Gap', 'Crane Court', 'Tram Sheds', 'Night Market',
];
const PUBLISHED_MAPS = MAP_NAMES.map((name, i) => ({
  id: `trk-5eed${String(1000 + i).padStart(4, '0')}`,
  name,
}));

function trackDoc(id, name, gates) {
  const elements = [];
  const sequence = [];
  for (let i = 0; i < gates; i += 1) {
    const eid = `el-${i + 1}`;
    elements.push({
      id: eid,
      type: 'gate',
      name: `Gate ${i + 1}`,
      position: { x: 5 + (i * 4), y: 8 + ((i % 3) * 3), z: 0 },
      yaw: 0,
      pitch: 0,
      yawOverridden: false,
      dims: {
        clearW: 1.524, clearH: 1.524, sillH: 0, levels: 1,
      },
    });
    sequence.push({ id: `sq-${i + 1}`, elementId: eid });
  }
  return {
    schemaVersion: 1,
    id,
    name,
    createdUtc: '2026-01-01T00:00:00Z',
    modifiedUtc: '2026-01-01T00:00:00Z',
    field: { width: 60, depth: 40, gridSize: 1 },
    settings: { tangentScale: 0.4, minCurveRadius: 2, samplesPerSegment: 24 },
    branding: { logo: null, logoName: '' },
    elements,
    sequence,
  };
}

/* A ghost recording the board will accept: header, then the sample grid it
 * declares. The bytes are zeros because nothing here replays it; what is
 * being checked is that a time CARRYING one is offered as a rival. */
function ghostBlob(durationMs) {
  const rateHz = 30;
  const sampleBytes = 20;
  const count = Math.ceil((durationMs * rateHz) / 1000) + 1;
  const buf = Buffer.alloc(32 + (count * sampleBytes));
  buf.write('FPVGHST1', 0, 'latin1');
  buf.writeUInt32LE(1, 8);
  buf.writeUInt32LE(rateHz, 12);
  buf.writeUInt32LE(count, 16);
  buf.writeUInt32LE(durationMs, 20);
  buf.writeUInt32LE(0, 24);
  buf.writeUInt32LE(0, 28);
  return buf.toString('base64');
}

async function seed() {
  for (const [id, name, gates, author] of TRACKS) {
    const res = await fetch(`${ORIGIN}/api/tracks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ author, document: trackDoc(id, name, gates) }),
    });
    if (!res.ok) {
      throw new Error(`publishing ${name}: ${await res.text()}`);
    }
    const laps = 3 + (gates % 5);
    for (let i = 0; i < laps; i += 1) {
      await fetch(`${ORIGIN}/api/tracks/${id}/times`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: PILOTS[(i + gates) % PILOTS.length],
          lapMs: 60000 + (gates * 800) + (i * 1500),
        }),
      });
    }
  }
  /* One ghosted lap, on the track with the most times so it is the one the
   * simulator seats at boot and therefore the one the seated Standings row
   * opens. */
  const target = TRACKS.reduce((a, b) => ((a[2] % 5) >= (b[2] % 5) ? a : b));
  const res = await fetch(`${ORIGIN}/api/tracks/${target[0]}/times`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'ghostrider', lapMs: 58000, ghost: ghostBlob(58000) }),
  });
  if (!res.ok) {
    throw new Error(`posting the ghost lap: ${await res.text()}`);
  }
  for (const [i, m] of PUBLISHED_MAPS.entries()) {
    const made = await fetch(`${ORIGIN}/api/maps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        author: PILOTS[i % PILOTS.length],
        document: { ...starterMap(), id: m.id, name: m.name },
        plan: null,
      }),
    });
    if (!made.ok) {
      throw new Error(`publishing the map ${m.name}: ${await made.text()}`);
    }
    /* A clock tick apart, so no two share a publishedUtc and the order is
     * the board's to state rather than a tie broken by id. */
    await new Promise((resolve) => { setTimeout(resolve, 5); });
  }
  return target[1];
}

async function main() {
  if (!existsSync(join(BOARD_REPO, 'src', 'server.js'))) {
    console.log('board check: the LeaderBoard repository is not checked out beside this one.');
    console.log('\nSKIP, nothing to check against');
    return 0;
  }

  const dir = await mkdtemp(join(tmpdir(), 'webfpv-board-'));
  const proc = spawn(process.execPath, [join(BOARD_REPO, 'src', 'server.js')], {
    cwd: BOARD_REPO,
    env: { ...process.env, PORT: String(PORT), BOARD_FILE: join(dir, 'board.json') },
    stdio: 'ignore',
  });

  const failures = [];
  let page = null;
  try {
    /* Wait for it to answer rather than sleeping a guessed number. */
    let up = false;
    for (let i = 0; i < 60 && !up; i += 1) {
      try {
        const r = await fetch(`${ORIGIN}/api/tracks`);
        up = r.ok;
      } catch (e) {
        await new Promise((resolve) => { setTimeout(resolve, 200); });
      }
    }
    if (!up) {
      console.log('board check: the board did not start');
      console.log('\nFAIL, no board to check against');
      return 1;
    }
    const ghostTrack = await seed();
    console.log(`board check: ${TRACKS.length} tracks published, a ghosted lap on ${ghostTrack}, ${PUBLISHED_MAPS.length} freestyle maps\n`);

    page = await openPage({
      root,
      width: 1280,
      height: 720,
      seed: [`try {
        const k = ${JSON.stringify(SETTINGS_KEY)};
        const s = JSON.parse(localStorage.getItem(k) || '{}');
        s.graphics = 'low';
        s.graphicsAuto = false;
        localStorage.setItem(k, JSON.stringify(s));
        /* Point the simulator at the board this check just started. */
        localStorage.setItem('webfpv.board.origin', ${JSON.stringify(ORIGIN)});
        localStorage.setItem('webfpv.pilot.name', 'sugarK');
      } catch (e) { /* Storage refused. The run still boots. */ }`],
    });
    await page.until('window.__shellReady === true', 90000);
    await page.until('!!window.__ui', 10000);
    await page.evaluate(`(() => {
      const ui = window.__ui;
      /* Race, which is the mode every track in this check belongs to. */
      ui.firstRun = false;
      if (!ui.mode) { ui.mode = 'race'; }
      ui.show('courses');
      return 1;
    })()`);
    await page.until('(window.__ui.boardCourses || []).length > 0', 25000);
    /* The rooms open on the shared map picker since 2026-10-19, fetched on
     * the first visit, and its panels stand in for the cards; without it
     * the cards are still drawn. The check reads whichever the pilot has. */
    const usePicker = await page.until('Boolean(window.__ui.picker)', 15000).then(() => true, () => false);
    const PANELS = usePicker ? '.room-picker .wp-card' : '';

    const room = JSON.parse(await page.evaluate(`(() => {
      const ui = window.__ui;
      const items = ui.items();
      return JSON.stringify({
        listed: items.filter((i) => i.course).length,
        boardTracks: ui.boardCourses.length,
        note: String(ui.boardNote.textContent || ''),
        rows: items.filter((i) => !i.course).map((i) => i.label),
        cards: document.querySelectorAll(${JSON.stringify(PANELS || '.screen-courses .course-card')}).length,
        /* The Race room's own: the Freestyle room wears screen-courses too,
         * for the layout, and has a strip of the board's maps. */
        stripLabels: [...document.querySelectorAll('.screen-courses:not(.screen-freestyle) .strip-label')].map((n) => n.textContent),
      });
    })()`));

    /*
     * EVERY track. The seat is one of the published ones and is listed as
     * itself rather than as its board entry, so the room shows all of them.
     */
    if (room.listed < TRACKS.length) {
      failures.push(`the Race room lists ${room.listed} of ${TRACKS.length} published tracks`);
    }
    if (room.cards < TRACKS.length) {
      failures.push(`the Race room drew ${room.cards} cards for ${TRACKS.length} tracks`);
    }
    /* And it does not tell the pilot to go somewhere else for the rest. */
    if (/open the board/i.test(room.note)) {
      failures.push(`the Race room still says "${room.note}"`);
    }
    /* The audit's opening example: a screen headed Tracks that says WORLDS
     * above them. The worlds moved to the Freestyle room. */
    for (const label of room.stripLabels) {
      if (/world/i.test(label)) {
        failures.push(`the Race room still has a strip labelled "${label}"`);
      }
    }
    if (room.rows.includes('Open the board')) {
      failures.push('the Race room still offers "Open the board", which means nothing to a new player');
    }

    /*
     * Standings, in game, for the seated track, FROM ITS SHEET. The seat's
     * rows were the room's own rows under all the cards until MENUS-PLAN.md
     * 2.4 folded them into the seated card's sheet, so the row is reached
     * the way a pilot reaches it now: choose the seated card, then
     * Standings.
     */
    const opened = JSON.parse(await page.evaluate(`(() => {
      const ui = window.__ui;
      const seat = ui.items().findIndex((it) => it.course && it.course.kind === 'current');
      if (seat < 0) { return JSON.stringify({ missing: true, why: 'no seated card' }); }
      ui.setCursor(seat);
      ui.select();
      const i = ui.items().findIndex((it) => it.id === 'courses:a-standings');
      if (i < 0) { return JSON.stringify({ missing: true, why: 'no Standings in the sheet of the seated card' }); }
      ui.setCursor(i);
      ui.select();
      return JSON.stringify({ screen: ui.screen });
    })()`));
    if (opened.missing) {
      failures.push(`the Standings row was not found (${opened.why}), so nothing was exercised`);
    } else if (opened.screen !== 'standings') {
      failures.push(`Standings opened "${opened.screen}" rather than a standings screen`);
    } else {
      await page.until('Array.isArray(window.__ui.standingsTimes)', 20000);
      const st = JSON.parse(await page.evaluate(`(() => {
        const ui = window.__ui;
        const rows = [...ui.standingsTable.querySelectorAll('.standings-row')];
        const laps = ui.standingsTimes.map((t) => t.lapMs);
        ui.back();
        return JSON.stringify({
          times: ui.standingsTimes.length,
          sorted: laps.every((n, i) => i === 0 || laps[i - 1] <= n),
          drawn: rows.length,
          record: rows.filter((r) => r.classList.contains('is-record')).length,
          mine: rows.filter((r) => r.classList.contains('is-me')).length,
          actions: ui.items ? [] : [],
          back: ui.screen,
        });
      })()`));
      if (!st.times) {
        failures.push('the standings screen fetched no times');
      }
      if (!st.sorted) {
        failures.push('the standings are not in lap order');
      }
      if (st.drawn < st.times) {
        failures.push(`${st.times} times but ${st.drawn} rows drawn`);
      }
      if (st.record !== 1) {
        failures.push(`${st.record} rows marked as the record, expected exactly 1`);
      }
      /* sugarK is seeded as a pilot and set as this browser's name, so the
       * "your own row" marking has something to find. */
      if (!st.mine) {
        failures.push('the pilot\'s own row is not marked in the standings');
      }
      /* Back belongs to the room it was opened from, not the title. */
      if (st.back !== 'courses') {
        failures.push(`Back from standings landed on "${st.back}" rather than the track list`);
      }
    }

    /* A ghosted lap is offered as a rival, in game. */
    const ghost = JSON.parse(await page.evaluate(`(() => {
      const ui = window.__ui;
      const t = ui.boardCourses.find((x) => x.name === ${JSON.stringify(ghostTrack)})
        || (ui.standingsFor && ui.standingsFor.name === ${JSON.stringify(ghostTrack)} ? ui.standingsFor : null);
      if (!t) { return JSON.stringify({ missing: true }); }
      ui.showStandings(t);
      return JSON.stringify({ ok: true });
    })()`));
    if (ghost.missing) {
      failures.push(`the track with the ghosted lap (${ghostTrack}) was not listed`);
    } else {
      await page.until('Array.isArray(window.__ui.standingsTimes)', 20000);
      const rival = JSON.parse(await page.evaluate(`(() => {
        const ui = window.__ui;
        return JSON.stringify({
          /* Chase the record since MENUS-PLAN.md 1.6: the board's verb
           * for the same row. It said Race the record. */
          hasGhostRow: ui.items().some((i) => i.label === 'Chase the record'),
          tagged: document.querySelectorAll('.standings-ghost').length,
        });
      })()`));
      if (!rival.hasGhostRow) {
        failures.push('a track with a ghosted lap offers no way to race it');
      }
      if (!rival.tagged) {
        failures.push('the row carrying a ghost is not marked as carrying one');
      }
    }

    /*
     * THE PICKER'S HALF OF THE SAME ASK. The rooms open on the shared map
     * picker since 2026-10-19 (63b79c6), and its panels stand in for the
     * cards, which are drawn now only when the picker could not be fetched.
     * So the owner's properties are asked of the panels: every published
     * track has one, a press chooses it where it is with Fly this in sight,
     * a double click flies it, and two quick presses on two panels are two
     * choices and fly nothing. The keys are the picker's (picker.js, KEYS),
     * not this check's.
     */
    const pointer = (type, at, clickCount = 1) => page.cdp.send('Input.dispatchMouseEvent', {
      type, x: at.x, y: at.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount,
    }, page.sessionId);
    const press = async (at, clickCount) => {
      await pointer('mouseMoved', at);
      await pointer('mousePressed', at, clickCount);
      await pointer('mouseReleased', at, clickCount);
    };
    const raceLines = [];
    if (usePicker) {
      const toRoom = async () => {
        await page.evaluate(`(() => {
          const ui = window.__ui;
          ui.act('way-race-5inch');
          ui.show('courses');
          return 1;
        })()`);
        await page.until(`window.__ui.screen === 'courses' && document.querySelectorAll('.room-picker .wp-card').length >= ${TRACKS.length}`, 25000);
      };
      const boardKeys = async () => JSON.parse(await page.evaluate(`JSON.stringify([...document.querySelectorAll('.room-picker .wp-card')]
        .map((b) => b.dataset.key).filter((k) => k && k.startsWith('board:')))`));
      const panelAt = async (key) => JSON.parse(await page.evaluate(`(() => {
        const b = document.querySelector(${JSON.stringify('.room-picker .wp-card[data-key="KEY"]')}.replace('KEY', ${JSON.stringify(key)}));
        if (!b) { return 'null'; }
        b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const r = b.getBoundingClientRect();
        return JSON.stringify({ key: b.dataset.key, x: Math.round(r.left + (r.width / 2)), y: Math.round(r.top + (r.height / 3)) });
      })()`));
      const nameOf = (key) => (TRACKS.find((t) => `board:${t[0]}` === key) || [])[1] || key;
      const state = async () => JSON.parse(await page.evaluate(`JSON.stringify({
        screen: window.__ui.screen,
        subject: window.__ui.cardSubject,
        fetching: Boolean(window.__ui.openingBoardCourse) || Boolean(window.__ui.flyingCard),
      })`));
      await toRoom();
      let keys = await boardKeys();
      if (keys.length < TRACKS.length - 1) {
        failures.push(`the picker has ${keys.length} board panels for ${TRACKS.length} published tracks, one of them seated`);
      }
      if (keys.length < 3) {
        failures.push('fewer than three board panels, so the presses were not tried');
      } else {
        /* One press chooses it, under the pointer, with Fly this in sight. */
        const a = await panelAt(keys[0]);
        await press(a, 1);
        const one = JSON.parse(await page.evaluate(`(() => {
          const ui = window.__ui;
          const under = document.elementFromPoint(${a.x}, ${a.y});
          const card = under && under.closest('.wp-card');
          const fly = document.querySelector('.room-picker .wp-act.is-primary');
          const box = fly ? fly.getBoundingClientRect() : null;
          const top = ui.frameTop.getBoundingClientRect().bottom;
          const bot = ui.frameBot.getBoundingClientRect().top;
          return JSON.stringify({
            screen: ui.screen,
            subject: ui.cardSubject,
            under: card ? card.dataset.key : null,
            fly: fly ? fly.textContent : null,
            clear: Boolean(box) && box.top >= top && box.bottom <= bot && box.width > 0,
          });
        })()`));
        if (one.screen !== 'courses' || one.subject !== a.key) {
          failures.push(`one press on ${nameOf(a.key)} left "${one.screen}" with ${one.subject} chosen`);
        }
        if (one.under !== a.key) {
          failures.push(`after one press on ${nameOf(a.key)} the pointer is on ${one.under || 'no panel'}, so a second press lands elsewhere`);
        }
        if (one.fly !== 'Fly this' || !one.clear) {
          failures.push(`one press on ${nameOf(a.key)} left Fly this out of reach without a scroll: ${one.fly === null ? 'no button' : `"${one.fly}"`}, clear ${one.clear}`);
        }
        raceLines.push(`  one press     ${nameOf(a.key)}, chosen ${one.subject === a.key}, Fly this in sight ${one.clear}`);

        /* Two quick presses on two different panels, the second counted as
         * a double click, as Android counts two taps up to 100 dp apart. */
        const b = await panelAt(keys[1]);
        const c = await panelAt(keys[2]);
        await press(b, 1);
        await press(c, 2);
        const two = await state();
        if (two.fetching || two.screen !== 'courses') {
          failures.push(`a quick press on a second panel flew one of the two: the room is "${two.screen}", fetching ${two.fetching}`);
        }
        if (two.subject !== c.key) {
          failures.push(`after a quick press on a second panel ${two.subject} is chosen, not ${c.key}`);
        }
        raceLines.push(`  two panels    ${two.subject} chosen, ${two.fetching || two.screen !== 'courses' ? 'FLOWN' : 'nothing flown'}`);
        if (two.fetching || two.screen !== 'courses') {
          await page.until(`window.__ui.screen === 'flight' && window.__map().ready`, 90000).catch(() => {});
          await page.evaluate(`(() => { window.__ui.act('title'); return 1; })()`);
          await toRoom();
          keys = await boardKeys();
        }

        /* A double click on one panel flies it. */
        const d = await panelAt(keys[keys.length - 1]);
        await press(d, 1);
        await press(d, 2);
        let flew = null;
        try {
          await page.until(`window.__ui.screen === 'flight' && window.__map().ready && window.__map().id === 'custom' && window.__map().name === ${JSON.stringify(nameOf(d.key))}`, 90000);
          flew = nameOf(d.key);
        } catch (e) {
          const where = JSON.parse(await page.evaluate(`JSON.stringify({ screen: window.__ui.screen, map: window.__map().name })`));
          failures.push(`a double click on ${nameOf(d.key)} did not reach the starting blocks on it: the screen is "${where.screen}" on ${where.map}`);
        }
        raceLines.push(`  double click  ${flew ? `flying ${flew}` : 'did not fly'}`);
      }
    } else {
      /*
       * A TRACK IS CHOSEN WHERE IT IS AND A DOUBLE CLICK FLIES IT. The owner,
       * 2026-09-27: "i should be able to double click on a track to start
       * racing it, at the moment i click on it, then the page scrolls a bit
       * the i have to scroll down to fly the track".
       *
       * Pressed through the browser's own input, not ui.select(), because
       * what was wrong was where the page went when a real pointer pressed a
       * real card: the cursor's scroll took the page 822 px and parked Fly it
       * under the command bar, with a different card under the pointer for
       * the second press to land on. Measured at the foot of the page, which
       * is the hard case: choosing swaps the list under the strip for a
       * shorter one, and a shorter page there is taken off the scroll.
       *
       * The keys come first and stay in the room. From the keys the whole of
       * the chosen card's list comes into view, and its Fly it has to be
       * clear of both bars rather than behind one.
       *
       * The gate is answered the way a pilot answers it, both halves. The
       * setup above only set the mode, and the grid is reached off the title,
       * which is still the gate while the aircraft half is open: nothing may
       * fly from behind a question that has not been answered (flyIfLinked).
       */
      await page.evaluate(`(() => {
        const ui = window.__ui;
        ui.act('way-race-5inch');
        ui.show('courses');
        return 1;
      })()`);
      await page.until(`window.__ui.screen === 'courses' && (window.__ui.courseCards || []).length >= ${TRACKS.length}`, 25000);
      const keysChoose = JSON.parse(await page.evaluate(`(() => {
        const ui = window.__ui;
        const i = ui.items().findIndex((it) => it.course && it.course.kind === 'board');
        if (i < 0) { return JSON.stringify({ missing: true }); }
        ui.setCursor(i);
        return JSON.stringify({ name: ui.items()[i].label });
      })()`));
      let keysSeen = null;
      if (keysChoose.missing) {
        failures.push('no board track card in the Race room to choose from the keys');
      } else {
        await page.tap('Enter');
        await page.until('Boolean(window.__ui.cardSubject)', 5000);
        keysSeen = JSON.parse(await page.evaluate(`(() => {
          const ui = window.__ui;
          const row = ui.menuRows.find((r) => r.classList.contains('row') && r.textContent === 'Fly it');
          const box = row ? row.getBoundingClientRect() : null;
          const top = ui.frameTop.getBoundingClientRect();
          const bot = ui.frameBot.getBoundingClientRect();
          ui.syncPrimaryButton();
          const seen = {
            row: box ? { top: Math.round(box.top), bottom: Math.round(box.bottom) } : null,
            clear: Boolean(box) && box.top >= top.bottom && box.bottom <= bot.top,
            cursor: (ui.items()[ui.cursor] || {}).label || null,
            bar: ui.framePrimary.hidden ? null : ui.framePrimary.textContent,
            inSight: Boolean(row) && ui.rowInSight(row),
          };
          ui.back();
          seen.after = ui.screen;
          seen.subject = ui.cardSubject;
          return JSON.stringify(seen);
        })()`));
        if (!keysSeen.clear) {
          failures.push(`Enter on ${keysChoose.name} left its Fly it at ${JSON.stringify(keysSeen.row)}, not clear of the bars`);
        }
        if (keysSeen.cursor !== 'Fly it') {
          failures.push(`Enter on a track card put the cursor on "${keysSeen.cursor}" rather than Fly it`);
        }
        /*
         * FLY IT WITHOUT A SCROLL: the sheet's own row in sight, or the bar's
         * button while it is not. The bar used to carry Fly it whenever a card
         * was chosen, because the list was under every card; the sheet opens
         * under the chosen card's line, so the bar repeats it only when the
         * sheet is below the window (MENUS-PLAN.md 2.4 and 2.6). The owner's
         * ask of 2026-09-27 is the property: no scroll to fly.
         */
        if (!keysSeen.inSight && keysSeen.bar !== 'Fly it') {
          failures.push(`with ${keysChoose.name} chosen neither its Fly it row nor the command bar offers Fly it without a scroll (bar ${keysSeen.bar === null ? 'empty' : `"${keysSeen.bar}"`})`);
        }
        if (keysSeen.after !== 'courses' || keysSeen.subject) {
          failures.push(`Escape from a chosen track card left "${keysSeen.after}" with ${keysSeen.subject} chosen, not the track list`);
        }
      }


      /*
       * Two quick presses on two DIFFERENT cards are two choices and not a
       * double click, whatever the browser counts: Android counts two taps up
       * to 100 dp apart as one double tap, and two cards are 16 px apart.
       * Sent here as the browser reports them, the second with a count of
       * two. Read the moment the presses are handled, because flying starts
       * synchronously with the fetch it waits on: nothing may be fetching.
       */
      const pair = JSON.parse(await page.evaluate(`(() => {
        const ui = window.__ui;
        ui.screens.courses.scrollTop = 0;
        const at = (c) => {
          const r = c.card.getBoundingClientRect();
          return { key: c.key, x: Math.round(r.left + (r.width / 2)), y: Math.round(r.top + (r.height / 3)) };
        };
        const board = (ui.courseCards || []).filter((c) => c.kind === 'board');
        return JSON.stringify(board.length >= 2 ? { a: at(board[0]), b: at(board[1]) } : { missing: true });
      })()`));
      let after = null;
      if (pair.missing) {
        failures.push('fewer than two board track cards, so two quick presses were not tried');
      } else {
        await press(pair.a, 1);
        await press(pair.b, 2);
        after = JSON.parse(await page.evaluate(`(() => {
          const ui = window.__ui;
          const seen = {
            screen: ui.screen,
            subject: ui.cardSubject,
            fetching: Boolean(ui.openingBoardCourse) || Boolean(ui.flyingCard),
          };
          ui.back();
          return JSON.stringify(seen);
        })()`));
        if (after.fetching || after.screen !== 'courses') {
          failures.push(`a quick press on a second card flew one of the two: the room is "${after.screen}", fetching ${after.fetching}`);
        }
        if (after.subject !== pair.b.key) {
          failures.push(`after a quick press on a second card ${after.subject} is chosen, not ${pair.b.key}`);
        }
      }

      /* The pointer, at the foot of the page, in the middle of whatever is on
       * screen there of the last board card that shows a good part of itself.
       * A shorter page taken off the scroll moves everything by the rows the
       * list lost, so the scroll is what is compared, not only the card. */
      const aim = JSON.parse(await page.evaluate(`(() => {
        const ui = window.__ui;
        const scr = ui.screens.courses;
        scr.scrollTop = scr.scrollHeight;
        const top = ui.frameTop.getBoundingClientRect().bottom;
        const bot = ui.frameBot.getBoundingClientRect().top;
        let pick = null;
        for (const c of ui.courseCards || []) {
          const r = c.card.getBoundingClientRect();
          const from = Math.max(r.top, top);
          const to = Math.min(r.bottom, bot);
          if (c.kind === 'board' && to - from >= 60) {
            pick = { c, x: r.left + (r.width / 2), y: (from + to) / 2 };
          }
        }
        if (!pick) {
          const c = ui.courseCards.filter((x) => x.kind === 'board').pop();
          c.card.scrollIntoView({ block: 'end' });
          const r = c.card.getBoundingClientRect();
          pick = { c, x: r.left + (r.width / 2), y: r.top + (r.height / 2) };
        }
        return JSON.stringify({
          key: pick.c.key,
          name: pick.c.card.querySelector('.map-card-name').textContent,
          x: Math.round(pick.x),
          y: Math.round(pick.y),
          scrollTop: Math.round(scr.scrollTop),
          atFoot: Math.abs(scr.scrollTop - (scr.scrollHeight - scr.clientHeight)) < 1,
        });
      })()`));
      await press(aim, 1);
      await page.until('Boolean(window.__ui.cardSubject)', 5000);
      const chose = JSON.parse(await page.evaluate(`(() => {
        const ui = window.__ui;
        const under = document.elementFromPoint(${aim.x}, ${aim.y});
        const card = under && under.closest('.course-card');
        ui.syncPrimaryButton();
        const fly = (ui.menuRows || []).find((r) => r.classList.contains('row') && r.textContent === 'Fly it');
        return JSON.stringify({
          scrollTop: Math.round(ui.screens.courses.scrollTop),
          under: card ? card.querySelector('.map-card-name').textContent : null,
          subject: ui.cardSubject,
          screen: ui.screen,
          bar: ui.framePrimary.hidden ? null : ui.framePrimary.textContent,
          inSight: Boolean(fly) && ui.rowInSight(fly),
        });
      })()`));
      if (chose.screen !== 'courses' || chose.subject !== aim.key) {
        failures.push(`one click on ${aim.name} left "${chose.screen}" with ${chose.subject} chosen`);
      }
      if (Math.abs(chose.scrollTop - aim.scrollTop) > 1) {
        failures.push(`one click on ${aim.name} moved the page from ${aim.scrollTop} to ${chose.scrollTop} px`);
      }
      if (chose.under !== aim.name) {
        failures.push(`after one click on ${aim.name} the pointer is on ${chose.under || 'no card'}, so a second press lands elsewhere`);
      }
      /* Fly it without a scroll, as above: at the foot of the page the sheet
       * opens below the window, so this is the bar's case. */
      if (!chose.inSight && chose.bar !== 'Fly it') {
        failures.push(`one click on ${aim.name} left Fly it out of reach without a scroll: not in sight, and the bar ${chose.bar === null ? 'empty' : `says "${chose.bar}"`}`);
      }
      /* The second press of the double click, as the browser counts it. */
      await press(aim, 2);
      let flewTo = null;
      try {
        await page.until(`window.__ui.screen === 'flight' && window.__map().ready && window.__map().id === 'custom' && window.__map().name === ${JSON.stringify(aim.name)}`, 90000);
        flewTo = aim.name;
      } catch (e) {
        const where = JSON.parse(await page.evaluate(`JSON.stringify({ screen: window.__ui.screen, map: window.__map().name })`));
        failures.push(`a double click on ${aim.name} did not reach the starting blocks on it: the screen is "${where.screen}" on ${where.map}`);
      }
    }
    await page.evaluate(`(() => { window.__ui.act('title'); return 1; })()`);

    /*
     * THE FREESTYLE ROOM LISTS THE BOARD'S MAPS, the owner's ask of
     * 2026-09-26: "the top 10 available freestyle maps like with the race
     * tracks". Ten, newest first, because a map has no times to rank by
     * (pickNewestMaps in src/share/board.js), after the two worlds that are
     * always there and before every row.
     */
    const want = PUBLISHED_MAPS.slice().reverse().slice(0, MAPS_SHOWN);
    await page.evaluate(`(() => {
      const ui = window.__ui;
      ui.act('title');
      /* Answered the way a pilot answers it, so the title a choice lands
       * on is the freestyle menu, with its Map row, and not the gate. With
       * no freestyle world remembered it opens the room. */
      ui.act('way-freestyle-5inch');
      if (ui.screen !== 'freestyle') {
        ui.show('freestyle');
      }
      return 1;
    })()`);
    await page.until('!window.__ui.boardMapsLoading && (window.__ui.boardMaps || []).length > 0', 25000);
    const fsRoom = JSON.parse(await page.evaluate(`(() => {
      const ui = window.__ui;
      const items = ui.items();
      const kinds = items.map((i) => (i.map || i.boardMap ? 'card' : 'row'));
      return JSON.stringify({
        listed: ui.boardMaps.map((m) => m.id),
        cards: ${usePicker
          ? `document.querySelectorAll('.room-picker .wp-card[data-key^="boardmap:"]').length`
          : `document.querySelectorAll('.screen-freestyle .board-map-card').length`},
        worlds: items.filter((i) => i.map).map((i) => i.map.id),
        cardsFirst: kinds.lastIndexOf('card') < kinds.indexOf('row'),
        note: String(ui.boardMapNote.textContent || ''),
      });
    })()`));
    if (fsRoom.listed.join() !== want.map((m) => m.id).join()) {
      failures.push(`the Freestyle room lists ${fsRoom.listed.join(', ')} where the ${MAPS_SHOWN} newest are ${want.map((m) => m.id).join(', ')}`);
    }
    /* The picker has every map on the board in its pilots' half, where the
     * old strip had the ten newest. */
    const panelsWanted = usePicker ? PUBLISHED_MAPS.length : want.length;
    if (fsRoom.cards !== panelsWanted) {
      failures.push(`the Freestyle room drew ${fsRoom.cards} board map ${usePicker ? 'panels' : 'cards'} for ${panelsWanted} maps`);
    }
    if (!fsRoom.worlds.includes('city') || !fsRoom.worlds.includes('built')) {
      failures.push(`the Freestyle room lost a world card beside the board's maps: ${fsRoom.worlds.join(', ')}`);
    }
    if (!fsRoom.cardsFirst) {
      failures.push('a board map card is listed after a row, so the rows no longer follow the cards');
    }
    if (fsRoom.note) {
      failures.push(`the Freestyle room says "${fsRoom.note}" over a board that answered`);
    }

    /* Choosing one flies it in the built world, under its own name, and
     * choosing Your map afterwards flies the pilot's own again: two
     * documents in one world, which the swap has to tell apart. */
    const pick = want[1];
    await page.evaluate(`(() => { window.__ui.act(${JSON.stringify(`boardmap:${pick.id}`)}); return 1; })()`);
    let flown = null;
    try {
      await page.until(`window.__map().ready && window.__map().id === 'built' && window.__map().name === ${JSON.stringify(pick.name)}`, 90000);
      flown = JSON.parse(await page.evaluate(`JSON.stringify({
        shared: window.__ui.sharedMap && window.__ui.sharedMap.id,
        map: (window.__ui.items().find((i) => i.label === 'Map') || {}).value || null,
      })`));
    } catch (e) {
      failures.push(`choosing ${pick.name} in the Freestyle room did not build it: ${e.message || e}`);
    }
    if (flown && flown.shared !== pick.id) {
      failures.push(`${pick.name} was built but the shell holds ${flown.shared} as the map it flies`);
    }
    /* And the title names it, rather than calling somebody else's map
     * Your map. */
    if (flown && flown.map !== pick.name) {
      failures.push(`${pick.name} is flying and the title's Map row says "${flown.map}"`);
    }
    let own = null;
    if (flown) {
      await page.evaluate(`(() => {
        const ui = window.__ui;
        ui.show('freestyle');
        ui.act('map:built');
        return 1;
      })()`);
      try {
        await page.until(`window.__map().ready && window.__map().id === 'built' && window.__map().name !== ${JSON.stringify(pick.name)}`, 90000);
        own = JSON.parse(await page.evaluate(`JSON.stringify({
          name: window.__map().name,
          shared: window.__ui.sharedMap,
        })`));
      } catch (e) {
        failures.push(`choosing Your map after ${pick.name} did not rebuild the pilot's own map: ${e.message || e}`);
      }
      if (own && own.shared) {
        failures.push('Your map was chosen and the shell still holds a map from the board');
      }
    }

    console.log(`  Race room     ${room.listed} tracks listed, ${room.cards} cards drawn`);
    console.log(`  strip labels  ${room.stripLabels.join(', ') || '(none)'}`);
    console.log(`  rows          ${room.rows.join(', ')}`);
    for (const line of raceLines) {
      console.log(line);
    }
    console.log(`  Freestyle     ${fsRoom.listed.length} of ${PUBLISHED_MAPS.length} maps listed, ${fsRoom.cards} cards drawn`);
    console.log(`  chose         ${flown ? `${pick.name}, Map row "${flown.map}"` : 'nothing built'}`);
    console.log(`  then Your map ${own ? own.name : 'not rebuilt'}`);
  } finally {
    if (page) {
      await page.close();
    }
    proc.kill();
    await rm(dir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.log(`\nFAIL, ${failures.length} problem(s):`);
    for (const f of failures) {
      console.log(`  ${f}`);
    }
    return 1;
  }
  console.log('\nPASS, every track is listed, a track is chosen where it is and a double click flies it, the ten newest maps are listed, and the board is a screen in the game');
  return 0;
}

process.exit(await main());
