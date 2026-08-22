/*
 * ghost-selftest.js: the ghost pipeline, proven in Node.
 *
 * Drives the three machines in src/game/ghost.js and the wire format in
 * src/share/ghostdata.js with no browser and no GL: a synthetic flight is
 * recorded at display rates, finished, encoded, carried through base64,
 * decoded, and flown back, with the replay compared against the analytic
 * path it was recorded from. The tamper cases a board must refuse are
 * checked against the same inspector the board mirrors.
 *
 * Run: node scripts/ghost-selftest.js   (npm run ghost:selftest)
 * Exit code is the failure count, like the other selftests.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 */

import {
  decodeGhost,
  encodeGhost,
  ghostFromBase64,
  ghostToBase64,
  GHOST_HEADER_BYTES,
  GHOST_RATE_HZ,
  GHOST_SAMPLE_BYTES,
  inspectGhostBytes,
} from '../src/share/ghostdata.js';
import { GhostBook, GhostLap, GhostRecorder } from '../src/game/ghost.js';

let failures = 0;

function check(name, cond) {
  if (cond) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`);
  }
}

/*
 * The synthetic lap: a 20 m circle flown in 12 s at 3 m of height, banked
 * into the turn. Smooth, curved on every axis, and cheap to evaluate at
 * any t, which is what makes replay error measurable.
 */
const LAP_MS = 12000;
const RADIUS = 20;

function analyticPose(tMs) {
  const a = (tMs / LAP_MS) * Math.PI * 2;
  return {
    x: Math.cos(a) * RADIUS,
    y: 3 + Math.sin(a * 2) * 0.5,
    z: Math.sin(a) * RADIUS,
  };
}

/* The attitude: yaw about y following the circle, times a constant bank
 * roll about the craft's own z. */
function analyticQuat(tMs) {
  const a = (tMs / LAP_MS) * Math.PI * 2;
  const yaw = a + Math.PI / 2;
  const bank = 0.35;
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cb = Math.cos(bank / 2);
  const sb = Math.sin(bank / 2);
  return { x: sy * sb, y: sy * cb, z: cy * sb, w: cy * cb };
}

function recordLap(feedHz, { cutAtMs = null, seed = true } = {}) {
  const rec = new GhostRecorder();
  rec.begin();
  const step = 1000 / feedHz;
  if (seed) {
    /* What the shell does: the frame BEFORE the crossing is fed at its
     * negative lap time, so the t = 0 keyframe is interpolated across the
     * crossing rather than held from the first frame after it. */
    const t0 = -step * 0.5;
    const p0 = analyticPose(t0);
    const q0 = analyticQuat(t0);
    rec.push(t0, p0.x, p0.y, p0.z, q0.x, q0.y, q0.z, q0.w);
  }
  let cutDone = false;
  for (let t = step * 0.5; t <= LAP_MS + step; t += step) {
    if (cutAtMs != null && !cutDone && t >= cutAtMs) {
      rec.cutHere();
      cutDone = true;
    }
    const p = analyticPose(t);
    const q = analyticQuat(t);
    /* A teleport: the second half of the lap flies 60 m away. */
    const dx = cutAtMs != null && t >= cutAtMs ? 60 : 0;
    rec.push(t, p.x + dx, p.y, p.z, q.x, q.y, q.z, q.w);
  }
  return rec.finish(LAP_MS, [3000, 6000, 9000, LAP_MS]);
}

console.log('recorder');
{
  const lap = recordLap(144);
  check('a lap comes back', lap !== null);
  check('rate is the ghost grid', lap.rateHz === GHOST_RATE_HZ);
  check('duration is the lap', lap.durationMs === LAP_MS);
  const wantAtLeast = Math.floor((LAP_MS * GHOST_RATE_HZ) / 1000);
  check(`grid covers the lap (${lap.count} frames)`, lap.count >= wantAtLeast);
  check('splits kept in order', lap.splits.length === 4 && lap.splits[3] === LAP_MS);

  /* Replay against the analytic path. The grid is linear between display
   * feeds and the spline re-curves it; on a 20 m circle the worst error
   * budget is a couple of centimetres. */
  const ghost = new GhostLap(lap);
  const out = {};
  let worst = 0;
  for (let t = 0; t <= LAP_MS; t += 37) {
    ghost.sample(t, out);
    const p = analyticPose(t);
    const e = Math.hypot(out.px - p.x, out.py - p.y, out.pz - p.z);
    if (e > worst) {
      worst = e;
    }
  }
  check(`replay position error under 5 cm (worst ${(worst * 100).toFixed(2)} cm)`, worst < 0.05);

  let worstDeg = 0;
  for (let t = 0; t <= LAP_MS; t += 53) {
    ghost.sample(t, out);
    const q = analyticQuat(t);
    const dot = Math.abs(out.qx * q.x + out.qy * q.y + out.qz * q.z + out.qw * q.w);
    const deg = (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
    if (deg > worstDeg) {
      worstDeg = deg;
    }
  }
  check(`replay attitude error under 1 degree (worst ${worstDeg.toFixed(3)})`, worstDeg < 1);
  check('sampling past the finish holds the finish', (() => {
    ghost.sample(LAP_MS + 5000, out);
    const p = analyticPose(LAP_MS);
    return Math.hypot(out.px - p.x, out.py - p.y, out.pz - p.z) < 0.2;
  })());
  check('no cut on a clean lap', ghost.cut.every((c) => c === 0));
}

{
  /* A slow feed, the dropped-frame case: 20 Hz display under a 30 Hz grid.
   * The grid interpolates between feeds, so error grows but stays bounded
   * by the chord of one feed interval. */
  const lap = recordLap(20);
  const ghost = new GhostLap(lap);
  const out = {};
  let worst = 0;
  for (let t = 0; t <= LAP_MS; t += 41) {
    ghost.sample(t, out);
    const p = analyticPose(t);
    const e = Math.hypot(out.px - p.x, out.py - p.y, out.pz - p.z);
    if (e > worst) {
      worst = e;
    }
  }
  check(`20 Hz feed still under 5 cm (worst ${(worst * 100).toFixed(1)} cm)`, worst < 0.05);
}

{
  /* Without the seed frame the recorder holds the first feed back to t = 0,
   * an error of at most one feed interval of travel. The fallback exists
   * for a lap that starts with no previous frame; it must stay bounded. */
  const lap = recordLap(20, { seed: false });
  const ghost = new GhostLap(lap);
  const out = {};
  ghost.sample(0, out);
  const p = analyticPose(0);
  const e = Math.hypot(out.px - p.x, out.py - p.y, out.pz - p.z);
  check(`unseeded start error stays under one feed step (${(e * 100).toFixed(1)} cm)`, e < 0.55);
}

console.log('cuts');
{
  const lap = recordLap(144, { cutAtMs: 6000 });
  const ghost = new GhostLap(lap);
  check('the teleport reads as a cut', ghost.cut.some((c) => c === 1));
  check('exactly one cut segment', ghost.cut.reduce((a, c) => a + c, 0) === 1);
  const out = {};
  /* Inside the cut the sampler holds the near side rather than sweeping. */
  const cutIdx = ghost.cut.indexOf(1);
  const tIn = ((cutIdx + 0.5) * 1000) / ghost.rateHz;
  ghost.sample(tIn, out);
  check('mid-cut reports cut', out.cut === true);
  const nearX = ghost.pos[cutIdx * 3];
  check('mid-cut holds the near side', Math.abs(out.px - nearX) < 1e-6);
  /* The spline next to the cut must not bend toward the far side. */
  ghost.sample(tIn - 1000 / ghost.rateHz, out);
  const p = analyticPose(tIn - 1000 / ghost.rateHz);
  check('the segment before the cut stays on the path', Math.hypot(out.px - p.x, out.pz - p.z) < 0.6);
}

console.log('wire format');
{
  const lap = recordLap(144);
  const bytes = encodeGhost(lap);
  check('inspect accepts the encoder\'s own output', inspectGhostBytes(bytes) === null);
  check('size is header + splits + frames', bytes.length === GHOST_HEADER_BYTES + 4 * 4 + lap.count * GHOST_SAMPLE_BYTES);
  const again = encodeGhost(lap);
  check('encoding is deterministic', bytes.length === again.length && bytes.every((b, i) => b === again[i]));

  const b64 = ghostToBase64(bytes);
  const back = ghostFromBase64(b64);
  check('base64 round trip is byte identical', back.length === bytes.length && back.every((b, i) => b === bytes[i]));

  const dec = decodeGhost(back);
  check('decode returns the header', dec.rateHz === lap.rateHz && dec.count === lap.count && dec.durationMs === lap.durationMs);
  check('splits survive', dec.splits.length === 4 && dec.splits[1] === 6000);
  let worstPos = 0;
  for (let i = 0; i < lap.count * 3; i += 1) {
    worstPos = Math.max(worstPos, Math.abs(dec.pos[i] - lap.pos[i]));
  }
  check('positions survive as float32', worstPos < 1e-4);
  let worstQ = 0;
  const out = {};
  const ghost = new GhostLap(dec);
  for (let t = 0; t <= LAP_MS; t += 97) {
    ghost.sample(t, out);
    const q = analyticQuat(t);
    const dot = Math.abs(out.qx * q.x + out.qy * q.y + out.qz * q.z + out.qw * q.w);
    worstQ = Math.max(worstQ, (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI);
  }
  check(`decoded attitude within 1 degree (worst ${worstQ.toFixed(3)})`, worstQ < 1);
  check('decoded quats are unit', (() => {
    for (let i = 0; i < dec.count; i += 1) {
      const n = Math.hypot(dec.quat[i * 4], dec.quat[i * 4 + 1], dec.quat[i * 4 + 2], dec.quat[i * 4 + 3]);
      if (Math.abs(n - 1) > 1e-3) {
        return false;
      }
    }
    return true;
  })());
  check('stored stream is hemisphere aligned', (() => {
    for (let i = 1; i < dec.count; i += 1) {
      const a = (i - 1) * 4;
      const b = i * 4;
      const dot = dec.quat[a] * dec.quat[b] + dec.quat[a + 1] * dec.quat[b + 1]
        + dec.quat[a + 2] * dec.quat[b + 2] + dec.quat[a + 3] * dec.quat[b + 3];
      if (dot < 0) {
        return false;
      }
    }
    return true;
  })());
}

{
  /* A recorder that hands the encoder sign-flipped quaternions still
   * produces a short-way stream: the encoder owns the hemisphere. */
  const rec = new GhostRecorder();
  rec.begin();
  for (let t = 8; t <= 2000; t += 16) {
    const q = analyticQuat(t);
    const s = Math.floor(t / 100) % 2 === 0 ? 1 : -1;
    rec.push(t, t / 1000, 3, 0, q.x * s, q.y * s, q.z * s, q.w * s);
  }
  const lap = rec.finish(2000, [2000]);
  const dec = decodeGhost(encodeGhost(lap));
  let aligned = true;
  for (let i = 1; i < dec.count; i += 1) {
    const a = (i - 1) * 4;
    const b = i * 4;
    if (dec.quat[a] * dec.quat[b] + dec.quat[a + 1] * dec.quat[b + 1]
      + dec.quat[a + 2] * dec.quat[b + 2] + dec.quat[a + 3] * dec.quat[b + 3] < 0) {
      aligned = false;
    }
  }
  check('sign-flipped input still encodes short-way', aligned);
}

console.log('tampering');
{
  const lap = recordLap(60);
  const good = encodeGhost(lap);
  check('a truncated blob is named', inspectGhostBytes(good.subarray(0, 40)) !== null);
  check('an empty blob is named', inspectGhostBytes(new Uint8Array(0)) !== null);
  const magic = good.slice();
  magic[0] = 88;
  check('wrong magic is named', inspectGhostBytes(magic) === 'wrong magic');
  const ver = good.slice();
  new DataView(ver.buffer).setUint32(8, 9, true);
  check('wrong version is named', inspectGhostBytes(ver) !== null);
  const rate = good.slice();
  new DataView(rate.buffer).setUint32(12, 100000, true);
  check('an absurd rate is named', inspectGhostBytes(rate) !== null);
  const count = good.slice();
  new DataView(count.buffer).setUint32(16, 7, true);
  check('a count that disagrees with the bytes is named', inspectGhostBytes(count) !== null);
  const dur = good.slice();
  new DataView(dur.buffer).setUint32(20, 100, true);
  check('a grid that outruns its claimed lap is fine, the reverse is not', (() => {
    /* Shrinking the claimed duration keeps the blob valid (grid covers it);
     * inflating it past the grid must fail. */
    if (inspectGhostBytes(dur) !== null) {
      return false;
    }
    const dur2 = good.slice();
    new DataView(dur2.buffer).setUint32(20, 590000, true);
    return inspectGhostBytes(dur2) === 'grid ends before the lap does';
  })());
  const splits = good.slice();
  new DataView(splits.buffer).setUint32(24, 4096, true);
  check('a split flood is named', inspectGhostBytes(splits) !== null);
  check('encode refuses a two hour lap', (() => {
    try {
      encodeGhost({ ...lap, durationMs: 7_200_000 });
      return false;
    } catch (e) {
      return true;
    }
  })());
}

console.log('recorder edges');
{
  const rec = new GhostRecorder();
  rec.begin();
  check('finishing an unfed recorder returns null', rec.finish(1000, []) === null);
  rec.begin();
  rec.push(700_000, 0, 0, 0, 0, 0, 0, 1);
  check('a lap past the cap records nothing', rec.finish(700_000, []) === null);
  const rec2 = new GhostRecorder();
  rec2.push(50, 1, 2, 3, 0, 0, 0, 1);
  check('an unarmed recorder ignores pushes', rec2.pos.length === 0);
}

console.log('the book');
{
  const book = new GhostBook();
  const slow = recordLap(60);
  slow.durationMs = 14000;
  const fast = recordLap(60);
  fast.durationMs = 11000;
  const slower = recordLap(60);
  slower.durationMs = 15000;
  check('first lap is the session best', book.keep('field', slow).best === true);
  check('a faster lap takes the best slot', book.keep('field', fast).best === true);
  check('a slower lap does not', book.keep('field', slower).best === false);
  check('previous is always the last lap', book.previous('field').durationMs === 15000);
  check('best survives the slower lap', book.best('field').durationMs === 11000);
  check('courses do not share slots', book.best('city') === null);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`);
process.exit(failures);
