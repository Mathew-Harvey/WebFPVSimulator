/*
 * boot-check.js: the boot path's network shape, and the board's deadlines.
 *
 * WHY THIS EXISTS.
 *
 * DEPLOY.md says the free board sleeps after fifteen minutes and takes about
 * a minute to wake, and then says "The simulator is unaffected, because a
 * static site does not sleep". That sentence was true when it was written
 * and the code stopped it being true: main.js awaited two board round trips
 * before it asked for dist/sim.wasm, and the fetch behind them had no
 * deadline at all. Measured on a warm local board, the wasm request left the
 * browser at 1519 ms, after both. On a sleeping one it would not have left
 * for a minute, and the loading screen would have blamed the renderer.
 *
 * Nothing could catch that, because it is not a wrong value anywhere: it is
 * the ORDER of two correct calls, and the ABSENCE of a timeout. So this
 * check reads the module's own source for the shape rather than its output,
 * and drives the real functions against a server that never answers to prove
 * the deadline is enforced rather than merely written down.
 *
 * A source read is a weak test and this file knows it. It is here because
 * the alternative was no test: the strong version needs a browser, and the
 * two things being asserted are exactly the two that survive a browser check
 * passing.
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

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rows = [];
let failed = 0;

function check(name, ok, detail) {
  rows.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) {
    failed += 1;
  }
}

const mainSrc = await readFile(join(root, 'src/main.js'), 'utf8');
const boardSrc = await readFile(join(root, 'src/share/board.js'), 'utf8');
const bootSrc = await readFile(join(root, 'src/boot.js'), 'utf8');
const loadingSrc = await readFile(join(root, 'src/ui/loading.js'), 'utf8');

/*
 * 1. THE WASM IS ASKED FOR BEFORE THE BOARD IS.
 *
 * Position in the file is position in the await chain here, because boot()
 * is one straight line of awaits from the top. The wasm fetch has to be
 * started above the first board call, not merely started somewhere.
 */
{
  const simFetch = mainSrc.indexOf('const simBytes = fetchBytes(WASM_URL');
  const shareAdopt = mainSrc.indexOf('await adoptShareFromLocation()');
  const flownAdopt = mainSrc.indexOf('await adoptMostFlownTrack()');
  check(
    'the flight controller is requested before the board',
    simFetch > 0 && shareAdopt > simFetch && flownAdopt > simFetch,
    simFetch < 0
      ? 'no concurrent simBytes fetch found in boot'
      : `wasm at ${simFetch}, share adopt at ${shareAdopt}, most flown at ${flownAdopt}`,
  );
}

/*
 * 2. THE SIM STAGE IS NOT ANNOUNCED WHILE THE BOARD IS THE THING BEING
 *    WAITED FOR.
 *
 * loading.progress(id) starts a stage if it is not the current one, so an
 * ungated progress callback on a fetch that overlaps the board would put
 * "Flight controller" on screen while the board was the holdup. That is the
 * same dishonesty the fix exists to remove.
 */
{
  const gated = /if \(simStageLive\) \{\s*\n\s*loading\.progress\('sim'/.test(mainSrc);
  check(
    'the sim stage is not announced early',
    gated && mainSrc.includes('simStageLive = true;'),
    gated ? 'progress is gated on the stage being live' : 'the progress callback is ungated, so it steals the stage',
  );
}

/*
 * 3. THE BOARD WAIT HAS A NAME ON THE LOADING SCREEN.
 *
 * A network wait on a service that sleeps must not be reported as one of the
 * stages either side of it.
 */
{
  check(
    'the board wait is a named loading stage',
    loadingSrc.includes("board: 'Board'") && bootSrc.includes("'three', 'board', 'sim'") && mainSrc.includes("loading.start('board')"),
    'stage named in loading.js, planned in boot.js, started in main.js',
  );
}

/*
 * 4. EVERY BOARD READ GOES THROUGH THE DEADLINE, AND NO WRITE DOES.
 *
 * Abandoning a publish or a posted lap time after eight seconds does not
 * undo it at the far end, so a pilot would be told it failed while the board
 * stored it. Reads are the opposite: a read that times out is the same event
 * as a board that is down, which every caller already handles.
 */
{
  const plainFetches = [...boardSrc.matchAll(/await fetch\(([^\n]*)/g)].map((m) => m[1].trim());
  const readsOutsideHelper = plainFetches.filter((line) => !line.includes('{ signal: readSignal(ms) }'));
  const writes = readsOutsideHelper.filter((line) => line.includes('{'));
  check(
    'every board read carries a deadline',
    readsOutsideHelper.length === writes.length,
    `${plainFetches.length} raw fetches: ${writes.length} are writes with a method, the rest go through boardGet`,
  );
  check(
    'writes are deliberately not deadlined',
    writes.length > 0,
    `${writes.length} write(s) left without one, on purpose`,
  );
}

/*
 * 5. THE DEADLINE IS REAL.
 *
 * The strongest assertion in this file, because it does not read the source:
 * it starts a server that accepts the connection and then says nothing at
 * all, which is exactly what a sleeping Render service does, and calls the
 * real function.
 */
{
  const hung = [];
  const server = createServer((req, res) => {
    /* Accept, hold, never answer. res is kept so the socket stays open. */
    hung.push(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  /* The module reads window.location for its default origin, so it is given
   * one; the origin under test is passed explicitly. */
  global.window = { location: { hostname: '127.0.0.1', search: '', href: origin }, localStorage: null };
  const { fetchTrackDocument, BOARD_READ_TIMEOUT_MS } = await import('../src/share/board.js');
  const t0 = Date.now();
  let message = '';
  let timedOut = false;
  /*
   * This check races the call against a deadline of its own, and that is not
   * belt and braces: without it, a build that has LOST the timeout does not
   * fail this check, it hangs it forever, because that is precisely the
   * defect being tested for. A test that hangs on the regression it exists
   * to catch is not a test. Found by removing the timeout and watching this
   * file wait.
   */
  const GRACE_MS = BOARD_READ_TIMEOUT_MS + 4000;
  const outcome = await Promise.race([
    fetchTrackDocument('trk-00000000', origin).then(
      () => ({ kind: 'returned' }),
      (e) => ({ kind: 'threw', e }),
    ),
    new Promise((r) => {
      const t = setTimeout(() => r({ kind: 'hung' }), GRACE_MS);
      if (typeof t.unref === 'function') {
        t.unref();
      }
    }),
  ]);
  if (outcome.kind === 'threw') {
    timedOut = Boolean(outcome.e && outcome.e.timeout);
    message = outcome.e && outcome.e.message ? outcome.e.message : String(outcome.e);
  } else if (outcome.kind === 'hung') {
    message = `still waiting after ${GRACE_MS} ms, so the read has no deadline`;
  } else {
    message = 'the call returned, which a server that never answers cannot cause';
  }
  const took = Date.now() - t0;
  check(
    'a board that never answers is abandoned, not waited on',
    timedOut && took < BOARD_READ_TIMEOUT_MS + 2000,
    timedOut
      ? `gave up after ${took} ms with "${message}"`
      : `did not time out after ${took} ms: ${message || 'it returned'}`,
  );
  check(
    'the timeout says the board, not DOMException',
    /board/i.test(message),
    `"${message}"`,
  );
  for (const res of hung) {
    res.destroy();
  }
  server.close();
  /* A fetch abandoned by the race above holds a socket open, and node will
   * not exit while it does. The explicit process.exit at the foot of this
   * file ends the run either way; this stops a failing run printing its
   * table and then appearing to hang. */
  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
}

/*
 * 6. A THROWN FRAME IS CAUGHT.
 *
 * The loop schedules the next frame first so a slow frame does not stop it,
 * which also meant a throwing frame did not stop it: the picture froze, the
 * console filled with one identical error a frame, and the pilot was told
 * nothing.
 */
{
  const wrapped = /function frame\(nowWall\) \{\s*\n\s*requestAnimationFrame\(frame\);\s*\n\s*try \{\s*\n\s*frameBody\(nowWall\);/.test(mainSrc);
  check(
    'a thrown frame is caught and reported',
    wrapped && mainSrc.includes('window.__frameFault'),
    wrapped ? 'frameBody runs inside a try, and the fault reaches the bug report' : 'the frame body is not wrapped',
  );
}

/*
 * 7. THE DEAD ENTRY POINT IS GONE.
 *
 * main.js used to end with boot() called with no argument, which threw on
 * every load and appended a failure banner that was wiped a microtask later
 * by Ui.build. It was invisible by accident, not by design.
 */
{
  const stray = /\nboot\(\)\.catch\(/.test(mainSrc);
  check(
    'main.js has no second entry point',
    !stray,
    stray ? 'boot() is still called at module scope and still throws' : 'boot.js owns the entry',
  );
}

const w = Math.max(...rows.map((r) => r[0].length));
console.log('boot-check: the order of the boot fetches, and the board\'s deadlines\n');
for (const [name, status, detail] of rows) {
  console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} checks clean`);
process.exit(failed === 0 ? 0 : 1);
