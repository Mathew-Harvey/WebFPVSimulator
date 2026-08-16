/*
 * music.js: a generated music bed with a record crate behind it.
 *
 * This began as one hard coded 174 BPM lofi drum and bass loop. The owner
 * asked for many tracks of drum and bass and lofi, so the performance and
 * the material are now separate: src/render/tracks.js holds twelve tracks
 * as pattern strings and numbers, and this file is the one instrument set
 * that performs whichever track is selected. Everything still comes out of
 * an OscillatorNode, an AudioBufferSourceNode over noise this file
 * generates, and filters. No external asset, because the licence is GPLv3
 * and because P6 counts every byte on the way to the first interactive
 * frame.
 *
 * POOLED, NOT PER NOTE, AND NOT PER TRACK. There is exactly one voice per
 * drum, one for the sub bass, two for a dark reese, three for the pad,
 * each a persistent chain whose gain is enveloped at a scheduled time. A
 * track change moves filter corners and reads different pattern data; it
 * creates nothing. That is what keeps twelve tracks inside the same 64
 * node budget (tests/thresholds.json, audio-bed) that one track lived in.
 * The node count is fixed the moment attach runs.
 *
 * THE SCHEDULER'S CLOCK. `step` is monotonic for the life of the graph and
 * verify check 14 measures its advance, so a track switch must not rewind
 * it. Each track instead anchors `stepBase` and `startTime`: the step
 * within the current track is `step - stepBase`, and rotation re-anchors
 * both at the exact loop boundary so the grid never tears. A manual switch
 * re-anchors at the next tick, which is the moment the player asked for.
 *
 * LOOP PERIODIC, and the seam is MEASURED rather than assumed, with
 * scripts/audio-probe.js --seam. The wow period divides every loop by
 * construction, checked at import in tracks.js.
 *
 * WHERE IT SITS IN THE SPECTRUM. The motor model owns roughly 130 Hz to
 * 900 Hz. Every track keeps its sub bass, kick and reese below 160 Hz, its
 * snare and hats above 1.5 kHz, and its pad as short chord stabs between
 * 524 Hz and 1320 Hz. Hats are ticks, not a hiss. There is no vinyl
 * crackle: that was the static. There is no ambience stem: that was the
 * hum.
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

import { TRACKS, trackById, BAR_STEPS } from './tracks.js';

/*
 * The pad's register guard: every chord tone folded by octaves into the
 * window -4 to +12 semitones around the track's pad base, which at the
 * 660 Hz base is 524 Hz to 1320 Hz.
 *
 * The ceiling is the half that matters. Three tracks voice a chord tone at
 * 14 or 15 semitones, which against the old 880 Hz base put a sustained pad
 * voice at 1975 and 2093 Hz: the top of the band the ear complains about
 * first, held for a whole chord span, which is exactly the overtone the
 * owner reported. The floor keeps the pad off the blade pass fundamental,
 * which tops out at 450 Hz at 9000 RPM; without it Undertow's last chord
 * would put a pad voice at 440 Hz and beat against a wide open motor.
 *
 * Folding is a voicing change and not a harmony change: the tone keeps its
 * pitch class, so the chord is the same chord played closer.
 *
 * It lives here rather than in tracks.js so that a new track cannot
 * reintroduce the defect by writing a wide voicing, and so the crate stays
 * readable as music rather than as a set of numbers respecting a ceiling.
 */
function padSemitone(n) {
  let s = n;
  while (s > 12) {
    s -= 12;
  }
  while (s < -4) {
    s += 12;
  }
  return s;
}

/* A few cents of spread so a chord stab is three voices beating, not one
 * sine. A unison triad of sines is a test tone; 11 to 13 cents is a
 * chorus width, not a chord change. */
const PAD_CENTS = [-11, 0, 13];

export class Music {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.level = 0.5;
    this.step = 0;          /* next step index to schedule, monotonic */
    this.stepBase = 0;      /* step at which the current track started */
    this.startTime = 0;     /* context time of stepBase, 0 means re-anchor */
    this.selection = 'rotation';
    this.trackIndex = 0;
    this.track = TRACKS[0];
    this.stepSeconds = 60 / this.track.bpm / 4;
  }

  /*
   * Build the instrument set. keep() is the owner's node tracker, so every
   * node created here is counted against the 64 node budget where it is
   * made.
   */
  attach(ctx, dest, keep) {
    this.ctx = ctx;
    const sr = ctx.sampleRate;

    /* The bus: level, then the duck a cue pulls down, then the lofi shelf.
     * The shelf's corner and depth are per track, applied in applyVoices. */
    this.gain = keep(ctx.createGain());
    this.gain.gain.value = 0;
    this.duck = keep(ctx.createGain());
    this.duck.gain.value = 1;
    this.shelf = keep(ctx.createBiquadFilter());
    this.shelf.type = 'highshelf';
    this.shelf.frequency.value = this.track.shelf.hz;
    this.shelf.gain.value = this.track.shelf.db;
    this.gain.connect(this.duck);
    this.duck.connect(this.shelf);
    this.shelf.connect(dest);

    /*
     * One noise buffer, sized by the LONGEST loop in the crate so every
     * track's snare and hats read from it without wrapping mid phrase.
     * Deterministic LCG, so two renders of the same graph agree. The seam
     * being clean stays a MEASUREMENT, not arithmetic: the buffer rounds to
     * whole samples and drifts a fraction of a sample per loop.
     */
    let loopMax = 0;
    for (const t of TRACKS) {
      const secs = t.bars * BAR_STEPS * (60 / t.bpm / 4);
      if (secs > loopMax) {
        loopMax = secs;
      }
    }
    const len = Math.round(loopMax * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const ch = buf.getChannelData(0);
    let s = 987654321;
    for (let i = 0; i < len; i += 1) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      ch[i] = (s / 0x3fffffff) - 1.0;
    }

    /* Kick: a sine whose pitch drops, which is the whole trick. Start and
     * end pitch are per track. */
    this.kickOsc = keep(ctx.createOscillator());
    this.kickOsc.type = 'sine';
    this.kickOsc.frequency.value = 60;
    this.kickGain = keep(ctx.createGain());
    this.kickGain.gain.value = 0;
    this.kickOsc.connect(this.kickGain);
    this.kickGain.connect(this.gain);
    this.kickOsc.start();

    /* Sub bass: a sine through a lowpass, so nothing of it reaches the
     * motors' band even when the note is short and the envelope clicks. */
    this.subOsc = keep(ctx.createOscillator());
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = this.track.bass.rootHz;
    this.subLp = keep(ctx.createBiquadFilter());
    this.subLp.type = 'lowpass';
    this.subLp.frequency.value = 160;
    this.subLp.Q.value = 0.7;
    this.subGain = keep(ctx.createGain());
    this.subGain.gain.value = 0;
    this.subOsc.connect(this.subLp);
    this.subLp.connect(this.subGain);
    this.subGain.connect(this.gain);
    this.subOsc.start();

    /*
     * Reese: two detuned saws through a 140 Hz lowpass. The sine sub is
     * the weight; this is the growl. Capped at 140 Hz so it cannot sing
     * in the blade pass band. Nodes paid for by deleting the crackle
     * loop and the ambience stem, both of which the owner heard as noise.
     */
    this.reeseLp = keep(ctx.createBiquadFilter());
    this.reeseLp.type = 'lowpass';
    this.reeseLp.frequency.value = 140;
    this.reeseLp.Q.value = 0.8;
    this.reeseGain = keep(ctx.createGain());
    this.reeseGain.gain.value = 0;
    this.reeseLp.connect(this.reeseGain);
    this.reeseGain.connect(this.gain);
    this.reeseOscs = [];
    for (let i = 0; i < 2; i += 1) {
      const osc = keep(ctx.createOscillator());
      osc.type = 'sawtooth';
      osc.frequency.value = this.track.bass.rootHz;
      osc.detune.value = i === 0 ? -8 : 11;
      osc.connect(this.reeseLp);
      osc.start();
      this.reeseOscs.push(osc);
    }

    /*
     * The pad: three SINES a chord apart through one lowpass. Every track
     * now strikes them and lets them die. The swell path used to hold the
     * triad at 0.02 for 94 percent of the chord span and never return to
     * silence, which is a drone, and a sine drone is a whistle no matter
     * which octave you put it in. Round 37 moved it down and killed the
     * triangle's third harmonic. The owner still heard a tone, because
     * the tone was the hold, not the harmonic.
     *
     * They were triangles first. A triangle's third harmonic is 19 dB
     * down, and the old 2500 Hz lowpass let it through. Sine has no third
     * harmonic, so those 2 to 3 kHz peaks stay gone. What remains is a
     * chord event, not a bed.
     */
    this.padOscs = [];
    this.padGain = keep(ctx.createGain());
    this.padGain.gain.value = 0;
    this.padLp = keep(ctx.createBiquadFilter());
    this.padLp.type = 'lowpass';
    /* Just above the highest chord tone the fold below can produce, so it
     * rounds the strike transient and catches nothing else. With sines
     * there is no harmonic left for it to remove. */
    this.padLp.frequency.value = this.track.pads.lp;
    this.padLp.Q.value = 0.6;
    this.padGain.connect(this.padLp);
    this.padLp.connect(this.gain);
    for (let i = 0; i < 3; i += 1) {
      const osc = keep(ctx.createOscillator());
      osc.type = 'sine';
      osc.frequency.value = this.track.pads.baseHz;
      osc.connect(this.padGain);
      osc.start();
      this.padOscs.push(osc);
    }

    /* Snare: band limited noise, centred where a snare's body lives. The
     * centre and width are per track: the lofi snare sits lower and softer. */
    this.snareSrc = keep(ctx.createBufferSource());
    this.snareSrc.buffer = buf;
    this.snareSrc.loop = true;
    this.snareBp = keep(ctx.createBiquadFilter());
    this.snareBp.type = 'bandpass';
    this.snareBp.frequency.value = this.track.snareTone.bp;
    this.snareBp.Q.value = this.track.snareTone.q;
    this.snareGain = keep(ctx.createGain());
    this.snareGain.gain.value = 0;
    this.snareSrc.connect(this.snareBp);
    this.snareBp.connect(this.snareGain);
    /* Off centre. Every bed only render came back with identical left and
     * right digests, which is two hours of dead centre mono on headphones. */
    this.snarePan = ctx.createStereoPanner ? keep(ctx.createStereoPanner()) : null;
    if (this.snarePan) {
      this.snarePan.pan.value = -0.22;
      this.snareGain.connect(this.snarePan);
      this.snarePan.connect(this.gain);
    } else {
      this.snareGain.connect(this.gain);
    }
    this.snareSrc.start();

    /* Hats: the same noise, high passed. Kept quiet on purpose: this is the
     * band the ear complains about first. */
    this.hatSrc = keep(ctx.createBufferSource());
    this.hatSrc.buffer = buf;
    this.hatSrc.loop = true;
    this.hatHp = keep(ctx.createBiquadFilter());
    this.hatHp.type = 'highpass';
    this.hatHp.frequency.value = this.track.hatTone.hp;
    this.hatHp.Q.value = 0.7;
    this.hatGain = keep(ctx.createGain());
    this.hatGain.gain.value = 0;
    this.hatSrc.connect(this.hatHp);
    this.hatHp.connect(this.hatGain);
    this.hatPan = ctx.createStereoPanner ? keep(ctx.createStereoPanner()) : null;
    if (this.hatPan) {
      this.hatPan.pan.value = 0.3;
      this.hatGain.connect(this.hatPan);
      this.hatPan.connect(this.gain);
    } else {
      this.hatGain.connect(this.gain);
    }
    this.hatSrc.start();

    this.startTime = 0;
    this.step = 0;
    this.stepBase = 0;
  }

  setLevel(v) {
    this.level = Math.max(0, Math.min(1, v));
    this.applyLevel();
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    this.applyLevel();
  }

  applyLevel() {
    if (!this.gain) {
      return;
    }
    /*
     * 0.85 at full setting, up from 0.40.
     *
     * The bed is still a bed, but it was a bed under a motor stem that
     * measured -18.45 dBFS against the bed's -28.34 on the same flight
     * render, and the owner's word for that was that the motors need to be
     * about 70 percent quieter than the music. 70 percent quieter in
     * amplitude is a factor of 0.3, which is 10.5 dB of RATIO, and the
     * motors cannot simply absorb all of it: they were carrying the mix's
     * loudness, and taking 10.5 dB off them alone drops a flight render to
     * -24.7 dBFS, outside the -20 to -14 dBFS band A3 asks for. So the
     * ratio is split, 4.0 dB off the motors in audio.js and 6.5 dB on to
     * the bed here, which is the 10.5 dB the owner asked for with the
     * render still at -18.9 dBFS. Measured either side in PROGRESS.md.
     */
    this.gain.gain.value = this.enabled ? this.level * 0.85 : 0;
  }

  /*
   * Which track. 'rotation' walks the whole crate in order, a track id
   * pins that track. Selection is a SETTING, so this can arrive before
   * attach; the constructor defaults cover the gap.
   */
  setTrack(sel) {
    if (sel === this.selection) {
      return;
    }
    this.selection = sel;
    const idx = sel === 'rotation' ? 0 : TRACKS.indexOf(trackById(sel));
    this.trackIndex = idx;
    this.track = TRACKS[idx];
    this.stepSeconds = 60 / this.track.bpm / 4;
    /* Re-anchor at the next tick rather than at a loop boundary: the
     * player who just chose a track wants to hear that track now. `step`
     * stays monotonic, only the anchor moves. */
    this.stepBase = this.step;
    this.startTime = 0;
    if (this.ctx && this.gain) {
      this.applyVoices(this.ctx.currentTime);
    }
  }

  /* Rotation's advance, at an exact loop boundary so the grid never
   * tears: the boundary time becomes the new track's time zero. */
  advance(boundaryTime) {
    this.trackIndex = (this.trackIndex + 1) % TRACKS.length;
    this.track = TRACKS[this.trackIndex];
    this.stepSeconds = 60 / this.track.bpm / 4;
    this.stepBase = this.step;
    this.startTime = boundaryTime;
    this.applyVoices(boundaryTime);
  }

  /*
   * Point the shared voices at the current track: filter corners, shelf.
   * Short time constants rather than steps, so a switch cannot click, and
   * no node is made or dropped: that is the whole deal that keeps the
   * crate inside the node budget.
   */
  applyVoices(at) {
    const tr = this.track;
    const T = 0.03;
    this.shelf.frequency.setTargetAtTime(tr.shelf.hz, at, T);
    this.shelf.gain.setTargetAtTime(tr.shelf.db, at, T);
    this.snareBp.frequency.setTargetAtTime(tr.snareTone.bp, at, T);
    this.snareBp.Q.setTargetAtTime(tr.snareTone.q, at, T);
    this.hatHp.frequency.setTargetAtTime(tr.hatTone.hp, at, T);
    this.padLp.frequency.setTargetAtTime(tr.pads.lp, at, T);
    /* A pad or reese from the previous track would otherwise hang into
     * the new one. Let them go and let the new track's first events
     * bring them back. */
    this.padGain.gain.cancelScheduledValues(at);
    this.padGain.gain.setTargetAtTime(0, at, 0.08);
    this.reeseGain.gain.cancelScheduledValues(at);
    this.reeseGain.gain.setTargetAtTime(0, at, 0.08);
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
   * The lookahead scheduler, ticked from the audio update every frame. It
   * schedules every step that falls inside the next LOOKAHEAD seconds and
   * nothing else, so a frame that arrives late cannot drop a beat and a
   * frame that arrives early cannot double one.
   *
   * Allocates nothing: all scalars, and the pattern tables are data in
   * tracks.js.
   */
  tick(atTime) {
    if (!this.ctx || !this.enabled) {
      return;
    }
    if (this.startTime === 0) {
      this.startTime = atTime;
      this.stepBase = this.step;
      this.applyVoices(atTime);
    }
    const LOOKAHEAD = 0.25;
    const horizon = atTime + LOOKAHEAD;
    /* A hard cap so a long stall cannot spin here: one whole loop of catch
     * up, whatever the current track's loop length is. */
    let guard = 0;
    for (;;) {
      const loopSteps = this.track.bars * BAR_STEPS;
      const n = this.step - this.stepBase;
      /* Rotation moves on at the exact boundary, BEFORE this step is
       * scheduled, so the first step of the next loop is already the next
       * track's bar one. */
      if (this.selection === 'rotation' && n >= loopSteps * this.track.loops) {
        this.advance(this.startTime + n * this.stepSeconds);
        continue;
      }
      const t = this.startTime + n * this.stepSeconds;
      if (t >= horizon || guard > loopSteps) {
        break;
      }
      guard += 1;
      if (t >= this.ctx.currentTime - 0.05) {
        this.hit(n % loopSteps, t);
      }
      this.step += 1;
    }
  }

  /* One step of the current track's pattern, scheduled at t. */
  hit(i, t) {
    const tr = this.track;
    const stepS = this.stepSeconds;
    /* The wow: one slow sinusoid, shared by the grid and the sub's pitch,
     * on a period that divides the loop exactly (checked at import). */
    const wowPeriod = tr.wow.periodBars * BAR_STEPS * stepS;
    const phase = (2 * Math.PI * (i * stepS)) / wowPeriod;
    const wob = Math.sin(phase);
    let at = t + tr.wow.seconds * wob;
    /* The swing: every odd sixteenth waits a fraction of a step. Zero on
     * every drum and bass track, a fifth to a third of a step on the lofi
     * ones, which is the whole difference between a grid and a shoulder. */
    if (tr.swing > 0 && (i & 1) === 1) {
      at += tr.swing * stepS;
    }

    /*
     * Attacks are 8 to 12 ms, not 2 to 4. A transient that fast pulls
     * focus, which is the opposite of what a bed someone is concentrating
     * over should do.
     */
    const k = tr.kick[i];
    if (k === '1' || k === 'g') {
      const kt = tr.kickTone;
      const peak = k === '1' ? kt.peak : kt.ghost;
      const g = this.kickGain.gain;
      const f = this.kickOsc.frequency;
      f.cancelScheduledValues(at);
      f.setValueAtTime(kt.start, at);
      f.exponentialRampToValueAtTime(kt.end, at + kt.drop);
      g.cancelScheduledValues(at);
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(peak, at + 0.008);
      g.exponentialRampToValueAtTime(0.0001, at + (k === '1' ? kt.len : kt.ghostLen));
    }

    /*
     * The snare and hats carry the groove. A bandpass on noise at these Q
     * values passes very little energy and the lofi shelf takes more off
     * the top, so the gains here are much larger than they look.
     */
    const sn = tr.snare[i];
    if (sn === '1' || sn === 'g') {
      const st = tr.snareTone;
      const peak = sn === '1' ? st.peak : st.ghost;
      const g = this.snareGain.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(peak, at + 0.008);
      g.linearRampToValueAtTime(0, at + st.len);
    }

    const h = tr.hat[i];
    if (h === '1' || h === 'a' || h === 'g') {
      const ht = tr.hatTone;
      const peak = h === 'a' ? ht.accent : (h === '1' ? ht.tick : ht.tick * 0.5);
      const g = this.hatGain.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(peak, at + 0.004);
      g.linearRampToValueAtTime(0, at + ht.len);
    }

    /*
     * The sub, as a phrase. Each note has its own envelope; the pitch wow
     * rides the same slow sinusoid as the grid. Lofi notes are long and
     * few, drum and bass notes short and answering the kick, and both come
     * straight from the track data.
     */
    const phraseSteps = tr.bass.phraseBars * BAR_STEPS;
    const ph = i % phraseSteps;
    const phrase = tr.bass.phrase;
    for (let n = 0; n < phrase.length; n += 1) {
      if (phrase[n][0] !== ph) {
        continue;
      }
      const cents = tr.wow.cents * wob;
      const hz = tr.bass.rootHz * 2 ** ((phrase[n][1] + cents / 100) / 12);
      const f = this.subOsc.frequency;
      f.cancelScheduledValues(at);
      f.setValueAtTime(hz, at);
      const g = this.subGain.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(tr.bassTone.peak, at + 0.015);
      g.exponentialRampToValueAtTime(0.0001, at + tr.bassTone.noteSteps * stepS);
      const reeseAmt = tr.bassTone.reese || 0;
      if (reeseAmt > 0) {
        for (let r = 0; r < this.reeseOscs.length; r += 1) {
          const rf = this.reeseOscs[r].frequency;
          rf.cancelScheduledValues(at);
          rf.setValueAtTime(hz, at);
        }
        const rg = this.reeseGain.gain;
        rg.cancelScheduledValues(at);
        rg.setValueAtTime(0, at);
        rg.linearRampToValueAtTime(reeseAmt, at + 0.02);
        rg.linearRampToValueAtTime(0, at + tr.bassTone.noteSteps * stepS);
      }
      break;
    }

    /*
     * The pad. Chord changes land on the chord grid. Both modes are
     * events that return to silence: a held sine triad is the persistent
     * tone the owner reported on every track. 'swell' still exists so an
     * old sheet can name it, but it now peaks and dies instead of holding
     * a 0.02 floor across the span. 'pluck' strikes at listed steps.
     */
    const chordSteps = tr.pads.barsPerChord * BAR_STEPS;
    const pos = i % chordSteps;
    if (pos === 0) {
      const chord = tr.chords[Math.floor(i / chordSteps) % tr.chords.length];
      for (let v = 0; v < this.padOscs.length; v += 1) {
        const f = this.padOscs[v].frequency;
        f.cancelScheduledValues(at);
        const semi = padSemitone(chord[v]) + PAD_CENTS[v] / 100;
        f.setValueAtTime(tr.pads.baseHz * 2 ** (semi / 12), at);
      }
    }
    if (tr.pads.mode === 'swell') {
      if (pos === 0) {
        const g = this.padGain.gain;
        const span = chordSteps * stepS;
        const die = Math.min(tr.pads.attack + 0.8, span * 0.4);
        g.cancelScheduledValues(at);
        g.setValueAtTime(Math.max(0.0001, g.value), at);
        g.linearRampToValueAtTime(tr.pads.level, at + tr.pads.attack);
        g.exponentialRampToValueAtTime(0.0001, at + die);
      }
    } else if (tr.pads.strikes.indexOf(pos) >= 0) {
      const g = this.padGain.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(Math.max(0.0001, g.value), at);
      g.linearRampToValueAtTime(tr.pads.level, at + tr.pads.attack);
      g.exponentialRampToValueAtTime(0.0001, at + tr.pads.decay);
    }
  }
}
