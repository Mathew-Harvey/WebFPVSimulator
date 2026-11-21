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
 * KEYS. Space or Enter plays and pauses, Left and Right (Up and Down on a
 * radio) step a tenth of a second, F follows the other quad, V switches
 * between the chase and side by side, Escape or Backspace goes back to the
 * review. On the document, in the capture phase, as the review's are; a
 * radio reaches them through Ui.overlay.
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

import { buildGhostCraft } from '../render/ghostcraft.js';
import { CAMERA_MOUNT_FORWARD, CAMERA_MOUNT_UP } from '../render/lens.js';
import { WatchCam } from '../render/watchcam.js';
import { Playhead, gogglePose, poseAt, sectionTimeline, splitPanes } from './replay.js';
import { deltaText, seconds } from './splits.js';

const YOU_COLOUR = 0xffb340;
const GHOST_COLOUR = 0x7fd4ff;
/* A step of the arrows, ms. */
const STEP_MS = 100;
/* Where the live camera sits on the quad (main.js fpvPos). */
const LENS = { forward: CAMERA_MOUNT_FORWARD, up: CAMERA_MOUNT_UP };

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
    /* Side by side or the chase, kept from one replay to the next. */
    this.split = false;
    this.goggles = null;
  }

  /* Side by side now: chosen, and a ghost to show beside you. */
  get splitOn() {
    return this.on && this.split && Boolean(this.data.refLine);
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
   * open({ lapLine, refLine, you, ghost, title, scale, size, tiltRad, onClose })
   *   lapLine, refLine  src/review/views.js lines, refLine null with no ghost
   *   you, ghost        [a, b]: when each line went through the section's
   *                     first and last openings (throughPlane); ghost null
   *   title             the section's name
   *   scale             the holograms' scale, as the shell's ghost's
   *   size              the watching rig's size (src/render/watchcam.js),
   *                     scene metres to a plant metre
   *   tiltRad           the goggles' uptilt, for side by side
   *   onClose(how)      'back' when the pilot went back to the review
   */
  open(data) {
    this.close('shell');
    this.buildRigs();
    this.data = data;
    this.tl = sectionTimeline(data.you, data.refLine ? data.ghost : null);
    this.head = new Playhead(this.tl.startMs, this.tl.endMs);
    this.head.toggle();
    this.follow = 'you';
    this.lastWall = null;
    this.started = false;
    for (const rig of [this.rigs.you, this.rigs.ghost]) {
      rig.group.scale.setScalar(data.scale || 1);
    }
    this.cam.free(null);
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
    this.playBtn = el('button', 'review-replay-btn', 'Pause');
    this.playBtn.type = 'button';
    this.playBtn.addEventListener('click', () => this.act('play'));
    this.scrub = el('input', 'review-replay-scrub');
    this.scrub.type = 'range';
    this.scrub.min = String(Math.round(tl.startMs));
    this.scrub.max = String(Math.round(tl.endMs));
    this.scrub.step = '10';
    this.scrub.addEventListener('input', () => this.act('seek', Number(this.scrub.value)));
    this.clock = el('div', 'review-replay-clock', '');
    this.followBtn = el('button', 'review-replay-btn review-replay-follow', '');
    this.followBtn.type = 'button';
    this.followBtn.addEventListener('click', () => this.act('follow'));
    this.viewBtn = el('button', 'review-replay-btn review-replay-view', '');
    this.viewBtn.type = 'button';
    this.viewBtn.addEventListener('click', () => this.act('view'));
    if (!data.refLine) {
      this.followBtn.hidden = true;
      this.viewBtn.hidden = true;
    }
    const back = el('button', 'review-replay-btn', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => this.close('back'));
    row.append(this.playBtn, this.scrub, this.clock, this.followBtn, this.viewBtn, back);
    root.append(head, row);
    /* The side by side pictures' names, over their top left corners. */
    this.paneTags = [el('div', 'review-replay-pane review-replay-you', 'You'), el('div', 'review-replay-pane review-replay-ghost', 'Ghost')];
    document.body.append(root, ...this.paneTags);
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
    } else if (what === 'view' && this.data.refLine) {
      this.split = !this.split;
      this.cam.free(null);
    } else if (what === 'back') {
      this.close('back');
    }
    this.write();
  }

  /* The bar's words and controls, from the playhead. */
  write() {
    if (!this.root) {
      return;
    }
    const { tl } = this;
    const t = this.head.t;
    this.playBtn.textContent = this.head.playing ? 'Pause' : 'Play';
    if (document.activeElement !== this.scrub) {
      this.scrub.value = String(Math.round(t));
    }
    const into = t - tl.you[0];
    this.clock.textContent = into < 0 ? `${seconds(-into)} s before` : `${seconds(into)} s in`;
    this.followBtn.textContent = this.follow === 'you' ? 'Following you' : 'Following the ghost';
    this.viewBtn.textContent = this.split ? 'Chase view' : 'Side by side';
    const split = this.splitOn;
    if (this.data.refLine) {
      this.followBtn.hidden = split;
    }
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
      this.started = false;
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
    }
    if (was !== this.head.playing || this.head.playing) {
      this.write();
    }
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
      const shown = rig.group.visible;
      rig.group.visible = false;
      draw(panes[i], which);
      rig.group.visible = shown;
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
    }
    this.goggles = null;
    if (this.rigs) {
      this.rigs.you.setPresence(0);
      this.rigs.ghost.setPresence(0);
    }
    this.cam.stop();
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
      view: this.splitOn ? 'split' : 'chase',
      panes: this.splitOn ? this.panes(window.innerWidth, window.innerHeight) : null,
      youAt: at(this.rigs.you),
      ghostAt: this.data.refLine ? at(this.rigs.ghost) : null,
      camera: this.cam.phase,
    };
  }
}
