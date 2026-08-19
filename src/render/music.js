/*
 * music.js: recorded tracks on the mix bus.
 *
 * The generated performer (oscillators, noise buffers, a sixteenth-note
 * scheduler, mini-notation sheets) is gone. This file plays the mp3 crate
 * in src/render/tracks.js through one HTMLAudioElement and one
 * MediaElementSource. That is three AudioNodes (source, level, duck)
 * against the 64 node budget, and it is the only way a five to eight
 * megabyte track does not sit decoded in memory before the first note.
 *
 * OfflineAudioContext has no media element, so attach still builds the
 * level and duck nodes the rest of the mix talks to, and stays silent.
 * scripts/audio-probe.js can still drive motors and cues. It cannot
 * render an mp3, and it does not claim to.
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

import { TRACKS, trackById, trackUrl } from './tracks.js';

/*
 * Bus gain at a Music setting of ten. Recorded tracks are mastered hotter
 * than the old generated bed, so this is lower than the 0.85 the
 * oscillators used. Default setting 5 lands at 0.30, which the live
 * audio-bed check still sees as well above its 0.05 floor.
 */
const MUSIC_BUS = 0.60;

export class Music {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.level = 0.5;
    this.selection = 'rotation';
    this.trackIndex = 0;
    this.track = TRACKS[0];
    this.el = null;
    this.src = null;
    this.gain = null;
    this.duck = null;
    this.onChange = null;
    this.failStreak = 0;
    this.wantPlay = false;
    this.loadedUrl = '';
    this.playPending = false;
  }

  /*
   * Build the bus. keep() is the owner's node tracker, so every node
   * created here is counted against the 64 node budget where it is made.
   */
  attach(ctx, dest, keep) {
    this.ctx = ctx;

    this.gain = keep(ctx.createGain());
    this.gain.gain.value = 0;
    this.duck = keep(ctx.createGain());
    this.duck.gain.value = 1;
    this.gain.connect(this.duck);
    this.duck.connect(dest);

    if (typeof ctx.createMediaElementSource !== 'function' || typeof Audio === 'undefined') {
      this.applyLevel();
      return;
    }

    const el = new Audio();
    el.preload = 'auto';
    el.loop = false;
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.addEventListener('ended', () => this.onEnded());
    el.addEventListener('error', () => this.onError());
    el.addEventListener('playing', () => {
      this.failStreak = 0;
      if (!this.wantPlay && this.el) {
        this.el.pause();
      }
    });
    this.el = el;
    this.src = keep(ctx.createMediaElementSource(el));
    this.src.connect(this.gain);
    this.applyLevel();
    this.loadCurrent(false);
    if (this.enabled) {
      this.resume();
    }
  }

  setLevel(v) {
    this.level = Math.max(0, Math.min(1, v));
    this.applyLevel();
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    this.applyLevel();
    if (this.enabled) {
      this.resume();
    } else {
      this.pause();
    }
  }

  applyLevel() {
    if (!this.gain) {
      return;
    }
    this.gain.gain.value = this.enabled ? this.level * MUSIC_BUS : 0;
  }

  status() {
    return {
      id: this.track.id,
      name: this.track.name,
      selection: this.selection,
      index: this.trackIndex,
    };
  }

  emitChange() {
    if (typeof this.onChange === 'function') {
      this.onChange(this.status());
    }
  }

  /*
   * Which track. 'rotation' walks the whole crate in order, a track id
   * pins that track and loops it. Selection is a SETTING, so this can
   * arrive before attach; the constructor defaults cover the gap.
   */
  setTrack(sel) {
    const next = sel === 'rotation' || TRACKS.some((t) => t.id === sel) ? sel : 'rotation';
    if (next === this.selection) {
      if (next !== 'rotation') {
        const idx = TRACKS.indexOf(trackById(next));
        if (idx === this.trackIndex) {
          return;
        }
      } else {
        return;
      }
    }
    this.selection = next;
    if (next !== 'rotation') {
      this.trackIndex = TRACKS.indexOf(trackById(next));
    }
    this.track = TRACKS[this.trackIndex];
    this.loadCurrent(false);
    this.emitChange();
  }

  skip(dir) {
    const n = TRACKS.length;
    const step = dir < 0 ? -1 : 1;
    this.trackIndex = (this.trackIndex + step + n) % n;
    this.track = TRACKS[this.trackIndex];
    if (this.selection !== 'rotation') {
      this.selection = this.track.id;
    }
    if (this.enabled) {
      this.wantPlay = true;
    }
    this.loadCurrent(true);
    this.emitChange();
  }

  onEnded() {
    if (this.selection === 'rotation') {
      this.skip(1);
      return;
    }
    if (this.el) {
      this.el.currentTime = 0;
      this.resume();
    }
  }

  onError() {
    this.failStreak += 1;
    if (this.failStreak >= TRACKS.length) {
      return;
    }
    this.skip(1);
  }

  loadCurrent(restart) {
    if (!this.el) {
      return;
    }
    const url = trackUrl(this.track.file);
    this.el.loop = this.selection !== 'rotation';
    if (this.loadedUrl !== url) {
      this.loadedUrl = url;
      this.el.src = url;
    } else if (restart) {
      this.el.currentTime = 0;
    }
    if (this.wantPlay && this.enabled) {
      this.resume();
    }
  }

  pause() {
    this.wantPlay = false;
    if (this.el) {
      this.el.pause();
    }
  }

  resume() {
    if (!this.enabled) {
      return;
    }
    this.wantPlay = true;
    if (!this.el) {
      return;
    }
    this.playPending = true;
    const p = this.el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        this.playPending = false;
      }, () => {
        this.playPending = false;
      });
    } else {
      this.playPending = false;
    }
  }

  /* A cue pulls the bed down and lets it back up. Measurable by design. */
  duckNow(atTime, depth, seconds) {
    if (!this.duck) {
      return;
    }
    const g = this.duck.gain;
    g.cancelScheduledValues(atTime);
    g.setValueAtTime(1, atTime);
    g.linearRampToValueAtTime(depth, atTime + 0.012);
    g.linearRampToValueAtTime(1, atTime + seconds);
  }

  /*
   * Ticked from the audio update every frame. The generated scheduler is
   * gone; this only restarts playback if the element was paused under us
   * (a tab blur, an autoplay race) while the bed should be running.
   */
  tick() {
    if (!this.el || !this.enabled || !this.wantPlay || this.playPending) {
      return;
    }
    if (this.el.paused && this.el.readyState >= 2) {
      this.resume();
    }
  }
}
