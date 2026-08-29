/*
 * music.js: recorded tracks on the mix bus.
 *
 * The generated performer (oscillators, noise buffers, a sixteenth-note
 * scheduler, mini-notation sheets) is gone. This file plays the crates in
 * src/render/tracks.js through one HTMLAudioElement and one
 * MediaElementSource. That is four AudioNodes (source, level, swap, duck)
 * against the 64 node budget, and it is the only way a multi megabyte
 * track does not sit decoded in memory before the first note.
 *
 * TWO CRATES, ONE ELEMENT.
 *
 * TRACKS is what plays while the pilot is flying. MENU_TRACKS is what
 * plays on every other screen, quieter, rolled at random each time the
 * menus come back. The context word for those two states is 'flight' and
 * 'menu' and it arrives through setContext, from the one place in the
 * shell that knows which screen is up.
 *
 * They share ONE element on purpose. A second element and a second
 * MediaElementSource would be two more nodes and two more things to keep
 * paused, and the two beds are never wanted at once: the whole point is
 * that one of them stops when the other starts. What a single element
 * costs is a load at every context change, which is why the swap is
 * fenced by a fade and why the menus warm the flight track.
 *
 * WHAT A CONTEXT CHANGE DOES.
 *
 * setContext does not swap anything. It ramps the swap gain to zero over
 * SWAP_FALL_S and leaves a note; tick() does the swap once that ramp has
 * run and then ramps back up over SWAP_RISE_S. Setting src on a media
 * element is instant and the audio that comes back out of it is not, so a
 * swap done in the same call as the decision is a cut into silence into a
 * cold start. Done this way it is a fade out, a gap covered by the fade,
 * and a fade in.
 *
 * Every track's position is remembered by id and restored on the way
 * back. Without it a menu visit is thirty seconds, and a player who flies
 * eight races has heard the first thirty seconds of the menu bed eight
 * times and the rest of it never. That is the definition of obtrusive.
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
 * Three, it warms one track out of spare bandwidth, never out of the
 * bandwidth the thing playing is using, and never at all under
 * Save-Data. In the menus the warm is the FLIGHT track, because the menus
 * are where a flight is about to be started and the element cannot start
 * buffering it before the swap; that warm waits until the menu bed is
 * WARM_MENU_AHEAD_S buffered ahead of itself, which is the connection
 * saying it has room. In flight the warm is the next record in the
 * rotation, inside the last WARM_LEAD_S seconds and only once the current
 * track is buffered to its own end.
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

import {
  TRACKS,
  MENU_TRACKS,
  pickTrack,
  pickMenuTrack,
  trackById,
  trackUrl,
} from './tracks.js';

/*
 * Bus gain at a Music setting of ten, in flight. Recorded tracks are
 * mastered hotter than the old generated bed, so this is lower than the
 * 0.85 the oscillators used. Default setting 5 lands at 0.30, which the
 * live audio-bed check still sees as well above its 0.05 floor.
 *
 * The re-encode did not move this. scripts/music.js fails the encode if
 * either output drifts more than 0.5 LU from its master, measured with
 * ebur128, precisely so that a codec change cannot quietly rebalance the
 * mix against the motors.
 */
const MUSIC_BUS = 0.60;

/*
 * The same, in the menus. A third of the flight bus, 9.5 dB down.
 *
 * The number is a mix decision and it is made here because it cannot be
 * made anywhere else. The two menu records measure -14.2 and -13.6 LUFS
 * integrated, mid crate against the flight records' -12.9 to -17.1, so
 * nothing about the files is quiet and scripts/music.js is forbidden from
 * making them quiet.
 *
 * 9.5 dB and not 3 or 20 because of what each bed plays against. In
 * flight the music sits under four motors and a wind stem and is already
 * about 10 dB below the motor stem. In the menus it plays against
 * nothing at all, so the same bus gain would put it perceptually far
 * further forward than it ever is in flight, on the screen where somebody
 * is trying to read rows. A third takes the bed back to roughly where it
 * sits under the motors, which is the level it was balanced at.
 *
 * At the default Music setting of 5 this is 0.5 times 0.20, so 0.10,
 * twice the audio-bed check's 0.05 floor. Take this below 0.10 and that
 * floor starts to mean something; the check taps a key on the title
 * screen, so what it measures is this bus and not MUSIC_BUS.
 */
const MENU_BUS = 0.20;

/*
 * How close to the end of a track the next one starts buffering. Long
 * enough that a 2.5 MB file has arrived before it is needed on a slow
 * line, short enough that a listener who skips has not paid for much.
 */
const WARM_LEAD_S = 25;

/*
 * How far ahead of itself the menu bed has to be buffered before any of
 * the connection is spent on the flight track. This is the whole gate on
 * a speculative multi megabyte fetch, so it is a real margin and not a
 * readyState glance: twenty seconds of audio in hand says the line is
 * keeping up, and if it is not then the menu bed is what matters, because
 * the menu bed is what is playing.
 */
const WARM_MENU_AHEAD_S = 20;

/* The fade either side of a crate swap. Down fast enough that the flight
 * bed is gone before the results table is read, up slowly enough that the
 * bed arrives under the screen rather than with it. */
const SWAP_FALL_S = 0.25;
const SWAP_RISE_S = 0.70;

/* A resume that lands inside the outro is a track that ends the moment it
 * starts, which reads as a fault rather than as a resume. Closer to the
 * end than this and the record starts again from the top. */
const RESUME_MIN_LEFT_S = 15;

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
    /*
     * Which crate is on the element. A visit opens in the menus, always:
     * there is no way to reach a flight without crossing one.
     */
    this.context = 'menu';
    this.pendingContext = '';
    this.swapAt = 0;
    /*
     * An index into each crate, kept whether or not that crate is the one
     * playing, so the setting the pilot pinned and the record the menus
     * were on both survive a trip through the other context.
     *
     * The flight crate used to always open on TRACKS[0]. Rotation now
     * starts on a random record, then walks the crate in order. A pinned
     * id still lands on that track when setTrack runs. The menu crate is
     * rolled here and again on every return to the menus.
     */
    this.flightIndex = TRACKS.indexOf(pickTrack());
    this.menuIndex = MENU_TRACKS.indexOf(pickMenuTrack());
    /* Seconds into each record, by id, so a swap resumes rather than
     * restarts. See the header. */
    this.resumeAt = Object.create(null);
    this.seekTo = 0;
    this.track = MENU_TRACKS[this.menuIndex];
    this.trackIndex = this.menuIndex;
    this.el = null;
    this.src = null;
    this.gain = null;
    this.swap = null;
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
   *
   * Three gains and not one because each answers to a different owner and
   * they overlap. gain is the settings row and the context's bus, and it
   * is the one the audio-bed check reads, so it holds exactly the value
   * the settings ask for and nothing else. swap is the crate change. duck
   * is a cue. A cue landing in the middle of a swap has to leave the swap
   * where it was, and one automation curve cannot do that.
   */
  attach(ctx, dest, keep) {
    this.ctx = ctx;

    this.gain = keep(ctx.createGain());
    this.gain.gain.value = 0;
    this.swap = keep(ctx.createGain());
    this.swap.gain.value = 1;
    this.duck = keep(ctx.createGain());
    this.duck.gain.value = 1;
    this.gain.connect(this.swap);
    this.swap.connect(this.duck);
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
    el.addEventListener('loadedmetadata', () => this.onMeta());
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

  /* The crate the context word names, and the pilot's place in it. One
   * pair of accessors so that nothing else in this file has to spell the
   * conditional out and get it the wrong way round once. */
  crate() {
    return this.context === 'menu' ? MENU_TRACKS : TRACKS;
  }

  crateIndex() {
    return this.context === 'menu' ? this.menuIndex : this.flightIndex;
  }

  setCrateIndex(i) {
    if (this.context === 'menu') {
      this.menuIndex = i;
    } else {
      this.flightIndex = i;
    }
  }

  /* this.track and this.trackIndex are the record ON THE ELEMENT. They are
   * derived, and this is the only place they are written. */
  applyCrate() {
    this.trackIndex = this.crateIndex();
    this.track = this.crate()[this.trackIndex];
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
    const bus = this.context === 'menu' ? MENU_BUS : MUSIC_BUS;
    this.gain.gain.value = this.enabled ? this.level * bus : 0;
  }

  status() {
    return {
      id: this.track.id,
      name: this.track.name,
      selection: this.selection,
      index: this.trackIndex,
      /*
       * Which crate this record came out of. The shell needs it: the dock
       * shows what is playing, but the Music track SETTING is about the
       * flight crate, and a skip in the menus that wrote a menu id into
       * that setting would leave it holding a value its own list does not
       * contain.
       */
      context: this.context,
    };
  }

  emitChange() {
    if (typeof this.onChange === 'function') {
      this.onChange(this.status());
    }
  }

  /*
   * Menus or flight. Called from the shell on every screen change, so it
   * has to be cheap and idempotent, and it is: a context that is already
   * the one wanted, or already the one a swap is on its way to, returns.
   *
   * Nothing swaps here. See the header: the ramp runs first and tick()
   * finishes the job. The one exception is a bed nobody can hear, either
   * because the graph is not built yet or because music is off, where
   * there is no fade to hide anything and waiting for a tick would leave
   * the wrong crate armed for whenever it comes back on.
   */
  setContext(sel) {
    const next = sel === 'flight' ? 'flight' : 'menu';
    if (next === (this.pendingContext || this.context)) {
      return;
    }
    this.pendingContext = next;
    if (!this.el || !this.ctx || !this.swap || !this.enabled || !this.wantPlay) {
      this.commitSwap();
      return;
    }
    const g = this.swap.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + SWAP_FALL_S);
    this.swapAt = t + SWAP_FALL_S;
  }

  /* Change the crate under the element and let the bed back up. Called
   * from tick() once the fade out has run, or straight from setContext
   * when there was nothing to fade. */
  commitSwap() {
    const next = this.pendingContext;
    this.pendingContext = '';
    if (!next || next === this.context) {
      this.raiseSwap();
      return;
    }
    this.rememberTime();
    this.context = next;
    if (next === 'menu') {
      /* A fresh roll every time the menus come back, which is what
       * 'played at random in the menus' means when a menu visit is
       * thirty seconds long. Positions are remembered, so a re-roll
       * changes the record rather than restarting one. */
      this.menuIndex = MENU_TRACKS.indexOf(pickMenuTrack());
    }
    this.applyCrate();
    this.applyLevel();
    /* Whatever the warm was fetching, it was fetching it for the crate
     * that is no longer on the element. */
    this.dropWarm();
    this.loadCurrent(false);
    this.raiseSwap();
    this.emitChange();
  }

  raiseSwap() {
    if (!this.swap || !this.ctx) {
      return;
    }
    const g = this.swap.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1, t + SWAP_RISE_S);
  }

  /* Where this record had got to, so the trip back can pick it up. */
  rememberTime() {
    if (!this.el || !this.track) {
      return;
    }
    const at = this.el.currentTime;
    if (Number.isFinite(at) && at > 0) {
      this.resumeAt[this.track.id] = at;
    }
  }

  /*
   * The seek half of the resume. currentTime cannot be written before the
   * element knows its duration, and with preload 'none' that is not until
   * play() has been called and the metadata has arrived, so the position
   * is parked in seekTo by loadCurrent and spent here.
   */
  onMeta() {
    const at = this.seekTo;
    this.seekTo = 0;
    if (!this.el || !(at > 0)) {
      return;
    }
    const dur = this.el.duration;
    if (!Number.isFinite(dur) || at > dur - RESUME_MIN_LEFT_S) {
      return;
    }
    try {
      this.el.currentTime = at;
    } catch (e) {
      /* A browser that will not seek yet just starts the record again.
       * There is nothing here worth failing a bed over. */
    }
  }

  /*
   * Which FLIGHT track. 'rotation' starts on a random record each visit
   * and walks the crate in order from there. A track id pins that track
   * and loops it. Selection is a SETTING, so this can arrive before
   * attach; the constructor defaults cover the gap. Calling rotation
   * again is a no-op, so applyMix does not re-roll every settings write.
   *
   * The menu bed is NOT selectable and this never touches it. The early
   * return is what makes that a property of this function rather than a
   * coincidence: loadCurrent builds its URL from the record applyCrate
   * put on the element, which in the menus is a menu record, so falling
   * through would happen to be harmless today. It would stop being
   * harmless the moment either of those two grew a case, and the Sound
   * screen writes every setting on every keypress, so what it would stop
   * being harmless about is the bed restarting under a stepper.
   */
  setTrack(sel) {
    const next = sel === 'rotation' || TRACKS.some((t) => t.id === sel) ? sel : 'rotation';
    const idx = next === 'rotation' ? this.flightIndex : TRACKS.indexOf(trackById(next));
    if (next === this.selection && idx === this.flightIndex) {
      return;
    }
    this.selection = next;
    this.flightIndex = idx;
    if (this.context !== 'flight') {
      return;
    }
    this.applyCrate();
    this.loadCurrent(false);
    this.emitChange();
  }

  /* Skip inside whatever crate is playing. In the menus that is two
   * records and skipping is a toggle, which is the honest behaviour for a
   * button sitting next to the name of the thing it would skip. */
  skip(dir) {
    const crate = this.crate();
    const n = crate.length;
    const step = dir < 0 ? -1 : 1;
    this.rememberTime();
    this.setCrateIndex((this.crateIndex() + step + n) % n);
    this.applyCrate();
    if (this.context === 'flight' && this.selection !== 'rotation') {
      this.selection = this.track.id;
    }
    if (this.enabled) {
      this.wantPlay = true;
    }
    this.loadCurrent(true);
    this.emitChange();
  }

  onEnded() {
    /* The menu crate always walks: a two record bed that looped one of
     * them would be a loop, and a loop is the thing a menu bed must not
     * be. The flight crate walks on rotation and loops on a pinned id. */
    if (this.context === 'menu' || this.selection === 'rotation') {
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
   * whole crate has failed rather than spin. The crate is whichever one
   * is playing, so a missing menu record gives up after two and not
   * after twelve.
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
    if (this.failStreak >= this.crate().length) {
      return;
    }
    this.skip(1);
  }

  loadCurrent(restart) {
    if (!this.el) {
      return;
    }
    const url = trackUrl(this.track.id, this.ext);
    this.el.loop = this.context === 'flight' && this.selection !== 'rotation';
    if (this.loadedUrl !== url) {
      this.loadedUrl = url;
      this.el.src = url;
      /* Parked for onMeta, which is the first moment the element will
       * accept it. A skip is a request for the top of the record, so it
       * spends the resume rather than honouring it. */
      this.seekTo = restart ? 0 : (this.resumeAt[this.track.id] ?? 0);
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
    /* Where the bed got to, so that turning music back on, or a tab that
     * comes back, is a resume and not a restart. */
    this.rememberTime();
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
  /* Same shape and the same reason as duckFlight in src/render/audio.js:
   * start from where the bus is, keep the deeper of the two ducks, and
   * never step to unity under a cue that is still sounding. */
  duckNow(atTime, depth, seconds) {
    if (!this.duck) {
      return;
    }
    const g = this.duck.gain;
    const from = g.value;
    if (typeof g.cancelAndHoldAtTime === 'function') {
      g.cancelAndHoldAtTime(atTime);
    } else {
      g.cancelScheduledValues(atTime);
    }
    g.setValueAtTime(from, atTime);
    g.linearRampToValueAtTime(from < depth ? from : depth, atTime + 0.012);
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
   * Which track deserves the connection's spare capacity right now, or ''
   * for none. Every branch here is a refusal to speculate, and the gates
   * are the same shape in both contexts: only when the thing playing is
   * comfortably ahead of itself, and only for the track that is actually
   * going to be asked for next.
   *
   * In the menus that is the FLIGHT track, because the menus are where a
   * flight is about to be started and one element cannot buffer the next
   * bed and play this one. Without it every first flight of a visit opens
   * on the download of a 2.5 MB file, which is exactly the contention
   * this whole file is written to avoid, and it is worse than what it
   * replaced because the old shell had the flight track playing from the
   * title screen.
   *
   * Near the end of a menu record the next menu record wins instead: it
   * is needed sooner, and the flight warm's bytes are in the HTTP cache
   * by then anyway.
   */
  warmWanted() {
    const el = this.el;
    const dur = el.duration;
    const buffered = el.buffered.length;
    const ahead = buffered === 0 ? 0 : el.buffered.end(buffered - 1) - el.currentTime;
    const near = Number.isFinite(dur) && dur > WARM_LEAD_S && dur - el.currentTime <= WARM_LEAD_S;

    if (this.context === 'menu') {
      if (near) {
        return MENU_TRACKS[(this.menuIndex + 1) % MENU_TRACKS.length].id;
      }
      return ahead >= WARM_MENU_AHEAD_S ? TRACKS[this.flightIndex].id : '';
    }
    /* A pinned track loops, so there is no next. */
    if (this.selection !== 'rotation' || !near) {
      return '';
    }
    if (buffered === 0 || el.buffered.end(buffered - 1) < dur - 0.5) {
      return '';
    }
    return TRACKS[(this.flightIndex + 1) % TRACKS.length].id;
  }

  /*
   * Pull a track into the browser's HTTP cache out of bandwidth the
   * current track is not using, so the next thing the bed has to play is
   * not the length of a download away on a slow line.
   *
   * This element is never played and never connected to the graph, so it
   * costs no AudioNode. It exists to make the request; render.yaml serves
   * /assets/music/* immutable, so the real element's range requests come
   * back out of the disk cache rather than off the wire a second time.
   */
  warmSpare() {
    if (saveData() || typeof Audio === 'undefined') {
      return;
    }
    const want = this.warmWanted();
    if (!want || want === this.warmId || want === this.track.id) {
      return;
    }
    this.dropWarm();
    this.warmId = want;
    this.warm = new Audio();
    this.warm.preload = 'auto';
    this.warm.muted = true;
    this.warm.src = trackUrl(want, this.ext);
  }

  /*
   * Ticked from the audio update every frame. The generated scheduler is
   * gone; this finishes a crate swap once its fade out has run, restarts
   * playback if the element was paused under us (a tab blur, an autoplay
   * race) while the bed should be running, and warms a track when there
   * is spare bandwidth to do it in.
   */
  tick(t) {
    /* Before the early returns: a swap that was armed while the bed was
     * running and then had music turned off under it still has to land,
     * or the wrong crate is armed for whenever it comes back. */
    if (this.pendingContext && (!Number.isFinite(t) || t >= this.swapAt)) {
      this.commitSwap();
    }
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
      this.warmSpare();
    }
  }
}
