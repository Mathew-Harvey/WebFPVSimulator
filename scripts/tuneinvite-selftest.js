/*
 * tuneinvite-selftest.js: the invitation to help tune flight feel, in Node,
 * against a stub browser. No page, no module.
 *
 * What it pins, and why each is worth a failing check:
 *
 *   the line          two flown tracks or more than ten minutes of
 *                     freestyle, exactly: one second short is not due and
 *                     "more than" means more. A card that comes early asks
 *                     the pilot least able to answer, and one that never
 *                     comes collects nothing
 *   what counts       airtime, over visits, on one track; a hop is not a
 *                     track; the same track twice is one; the table cannot
 *                     grow without bound
 *   how often         three times at most, a No is final, and a pilot who
 *                     has the mode on is never asked, even after turning it
 *                     off again
 *   what is stored    a corrupt or hostile blob is an empty state, a storage
 *                     that throws is an empty state, and the round trip is
 *                     lossless
 *   the words         a compliment that is a fact, a question, and a count
 *                     of sliders that matches the module; no dash characters
 *   the page's side   a landing adds only the airtime since the last one,
 *                     arms the card only when the pilot is due, is silent
 *                     while a guide is up, and writes storage once; the
 *                     answers turn the mode on or leave it alone
 *
 * Usage:
 *   npm run tuneinvite:selftest
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

/* As much of a browser as ui.js touches at import. */
const store = new Map();
let storeThrows = false;
globalThis.localStorage = {
  getItem: (k) => {
    if (storeThrows) {
      throw new Error('storage refused');
    }
    return store.has(k) ? store.get(k) : null;
  },
  setItem: (k, v) => {
    if (storeThrows) {
      throw new Error('storage refused');
    }
    store.set(k, String(v));
  },
  removeItem: (k) => store.delete(k),
  get length() {
    return store.size;
  },
  key: (i) => [...store.keys()][i] ?? null,
};
globalThis.window = globalThis.window || {
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
};
globalThis.window.localStorage = globalThis.localStorage;

const { SETTINGS_KEY, Ui } = await import('../src/ui/ui.js');
const {
  INVITE_FREESTYLE_MS, INVITE_KEY, INVITE_MAX_ASKS, INVITE_SEEN_MS, INVITE_TRACK_AIR_MS, INVITE_TRACKS,
  courseKeyOf, dueReason, emptyInvite, flownTracks, inviteWords, noteAir, noteAnswer, noteAsked,
  readInvite, writeInvite,
} = await import('../src/ui/tuneinvite.js');

const rows = [];
let failed = 0;

function check(name, ok, detail) {
  rows.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) {
    failed += 1;
  }
}

const BOTH = { air: true, kv: true };
const flown = (state, course, ms) => noteAir(state, { freestyle: false, course, airMs: ms });
const freestyled = (state, ms) => noteAir(state, { freestyle: true, course: 'city', airMs: ms });

/* ---- the line ------------------------------------------------------------ */
{
  check('the numbers are the brief: two tracks, ten minutes',
    INVITE_TRACKS === 2 && INVITE_FREESTYLE_MS === 600000 && INVITE_MAX_ASKS === 3 && INVITE_SEEN_MS === 1200,
    `${INVITE_TRACKS} tracks, ${INVITE_FREESTYLE_MS} ms, ${INVITE_MAX_ASKS} asks`);
  const s = emptyInvite();
  check('a pilot who has flown nothing is not due', dueReason(s) === '', dueReason(s));
  flown(s, 'custom:', INVITE_TRACK_AIR_MS * 5);
  check('one track, however long, is not due', dueReason(s) === '' && flownTracks(s) === 1,
    `${flownTracks(s)} flown`);
  flown(s, 'custom:other', INVITE_TRACK_AIR_MS - 1);
  check('a second track one millisecond short of flown is not due', dueReason(s) === '',
    `${flownTracks(s)} flown`);
  flown(s, 'custom:other', 1);
  check('and the millisecond makes it two tracks, due by tracks',
    flownTracks(s) === 2 && dueReason(s) === 'tracks', dueReason(s));
}
{
  const s = emptyInvite();
  freestyled(s, INVITE_FREESTYLE_MS - 1);
  check('a second short of ten minutes of freestyle is not due', dueReason(s, true) === '', dueReason(s, true));
  freestyled(s, 1);
  check('exactly ten minutes is not due: it is "more than"', dueReason(s, true) === '', `${s.free} ms`);
  freestyled(s, 1);
  check('and one millisecond more is due, by freestyle', dueReason(s, true) === 'freestyle', dueReason(s, true));
  check('freestyle counts for no track', flownTracks(s) === 0, `${flownTracks(s)} flown`);
}
{
  const s = emptyInvite();
  flown(s, 'a', INVITE_TRACK_AIR_MS);
  flown(s, 'b', INVITE_TRACK_AIR_MS);
  freestyled(s, INVITE_FREESTYLE_MS + 1);
  check('a pilot due both ways is complimented on what they were just flying',
    dueReason(s, true) === 'freestyle' && dueReason(s, false) === 'tracks',
    `${dueReason(s, true)} / ${dueReason(s, false)}`);
}

/* ---- what counts --------------------------------------------------------- */
{
  const s = emptyInvite();
  for (const ms of [12000, 9000, 8999, 1]) {
    flown(s, 'custom:', ms);
  }
  check('airtime on one track adds up over landings, to the second landing and beyond',
    flownTracks(s) === 1, `${s.tracks[courseKeyOf('custom:')]} ms`);
  check('the same track twice is one track, not two',
    Object.keys(s.tracks).length === 1 && dueReason(s) === '', `${Object.keys(s.tracks).length} entries`);
  check('airtime is capped at the line, so the number stays small',
    s.tracks[courseKeyOf('custom:')] === INVITE_TRACK_AIR_MS, `${s.tracks[courseKeyOf('custom:')]}`);
}
{
  const s = emptyInvite();
  const bad = [NaN, -5, 0, Infinity, undefined, null, '30000'];
  const changed = bad.map((ms) => flown(s, 'x', ms));
  check('airtime that is not a positive finite number is ignored',
    changed.every((c) => c === false) && Object.keys(s.tracks).length === 0,
    JSON.stringify(s.tracks));
  check('the same course key folds to the same eight digits every time',
    courseKeyOf('custom:abc') === courseKeyOf('custom:abc') && /^[0-9a-f]{8}$/.test(courseKeyOf('custom:abc'))
    && courseKeyOf('city') !== courseKeyOf('custom:'), `${courseKeyOf('custom:abc')} ${courseKeyOf('')}`);
  check('a track the pilot built and saved again is still the same track',
    courseKeyOf('custom:local:track-9:2026-10-11T07:00:00.000Z') === courseKeyOf('custom:local:track-9:2026-10-11T07:05:00.000Z')
    && courseKeyOf('custom:local:track-9:2026-10-11T07:00:00.000Z') !== courseKeyOf('custom:local:track-8:2026-10-11T07:00:00.000Z')
    && courseKeyOf('custom:share:abc') !== courseKeyOf('custom:share:abd')
    && courseKeyOf('custom:empty:micro') !== courseKeyOf('custom:empty:full'),
    courseKeyOf('custom:local:track-9:2026-10-11T07:00:00.000Z'));
  check('even an empty or missing course folds to a key', /^[0-9a-f]{8}$/.test(courseKeyOf(undefined)) && /^[0-9a-f]{8}$/.test(courseKeyOf('')), courseKeyOf(undefined));
}
{
  const s = emptyInvite();
  for (let i = 0; i < 40; i += 1) {
    flown(s, `track${i}`, 4000);
  }
  check('forty tracks sampled for four seconds each leave a bounded table',
    Object.keys(s.tracks).length <= 6, `${Object.keys(s.tracks).length} entries`);
  flown(s, 'long1', INVITE_TRACK_AIR_MS);
  flown(s, 'long2', INVITE_TRACK_AIR_MS);
  check('and two long ones after the hopping still make the pilot due',
    flownTracks(s) === 2 && dueReason(s) === 'tracks', `${flownTracks(s)} flown`);
  const full = emptyInvite();
  for (let i = 0; i < 10; i += 1) {
    flown(full, `flown${i}`, INVITE_TRACK_AIR_MS);
  }
  check('a table of flown tracks never evicts one that counts',
    flownTracks(full) === 6 && Object.keys(full.tracks).length === 6, `${flownTracks(full)} flown`);
  check('and the stored blob stays small', JSON.stringify(full).length < 400, `${JSON.stringify(full).length} bytes`);
}

/* ---- how often ----------------------------------------------------------- */
{
  const s = emptyInvite();
  flown(s, 'a', INVITE_TRACK_AIR_MS);
  flown(s, 'b', INVITE_TRACK_AIR_MS);
  noteAsked(s);
  noteAsked(s);
  check('asked twice, still due', dueReason(s) === 'tracks', `${s.asked} asks`);
  noteAsked(s);
  check('asked three times, never again', dueReason(s) === '' && s.asked === INVITE_MAX_ASKS, `${s.asked} asks`);
  noteAsked(s);
  check('and the count stops at the limit', s.asked === INVITE_MAX_ASKS, `${s.asked}`);
  for (const answer of ['yes', 'no', 'self']) {
    const t = emptyInvite();
    flown(t, 'a', INVITE_TRACK_AIR_MS);
    flown(t, 'b', INVITE_TRACK_AIR_MS);
    noteAnswer(t, answer);
    check(`an answer of ${answer} is final`, dueReason(t) === '' && t.answer === answer, `${t.answer}`);
  }
  const u = emptyInvite();
  noteAnswer(u, 'maybe');
  check('an answer that is not one of the three is not recorded', u.answer === '', `"${u.answer}"`);
}

/* ---- what is stored ------------------------------------------------------ */
{
  const s = emptyInvite();
  flown(s, 'a', 12345);
  flown(s, 'b', INVITE_TRACK_AIR_MS);
  freestyled(s, 70000);
  noteAsked(s);
  noteAnswer(s, 'no');
  store.clear();
  const wrote = writeInvite(globalThis.localStorage, s);
  const back = readInvite(globalThis.localStorage);
  check('written and read back, nothing is lost', wrote && JSON.stringify(back) === JSON.stringify(s),
    store.get(INVITE_KEY));
  const junk = [
    '', 'null', '[]', '{"v":2}', '{"v":1,"tracks":[1,2],"free":"x"}', 'not json',
    '{"v":1,"tracks":{"__proto__":9,"toolong1234":5,"ABCDEF01":5,"00000000":-5,"0000000f":"9"},"free":-1,"asked":2.5,"answer":"x"}',
  ];
  const results = junk.map((raw) => {
    store.set(INVITE_KEY, raw);
    return readInvite(globalThis.localStorage);
  });
  check('a corrupt, wrong or hostile blob is an empty state',
    results.every((r) => Object.keys(r.tracks).length === 0 && r.free === 0 && r.asked === 0 && r.answer === ''),
    JSON.stringify(results.map((r) => Object.keys(r.tracks).length)));
  store.set(INVITE_KEY, JSON.stringify({
    v: 1, tracks: { 'deadbeef': 999999999 }, free: 999999999, asked: 99, answer: 'yes',
  }));
  const huge = readInvite(globalThis.localStorage);
  check('numbers out of range are brought back to their caps',
    huge.tracks.deadbeef === INVITE_TRACK_AIR_MS && huge.free === INVITE_FREESTYLE_MS * 2
    && huge.asked === INVITE_MAX_ASKS && huge.answer === 'yes',
    JSON.stringify(huge));
  storeThrows = true;
  const refused = readInvite(globalThis.localStorage);
  check('storage that throws reads as an empty state', refused.free === 0 && refused.asked === 0, JSON.stringify(refused));
  check('and a write to it says it failed and does not throw', writeInvite(globalThis.localStorage, s) === false, 'false');
  check('no storage at all is an empty state and a failed write',
    readInvite(null).asked === 0 && writeInvite(null, s) === false, 'null');
  storeThrows = false;
  store.clear();
}

/* ---- the words ----------------------------------------------------------- */
{
  const s = emptyInvite();
  flown(s, 'a', INVITE_TRACK_AIR_MS);
  flown(s, 'b', INVITE_TRACK_AIR_MS);
  flown(s, 'c', INVITE_TRACK_AIR_MS);
  const tracks = inviteWords('tracks', s, BOTH);
  const free = inviteWords('freestyle', s, BOTH);
  check('the track words say how many tracks, and ask',
    /You have flown 3 tracks now\./.test(tracks.body) && /Would you like to help tune flight feel\?/.test(tracks.body),
    tracks.body);
  check('the freestyle words say ten minutes, and ask',
    /over ten minutes of freestyle/.test(free.body) && /Would you like to help tune flight feel\?/.test(free.body), free.body);
  check('both open with the compliment', tracks.title === 'Nice flying' && free.title === 'Nice flying', tracks.title);
  check('and offer the answers as buttons', tracks.yes === 'Yes, show me' && tracks.no === 'No thanks', `${tracks.yes} / ${tracks.no}`);
  const two = emptyInvite();
  flown(two, 'a', INVITE_TRACK_AIR_MS);
  flown(two, 'b', INVITE_TRACK_AIR_MS);
  check('two tracks say two', /flown 2 tracks now/.test(inviteWords('tracks', two, BOTH).body), inviteWords('tracks', two, BOTH).body);
  check('two sliders say two more sliders', /Two more sliders let you try/.test(tracks.body), tracks.body);
  const one = inviteWords('tracks', s, { air: true, kv: false });
  check('a module with one slider says one, never two', /One more slider lets you try/.test(one.body) && !/Two/.test(one.body), one.body);
  check('a module with none has nothing to invite to', inviteWords('tracks', s, { air: false, kv: false }) === null, 'null');
  check('and no reason has no words', inviteWords('', s, BOTH) === null && inviteWords('x', s, BOTH) === null, 'null');
  const all = [tracks, free, one].flatMap((w) => Object.values(w));
  const dashes = all.filter((t) => /[\u2013\u2014]/.test(t));
  check('no en or em dash in anything a pilot reads', dashes.length === 0, dashes.join(' | '));
  const longest = Math.max(...[tracks, free].map((w) => w.body.length));
  check('the body is short enough for the card on a phone', longest <= 170, `${longest} characters`);
}

/* ---- the page's side ----------------------------------------------------- */

function stubCard() {
  const node = () => ({ hidden: true, textContent: '' });
  return {
    card: node(), title: node(), body: node(), yes: node(), no: node(),
  };
}

function page(state, settings = {}) {
  store.clear();
  const ui = {
    invite: {
      state, airMs: 0, armed: false, up: false, reason: '', counted: false, shownAt: 0,
    },
    settings: { feelTuning: false, ...settings },
    guided: false,
    tuneCaps: { ...BOTH },
    osdAir: {
      invite: stubCard(), hint: { hidden: false }, tune: null, box: {},
    },
    saved: 0,
    painted: 0,
    heard: 0,
    paintAir() {
      this.painted += 1;
    },
    onSettings() {
      this.heard += 1;
    },
  };
  for (const m of ['noteLanding', 'raiseInvite', 'retireInvite', 'answerInvite', 'pauseAirSlider', 'tickInvite']) {
    ui[m] = Ui.prototype[m];
  }
  return ui;
}

const land = (ui, course, freestyle, airMs) => ui.noteLanding({ course, freestyle, airMs });
const stored = () => (store.has(INVITE_KEY) ? JSON.parse(store.get(INVITE_KEY)) : null);
/* One frame of the invitation, on a clock the check owns. The stub's Weight
 * card is up by default, which holds the invitation back, so a frame that is
 * about the invitation puts it away first. */
const tick = (ui, { ready = false, dialog = false, at = 0 } = {}) => {
  ui.osdAir.hint.hidden = true;
  ui.tickInvite(ready, dialog, ui.osdAir, at);
};

{
  const ui = page(emptyInvite());
  land(ui, 'a', false, 40000);
  check('a landing adds the airtime it was flown and writes storage once',
    ui.invite.state.tracks[courseKeyOf('a')] === INVITE_TRACK_AIR_MS && stored() !== null && !ui.invite.armed,
    JSON.stringify(stored()));
  land(ui, 'b', false, 45000);
  check('a second landing adds only what was flown since the first',
    ui.invite.state.tracks[courseKeyOf('a')] === INVITE_TRACK_AIR_MS
    && ui.invite.state.tracks[courseKeyOf('b')] === 5000 && !ui.invite.armed,
    JSON.stringify(ui.invite.state.tracks));
  land(ui, 'b', false, 75000);
  check('and a track that crosses the line at a landing arms the card',
    ui.invite.armed && ui.invite.reason === 'tracks' && flownTracks(ui.invite.state) === 2,
    `${ui.invite.armed} ${ui.invite.reason}`);
}
{
  const ui = page(emptyInvite());
  land(ui, 'a', false, 20000);
  land(ui, 'a', false, 5000);
  check('a run that began again counts from its start, not from a negative',
    ui.invite.state.tracks[courseKeyOf('a')] === 25000, `${ui.invite.state.tracks[courseKeyOf('a')]} ms`);
}
{
  const s = emptyInvite();
  flown(s, 'a', INVITE_TRACK_AIR_MS);
  const ui = page(s);
  store.clear();
  land(ui, 'a', false, 10);
  check('a landing that changes nothing does not write storage', stored() === null, String(store.get(INVITE_KEY)));
}
{
  const s = emptyInvite();
  freestyled(s, INVITE_FREESTYLE_MS - 1000);
  const ui = page(s);
  land(ui, 'city', true, 500);
  check('a freestyle landing short of the line arms nothing', !ui.invite.armed, `${ui.invite.armed}`);
  land(ui, 'city', true, 2000);
  check('and one that crosses it arms the freestyle card', ui.invite.armed && ui.invite.reason === 'freestyle',
    `${ui.invite.armed} ${ui.invite.reason}`);
}
/* A pilot who is due, a new object each time: a state shared between cases
 * would carry one case's answer into the next and let a later check pass for
 * the wrong reason. */
const dueState = () => {
  const s = emptyInvite();
  flown(s, 'a', INVITE_TRACK_AIR_MS);
  flown(s, 'b', INVITE_TRACK_AIR_MS);
  return s;
};

{
  const ready = page(dueState());
  land(ready, 'a', false, 1000);
  check('control: a pilot who is due, with nothing in the way, is asked on the next landing',
    ready.invite.armed && ready.invite.reason === 'tracks', `${ready.invite.armed}`);
  const on = page(dueState(), { feelTuning: true });
  land(on, 'a', false, 1000);
  check('a pilot with the mode on is not asked, and is recorded as having answered',
    !on.invite.armed && on.invite.state.answer === 'self' && stored().answer === 'self', on.invite.state.answer);
  on.settings.feelTuning = false;
  land(on, 'a', false, 2000);
  check('and switching it off again does not bring the card back', !on.invite.armed, `${on.invite.armed}`);
  const guided = page(dueState());
  guided.guided = 'race';
  land(guided, 'a', false, 1000);
  check('nothing is asked while a first flight guide is up', !guided.invite.armed, `${guided.invite.armed}`);
  guided.guided = false;
  land(guided, 'a', false, 2000);
  check('and the next landing after it asks', guided.invite.armed, `${guided.invite.armed}`);
  const blank = page(dueState());
  blank.tuneCaps = { air: false, kv: false };
  land(blank, 'a', false, 1000);
  check('a module with no tuning slider invites no one', !blank.invite.armed, `${blank.invite.armed}`);
  const asked = page(dueState());
  asked.invite.state.asked = INVITE_MAX_ASKS;
  land(asked, 'a', false, 1000);
  check('a pilot who has been asked three times is not asked a fourth', !asked.invite.armed, `${asked.invite.armed}`);
  const up = page(dueState());
  up.invite.up = true;
  land(up, 'a', false, 1000);
  check('and a card already up is not armed a second time', !up.invite.armed, `${up.invite.armed}`);
}
{
  const ui = page(dueState());
  land(ui, 'a', false, 1000);
  ui.raiseInvite();
  const c = ui.osdAir.invite;
  check('raising the card writes its words and shows it, and does not count the ask yet',
    c.card.hidden === false && /Nice flying/.test(c.title.textContent) && /2 tracks/.test(c.body.textContent)
    && c.yes.textContent === 'Yes, show me' && ui.invite.up && !ui.invite.armed && ui.invite.state.asked === 0
    && stored() === null, `${c.title.textContent} / ${c.body.textContent}`);
  const t0 = ui.invite.shownAt;
  tick(ui, { at: t0 + INVITE_SEEN_MS - 1 });
  check('a frame just short of INVITE_SEEN_MS counts nothing and writes nothing',
    ui.invite.state.asked === 0 && !ui.invite.counted && stored() === null, `${ui.invite.state.asked}`);
  tick(ui, { at: t0 + INVITE_SEEN_MS });
  check('the frame that finds it seen counts the ask, and writes it',
    ui.invite.state.asked === 1 && ui.invite.counted && stored() !== null && stored().asked === 1,
    `${ui.invite.state.asked} ${JSON.stringify(stored())}`);
  store.delete(INVITE_KEY);
  tick(ui, { at: t0 + 5 * INVITE_SEEN_MS });
  check('and later frames count nothing more and write nothing', ui.invite.state.asked === 1 && stored() === null,
    `${ui.invite.state.asked} ${String(store.get(INVITE_KEY))}`);
  ui.retireInvite();
  check('putting it away without an answer leaves it asked and unanswered',
    c.card.hidden === true && !ui.invite.up && ui.invite.state.asked === 1 && ui.invite.state.answer === '',
    `${ui.invite.state.asked} ${ui.invite.state.answer}`);
  land(ui, 'a', false, 2000);
  ui.raiseInvite();
  ui.answerInvite(false);
  check('No hides it, leaves the mode off, records the answer and touches no setting',
    c.card.hidden === true && ui.settings.feelTuning === false && ui.invite.state.answer === 'no'
    && stored().answer === 'no' && ui.heard === 0 && ui.painted === 0,
    `${ui.settings.feelTuning} ${ui.invite.state.answer}`);
  check('an answer counts the ask it answers, even before the card had been seen long enough',
    ui.invite.state.asked === 2 && stored().asked === 2, `${ui.invite.state.asked}`);
  land(ui, 'a', false, 3000);
  check('and after a No the next landing arms nothing', !ui.invite.armed, `${ui.invite.armed}`);
}
{
  const ui = page(dueState());
  land(ui, 'a', false, 1000);
  ui.raiseInvite();
  store.delete(SETTINGS_KEY);
  ui.answerInvite(true);
  check('Yes turns the mode on, repaints the sliders, tells the shell and records the answer',
    ui.settings.feelTuning === true && ui.painted === 1 && ui.heard === 1 && ui.invite.state.answer === 'yes'
    && ui.osdAir.invite.card.hidden === true && !ui.invite.up, `${ui.settings.feelTuning} ${ui.painted} ${ui.heard}`);
  check('and saves the settings with the mode on', store.has(SETTINGS_KEY) && JSON.parse(store.get(SETTINGS_KEY)).feelTuning === true,
    String(store.get(SETTINGS_KEY)).slice(0, 80));
  ui.answerInvite(true);
  check('a second tap on Yes while the card is going away changes nothing more', ui.painted === 1 && ui.heard === 1, `${ui.painted} ${ui.heard}`);
}
{
  const ui = page(dueState());
  ui.answerInvite(true);
  check('an answer with no card up does nothing: the mode stays off and nothing is written',
    ui.settings.feelTuning === false && ui.painted === 0 && ui.heard === 0 && ui.invite.state.answer === ''
    && stored() === null, `${ui.settings.feelTuning} ${ui.painted} ${ui.heard} "${ui.invite.state.answer}"`);
}

{
  const done = page(dueState());
  done.invite.state.answer = 'no';
  land(done, 'a', false, 5000);
  check('a pilot who has answered is not counted again: a landing changes nothing and writes nothing',
    stored() === null && done.invite.state.tracks[courseKeyOf('a')] === INVITE_TRACK_AIR_MS && !done.invite.armed,
    JSON.stringify(stored()));
  const spent = page(dueState());
  spent.invite.state.asked = INVITE_MAX_ASKS;
  land(spent, 'c', false, 5000);
  check('and neither is one who has been asked three times',
    stored() === null && spent.invite.state.tracks[courseKeyOf('c')] === undefined, JSON.stringify(stored()));
}
{
  const ui = page(dueState());
  land(ui, 'a', false, 1000);
  ui.raiseInvite();
  const c = ui.osdAir.invite;
  tick(ui, { at: ui.invite.shownAt + INVITE_SEEN_MS });
  ui.pauseAirSlider('paused');
  check('a pause puts the card away and keeps the landing armed, so it comes back with the flight',
    c.card.hidden === true && !ui.invite.up && ui.invite.armed && ui.invite.state.asked === 1,
    `${c.card.hidden} ${ui.invite.up} ${ui.invite.armed} ${ui.invite.state.asked}`);
  ui.raiseInvite();
  tick(ui, { at: ui.invite.shownAt + 2 * INVITE_SEEN_MS });
  check('and when it comes back it is not counted as asked a second time',
    c.card.hidden === false && ui.invite.up && ui.invite.state.asked === 1 && stored().asked === 1,
    `${c.card.hidden} ${ui.invite.state.asked}`);
  ui.pauseAirSlider('flight');
  check('flying on is not a pause: the screen being flight leaves the card alone', c.card.hidden === false && ui.invite.up, `${c.card.hidden}`);
  ui.pauseAirSlider('title');
  check('leaving for any screen but the pause ends the landing it belonged to',
    c.card.hidden === true && !ui.invite.up && !ui.invite.armed, `${c.card.hidden} ${ui.invite.up} ${ui.invite.armed}`);
  land(ui, 'a', false, 2000);
  ui.raiseInvite();
  tick(ui, { at: ui.invite.shownAt + INVITE_SEEN_MS });
  check('the next landing is a new ask, and is counted', ui.invite.state.asked === 2 && stored().asked === 2,
    `${ui.invite.state.asked}`);
}
{
  const ui = page(dueState());
  land(ui, 'a', false, 1000);
  ui.pauseAirSlider('paused');
  check('a pause with the landing armed and the card not yet raised leaves it armed', ui.invite.armed && !ui.invite.up,
    `${ui.invite.armed} ${ui.invite.up}`);
  ui.pauseAirSlider('title');
  check('and going to the title drops it', !ui.invite.armed, `${ui.invite.armed}`);
}

/* ---- the frame ------------------------------------------------------------ */

{
  /* A bounce: the quad lands, the card goes up, the quad lifts again before it
   * was seen, and lands. The card that blinked is not an ask, and the landing
   * after it is the one that stays. */
  const ui = page(dueState());
  land(ui, 'a', false, 5000);
  tick(ui, { at: 1000 });
  check('a frame on the ground with the landing armed and nothing in the way raises the card',
    ui.invite.up && ui.osdAir.invite.card.hidden === false && !ui.invite.armed, `${ui.invite.up} ${ui.invite.armed}`);
  tick(ui, { ready: true, at: 1160 });
  check('the quad lifting again retires it, and it was not counted',
    !ui.invite.up && ui.osdAir.invite.card.hidden === true && ui.invite.state.asked === 0 && !ui.invite.counted
    && stored() === null, `${ui.invite.state.asked} ${JSON.stringify(stored())}`);
  land(ui, 'a', false, 5160);
  tick(ui, { at: 1400 });
  check('the landing after the bounce raises it again', ui.invite.up && ui.osdAir.invite.card.hidden === false,
    `${ui.invite.up}`);
  tick(ui, { at: 1400 + INVITE_SEEN_MS });
  check('and that one is counted, once: the pilot was asked once',
    ui.invite.state.asked === 1 && stored().asked === 1, `${ui.invite.state.asked}`);
}
{
  const ui = page(dueState());
  land(ui, 'a', false, 1000);
  tick(ui, { ready: true, at: 10 });
  check('a quad that takes off before the card found room has not been asked: nothing is armed, nothing counted',
    !ui.invite.armed && !ui.invite.up && ui.invite.state.asked === 0, `${ui.invite.armed} ${ui.invite.state.asked}`);
}
{
  const ui = page(dueState());
  land(ui, 'a', false, 1000);
  ui.osdAir.hint.hidden = false;
  ui.tickInvite(false, false, ui.osdAir, 0);
  check('the Weight card on the glass holds the invitation back', !ui.invite.up && ui.invite.armed, `${ui.invite.up} ${ui.invite.armed}`);
  ui.osdAir.hint.hidden = true;
  ui.osdAir.tune = { hint: { hidden: false } };
  ui.tickInvite(false, false, ui.osdAir, 0);
  check('and so does the tuning card', !ui.invite.up && ui.invite.armed, `${ui.invite.up} ${ui.invite.armed}`);
  ui.osdAir.tune.hint.hidden = true;
  ui.tickInvite(false, true, ui.osdAir, 0);
  check('and so does a dialog', !ui.invite.up && ui.invite.armed, `${ui.invite.up} ${ui.invite.armed}`);
  ui.tickInvite(false, false, ui.osdAir, 0);
  check('with all of them away it goes up', ui.invite.up, `${ui.invite.up}`);
}
{
  const ui = page(dueState());
  land(ui, 'a', false, 1000);
  tick(ui, { at: 0 });
  tick(ui, { dialog: true, at: 100 });
  check('a dialog opening over the card puts it away, uncounted', !ui.invite.up && ui.invite.state.asked === 0,
    `${ui.invite.up} ${ui.invite.state.asked}`);
}
{
  const ui = page(dueState());
  land(ui, 'a', false, 1000);
  tick(ui, { at: 0 });
  ui.settings.feelTuning = true;
  tick(ui, { at: 100 });
  check('the mode coming on some other way, the Settings switch or the Quad room, puts the card away',
    !ui.invite.up && ui.osdAir.invite.card.hidden === true, `${ui.invite.up}`);
  const armed = page(dueState());
  land(armed, 'a', false, 1000);
  armed.settings.feelTuning = true;
  tick(armed, { at: 0 });
  check('and a landing that is armed when it comes on is dropped, not raised', !armed.invite.armed && !armed.invite.up,
    `${armed.invite.armed} ${armed.invite.up}`);
}

/* ---- report ------------------------------------------------------------- */

const w = Math.max(...rows.map((r) => r[0].length));
console.log('tuneinvite-selftest: the invitation to help tune flight feel\n');
for (const [name, status, detail] of rows) {
  console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} checks clean`);
process.exit(failed === 0 ? 0 : 1);
