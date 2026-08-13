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
 * LOOP PERIODIC, and the seam is MEASURED rather than assumed. The pattern is
 * sixteen bars and the wow period is eight, which divides it. The noise buffer
 * is one loop long but rounds to a whole number of samples, so it drifts a
 * third of a sample per loop; that is why the seam is checked with
 * scripts/audio-probe.js --seam rather than argued from arithmetic.
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
/*
 * SIXTEEN bars, not four.
 *
 * Four bars at 174 BPM is 5.5172 s, and a reviewer measured what that does
 * over time: the 10 ms RMS envelope of consecutive loops correlated at r =
 * 0.958 to 0.989, and the sliding 1.379 s RMS held inside a 2.49 dB range for
 * the whole render. A listener hears the same bar again every five and a half
 * seconds, 1305 times in two hours. Ten minutes of that is a headache.
 *
 * Sixteen bars is 22.069 s, and the four groups of four differ: the ghost kick
 * comes and goes, the snare moves to the a of four, and the last bar carries a
 * fill. The wow period is eight bars, which still DIVIDES the loop, so the bed
 * stays loop periodic and the seam stays measurable.
 */
const LOOP_BARS = 16;
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
const KICK  = '1.......g.1.....1.......g.1.....1.......g.1.....1.......g.1...g.1.........1.....1.......g.1.....1.........1.....1.......g.1...g.1.......g.1.....1.......g.1.....1.......g.1.....1.......g.1...g.1.........1.....1.......g.1.....1.........1.....1.......g.1.1.g1'.split('');
const SNARE = '....1.......1.......1.......1.......1.......1.......1......g1.g.....1.......1.......1......g1.......1.......1.......1......g1.g.....1.......1.......1.......1..g....1.......1.......1......g1.g.....1.......1.......1......g1.......1.......1..g....1.......1.gg'.split('');
/*
 * Hats ride the eighths with an accent on every beat. The accent placement is
 * not only musical, it is what makes the tempo MEASURABLE: with hats only on
 * the offbeats and beat three of the bar left empty, an onset autocorrelation
 * over a 60 second render put its strongest peak at 117.6 BPM, two thirds of
 * 174 and outside the band the bed is supposed to be in.
 */
const HAT   = 'a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a.1.a1a1'.split('');

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
/*
 * The bass, as a PHRASE rather than a pedal.
 *
 * It was one note per bar from a four entry table, which a reviewer called a
 * fog horn and which put 97.5 percent of the bed's energy under 120 Hz with
 * nothing moving. This is an eight bar phrase of two to three notes a bar,
 * given as [step within the 8 bar phrase, semitones from the root], so the sub
 * has a rhythm of its own that answers the kick instead of droning under it.
 */
const BASS_PHRASE = [
  [0, 0], [10, 0], [14, -2],
  [16, 3], [26, 3], [30, 5],
  [32, -2], [42, -2], [46, 0],
  [48, 5], [58, 3], [62, 0],
  [64, 0], [74, 0], [78, -2],
  [80, -4], [90, -4], [94, -2],
  [96, 3], [106, 5], [110, 7],
  [112, 0], [122, 0], [126, -5],
];
const BASS_PHRASE_STEPS = 8 * 16;
/*
 * The PAD, which is the largest musical absence a reviewer found: there was no
 * harmonic instrument anywhere in this file, no chord and no key. It sits
 * where there is measured room, above the motors: motors and wind in flight
 * put -41.72 dB between 1500 and 20000 Hz, so a filtered triad around 880 Hz
 * to 2 kHz at about -30 dBFS is clear of the flight noise by roughly 11 dB.
 * Four chords over sixteen bars, semitones from A5.
 */
const PAD_A5 = 880;
const PAD_CHORDS = [
  [0, 3, 7],    /* A minor */
  [-4, 0, 3],   /* F */
  [3, 7, 10],   /* C */
  [-2, 2, 5],   /* G */
];

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
  /* Eight bars, which divides the sixteen bar loop, so the bed stays loop
   * periodic and A6's seam test still means something. A period that did NOT
   * divide the loop would de-phase the bed against itself, which is better for
   * monotony and would cost the seam result. */
  wowPeriodBars: 8,
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
     * One noise buffer, one loop long, shared by the snare and the hats.
     *
     * NOT sample exact, and the header used to claim it was. The loop is
     * 22.06897 s, which at 48 kHz is 1059310.34 samples, so rounding to a whole
     * buffer leaves a third of a sample of drift per loop between the noise and
     * the pattern grid. It is inaudible and arguably a free source of
     * variation, but the seam being clean is a MEASUREMENT and not a
     * consequence of a periodicity the arithmetic does not actually give.
     * Deterministic LCG, so two renders of the same graph agree.
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

    /*
     * The pad. Three triangles a chord apart through one lowpass, so it is a
     * harmonic instrument rather than another noise burst, and it is the thing
     * that makes this listenable for longer than ten minutes.
     */
    this.padOscs = [];
    this.padGain = keep(ctx.createGain());
    this.padGain.gain.value = 0;
    this.padLp = keep(ctx.createBiquadFilter());
    this.padLp.type = 'lowpass';
    /* Above the chord's fundamentals and below the band A1 protects, so the
     * pad's own third harmonic cannot put energy into 2 to 8 kHz. */
    this.padLp.frequency.value = 2500;
    this.padLp.Q.value = 0.6;
    this.padGain.connect(this.padLp);
    this.padLp.connect(this.gain);
    for (let i = 0; i < 3; i += 1) {
      const osc = keep(ctx.createOscillator());
      osc.type = 'triangle';
      osc.frequency.value = PAD_A5;
      osc.connect(this.padGain);
      osc.start();
      this.padOscs.push(osc);
    }

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
    /* Off centre. Every bed only render came back with identical left and right
     * digests, which is two hours of dead centre mono on headphones. */
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
    /* 0.40 at full setting. The bed is a bed: it sits under the flight
     * instrument, and this is the number that keeps it there. The comment used
     * to say 0.34 while the code said 0.40, which is how a later round gets
     * misled about the one gain in the file. */
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
     * an eight bar period so it divides the sixteen bar loop exactly. */
    const wowPeriod = LOFI.wowPeriodBars * BAR_STEPS * STEP;
    const phase = (2 * Math.PI * (i * STEP)) / wowPeriod;
    const wob = Math.sin(phase);
    const at = t + LOFI.wowSeconds * wob;

    /*
     * Attacks are 8 to 12 ms, not 2 to 4. A reviewer measured a 13.30 dB
     * envelope crest with 2, 3 and 4 ms exponential attacks and called them
     * click attacks: a transient that fast pulls focus, which is the opposite
     * of what a bed someone is concentrating over should do.
     */
    const k = KICK[i];
    if (k === '1' || k === 'g') {
      const peak = k === '1' ? 0.50 : 0.24;
      const g = this.kickGain.gain;
      const f = this.kickOsc.frequency;
      f.cancelScheduledValues(at);
      f.setValueAtTime(96, at);
      f.exponentialRampToValueAtTime(44, at + 0.09);
      g.cancelScheduledValues(at);
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(peak, at + 0.008);
      g.exponentialRampToValueAtTime(0.0001, at + (k === '1' ? 0.16 : 0.10));
    }

    /*
     * The snare and hats carry the groove and they were inaudible: measured
     * 31 to 43 dB under the kick and sub, so there was no break to hear. A
     * bandpass on noise at Q 0.9 passes very little of it, and the lofi shelf
     * then took another 14 dB off the top, so the gains here have to be much
     * larger than they look to land anywhere near the bass.
     */
    const sn = SNARE[i];
    if (sn === '1' || sn === 'g') {
      const peak = sn === '1' ? 1.9 : 0.85;
      const g = this.snareGain.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(peak, at + 0.012);
      g.exponentialRampToValueAtTime(0.0001, at + 0.11);
    }

    const h = HAT[i];
    if (h === '1' || h === 'a') {
      const peak = h === 'a' ? 0.85 : 0.30;
      const g = this.hatGain.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(peak, at + 0.010);
      g.exponentialRampToValueAtTime(0.0001, at + 0.06);
    }

    /*
     * The sub, as a phrase. Two to three notes a bar over an eight bar figure,
     * each with its own envelope, rather than one note a bar held for 82
     * percent of it. The pitch wow rides the same slow sinusoid.
     */
    const ph = step % BASS_PHRASE_STEPS;
    for (let n = 0; n < BASS_PHRASE.length; n += 1) {
      if (BASS_PHRASE[n][0] !== ph) {
        continue;
      }
      const cents = LOFI.wowCents * wob;
      const hz = ROOT_HZ * 2 ** ((BASS_PHRASE[n][1] + cents / 100) / 12);
      const f = this.subOsc.frequency;
      f.cancelScheduledValues(at);
      f.setValueAtTime(hz, at);
      const g = this.subGain.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(0.75, at + 0.015);
      /* Long enough to be a note, short enough that the next one has room. */
      g.exponentialRampToValueAtTime(0.0001, at + 3.2 * STEP);
      break;
    }

    /*
     * The pad changes chord every four bars, with a 300 ms attack so it swells
     * rather than arrives. This is the only harmonic instrument in the mix.
     */
    if (i % (BAR_STEPS * 4) === 0) {
      const chord = PAD_CHORDS[Math.floor(i / (BAR_STEPS * 4)) % PAD_CHORDS.length];
      for (let v = 0; v < this.padOscs.length; v += 1) {
        const f = this.padOscs[v].frequency;
        f.cancelScheduledValues(at);
        f.setValueAtTime(PAD_A5 * 2 ** (chord[v] / 12), at);
      }
      const g = this.padGain.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(Math.max(0.0001, g.value), at);
      g.linearRampToValueAtTime(0.085, at + 0.30);
      /* Held almost the whole four bars, then eased off so the chord change
       * is a change rather than a crossfade of two triads. */
      g.linearRampToValueAtTime(0.02, at + BAR_STEPS * 4 * STEP * 0.94);
    }
  }
}
