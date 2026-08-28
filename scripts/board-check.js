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
    console.log(`board check: ${TRACKS.length} tracks published, a ghosted lap on ${ghostTrack}\n`);

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

    const room = JSON.parse(await page.evaluate(`(() => {
      const ui = window.__ui;
      const items = ui.items();
      return JSON.stringify({
        listed: items.filter((i) => i.course).length,
        boardTracks: ui.boardCourses.length,
        note: String(ui.boardNote.textContent || ''),
        rows: items.filter((i) => !i.course).map((i) => i.label),
        cards: document.querySelectorAll('.screen-courses .course-card').length,
        stripLabels: [...document.querySelectorAll('.screen-courses .strip-label')].map((n) => n.textContent),
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
    if (!room.rows.includes('Standings')) {
      failures.push('the Race room has no Standings row');
    }
    if (room.rows.includes('Open the board')) {
      failures.push('the Race room still offers "Open the board", which means nothing to a new player');
    }

    /* Standings, in game, for the seated track. */
    const opened = JSON.parse(await page.evaluate(`(() => {
      const ui = window.__ui;
      const i = ui.items().findIndex((it) => it.id === 'courses:a-standings');
      if (i < 0) { return JSON.stringify({ missing: true }); }
      ui.setCursor(i);
      ui.select();
      return JSON.stringify({ screen: ui.screen });
    })()`));
    if (opened.missing) {
      failures.push('the Standings row was not found, so nothing was exercised');
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
          hasGhostRow: ui.items().some((i) => i.label === 'Race the record'),
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

    console.log(`  Race room     ${room.listed} tracks listed, ${room.cards} cards drawn`);
    console.log(`  strip labels  ${room.stripLabels.join(', ') || '(none)'}`);
    console.log(`  rows          ${room.rows.join(', ')}`);
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
  console.log('\nPASS, every track is listed and the board is a screen in the game');
  return 0;
}

process.exit(await main());
