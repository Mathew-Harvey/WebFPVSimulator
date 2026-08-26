/*
 * music.js: recorded tracks on the mix bus.
 *
 * The generated performer (oscillators, noise buffers, a sixteenth-note
 * scheduler, mini-notation sheets) is gone. This file plays the crate in
 * src/render/tracks.js through one HTMLAudioElement and one
 * MediaElementSource. That is three AudioNodes (source, level, duck)
 * against the 64 node budget, and it is the only way a multi megabyte
 * track does not sit decoded in memory before the first note.
 *
 * OfflineAudioContext has no media element, so attach still builds the
 * level and duck nodes the rest of the mix talks to, and stays silent.
 * scripts/audio-probe.js can still drive motors and cues. It cannot
 * render a recorded track, and it does not claim to.
 *
 * THE THREE THINGS THIS FILE DOES ABOUT A SLOW CONNECTION.
 *
 * One, it asks for the cheap format. Every track is on disk twice, Opus
 * in a WebM at about 2.5 MB and mp3 at about 3.1 MB, from masters that
 * were 5.7 MB. canPlayType picks, and a WebM that will not decode demotes
 * the whole session to mp3 and reloads the same track, so a browser that
 * answers 'maybe' and then cannot open the file gets music rather than a
 * skip through twelve tracks to silence.
 *
 * Two, preload is 'none' and not 'auto'. attach() runs on the first
 * gesture, which is usually the same click that starts a flight, and with
 * 'auto' the element starts pulling a whole track down at that moment
 * whether or not the player has music on at all. Nothing is fetched now
 * until play() is called, and play() is only called when the bed is
 * wanted. With music off the cost is zero bytes rather than one track.
 *
 * Three, it warms the next track in the rotation, but only out of spare
 * bandwidth: rotation only, only inside the last WARM_LEAD_S seconds, and
 * only once the current track is buffered to its own end, so the warm
 * never competes with the thing playing. Save-Data turns it off.
 * Rotation's first track of a visit is a random pick, then the crate
 * walks in order, so the warm is still the next index, not a shuffle.
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

import { TRACKS, pickTrack, trackById, trackUrl } from './tracks.js';

/*
 * Bus gain at a Music setting of ten. Recorded tracks are mastered hotter
 * than the old generated bed, so this is lower than the 0.85 the
 * oscillators used. Default setting 5 lands at 0.30, which the live
 * audio-bed check still sees as well above its 0.05 floor.
 *
 * The re-encode did not move this. scripts/music.js fails the encode if
 * either output drifts more than 0.5 LU from its master, measured with
 * ebur128, precisely so that a codec change cannot quietly rebalance the
 * mix against the motors.
 */
const MUSIC_BUS = 0.60;

/*
 * How close to the end of a track the next one starts buffering. Long
 * enough that a 2.5 MB file has arrived before it is needed on a slow
 * line, short enough that a listener who skips has not paid for much.
 */
const WARM_LEAD_S = 25;

/* The player asked to conserve. Honour it: no speculative bytes. */
function saveData() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  return Boolean(c && c.saveData);
}

export class Music {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.level = 0.5;
    this.selection = 'rotation';
    /* A visit used to always open on TRACKS[0]. Rotation now starts on a
     * random record, then walks the crate in order. A pinned id still
     * lands on that track when setTrack runs. */
    this.track = pickTrack();
    this.trackIndex = TRACKS.indexOf(this.track);
    this.el = null;
    this.src = null;
    this.gain = null;
    this.duck = null;
    this.onChange = null;
    this.failStreak = 0;
    this.wantPlay = false;
    this.loadedUrl = '';
    this.playPending = false;
    this.ext = 'mp3';
    this.demoted = false;
    this.warm = null;
    this.warmId = '';
  }

  /*
   * Build the bus. keep() is the owner's node tracker, so every node
   * created here is counted against the 64 node budget where it is made.
   * The warm element is deliberately NOT passed to keep(): it is never
   * connected to the graph, it exists only to fill the browser's HTTP
   * cache, and it creates no AudioNode at all.
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
    /*
     * 'none' is the whole point. See the header. The element still knows
     * its src, so play() starts immediately when the bed is wanted; it
     * just does not open a socket before then.
     */
    el.preload = 'none';
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
    this.ext = this.pickFormat(el);
    this.src = keep(ctx.createMediaElementSource(el));
    this.src.connect(this.gain);
    this.applyLevel();
    this.loadCurrent(false);
    if (this.enabled) {
      this.resume();
    }
  }

  /*
   * Opus if the browser will take it, mp3 if not. Safari older than 14.1
   * on the desktop and 17.4 on the phone cannot open a WebM at all and
   * answers '' here, which is the answer this is asking for. A browser
   * that answers 'maybe' and then fails is handled by onError.
   */
  pickFormat(el) {
    if (typeof el.canPlayType !== 'function') {
      return 'mp3';
    }
    return el.canPlayType('audio/webm; codecs="opus"') !== '' ? 'webm' : 'mp3';
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
   * Which track. 'rotation' starts on a random record each visit and
   * walks the crate in order from there. A track id pins that track and
   * loops it. Selection is a SETTING, so this can arrive before attach;
   * the constructor defaults cover the gap. Calling rotation again is a
   * no-op, so applyMix does not re-roll every settings write.
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

  /*
   * A track that will not load. Two different failures land here and they
   * want opposite answers.
   *
   * A WebM the browser cannot decode is not a bad track, it is a bad
   * FORMAT, and skipping would walk the whole crate to silence one file
   * at a time. Demote the session to mp3 and reload the same track. Once
   * only, so a genuinely missing file still moves on.
   *
   * Anything else is this track: count it and skip, and stop once the
   * whole crate has failed rather than spin.
   */
  onError() {
    const code = this.el && this.el.error ? this.el.error.code : 4;
    const formatFault = code === 3 || code === 4;
    if (this.ext === 'webm' && !this.demoted && formatFault) {
      this.demoted = true;
      this.ext = 'mp3';
      this.dropWarm();
      this.loadCurrent(true);
      return;
    }
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
    const url = trackUrl(this.track.id, this.ext);
    this.el.loop = this.selection !== 'rotation';
    if (this.loadedUrl !== url) {
      this.loadedUrl = url;
      this.el.src = url;
      /* The warm did its job the moment this src was set: the bytes are in
       * the browser's cache and the real element is asking for them. Let
       * the second element and its buffer go, and never leave two elements
       * pulling the same URL at once. */
      if (this.warmId === this.track.id) {
        this.dropWarm();
      }
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
    /* A warm in flight is speculative by definition. If the bed is off,
     * nobody is going to listen to what it is fetching. */
    this.dropWarm();
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

  dropWarm() {
    if (!this.warm) {
      return;
    }
    this.warm.removeAttribute('src');
    this.warm.load();
    this.warm = null;
    this.warmId = '';
  }

  /*
   * Pull the next track into the browser's HTTP cache out of bandwidth
   * the current track is no longer using, so the gap at the end of a
   * rotation is not the length of a download on a slow line. Every gate
   * here is a refusal to speculate:
   *
   *   rotation only        a pinned track loops, there is no next
   *   not Save-Data        the player asked to conserve
   *   near the end         WARM_LEAD_S, not the whole track
   *   current fully buffered   the warm cannot starve what is playing
   *
   * This element is never played and never connected to the graph, so it
   * costs no AudioNode. It exists to make the request; render.yaml serves
   * /assets/music/* immutable, so the real element's range requests come
   * back out of the disk cache rather than off the wire a second time.
   */
  warmNext() {
    if (this.selection !== 'rotation' || saveData() || typeof Audio === 'undefined') {
      return;
    }
    const el = this.el;
    const dur = el.duration;
    if (!Number.isFinite(dur) || dur <= WARM_LEAD_S) {
      return;
    }
    if (dur - el.currentTime > WARM_LEAD_S) {
      return;
    }
    const n = el.buffered.length;
    if (n === 0 || el.buffered.end(n - 1) < dur - 0.5) {
      return;
    }
    const next = TRACKS[(this.trackIndex + 1) % TRACKS.length];
    if (this.warmId === next.id) {
      return;
    }
    this.dropWarm();
    this.warmId = next.id;
    this.warm = new Audio();
    this.warm.preload = 'auto';
    this.warm.muted = true;
    this.warm.src = trackUrl(next.id, this.ext);
  }

  /*
   * Ticked from the audio update every frame. The generated scheduler is
   * gone; this restarts playback if the element was paused under us (a
   * tab blur, an autoplay race) while the bed should be running, and
   * warms the next track when there is spare bandwidth to do it in.
   */
  tick() {
    if (!this.el || !this.enabled || !this.wantPlay) {
      return;
    }
    if (this.playPending) {
      return;
    }
    if (this.el.paused && this.el.readyState >= 2) {
      this.resume();
      return;
    }
    if (!this.el.paused) {
      this.warmNext();
    }
  }
}
