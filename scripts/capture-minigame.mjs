/*
 * capture-minigame.mjs: record one mini game as 60 fps portrait footage in
 * headless Chromium, with no dependence on real time. See README, "Capture
 * mode", and src/capture.js for what ?capture=1 does to the page.
 *
 *   node scripts/capture-minigame.mjs --mode=<ball|drift|dogfight|ribbon|moto>
 *     --seconds=12 --seed=1 --out=out/capture/<mode>
 *     [--cam=follow:<target>|pilot|path:<file.json>] [--hide=tips,hints,leftTab,chips]
 *     [--width=1080 --height=1920] [--warmup=60] [--bots=2] [--skill=rookie]
 *     [--offset=side,up,back] [--lookahead=0.4] [--smooth=0.9] [--fov=60]
 *     [--stick=file.json]
 *
 * A target is a name or several joined with +, whose midpoint is followed:
 * player, ball, bot, bot:N, car:N, rider:N, goal:0, goal:1. With no --cam, the
 * mode's own default camera below is used. `--cam=pilot` flies the player's
 * own FPV view. `--stick` is a JSON array of [tMs, roll, pitch, yaw, throttle]
 * keys; with none, the mode's default stick script flies the player quad.
 * A path file is [{t, pos:[x,y,z], look:[x,y,z], fov}], t in virtual ms.
 *
 * Writes <out>/frame_000001.png and on, and <out>/capture.json: mode, seed,
 * opts, the frame count, the git commit, the virtual clock's first, last and
 * spacing, and the sha256 of each of the first 120 frames. Exits non-zero if a
 * frame fails, window.__frameFault is set, or the frame count is wrong.
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

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const i = a.indexOf('=');
  return i < 0 ? [a.slice(2), 'true'] : [a.slice(2, i), a.slice(i + 1)];
}));

/*
 * The defaults per mode: the map it runs on, the camera that keeps the
 * subject in the middle of a portrait frame, and a stick script for the
 * player's quad. Offsets are [side, up, back] in metres from the subject, in
 * its direction of travel (a quad is small, so its offsets are a few metres); `world` offsets are fixed. They were chosen from
 * the pictures this script writes: high enough that no plate reads and the
 * camera looks down on the action rather than across at the sky or at a
 * tower, and with no mark of any brand in the view.
 */
/* 0.39 is about the hover of the five inch: a short punch to leave the
 * ground, then a hold, and a gentle forward circle for the modes that want a
 * moving quad (a hovering one draws no ribbon trail). */
const TAKEOFF = [[0, 0, 0, 0, 0.0], [200, 0, 0, 0, 0.5], [700, 0, 0, 0, 0.5], [1000, 0, 0, 0, 0.39]];
const CIRCLE = [...TAKEOFF, [2500, 0.1, -0.14, 0.2, 0.4], [600000, 0.1, -0.14, 0.2, 0.4]];
const MODES = {
  ball: {
    map: 'ball',
    start: { skill: 'pilot' },
    cam: { target: 'ball+goal:1', offset: [-55, 40, 0], world: true, lookAhead: 0, smooth: 0.95, fov: 70 },
    stick: CIRCLE,
  },
  drift: {
    map: 'drift',
    start: {},
    cam: { target: 'car:0+car:1', offset: [8, 6, 14], lookAhead: 0.3, smooth: 0.93, fov: 58 },
    stick: TAKEOFF,
  },
  dogfight: {
    map: 'city',
    start: {},
    cam: { target: 'bot:1', offset: [0.8, 0.7, 2.4], lookAhead: 0.15, smooth: 0.7, fov: 50 },
    stick: CIRCLE,
  },
  ribbon: {
    map: 'city',
    start: {},
    cam: { target: 'player', offset: [1, 0.8, 3], lookAhead: 0.15, smooth: 0.7, fov: 50 },
    stick: CIRCLE,
  },
  moto: {
    map: 'moto',
    start: {},
    cam: { target: 'rider:0', offset: [7, 4, 10], lookAhead: 0.4, smooth: 0.9, fov: 58 },
    stick: TAKEOFF,
  },
};

const mode = args.mode;
if (!MODES[mode]) {
  console.error(`usage: node scripts/capture-minigame.mjs --mode=${Object.keys(MODES).join('|')} [options]`);
  process.exit(2);
}
const def = MODES[mode];
const seconds = Number(args.seconds ?? 12);
const seed = Number(args.seed ?? 1) >>> 0;
const width = Number(args.width ?? 1080);
const height = Number(args.height ?? 1920);
const warmup = Number(args.warmup ?? 60);
const out = resolve(args.out ?? `out/capture/${mode}`);
const hide = Object.fromEntries((args.hide ?? 'tips,hints,leftTab,chips').split(',').filter(Boolean).map((k) => [k, true]));
const frames = Math.round(seconds * 60);
const startOpts = { ...def.start };
if (args.bots !== undefined) {
  startOpts.bots = Number(args.bots);
}
if (args.skill !== undefined) {
  startOpts.skill = args.skill;
}

mkdirSync(out, { recursive: true });

let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
} catch (e) { /* not a checkout */ }

const url = `/index.html?capture=1&seed=${seed}&map=${def.map}&craft=5inch&fly=1`;
const page = await openPage({ root: ROOT, width, height, url });
let failed = null;
const shas = [];
const stamps = [];
try {
  await page.until('typeof window.__capture === "object"', 120000);
  const first = await page.evaluate(`(async () => { await window.__capture.ready(); return window.__capture.frame(); })()`);
  const started = await page.evaluate(`window.__capture.start(${JSON.stringify(mode)}, ${JSON.stringify({ seed, ...startOpts })})`);
  await page.evaluate(`window.__capture.hide(${JSON.stringify(hide)})`);

  const camArg = args.cam ?? `follow:${def.cam.target}`;
  const o = def.cam;
  const offset = args.offset ? args.offset.split(',').map(Number) : o.offset;
  const follow = {
    offset,
    world: o.world === true && !args.offset,
    lookAhead: Number(args.lookahead ?? o.lookAhead),
    smooth: Number(args.smooth ?? o.smooth),
    fov: Number(args.fov ?? o.fov),
  };
  if (camArg === 'pilot') {
    await page.evaluate('window.__capture.cam(null)');
  } else if (camArg.startsWith('follow:')) {
    await page.evaluate(`window.__capture.follow(${JSON.stringify(camArg.slice(7))}, ${JSON.stringify(follow)})`);
  } else if (camArg.startsWith('path:')) {
    const keys = JSON.parse(readFileSync(resolve(camArg.slice(5)), 'utf8'));
    await page.evaluate(`window.__capture.path(${JSON.stringify(Array.isArray(keys) ? keys : keys.cam)})`);
  } else {
    throw new Error(`--cam: ${camArg}`);
  }
  const stick = args.stick ? JSON.parse(readFileSync(resolve(args.stick), 'utf8')) : def.stick;
  if (stick && mode !== 'moto' && mode !== 'drift') {
    await page.evaluate(`window.__capture.pilot(${JSON.stringify(stick)})`);
  } else if (stick && (mode === 'drift') && args.stick) {
    await page.evaluate(`window.__capture.pilot(${JSON.stringify(stick)})`);
  }

  if (warmup > 0) {
    await page.evaluate(`window.__capture.step(${warmup})`);
  }
  const base = await page.evaluate('window.__capture.frame()');
  for (let i = 1; i <= frames; i += 1) {
    const frame = await page.evaluate('window.__capture.step(1).then(() => [window.__capture.frame(), window.__capture.now(), Boolean(window.__frameFault)])');
    stamps.push(frame[1]);
    if (frame[2]) {
      throw new Error(`window.__frameFault set at frame ${i}: ${JSON.stringify(await page.evaluate('window.__frameFault'))}`);
    }
    const shot = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    const buf = Buffer.from(shot.data, 'base64');
    writeFileSync(join(out, `frame_${String(i).padStart(6, '0')}.png`), buf);
    if (i <= 120) {
      shas.push(createHash('sha256').update(buf).digest('hex'));
    }
    if (i % 60 === 0) {
      console.log(`  ${i}/${frames}`);
    }
  }
  const end = await page.evaluate('window.__capture.frame()');
  const deltas = stamps.slice(1).map((t, i) => t - stamps[i]);
  const virtual = {
    first: stamps[0],
    last: stamps[stamps.length - 1],
    distinct: new Set(stamps).size,
    minDeltaMs: Math.min(...deltas),
    maxDeltaMs: Math.max(...deltas),
  };
  if (end - base !== frames) {
    throw new Error(`frame count: stepped ${end - base}, wanted ${frames}`);
  }
  if (virtual.distinct !== frames || virtual.maxDeltaMs - virtual.minDeltaMs > 1e-6) {
    throw new Error(`virtual clock is not even: ${JSON.stringify(virtual)}`);
  }
  const fault = await page.evaluate('window.__frameFault || null');
  if (fault) {
    throw new Error(`window.__frameFault: ${JSON.stringify(fault)}`);
  }
  writeFileSync(join(out, 'capture.json'), `${JSON.stringify({
    mode, seed, opts: { ...startOpts, hide, cam: camArg, follow, warmup, seconds, width, height },
    start: started, bootFrames: first, frames, commit, virtual, sha256First120: shas,
  }, null, 2)}\n`);
  const errs = page.errors.filter((e) => !/api\/|ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
  if (errs.length) {
    console.warn(`page errors:\n${errs.slice(0, 5).join('\n')}`);
  }
  console.log(`capture ok: ${frames} frames in ${out}`);
} catch (e) {
  failed = e;
  console.error(`capture failed: ${e.message}`);
} finally {
  await page.close();
}
process.exit(failed ? 1 : 0);
