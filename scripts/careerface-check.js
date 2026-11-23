/*
 * careerface-check.js: Into the Goggles says why a turn is not counting, in
 * the real shell.
 *
 * WHY THIS EXISTS. bug-47398013, "giving the same commands and not
 * completeing the mission", on lesson 1-3. Its turns count only inside a
 * cylinder over the pad from 0.4 m to 6 m, the briefing asks for "a low
 * hover", and the lesson showed nothing about that window: the height gauge
 * drew no band for the face objective, and the coach's one line for being
 * out of it was "Stay low, over the pad.", whichever way out the craft was.
 * Measured on unchanged main with the probe this check grew from: hovering
 * at 0.3 m over the pad and turning through every flag, nothing counted for
 * 25 s and that line was up the whole time, telling the pilot to keep doing
 * exactly what was not working.
 *
 * WHAT IT DOES, on a fresh browser at a desktop size, flying the lesson the
 * way a pilot who can see the flags flies it: a pilot in the page holds a
 * height on the throttle (Angle mode keeps it level) and, once a section
 * lets it, turns the nose onto the flag the judge is waiting for, every
 * frame. No craft is placed: the flight is the real plant's.
 *
 *   low     held at 0.25 m over the pad: the coach says go higher, not stay
 *           low, the height gauge is up with the zone's band, nothing has
 *           counted, and a report written there names the objective's 'low'
 *   high    held at 7 m: the coach says too high
 *   flown   then held at 1.5 m, turning onto each flag: the lesson finishes
 *           with a medal, so none of those lines is a dead end
 *
 * Every wait is on state, never a fixed sleep standing in for one.
 *
 * ON A SLOW MACHINE. The pilot below flies once per drawn frame, as a person
 * does, so the frame rate is part of what it flies through. It used to be
 * tuned in frames: a per frame integrator, a velocity smoothed over frames
 * from the drawn position, and a derivative gain that put the loop's
 * crossover near 9 rad/s. That holds a height where the page draws near 60.
 * The 2026-11-23 bug board run ran it where the page draws 14 to 16 frames
 * a second, on main and on the commit that wrote it, and it failed both:
 * asked for 0.25 m it swung from 1.5 to 9.6 m, because a third of a second
 * of lag at that crossover is most of a cycle. The lesson was never at
 * fault (the same run finished it); the check could not fly it. So the pilot
 * is now written in seconds: the plant's own vertical speed rather than one
 * smoothed from the picture, the page's own hover throttle as its start,
 * gains per second with the crossover near 2 rad/s, an integrator that only
 * runs while flying near the goal, and a goal that moves at half a metre a
 * second as a pilot eases a height. Measured holding 0.25 m to the
 * centimetre at 16 frames a second, and inside the lesson's window at 8.
 *
 * `--slow=N` slows the page N times with Chromium's own CPU throttle, so the
 * check can stand in for a slower machine than the one it runs on, and
 * the frame rate it flew at is printed at the end. `npm run
 * check:career:slow` runs the career's browser checks at --slow=4.
 *
 * Not part of `npm run verify`. Run it as `npm run check:careerface`.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The board is never asked: a lesson flies its stand in, as career-ui-check
 * explains. */
const NO_BOARD = `(() => {
  const real = window.fetch.bind(window);
  const theirs = (u) => { try { const x = new URL(u, location.href); return x.origin !== location.origin; } catch (e) { return false; } };
  window.fetch = (input, opts) => {
    const url = String(input && input.url ? input.url : input);
    return theirs(url) && /\\/api\\//.test(url) ? Promise.reject(new TypeError('Failed to fetch')) : real(input, opts);
  };
  navigator.sendBeacon = () => true;
})();`;

const seed = [NO_BOARD, `try {
  const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
  s.graphics = 'low'; s.graphicsAuto = false; s.airframeAsked = true;
  localStorage.setItem('webfpv.settings.v3', JSON.stringify(s));
} catch (e) { /* the run boots on the defaults */ }`];

/*
 * The pilot, in the page, every frame: a height held on the throttle about
 * the page's own hover, and the yaw that turns onto the next flag. The height
 * it holds is window.__faceTarget, so a section moves it from here; the goal
 * it flies to walks there at half a metre a second. Everything is per
 * second, never per frame, so the pilot is the same pilot at 60 frames a
 * second and at 8 (see ON A SLOW MACHINE above). It keeps what the gauge and
 * the judge said while it flew, the most headings the judge ever counted,
 * and how many frames it flew and the longest gap between two.
 */
const PILOT = `(() => {
  const pad = window.__facePad;
  const base = window.__faceHover;
  const KP = 0.03;
  const KD = 0.06;
  const KI = 0.015;
  let lastT = null;
  let integ = 0;
  let goal = null;
  window.__faceSeen = { maxIndex: 0, frames: 0, maxGapMs: 0, t0: performance.now() };
  const tick = (now) => {
    if (!window.__career || window.__career.state() !== 'flight') {
      return;
    }
    const dt = lastT == null ? 1 / 60 : Math.min(0.25, Math.max(1e-3, (now - lastT) / 1000));
    if (lastT != null) {
      window.__faceSeen.maxGapMs = Math.max(window.__faceSeen.maxGapMs, now - lastT);
    }
    lastT = now;
    window.__faceSeen.frames += 1;
    window.__faceSeen.last = now;
    const c = window.__craftState();
    const h = c.worldY - pad.y;
    const vy = c.vel ? c.vel.y : 0;
    const s = window.__career.status();
    const cur = s && s.current;
    if (cur && cur.kind === 'face') {
      window.__faceSeen.maxIndex = Math.max(window.__faceSeen.maxIndex, cur.state.index);
    }
    if (goal == null) {
      goal = h;
    }
    goal = Math.max(goal - 0.5 * dt, Math.min(goal + 0.5 * dt, window.__faceTarget));
    const e = goal - h;
    if (!c.landed && Math.abs(e) < 0.3) {
      integ = Math.max(-0.08, Math.min(0.08, integ + e * KI * dt));
    }
    const thr = Math.max(0, Math.min(1, base + KP * e - KD * vy + integ));
    /* The nose onto the flag the judge is waiting for, wherever the craft
     * is: a pilot who can see the flag turns to it. Heading as the judge
     * reads it (geometry.js headingOf); a positive error is a turn left,
     * which is negative yaw stick. Saturated past 30 degrees. Only once
     * window.__faceYaw says so, so the turns start where a section wants
     * them to and none is counted on the way there. */
    let yaw = 0;
    if (window.__faceYaw && cur && cur.kind === 'face' && c.fwd && cur.objective.headings[cur.state.index] != null) {
      const have = Math.atan2(-c.fwd.z, c.fwd.x);
      let err = cur.objective.headings[cur.state.index] - have;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err <= -Math.PI) err += 2 * Math.PI;
      yaw = Math.max(-0.35, Math.min(0.35, (-err / (Math.PI / 6)) * 0.35));
    }
    window.__stick(0, 0, yaw, thr);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

/* The lesson and the HUD as the pilot sees them, in one read. */
const LOOK = `(() => {
  const c = window.__craftState();
  const s = window.__career.status();
  const cur = s && s.current;
  const coach = document.querySelector('#career .cr-coach.show');
  const alt = document.querySelector('#career .cr-alt');
  const band = alt && alt.querySelector('.cr-alt-band');
  return {
    career: window.__career.state(),
    phase: s ? s.phase : null,
    kind: cur ? cur.kind : null,
    detail: cur ? cur.detail : null,
    index: cur && cur.state ? cur.state.index : null,
    h: +(c.worldY - window.__facePad.y).toFixed(2),
    coach: coach ? coach.textContent.trim() : '',
    gauge: Boolean(alt && alt.classList.contains('show')),
    band: band ? parseFloat(band.style.height) || 0 : 0,
    medal: s ? s.medal || null : null,
    seen: window.__faceSeen,
  };
})()`;

let fails = 0;
let passes = 0;
let flown = '';
const check = (what, ok, got = '') => {
  if (ok) {
    passes += 1;
  } else {
    fails += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}${got === '' ? '' : `: ${got}`}`);
  return ok;
};

/* A slower machine than this one, on --slow=N. See ON A SLOW MACHINE. */
const SLOW = Number((process.argv.find((a) => a.startsWith('--slow=')) || '').slice(7)) || 1;

const t0 = Date.now();
const state = (s) => `window.__career && window.__career.state() === ${JSON.stringify(s)}`;
const page = await openPage({ root: ROOT, width: 1280, height: 720, seed });
if (SLOW > 1) {
  await page.cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW }, page.sessionId);
}
const look = () => page.evaluate(LOOK);

/* Hold a height until the page says `cond` (a JS expression over the LOOK
 * object `v`), and return what it said; null after `ms`. */
async function holdAt(height, cond, ms) {
  await page.evaluate(`window.__faceTarget = ${height}`);
  try {
    await page.until(`(() => { const v = ${LOOK}; return ${cond}; })()`, ms);
  } catch (e) {
    return null;
  }
  return look();
}

console.log('\nInto the Goggles, at three heights');
try {
  await page.until('!!window.__shellReady', 180000);
  await page.evaluate("window.__career.open('1-3')");
  await page.until(state('briefing'), 60000);
  await page.until("(() => { const b = document.querySelector('#career .cr-brief .cr-btn.primary'); return b && !b.disabled; })()", 90000);
  await page.evaluate('window.__career.fly()');
  await page.until(state('flight'), 60000);
  /* The drawn craft moves to the lesson's spawn on the first frame drawn
   * after the lesson starts (career-ui-check found that race). */
  const draws0 = await page.evaluate('window.__timerYield().draws');
  await page.until(`window.__timerYield().draws >= ${draws0 + 2} && window.__craftState().landed`, 30000);
  await page.evaluate(`(() => {
    const c = window.__craftState();
    window.__facePad = { x: c.worldX, y: c.worldY, z: c.worldZ };
    window.__faceTarget = 1.0;
    window.__faceYaw = false;
    /* The hover the keyboard springs to on this model, airframe and pack,
     * as a percentage of stick: the throttle the pilot starts from. */
    window.__faceHover = window.__ui.bugSnapshot().stick.keyHover / 100;
  })()`);
  await page.evaluate(PILOT);

  /* Off the pad to a metre, which is Take off; then down to 0.25 m, under
   * the zone's 0.4 m floor, and wait for the coach to have settled on it. */
  const up = await holdAt(1.0, "v.kind === 'face'", 30000);
  const restY = await page.evaluate('window.__facePad.y');
  check('taken off, the objective is the turns', Boolean(up), `${JSON.stringify(up)}, at rest y ${restY.toFixed(3)} m`);
  /* 0.25 m: the floor is 0.4 m, and the craft rests with its middle
   * 0.033 m up, so this is about 0.12 m under it, room for this pilot's few
   * centimetres of wander. No turning: whether a turn under the floor
   * counts is the judge's (tests/career/career-objectives.test.js), and
   * what is under test here is what the pilot is shown. The wait skips the
   * lines that are not the objective's: the hint the objective opens with,
   * and the fall warning a dip can raise for a moment. */
  const low = await holdAt(0.25, "v.h < 0.33 && v.h > 0.12 && v.coach !== '' && !/Turn (left|right)|turns the nose|falling|A low hover/.test(v.coach)", 40000);
  check('held at 0.25 m over the pad, the coach speaks to the height', Boolean(low), JSON.stringify(low));
  check('it says go higher, not stay low',
    Boolean(low) && /higher/i.test(low.coach) && !/stay low/i.test(low.coach), low ? low.coach : 'no line');
  check('the height gauge is up, with the zone band drawn', Boolean(low) && low.gauge && low.band > 4,
    low ? `gauge ${low.gauge}, band ${low.band} px` : '');
  check("the judge's detail is 'low', and no flag has counted", Boolean(low) && low.detail === 'low' && low.seen.maxIndex === 0,
    low ? `${low.detail}, ${low.seen.maxIndex} counted` : '');
  const report = await page.evaluate('(() => { const r = window.__ui.bugSnapshot(); return r.career || null; })()');
  check("a report written there names it: lesson 1-3, the turns, 'low'",
    Boolean(report) && report.lesson === '1-3' && report.kind === 'face' && report.detail === 'low', JSON.stringify(report));
  /* Over the top: 7 m, under the career's soft ceiling (25 m), so the line
   * is the objective's own. Climbed with the nose still, as a pilot eases up
   * through the zone, because a climb with the turns on counts the flags on
   * the way through it (the zone runs to 6 m) and finishes the lesson before
   * the top. The turns start once the craft is over it: from there the
   * pilot turns onto each flag, and up there none may count. */
  const up7 = await holdAt(7, 'v.h > 6.3', 60000);
  await page.evaluate('window.__faceYaw = true');
  const high = up7 ? await holdAt(7, "v.h > 6.3 && /too high/i.test(v.coach)", 40000) : null;
  check('held at 7 m, turning onto the flags, the coach says too high', Boolean(high) && /too high/i.test(high.coach) && high.detail === 'high',
    high ? `${high.coach} (${high.detail}, ${high.h} m)` : `no such line, climbed: ${JSON.stringify(up7)}`);
  check('and nothing counted on the way up or over the top', Boolean(high) && high.seen.maxIndex === 0,
    high ? `${high.seen.maxIndex} counted` : '');

  /* And back to a hover the zone takes, turning onto each flag: it
   * finishes. */
  await page.evaluate('window.__faceTarget = 1.5');
  await page.until("window.__career.state() !== 'flight'", 60000).catch(() => {});
  const done = await look();
  check('at 1.5 m, turned onto each flag, the lesson finishes with a medal',
    done.career === 'results' && done.phase === 'complete' && Boolean(done.medal), JSON.stringify(done));

  /* The board this page cannot reach is the one error allowed, as in
   * career-ui-check. */
  const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
  check('no uncaught error or console.error', errs.length === 0, errs.slice(0, 4).join(' | ') || 'none');
} catch (e) {
  check('the check ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
} finally {
  /* What machine this run stood in for: the frames the pilot flew. */
  const f = await page.evaluate(`(() => { const s = window.__faceSeen; return s && s.last ? { frames: s.frames, s: (s.last - s.t0) / 1000, gap: s.maxGapMs } : null; })()`).catch(() => null);
  if (f && f.s > 0) {
    flown = `, flown at ${(f.frames / f.s).toFixed(1)} frames a second, longest gap ${Math.round(f.gap)} ms${SLOW > 1 ? `, CPU slowed ${SLOW} times` : ''}`;
  }
  await page.close();
}

console.log(`\ncareerface-check: ${passes} passed, ${fails} failed, ${Math.round((Date.now() - t0) / 1000)} s${flown}`);
process.exit(fails ? 1 : 0);
