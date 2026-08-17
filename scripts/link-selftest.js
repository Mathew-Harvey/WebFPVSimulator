/*
 * link-selftest.js: prove the radio in src/input/link.js behaves like one.
 *
 * The link sits between the sticks and the flight controller and its whole
 * job is to be slightly imperfect. That makes it exactly the kind of thing
 * that can be wrong in a way nobody notices: a jitter that is secretly
 * Math.random makes a lap time unreproducible, a delay applied to the
 * sample rather than the arrival models a radio that predicts the future,
 * and an unsorted emission violates the ABI's non decreasing timestamp
 * rule and gets frames rejected by the module rather than flown.
 *
 * So each of those is asserted here rather than assumed.
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

import { RcLink, LINK_PRESETS } from '../src/input/link.js';

let passed = 0;
let failed = 0;
const fails = [];

function check(what, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${what}`);
    return;
  }
  failed += 1;
  fails.push(`${what}${detail ? `, ${detail}` : ''}`);
  console.log(`  FAIL  ${what}${detail ? `, ${detail}` : ''}`);
}

/* Run a link over a stretch of sim time in render sized blocks, returning
 * every packet it emitted. The stick value is the slot time itself, so a
 * packet's payload says when it was SAMPLED and its stamp says when it
 * ARRIVED, which is what makes the transport direction testable. */
function run(link, ms, blockMs = 16) {
  const out = [];
  link.reset(0);
  const pick = (atMs) => ({ roll: atMs, pitch: 0, yaw: 0, throttle: 0.5 });
  /* Always finish exactly on ms, whatever the block size divides into, so
   * two block sizes cover the same span and are comparable. */
  for (let t = Math.min(blockMs, ms); ; t = Math.min(t + blockMs, ms)) {
    for (const p of link.pump(t, pick)) {
      out.push(p);
    }
    if (t >= ms) {
      break;
    }
  }
  return out;
}

console.log('link-selftest');

/* Perfect is the identity, and the shell keys its fast path off exactly
 * this predicate, so it has to be true for the default and false for
 * everything else. */
const perfect = new RcLink('perfect');
check('the default link is the identity', perfect.isPerfect());
for (const id of Object.keys(LINK_PRESETS)) {
  if (id === 'perfect') {
    continue;
  }
  check(`${id} is not the identity`, !new RcLink(id).isPerfect());
}

/* Cadence. Over a second at 250 Hz a link should send about 250 frames,
 * minus whatever it dropped. */
const l250 = new RcLink('elrs250');
const got = run(l250, 1000);
check('elrs250 sends about 250 frames in a second',
  Math.abs(l250.sent - 250) <= 2, `${l250.sent} sent`);
check('and every frame is delivered, dropped, or still in flight',
  got.length + l250.pending.length === l250.sent - l250.dropped,
  `${got.length} out, ${l250.pending.length} in flight, ${l250.sent} sent, ${l250.dropped} dropped`);

/* Timestamps must not go backwards. The module rejects a sample that does,
 * and jitter is exactly what would cause it. */
let monotonic = true;
for (let i = 1; i < got.length; i += 1) {
  if (got[i].tMs < got[i - 1].tMs) {
    monotonic = false;
  }
}
check('arrival stamps never go backwards', monotonic);

/* Transport direction: a packet carries the sticks from when it was
 * sampled, and arrives later. Its payload time must therefore be BEHIND
 * its stamp by roughly the configured delay. */
const lags = got.map((p) => p.tMs - p.rc.roll);
const meanLag = lags.reduce((a, b) => a + b, 0) / lags.length;
check('packets arrive after they were sampled', lags.every((d) => d > 0));
check('mean transport delay matches the preset',
  Math.abs(meanLag - l250.delayMs) < 0.25, `${meanLag.toFixed(2)} ms against ${l250.delayMs}`);
check('jitter stays inside the preset band',
  lags.every((d) => Math.abs(d - l250.delayMs) <= l250.jitterMs + 1e-9),
  `spread ${(Math.max(...lags) - Math.min(...lags)).toFixed(2)} ms`);

/* Jitter has to actually be there, or the model is decorative. */
const spread = Math.max(...lags) - Math.min(...lags);
check('jitter is present', spread > l250.jitterMs * 0.5, `${spread.toFixed(2)} ms spread`);

/* Determinism, which is the one that protects a lap time. Same seed and
 * same stream, twice, has to be identical; a different seed must not be. */
const a = run(new RcLink('elrs250', 0xABCD1234), 600);
const b = run(new RcLink('elrs250', 0xABCD1234), 600);
const c = run(new RcLink('elrs250', 0x1234ABCD), 600);
const same = (x, y) => x.length === y.length
  && x.every((p, i) => p.tMs === y[i].tMs && p.rc.roll === y[i].rc.roll);
check('the same seed replays exactly', same(a, b));
check('a different seed does not', !same(a, c));

/* Block size must not change the outcome. The render rate decides how the
 * shell batches its calls, and the ABI's own promise is that batching
 * cannot move the trajectory; a link that emitted differently at 30 fps
 * than at 144 fps would break that from the outside. */
const big = run(new RcLink('elrs250', 0x55AA55AA), 600, 33);
const small = run(new RcLink('elrs250', 0x55AA55AA), 600, 4);
check('batching does not change what the link emits', same(big, small),
  `${big.length} against ${small.length}`);

/* Loss, over a long enough run to see it. */
const lossy = new RcLink('crossfire');
run(lossy, 20000);
const ppm = (lossy.dropped / lossy.sent) * 1e6;
check('loss lands near the configured rate',
  Math.abs(ppm - lossy.lossPpm) < lossy.lossPpm * 0.9 + 200,
  `${ppm.toFixed(0)} ppm against ${lossy.lossPpm}`);

/* A perfect link must emit a frame per slot with no delay at all, because
 * the shell's fast path and this have to agree about what perfect means. */
const p = run(new RcLink('perfect'), 400);
check('perfect emits one frame per slot',
  p.length === 100, `${p.length} frames in 400 ms at 250 Hz`);
check('perfect adds no delay', p.every((x) => x.tMs === x.rc.roll));

console.log(failed ? `\n${failed} failed` : '\nall passed');
for (const f of fails) {
  console.log(`  FAIL ${f}`);
}
process.exitCode = failed ? 1 : 0;
