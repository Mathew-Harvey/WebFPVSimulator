/*
 * tuneinvite-check.js: the invitation to help tune flight feel, in the real
 * shell, in headless Chromium, with real flights and real taps.
 *
 * scripts/tuneinvite-selftest.js holds the counting, the due test, the words
 * and the card's logic against a stub in a second. What it cannot see is the
 * shell: that a real landing in main.js reaches the card, that the card is on
 * the glass and clear of everything else on it, that a tap on it reaches its
 * button, that the sliders come when the answer is yes, that nothing is asked
 * in the air, and that the page touches storage for it at a landing and
 * nowhere else. Each scenario opens its own page on its own profile, seeds
 * exactly what its pilot would have stored, and flies:
 *
 *   A  tracks, end to end: one track already flown, this one flown for real,
 *      a hop that is not enough and then a flight that is. Nothing is asked
 *      in the air, the card comes on the ground with the track words, and a
 *      tap on Yes puts the sliders on the glass
 *   B  freestyle: half a second short of ten minutes, a hop crosses it, and a
 *      tap on No leaves the sliders away, for good
 *   C  a newcomer who is due but has a first flight guide running: not asked
 *   D  a phone held sideways with the thumb sticks up: the card is inside the
 *      screen, clear of the plates and the clock, and a finger reaches Yes
 *   E  a pilot who has not met the Weight card: the two are never up at once
 *   F  Escape with the card up puts it away, and it comes back with the
 *      flight, asked once
 *   G  the Settings menu's own switch for Advanced flight feel tuning: there,
 *      under its own heading, off for a pilot who never touched it, a click on
 *      On turns the mode on in the page and in the saved settings and puts the
 *      sliders on the glass at the next flight screen, the Quad room's row
 *      reads the same, and a click on Off takes it all away again
 *   H  the card across desktop windows, from 1920 by 1080 down to 1280 by 400
 *      (under the sheet's short screen line, where the Weight card hangs off
 *      the bottom): inside the screen and over nothing at every size
 *   I  the card across landscape phones and tablets with the thumb sticks up
 *   K  a pilot who ignores it: it is put away at every takeoff, comes back at
 *      the next landing, counts each time it was seen, and stops after three
 *
 * Every flight is flown by the page itself, hands only on the throttle, from
 * the same hooks scripts/tune-check.js uses, because the question is about a
 * landing and not about flying anywhere.
 *
 * Usage:
 *   npm run check:tuneinvite
 *   INVITE_ONLY=A,D npm run check:tuneinvite     just those scenarios
 *   INVITE_SHOTS=/abs/dir npm run check:tuneinvite   also leaves pictures
 *
 * It is not part of verify: it checks the shell, not the physics. Console
 * noise from a board that is not running is filtered the way
 * scripts/shell-check.js filters it.
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

import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { hoverStickPercent } from '../configs/rates.js';
import { INVITE_FREESTYLE_MS, INVITE_KEY, INVITE_TRACK_AIR_MS, courseKeyOf } from '../src/ui/tuneinvite.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const rows = [];
let failed = 0;

function check(name, ok, detail) {
  rows.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) {
    failed += 1;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ONLY = (process.env.INVITE_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);
const SHOTS = process.env.INVITE_SHOTS || '';

/* The builder's autosave seat for a five inch track, as scripts/shots.js and
 * scripts/firstflight-check.js seed it. */
const FULL_SEAT = 'webfpv.trackbuilder.autosave.v1';
const FULL_DOC = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'course-reference.json'), 'utf8'));
const FIVE_TRACK = { [FULL_SEAT]: JSON.stringify(FULL_DOC) };
const TRACK_LINK = '/index.html?map=custom&craft=5inch&fly=1';
const YARD_LINK = '/index.html?map=built&craft=5inch&fly=1';

/* A pilot who has been round the title screen: not a first run, every guide
 * given, the Weight slider's own card seen. What a pilot with two tracks
 * flown has long since been. */
const RETURNING = {
  hasFlown: true, map: 'custom', guidedRace: true, guidedWhoop: true, guidedFreestyle: true,
};
const WEIGHT_SEEN = { 'webfpv.airhint.v2': '1' };

const FLOWN = INVITE_TRACK_AIR_MS;
const stateOf = (tracks = {}, free = 0) => ({
  v: 1, tracks, free, asked: 0, answer: '',
});

/*
 * The seed: stored settings and extra keys, written once per tab, before the
 * first line of the app, through the door the pilot's own browser uses; then
 * a probe on the storage that counts what is done to the invitation's key.
 * The probe goes in AFTER the seed so the seeding is not counted, and keeps
 * the real getItem for the check's own reads so reading the key to look at it
 * is not counted either.
 */
function seedFor({ settings, keys = {}, invite }) {
  const extra = { ...keys };
  if (invite) {
    extra[INVITE_KEY] = JSON.stringify(invite);
  }
  return `try {
    if (!sessionStorage.getItem('ti-seeded')) {
      sessionStorage.setItem('ti-seeded', '1');
      localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(${JSON.stringify({
    graphics: 'low', graphicsAuto: false, ...settings,
  })}));
      const extra = ${JSON.stringify(extra)};
      for (const k of Object.keys(extra)) { localStorage.setItem(k, extra[k]); }
    }
  } catch (e) { /* Storage refused. The checks below will say so. */ }
  try {
    const io = window.__inviteIO = { reads: 0, writes: 0 };
    const proto = Storage.prototype;
    window.__rawGet = proto.getItem;
    const get = proto.getItem;
    const set = proto.setItem;
    proto.getItem = function (k) { if (k === ${JSON.stringify(INVITE_KEY)}) { io.reads += 1; } return get.apply(this, arguments); };
    proto.setItem = function (k) { if (k === ${JSON.stringify(INVITE_KEY)}) { io.writes += 1; } return set.apply(this, arguments); };
  } catch (e) { /* No probe; the checks that need it will say so. */ }`;
}

async function launched(page, ms = 150000) {
  await page.until(
    "window.__shellReady === true && window.__ui.screen === 'flight' && window.__craftState().mode === 'flight'",
    ms,
  );
  /* Count the landings the page reports from here on. The flights are flown a
   * frame behind, at about three a second, so a touchdown with the throttle
   * still up can lift the quad off again and set it down once or twice more
   * (the "Off again" path in src/main.js). Each of those is a landing and each
   * may write, so what a check can say about the writes is that they are
   * bounded by the landings, which is what `landings` is for. The wrapper is
   * on the instance and changes nothing the method does. */
  await page.evaluate(`(() => {
    const ui = window.__ui;
    if (ui.__landings === undefined) {
      const was = ui.noteLanding;
      ui.__landings = 0;
      ui.noteLanding = function (...args) { ui.__landings += 1; return was.apply(this, args); };
    }
  })()`);
}

/* One look at everything the checks ask about, in one read. */
async function look(page) {
  return JSON.parse(await page.evaluate(`JSON.stringify((() => {
    const ui = window.__ui;
    const raw = (k) => { try { return window.__rawGet.call(localStorage, k); } catch (e) { return null; } };
    const card = document.querySelector('.osd-invite-hint');
    const vis = (n) => {
      if (!n) { return false; }
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };
    let invite = null;
    try { invite = JSON.parse(raw(${JSON.stringify(INVITE_KEY)}) || 'null'); } catch (e) { invite = 'unreadable'; }
    let stored = {};
    try { stored = JSON.parse(raw(${JSON.stringify(SETTINGS_KEY)}) || '{}'); } catch (e) { stored = {}; }
    const items = [...document.querySelectorAll('.osd-tune-item')].filter(vis).map((n) => n.querySelector('.osd-air-cap').textContent);
    const hints = [...document.querySelectorAll('.osd-air-hint')].filter(vis).length;
    return {
      screen: ui.screen,
      cardUp: vis(card),
      cardHidden: card ? card.hidden : null,
      title: card ? card.querySelector('.osd-air-hint-title').textContent : null,
      body: card ? card.querySelector('.osd-air-hint-body').textContent : null,
      yes: card ? card.querySelector('.osd-invite-yes').textContent : null,
      no: card ? card.querySelector('.osd-invite-no').textContent : null,
      hintsUp: hints,
      tuneHintUp: vis(document.querySelector('.osd-tune-hint')),
      sliders: items,
      weightUp: vis(document.querySelector('.osd-air .osd-air-hint:not(.osd-tune-hint):not(.osd-invite-hint)')),
      feel: Boolean(ui.settings.feelTuning),
      feelStored: Boolean(stored.feelTuning),
      guided: ui.guided,
      inviteStored: invite,
      inviteLive: { asked: ui.invite.state.asked, answer: ui.invite.state.answer, armed: ui.invite.armed, up: ui.invite.up },
      io: window.__inviteIO || null,
      landings: ui.__landings || 0,
      course: window.__map ? window.__map().course : null,
      craft: window.__craftState ? { landed: window.__craftState().landed, airMs: window.__craftState().airMs } : null,
      fault: window.__frameFault ? window.__frameFault.message : null,
    };
  })())`));
}

/*
 * In the page: take off, hold three metres on the throttle alone until the
 * run's airtime reaches `airMs` (a total for the run, not for this flight),
 * then come down slowly to a landing, and say what was seen on the way.
 * `cardInAir` counts frames in which the invitation was on the glass while the
 * quad was off the ground, `bothCards` frames in which more than one hint card
 * was.
 *
 * THE CONTROLLER IS ON CLIMB RATE, NOT ON HEIGHT, and that is the second
 * draft. The first was scripts/tune-check.js's height hold with a descent
 * added, and it was wrong for this: a headless page draws about three frames a
 * second, so a height loop with a takeoff burst threw the quad 30 m up, the
 * descent then free fell, and the quad bounced for two minutes without ever
 * landing, so the check never reached the card. This one asks for a climb
 * rate (up to 1.5 metres a second, easing into the height, then 0.9, 0.5 and
 * 0.3 coming down), trims a little round the hover the sim itself quotes
 * (hoverStickPercent, the same table the menu reads), never goes under a
 * quarter throttle in the air, and at the last hand's breadth takes the
 * throttle off, which the sim needs: a craft that took off is held "taking
 * off" until the stick is back at idle (TAKEOFF_RELEASE in src/main.js), and
 * without it the quad sits on the ground for seconds without being set down.
 * Measured with a trace on the same page: a hop lands in 6 s at 0.04 m/s, a
 * flight of 33 s of airtime holds 3.00 m to a centimetre and lands at 0.14.
 */
const HOVER0 = hoverStickPercent(100, '5inch') / 100;
const fly = ({ airMs, height = 3, capS = 120 }) => `(async () => {
  const C = ${JSON.stringify({ airMs, height, capS, hover0: HOVER0 })};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  let hover = window.__hover || C.hover0;
  let prev = null;
  const out = {
    landed: false, left: false, faulted: false, capped: false, maxAbove: 0, airMs: 0, cardInAir: 0, bothCards: 0, frames: 0, touchVz: null,
  };
  const shown = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden'; };
  await new Promise((done) => {
    const t0 = performance.now();
    function f(now) {
      const t = (now - t0) / 1000;
      const g = window.__ground();
      const cs = window.__craftState();
      out.frames += 1;
      out.maxAbove = Math.max(out.maxAbove, g.above);
      out.airMs = cs.airMs;
      if (g.above > 0.4) { out.left = true; }
      const card = document.querySelector('.osd-invite-hint');
      if (out.left && !g.landed && card && !card.hidden) { out.cardInAir += 1; }
      if ([...document.querySelectorAll('.osd-air-hint')].filter(shown).length > 1) { out.bothCards += 1; }
      const dt = prev ? Math.max(0.001, (now - prev.t) / 1000) : 0.016;
      const vz = prev ? (g.above - prev.above) / dt : 0;
      /* Down only after a real climb, so a flight begun with the airtime already in
       * still goes up and comes back, and is not a touch and go on the pad. */
      const down = out.maxAbove >= 1.2 && cs.airMs >= C.airMs;
      let cmd = clamp(0.7 * (C.height - g.above), -0.8, 1.5);
      if (down) { cmd = g.above > 1.5 ? -0.9 : (g.above > 0.5 ? -0.5 : -0.3); }
      let thr;
      if (!out.left && g.above < 0.3) {
        thr = 0.55;
      } else {
        const e = cmd - vz;
        hover = clamp(hover + 0.02 * e * dt, C.hover0 - 0.05, C.hover0 + 0.1);
        thr = clamp(hover + 0.03 * e, 0.25, 0.7);
      }
      if (down && g.above < 0.15) { thr = 0.1; }
      prev = { t: now, above: g.above };
      window.__stick(0, 0, 0, thr);
      window.__hover = hover;
      if (window.__frameFault) { out.faulted = true; }
      if (out.left && g.landed) { out.landed = true; out.touchVz = +vz.toFixed(2); done(); }
      else if (out.faulted) { done(); }
      else if (t > C.capS) { out.capped = true; done(); }
      else { requestAnimationFrame(f); }
    }
    requestAnimationFrame(f);
  });
  window.__stick(0, 0, 0, 0);
  return JSON.stringify(out);
})()`;

async function flyOnce(page, cfg) {
  return JSON.parse(await page.evaluate(fly(cfg)));
}

/* Hold the sticks where they were and let the frames run, so a card that is
 * going to come has come. */
async function settleFrames(page, ms) {
  await sleep(ms);
}

async function cardUp(page, ms = 15000) {
  try {
    await page.until("(() => { const c = document.querySelector('.osd-invite-hint'); return !!c && !c.hidden; })()", ms);
    return true;
  } catch (e) {
    return false;
  }
}

/* Where everything the card must stay clear of is, and where the card and its
 * buttons are, in one read; the sums are done here. */
async function geometry(page) {
  return JSON.parse(await page.evaluate(`JSON.stringify((() => {
    const rect = (n) => { const b = n.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const vis = (n) => { const b = n.getBoundingClientRect(); const cs = getComputedStyle(n); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
    const card = document.querySelector('.osd-invite-hint');
    const yes = card.querySelector('.osd-invite-yes');
    const no = card.querySelector('.osd-invite-no');
    const centre = (r) => ({ x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 });
    const at = (r, btn) => { const c = centre(r); const e = document.elementFromPoint(c.x, c.y); return Boolean(e && btn.contains(e)); };
    const others = [];
    for (const [tag, sel] of [['lap clock', '.osd-top'], ['banner', '.banner']]) {
      const n = document.querySelector(sel);
      if (n && vis(n) && n.textContent.trim()) { others.push([tag, rect(n)]); }
    }
    for (const n of document.querySelectorAll('.osd-gimbal')) {
      if (vis(n) && !n.classList.contains('is-off')) { others.push(['stick plate', rect(n)]); }
    }
    const slider = document.querySelector('.osd-air .osd-air-row');
    if (slider && vis(slider)) { others.push(['weight slider', rect(slider)]); }
    const c = rect(card);
    const yr = rect(yes);
    const nr = rect(no);
    return {
      view: { w: innerWidth, h: innerHeight },
      card: c, yes: yr, no: nr,
      yesHit: at(yr, yes), noHit: at(nr, no),
      others,
    };
  })())`));
}

const meets = (a, b) => a.r > b.l + 0.5 && a.l < b.r - 0.5 && a.b > b.t + 0.5 && a.t < b.b - 0.5;

/* The card is where a pilot can read it: inside the screen, over nothing else
 * on the glass, with two buttons a thumb can hit. */
function layoutFindings(g, { minButton }) {
  const bad = [];
  const { card, view } = g;
  if (card.l < -0.5 || card.t < -0.5 || card.r > view.w + 0.5 || card.b > view.h + 0.5) {
    bad.push(`outside the screen: ${Math.round(card.l)},${Math.round(card.t)} to ${Math.round(card.r)},${Math.round(card.b)} of ${view.w}x${view.h}`);
  }
  for (const [tag, r] of g.others) {
    if (tag !== 'weight slider' && meets(card, r)) {
      bad.push(`over the ${tag}`);
    }
  }
  if (!g.yesHit) {
    bad.push('the Yes button is not what a tap on its centre reaches');
  }
  if (!g.noHit) {
    bad.push('the No button is not what a tap on its centre reaches');
  }
  if (g.yes.h < minButton || g.no.h < minButton) {
    bad.push(`a button is ${Math.round(Math.min(g.yes.h, g.no.h))} px tall, under ${minButton}`);
  }
  if (meets(g.yes, g.no)) {
    bad.push('the two buttons overlap');
  }
  return bad;
}

async function tapCentre(page, rect, touch) {
  const x = Math.round((rect.l + rect.r) / 2);
  const y = Math.round((rect.t + rect.b) / 2);
  const send = (method, params) => page.cdp.send(method, params, page.sessionId);
  if (touch) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(70);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
}

async function shot(page, name) {
  if (!SHOTS) {
    return;
  }
  await mkdir(SHOTS, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
}

async function scenario(name, opts, run) {
  if (ONLY.length && !ONLY.includes(name.split(' ')[0])) {
    return;
  }
  const t0 = Date.now();
  let page = null;
  try {
    page = await openPage({
      root,
      width: opts.width || 1280,
      height: opts.height || 720,
      url: opts.url,
      touch: Boolean(opts.touch),
      seed: [seedFor(opts)],
    });
    await run(page);
    const uncaught = page.errors.filter((m) => !/net::ERR_|Failed to load resource/.test(m));
    const s = await look(page).catch(() => ({ fault: 'the page could not be read at the end' }));
    check(`${name}: no uncaught error, no frame fault`, uncaught.length === 0 && !s.fault,
      uncaught.slice(0, 2).join(' | ') || s.fault || 'clean');
  } catch (e) {
    check(`${name}: ran to the end`, false, String(e.message || e).slice(0, 260));
  } finally {
    if (page) {
      await page.close();
    }
    console.log(`  ${name}: ${Math.round((Date.now() - t0) / 1000)} s`);
  }
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---- A: tracks, end to end ---------------------------------------------- */

await scenario('A tracks, a real flight', {
  url: TRACK_LINK,
  settings: RETURNING,
  keys: { ...FIVE_TRACK, ...WEIGHT_SEEN },
  invite: stateOf({ aaaaaaaa: FLOWN }),
}, async (page) => {
  await launched(page);
  const s0 = await look(page);
  check('A: on a track by link, with a track already flown, the invitation is read once at boot and is not up',
    s0.io && s0.io.reads === 1 && s0.io.writes === 0 && !s0.cardUp && s0.guided === false,
    JSON.stringify({ io: s0.io, cardUp: s0.cardUp, guided: s0.guided }));
  const here = courseKeyOf(s0.course);

  const hop = await flyOnce(page, { airMs: 2500 });
  check('A: a hop of a few seconds takes off and lands', hop.left && hop.landed && !hop.faulted && !hop.capped,
    JSON.stringify(hop));
  await settleFrames(page, 1500);
  const s1 = await look(page);
  check('A: a hop is not enough, so nothing is asked, the page read storage for nothing in the air and wrote it at a landing and nowhere else',
    !s1.cardUp && hop.cardInAir === 0 && s1.io.reads === 1 && s1.io.writes >= 1 && s1.io.writes <= s1.landings
    && s1.inviteLive.asked === 0,
    JSON.stringify({ cardUp: s1.cardUp, cardInAir: hop.cardInAir, io: s1.io, landings: s1.landings, asked: s1.inviteLive.asked }));
  const mine = s1.inviteStored && s1.inviteStored.tracks ? s1.inviteStored.tracks[here] : undefined;
  check('A: the landing credited this track with the airtime it was flown, under its own key and not as freestyle',
    Number.isFinite(mine) && Math.abs(mine - hop.airMs) <= 100 && s1.inviteStored.free === 0
    && Object.keys(s1.inviteStored.tracks).length === 2,
    JSON.stringify({ stored: s1.inviteStored, flown: hop.airMs }));

  const long = await flyOnce(page, { airMs: 33000, capS: 150 });
  check('A: a flight of over half a minute of airtime lands', long.left && long.landed && !long.faulted && !long.capped,
    JSON.stringify(long));
  check('A: and the invitation was never on the glass while the quad was in the air', long.cardInAir === 0,
    String(long.cardInAir));
  const raised = await cardUp(page);
  /* The ask counts once the card has been seen (INVITE_SEEN_MS), so look a few
   * frames later; at about three frames a second that is plenty. */
  await settleFrames(page, 3500);
  const s2 = await look(page);
  check('A: the card comes on the ground, after the landing', raised && s2.cardUp && s2.craft.landed,
    JSON.stringify({ raised, cardUp: s2.cardUp, landed: s2.craft && s2.craft.landed }));
  check('A: it compliments and asks, with the track count and both sliders',
    s2.title === 'Nice flying' && /You have flown 2 tracks now\./.test(s2.body)
    && /Would you like to help tune flight feel\?/.test(s2.body) && /Two more sliders/.test(s2.body)
    && s2.yes === 'Yes, show me' && s2.no === 'No thanks',
    JSON.stringify([s2.title, s2.body, s2.yes, s2.no]));
  check('A: it was counted as asked once it had been seen, and written at the landings and once for the ask, and the flight read storage for it never',
    s2.inviteLive.asked === 1 && s2.inviteStored.asked === 1 && s2.io.reads === 1
    && s2.io.writes >= 3 && s2.io.writes <= s2.landings + 1,
    JSON.stringify({ live: s2.inviteLive, io: s2.io, landings: s2.landings }));
  check('A: nothing else is up with it', s2.hintsUp === 1 && !s2.weightUp && !s2.tuneHintUp && !s2.feel,
    JSON.stringify({ hintsUp: s2.hintsUp, weightUp: s2.weightUp, tuneHintUp: s2.tuneHintUp, feel: s2.feel }));
  const g = await geometry(page);
  const bad = layoutFindings(g, { minButton: 22 });
  check('A: on a laptop it is inside the screen and over nothing, and the mouse reaches both buttons',
    bad.length === 0, bad.join(' | ') || `card ${Math.round(g.card.w)}x${Math.round(g.card.h)} at ${Math.round(g.card.l)},${Math.round(g.card.t)}`);
  await shot(page, 'A-card');

  await tapCentre(page, g.yes, false);
  await page.until("document.querySelector('.osd-invite-hint').hidden === true", 8000).catch(() => {});
  await sleep(1200);
  const s3 = await look(page);
  check('A: a click on Yes puts the card away and turns Flight feel tuning on, in the page and in the saved settings',
    s3.cardHidden === true && s3.feel === true && s3.feelStored === true, JSON.stringify({
      hidden: s3.cardHidden, feel: s3.feel, stored: s3.feelStored,
    }));
  check('A: the answer is kept, so it is never asked again', s3.inviteStored.answer === 'yes' && s3.inviteLive.answer === 'yes',
    JSON.stringify(s3.inviteStored));
  check('A: the two sliders are on the glass at stock, and the tune card that explains them comes up on its own',
    s3.sliders.length === 2 && s3.sliders.every((c) => /100%$/.test(c)) && s3.tuneHintUp,
    JSON.stringify({ sliders: s3.sliders, tuneHintUp: s3.tuneHintUp }));
  await shot(page, 'A-after-yes');

  const again = await flyOnce(page, { airMs: 40000 });
  await settleFrames(page, 1500);
  const s4 = await look(page);
  check('A: the next flight and landing ask nothing, and the invitation key was neither read nor written again for them',
    again.landed && !s4.cardUp && again.cardInAir === 0 && s4.io.reads === 1 && s4.io.writes === s3.io.writes,
    JSON.stringify({ landed: again.landed, cardUp: s4.cardUp, io: s4.io, before: s3.io }));
});

/* ---- B: freestyle, a No -------------------------------------------------- */

await scenario('B freestyle, and a No', {
  url: YARD_LINK,
  settings: { ...RETURNING, map: 'built' },
  keys: WEIGHT_SEEN,
  invite: stateOf({}, INVITE_FREESTYLE_MS - 500),
}, async (page) => {
  await launched(page, 200000);
  const s0 = await look(page);
  check('B: in a world with no gates the invitation is read once and is not up', s0.io && s0.io.reads === 1 && !s0.cardUp,
    JSON.stringify({ io: s0.io, cardUp: s0.cardUp }));
  const hop = await flyOnce(page, { airMs: 2500 });
  check('B: a hop takes off and lands', hop.left && hop.landed && !hop.faulted && !hop.capped, JSON.stringify(hop));
  const raised = await cardUp(page);
  const s1 = await look(page);
  check('B: half a second short of ten minutes, the hop crossed it, and the card says so',
    raised && s1.title === 'Nice flying' && /over ten minutes of freestyle/.test(s1.body)
    && /Would you like to help tune flight feel\?/.test(s1.body), JSON.stringify([s1.title, s1.body]));
  check('B: the airtime went to the freestyle count and to no track',
    s1.inviteStored.free > INVITE_FREESTYLE_MS && Object.keys(s1.inviteStored.tracks).length === 0,
    JSON.stringify(s1.inviteStored));
  const g = await geometry(page);
  const bad = layoutFindings(g, { minButton: 22 });
  check('B: and it is inside the screen and over nothing', bad.length === 0, bad.join(' | ') || 'clear');
  await tapCentre(page, g.no, false);
  await page.until("document.querySelector('.osd-invite-hint').hidden === true", 8000).catch(() => {});
  await sleep(1200);
  const s2 = await look(page);
  check('B: a click on No puts it away, leaves the sliders away and the mode off, and keeps the answer',
    s2.cardHidden === true && !s2.feel && !s2.feelStored && s2.sliders.length === 0
    && s2.inviteStored.answer === 'no', JSON.stringify({
      hidden: s2.cardHidden, feel: s2.feel, sliders: s2.sliders, answer: s2.inviteStored.answer,
    }));
  const writes = s2.io.writes;
  const hop2 = await flyOnce(page, { airMs: 6000 });
  await settleFrames(page, 1500);
  const s3 = await look(page);
  check('B: after a No, the next landing asks nothing and the page does not touch the invitation key at all',
    hop2.landed && !s3.cardUp && s3.io.writes === writes && s3.io.reads === 1 && s3.inviteStored.asked === 1,
    JSON.stringify({ landed: hop2.landed, cardUp: s3.cardUp, io: s3.io, wasWrites: writes }));
});

/* ---- C: a first flight guide is running ---------------------------------- */

await scenario('C a guide is running', {
  url: TRACK_LINK,
  settings: { hasFlown: false, map: 'custom' },
  keys: FIVE_TRACK,
  invite: stateOf({ aaaaaaaa: FLOWN, bbbbbbbb: FLOWN }),
}, async (page) => {
  await launched(page);
  const s0 = await look(page);
  check('C: a newcomer to this kind of track has its first flight guide armed, and is already due', s0.guided === 'race',
    JSON.stringify({ guided: s0.guided }));
  const hop = await flyOnce(page, { airMs: 2500 });
  await settleFrames(page, 2500);
  const s1 = await look(page);
  check('C: the hop lands, and with the guide running nothing is asked',
    hop.landed && !s1.cardUp && s1.inviteLive.asked === 0 && !s1.inviteLive.armed && s1.guided === 'race',
    JSON.stringify({ landed: hop.landed, cardUp: s1.cardUp, live: s1.inviteLive, guided: s1.guided }));
});

/* ---- D: a phone held sideways -------------------------------------------- */

await scenario('D a phone, thumbs', {
  url: TRACK_LINK,
  settings: RETURNING,
  keys: { ...FIVE_TRACK, ...WEIGHT_SEEN },
  invite: stateOf({ aaaaaaaa: FLOWN, bbbbbbbb: FLOWN }),
  touch: true,
  width: 844,
  height: 390,
}, async (page) => {
  await launched(page);
  await page.until("document.getElementById('ui').classList.contains('touch-fly-on')", 20000).catch(() => {});
  const hop = await flyOnce(page, { airMs: 2500 });
  check('D: the hop takes off and lands on glass', hop.left && hop.landed && !hop.faulted && !hop.capped, JSON.stringify(hop));
  const raised = await cardUp(page);
  const s1 = await look(page);
  check('D: a pilot who is due is asked at the landing, and it was not up in the air', raised && s1.cardUp && hop.cardInAir === 0,
    JSON.stringify({ raised, cardInAir: hop.cardInAir }));
  const g = await geometry(page);
  const bad = layoutFindings(g, { minButton: 22 });
  check('D: 844 by 390 with the thumb sticks up: inside the screen, over no plate, clock or launch line, and the finger reaches both buttons',
    bad.length === 0, bad.join(' | ') || `card ${Math.round(g.card.w)}x${Math.round(g.card.h)} at ${Math.round(g.card.l)},${Math.round(g.card.t)}`);
  await shot(page, 'D-card');
  await tapCentre(page, g.yes, true);
  await page.until("document.querySelector('.osd-invite-hint').hidden === true", 8000).catch(() => {});
  await sleep(1200);
  const s2 = await look(page);
  check('D: a finger on Yes turns the mode on and the sliders are on the glass',
    s2.cardHidden === true && s2.feel && s2.feelStored && s2.sliders.length === 2 && s2.inviteStored.answer === 'yes',
    JSON.stringify({ hidden: s2.cardHidden, feel: s2.feel, sliders: s2.sliders, answer: s2.inviteStored.answer }));
  await shot(page, 'D-after-yes');
});

/* ---- E: the Weight card has not been met --------------------------------- */

await scenario('E the Weight card first', {
  url: TRACK_LINK,
  settings: RETURNING,
  keys: FIVE_TRACK,
  invite: stateOf({ aaaaaaaa: FLOWN, bbbbbbbb: FLOWN }),
}, async (page) => {
  await launched(page);
  const hop = await flyOnce(page, { airMs: 2500 });
  const raised = await cardUp(page);
  const s1 = await look(page);
  check('E: the quad landed and the invitation is up, and no two hint cards were on the glass at once in the air or after',
    hop.landed && raised && hop.bothCards === 0 && s1.hintsUp === 1,
    JSON.stringify({ landed: hop.landed, raised, bothCards: hop.bothCards, hintsUp: s1.hintsUp }));
});

/* ---- F: Escape with the card up ------------------------------------------ */

await scenario('F a pause with the card up', {
  url: TRACK_LINK,
  settings: RETURNING,
  keys: { ...FIVE_TRACK, ...WEIGHT_SEEN },
  invite: stateOf({ aaaaaaaa: FLOWN, bbbbbbbb: FLOWN }),
}, async (page) => {
  await launched(page);
  const hop = await flyOnce(page, { airMs: 2500 });
  const raised = await cardUp(page);
  check('F: the card is up on the ground', hop.landed && raised, JSON.stringify({ landed: hop.landed, raised }));
  await settleFrames(page, 3500);
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000).catch(() => {});
  await sleep(600);
  const paused = await look(page);
  check('F: Escape puts it away, and it was asked once', paused.screen === 'paused' && paused.cardHidden === true
    && paused.inviteLive.asked === 1, JSON.stringify({ screen: paused.screen, hidden: paused.cardHidden, asked: paused.inviteLive.asked }));
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'flight'", 10000).catch(() => {});
  const back = await cardUp(page, 10000);
  const s2 = await look(page);
  check('F: resumed, it is back on the ground, and still asked once, not twice',
    back && s2.inviteLive.asked === 1 && s2.inviteStored.asked === 1, JSON.stringify({ back, live: s2.inviteLive, stored: s2.inviteStored.asked }));
});

/* ---- G: the Settings menu's switch -------------------------------------- */

/* The rows of the screen on show, as the shell lists them, and where the
 * switch's two segments are on the glass. */
async function settingsRows(page) {
  return JSON.parse(await page.evaluate(`JSON.stringify(window.__ui.items().map((i) => ({
    label: i.label, section: Boolean(i.section), sw: Boolean(i.sw), on: i.on, note: i.note || '',
  })))`));
}

async function segmentRect(page, label, seg) {
  return JSON.parse(await page.evaluate(`JSON.stringify((() => {
    const row = [...document.querySelectorAll('#ui .row')].find((r) => {
      const l = r.querySelector('.row-label');
      return l && l.textContent === ${JSON.stringify(label)};
    });
    if (!row) { return null; }
    row.scrollIntoView({ block: 'center' });
    const b = [...row.querySelectorAll('.sw-seg')].find((n) => n.textContent === ${JSON.stringify(seg)});
    if (!b) { return null; }
    const r = b.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  })())`));
}

await scenario('G the Settings switch', {
  url: TRACK_LINK,
  settings: RETURNING,
  keys: { ...FIVE_TRACK, ...WEIGHT_SEEN },
}, async (page) => {
  await launched(page);
  const s0 = await look(page);
  check('G: a pilot who never touched the mode starts with it off and no slider on the glass',
    !s0.feel && !s0.feelStored && s0.sliders.length === 0, JSON.stringify({ feel: s0.feel, sliders: s0.sliders }));

  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000);
  await page.evaluate("window.__ui.act('pilot'); 1");
  await page.until("window.__ui.screen === 'pilot'", 10000);
  const rows = await settingsRows(page);
  const at = rows.findIndex((r) => r.label === 'Advanced flight feel tuning');
  const row = rows[at];
  check('G: Settings has the switch, under a heading of its own, once',
    at > 0 && rows[at - 1].section && rows[at - 1].label === 'Flight feel'
    && rows.filter((r) => r.label === 'Advanced flight feel tuning').length === 1,
    JSON.stringify({ at, before: at > 0 ? rows[at - 1].label : null }));
  check('G: it is a switch, and it reads Off', row && row.sw && row.on === false, JSON.stringify(row && { sw: row.sw, on: row.on }));
  check('G: its note says what it does and that nothing is sent without a yes',
    row && /Off by default\./.test(row.note) && /join Weight between the sticks/.test(row.note)
    && /Nothing is sent unless you say yes\./.test(row.note), row ? row.note.slice(0, 120) : 'no row');
  check('G: the other rows around it are the ones that were there, so nothing was displaced',
    rows[at + 1] && rows[at + 1].label === 'Screen' && rows[at + 1].section
    && rows[at - 2] && rows[at - 2].label === 'Radio link', JSON.stringify([rows[at - 2] && rows[at - 2].label, rows[at + 1] && rows[at + 1].label]));
  await shot(page, 'G-settings');

  const on = await segmentRect(page, 'Advanced flight feel tuning', 'On');
  check('G: the On segment is on the glass', Boolean(on), JSON.stringify(on));
  await tapCentre(page, on, false);
  await sleep(700);
  const s1 = await look(page);
  const rows1 = await settingsRows(page);
  /* The Quad room's rows, read without going there: the list is built from the
   * screen and the settings and from nothing else, so asking for it with the
   * screen swapped for an instant and put back is the same list a pilot gets. */
  const quad = await page.evaluate(`(() => {
    const ui = window.__ui;
    const was = ui.screen;
    ui.screen = 'quad';
    let rows = [];
    try { rows = ui.buildItems(); } finally { ui.screen = was; }
    return JSON.stringify(rows.filter((i) => /feel tuning/i.test(i.label)).map((i) => ({ label: i.label, on: i.on })));
  })()`);
  check('G: a click on On turns the mode on in the page and in the saved settings, and the row reads On',
    s1.feel === true && s1.feelStored === true && (rows1.find((r) => r.label === 'Advanced flight feel tuning') || {}).on === true,
    JSON.stringify({ feel: s1.feel, stored: s1.feelStored }));
  const q = JSON.parse(quad);
  check('G: the Quad room has its own row for the same flag, and it reads On too',
    q.length === 1 && q[0].label === 'Flight feel tuning' && q[0].on === true, quad);
  await shot(page, 'G-quad');

  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000);
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'flight'", 10000);
  await sleep(2500);
  const s2 = await look(page);
  check('G: back on the flight screen, on the ground, Air grip and Motor power are beside Weight at stock',
    s2.screen === 'flight' && s2.sliders.length === 2 && s2.sliders.every((c) => /100%$/.test(c)),
    JSON.stringify({ screen: s2.screen, sliders: s2.sliders }));
  await shot(page, 'G-flight');

  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000);
  await page.evaluate("window.__ui.act('pilot'); 1");
  await page.until("window.__ui.screen === 'pilot'", 10000);
  const off = await segmentRect(page, 'Advanced flight feel tuning', 'Off');
  await tapCentre(page, off, false);
  await sleep(700);
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000);
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'flight'", 10000);
  await sleep(2000);
  const s3 = await look(page);
  check('G: a click on Off turns it off again, in the page and the saved settings, and the sliders go',
    s3.feel === false && s3.feelStored === false && s3.sliders.length === 0,
    JSON.stringify({ feel: s3.feel, stored: s3.feelStored, sliders: s3.sliders }));
});

/* ---- H and I: the card across window sizes ------------------------------- */

/* One boot, one flight, one card, then the window is resized under it and the
 * card is measured at each size. A resize is a media query and a layout, not a
 * new page, so this is the whole range for the price of one hop. */
const resizeTo = (page, w, h, mobile) => page.cdp.send('Emulation.setDeviceMetricsOverride', {
  width: w, height: h, deviceScaleFactor: 1, mobile,
}, page.sessionId);

const DESKTOP_SIZES = [
  [1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 720], [1280, 600], [1024, 768], [800, 600],
];
/* Under the sheet's short screen line, 560 px tall, the Weight card hangs
 * below its slider, which on a desktop window is off the screen. The invitation
 * card is hung above at every height (index.html), and these are the proof. */
const SHORT_SIZES = [[1280, 560], [1280, 480], [1280, 400]];
const PHONE_SIZES = [[844, 390], [812, 375], [740, 360], [667, 375], [932, 430], [1024, 768], [1180, 820]];

async function sweepCard(page, label, sizes, { minButton, mobile }) {
  for (const [w, h] of sizes) {
    await resizeTo(page, w, h, mobile);
    await sleep(500);
    const s = await look(page);
    if (!s.cardUp) {
      check(`${label}: ${w} by ${h}: the card is on the glass`, false, JSON.stringify({ cardUp: s.cardUp, live: s.inviteLive }));
      continue;
    }
    const g = await geometry(page);
    const bad = layoutFindings(g, { minButton });
    check(`${label}: ${w} by ${h}: inside the screen, over nothing, and both buttons reachable`,
      bad.length === 0, bad.join(' | ') || `card ${Math.round(g.card.w)}x${Math.round(g.card.h)} at ${Math.round(g.card.l)},${Math.round(g.card.t)}`);
    await shot(page, `${label}-${w}x${h}`);
  }
}

await scenario('H desktop windows', {
  url: TRACK_LINK,
  settings: RETURNING,
  keys: { ...FIVE_TRACK, ...WEIGHT_SEEN },
  invite: stateOf({ aaaaaaaa: FLOWN, bbbbbbbb: FLOWN }),
}, async (page) => {
  await launched(page);
  const hop = await flyOnce(page, { airMs: 2500 });
  const raised = await cardUp(page);
  check('H: a hop lands and the card is up at 1280 by 720', hop.landed && raised, JSON.stringify({ landed: hop.landed, raised }));
  await sweepCard(page, 'H', [...DESKTOP_SIZES, ...SHORT_SIZES], { minButton: 22, mobile: false });
});

await scenario('I phones and tablets', {
  url: TRACK_LINK,
  settings: RETURNING,
  keys: { ...FIVE_TRACK, ...WEIGHT_SEEN },
  invite: stateOf({ aaaaaaaa: FLOWN, bbbbbbbb: FLOWN }),
  touch: true,
  width: 844,
  height: 390,
}, async (page) => {
  await launched(page);
  await page.until("document.getElementById('ui').classList.contains('touch-fly-on')", 20000).catch(() => {});
  const hop = await flyOnce(page, { airMs: 2500 });
  const raised = await cardUp(page);
  check('I: a hop lands on glass and the card is up at 844 by 390', hop.landed && raised, JSON.stringify({ landed: hop.landed, raised }));
  await sweepCard(page, 'I', PHONE_SIZES, { minButton: 22, mobile: false });
});

/* ---- K: ignored ----------------------------------------------------------- */

await scenario('K ignored, three times', {
  url: TRACK_LINK,
  settings: RETURNING,
  keys: { ...FIVE_TRACK, ...WEIGHT_SEEN },
  invite: stateOf({ aaaaaaaa: FLOWN, bbbbbbbb: FLOWN }),
}, async (page) => {
  await launched(page);
  const log = [];
  for (let i = 1; i <= 4; i += 1) {
    const hop = await flyOnce(page, { airMs: 0 });
    const raised = i <= 3 ? await cardUp(page) : await cardUp(page, 6000);
    await settleFrames(page, 3500);
    const s = await look(page);
    log.push({ i, hop, raised, s });
  }
  for (const { i, hop, raised, s } of log) {
    if (i <= 3) {
      check(`K: landing ${i} of the pilot who never answers: the card comes up and was put away at the takeoff before it`,
        hop.landed && hop.cardInAir === 0 && raised && s.cardUp, JSON.stringify({ landed: hop.landed, inAir: hop.cardInAir, raised, up: s.cardUp }));
      check(`K: and it counts as asked ${i}, in the page and in storage`,
        s.inviteLive.asked === i && s.inviteStored.asked === i && s.inviteStored.answer === '', JSON.stringify({ live: s.inviteLive, stored: s.inviteStored }));
    } else {
      check('K: landing 4: the fourth is never asked, and the page did not write the invitation for it',
        hop.landed && !raised && !s.cardUp && s.inviteStored.asked === 3 && s.io.writes === log[2].s.io.writes,
        JSON.stringify({ landed: hop.landed, raised, up: s.cardUp, asked: s.inviteStored.asked, io: s.io, before: log[2].s.io }));
    }
  }
  const last = log[log.length - 1].s;
  check('K: through all four the invitation key was read once, at boot', last.io.reads === 1, JSON.stringify(last.io));
});

/* ---- report ------------------------------------------------------------- */

await sleep(10);
const w = Math.max(...rows.map((r) => r[0].length));
console.log('\ntuneinvite-check: the invitation to help tune flight feel, in the shell, with real flights\n');
for (const [name, status, detail] of rows) {
  console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} checks clean`);
process.exit(failed === 0 ? 0 : 1);
