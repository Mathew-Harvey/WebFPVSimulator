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
 *   shell.hasMap(id)                           is that map in this build
 *   shell.boardDocument(kind, id)              a map or track from the
 *                                              board, kind 'map' or 'track':
 *                                              its document, or a rejection
 *   shell.setLivery(livery)                    paint the pilot's quad
 *
 * WHAT THE GAME TELLS IT, by the hooks in main.js: frame(record) every
 * rendered frame while a lesson flies, tick() every frame, trick(t),
 * gaps(events), crash(), reset(), and the keys and pad while its screens
 * are up. Nothing here writes to the physics.
 *
 * STATES. idle (not in the career); the menus: cover (the career's front
 * page), tree, fork (race or freestyle, once), level (Set my level and the
 * save code), paint (the Paint Shop) and achievements; then briefing,
 * launching (Fly pressed, the
 * game is starting the run), flight and results. The game's own screens are
 * hidden under every menu (./style.js, body.career-menu).
 *
 *   shell.cloudSave                            true where the save is kept
 *                                              with an account (Steam Cloud)
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
import { chapterOf, lessonById } from './curriculum.js';
import { createRun } from './objectives.js';
import {
  clearKnown, decodeSave, encodeSave, lessonRecord, loadProgress, markKnown, mergeProgress,
  nextUp, recordRun, saveProgress, setLevel, titleOf,
} from './progress.js';
import { saveTitle } from './titles.js';
import { partOf } from './tree.js';
import { CareerScreens } from './screens.js';
import { createVisuals } from './visuals.js';
import { sticksIn } from './words.js';
import { INKS } from '../ui/lettering.js';
import { liveryById, saveLivery, savedLivery } from '../render/livery.js';

const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  Enter: 'select', Space: 'select', NumpadEnter: 'select',
  Escape: 'back', Backspace: 'back',
  KeyQ: 'prevChapter', PageUp: 'prevChapter', KeyE: 'nextChapter', PageDown: 'nextChapter',
  KeyR: 'retry', KeyT: 'tree', KeyL: 'level', KeyK: 'known', KeyP: 'paint',
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

  /* Where the briefing and Set my level were opened from, for Back. */
  let briefFrom = 'tree';
  let levelFrom = 'cover';

  const screens = new CareerScreens({
    open: (id, from) => openLesson(id, from),
    fly: () => startFlight(),
    backFromBriefing: () => (briefFrom === 'cover' ? toCover() : backToHub()),
    leave: () => leave(),
    retry: () => retry(),
    next: () => {
      const n = nextUp(progress);
      if (n && n.fork) {
        toFork();
      } else if (n && n.lesson) {
        openLesson(n.lesson, 'cover');
      } else {
        toCover();
      }
    },
    toCover: () => toCover(),
    toTree: (part) => toTree(part),
    toFork: () => toFork(),
    toLevel: () => toLevel(),
    levelBack: () => (levelFrom === 'tree' ? toTree() : toCover()),
    chooseBranch: (b) => {
      progress.first = b === 'freestyle' ? 'freestyle' : 'race';
      saveProgress(progress);
      const n = nextUp(progress);
      if (n && n.lesson) {
        openLesson(n.lesson, 'cover');
      } else {
        toTree();
      }
    },
    markKnown: (partId, on) => {
      if (markKnown(progress, partId, on)) {
        saveProgress(progress);
      }
      toTree(partId);
    },
    setLevel: (answers) => {
      setLevel(progress, answers);
      if (!progress.first && (answers.race || answers.flips)) {
        progress.first = answers.race ? 'race' : 'freestyle';
      }
      saveProgress(progress);
      const n = nextUp(progress);
      toTree(n && n.lesson ? partOf(n.lesson)?.id : null);
    },
    openAll: (on) => {
      progress.openAll = Boolean(on);
      saveProgress(progress);
      showLevel(on ? 'Every part of the tree is open. Stars are still yours to fly for.' : 'The tree opens one part at a time again. Your medals are all still there.');
    },
    clearKnown: () => {
      if (clearKnown(progress)) {
        saveProgress(progress);
      }
      showLevel('Nothing is marked as known now. What you have flown stays flown.', true);
    },
    saveCode: () => encodeSave(progress),
    loadCode: (text) => {
      const got = decodeSave(text);
      if (!got) {
        return 'That code did not read. Check it was copied whole, from WFPV2 to the end.';
      }
      progress = mergeProgress(progress, got);
      saveProgress(progress);
      return 'Loaded. Your career now has the best of both: every medal, every best time.';
    },
    /* The achievements are the platform's (shell.achievements); the
     * career only shows them. */
    achievements: () => openAchievements(),
    closeAchievements: () => closeAchievements(),
    toPaint: () => toPaint(),
    paintBack: () => toCover(),
    paint: (id) => choosePaint(id),
  });

  /* Whether the quad flies on the keyboard: no radio or pad is chosen. */
  function flyingOnKeys() {
    return typeof shell.flyingOnKeys === 'function' ? Boolean(shell.flyingOnKeys()) : false;
  }

  function achievementCount() {
    const list = shell.achievements ? shell.achievements() : null;
    return list && list.length ? { earned: list.filter((a) => a.unlocked).length, total: list.length } : null;
  }

  /* The Paint Shop, from the cover. A livery is the browser's own key, not
   * the career's save, so main.js paints the quad at boot without loading
   * the career; see src/render/livery.js. */
  function toPaint() {
    settleMenu();
    state = 'paint';
    screens.showPaint(progress, { current: savedLivery().id });
    padCalm();
  }

  function choosePaint(id) {
    const l = liveryById(id);
    saveLivery(l.id);
    if (shell.setLivery) {
      shell.setLivery(l);
    }
    if (state === 'paint') {
      screens.showPaint(progress, { current: l.id, said: `${l.name}: on your quad.` });
    }
  }

  function openAchievements() {
    if (state !== 'cover' || !shell.achievements) {
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
    toCover();
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

  /* ---------------- the menus ---------------- */

  /* Off the lesson's run and back to a menu: the title camera over
   * whatever world is up, and nothing flying. */
  function settleMenu() {
    loadToken += 1;
    const was = state;
    run = null;
    lastStatus = null;
    visuals.clear();
    shell.setCamera(null);
    shell.setFlightMode(null);
    if (was === 'flight' || was === 'results' || was === 'launching' || was === 'briefing') {
      shell.idle();
    }
  }

  function toCover() {
    settleMenu();
    state = 'cover';
    screens.showCover(progress, {
      next: nextUp(progress),
      stickMode: shell.stickMode(),
      keys: flyingOnKeys(),
      steam: Boolean(shell.cloudSave),
      achievements: achievementCount(),
      livery: savedLivery().id,
    });
    padCalm();
    shell.presence({ steam_display: '#Career', lesson: '' });
  }

  /* The tree, on `part` if one is named, else on the part of the lesson
   * that is up or was last flown, else where the pilot is now. */
  function toTree(part) {
    settleMenu();
    state = 'tree';
    const n = nextUp(progress);
    const here = n && n.lesson ? partOf(n.lesson) : null;
    const at = part || (lesson && partOf(lesson.id) ? partOf(lesson.id).id : null)
      || (progress.last && partOf(progress.last) ? partOf(progress.last).id : null)
      || (here ? here.id : 'c1');
    screens.showTree(progress, {
      part: at, current: here ? here.id : null, stickMode: shell.stickMode(), keys: flyingOnKeys(),
    });
    padCalm();
    shell.presence({ steam_display: '#Career', lesson: '' });
  }

  function toFork() {
    settleMenu();
    state = 'fork';
    screens.showFork(progress);
    padCalm();
  }

  function toLevel() {
    if (state === 'cover' || state === 'tree') {
      levelFrom = state;
    }
    settleMenu();
    showLevel('', true);
  }

  function showLevel(message, fresh = false) {
    state = 'level';
    screens.showLevel(progress, { steam: Boolean(shell.cloudSave), message, fresh });
    padCalm();
  }

  /* Into the career: the save read fresh (another tab, or Steam Cloud,
   * may have written it), and the cover. */
  function openHub() {
    progress = loadProgress();
    /* A career saved before titles were kept for rooms gets its key now. */
    saveTitle(titleOf(progress));
    lesson = null;
    toCover();
  }

  async function openLesson(id, from = 'tree') {
    const l = lessonById(id);
    if (!l) {
      return;
    }
    briefFrom = from === 'cover' ? 'cover' : 'tree';
    lesson = l;
    state = 'briefing';
    worldReady = false;
    run = null;
    lastStatus = null;
    unmountVisuals();
    shell.setCamera(null);
    shell.setFlightMode(null);
    screens.showBriefing(lesson, {
      record: lessonRecord(progress, id), stickMode: shell.stickMode(), ready: false, keys: flyingOnKeys(), from: briefFrom,
    });
    padCalm();
    const token = ++loadToken;
    /* What the briefing says when it is ready, if the lesson flies its
     * fallback because its own map could not be had. */
    let standIn = '';
    try {
      let world = await worldOf(lesson);
      if (token !== loadToken || state !== 'briefing') {
        return;
      }
      if (!world && lesson.fallback) {
        /* The board could not be reached, or this build has no such map:
         * the lesson's stand in, said so on its briefing. */
        standIn = lesson.world && lesson.world.board
          ? 'Ready. The board did not answer, so this is the lesson\'s stand in. Open it again later for the board\'s map.'
          : 'Ready. This game does not carry the lesson\'s map, so this is its stand in.';
        lesson = { ...lesson, ...lesson.fallback, fallen: true };
        world = lesson.world;
        screens.showBriefing(lesson, {
          record: lessonRecord(progress, id), stickMode: shell.stickMode(), ready: false, keys: flyingOnKeys(), from: briefFrom,
        });
      }
      if (!world) {
        throw new Error('This lesson\'s map is not in this game.');
      }
      lesson = { ...lesson, world };
      await shell.enterWorld({
        map: world.map,
        doc: world.doc || null,
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
    screens.setReady(true, standIn || undefined);
  }

  /*
   * THE WORLD A LESSON IS FLOWN IN, as this game can give it: the lesson's
   * own, a map or track from the board fetched by its id (shell
   * boardDocument, which the Steam edition answers from its shelf), or null
   * when the board did not answer or this build has no such map, and the
   * lesson's fallback is flown instead. A board document is fetched once a
   * session: they are half a megabyte and a retry should not pay again.
   */
  const boardDocs = new Map();
  async function worldOf(l) {
    const w = l.world;
    if (!w || (shell.hasMap && !shell.hasMap(w.map))) {
      return null;
    }
    if (!w.board) {
      return w;
    }
    if (!shell.boardDocument) {
      return null;
    }
    const key = `${w.board.kind}:${w.board.id}`;
    if (!boardDocs.has(key)) {
      const asked = Promise.resolve(shell.boardDocument(w.board.kind, w.board.id)).catch(() => null);
      boardDocs.set(key, asked);
    }
    const doc = await boardDocs.get(key);
    if (!doc || !doc.field) {
      boardDocs.delete(key);
      return null;
    }
    return { ...w, doc };
  }

  /* ---------------- flying ---------------- */

  function newRun() {
    /* A fixed map's lessons (the houses, the shop, the town) ask only for
     * its named gaps and the counter, so they need no field to place
     * anything on. */
    const field = lesson.world.doc ? lesson.world.doc.field : null;
    run = createRun(lesson, {
      W: field ? field.width : 160,
      D: field ? field.depth : 160,
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

  /* The pause menu's Back to the career, and Back on a briefing opened
   * from the tree: the tree, on the lesson's part. */
  function backToHub() {
    toTree(lesson && partOf(lesson.id) ? partOf(lesson.id).id : null);
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
      fallen: Boolean(lesson.fallen),
    });
    saveProgress(progress);
    if (complete) {
      shell.sound('record');
    }
    screens.showResults(lesson, status, outcome, {
      next: nextUp(progress), progress, stickMode: shell.stickMode(), keys: flyingOnKeys(),
    });
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
    const rule = speedRule(cur, o);
    if (rule) {
      return rule;
    }
    if (t - objectiveSince < HINT_MS && cur.hint) {
      return { text: cur.hint, tone: 'info' };
    }
    return null;
  }

  /* A ring with a speed on it (Brake Points) says what it wants for as
   * long as it is the next one: the rings look alike, and the speed is the
   * lesson. */
  function speedRule(cur, o) {
    if (cur.kind !== 'rings' || o.ordered === false || !o.rings) {
      return null;
    }
    const r = o.rings[cur.state.index];
    if (r && r.maxSpeed != null) {
      return { text: `Brake ring: through it under ${Math.round(r.maxSpeed * 3.6)} km/h.`, tone: 'info' };
    }
    if (r && r.minSpeed != null) {
      return { text: `Fast ring: through it over ${Math.round(r.minSpeed * 3.6)} km/h.`, tone: 'info' };
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
      case 'rings':
        if (d === 'fast') {
          return { text: `Too fast through that one: ${Math.round(cur.state.missSpeed * 3.6)} km/h. Brake earlier, come round and take it again.`, tone: 'warn' };
        }
        if (d === 'slow') {
          return { text: `Too slow through that one: ${Math.round(cur.state.missSpeed * 3.6)} km/h. Carry more speed and take it again.`, tone: 'warn' };
        }
        return null;
      case 'gates':
        if (d === 'ghost' && cur.state.gain != null) {
          const by = (cur.state.gain / 1000).toFixed(1);
          return {
            text: cur.state.gain > 0 ? `${by} s quicker. Find ${((o.beat - cur.state.gain) / 1000).toFixed(1)} s more.` : `${(-cur.state.gain / 1000).toFixed(1)} s behind your ghost. Smoother, not harder.`,
            tone: 'info',
          };
        }
        if (d === 'spread' && cur.state.spread != null) {
          return { text: `Your laps are ${(cur.state.spread / 1000).toFixed(1)} s apart. Fly the same line every lap.`, tone: 'info' };
        }
        return null;
      case 'combo':
        if (d === 'short') {
          return { text: `That combo banked ${cur.state.best} long. Keep the next thing coming before it banks.`, tone: 'info' };
        }
        if (d === 'need') {
          return { text: 'Long enough, but it was missing one. Read the objective again.', tone: 'info' };
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

  /* What the freestyle counter paid this frame (src/game/score.js events):
   * close calls and banked combos, for the Proximity and Lines lessons. */
  function counter(events) {
    if (state !== 'flight' || !run || !events || !events.length) {
      return;
    }
    const before = run.status();
    if (run.counter(events) && before.current && before.current.kind === 'close') {
      const st = run.status().current;
      const n = st && st.state ? st.state.n : 0;
      const of = before.current.objective.count;
      screens.stamp(of ? `${n} OF ${of}` : 'CLOSE', INKS.sakura, 52);
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
    if (state === 'cover') {
      screens.coverKey(k);
      return true;
    }
    if (state === 'tree') {
      screens.treeKey(k);
      return true;
    }
    if (state === 'fork') {
      screens.forkKey(k);
      return true;
    }
    if (state === 'level') {
      screens.levelKey(k);
      return true;
    }
    if (state === 'paint') {
      screens.paintKey(k);
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
        screens.h.backFromBriefing();
      } else {
        screens.listKey2(k);
      }
      return true;
    }
    if (state === 'results') {
      if (k === 'back') {
        toCover();
      } else if (k === 'retry') {
        retry();
      } else if (k === 'tree') {
        backToHub();
      } else if (k === 'paint') {
        screens.resultsKey(k);
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
    counter,
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
          record: lessonRecord(progress, lesson.id), stickMode: shell.stickMode(), ready: worldReady, keys: flyingOnKeys(), from: briefFrom,
        });
        padCalm();
      }
    },
    backToHub,
    leave,
    /* For the harness. */
    openLessonById: (id) => openLesson(id),
    openTree: (part) => toTree(part),
    openFork: () => toFork(),
    openLevel: () => toLevel(),
    openPaint: () => toPaint(),
    fly: () => startFlight(),
    hands: (h) => screens.setHands(h),
  };
}
