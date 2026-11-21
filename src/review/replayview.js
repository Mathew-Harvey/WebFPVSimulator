/*
 * replayview.js: the review's replay. One section of your lap and the same
 * section of the ghost's, replayed together in the room as two holograms,
 * yours amber and the ghost blue, the colours the review draws their lines
 * in. The arithmetic is src/review/replay.js.
 *
 * Opened from the review (src/review/panel.js), over the pause: the flight
 * stays paused under it and nothing here reaches the physics. The pause
 * menu and the OSD are hidden while it is open, as the watching camera
 * hides them (the tg-watching class). Loaded only when first opened.
 *
 * THE CAMERA rides behind the quad it follows, on the watching camera's own
 * rig (src/render/watchcam.js), so it keeps off the walls and a flip does
 * not swing it; F or the bar's button follows the other. It starts there,
 * with no flight in, and a seek, a step or a change of quad is a cut: the
 * picture is the section, from its first moment.
 *
 * SIDE BY SIDE (V, or the bar's button): your goggles and the ghost's at
 * once, two pictures the shape of the pilot's own (splitPanes in
 * replay.js), each from that quad's lens with the uptilt flown and its own
 * hologram out of the way, so a pilot sees what each saw at the same
 * moment of the section. main.js draws the two (drawSplit); the choice is
 * kept from one replay to the next.
 *
 * THE PICTURE ABOVE THE BAR. The bar takes the foot of the screen, so the
 * chase and the orbit shift the lens up (lift) by half the bar's height:
 * the middle of the picture, where the quad is, is the middle of the room
 * left above the bar. A lens shift as the title camera's
 * (src/render/attract.js), the full frame the camera's aspect by one so
 * the aspect is kept; main.js clears it once the replay closes.
 *
 * THE ORBIT (C, or the bar's View button, which goes Chase, Orbit, Side
 * by side): a camera round the middle of the pair, far enough back to
 * have both in the picture (orbitFit in replay.js). Drag on the room to
 * turn round them and tilt; the wheel or a pinch comes in and goes out.
 * It keeps off the walls as the chase does: walked in from where it wants
 * to stand until it is clear of the nearest solid, and above the floor.
 *
 * THE LINES. Each lap's line through the section, drawn in the room in its
 * colour as a thin see through tube, from the replay's start to its end on
 * that lap's own clock, so where the two went apart is there to see from
 * any camera. A quad's own line is left out of its own goggles. P (the
 * paths, as on the coach branch) or the bar's button shows and hides them.
 *
 * THE TIMELINE, the bar's, as the coach branch's: the section's stretch
 * of time with the two gates where your line went through them, where the
 * ghost reached the last one (blue), and the playhead. Drag on it or on
 * the lanes to scrub; the wheel over either zooms them about the pointer
 * (zoomView in replay.js), the stretch shown turning over like a page to
 * keep the playhead on it, a strip along the foot saying where it is.
 * Under it the lanes: throttle, roll, pitch and yaw sticks, yours amber
 * and the ghost's blue where its trace was kept (a lap of this session); a
 * ghost from the board is poses only and has no sticks to draw. Played at
 * full, half or a quarter speed (1, 2, 3, or the bar's button), looped
 * (L) or not.
 *
 * KEYS. Space or Enter plays and pauses, Left and Right (Up and Down on a
 * radio) step a tenth of a second, 1 2 3 the speed, L loops, F follows the
 * other quad, C goes to the next view, V switches side by side on and
 * off, P shows or hides the lines, S the sticks, Escape or Backspace goes
 * back to the review. On the document, in the capture phase, as the
 * review's are; a radio reaches them through Ui.overlay.
 *
 * Runs on the wall clock, as the watching camera does, because the plant is
 * paused while it is open.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';

import { buildGhostCraft } from '../render/ghostcraft.js';
import { CAMERA_MOUNT_FORWARD, CAMERA_MOUNT_UP } from '../render/lens.js';
import { CHASE_FOV, WatchCam } from '../render/watchcam.js';
import {
  LANES, PLAY_RATES, Playhead, followView, gogglePose, orbitDir, orbitFit, poseAt, sectionTimeline, splitPanes, sticksAt, sticksOf, zoomView,
} from './replay.js';
import { deltaText, seconds } from './splits.js';

const YOU_COLOUR = 0xffb340;
const GHOST_COLOUR = 0x7fd4ff;
/* A step of the arrows, ms. */
const STEP_MS = 100;
/* Where the live camera sits on the quad (main.js fpvPos). */
const LENS = { forward: CAMERA_MOUNT_FORWARD, up: CAMERA_MOUNT_UP };

/* The lines in the room: a tube this many plant metres round (a WebGL line
 * is one pixel wide whatever is asked of it), a segment every
 * PATH_SEGMENT_MS of the lap's clock, see through enough not to hide the
 * gates. The coach branch's numbers, seen there on full size and whoop
 * tracks. */
const PATH_RADIUS = 0.012;
const PATH_SEGMENT_MS = 20;
const PATH_RADIAL = 5;
const PATH_OPACITY = 0.55;

/* The orbit: tilt when it starts and its limits (radians above level),
 * radians turned a pixel dragged, the wheel's step, the pilot's zoom's
 * limits, and how it keeps off solids, in plant metres as the chase's
 * (src/render/watchcam.js): nearest it comes, its walk out, the clearance
 * it wants, how fast it eases back out, and its height over the floor. */
const ORBIT_TILT = 0.45;
const ORBIT_TILT_MIN = -0.2;
const ORBIT_TILT_MAX = 1.5;
const ORBIT_PER_PX = 0.006;
const ORBIT_ZOOM_STEP = 0.88;
const ORBIT_ZOOM_MIN = 0.15;
const ORBIT_ZOOM_MAX = 6;
const ORBIT_MIN = 0.3;
const ORBIT_WALK = 0.1;
const ORBIT_CLEAR = 0.16;
const ORBIT_OUT_MS = 450;
const ORBIT_FLOOR = 0.15;
const VIEW_WORDS = { chase: 'Chase', orbit: 'Orbit', split: 'Side by side' };
const YOU_CSS = '#ffb340';
const GHOST_CSS = '#7fd4ff';
const GATE_CSS = '#9be39b';
const LANE_NAMES = { throttle: 'Throttle', roll: 'Roll', pitch: 'Pitch', yaw: 'Yaw' };
const RATE_WORDS = { 1: '1x', 0.5: '1/2x', 0.25: '1/4x' };

/* A line as a curve on its own clock: u from 0 to 1 is a to b ms, so the
 * tube's segments are even in time. */
class LineCurve extends THREE.Curve {
  constructor(line, a, b) {
    super();
    this.line = line;
    this.a = a;
    this.b = b;
  }

  getPoint(u, target = new THREE.Vector3()) {
    const p = poseAt(this.line, this.a + (this.b - this.a) * u);
    return target.set(p.x, p.y, p.z);
  }

  getUtoTmapping(u) {
    return u;
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) {
    e.className = cls;
  }
  if (text !== undefined) {
    e.textContent = text;
  }
  return e;
}

export class ReviewReplay {
  /* keep: the shell's keepAcrossMaps, so a map swap does not free the two
   * holograms' geometry. */
  constructor({ keep } = {}) {
    this.keep = keep || (() => {});
    this.on = false;
    this.cam = new WatchCam();
    this.rigs = null;
    this.root = null;
    this.onKey = null;
    this.pose = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false };
    /* The view, chase, orbit or side by side, kept from one replay to the
     * next, and the one to go back to when V turns side by side off. */
    this.mode = 'chase';
    this.lastMode = 'chase';
    this.goggles = null;
    this.orbit = { heading: 0, tilt: ORBIT_TILT, zoom: 1, boom: 0, dist: 0, fresh: true };
    this.look = new THREE.Vector3();
    /* The lines in the room, made when a replay opens and freed when it
     * closes; shown or not, kept from one replay to the next. */
    this.paths = null;
    this.showPaths = true;
    /* The lanes shown, and the play speed, kept from one replay to the
     * next. */
    this.showSticks = true;
    this.rate = 1;
  }

  /* Each line through the replay's stretch of its own clock, as a tube in
   * its colour. */
  buildPaths() {
    this.freePaths();
    const size = this.data.size || 1;
    const make = (line, a, b, colour) => {
      if (!line || !(b > a)) {
        return null;
      }
      const segments = Math.max(2, Math.ceil((b - a) / PATH_SEGMENT_MS));
      const geo = new THREE.TubeGeometry(new LineCurve(line, a, b), segments, PATH_RADIUS * size, PATH_RADIAL, false);
      const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: PATH_OPACITY, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'review-replay-line';
      mesh.renderOrder = 1;
      return mesh;
    };
    const { tl, data } = this;
    this.paths = {
      you: make(data.lapLine, tl.startMs, tl.endMs, YOU_COLOUR),
      ghost: data.refLine ? make(data.refLine, tl.ghostAt(tl.startMs), tl.ghostAt(tl.endMs), GHOST_COLOUR) : null,
    };
  }

  freePaths() {
    if (!this.paths) {
      return;
    }
    for (const mesh of [this.paths.you, this.paths.ghost]) {
      if (mesh) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
    this.paths = null;
  }

  /* Side by side now: chosen, and a ghost to show beside you. */
  get splitOn() {
    return this.on && this.mode === 'split' && Boolean(this.data.refLine);
  }

  /* The views this replay has: side by side only with a ghost. */
  modes() {
    return this.data && this.data.refLine ? ['chase', 'orbit', 'split'] : ['chase', 'orbit'];
  }

  get isOpen() {
    return this.on;
  }

  buildRigs() {
    if (this.rigs) {
      return;
    }
    const you = buildGhostCraft({ colour: YOU_COLOUR, tagColour: '#ffb340' });
    const ghost = buildGhostCraft({ colour: GHOST_COLOUR, tagColour: '#7fd4ff' });
    /* No name tags: two of them over two quads a few centimetres apart were
     * one unreadable word (the first picture). The bar says who is which,
     * in their colours. */
    you.setLabel('');
    ghost.setLabel('');
    this.keep(you.group);
    this.keep(ghost.group);
    this.rigs = { you, ghost };
  }

  /*
   * open({ lapLine, refLine, you, ghost, title, marks, lapTrace, refTrace,
   *        scale, size, tiltRad, onClose })
   *   lapLine, refLine  src/review/views.js lines, refLine null with no ghost
   *   you, ghost        [a, b]: when each line went through the section's
   *                     first and last openings (throughPlane); ghost null
   *   title             the section's name
   *   marks             the names of its first and last gate, for the bar
   *   lapTrace          your lap's trace, for its sticks; refTrace the
   *                     ghost's, or null when it was not kept
   *   scale             the holograms' scale, as the shell's ghost's
   *   size              the watching rig's size (src/render/watchcam.js),
   *                     scene metres to a plant metre
   *   tiltRad           the goggles' uptilt, for side by side
   *   onClose(how)      'back' when the pilot went back to the review
   */
  open(data) {
    this.close('shell');
    this.buildRigs();
    this.data = {
      ...data,
      lapSticks: data.lapTrace ? sticksOf(data.lapTrace) : null,
      refSticks: data.refTrace ? sticksOf(data.refTrace) : null,
    };
    this.tl = sectionTimeline(data.you, data.refLine ? data.ghost : null);
    this.head = new Playhead(this.tl.startMs, this.tl.endMs);
    this.head.rate = this.rate;
    this.head.toggle();
    /* The stretch of the timeline shown, null for the whole. */
    this.tview = null;
    this.lanePic = null;
    this.follow = 'you';
    this.lastWall = null;
    this.started = false;
    for (const rig of [this.rigs.you, this.rigs.ghost]) {
      rig.group.scale.setScalar(data.scale || 1);
    }
    this.cam.free(null);
    this.buildPaths();
    this.build();
    this.on = true;
    this.write();
  }

  build() {
    const { tl, data } = this;
    const root = el('div', 'review-replay');
    root.id = 'review-replay';
    const head = el('div', 'review-replay-head');
    head.append(el('div', 'review-replay-title', `Replay: ${data.title}`));
    const times = el('div', 'review-replay-times');
    times.append(el('span', 'review-replay-you', 'You'), ` ${seconds(tl.youMs)} s`);
    if (data.refLine) {
      times.append(', ', el('span', 'review-replay-ghost', 'ghost'), ` ${seconds(tl.ghostMs)} s, ${deltaText(tl.youMs - tl.ghostMs)}`);
    }
    head.append(times);
    const row = el('div', 'review-replay-row');
    const btn = (cls, words, what) => {
      const b = el('button', `review-replay-btn${cls ? ` ${cls}` : ''}`, words);
      b.type = 'button';
      b.addEventListener('click', () => this.act(what));
      return b;
    };
    this.playBtn = btn('', 'Pause', 'play');
    this.rateBtn = btn('review-replay-rate', '', 'rate');
    this.loopBtn = btn('', 'Loop', 'loop');
    this.sticksBtn = btn('', 'Sticks', 'sticks');
    /* The timeline and the lanes under it: a drag scrubs, the wheel zooms. */
    this.scrub = el('canvas', 'review-replay-timeline');
    this.lanes = el('canvas', 'review-replay-lanes');
    this.lanesNote = el('div', 'review-replay-note', data.refLine && !data.refSticks
      ? 'The ghost is poses only, no sticks: these are yours.' : '');
    for (const cv of [this.scrub, this.lanes]) {
      this.listenTimeline(cv);
    }
    this.clock = el('div', 'review-replay-clock', '');
    this.followBtn = el('button', 'review-replay-btn review-replay-follow', '');
    this.followBtn.type = 'button';
    this.followBtn.addEventListener('click', () => this.act('follow'));
    this.linesBtn = el('button', 'review-replay-btn', 'Lines');
    this.linesBtn.type = 'button';
    this.linesBtn.addEventListener('click', () => this.act('lines'));
    this.viewBtn = el('button', 'review-replay-btn review-replay-view', '');
    this.viewBtn.type = 'button';
    this.viewBtn.addEventListener('click', () => this.act('view'));
    if (!data.refLine) {
      this.followBtn.hidden = true;
    }
    const back = el('button', 'review-replay-btn', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => this.close('back'));
    row.append(this.playBtn, this.rateBtn, this.loopBtn, this.clock, this.followBtn, this.viewBtn, this.linesBtn, this.sticksBtn, back);
    root.append(head, this.scrub, this.lanes, this.lanesNote, row);
    /* The side by side pictures' names, over their top left corners. */
    this.paneTags = [el('div', 'review-replay-pane review-replay-you', 'You'), el('div', 'review-replay-pane review-replay-ghost', 'Ghost')];
    /* Under the bar, over the room while the orbit is on: a drag turns,
     * the wheel and a pinch zoom. */
    this.surface = el('div', 'review-replay-surface');
    this.listenSurface(this.surface);
    document.body.append(this.surface, root, ...this.paneTags);
    this.root = root;
    this.onKey = (e) => {
      if (!this.on) {
        return;
      }
      e.stopPropagation();
      const k = e.key;
      if (k === 'Escape' || k === 'Backspace') {
        e.preventDefault();
        this.close('back');
      } else if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        this.act('play');
      } else if (k === 'ArrowLeft' || k === 'ArrowDown') {
        e.preventDefault();
        this.act('step', -1);
      } else if (k === 'ArrowRight' || k === 'ArrowUp') {
        e.preventDefault();
        this.act('step', 1);
      } else if (k === 'f' || k === 'F') {
        e.preventDefault();
        this.act('follow');
      } else if (k === 'v' || k === 'V') {
        e.preventDefault();
        this.act('view');
      } else if (k === 'c' || k === 'C') {
        e.preventDefault();
        this.act('camera');
      } else if (k === 'p' || k === 'P') {
        e.preventDefault();
        this.act('lines');
      } else if (k === 'l' || k === 'L') {
        e.preventDefault();
        this.act('loop');
      } else if (k === 's' || k === 'S') {
        e.preventDefault();
        this.act('sticks');
      } else if (k === '1' || k === '2' || k === '3') {
        e.preventDefault();
        this.act('rate', PLAY_RATES[Number(k) - 1]);
      }
    };
    document.addEventListener('keydown', this.onKey, true);
    this.write();
  }

  act(what, arg) {
    if (!this.on && what !== 'back') {
      return;
    }
    if (what === 'play') {
      this.head.toggle();
    } else if (what === 'seek') {
      this.head.playing = false;
      this.head.seek(arg);
      this.cam.free(null);
    } else if (what === 'step') {
      this.head.playing = false;
      this.head.seek(this.head.t + STEP_MS * (arg < 0 ? -1 : 1));
      this.cam.free(null);
    } else if (what === 'follow' && this.data.refLine) {
      this.follow = this.follow === 'you' ? 'ghost' : 'you';
      this.cam.free(null);
    } else if (what === 'lines') {
      this.showPaths = !this.showPaths;
    } else if (what === 'rate') {
      /* A speed asked for, or the next one round. */
      const next = PLAY_RATES.includes(arg) ? arg : PLAY_RATES[(PLAY_RATES.indexOf(this.rate) + 1) % PLAY_RATES.length];
      this.rate = next;
      this.head.rate = next;
    } else if (what === 'loop') {
      this.head.loop = !this.head.loop;
    } else if (what === 'sticks') {
      this.showSticks = !this.showSticks;
    } else if (what === 'tzoom') {
      const full = [this.tl.startMs, this.tl.endMs];
      this.tview = !arg || arg === 'reset' ? null : zoomView(this.tview, full, arg.at, arg.steps);
      this.tview = followView(this.tview, full, this.head.t);
      this.lanePic = null;
    } else if (what === 'view' && this.data.refLine) {
      /* V: side by side on, or off to the view before it. */
      if (this.mode === 'split') {
        this.setMode(this.lastMode);
      } else {
        this.setMode('split');
      }
    } else if (what === 'camera') {
      const order = this.modes();
      this.setMode(order[(order.indexOf(this.mode) + 1) % order.length]);
    } else if (what === 'turn' && Array.isArray(arg)) {
      this.turn(arg[0], arg[1]);
    } else if (what === 'zoom') {
      this.zoomBy(Number(arg) || 0);
    } else if (what === 'back') {
      this.close('back');
    }
    this.write();
  }

  setMode(mode) {
    if (!this.modes().includes(mode)) {
      mode = 'chase';
    }
    if (mode === this.mode) {
      return;
    }
    if (mode === 'split') {
      this.lastMode = this.mode;
    }
    if (mode === 'orbit') {
      this.orbit.fresh = true;
    }
    this.mode = mode;
    this.started = false;
    this.cam.free(null);
  }

  /* The orbit turned and tilted by a drag of dx, dy pixels. */
  turn(dx, dy) {
    const o = this.orbit;
    o.heading -= dx * ORBIT_PER_PX;
    o.tilt = Math.max(ORBIT_TILT_MIN, Math.min(ORBIT_TILT_MAX, o.tilt + dy * ORBIT_PER_PX));
  }

  /* steps > 0 comes in, < 0 goes out. */
  zoomBy(steps) {
    const o = this.orbit;
    o.zoom = Math.max(ORBIT_ZOOM_MIN, Math.min(ORBIT_ZOOM_MAX, o.zoom * ORBIT_ZOOM_STEP ** steps));
  }

  listenSurface(surface) {
    const down = new Map();
    let pinch = 0;
    const spread = () => {
      const [a, b] = [...down.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    surface.addEventListener('pointerdown', (e) => {
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      surface.setPointerCapture(e.pointerId);
      pinch = down.size === 2 ? spread() : 0;
    });
    surface.addEventListener('pointermove', (e) => {
      const was = down.get(e.pointerId);
      if (!was) {
        return;
      }
      const now = { x: e.clientX, y: e.clientY };
      down.set(e.pointerId, now);
      if (down.size === 2) {
        const d = spread();
        if (pinch > 0 && d > 0) {
          this.orbit.zoom = Math.max(ORBIT_ZOOM_MIN, Math.min(ORBIT_ZOOM_MAX, this.orbit.zoom * (pinch / d)));
        }
        pinch = d;
      } else {
        this.turn(now.x - was.x, now.y - was.y);
      }
    });
    const up = (e) => {
      down.delete(e.pointerId);
      pinch = 0;
    };
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
    surface.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
  }

  /* The stretch of the timeline shown, [a, b] ms. */
  range() {
    return this.tview || [this.tl.startMs, this.tl.endMs];
  }

  /* A drag on the timeline or the lanes scrubs; the wheel zooms them about
   * the time under the pointer. */
  listenTimeline(cv) {
    let held = null;
    const msAt = (e) => {
      const r = cv.getBoundingClientRect();
      const [a, b] = this.range();
      return a + ((e.clientX - r.left) / Math.max(1, r.width)) * (b - a);
    };
    cv.addEventListener('pointerdown', (e) => {
      held = e.pointerId;
      cv.setPointerCapture(e.pointerId);
      this.act('seek', msAt(e));
    });
    cv.addEventListener('pointermove', (e) => {
      if (held === e.pointerId) {
        this.act('seek', msAt(e));
      }
    });
    const up = () => {
      held = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.act('tzoom', { at: msAt(e), steps: e.deltaY < 0 ? 1 : -1 });
    }, { passive: false });
  }

  /* A canvas the size it is drawn on the page, in device pixels. */
  fit(cv) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(50, Math.round(cv.clientWidth * dpr));
    const h = Math.max(10, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    return { w, h, dpr };
  }

  /* The timeline: the section's gates, the ghost's finish, the playhead,
   * and when zoomed where the stretch shown is in the whole. */
  drawTimeline() {
    const cv = this.scrub;
    const { w, h, dpr } = this.fit(cv);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, w, h);
    const [a, b] = this.range();
    const X = (ms) => ((ms - a) / Math.max(1, b - a)) * w;
    const { tl } = this;
    if (this.head.loop) {
      g.fillStyle = 'rgba(255,179,64,0.14)';
      g.fillRect(0, 0, w, h);
    }
    g.font = `${11 * dpr}px system-ui, sans-serif`;
    g.textBaseline = 'top';
    const marks = this.data.marks || ['', ''];
    [tl.you[0], tl.you[1]].forEach((ms, i) => {
      const x = X(ms);
      if (x < -dpr || x > w + dpr) {
        return;
      }
      g.fillStyle = 'rgba(155,227,155,0.75)';
      g.fillRect(x - dpr / 2, 0, dpr, h);
      g.fillStyle = GATE_CSS;
      const name = marks[i] || '';
      const tw = g.measureText(name).width;
      g.fillText(name, i ? Math.max(2 * dpr, x - tw - 3 * dpr) : Math.min(w - tw - 2 * dpr, x + 3 * dpr), 3 * dpr);
    });
    if (this.data.refLine && Number.isFinite(tl.ghostMs)) {
      g.fillStyle = GHOST_CSS;
      g.fillRect(X(tl.you[0] + tl.ghostMs) - dpr, h * 0.45, 2 * dpr, h * 0.55);
    }
    g.fillStyle = '#ffffff';
    g.fillRect(X(this.head.t) - dpr, 0, 2 * dpr, h);
    if (this.tview) {
      const W = (ms) => ((ms - tl.startMs) / Math.max(1, tl.endMs - tl.startMs)) * w;
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(0, h - 3 * dpr, w, 3 * dpr);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(W(a), h - 3 * dpr, Math.max(2 * dpr, W(b) - W(a)), 3 * dpr);
    }
  }

  /* The lanes: painted once for a size and a stretch, then the playhead
   * and the values under it each frame. */
  drawLanes() {
    const cv = this.lanes;
    const { w, h, dpr } = this.fit(cv);
    const [a, b] = this.range();
    const key = `${w}|${h}|${a}|${b}`;
    if (!this.lanePic || this.lanePic.key !== key) {
      this.lanePic = { key, pic: this.paintLanes(w, h, dpr, a, b) };
    }
    const g = cv.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.drawImage(this.lanePic.pic, 0, 0);
    const X = (ms) => ((ms - a) / Math.max(1, b - a)) * w;
    g.fillStyle = '#ffffff';
    g.fillRect(X(this.head.t) - dpr, 0, 2 * dpr, h);
    const you = sticksAt(this.data.lapSticks, this.head.t);
    const ghost = this.data.refLine ? sticksAt(this.data.refSticks, this.tl.ghostAt(this.head.t)) : null;
    const laneH = h / LANES.length;
    g.font = `${11 * dpr}px system-ui, sans-serif`;
    g.textBaseline = 'top';
    LANES.forEach((k, i) => {
      const fmt = (v) => (!Number.isFinite(v) ? '' : k === 'throttle' ? `${Math.round(v * 100)}%` : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`);
      const parts = [[fmt(you[k]), YOU_CSS], [ghost ? fmt(ghost[k]) : '', GHOST_CSS]].filter((p) => p[0]);
      let x = w - 4 * dpr;
      const y = i * laneH + 2 * dpr;
      for (let j = parts.length - 1; j >= 0; j -= 1) {
        const tw = g.measureText(parts[j][0]).width;
        x -= tw;
        g.fillStyle = 'rgba(16,18,22,0.8)';
        g.fillRect(x - 3 * dpr, y - dpr, tw + 6 * dpr, 13 * dpr);
        g.fillStyle = parts[j][1];
        g.fillText(parts[j][0], x, y);
        x -= 8 * dpr;
      }
    });
  }

  paintLanes(w, h, dpr, a, b) {
    const pic = document.createElement('canvas');
    pic.width = w;
    pic.height = h;
    const g = pic.getContext('2d');
    const X = (ms) => ((ms - a) / Math.max(1, b - a)) * w;
    const laneH = h / LANES.length;
    const pad = 3 * dpr;
    const { tl, data } = this;
    g.fillStyle = 'rgba(155,227,155,0.3)';
    for (const ms of tl.you) {
      g.fillRect(X(ms) - dpr / 2, 0, dpr, h);
    }
    g.font = `${11 * dpr}px system-ui, sans-serif`;
    g.textBaseline = 'top';
    const n = Math.max(2, Math.min(w, 1200));
    LANES.forEach((k, i) => {
      const top = i * laneH;
      const mid = top + laneH / 2;
      const yOf = k === 'throttle'
        ? (v) => top + laneH - pad - Math.max(0, Math.min(1, v)) * (laneH - 2 * pad)
        : (v) => mid - Math.max(-1, Math.min(1, v)) * (laneH / 2 - pad);
      if (i) {
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(0, top, w, dpr);
      }
      if (k !== 'throttle') {
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillRect(0, mid, w, dpr);
      }
      const lines = [[data.lapSticks, (t) => t, YOU_CSS]];
      if (data.refLine && data.refSticks) {
        lines.unshift([data.refSticks, (t) => tl.ghostAt(t), GHOST_CSS]);
      }
      for (const [sticks, clock, colour] of lines) {
        g.strokeStyle = colour;
        g.lineWidth = 1.5 * dpr;
        g.beginPath();
        let open = false;
        for (let j = 0; j < n; j += 1) {
          const t = a + ((b - a) * j) / (n - 1);
          const v = sticksAt(sticks, clock(t))[k];
          if (!Number.isFinite(v)) {
            open = false;
            continue;
          }
          const px = (j / (n - 1)) * w;
          if (open) {
            g.lineTo(px, yOf(v));
          } else {
            g.moveTo(px, yOf(v));
          }
          open = true;
        }
        g.stroke();
      }
      const name = LANE_NAMES[k];
      g.fillStyle = 'rgba(16,18,22,0.8)';
      g.fillRect(2 * dpr, top + 2 * dpr, g.measureText(name).width + 6 * dpr, 13 * dpr);
      g.fillStyle = '#c8c8c8';
      g.fillText(name, 5 * dpr, top + 3 * dpr);
    });
    return pic;
  }

  /* The bar's words and controls, from the playhead. */
  write() {
    if (!this.root) {
      return;
    }
    const { tl } = this;
    const t = this.head.t;
    this.playBtn.textContent = this.head.playing ? 'Pause' : 'Play';
    this.rateBtn.textContent = RATE_WORDS[this.rate] || `${this.rate}x`;
    this.loopBtn.setAttribute('aria-pressed', String(this.head.loop));
    this.sticksBtn.setAttribute('aria-pressed', String(this.showSticks));
    this.lanes.hidden = !this.showSticks;
    this.lanesNote.hidden = !this.showSticks || !this.lanesNote.textContent;
    this.tview = followView(this.tview, [tl.startMs, tl.endMs], t);
    this.drawTimeline();
    if (this.showSticks) {
      this.drawLanes();
    }
    const into = t - tl.you[0];
    this.clock.textContent = into < 0 ? `${seconds(-into)} s before` : `${seconds(into)} s in`;
    this.followBtn.textContent = this.follow === 'you' ? 'Behind you' : 'Behind the ghost';
    this.viewBtn.textContent = VIEW_WORDS[this.mode];
    this.linesBtn.setAttribute('aria-pressed', String(this.showPaths));
    const split = this.splitOn;
    if (this.data.refLine) {
      this.followBtn.hidden = this.mode !== 'chase';
    }
    this.surface.hidden = this.mode !== 'orbit';
    const panes = this.panes(window.innerWidth, window.innerHeight);
    this.paneTags.forEach((tag, i) => {
      tag.hidden = !split;
      tag.style.left = `${Math.round(panes[i].x) + 10}px`;
      tag.style.top = `${Math.round(panes[i].y) + 8}px`;
    });
  }

  /*
   * Once a frame while open, in the shell's camera chain: the playhead
   * moved by the wall time since the last frame, the two holograms placed,
   * and the camera behind the one followed. parent is the scene that holds
   * the craft; world and home are what the watching rig asks for.
   */
  frame(nowWall, camera, parent, world, home) {
    if (!this.on) {
      return;
    }
    const dt = this.lastWall === null ? 0 : nowWall - this.lastWall;
    this.lastWall = nowWall;
    const was = this.head.playing;
    this.head.advance(dt);
    const t = this.head.t;
    const place = (rig, line, ms) => {
      if (rig.group.parent !== parent && parent) {
        parent.add(rig.group);
      }
      const p = poseAt(line, ms);
      rig.group.position.set(p.x, p.y, p.z);
      rig.group.quaternion.set(p.q[0], p.q[1], p.q[2], p.q[3]);
      rig.setPresence(1);
      return p;
    };
    if (this.paths) {
      for (const mesh of [this.paths.you, this.paths.ghost]) {
        if (mesh) {
          if (parent && mesh.parent !== parent) {
            parent.add(mesh);
          }
          mesh.visible = this.showPaths;
        }
      }
    }
    const you = place(this.rigs.you, this.data.lapLine, t);
    let ghost = null;
    if (this.data.refLine) {
      ghost = place(this.rigs.ghost, this.data.refLine, this.tl.ghostAt(t));
    } else {
      this.rigs.ghost.setPresence(0);
    }
    if (this.splitOn && ghost) {
      /* Side by side: no chase. The camera sits in your goggles until
       * drawSplit puts it in each pair in turn. */
      const size = this.data.size || 1;
      const tilt = this.data.tiltRad || 0;
      this.goggles = { you: gogglePose(you, LENS, size, tilt), ghost: gogglePose(ghost, LENS, size, tilt) };
      camera.position.set(...this.goggles.you.pos);
      camera.quaternion.set(...this.goggles.you.q);
      if (camera.view && camera.view.enabled) {
        camera.clearViewOffset();
      }
    } else if (this.mode === 'orbit') {
      this.goggles = null;
      this.orbitFrame(camera, you, ghost, world, dt);
      this.lift(camera);
    } else {
      this.goggles = null;
      const p = this.follow === 'ghost' && ghost ? ghost : you;
      Object.assign(this.pose, { px: p.x, py: p.y, pz: p.z, qx: p.q[0], qy: p.q[1], qz: p.q[2], qw: p.q[3] });
      if (!this.started) {
        this.cam.ride();
        this.started = true;
      }
      this.cam.size = this.data.size || 1;
      this.cam.frame(camera, this.pose, nowWall, world, home);
      this.lift(camera);
    }
    if (was !== this.head.playing || this.head.playing) {
      this.write();
    }
  }

  /*
   * The orbit's camera this frame: round the middle of the pair (you
   * alone with no ghost), as far back as fits both times the pilot's zoom,
   * walked in to keep clear of solids and held above the floor, looking at
   * the middle. It starts behind where the camera was looking.
   */
  orbitFrame(camera, you, ghost, world, dt) {
    const o = this.orbit;
    const size = this.data.size || 1;
    if (o.fresh) {
      this.look.set(0, 0, -1).applyQuaternion(camera.quaternion);
      if (Math.hypot(this.look.x, this.look.z) > 0.05) {
        o.heading = Math.atan2(-this.look.x, -this.look.z);
      }
      o.tilt = ORBIT_TILT;
      o.zoom = 1;
      o.boom = 0;
    }
    const m = ghost
      ? [(you.x + ghost.x) / 2, (you.y + ghost.y) / 2, (you.z + ghost.z) / 2]
      : [you.x, you.y, you.z];
    const apart = ghost ? Math.hypot(you.x - ghost.x, you.y - ghost.y, you.z - ghost.z) : 0;
    const want = orbitFit(apart, size, CHASE_FOV) * o.zoom;
    const dir = orbitDir(o.heading, o.tilt);
    const min = ORBIT_MIN * size;
    let reach = Math.max(min, want);
    if (world && world.gap) {
      const step = ORBIT_WALK * size;
      for (let s = min; s <= want; s += step) {
        if (world.gap(m[0] + dir[0] * s, m[1] + dir[1] * s, m[2] + dir[2] * s) < ORBIT_CLEAR * size) {
          reach = Math.max(min, s - step);
          break;
        }
      }
    }
    if (o.fresh || reach < o.boom) {
      o.boom = reach;
    } else {
      o.boom += (reach - o.boom) * (1 - Math.exp(-Math.max(0, dt) / ORBIT_OUT_MS));
    }
    o.fresh = false;
    o.dist = o.boom;
    camera.position.set(m[0] + dir[0] * o.boom, m[1] + dir[1] * o.boom, m[2] + dir[2] * o.boom);
    if (world && world.floor) {
      const floor = world.floor(camera.position.x, camera.position.z, camera.position.y) + ORBIT_FLOOR * size;
      if (camera.position.y < floor) {
        camera.position.y = floor;
      }
    }
    camera.lookAt(m[0], m[1], m[2]);
    if (Math.abs(camera.fov - CHASE_FOV) > 0.01) {
      camera.fov = CHASE_FOV;
      camera.updateProjectionMatrix();
    }
  }

  /* The lens shifted up by half the bar's height, as a share of the
   * screen's, so the picture's middle is the middle of the room above it. */
  lift(camera) {
    const h = window.innerHeight;
    const top = this.root ? this.root.getBoundingClientRect().top : h;
    const oy = Math.max(0, Math.min(0.4, (h - top) / (2 * Math.max(1, h))));
    const aspect = camera.aspect;
    const view = camera.view;
    if (oy < 0.005) {
      if (view && view.enabled) {
        camera.clearViewOffset();
      }
      return;
    }
    if (view && view.enabled && view.fullWidth === aspect && Math.abs(view.offsetY - oy) < 1e-4) {
      return;
    }
    camera.setViewOffset(aspect, 1, 0, oy, aspect, 1);
  }

  /* The two pictures on a screen w by h CSS pixels, in the room above the
   * bar, so on a phone the bar does not cover the ghost's. */
  panes(w, h) {
    const top = this.root ? this.root.getBoundingClientRect().top : h;
    const room = top > h / 2 ? top - 8 : h;
    return splitPanes(w, room);
  }

  /*
   * The side by side view, drawn on a screen w by h CSS pixels: for each
   * quad, the camera put in its goggles and its own hologram hidden, then
   * draw(pane, which) to draw the scene into that pane ({ x, y, w, h } from
   * the top left). The renderer, its viewport and the camera's lens are
   * the shell's (main.js); this says where each picture is and from where.
   */
  drawSplit(camera, w, h, draw) {
    if (!this.splitOn || !this.goggles) {
      return false;
    }
    const panes = this.panes(w, h);
    const sides = [['you', this.rigs.you], ['ghost', this.rigs.ghost]];
    sides.forEach(([which, rig], i) => {
      const g = this.goggles[which];
      camera.position.set(...g.pos);
      camera.quaternion.set(...g.q);
      camera.updateMatrixWorld();
      const line = this.paths && this.paths[which];
      const shown = rig.group.visible;
      const lineShown = line ? line.visible : false;
      rig.group.visible = false;
      if (line) {
        line.visible = false;
      }
      draw(panes[i], which);
      rig.group.visible = shown;
      if (line) {
        line.visible = lineShown;
      }
    });
    return true;
  }

  close(how = 'shell') {
    if (this.onKey) {
      document.removeEventListener('keydown', this.onKey, true);
      this.onKey = null;
    }
    if (this.root) {
      this.root.remove();
      this.root = null;
      for (const tag of this.paneTags) {
        tag.remove();
      }
      this.surface.remove();
    }
    this.goggles = null;
    if (this.rigs) {
      this.rigs.you.setPresence(0);
      this.rigs.ghost.setPresence(0);
    }
    this.cam.stop();
    this.freePaths();
    const wasOn = this.on;
    this.on = false;
    if (wasOn && this.data && this.data.onClose) {
      this.data.onClose(how);
    }
  }

  /* What is on screen, for scripts/review-check.js. */
  state() {
    if (!this.on) {
      return { open: false };
    }
    const at = (rig) => (rig.group.visible === false ? null : rig.group.position.toArray());
    return {
      open: true,
      title: this.data.title,
      t: this.head.t,
      startMs: this.tl.startMs,
      endMs: this.tl.endMs,
      you: this.tl.you,
      ghost: this.tl.ghost,
      playing: this.head.playing,
      follow: this.follow,
      view: this.splitOn ? 'split' : this.mode === 'orbit' ? 'orbit' : 'chase',
      rate: this.head.rate,
      loop: this.head.loop,
      shown: this.range(),
      sticks: this.showSticks ? {
        you: Boolean(this.data.lapSticks),
        ghost: Boolean(this.data.refLine && this.data.refSticks),
        drawn: Boolean(this.lanePic),
      } : null,
      orbit: this.mode === 'orbit' ? { ...this.orbit, size: this.data.size || 1 } : null,
      lines: this.paths ? {
        you: Boolean(this.paths.you && this.paths.you.visible && this.paths.you.parent),
        ghost: Boolean(this.paths.ghost && this.paths.ghost.visible && this.paths.ghost.parent),
      } : null,
      panes: this.splitOn ? this.panes(window.innerWidth, window.innerHeight) : null,
      youAt: at(this.rigs.you),
      ghostAt: this.data.refLine ? at(this.rigs.ghost) : null,
      camera: this.cam.phase,
    };
  }
}
