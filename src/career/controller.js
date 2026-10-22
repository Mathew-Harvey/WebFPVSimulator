/*
 * controller.js: the career, running inside the game.
 *
 * It owns one lesson at a time: its world, its run (./objectives.js), the
 * markers in the world (./visuals.js), the screens (./screens.js), the coach
 * and the record of what the pilot has done (./progress.js). It reaches the
 * game only through the small object src/main.js hands it, `shell` below,
 * so the hooks in main.js are a handful of one line calls and this file can
 * change without touching the frame loop.
 *
 *   shell.enterWorld({ map, doc, airframe })   build a lesson's world
 *   shell.leaveWorld()                         the pilot's own back
 *   shell.fly(then)                            a fresh run; then() once live
 *   shell.freeze(kind)                         stop stepping, for a screen
 *   shell.idle()                               the title camera
 *   shell.setFlightMode(mode | null)           Angle or Acro, held
 *   shell.setCamera('chase' | 'fpv' | null)
 *   shell.camera, shell.canvas                 to put markers on screen
 *   shell.scene()                              the world's scene
 *   shell.gatesPerLap(), shell.gapZones(), shell.groundAt(x, z)
 *   shell.stickMode(), shell.uiScreen()
 *   shell.presence(values)                     Steam's rich presence
 *   shell.onResult(info)                       achievements and stats
 *   shell.sound(name)                          a cue
 *
 * WHAT THE GAME TELLS IT, by the hooks in main.js: frame(record) every
 * rendered frame while a lesson flies, tick() every frame, trick(t),
 * gaps(events), crash(), reset(), and the keys and pad while its screens
 * are up. Nothing here writes to the physics.
 *
 * STATES. idle (not in the career), hub, briefing, launching (Fly pressed,
 * the game is starting the run), flight, results. The game's own screens
 * are hidden under hub, briefing and results (./style.js, body.career-menu).
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { CHAPTERS, chapterOf, lessonById, nextLesson } from './curriculum.js';
import { createRun } from './objectives.js';
import {
  loadProgress, recordRun, saveProgress, lessonRecord,
} from './progress.js';
import { CareerScreens } from './screens.js';
import { createVisuals } from './visuals.js';
import { sticksIn } from './words.js';
import { INKS } from '../ui/lettering.js';

const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  Enter: 'select', Space: 'select', NumpadEnter: 'select',
  Escape: 'back', Backspace: 'back',
  KeyQ: 'prevChapter', PageUp: 'prevChapter', KeyE: 'nextChapter', PageDown: 'nextChapter',
  KeyR: 'retry',
};

/* How long a coach line stays up at least, how long before the same line
 * may come back, and how long an objective's own hint is shown. A coach who
 * repeats himself every frame is noise. */
const COACH_MIN_MS = 1800;
const COACH_REPEAT_MS = 5000;
const HINT_MS = 5500;
/* A detail has to last this long before the coach says it: a frame outside
 * the box on the way in is not a mistake. */
const SETTLE_MS = 650;
/* One crash, however many of the game's crash paths saw it. */
const CRASH_DEBOUNCE_MS = 1200;
/* A held direction on the pad repeats after this, then this often. */
const PAD_REPEAT_FIRST_MS = 380;
const PAD_REPEAT_MS = 150;

export function createCareer(shell) {
  let progress = loadProgress();
  let state = 'idle';
  let lesson = null;
  let run = null;
  let lastStatus = null;
  let objectiveAt = -1;
  let objectiveSince = 0;
  let worldReady = false;
  let loadToken = 0;
  let lastCrashAt = -1e9;
  let lastSimMs = 0;
  let hudShown = true;
  const visuals = createVisuals();
  const proj = new THREE.Vector3();
  const coach = { text: '', since: 0, last: {} };
  let detailSince = { key: '', at: 0 };

  const screens = new CareerScreens({
    open: (id) => openLesson(id),
    fly: () => startFlight(),
    backToHub: () => backToHub(),
    leave: () => leave(),
    retry: () => retry(),
    next: () => {
      const n = lesson && nextLesson(lesson.id);
      if (n) {
        openLesson(n.id);
      } else {
        backToHub();
      }
    },
    openAll: () => {
      progress.openAll = true;
      saveProgress(progress);
      screens.showHub(progress, { stickMode: shell.stickMode(), keys: flyingOnKeys() });
    },
    /* The achievements are the platform's (shell.achievements); the
     * career only shows them. */
    achievements: () => openAchievements(),
    closeAchievements: () => closeAchievements(),
    achievementCount: () => {
      const list = shell.achievements ? shell.achievements() : null;
      return list && list.length ? { earned: list.filter((a) => a.unlocked).length, total: list.length } : null;
    },
  });

  /* Whether the quad flies on the keyboard: no radio or pad is chosen. */
  function flyingOnKeys() {
    return typeof shell.flyingOnKeys === 'function' ? Boolean(shell.flyingOnKeys()) : false;
  }

  function openAchievements() {
    if (state !== 'hub' || !shell.achievements) {
      return;
    }
    state = 'achievements';
    screens.showAchievements(shell.achievements());
    padCalm();
  }

  function closeAchievements() {
    if (state !== 'achievements') {
      return;
    }
    state = 'hub';
    screens.showHub(progress, { stickMode: shell.stickMode(), keys: flyingOnKeys() });
    padCalm();
  }

  /* The markers live in the world's scene, which a world swap replaces. */
  function mountVisuals() {
    const scene = shell.scene();
    if (scene && visuals.root.parent !== scene) {
      if (visuals.root.parent) {
        visuals.root.parent.remove(visuals.root);
      }
      scene.add(visuals.root);
    }
  }

  function unmountVisuals() {
    visuals.clear();
    if (visuals.root.parent) {
      visuals.root.parent.remove(visuals.root);
    }
  }

  /* ---------------- the hub ---------------- */

  /* The chapter and lesson the hub opens on: the next lesson after the last
   * one flown, if that one is finished, otherwise the last one flown. */
  function hubPlace() {
    const last = progress.last ? lessonById(progress.last) : null;
    if (!last) {
      return { chapter: 0, lesson: 0 };
    }
    let target = last;
    const n = nextLesson(last.id);
    if (lessonRecord(progress, last.id)?.medal && n) {
      target = n;
    }
    const chapter = Math.max(0, CHAPTERS.findIndex((c) => c.id === target.chapter));
    const at = Math.max(0, CHAPTERS[chapter].lessons.findIndex((l) => l.id === target.id));
    return { chapter, lesson: at };
  }

  function openHub(place) {
    progress = loadProgress();
    state = 'hub';
    const where = place || hubPlace();
    screens.showHub(progress, { ...where, stickMode: shell.stickMode(), keys: flyingOnKeys() });
    padCalm();
    shell.presence({ steam_display: '#Career', lesson: '' });
  }

  async function openLesson(id) {
    const l = lessonById(id);
    if (!l) {
      return;
    }
    lesson = l;
    state = 'briefing';
    worldReady = false;
    run = null;
    lastStatus = null;
    unmountVisuals();
    shell.setCamera(null);
    shell.setFlightMode(null);
    screens.showBriefing(lesson, {
      record: lessonRecord(progress, id), stickMode: shell.stickMode(), ready: false, keys: flyingOnKeys(),
    });
    padCalm();
    const token = ++loadToken;
    try {
      await shell.enterWorld({
        map: lesson.world.map,
        doc: lesson.world.doc,
        airframe: lesson.airframe || '5inch',
      });
    } catch (e) {
      console.error(e);
      if (token === loadToken && state === 'briefing') {
        screens.setReady(false, `${e && e.message ? e.message : 'This lesson could not be loaded.'} Back to the career and try again.`);
      }
      return;
    }
    if (token !== loadToken || state !== 'briefing') {
      return;
    }
    worldReady = true;
    mountVisuals();
    screens.setReady(true);
  }

  /* ---------------- flying ---------------- */

  function newRun() {
    const doc = lesson.world.doc;
    run = createRun(lesson, {
      W: doc.field.width,
      D: doc.field.depth,
      gatesPerLap: shell.gatesPerLap(),
    });
    objectiveAt = -1;
    lastStatus = run.status();
    coach.text = '';
    coach.last = {};
    detailSince = { key: '', at: 0 };
    lastCrashAt = -1e9;
    screens.coach(null);
    syncObjective(0);
  }

  function startFlight() {
    if (!worldReady || !lesson || state === 'launching') {
      return;
    }
    /* The screen Fly was pressed on stays up until the run is live. */
    state = 'launching';
    shell.setFlightMode(lesson.mode);
    shell.setCamera(lesson.camera || 'fpv');
    const token = loadToken;
    shell.fly(() => {
      if (state !== 'launching' || token !== loadToken) {
        return;
      }
      state = 'flight';
      mountVisuals();
      newRun();
      screens.showFlight(lesson);
      screens.paintStatus(run.status(), shell.stickMode(), flyingOnKeys());
      hudShown = true;
      screens.hud.style.visibility = 'visible';
      shell.presence({ steam_display: '#Lesson', lesson: `${lesson.id.replace('-', '.')} ${lesson.title}` });
    });
  }

  function retry() {
    if (!lesson || !worldReady) {
      return;
    }
    startFlight();
  }

  function backToHub() {
    loadToken += 1;
    const was = state;
    state = 'hub';
    run = null;
    lastStatus = null;
    visuals.clear();
    shell.setCamera(null);
    shell.setFlightMode(null);
    if (was === 'flight' || was === 'results' || was === 'launching' || was === 'briefing') {
      shell.idle();
    }
    const chapter = lesson ? Math.max(0, CHAPTERS.findIndex((c) => c.id === lesson.chapter)) : 0;
    const at = lesson ? Math.max(0, CHAPTERS[chapter].lessons.findIndex((l) => l.id === lesson.id)) : 0;
    openHub(lesson && was !== 'results' ? { chapter, lesson: at } : null);
  }

  async function leave() {
    loadToken += 1;
    state = 'idle';
    run = null;
    lesson = null;
    lastStatus = null;
    unmountVisuals();
    shell.setCamera(null);
    shell.setFlightMode(null);
    screens.screen = '';
    await shell.leaveWorld();
    shell.presence({ steam_display: '#Menu' });
  }

  function syncObjective(t) {
    const st = run.status();
    if (st.index !== objectiveAt) {
      objectiveAt = st.index;
      objectiveSince = t;
      const o = st.current ? st.current.objective : null;
      visuals.setObjective(o, {
        gapZones: shell.gapZones(),
        groundAt: shell.groundAt,
      });
    }
  }

  function finish(status) {
    state = 'results';
    shell.freeze('results');
    visuals.clear();
    screens.target(null);
    screens.coach(null);
    const complete = status.phase === 'complete';
    const outcome = recordRun(progress, lesson.id, {
      complete,
      ms: complete ? status.result.ms : null,
      medal: status.medal,
      score: complete ? status.result.score : null,
    });
    saveProgress(progress);
    if (complete) {
      shell.sound('record');
    }
    screens.showResults(lesson, status, outcome, { next: nextLesson(lesson.id), stickMode: shell.stickMode(), keys: flyingOnKeys() });
    padCalm();
    shell.presence({ steam_display: '#Career', lesson: '' });
    shell.onResult({
      lesson, status, outcome, progress, chapter: chapterOf(lesson.id),
    });
  }

  /* ---------------- the coach ---------------- */

  /* One line, the most useful thing to say now, or null. */
  function coachLine(st, f, t) {
    const cur = st.current;
    if (!cur) {
      return null;
    }
    const o = cur.objective;
    const d = cur.detail;
    if (st.phase === 'ready') {
      return { text: cur.hint || 'Take off when you are ready.', tone: 'info' };
    }
    if (!f.landed && f.vel.y < -6.5 && f.height < 5 && lesson.mode === 'angle') {
      return { text: 'Throttle up: you are falling.', tone: 'warn' };
    }
    const key = `${cur.kind}:${d}`;
    if (detailSince.key !== key) {
      detailSince = { key, at: t };
    }
    const settled = t - detailSince.at > SETTLE_MS;
    if (d && settled) {
      const line = detailLine(cur, o, d, f);
      if (line) {
        return line;
      }
    }
    if (t - objectiveSince < HINT_MS && cur.hint) {
      return { text: cur.hint, tone: 'info' };
    }
    return null;
  }

  function detailLine(cur, o, d, f) {
    const above = (top) => f.pos.y > top;
    const below = (bottom) => f.pos.y < bottom;
    switch (cur.kind) {
      case 'hold': {
        if (d === 'outside') {
          const z = o.zone;
          if (z && z.kind === 'cylinder' && above(z.y1)) {
            return { text: 'Too high: ease off the throttle.', tone: 'warn' };
          }
          if (z && z.kind === 'cylinder' && below(z.y0)) {
            return { text: 'A little higher: more throttle.', tone: 'warn' };
          }
          if (z && z.kind === 'box' && above(z.c.y + z.hy)) {
            return { text: 'Too high: ease off the throttle.', tone: 'warn' };
          }
          if (z && z.kind === 'box' && below(z.c.y - z.hy)) {
            return { text: 'A little higher: more throttle.', tone: 'warn' };
          }
          return { text: 'Back into the marked space.', tone: 'warn' };
        }
        if (d === 'fast') {
          return { text: 'Slow down: hold still in there.', tone: 'warn' };
        }
        if (d === 'airborne') {
          return { text: 'Take off again.', tone: 'info' };
        }
        return null;
      }
      case 'land':
        if (d === 'hard') {
          return { text: 'Too hard. Take off and come down gently.', tone: 'warn' };
        }
        if (d === 'offpad') {
          return { text: 'Not on the pad. Take off and land on the lit one.', tone: 'warn' };
        }
        return null;
      case 'face':
        if (d === 'left') {
          return { text: 'Turn left: {yaw} to the left.', tone: 'info' };
        }
        if (d === 'right') {
          return { text: 'Turn right: {yaw} to the right.', tone: 'info' };
        }
        if (d === 'outside') {
          return { text: 'Stay low, over the pad.', tone: 'warn' };
        }
        return null;
      case 'orbit':
        if (d === 'close') {
          return { text: 'Wider: you are too close.', tone: 'warn' };
        }
        if (d === 'far') {
          return { text: 'Tighter: come closer to the middle.', tone: 'info' };
        }
        if (d === 'low') {
          return { text: 'A little higher.', tone: 'info' };
        }
        return null;
      case 'attitude':
        if (d === 'low') {
          return { text: 'Climb higher first.', tone: 'info' };
        }
        if (d === 'slow') {
          return { text: 'More speed.', tone: 'info' };
        }
        return null;
      case 'trick':
        if (d === 'low') {
          return { text: `Higher: above ${o.minHeight} m.`, tone: 'warn' };
        }
        if (d === 'sloppy') {
          return { text: 'Clean it up: one smooth rotation.', tone: 'info' };
        }
        if (d === 'other') {
          return {
            text: cur.state.lastName ? `That was a ${cur.state.lastName}. The lesson wants ${cur.text.replace(/^Land an? /, 'a ').toLowerCase()}.` : 'Not that one. Read the objective again.',
            tone: 'info',
          };
        }
        return null;
      case 'segmented':
        if (d === 'low') {
          return { text: `Higher: above ${o.minHeight} m before you start.`, tone: 'warn' };
        }
        if (d === 'nostop') {
          return { text: 'Stop between the halves: count "one", then go.', tone: 'info' };
        }
        if (d === 'other') {
          return { text: o.mode === 'back' ? 'Half a roll, stop, and half a roll back.' : 'Two halves the same way, with a stop between.', tone: 'info' };
        }
        return null;
      case 'gap':
        if (d === 'order') {
          return { text: `Wrong gap. Next is ${cur.state.target}.`, tone: 'warn' };
        }
        return null;
      default:
        return null;
    }
  }

  function paintCoach(line, t) {
    if (!line) {
      if (coach.text && t - coach.since > COACH_MIN_MS) {
        coach.text = '';
        screens.coach(null);
      }
      return;
    }
    const text = sticksIn(line.text, shell.stickMode(), { keys: flyingOnKeys() });
    if (text === coach.text) {
      return;
    }
    if (coach.text && t - coach.since < COACH_MIN_MS) {
      return;
    }
    if (line.tone !== 'warn' && coach.last[text] && t - coach.last[text] < COACH_REPEAT_MS && t - objectiveSince > HINT_MS) {
      return;
    }
    coach.text = text;
    coach.since = t;
    coach.last[text] = t;
    screens.coach(text, line.tone);
  }

  /* ---------------- the display ---------------- */

  /* The marker: the next target on screen, or an arrow at the edge. */
  function paintMarker(st, f) {
    const cur = st.current;
    let m = cur ? cur.marker : null;
    if (cur && cur.kind === 'gap') {
      const name = cur.state.target || (cur.objective.names || []).find((n) => !(cur.state.seen || []).includes(n));
      const z = (shell.gapZones() || []).find((g) => g.name === name);
      m = z ? { x: z.x, y: z.y + z.h / 2, z: z.z } : null;
    }
    if (!m || !shell.camera) {
      screens.target(null);
      return;
    }
    /* A space to hold or a heading to face is drawn in the world and the
     * pilot is in it or beside it: a marker on top of it would only sit on
     * the coach's line. It points the way from further off. */
    if ((cur.kind === 'hold' || cur.kind === 'face')
      && Math.hypot(m.x - f.pos.x, m.z - f.pos.z) < 12) {
      screens.target(null);
      return;
    }
    const cam = shell.camera;
    const canvas = shell.canvas;
    const W = canvas ? canvas.clientWidth : window.innerWidth;
    const H = canvas ? canvas.clientHeight : window.innerHeight;
    cam.updateMatrixWorld();
    proj.set(m.x, m.y, m.z).project(cam);
    const behind = proj.z > 1;
    let x = proj.x;
    let y = proj.y;
    if (behind) {
      x = -x;
      y = -y;
    }
    const dist = Math.hypot(m.x - f.pos.x, m.y - f.pos.y, m.z - f.pos.z);
    const margin = 0.86;
    const onScreen = !behind && Math.abs(x) <= margin && Math.abs(y) <= margin;
    if (onScreen) {
      screens.target({
        x: ((x + 1) / 2) * W, y: ((1 - y) / 2) * H, edge: false, dist,
      });
      return;
    }
    const k = margin / Math.max(Math.abs(x), Math.abs(y), 1e-6);
    const ex = x * k;
    const ey = y * k;
    screens.target({
      x: ((ex + 1) / 2) * W,
      y: ((1 - ey) / 2) * H,
      edge: true,
      angle: Math.atan2(ex, ey),
      dist,
    });
  }

  /* The height gauge, in Angle lessons where height is the point. */
  function paintAltitude(st, f) {
    const cur = st.current;
    if (!cur || lesson.mode !== 'angle') {
      screens.altitude(0, null);
      return;
    }
    const o = cur.objective;
    let band = null;
    if (cur.kind === 'takeoff') {
      const min = o.minHeight ?? 0.5;
      band = [min, Math.max(3, min + 2)];
    } else if (cur.kind === 'hold' && o.zone && o.zone.kind === 'cylinder') {
      band = [o.zone.y0, o.zone.y1];
    } else if (cur.kind === 'hold' && o.zone && o.zone.kind === 'box') {
      band = [o.zone.c.y - o.zone.hy, o.zone.c.y + o.zone.hy];
    } else if (cur.kind === 'land') {
      band = [0, 0.25];
    }
    screens.altitude(f.height, band);
  }

  /* ---------------- what the game tells the career ---------------- */

  function frame(f) {
    if (state !== 'flight' || !run) {
      return;
    }
    const before = run.status();
    const st = run.frame(f);
    const t = f.simMs;
    lastSimMs = t;
    for (const e of run.drain()) {
      if (e.type === 'objective') {
        /* The word, stamped, and the objective it was under it. */
        screens.stamp('Clear', INKS.mint, 60, 1100);
        screens.flash(`Done: ${sticksIn(e.text, shell.stickMode(), { keys: flyingOnKeys() })}`);
        shell.sound('gate');
      } else if (e.type === 'start') {
        objectiveSince = t;
        if (lesson.clock !== 'start') {
          /* Off the pad: the clock is running. */
          screens.stamp('Go', INKS.amber, 64, 700);
        }
      }
    }
    if (st.current && st.current.kind === 'rings' && before.current && before.current.kind === 'rings'
      && st.current.state.index > before.current.state.index) {
      shell.sound('gate');
    }
    syncObjective(t);
    lastStatus = st;
    if (st.phase === 'complete' || st.phase === 'failed') {
      finish(st);
      return;
    }
    visuals.update(st, Math.max(0, Math.min(100, f.dtMs || 16)), f.pos);
    screens.paintStatus(st, shell.stickMode(), flyingOnKeys());
    paintCoach(coachLine(st, f, t), t);
    paintAltitude(st, f);
    paintMarker(st, f);
  }

  /* Every frame, whatever is up: the display shows only over the flight
   * screen (not over the pause menu or a room opened from it), and the
   * markers follow the world into a new scene after a graphics change. */
  function tick() {
    if (state !== 'flight') {
      return;
    }
    const flying = shell.uiScreen() === 'flight';
    if (flying !== hudShown) {
      hudShown = flying;
      screens.hud.style.visibility = flying ? 'visible' : 'hidden';
    }
    mountVisuals();
  }

  function trick(t) {
    if (state !== 'flight' || !run) {
      return;
    }
    if (run.trick(t)) {
      screens.stamp(String(t.name || 'Trick').toUpperCase(), INKS.amber, 64);
      shell.sound('record');
    }
  }

  function gaps(events) {
    if (state !== 'flight' || !run || !events) {
      return;
    }
    for (const e of events) {
      if (e && e.kind === 'gap' && run.gap(e)) {
        screens.stamp(String(e.name), INKS.mint, 52);
      }
    }
  }

  function crash() {
    if (state !== 'flight' || !run) {
      return;
    }
    const now = performance.now();
    if (now - lastCrashAt < CRASH_DEBOUNCE_MS) {
      return;
    }
    lastCrashAt = now;
    run.crash();
    if (run.status().phase !== 'failed' && lesson.crashTip) {
      /* The tip goes up at once, over whatever the coach was saying, and
       * stays a while. */
      const t = lastSimMs;
      coach.text = sticksIn(lesson.crashTip, shell.stickMode(), { keys: flyingOnKeys() });
      coach.since = t + 2500;
      coach.last[coach.text] = t;
      screens.coach(coach.text, 'warn');
    }
  }

  /* R, the radio's restart switch, or Restart lesson from the pause menu:
   * a fresh run of the same lesson. */
  function reset() {
    if (state === 'flight' && lesson) {
      newRun();
      screens.paintStatus(run.status(), shell.stickMode(), flyingOnKeys());
    }
  }

  /* ---------------- input ---------------- */

  function command(k) {
    if (state === 'hub') {
      screens.hubKey(k);
      return true;
    }
    if (state === 'achievements') {
      if (k === 'back') {
        closeAchievements();
      } else {
        screens.achKey(k);
      }
      return true;
    }
    if (state === 'briefing') {
      if (k === 'back') {
        backToHub();
      } else {
        screens.listKey2(k);
      }
      return true;
    }
    if (state === 'results') {
      if (k === 'back') {
        backToHub();
      } else if (k === 'retry') {
        retry();
      } else {
        screens.listKey2(k);
      }
      return true;
    }
    return state === 'launching';
  }

  function handleKey(code, repeat) {
    if (state === 'idle' || state === 'flight') {
      return false;
    }
    const k = KEYS[code];
    if (!k) {
      return true;
    }
    screens.setHands('keys');
    if (repeat && (k === 'select' || k === 'back' || k === 'retry')) {
      return true;
    }
    return command(k);
  }

  /*
   * THE PAD. `nav` is main.js's padNav(), levels: the sticks or the D-pad
   * as directions, A as select, B as back, and on a standard pad Start and
   * the shoulders. Edges are found here, a held direction repeats, and a
   * screen that has just opened waits for the sticks to be at rest and the
   * buttons up before it listens, so the stick a lesson ended on does not
   * walk the results and the button that opened a screen does not press
   * the first thing on it. Same rule as src/input/padgate.js.
   */
  const padHeld = { at: 0, dir: '' };
  let padPrev = {};
  let padWait = true;

  function padCalm() {
    padWait = true;
  }

  function wantsPad() {
    return state !== 'idle' && state !== 'flight';
  }

  function pollPad(nav, nowMs) {
    if (!wantsPad() || !nav) {
      padPrev = nav || {};
      padWait = true;
      return false;
    }
    if (padWait) {
      const quiet = (nav.calm !== false) && !nav.select && !nav.back && !nav.start
        && !nav.up && !nav.down && !nav.left && !nav.right;
      if (quiet) {
        padWait = false;
      }
      padPrev = { ...nav };
      return true;
    }
    if (nav.select || nav.back || nav.start || nav.lb || nav.rb || nav.up || nav.down || nav.left || nav.right) {
      screens.setHands('pad');
    }
    if (nav.select && !padPrev.select) {
      command('select');
    } else if (nav.start && !padPrev.start) {
      command('select');
    } else if (nav.back && !padPrev.back) {
      command('back');
    } else if (nav.lb && !padPrev.lb) {
      command('prevChapter');
    } else if (nav.rb && !padPrev.rb) {
      command('nextChapter');
    }
    const dir = ['up', 'down', 'left', 'right'].find((d) => nav[d]) || '';
    if (dir) {
      if (dir !== padHeld.dir) {
        padHeld.dir = dir;
        padHeld.at = nowMs + PAD_REPEAT_FIRST_MS;
        command(dir);
      } else if (nowMs >= padHeld.at) {
        padHeld.at = nowMs + PAD_REPEAT_MS;
        command(dir);
      }
    } else {
      padHeld.dir = '';
    }
    padPrev = { ...nav };
    return true;
  }

  return {
    openHub,
    frame,
    tick,
    trick,
    gaps,
    crash,
    reset,
    handleKey,
    pollPad,
    wantsPad,
    /* Whether the career has the run: main.js keeps its own race results,
     * timed freestyle runs and first flight guide out of a lesson's way. */
    owns: () => state === 'launching' || state === 'flight' || state === 'results',
    active: () => state !== 'idle',
    state: () => state,
    lesson: () => lesson,
    status: () => lastStatus,
    progress: () => progress,
    /* The pause menu's career rows. */
    briefing: () => {
      if (lesson) {
        state = 'briefing';
        shell.freeze();
        visuals.clear();
        screens.showBriefing(lesson, {
          record: lessonRecord(progress, lesson.id), stickMode: shell.stickMode(), ready: worldReady, keys: flyingOnKeys(),
        });
        padCalm();
      }
    },
    backToHub,
    leave,
    /* For the harness. */
    openLessonById: (id) => openLesson(id),
    fly: () => startFlight(),
    hands: (h) => screens.setHands(h),
  };
}
