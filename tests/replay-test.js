/*
 * replay-test.js: headless browser checks for replay mode.
 *
 * ?map=custom&share=<track>&replay=<time>&cam=chase|fpv&clean=1 plays a
 * board ghost with no pilot, for recording clips. Every check here drives
 * the real page in Chromium with the board answered inside the page (see
 * boardSeed), and reads what a viewer would get: screenshots counted pixel
 * by pixel, beside the shell's own readbacks. Each clean=1 claim has a
 * clean=0 control beside it, because a check that cannot fail is not one.
 *
 * Run: npm run replay:test. A few minutes in a software rasteriser.
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { courseFromDocument } from '../src/game/trackdoc.js';
import { encodeGhost, ghostToBase64 } from '../src/share/ghostdata.js';
import { ELEMENTS } from '../src/trackbuilder/elements.js';
import { keyInfo, openPage } from './lib/page.js';
import { decodePng, encodePng } from './lib/png.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOARD = 'http://127.0.0.1:3100';
/* Small, because every frame is rasterised on the CPU. The thinnest clean=0
 * margin is the whoop room from the FPV camera, whose best frame measured
 * 2630 to 2906 magenta pixels at this size across runs: the flags wave on
 * the wall clock, so a lap is not pixel identical twice. */
const SHOT = { width: 640, height: 360 };
const STEP_MS = 500;
/* One drawn frame after whatever just changed, so a read or a screenshot
 * sees it. Two callbacks, because the first can run before the shell's. */
const NEXT_FRAME = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))';

/* A one gate course and a ghost the board once served, for the checks that
 * need a replay running but do not look at it. */
const PLAIN = {
  schemaVersion: 1,
  id: 'trk-test0001',
  name: 'Test Track',
  trackClass: 'full',
  createdUtc: '2026-01-01T00:00:00Z',
  modifiedUtc: '2026-01-01T00:00:00Z',
  field: { width: 50, depth: 50, gridSize: 1 },
  settings: { tangentScale: 0.74, minCurveRadius: 2.5, samplesPerSegment: 48 },
  branding: { logo: null, logoName: '' },
  elements: [
    {
      id: 'el-1', type: 'gate', name: '0', position: { x: 10, y: 10, z: 0 }, yaw: 0, pitch: 0,
      yawOverridden: false, dims: { levels: 1, sillH: 0, clearW: 1.524, clearH: 1.524, levelPitch: 1.557401 },
    },
    {
      id: 'el-2', type: 'startPads', name: 'Grid', position: { x: 5, y: 5, z: 0 }, yaw: 0, pitch: 0,
      yawOverridden: false, dims: { pads: 2, spacing: 1.5, padSize: 0.6 },
    },
  ],
  sequence: [
    { id: 'sq-1', elementId: 'el-1', apertureIndex: 0, entry: -1, passSide: null, clearance: null, overridden: false },
  ],
};
const AJAX = JSON.parse(readFileSync(new URL('./fixtures/ghost-tm-aae280e5.json', import.meta.url), 'utf8'));

/*
 * The board, answered inside the page as a seed script: the track's
 * document, its times and its ghosts, and a 404 for anything else. Every
 * POST and beacon the page sends to the board is kept in window.__sent with
 * its body, so a check can say exactly what left the page.
 */
function boardSeed({ id, document = null, ghosts = [] }) {
  const track = document && { id, name: document.name, author: 'replay-test', document };
  const listing = { id, times: ghosts.map((g) => ({ id: g.id, name: g.name, lapMs: g.lapMs, hasGhost: true })) };
  return `(() => {
    const board = ${JSON.stringify(BOARD)};
    const base = '/api/tracks/' + ${JSON.stringify(id)};
    const track = ${JSON.stringify(track)};
    const listing = ${JSON.stringify(listing)};
    const ghosts = ${JSON.stringify(ghosts)};
    const sent = [];
    window.__sent = sent;
    const answer = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {
      status, headers: { 'content-type': 'application/json' },
    }));
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, opts = {}) => {
      const url = String(input && input.url ? input.url : input);
      if (!url.startsWith(board)) {
        return realFetch(input, opts);
      }
      const path = url.slice(board.length);
      if (String(opts.method || 'GET').toUpperCase() !== 'GET') {
        sent.push({ path, body: String(opts.body || '') });
        return answer({});
      }
      if (track && path === base + '/document') {
        return answer(track);
      }
      if (track && path === base) {
        return answer(listing);
      }
      const ghost = ghosts.find((g) => path === base + '/times/' + g.id + '/ghost');
      return ghost ? answer(ghost) : answer({ error: 'not found' }, 404);
    };
    /* sendEvent hands a beacon a Blob, so the body is read, not stringified. */
    navigator.sendBeacon = (url, data) => {
      const entry = { path: String(url).replace(board, ''), body: '' };
      sent.push(entry);
      Promise.resolve(data && data.text ? data.text() : String(data)).then((t) => { entry.body = t; });
      return true;
    };
  })();`;
}

function replayUrl({ id, time, cam = 'chase', clean = false }) {
  return `/index.html?map=custom&share=${id}&board=${BOARD}&replay=${time}&cam=${cam}${clean ? '&clean=1' : ''}`;
}

/* Every wait is on a condition. A sleep and a single read is a race. */
async function untilFlying(page) {
  await page.until('window.__shellReady === true', 120000);
  await page.until('window.__replayInfo().state === "ready" && window.__replayInfo().ghostLoaded', 30000);
  await page.until('window.__mode === "flight"', 10000);
}

/*
 * Magenta as this renderer draws it. The logo is pure 255, 0, 255; lit and
 * tone mapped it comes back near 176, 20, 150 in sun and 112, 20, 120 in
 * shade, measured on this file's own frames, so the test is the colour's
 * shape and not its brightness: red and blue both up, green at most half
 * of either, red and blue within a third of each other. Nothing else on
 * either course has that shape, which is what the clean=1 runs measure.
 */
const MAGENTA = [255, 0, 255];
function magentaIn(png) {
  const img = decodePng(png);
  let n = 0;
  for (let i = 0; i < img.data.length; i += img.channels) {
    const r = img.data[i];
    const g = img.data[i + 1];
    const b = img.data[i + 2];
    if (r >= 96 && b >= 96 && g * 2 <= Math.min(r, b) && Math.abs(r - b) * 3 <= Math.max(r, b)) {
      n += 1;
    }
  }
  return n;
}

async function testMagentaCounter() {
  const half = magentaIn(encodePng(8, 8, (x, y) => (y < 4 ? MAGENTA : [40, 160, 60])));
  if (half !== 32) {
    throw new Error(`expected 32 magenta pixels in a half magenta 8 by 8 PNG, got ${half}`);
  }
  const shade = magentaIn(encodePng(4, 1, (x) => [[112, 20, 120], [176, 20, 150], [255, 90, 90], [57, 255, 139]][x]));
  if (shade !== 2) {
    throw new Error(`expected shaded and sunlit magenta to count and the gate red and glow green not to, got ${shade}`);
  }
  console.log(' ok   magenta counter: 32 of a half magenta 8 by 8 PNG; lit magenta counts, gate red and glow green do not');
}

async function testNormalBoot() {
  const page = await openPage({ root: ROOT });
  try {
    await page.until('window.__shellReady === true', 120000);
    const info = await page.evaluate('window.__replayInfo()');
    if (info.active !== false) {
      throw new Error(`normal boot should have replay inactive, got active=${info.active}`);
    }
    console.log(' ok   normal boot reaches __shellReady with replay inactive');
  } finally {
    await page.close();
  }
}

async function testReplaySuccess() {
  const page = await openPage({
    root: ROOT,
    url: replayUrl({ id: PLAIN.id, time: AJAX.id, cam: 'fpv', clean: true }),
    seed: [boardSeed({ id: PLAIN.id, document: PLAIN, ghosts: [AJAX] })],
  });
  try {
    await untilFlying(page);
    if (await page.evaluate('getComputedStyle(document.getElementById("ui")).display') !== 'none') {
      throw new Error('UI should be hidden with clean=1');
    }
    const at1000 = `(async () => {
      window.__replayStep(0);
      window.__replayStep(1000);
      await ${NEXT_FRAME};
      const info = window.__replayInfo();
      return { vt: info.clock.vt, ...info.cameraPosition };
    })()`;
    const r1 = await page.evaluate(at1000);
    const r2 = await page.evaluate(at1000);
    if (r1.vt !== 1000 || r2.vt !== 1000) {
      throw new Error(`step should advance to 1000 ms, got ${r1.vt} and ${r2.vt}`);
    }
    if (![r1.x, r1.y, r1.z].every(Number.isFinite)) {
      throw new Error(`camera position not finite: ${JSON.stringify(r1)}`);
    }
    const d = Math.max(Math.abs(r1.x - r2.x), Math.abs(r1.y - r2.y), Math.abs(r1.z - r2.z));
    if (d > 0.001) {
      throw new Error(`camera not deterministic: ${d.toFixed(4)} m apart`);
    }
    const reset = await page.evaluate(`(() => {
      window.__replayStep(2000);
      const before = window.__replayInfo().clock.vt;
      window.__replayStep(0);
      return { before, after: window.__replayInfo().clock.vt };
    })()`);
    if (reset.before !== 3000 || reset.after !== 0) {
      throw new Error(`step(0) should reset vt, got before=${reset.before}, after=${reset.after}`);
    }
    console.log(' ok   replay starts in flight, UI hidden, stepping is deterministic, step(0) resets');
  } finally {
    await page.close();
  }
}

/*
 * Every way a clean replay can fail to start must hand the page back: the
 * UI, the cursor and a banner that says why.
 */
async function testFailuresRestore() {
  const cases = [
    {
      name: 'no track listing',
      id: 'trk-00000404',
      seed: boardSeed({ id: 'trk-00000404' }),
      time: 'tm-00000001',
      banner: 'no track listing found',
    },
    {
      name: 'ghost fetch fails',
      id: PLAIN.id,
      seed: boardSeed({ id: PLAIN.id, document: PLAIN }),
      time: 'tm-00000002',
      banner: 'Could not fetch that ghost',
    },
    {
      name: 'course has no lap',
      id: 'trk-f0000001',
      seed: boardSeed({ id: 'trk-f0000001', document: { ...PLAIN, id: 'trk-f0000001', sequence: [] }, ghosts: [AJAX] }),
      time: AJAX.id,
      banner: 'no lap for a ghost to fly',
    },
  ];
  for (const c of cases) {
    const page = await openPage({ root: ROOT, url: replayUrl({ id: c.id, time: c.time, clean: true }), seed: [c.seed] });
    try {
      await page.until('window.__shellReady === true', 120000);
      await page.until('window.__replayInfo().state === "failed"', 30000);
      await page.until(`document.getElementById("ui").textContent.includes(${JSON.stringify(c.banner)})`, 10000);
      const s = await page.evaluate(`({
        active: window.__replayInfo().active,
        ui: getComputedStyle(document.getElementById("ui")).display,
        cursor: getComputedStyle(document.getElementById("view")).cursor,
        mode: window.__mode,
      })`);
      if (s.active !== false || s.ui === 'none' || s.cursor === 'none' || s.mode !== 'title') {
        throw new Error(`${c.name}: expected replay off, UI and cursor back, title screen; got ${JSON.stringify(s)}`);
      }
    } finally {
      await page.close();
    }
  }
  console.log(` ok   clean=1 failures restore #ui, cursor and a banner: ${cases.map((c) => c.name).join(', ')}`);
}

/*
 * THE SPONSOR CHECK.
 *
 * Two courses dressed in three logos, all solid magenta: the full sized
 * one with its gates (headers, sleeves), flags and three ground logos on
 * the turf, and the whoop room with three flags. Each is replayed with a
 * ghost that flies its own racing line, from both cameras, with clean=0
 * and clean=1, and a screenshot is counted at every step across the lap.
 */
const LOGO = `data:image/png;base64,${encodePng(256, 128, () => MAGENTA).toString('base64')}`;
const LOGOS = ['a', 'b', 'c'].map((k) => ({ id: `logo-${k}`, name: `Magenta ${k}`, image: LOGO }));

function sponsored(file, extra) {
  const raw = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
  const doc = structuredClone(raw.document || raw);
  doc.branding = { logos: LOGOS };
  doc.elements.push(...extra(doc));
  return doc;
}

/*
 * A lap along the course's own racing line, so the camera passes every
 * gate, flag and decal on it. Nose down by the default 30 degree camera
 * tilt, the way a quad at racing speed flies, so the FPV view is level.
 */
function lapAlongLine(course, speed) {
  const pts = course.line;
  const along = [0];
  for (let i = 1; i < pts.length; i += 1) {
    along.push(along[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
  }
  const length = along[along.length - 1];
  const durationMs = Math.round((length / speed) * 1000);
  const rateHz = 30;
  const count = Math.floor((durationMs * rateHz) / 1000) + 1;
  const pos = new Float32Array(count * 3);
  const quat = new Float32Array(count * 4);
  /* Half angles of the 30 degree nose down pitch, for the quaternion. */
  const sp = Math.sin(-Math.PI / 12);
  const cp = Math.cos(-Math.PI / 12);
  let seg = 0;
  for (let i = 0; i < count; i += 1) {
    const s = Math.min(length, (i / rateHz) * speed);
    while (seg < pts.length - 2 && along[seg + 1] < s) {
      seg += 1;
    }
    const a = pts[seg];
    const b = pts[seg + 1];
    const f = (s - along[seg]) / Math.max(1e-9, along[seg + 1] - along[seg]);
    pos.set([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f], i * 3);
    /* Yaw so the craft's -Z runs along the segment, then pitch about its X. */
    const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    const sy = Math.sin(yaw / 2);
    const cy = Math.cos(yaw / 2);
    quat.set([cy * sp, sy * cp, -sy * sp, cy * cp], i * 4);
  }
  return { rateHz, durationMs, splits: [durationMs], count, pos, quat };
}

function sponsoredTrack({ name, id, time, file, speed, extra }) {
  const document = sponsored(file, extra);
  const lap = lapAlongLine(courseFromDocument(document), speed);
  const ghost = { id: time, name: 'Magenta', lapMs: lap.durationMs, ghost: ghostToBase64(encodeGhost(lap)) };
  return { name, id, time, seed: boardSeed({ id, document: { ...document, id }, ghosts: [ghost] }) };
}

const SPONSORED = [
  sponsoredTrack({
    name: 'full',
    id: 'trk-5b0a5a01',
    time: 'tm-0000f011',
    file: 'tracks/json/trk-b17c07d2.json',
    speed: 17,
    extra: (doc) => doc.elements.filter((el) => el.type === 'gate').slice(0, 3).map((gate, i) => ({
      id: `el-logo-${i}`, type: 'groundLogo', name: '', logoId: LOGOS[i].id, position: { ...gate.position },
      yaw: gate.yaw, pitch: 0, yawOverridden: true, dims: { width: 6, depth: 3 },
    })),
  }),
  sponsoredTrack({
    name: 'whoop room',
    id: 'trk-5b0a5a02',
    time: 'tm-0000f012',
    file: 'tracks/json/micro-livingroom-1.json',
    speed: 4,
    extra: () => [[4.3, 5.4], [5.7, 5.4], [5, 7.2]].map(([x, y], i) => ({
      id: `el-flag-${i}`, type: 'flag', name: '', position: { x, y, z: 0 }, yaw: 0, pitch: 0,
      yawOverridden: false, dims: { ...ELEMENTS.flag.microDims },
    })),
  }),
];

/* What a viewer gets besides the picture, read off the page once a frame. */
const FRAME_STATE = `(() => {
  const view = document.getElementById('view');
  const under = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  const tiers = window.__gateTiers();
  return {
    buffer: view.width + ' by ' + view.height,
    ui: getComputedStyle(document.getElementById('ui')).display,
    cursor: under === view ? getComputedStyle(view).cursor : 'covered by ' + (under ? under.tagName : 'nothing'),
    lit: tiers.aim.active || tiers.gates.some((g) => g.tier !== 'dark' || g.glowOn || g.haloOn || g.cueOn),
  };
})()`;

/* Replay one lap, a screenshot and a state read at every step. */
async function captureLap(track, cam, clean) {
  const page = await openPage({
    root: ROOT, url: replayUrl({ id: track.id, time: track.time, cam, clean }), seed: [track.seed], ...SHOT,
  });
  try {
    await untilFlying(page);
    if (!clean) {
      /* The marks decode after the world is up. Wait for them, or clean=0
       * could pass for the wrong reason. */
      await page.until('window.__map().sponsorsPainted > 0', 10000);
    }
    const frames = [];
    let relit = null;
    const { durationMs } = await page.evaluate('window.__replayStep(0)');
    for (let vt = 0; ;) {
      await page.evaluate(NEXT_FRAME);
      const shot = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
      frames.push({ vt, magenta: magentaIn(Buffer.from(shot.data, 'base64')), ...(await page.evaluate(FRAME_STATE)) });
      if (clean && relit == null && vt >= durationMs / 2) {
        /* Light a gate the way a reset would, halfway round. The next
         * frame must be dark again. */
        relit = await page.evaluate('(() => { window.__setRaceNext(1); return window.__gateTiers().aim.active; })()');
      }
      if (vt >= durationMs) {
        break;
      }
      ({ vt } = await page.evaluate(`window.__replayStep(${STEP_MS})`));
    }
    return { frames, relit, painted: await page.evaluate('window.__map().sponsorsPainted') };
  } finally {
    await page.close();
  }
}

async function testSponsorsHidden() {
  for (const track of SPONSORED) {
    for (const cam of ['chase', 'fpv']) {
      const label = `${track.name} ${cam}`;
      const shown = await captureLap(track, cam, false);
      const most = Math.max(...shown.frames.map((f) => f.magenta));
      /* The controls: what clean=1 must take away is on screen without it. */
      if (most < 1000) {
        throw new Error(`${label} clean=0: most magenta in one frame is ${most}, under 1000, so this lap cannot see the logos`);
      }
      if (!(shown.painted > 0)) {
        throw new Error(`${label} clean=0: sponsorsPainted is ${shown.painted}`);
      }
      if (!shown.frames.some((f) => f.lit) || shown.frames.some((f) => f.ui === 'none' || f.cursor === 'none')) {
        throw new Error(`${label} clean=0: expected a lit gate, the UI and a cursor; ${JSON.stringify(shown.frames[0])}`);
      }

      /* Every clean=1 check is reported, not just the first to fail, so a
       * regression says which of them saw it. */
      const clean = await captureLap(track, cam, true);
      const { frames } = clean;
      const buffer = frames[0].buffer;
      const count = (bad) => frames.filter(bad).length;
      const problems = [
        [count((f) => f.magenta > 0), `frames with magenta, ${Math.max(...frames.map((f) => f.magenta))} px at most`],
        [clean.painted, 'sponsor marks painted'],
        [clean.relit === true ? 0 : 1, 'gate that could not be lit to test the glow'],
        [count((f) => f.lit), 'frames with a lit gate'],
        [count((f) => f.cursor !== 'none'), `frames with a cursor (${frames.map((f) => f.cursor).find((c) => c !== 'none')})`],
        [count((f) => f.ui !== 'none'), 'frames with #ui shown'],
        [count((f) => f.buffer !== buffer), `frames not at ${buffer}`],
        [Math.abs(frames.length - shown.frames.length), 'frames more or fewer than clean=0'],
      ].filter(([n]) => n !== 0).map(([n, what]) => `${n} ${what}`);
      if (problems.length) {
        throw new Error(`${label} clean=1 over ${frames.length} frames: ${problems.join('; ')}`);
      }
      console.log(`  [ok] ${label.padEnd(16)} clean=0: most ${String(most).padStart(6)} magenta px in a frame, `
        + `${shown.painted} marks painted | clean=1: 0 px in all ${clean.frames.length} frames, 0 painted, `
        + `glow dark (relit halfway), cursor none, #ui none, ${buffer} buffer held`);
    }
  }
  console.log(' ok   clean=1 hides every sponsor mark (gates, banners, flags, turf, whoop room), the glow and the cursor');
}

/*
 * A full replay posts nothing and counts nothing. The control first: the
 * same page and stub without ?replay= does send its visit, so a stub that
 * could not see one would fail here rather than pass below.
 */
async function testReplayGuards() {
  const seed = boardSeed({ id: PLAIN.id, document: PLAIN, ghosts: [AJAX] });
  const isVisit = (e) => e.path === '/api/stats/events' && e.body.includes('"kind":"visit"');
  const control = await openPage({ root: ROOT, url: `/index.html?map=custom&share=${PLAIN.id}&board=${BOARD}`, seed: [seed] });
  try {
    await control.until('window.__shellReady === true', 120000);
    await control.until('window.__sent.some((e) => e.path === "/api/stats/events" && e.body.includes(\'"kind":"visit"\'))', 10000);
  } finally {
    await control.close();
  }

  const page = await openPage({ root: ROOT, url: replayUrl({ id: PLAIN.id, time: AJAX.id, cam: 'fpv', clean: true }), seed: [seed] });
  try {
    await untilFlying(page);
    const { durationMs } = await page.evaluate('window.__replayStep(0)');
    for (let vt = 0; vt < durationMs;) {
      ({ vt } = await page.evaluate(`window.__replayStep(${STEP_MS})`));
      await page.evaluate(NEXT_FRAME);
    }
    const laps = await page.evaluate('window.__race().laps.length');
    if (laps !== 0) {
      throw new Error(`replay should not record laps, got ${laps}`);
    }
    const sent = await page.evaluate('window.__sent');
    const times = sent.filter((e) => /^\/api\/tracks\/[^/]+\/times/.test(e.path));
    if (times.length) {
      throw new Error(`replay should not POST times, got ${JSON.stringify(times)}`);
    }
    if (sent.some(isVisit)) {
      throw new Error('replay should not send a visit beacon');
    }
    console.log(` ok   a full ${durationMs} ms replay records 0 laps, posts no time and sends no visit `
      + `(${sent.length} sent to the board in all; the same page without ?replay= sends its visit)`);
  } finally {
    await page.close();
  }
}

const STATS = '/api/stats/events';
const PAGEHIDE = 'window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })); 0';

/*
 * Every frame from now on, read after the shell's own frame, until `when`
 * has held for `frames` of them: the stick, the craft, the replay's clock
 * as startMs + vt, the sim time the replay is reading, vt on its own, the
 * lap clock and where the camera is. startMs + vt rises on every frame,
 * through the lap's wrap as well, where vt alone drops back to 0. Thirty
 * seconds of wall clock at most, so a key that never lands fails rather
 * than hangs.
 */
function traceUntil(when, frames) {
  return `window.__keyTrace = (async () => {
    const out = [];
    let held = 0;
    const t0 = performance.now();
    while (held < ${frames} && performance.now() - t0 < 30000) {
      await new Promise((r) => requestAnimationFrame(r));
      const c = window.__craftState();
      const replay = window.__replayInfo();
      const clock = replay.clock;
      out.push({
        thr: window.__input.channels.throttle, landed: c.landed, flown: c.flownThisRun,
        clockMs: clock ? clock.startMs + clock.vt : null, vt: clock ? clock.vt : null,
        simMs: replay.simMs, cam: replay.cameraPosition,
      });
      if (held > 0 || (${when})) {
        held += 1;
      }
    }
    return out;
  })(); 0`;
}

/* The page's own throttle key held until the stick reads the top, which is
 * past any takeoff, and for ten frames more. Held in real wall time,
 * because that is the keyboard's hold clock: page.tap is a 30 ms press. */
async function holdThrottle(page) {
  const key = keyInfo(await page.evaluate('window.__input.throttleKeys.up'));
  await page.evaluate(traceUntil('window.__input.channels.throttle >= 0.99', 10));
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key }, page.sessionId);
  try {
    return await page.evaluate('window.__keyTrace');
  } finally {
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key }, page.sessionId);
  }
}

/* L with launch control switched on, and twelve frames after it. Then L
 * again, so the switch is off and the craft parked before anything else. */
async function pressLaunch(page) {
  await page.evaluate('window.__ui.settings.launchControl = true; 0');
  await page.tap('KeyL');
  await page.evaluate(traceUntil('true', 12));
  const trace = await page.evaluate('window.__keyTrace');
  await page.tap('KeyL');
  await page.until('window.__craftState().landed', 10000);
  await page.evaluate('window.__ui.settings.launchControl = false; 0');
  return trace;
}

/* The kind of every event that reached the stats endpoint, once each
 * beacon's body has been read out of its Blob. */
async function statsKinds(page) {
  await page.until('window.__sent.every((e) => e.body !== "")', 5000);
  const sent = await page.evaluate('window.__sent');
  return sent.filter((e) => e.path === STATS).map((e) => JSON.parse(e.body).kind);
}

/*
 * THE STICKS DO NOTHING TO A REPLAY, AND NOTHING IS COUNTED.
 *
 * A replay has no pilot, but the page still reads the keyboard and any radio
 * plugged in, and a person recording at the keys will touch them. Two
 * presses can unpark the craft: the throttle past takeoff, and L with launch
 * control on, which stages it on the stand. Held, either one stops the
 * replay: every other frame unparks the craft and rebuilds the lap clock
 * from the plant's step index, which a replay leaves at 0, and the frame
 * between parks it again, so the ghost goes back to the start of its lap
 * and stays there. A takeoff also counts the capture as a flight: a session
 * beacon at once, a flush on the way out.
 *
 * So both go to a replay, and it must stay parked with its clock advancing
 * on every frame, flownThisRun false every frame, and nothing at all sent to
 * the stats endpoint, a pagehide included. The control is the same presses
 * through the same harness on the same course without ?replay=: there the
 * throttle takes off and sends its session and its flush, and L stages, so
 * a key or a stub that never arrived fails there rather than passing here.
 */
async function testReplayIgnoresSticks() {
  const seed = boardSeed({ id: PLAIN.id, document: PLAIN, ghosts: [AJAX] });
  const control = await openPage({
    root: ROOT, url: `/index.html?map=custom&share=${PLAIN.id}&board=${BOARD}`, seed: [seed], ...SHOT,
  });
  let flew;
  try {
    await control.until('window.__shellReady === true', 120000);
    await control.until("(() => { const m = window.__map(); return m.id === 'custom' && m.ready && m.gates > 0; })()", 60000);
    /* Into the race the way a pilot goes: past the first run gate, Fly,
     * and Enter on the launch card. */
    await control.evaluate(`(() => {
      const ui = window.__ui;
      ui.firstRun = false;
      ui.craftGate = false;
      if (!ui.mode) {
        ui.mode = 'race';
      }
      ui.act('fly');
      return 0;
    })()`);
    await control.until("window.__ui.screen === 'launch'", 20000);
    await control.tap('Enter');
    await control.until("window.__ui.screen === 'flight' && window.__craftState().mode === 'flight'", 60000);
    const staged = await pressLaunch(control);
    if (!staged.some((f) => !f.landed)) {
      throw new Error(`control: L with launch control on should stage the craft, got ${JSON.stringify(staged)}`);
    }
    const climb = await holdThrottle(control);
    if (!climb.some((f) => f.flown && !f.landed)) {
      throw new Error(`control: the throttle at the top should take off, got ${JSON.stringify(climb.slice(-3))}`);
    }
    await control.until(`window.__sent.some((e) => e.path === "${STATS}" && e.body.includes('"kind":"session"'))`, 5000);
    await control.evaluate(PAGEHIDE);
    await control.until(`window.__sent.some((e) => e.path === "${STATS}" && e.body.includes('"kind":"flush"'))`, 5000);
    flew = await statsKinds(control);
  } finally {
    await control.close();
  }

  const page = await openPage({
    root: ROOT, url: replayUrl({ id: PLAIN.id, time: AJAX.id, cam: 'fpv', clean: true }), seed: [seed], ...SHOT,
  });
  try {
    await untilFlying(page);
    const staged = await pressLaunch(page);
    const held = await holdThrottle(page);
    await page.evaluate(PAGEHIDE);
    await page.evaluate(NEXT_FRAME);
    const kinds = await statsKinds(page);
    const frames = [...staged, ...held];
    const stood = (trace) => trace.filter((f, i) => i > 0 && !(f.clockMs > trace[i - 1].clockMs)).length;
    const top = Math.max(...held.map((f) => f.thr));
    /* Every claim is reported, not just the first to fail. */
    const problems = [
      [top >= 0.99 ? 0 : 1, `throttle that never reached the top of the stick, ${top} at most`],
      [frames.filter((f) => f.clockMs == null).length, 'frames with no replay clock'],
      [staged.filter((f) => !f.landed).length, 'frames unparked after L'],
      [stood(staged), `frames where the replay clock did not advance after L (${staged.map((f) => Math.round(f.clockMs)).join(' ')})`],
      [held.filter((f) => !f.landed).length, 'frames unparked under the throttle'],
      [stood(held), `frames where the replay clock did not advance under the throttle (${held.map((f) => Math.round(f.clockMs)).join(' ')})`],
      [frames.filter((f) => f.flown).length, 'frames with flownThisRun true'],
      [kinds.length, `events sent to the stats endpoint (${kinds.join(', ')})`],
    ].filter(([n]) => n !== 0).map(([n, what]) => `${n} ${what}`);
    if (problems.length) {
      throw new Error(`replay over ${frames.length} frames: ${problems.join('; ')}`);
    }
    const ran = held[held.length - 1].clockMs - held[0].clockMs;
    console.log(` ok   L and the throttle held at the top leave a replay parked for all ${frames.length} frames, its clock `
      + `advancing on every one (${Math.round(ran)} ms across the throttle), flownThisRun false, 0 stats events after a pagehide; `
      + `the same keys without ?replay= stage, take off and send ${flew.join(', ')}`);
  } finally {
    await page.close();
  }
}

/*
 * R RESTARTS A REPLAY FROM THE TOP, EVEN AFTER IT HAS LOOPED.
 *
 * R, the radio's restart switch and the pause menu's Restart run all call
 * reset(), which puts the lap clock back to 0. A real time replay reads
 * that clock from startMs, the sim time its lap last started at. Before
 * the owner's answer of 2026-09-26, reset() left startMs where it was:
 * before the first loop that is 0 and R restarted the replay, but after
 * one, vt went below zero and the ghost stood on its first frame for as
 * long as the replay had run up to that loop.
 *
 * So the replay runs in real time past its first loop and R goes in
 * through the keyboard. The frame it lands on is the one where the lap
 * clock went back, which it does with or without the fix, so a key that
 * never arrived fails rather than passes. From that frame vt must start
 * within the frame's own steps of 0 (one capped frame, 100 ms) and rise on
 * every frame, and the FPV camera, which sits on the ghost, must move on
 * every frame.
 *
 * Then step mode, which the owner's answer leaves alone: the capture
 * drives vt there through __replayStep, so R must not rewind it, and the
 * next step carries on from where the capture was.
 */
async function testReplayRestartsOnR() {
  const page = await openPage({
    root: ROOT,
    url: replayUrl({ id: PLAIN.id, time: AJAX.id, cam: 'fpv', clean: true }),
    seed: [boardSeed({ id: PLAIN.id, document: PLAIN, ghosts: [AJAX] })],
    ...SHOT,
  });
  try {
    await untilFlying(page);
    /* One loop of the lap in real time. startMs is the sim time of it. */
    await page.until('window.__replayInfo().clock.startMs > 0', 60000);
    const before = await page.evaluate('window.__replayInfo()');
    await page.evaluate(traceUntil(`window.__replayInfo().simMs < ${before.simMs}`, 12));
    await page.tap('KeyR');
    const trace = await page.evaluate('window.__keyTrace');
    const atR = trace.findIndex((f) => f.simMs < before.simMs);
    if (atR < 0) {
      throw new Error(`R never landed: the lap clock never went back below ${before.simMs} ms in ${trace.length} frames`);
    }
    const after = trace.slice(atR);
    const moved = (a, b) => Math.hypot(a.cam.x - b.cam.x, a.cam.y - b.cam.y, a.cam.z - b.cam.z) > 0.001;
    const vts = after.map((f) => Math.round(f.vt)).join(' ');

    /* Step mode, on the same page. */
    await page.evaluate('window.__replayStep(0)');
    const stepped = await page.evaluate('window.__replayStep(1500)');
    const stepSim = await page.evaluate('window.__replayInfo().simMs');
    await page.tap('KeyR');
    await page.until(`window.__replayInfo().simMs < ${stepSim}`, 10000);
    await page.evaluate(NEXT_FRAME);
    const stepAfter = await page.evaluate('window.__replayInfo().clock.vt');
    const next = await page.evaluate(`window.__replayStep(${STEP_MS})`);

    /* Every claim is reported, not just the first to fail. */
    const problems = [
      [after[0].vt >= 0 && after[0].vt <= 100 ? 0 : 1, `first frame after R at vt ${after[0].vt.toFixed(1)} ms, not within 100 ms of 0`],
      [after.filter((f, i) => i > 0 && !(f.vt > after[i - 1].vt)).length, `frames after R where vt did not advance (${vts})`],
      [after.filter((f, i) => i > 0 && !moved(f, after[i - 1])).length, `frames after R where the FPV camera did not move (vt ${vts})`],
      [stepAfter === stepped.vt ? 0 : 1, `step mode: R moved vt from ${stepped.vt} to ${stepAfter}`],
      [next.vt === stepped.vt + STEP_MS ? 0 : 1, `step mode: the step after R reached ${next.vt} ms, not ${stepped.vt + STEP_MS}`],
    ].filter(([n]) => n !== 0).map(([n, what]) => `${n} ${what}`);
    if (problems.length) {
      throw new Error(`R after a loop (startMs ${Math.round(before.clock.startMs)} ms): ${problems.join('; ')}`);
    }
    console.log(` ok   R after the replay looped (startMs ${Math.round(before.clock.startMs)} ms) `
      + `starts it again: vt ${after[0].vt.toFixed(1)} ms on the frame R landed, rising on all ${after.length - 1} frames after it `
      + `to ${Math.round(after[after.length - 1].vt)} ms, with the FPV camera moving on every one; in step mode R leaves vt at `
      + `${stepAfter} and the next step reaches ${next.vt}`);
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('replay-test: headless browser checks for replay mode\n');
  const tests = [
    testMagentaCounter, testNormalBoot, testReplaySuccess, testFailuresRestore,
    testSponsorsHidden, testReplayGuards, testReplayIgnoresSticks, testReplayRestartsOnR,
  ];
  let fail = 0;
  for (const test of tests) {
    try {
      await test();
    } catch (e) {
      console.log(` FAIL ${test.name}: ${e.message}`);
      fail += 1;
    }
  }
  console.log(`\n${tests.length} tests: ${tests.length - fail} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
