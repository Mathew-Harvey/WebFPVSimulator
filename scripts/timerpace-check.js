/*
 * timerpace-check.js: the timer loop's cadence against a modelled display.
 *
 * Runs src/render/timerpace.js, and the formula it replaced, against a
 * display that refreshes every P ms and shows, at each refresh, the newest
 * frame finished before its deadline. Reports, for each case, how many
 * refreshes advanced the picture by an uneven amount (judder: the advance
 * more than a quarter of a refresh off P) and, for a canvas presented off
 * vsync, how far each tear line wanders between refreshes.
 *
 * The case that fails on the base is the pilot's of 2026-11-15 (Low on an
 * ordinary desktop GPU, 60 Hz): the old timer drew every 14.7 ms and juddered
 * about eight times a second; the paced timer must not judder at all. Node
 * only, no browser, a second or so.
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

import { paceDelay, drawsPerRefresh, createRafPeriod } from '../src/render/timerpace.js';

const P60 = 1000 / 60;

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!cond) failures += 1;
  return Boolean(cond);
}

/* The formula main.js's timerDelay used before this change, kept here only
 * as the base the check is measured against. */
function oldDelay(periodMs, gpuMs) {
  const d = periodMs - gpuMs;
  if (d >= 4) return d;
  return gpuMs >= periodMs ? periodMs : 4;
}

/* A deterministic lateness for a timeout, 0.1 to 0.6 ms, as a chained
 * setTimeout on an idle page measured in this container (bug-5dfce5a7). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/*
 * One run. `paced` picks the new pacing or the old formula. `deadlineMs` is
 * how long before the refresh the compositor takes its frame. Returns the
 * judder share over the steady refreshes, the draws per second, the mean
 * age of the picture at each refresh, and the tear rows' spread for a
 * canvas presented the moment it finishes.
 */
function run({ periodMs, gpuMs, paced, deadlineMs = 0, phaseMs = 3.3, refreshes = 2400 }) {
  const rnd = lcg(12345);
  const cpuMs = 1;
  const endMs = phaseMs + refreshes * periodMs;
  const frames = []; /* [contentTime, finishTime] */
  let t = 0;
  let gpuFree = 0;
  while (t < endMs) {
    /* The GPU is a queue behind the main thread, as WebGL's is: a frame
     * starts when it is submitted or when the one before it is done. The
     * guard (gpugate.js) holds a draw only when more than two display
     * frames of work are pending. */
    if (gpuFree - t <= 2 * P60) {
      const finish = Math.max(t + cpuMs, gpuFree) + gpuMs;
      frames.push([t, finish]);
      gpuFree = finish;
    }
    const vs = phaseMs + Math.floor((t - phaseMs) / periodMs) * periodMs;
    const lastVsync = vs >= 0 ? vs : -1;
    const d = paced ? paceDelay(t, lastVsync, periodMs, gpuMs) : oldDelay(periodMs, gpuMs);
    t += d + 0.1 + 0.5 * rnd();
  }
  let fi = 0;
  let prev = null;
  let judder = 0;
  let counted = 0;
  let ageSum = 0;
  let ageN = 0;
  for (let k = 1; k <= refreshes; k += 1) {
    const v = phaseMs + k * periodMs;
    while (fi + 1 < frames.length && frames[fi + 1][1] <= v - deadlineMs) fi += 1;
    if (frames[fi][1] > v - deadlineMs) continue;
    const c = frames[fi][0];
    if (k > 200) {
      if (prev !== null) {
        counted += 1;
        if (Math.abs(c - prev - periodMs) > 0.25 * periodMs) judder += 1;
      }
      ageSum += v - c;
      ageN += 1;
    }
    prev = c;
  }
  /* Off vsync: each present tears at the row the scan has reached when it
   * finishes. The spread is the widest gap between successive tears' rows
   * in the steady part, as a share of the screen's height, taken per draw
   * slot: two draws a refresh tear at two rows, and what matters is that
   * each stays put. */
  const slot = periodMs / (paced ? drawsPerRefresh(periodMs, gpuMs) : 1);
  const rows = frames.filter((f) => f[1] > phaseMs + 200 * periodMs).map((f) => ((f[1] - phaseMs) % slot) / periodMs);
  let lo = 1;
  let hi = 0;
  for (const r of rows) {
    lo = Math.min(lo, r);
    hi = Math.max(hi, r);
  }
  const seconds = (endMs - 200 * periodMs) / 1000;
  return {
    judder: counted ? judder / counted : 1,
    perSecond: Math.round((judder / seconds) * 10) / 10,
    fps: Math.round(rows.length / seconds),
    ageMs: Math.round((ageSum / ageN) * 10) / 10,
    tearSpread: Math.round((hi - lo) * 100) / 100,
  };
}

console.log('timerpace-check: the timer loop against a modelled display');

/* 1. The pilot's case: 60 Hz, Low on a desktop card, the GPU at 2 ms. */
{
  const base = run({ periodMs: P60, gpuMs: 2, paced: false });
  const now = run({ periodMs: P60, gpuMs: 2, paced: true });
  console.log(`  60 Hz, GPU 2 ms   old: ${base.fps} fps, judder ${base.perSecond}/s, age ${base.ageMs} ms, tear spread ${base.tearSpread}`);
  console.log(`                    new: ${now.fps} fps, judder ${now.perSecond}/s, age ${now.ageMs} ms, tear spread ${now.tearSpread}`);
  check('the old formula judders on the pilot\'s case (the base fails)', base.perSecond >= 4, `${base.perSecond} a second`);
  check('the paced timer does not judder', now.judder === 0, `${now.perSecond} a second`);
  check('the paced timer draws twice a refresh', Math.abs(now.fps - 120) <= 2, `${now.fps} fps`);
  check('the picture is no older than the old timer\'s on average', now.ageMs <= base.ageMs + 0.5, `${now.ageMs} against ${base.ageMs} ms`);
  check('off vsync, the tear line holds its place', now.tearSpread <= 0.1 && base.tearSpread >= 0.5, `${now.tearSpread} against ${base.tearSpread}`);
}

/* 2. The owner's laptop, 2026-09-28: Iris Xe, 60 Hz, the GPU at 7.8 ms,
 * where the timer earned its place at 125 fps. Its freshness must hold. */
{
  const base = run({ periodMs: P60, gpuMs: 7.8, paced: false });
  const now = run({ periodMs: P60, gpuMs: 7.8, paced: true });
  console.log(`  60 Hz, GPU 7.8 ms old: ${base.fps} fps, judder ${base.perSecond}/s, age ${base.ageMs} ms`);
  console.log(`                    new: ${now.fps} fps, judder ${now.perSecond}/s, age ${now.ageMs} ms`);
  check('the owner\'s laptop keeps two draws a refresh', drawsPerRefresh(P60, 7.8) === 2);
  check('the owner\'s laptop does not judder', now.judder === 0, `${now.perSecond} a second`);
  check('the owner\'s laptop\'s picture is no older', now.ageMs <= base.ageMs + 0.5, `${now.ageMs} against ${base.ageMs} ms`);
}

/* 3. A compositor that takes its frame early: the paced timer must stay
 * even whatever the deadline, which is why it draws twice, not once. */
for (const gpuMs of [2, 7.8]) {
  let baseAge = 0;
  let nowAge = 0;
  const deadlines = [0, 2, 5, 9, 13];
  for (const deadlineMs of deadlines) {
    const base = run({ periodMs: P60, gpuMs, paced: false, deadlineMs });
    const now = run({ periodMs: P60, gpuMs, paced: true, deadlineMs });
    baseAge += base.ageMs / deadlines.length;
    nowAge += now.ageMs / deadlines.length;
    check(`GPU ${gpuMs} ms, the compositor's deadline ${deadlineMs} ms early: no judder`, now.judder === 0,
      `judder ${now.perSecond} against ${base.perSecond} a second, age ${now.ageMs} against ${base.ageMs} ms`);
  }
  /* Where a compositor takes its frame is not knowable from the page, so a
   * locked phase wins a few milliseconds on one machine and loses them on
   * another. Over the sweep it must not be older than the drift it
   * replaces: the latency rule's line. */
  check(`GPU ${gpuMs} ms: the picture's mean age over the deadlines is no older`, nowAge <= baseAge + 0.5,
    `${nowAge.toFixed(1)} against ${baseAge.toFixed(1)} ms`);
}

/* 4. The cases two draws a refresh cannot keep: they say so (one draw a
 * refresh), and the timer's judge then hands the frames to the display. */
check('144 Hz is one draw a refresh (half is under the 4 ms floor)', drawsPerRefresh(1000 / 144, 1) === 1);
check('120 Hz with a quick GPU keeps two', drawsPerRefresh(1000 / 120, 3) === 2);
check('60 Hz with the GPU past half the period is one', drawsPerRefresh(P60, 10.7) === 1);
{
  const now = run({ periodMs: P60, gpuMs: 10.7, paced: true });
  check('one draw a refresh, phase locked, does not judder', now.judder === 0, `${now.perSecond} a second, ${now.fps} fps`);
}

/* 5. Every delay is a timeout a browser can keep, and lands on the grid. */
{
  let ok = true;
  for (let i = 0; i < 2000; i += 1) {
    const now = 1000 + i * 0.37;
    const d = paceDelay(now, 1000 + Math.floor(i * 0.37 / P60) * P60, P60, 2);
    if (!(d >= 0.5 && d <= P60 / 2 + 0.5)) ok = false;
  }
  check('delays are between 0.5 ms and a step', ok);
  check('no refresh seen yet: a plain step', Math.abs(paceDelay(10, -1, P60, 2) - P60 / 2) < 1e-9);
}

/* 6. The period from the kept rAF, on a page that booted on Low and so
 * never learned it: 144 Hz with a stretched gap in every five. */
{
  const rp = createRafPeriod();
  check('not ready before four gaps', !rp.ready());
  let ts = 0;
  for (let i = 0; i < 40; i += 1) {
    ts += (i % 5 === 4 ? 2 : 1) * (1000 / 144) + (i % 3) * 0.05;
    rp.note(ts);
  }
  check('the rAF period reads 144 Hz through stretched gaps', Math.abs(rp.periodMs() - 1000 / 144) < 0.2, `${rp.periodMs().toFixed(2)} ms`);
  rp.reset();
  rp.note(ts + 500);
  check('a reset does not count the gap across it', Math.abs(rp.periodMs() - 1000 / 144) < 0.2);
}

console.log(failures ? `timerpace-check: ${failures} FAILED` : 'timerpace-check: all passed');
process.exit(failures ? 1 : 0);
