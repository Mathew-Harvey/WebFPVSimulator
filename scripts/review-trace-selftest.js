#!/usr/bin/env node
/*
 * review-trace-selftest.js: src/review/trace.js, driven in Node with no
 * browser.
 *
 * The recorder is fed the way the shell feeds it: a clock that advances a
 * millisecond at a time, a sample on every tenth, a race that says when a
 * lap began and when it finished. Every number in a sample is made from the
 * clock, so a sample that landed in the wrong place or the wrong field says
 * so.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  F, TRACE_CAPACITY, TRACE_LEAD_MS, TRACE_RATE_HZ, TRACE_STEP_MS, TRACE_TAIL_MS, TraceBook, TraceRecorder,
} from '../src/review/trace.js';

let failures = 0;

function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

/* A state block and sticks made from the clock, each field its own multiple
 * so no two can be mistaken for each other. */
function stateAt(ms) {
  const st = new Float64Array(20);
  st[0] = ms / 1000;
  for (let k = 1; k < 20; k += 1) {
    st[k] = ms * 1e-4 * k;
  }
  return st;
}

const rcAt = (ms) => ({ roll: Math.sin(ms / 300), pitch: Math.cos(ms / 500), yaw: Math.sin(ms / 700), throttle: (ms % 1000) / 1000 });

/* Run the clock from just after `from` to `to`, a millisecond a step, the
 * way the shell does, with `events` fired at their own times. */
function fly(rec, from, to, events = {}) {
  for (let ms = from + 1; ms <= to; ms += 1) {
    if (events[ms]) {
      events[ms]();
    }
    if (ms % TRACE_STEP_MS === 0) {
      rec.push(ms, ms * 0.001, ms * 0.002, ms * 0.003, 0.1, 0.2, 0.3, 0.9, stateAt(ms), rcAt(ms));
    }
  }
}

console.log('off');
{
  const rec = new TraceRecorder();
  fly(rec, 0, 2000);
  check('holds no memory', rec.ms === null && rec.buf === null);
  check('makes no lap', rec.cut(100, 500, [500], {}) === false && rec.takeDone() === null);
}

console.log('one lap');
{
  const START = 1234.5;
  const DUR = 5000.25;
  const rec = new TraceRecorder();
  rec.setEnabled(true);
  let promised = null;
  fly(rec, 0, 6240, {
    1240: () => rec.lapBegan(START),
    6240: () => { promised = rec.cut(START, DUR, [1500.5, 3200, DUR], { course: 'test-room' }, 0.2915); },
  });
  check('a lap is promised at the line', promised === true);
  check('and is not made before its tail is flown', rec.takeDone() === null);
  fly(rec, 6240, 6440);
  const done = rec.takeDone();
  check('it is made once the tail is in', Array.isArray(done) && done.length === 1);
  const first = done && done[0];
  if (first) {
    check('rate and duration', first.rateHz === TRACE_RATE_HZ && first.durationMs === DUR);
    check('half a second of lead in', first.lead === TRACE_LEAD_MS / TRACE_STEP_MS, `${first.lead}`);
    check('the first sample is the first step inside the lead', near(first.at(0, F.T), 740 - START), `${first.at(0, F.T)}`);
    const last = first.count - 1;
    check('the last sample is the last step inside the tail', near(first.at(last, F.T), 6430 - START), `${first.at(last, F.T)}`);
    check('the tail runs past the finish', first.at(last, F.T) > DUR && first.at(last, F.T) <= DUR + TRACE_TAIL_MS);
    let even = true;
    for (let i = 1; i < first.count; i += 1) {
      even = even && near(first.at(i, F.T) - first.at(i - 1, F.T), TRACE_STEP_MS, 1e-2);
    }
    check('samples sit ten milliseconds apart', even);
    const i = first.lead + 100;
    const ms = Math.round(first.at(i, F.T) + START);
    const st = stateAt(ms);
    const rc = rcAt(ms);
    check('position is the scene pose pushed', near(first.at(i, F.PX), ms * 0.001) && near(first.at(i, F.PY), ms * 0.002) && near(first.at(i, F.PZ), ms * 0.003));
    check('attitude', near(first.at(i, F.QX), 0.1) && near(first.at(i, F.QW), 0.9));
    check('velocity is state 4 to 6', near(first.at(i, F.VX), st[4]) && near(first.at(i, F.VZ), st[6]));
    check('body rates are state 11 to 13', near(first.at(i, F.P), st[11]) && near(first.at(i, F.R), st[13]));
    check('the four sticks', near(first.at(i, F.ROLL), rc.roll) && near(first.at(i, F.PITCH), rc.pitch) && near(first.at(i, F.YAW), rc.yaw) && near(first.at(i, F.THROTTLE), rc.throttle));
    check('rotors, volts and amps', near(first.at(i, F.RPM0), st[14]) && near(first.at(i, F.RPM3), st[17]) && near(first.at(i, F.VOLTS), st[18]) && near(first.at(i, F.AMPS), st[19]));
    check('splits, meta and world scale carried', first.splits.length === 3 && first.splits[0] === 1500.5 && first.meta.course === 'test-room' && near(first.worldScale, 0.2915));
    const s = first.summary();
    check('a summary a person can read', s.topSpeed > 0 && s.meanThrottle > 0.3 && s.meanThrottle < 0.7 && s.course === 'test-room');
  }
}

console.log('laps back to back');
{
  const rec = new TraceRecorder();
  rec.setEnabled(true);
  const a = 1000;
  const b = 4000;
  const c = 7300;
  fly(rec, 0, 9000, {
    1005: () => rec.lapBegan(a),
    4003: () => { rec.cut(a, b - a, [b - a], {}); rec.lapBegan(b); },
    7308: () => { rec.cut(b, c - b, [c - b], {}); rec.lapBegan(c); },
  });
  const done = rec.takeDone() || [];
  check('both laps made', done.length === 2, `${done.length}`);
  if (done.length === 2) {
    check('the second keeps its own lead in, flown as the first one finished', done[1].lead === TRACE_LEAD_MS / TRACE_STEP_MS, `${done[1].lead}`);
    check('each has its own duration', done[0].durationMs === 3000 && done[1].durationMs === 3300);
    check('the first has its tail, flown as the second began', done[0].at(done[0].count - 1, F.T) >= 3000 + TRACE_TAIL_MS - TRACE_STEP_MS);
  }
  check('memory is let go between laps', rec.count < 400, `${rec.count} samples held`);
}

console.log('memory');
{
  const rec = new TraceRecorder();
  rec.setEnabled(true);
  const startSize = rec.ms.length;
  check('starts at a minute of flight, not ten', startSize * TRACE_STEP_MS === 60_000, `${startSize}`);
  fly(rec, 0, 30000);
  check('with no lap running it keeps a few seconds and does not grow', rec.count <= 400 && rec.ms.length === startSize, `${rec.count} held, ${rec.ms.length} room`);

  const long = new TraceRecorder();
  long.setEnabled(true);
  const START = 1000;
  const DUR = 150_000;
  fly(long, 0, START + DUR, { [START]: () => long.lapBegan(START) });
  check('a lap longer than a minute grows the buffer', long.ms.length > startSize && long.ms.length <= TRACE_CAPACITY, `${long.ms.length}`);
  long.cut(START, DUR, [DUR], {});
  fly(long, START + DUR, START + DUR + 400);
  const lap = (long.takeDone() || [])[0];
  check('and the lap comes out whole', Boolean(lap) && lap.count === (DUR + TRACE_LEAD_MS + TRACE_TAIL_MS) / TRACE_STEP_MS + 1, lap ? `${lap.count}` : 'none');
  let same = Boolean(lap);
  for (let i = 0; same && i < lap.count; i += 997) {
    const ms = Math.round(lap.at(i, F.T) + START);
    same = near(lap.at(i, F.PX), ms * 0.001) && near(lap.at(i, F.VX), stateAt(ms)[4]);
  }
  check('with every sample where it was pushed across the growth', same);
}

console.log('the awkward cases');
{
  const rec2 = new TraceRecorder();
  rec2.setEnabled(true);
  fly(rec2, 0, 3000, { 1000: () => rec2.lapBegan(1000), 2000: () => rec2.markCut() });
  rec2.cut(1000, 1990, [1990], {});
  rec2.flush();
  const cutLap = (rec2.takeDone() || [])[0];
  check('flush makes the lap with the tail it has', Boolean(cutLap) && cutLap.count > 100);
  check('a teleport is marked at the sample after it', Boolean(cutLap) && cutLap.cuts.length === 1 && near(cutLap.cuts[0], 1000), cutLap ? `${cutLap.cuts}` : '');

  const rec3 = new TraceRecorder();
  rec3.setEnabled(true);
  fly(rec3, 0, 5000, { 1000: () => rec3.lapBegan(1000) });
  fly(rec3, 0, 500);
  check('a clock that goes back empties it', rec3.count === 50 && rec3.lapStartMs === null, `${rec3.count}`);
  check('and the lap that was running is not made', rec3.cut(1000, 3000, [3000], {}) === false);

  const rec4 = new TraceRecorder();
  rec4.setEnabled(true);
  fly(rec4, 0, 700000, { 1000: () => rec4.lapBegan(1000) });
  check('a lap longer than ten minutes is dropped, not kept growing', rec4.ms.length === TRACE_CAPACITY && rec4.count < TRACE_CAPACITY && rec4.cut(1000, 650000, [650000], {}) === false);

  const rec5 = new TraceRecorder();
  rec5.setEnabled(true);
  fly(rec5, 0, 1000);
  rec5.setEnabled(false);
  check('turning it off lets the memory go', rec5.buf === null && rec5.takeDone() === null);
}

console.log('the book');
{
  const book = new TraceBook();
  const lapOf = (durationMs) => ({ durationMs });
  check('the first lap is the best', book.keep('k', lapOf(9000)).best === true);
  check('a slower lap is the previous and not the best', book.keep('k', lapOf(9500)).best === false && book.best('k').durationMs === 9000 && book.previous('k').durationMs === 9500);
  check('a faster lap takes the best', book.keep('k', lapOf(8000)).best === true && book.best('k').durationMs === 8000);
  check('another course has nothing', book.best('other') === null && book.previous('other') === null);
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
