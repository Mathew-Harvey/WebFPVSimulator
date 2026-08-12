/*
 * music.js: a lofi drum and bass bed, generated, no samples.
 *
 * The owner's words were "there is not lofi dnb music playing at all", and
 * there was not: the whole audio graph was four sawtooths and a noise bed.
 *
 * Everything here comes out of an OscillatorNode, an AudioBufferSourceNode
 * over noise this file generates, and filters. No external asset, because the
 * licence is GPLv3 and because P6 counts every byte on the way to the first
 * interactive frame.
 *
 * POOLED, NOT PER NOTE. There is exactly one voice per drum and one for the
 * sub bass, each a persistent chain whose gain is enveloped at a scheduled
 * time. A2 asks for pooling by name and forbids creating a node per event and
 * dropping it for the garbage collector, and a leaked node here is a click
 * and then a stall. The node count is fixed the moment attach runs.
 *
 * EXACTLY PERIODIC. The pattern is four bars, the timing and pitch wow are
 * two bars, and the noise buffer is cut to exactly four bars, so the whole
 * bed repeats sample for sample. That is what makes the loop seamless rather
 * than nearly seamless, and it is checkable: render two loop periods and look
 * at the sample delta across the seam.
 *
 * WHERE IT SITS IN THE SPECTRUM. The motor model owns roughly 130 Hz to
 * 900 Hz, because a blade pass fundamental on this plant runs 130 to 430 Hz
 * in flight and its useful harmonics stop just under a kilohertz. So the bed
 * is placed around it: the sub bass and kick below 120 Hz, the snare and hats
 * above 1.5 kHz, and nothing of its own in the motors' octaves. A pilot flies
 * partly on the pitch of the motors, so the bed must not sing in that band.
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

/* 174 BPM, inside the 170 to 176 band drum and bass actually lives in. */
export const BPM = 174;
const BEAT = 60 / BPM;
const STEP = BEAT / 4;          /* a sixteenth */
const BAR_STEPS = 16;
const LOOP_BARS = 4;
const LOOP_STEPS = BAR_STEPS * LOOP_BARS;
export const LOOP_SECONDS = LOOP_STEPS * STEP;

/*
 * The break, as four bars of sixteenths. A two step, which is what drum and
 * bass is built on: kick on the one, kick again on the and of three, snare on
 * two and four, and the syncopation in the ghosts rather than in the kick.
 *
 * 1 a full hit, g a ghost (quieter), . nothing.
 *
 * The GHOST KICK on beat three is there for two reasons that agree. It is a
 * standard drum and bass device, and it is what makes the tempo measurable:
 * with onsets only on beats one, two and four, an onset autocorrelation over
 * a 60 second render locked onto the kick's own six and ten step intervals
 * and put its strongest peak at 116.9 BPM, two thirds of the real tempo and
 * outside the 170 to 176 band. A pulse on all four beats makes the four step
 * period, which IS 174 BPM, the strongest thing in the signal.
 */
const KICK  = '1.......g.1.....1.......g.1...g.1.......g.1.....1.......g.1...g.'.split('');
const SNARE = '....1.......1......g1.......1..g....1.......1......g1.......1..g'.split('');
/*
 * Hats ride the eighths with an accent on every beat. The accent placement is
 * not only musical, it is what makes the tempo MEASURABLE: with hats only on
 * the offbeats and beat three of the bar left empty, an onset autocorrelation
 * over a 60 second render put its strongest peak at 117.6 BPM, which is two
 * thirds of 174 and outside the 170 to 176 band the bed is supposed to be in.
 * A pulse on every beat gives the autocorrelation a beat grid to lock to.
 */
const HAT   = 'a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.'.split('');

/* A pattern that is not exactly one loop long would drift against the wow and
 * against the noise buffer, and the bed would stop being sample periodic,
 * which is the whole basis of the seam being seamless. Checked on load, in
 * the one place where getting it wrong is invisible. */
if (KICK.length !== LOOP_STEPS || SNARE.length !== LOOP_STEPS || HAT.length !== LOOP_STEPS) {
  throw new Error(
    `music: pattern lengths ${KICK.length}, ${SNARE.length}, ${HAT.length} `
    + `must all be ${LOOP_STEPS} steps`,
  );
}

/*
 * The bass line, one root per bar, in semitones from the root. A minor
 * flavour, and small intervals so it stays under 120 Hz where it belongs.
 */
const ROOT_HZ = 55;             /* A1 */
const BASS_SEMIS = [0, 0, -2, 3];

/* Lofi, defined in numbers so it can be measured rather than asserted. */
export const LOFI = {
  /* A high shelf on the whole bed. Dulls the break the way a worn sampler
   * does, and it is the single biggest reason the bed does not fight the
   * motors for the ear's most sensitive octave. */
  shelfHz: 3200,
  shelfDb: -14,
  /* Timing wow: the whole grid breathes by this much, on a two bar period.
   * A machine perfect grid is what makes generated drums sound generated. */
  /* 9 ms smeared the onsets over three and a half flux frames and broadened
   * the autocorrelation peak enough to hide the tempo. 5 ms still breathes
   * and still measures. */
  wowSeconds: 0.005,
  wowPeriodBars: 2,
  /* Pitch wow on the sub bass only, in cents, same period. */
  wowCents: 12,
};

export class Music {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.level = 0.5;
    this.step = 0;          /* next step index to schedule, monotonic */
    this.startTime = 0;
    this.scheduledTo = 0;
  }

  /*
   * Build the bed. keep() is the owner's node tracker, so every node created
   * here is counted against the 64 node budget where it is made.
   */
  attach(ctx, dest, keep) {
    this.ctx = ctx;
    const sr = ctx.sampleRate;

    /* The bus: level, then the duck a cue pulls down, then the lofi shelf. */
    this.gain = keep(ctx.createGain());
    this.gain.gain.value = 0;
    this.duck = keep(ctx.createGain());
    this.duck.gain.value = 1;
    this.shelf = keep(ctx.createBiquadFilter());
    this.shelf.type = 'highshelf';
    this.shelf.frequency.value = LOFI.shelfHz;
    this.shelf.gain.value = LOFI.shelfDb;
    this.gain.connect(this.duck);
    this.duck.connect(this.shelf);
    this.shelf.connect(dest);

    /*
     * One noise buffer, cut to exactly one loop, shared by the snare and the
     * hats. Exactly one loop so the bed is sample periodic and the seam is
     * provably seamless rather than nearly so. Deterministic LCG, the same
     * generator the wind bed uses, so two renders of the same graph agree.
     */
    const len = Math.round(LOOP_SECONDS * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const ch = buf.getChannelData(0);
    let s = 987654321;
    for (let i = 0; i < len; i += 1) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      ch[i] = (s / 0x3fffffff) - 1.0;
    }

    /* Kick: a sine whose pitch drops, which is the whole trick. */
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
    this.subOsc.frequency.value = ROOT_HZ;
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

    /* Snare: band limited noise, centred where a snare's body lives. */
    this.snareSrc = keep(ctx.createBufferSource());
    this.snareSrc.buffer = buf;
    this.snareSrc.loop = true;
    this.snareBp = keep(ctx.createBiquadFilter());
    this.snareBp.type = 'bandpass';
    this.snareBp.frequency.value = 2100;
    this.snareBp.Q.value = 0.9;
    this.snareGain = keep(ctx.createGain());
    this.snareGain.gain.value = 0;
    this.snareSrc.connect(this.snareBp);
    this.snareBp.connect(this.snareGain);
    this.snareGain.connect(this.gain);
    this.snareSrc.start();

    /* Hats: the same noise, high passed. Kept quiet on purpose: this is the
     * band the ear complains about first and the whole point of the round is
     * that the mix stops hurting. */
    this.hatSrc = keep(ctx.createBufferSource());
    this.hatSrc.buffer = buf;
    this.hatSrc.loop = true;
    this.hatHp = keep(ctx.createBiquadFilter());
    this.hatHp.type = 'highpass';
    this.hatHp.frequency.value = 6500;
    this.hatHp.Q.value = 0.7;
    this.hatGain = keep(ctx.createGain());
    this.hatGain.gain.value = 0;
    this.hatSrc.connect(this.hatHp);
    this.hatHp.connect(this.hatGain);
    this.hatGain.connect(this.gain);
    this.hatSrc.start();

    this.startTime = 0;
    this.step = 0;
    this.scheduledTo = 0;
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
    /* 0.34 at full setting. The bed is a bed: it sits under the flight
     * instrument, and this is the number that keeps it there. */
    this.gain.gain.value = this.enabled ? this.level * 0.40 : 0;
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
   * Allocates nothing: all scalars, and the pattern tables are module level.
   */
  tick(atTime) {
    if (!this.ctx || !this.enabled) {
      return;
    }
    if (this.startTime === 0) {
      this.startTime = atTime;
      this.step = 0;
    }
    const LOOKAHEAD = 0.25;
    const horizon = atTime + LOOKAHEAD;
    /* A hard cap so a long stall cannot spin here: at 0.086 s a step, 64
     * steps is five and a half seconds of catch up, which is a whole loop. */
    let guard = 0;
    for (;;) {
      const t = this.startTime + this.step * STEP;
      if (t >= horizon || guard > LOOP_STEPS) {
        break;
      }
      guard += 1;
      if (t >= this.ctx.currentTime - 0.05) {
        this.hit(this.step, t);
      }
      this.step += 1;
    }
  }

  /* One step of the pattern, scheduled at t. */
  hit(step, t) {
    const i = step % LOOP_STEPS;
    /* The wow: one slow sinusoid, shared by the grid and the sub's pitch, on
     * a two bar period so it divides the four bar loop exactly. */
    const wowPeriod = LOFI.wowPeriodBars * BAR_STEPS * STEP;
    const phase = (2 * Math.PI * (i * STEP)) / wowPeriod;
    const wob = Math.sin(phase);
    const at = t + LOFI.wowSeconds * wob;

    const k = KICK[i];
    if (k === '1' || k === 'g') {
      const peak = k === '1' ? 0.62 : 0.3;
      const g = this.kickGain.gain;
      const f = this.kickOsc.frequency;
      f.cancelScheduledValues(at);
      f.setValueAtTime(96, at);
      f.exponentialRampToValueAtTime(44, at + 0.09);
      g.cancelScheduledValues(at);
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(peak, at + 0.004);
      g.exponentialRampToValueAtTime(0.0001, at + (k === '1' ? 0.15 : 0.09));
    }

    const s = SNARE[i];
    if (s === '1' || s === 'g') {
      const peak = s === '1' ? 0.5 : 0.22;
      const g = this.snareGain.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(peak, at + 0.003);
      g.exponentialRampToValueAtTime(0.0001, at + 0.075);
    }

    const h = HAT[i];
    if (h === '1' || h === 'a') {
      const peak = h === 'a' ? 0.24 : 0.08;
      const g = this.hatGain.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(peak, at + 0.002);
      g.exponentialRampToValueAtTime(0.0001, at + 0.035);
    }

    /* The sub takes a new note at the top of every bar and holds it. */
    if (i % BAR_STEPS === 0) {
      const bar = Math.floor(i / BAR_STEPS) % BASS_SEMIS.length;
      const cents = LOFI.wowCents * wob;
      const hz = ROOT_HZ * 2 ** ((BASS_SEMIS[bar] + cents / 100) / 12);
      const f = this.subOsc.frequency;
      f.cancelScheduledValues(at);
      f.setValueAtTime(hz, at);
      const g = this.subGain.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(0.75, at + 0.02);
      /* Held most of the bar, then out, so the kick has room on the one. */
      g.exponentialRampToValueAtTime(0.0001, at + BAR_STEPS * STEP * 0.82);
    }
  }
}
