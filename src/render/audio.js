/*
 * audio.js: motor noise as a flight instrument, and a mix around it.
 *
 * Pilots fly quads by ear as much as by eye: the blade pass tone tells you
 * what the throttle is doing before the picture does, and the beat between
 * four slightly different motor speeds is what makes a quad sound like a
 * quad instead of a drone. So this is per motor, driven by that motor's own
 * RPM, not a single throttle-scaled loop.
 *
 * THE MOTOR REGISTER, and why it is low. An earlier round's graph put the
 * oscillators in the kilohertz range with square partials to 8 kHz, and the
 * owner called it loud screaming. The fundamental IS the blade pass
 * frequency now, motor RPM over 60 times the blade count, which on this
 * plant is 130 to 430 Hz in flight: a hum with body rather than a saw in
 * the presence band. A chosen periodic wave through a lowpass whose corner
 * tracks the fundamental but is CAPPED gives the harmonics that make it
 * read as a motor and nothing above them. An earlier round lowered the cap
 * from 1150 to 1000 Hz and the default motor stem from 0.6 to 0.5, in the
 * owner's words "low softened quiet, not obtrusive", which is also how the
 * shipping simulators mix it: motors just audible under the wind, never
 * the loudest thing in the render.
 *
 * IT WAS STILL THE LOUDEST THING IN THE RENDER. On a flight trace the
 * motor stem measured -18.45 dBFS against the music's -28.34 and the
 * wind's -32.99, so every one of those claims was aspiration rather than
 * measurement, and the owner came back with a number: the motors need to be
 * about 70 percent quieter than the music. 70 percent quieter in amplitude
 * is a factor of 0.3, so 10.5 dB of RATIO, and it is split rather than
 * taken all from one side: 4.0 dB off the motor voice gains here, 6.5 dB on
 * to the bed in music.js. The split is forced. The motors were carrying
 * the mix's loudness, and taking the whole 10.5 dB off them alone measured
 * a flight render at -24.7 dBFS, outside the -20 to -14 dBFS band the
 * loudness bar asks for. Every figure is in PROGRESS.md either side of
 * the change. The flight instrument survives because the information is
 * in the PITCH, which is untouched.
 *
 * THE AMBIENCE IS GONE. It was a looped lowpassed-noise buffer with a
 * handful of sine birds, and the owner heard it as a hum. The stem, the
 * bake, the settings row and the airspeed fade are all removed. A saved
 * ambienceLevel is ignored.
 *
 * MOTORS AND WIND, 70 PERCENT DOWN. Applied on the stem buses as
 * FLIGHT_STEM 0.3, so a Motors or Wind setting of 5 is the same ratio
 * it always was, just 10.5 dB quieter against the music. The blade pass
 * pitch and the 6 dB throttle span are the voice law, not the bus, and
 * they do not move.
 *
 * THE CUES. A gate pass is a satisfying CLICK now, a knuckle of filtered
 * noise over a falling tick, not a synth blip; a frame graze is the same
 * family an octave and a half down, so the reward and the penalty cannot
 * be confused. The menu makes small clicks of the same family through
 * ui(). All of it runs on the two pooled cue voices that already existed:
 * no event creates a node.
 *
 * The rest of the mix is built around the motor band: src/render/music.js
 * and its record crate in tracks.js keep every track's sub bass and kick
 * below 120 Hz, its snare and hats above 1.5 kHz, and its keys between
 * 524 and 1320 Hz, clear of the blade pass fundamental at every throttle
 * setting. The keys used to run to 2 kHz and that is where the owner
 * heard a high pitched annoying overtone; the argument for moving them is
 * in tracks.js, at the band split itself.
 *
 * The graph is built by attach(ctx), which takes any BaseAudioContext, and
 * update() takes the time to schedule at. Both exist so that
 * scripts/audio-probe.js can build this exact graph on an
 * OfflineAudioContext, drive it from a scripted RPM trace, and render it to a
 * buffer an FFT can read. A claim about the mix with no rendered buffer
 * behind it is a claim about nothing, and there is no way to hear this
 * container. The live path passes no time and reads ctx.currentTime, which is
 * what it did before.
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

import { Music } from './music.js';

/*
 * Three blades, because the prop this plant is built around is a 5 x 4.3 x 3,
 * and the blade pass frequency is what a quad's fundamental IS: each blade
 * passing a fixed point pushes one pressure pulse, so a three blade prop at
 * N revolutions per minute radiates at 3N/60 Hz.
 */
const BLADES = 3;

/*
 * The motor lowpass tracks the fundamental so the timbre holds across the
 * throttle range, but it is capped, and the cap is the single number that
 * decides whether this mix hurts. 1000 Hz keeps at most the first six
 * harmonics of a 165 Hz hover tone and nothing at all in the 2 to 8 kHz band
 * the ear complains about first. It was 1150; the owner asked for softer
 * still, and dropping the cap is the honest way to do it because it takes
 * edge off the timbre without touching the pitch the pilot flies on.
 */
const MOTOR_LP_TRACK = 3.4;
const MOTOR_LP_CAP = 1000;
const MOTOR_LP_FLOOR = 220;
/*
 * Below this the motor stem is silent. A stationary quad was not quiet: with
 * the oscillator floored at 20 Hz and a 0.119 idle gain, the title screen
 * measured -21.5 dBFS of 20 to 46 Hz drone, which is louder than the entire
 * music bed at maximum and sits directly on top of the bass line. No headphone
 * reproduces it as pitch, so it was pure wasted headroom.
 */
const MOTOR_MUTE_RPM = 600;
/*
 * The motor voice as a chosen spectrum rather than a filtered sawtooth.
 *
 * A sawtooth through two lowpasses gave harmonics at exact integer multiples
 * with the first three within 7.5 dB of each other and nothing modulating
 * them, which a reviewer correctly called a nasal synth buzz rather than air
 * being moved. These are the amplitudes a blade pass tone actually wants, with
 * the phases scrambled across real and imaginary so the waveform is not a
 * sawtooth's sharp ramp. Magnitudes come out at 1.0, 0.50, 0.28, 0.10, 0.04.
 */
const MOTOR_WAVE_REAL = [0, 0.0, 0.35, -0.10, 0.06, -0.02];
const MOTOR_WAVE_IMAG = [0, 1.0, -0.36, 0.26, -0.08, 0.03];
/*
 * How far the blade pass tone wanders, in cents, driven by slow noise. Real
 * blades do not pass at mathematically constant intervals, and this is the
 * difference between a synthesiser and a motor.
 */
const MOTOR_DETUNE_CENTS = 5.2;

/*
 * The binaural focus tone. 6 Hz is in the theta band, 4 to 8 Hz, and 220 Hz
 * is the carrier, chosen high enough to sit above the motor fundamental's
 * hover range and low enough that a binaural difference is a difference of
 * carriers rather than of overtones. It is off by default, it is a setting,
 * and the interface says it needs headphones and claims nothing else.
 */
const MASTER_CEILING = 0.85;
/*
 * 1000 Hz, not 220 Hz, and the move is forced by a measurement.
 *
 * At 220 Hz the carrier sat inside the blade pass tone's own range. At hover
 * the left ear's motors run 209.4 and 211.7 Hz, 8 to 11 Hz from a 220 Hz
 * carrier, and a reviewer measured what that does: switching the focus tone on
 * raised the LEFT EAR'S OWN monaural amplitude modulation at 8.3 Hz by
 * 17.66 dB, to 10.8 percent depth. A binaural tone whose whole point is that
 * neither ear hears a modulation was generating a tremolo in one ear. It was
 * also 14.6 dB below the motor content in its own third octave, so it was
 * inaudible as a tone while being audible as an artefact.
 *
 * 1000 Hz is clear of the fundamental at every throttle setting and clear of
 * its second harmonic at full throttle, and it is below the 2 kHz floor of the
 * band A1 protects. Binaural beating is less effective this high, which is a
 * real cost, and it is the cost of not injecting a tremolo.
 */
const FOCUS_CARRIER_HZ = 1000;
const FOCUS_BEAT_HZ = 6;

/*
 * Keep 30 percent of the motor and wind stems. The owner asked to drop
 * both by 70 percent, relative to the rest of the mix. Applied on the
 * stem buses so the RPM-to-gain law, the 6 dB throttle span, and the
 * pitch the pilot flies on are untouched. Music and cues do not ride
 * these buses.
 */
const FLIGHT_STEM = 0.3;

export class MotorAudio {
  constructor() {
    this.ctx = null;
    this.motors = [];
    this.enabled = false;
    this.master = null;
    this.noiseGain = null;
    this.level = 0.5; /* mix level, driven by the volume setting */
    /* Per stem, each 0 to 1, driven by their own settings rows. These
     * mirror the DEFAULTS in src/ui/ui.js divided by ten, and the probe
     * measures at exactly these values when no mix argument is given. */
    this.mix = { motors: 0.5, wind: 0.5, music: 0.5, focus: 1, ambience: 0 };
    this.focusOn = false;
    this.music = new Music();
    /* Every AudioNode this instance owns, for P12. A node created and
     * dropped without being counted is exactly the leak P12 forbids, so
     * the count is kept where the nodes are made rather than derived by
     * reading the file later. */
    this.nodes = [];
  }

  /* P12: steady state AudioNode count. */
  nodeCount() {
    return this.nodes.length;
  }

  /* Volume from the settings screen, zero to one. */
  setLevel(v) {
    this.level = Math.max(0, Math.min(1, v));
  }

  setEnabled(on) {
    this.enabled = Boolean(on) && Boolean(this.ctx);
  }

  /*
   * Per stem levels. Any subset; a missing key is left alone. Each one has
   * to make a MEASURABLE difference in the probe output, so each lands on a
   * real bus gain rather than on a label.
   */
  setMix(m) {
    if (!m) {
      return;
    }
    if (typeof m.motors === 'number') {
      this.mix.motors = Math.max(0, Math.min(1, m.motors));
    }
    if (typeof m.wind === 'number') {
      this.mix.wind = Math.max(0, Math.min(1, m.wind));
    }
    if (typeof m.music === 'number') {
      this.mix.music = Math.max(0, Math.min(1, m.music));
      this.music.setLevel(this.mix.music);
    }
    if (typeof m.focus === 'number') {
      this.mix.focus = Math.max(0, Math.min(1, m.focus));
    }
    if (typeof m.ambience === 'number') {
      /* Kept so the probe can still name the stem. Always silent. */
      this.mix.ambience = 0;
    }
    this.applyBuses();
  }

  setMusicEnabled(on) {
    this.music.setEnabled(on);
  }

  /* Which music track, or 'rotation' for the whole crate in order. A
   * setting, safe before attach: the player object holds it as data. */
  setMusicTrack(sel) {
    this.music.setTrack(sel);
  }

  setFocusEnabled(on) {
    this.focusOn = Boolean(on);
    this.applyBuses();
  }

  applyBuses() {
    if (!this.motorBus) {
      return;
    }
    this.motorBus.gain.value = this.mix.motors * FLIGHT_STEM;
    this.windBus.gain.value = this.mix.wind * FLIGHT_STEM;
    /* The focus tone is quiet on purpose. It is a tone under a mix, not a
     * test signal, and two steady carriers at any real level would mask the
     * flight instrument. */
    this.focusBus.gain.value = this.focusOn ? this.mix.focus * 0.15 : 0;
  }

  /* Browsers require a user gesture before audio starts. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      this.enabled = true;
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return;
    }
    this.attach(new Ctx());
    this.enabled = true;
  }

  /*
   * Build the graph on any BaseAudioContext. Called by start() with a live
   * AudioContext and by the probe with an OfflineAudioContext. Does not
   * set enabled: the caller decides, because the probe wants the mix up
   * from sample zero and the shell wants it to follow a setting.
   */
  attach(ctx, destination) {
    this.ctx = ctx;
    const out = destination || ctx.destination;
    /* One place where nodes come into existence, so the P12 count cannot
     * drift from the graph. */
    const keep = (n) => {
      this.nodes.push(n);
      return n;
    };

    /*
     * Master, and a soft clip in front of it.
     *
     * A3 wants a normal flight render between -20 and -14 dBFS with a true
     * peak below -1 and not one sample at or over full scale, and the mix now
     * has four stems and two one shot cues that can all peak together. A soft
     * knee at the end is what makes that hold at every stem setting instead
     * of only at the ones that were measured.
     */
    const shaper = keep(ctx.createWaveShaper());
    const CURVE = 1024;
    const curve = new Float32Array(CURVE);
    for (let i = 0; i < CURVE; i += 1) {
      const x = (i / (CURVE - 1)) * 2 - 1;
      /* tanh, normalised so the curve still passes through plus and minus
       * one: linear to about half scale, then bending. */
      curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const master = keep(ctx.createGain());
    master.gain.value = 0.0;
    shaper.connect(master);
    master.connect(out);
    this.master = master;
    this.preMaster = shaper;

    /* Stem buses. Everything a setting can move lands on one of these. */
    /*
     * The flight duck. A cue used to duck the MUSIC, and the music was the one
     * stem that never masked anything: enabling the bed changes a full throttle
     * render's total RMS by 0.014 dB, because it sits 26 dB below the motors.
     * What masks a cue is the motors and the wind, so those are what a cue
     * ducks now. Measured before the change: a gate cue had -0.13 dB of
     * advantage over its own masking and a crash had -17.29 dB, so on a full
     * throttle crash the player was told nothing at all.
     */
    const flightDuck = keep(ctx.createGain());
    flightDuck.gain.value = 1;
    flightDuck.connect(shaper);
    this.flightDuck = flightDuck;

    const motorBus = keep(ctx.createGain());
    motorBus.gain.value = this.mix.motors * FLIGHT_STEM;
    /* Nothing below 60 Hz from the motors. The blade pass fundamental is
     * 130 Hz at the bottom of the flight range, so everything this removes is
     * either the idle drone or rumble no headphone renders as pitch, and it is
     * exactly the band the bass line needs. */
    const motorHp = keep(ctx.createBiquadFilter());
    motorHp.type = 'highpass';
    motorHp.frequency.value = 60;
    motorHp.Q.value = 0.7;
    motorBus.connect(motorHp);
    motorHp.connect(flightDuck);
    this.motorBus = motorBus;
    const windBus = keep(ctx.createGain());
    windBus.gain.value = this.mix.wind * FLIGHT_STEM;
    windBus.connect(flightDuck);
    this.windBus = windBus;
    const focusBus = keep(ctx.createGain());
    focusBus.gain.value = 0;
    focusBus.connect(shaper);
    this.focusBus = focusBus;

    /*
     * One slow noise source feeding every motor's detune, so the blade pass
     * tone wanders instead of sitting on an exact frequency. One buffer and one
     * gain rather than one per motor, which costs two nodes instead of five;
     * the wobble is therefore common in CENTS across the four, and since each
     * motor runs at its own RPM the resulting frequency deviation still
     * differs. Correlated wobble is the honest cost of the node budget.
     */
    const dLen = Math.floor(ctx.sampleRate * 4);
    const dBuf = ctx.createBuffer(1, dLen, ctx.sampleRate);
    const dCh = dBuf.getChannelData(0);
    let ds = 24680;
    let dSmooth = 0;
    for (let i = 0; i < dLen; i += 1) {
      ds = (ds * 1103515245 + 12345) & 0x7fffffff;
      /* One pole smoothing so the detune wanders over tenths of a second
       * rather than buzzing: a fast random detune is just noise. */
      dSmooth += 0.0009 * (((ds / 0x3fffffff) - 1.0) - dSmooth);
      dCh[i] = dSmooth * 12;
    }
    const detuneSrc = keep(ctx.createBufferSource());
    detuneSrc.buffer = dBuf;
    detuneSrc.loop = true;
    const detuneGain = keep(ctx.createGain());
    detuneGain.gain.value = MOTOR_DETUNE_CENTS;
    detuneSrc.connect(detuneGain);
    detuneSrc.start();

    const motorWave = ctx.createPeriodicWave(
      new Float32Array(MOTOR_WAVE_REAL),
      new Float32Array(MOTOR_WAVE_IMAG),
    );
    for (let m = 0; m < 4; m += 1) {
      const osc = keep(ctx.createOscillator());
      osc.setPeriodicWave(motorWave);
      osc.frequency.value = 120;
      detuneGain.connect(osc.detune);
      /* One lowpass now, not two. The spectrum is chosen rather than carved
       * out of a sawtooth, so there is almost nothing above the fifth harmonic
       * to remove and a single pole is enough of a safety net. */
      const lp1 = keep(ctx.createBiquadFilter());
      lp1.type = 'lowpass';
      lp1.frequency.value = 600;
      lp1.Q.value = 0.7;
      const gain = keep(ctx.createGain());
      gain.gain.value = 0.0;
      /* Spread the four motors across the stereo field so the beating
       * between them is audible, the way it is behind real goggles. */
      const pan = ctx.createStereoPanner ? keep(ctx.createStereoPanner()) : null;
      if (pan) {
        pan.pan.value = [0.45, 0.32, -0.45, -0.32][m];
      }
      osc.connect(lp1);
      lp1.connect(gain);
      if (pan) {
        gain.connect(pan);
        pan.connect(motorBus);
      } else {
        gain.connect(motorBus);
      }
      osc.start();
      this.motors.push({ osc, lp1, gain });
    }

    /* Air rush: one second of deterministic noise, looped. Lowpassed, not
     * bandpassed: a bandpass on noise is a whistle, and what a pilot hears
     * at speed is broadband air. */
    const len = Math.floor(ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i += 1) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      ch[i] = (s / 0x3fffffff) - 1.0;
    }
    const noise = keep(ctx.createBufferSource());
    noise.buffer = buf;
    noise.loop = true;
    const nf = keep(ctx.createBiquadFilter());
    nf.type = 'lowpass';
    nf.frequency.value = 900;
    nf.Q.value = 0.6;
    const ng = keep(ctx.createGain());
    ng.gain.value = 0.0;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(windBus);
    noise.start();
    this.noiseGain = ng;

    /*
     * The binaural focus tone: one carrier per ear, differing by the beat
     * frequency, merged so the left oscillator reaches only the left channel
     * and the right only the right. That separation is the whole thing: a
     * monaural beat puts both carriers in both ears and each ear hears the
     * modulation, while a binaural beat gives each ear one steady tone and
     * neither ear hears any modulation at all.
     *
     * Note for anyone measuring this: the mono SUM of a binaural pair does
     * beat, because two carriers a few Hz apart added together are an
     * amplitude modulation at their difference by simple trigonometry. The
     * discriminator is per channel absence, not mono sum absence. The
     * derivation is in .loop/threshold-disputes.md entry 5.
     */
    const merger = keep(ctx.createChannelMerger(2));
    this.focusOscs = [];
    for (let e = 0; e < 2; e += 1) {
      const osc = keep(ctx.createOscillator());
      osc.type = 'sine';
      osc.frequency.value = FOCUS_CARRIER_HZ + (e === 1 ? FOCUS_BEAT_HZ : 0);
      const g = keep(ctx.createGain());
      g.gain.value = 0.5;
      osc.connect(g);
      g.connect(merger, 0, e);
      osc.start();
      this.focusOscs.push(osc);
    }
    merger.connect(focusBus);

    /*
     * One shot cues, pooled: a persistent oscillator and a persistent noise
     * chain, shared by the gate and graze clicks, the landing and takeoff
     * blips, the crash, and the menu's ui() taps. Nothing is created per
     * event, which is what A10 asks for by name.
     *
     * They go in AHEAD of the soft clip but not through a stem bus, because
     * a cue the player has turned down is a cue that costs them a race.
     */
    const cueOsc = keep(ctx.createOscillator());
    cueOsc.type = 'triangle';
    cueOsc.frequency.value = 880;
    const cueGain = keep(ctx.createGain());
    cueGain.gain.value = 0;
    cueOsc.connect(cueGain);
    cueGain.connect(shaper);
    cueOsc.start();
    this.cueOsc = cueOsc;
    this.cueGain = cueGain;

    const crashSrc = keep(ctx.createBufferSource());
    crashSrc.buffer = buf;
    crashSrc.loop = true;
    const crashLp = keep(ctx.createBiquadFilter());
    crashLp.type = 'lowpass';
    crashLp.frequency.value = 1400;
    crashLp.Q.value = 1.1;
    const crashGain = keep(ctx.createGain());
    crashGain.gain.value = 0;
    crashSrc.connect(crashLp);
    crashLp.connect(crashGain);
    crashGain.connect(shaper);
    crashSrc.start();
    this.crashGain = crashGain;
    this.crashLp = crashLp;

    /* The bed. It brings its own nodes and counts them through keep. */
    this.music.attach(ctx, shaper, keep);
    this.music.setLevel(this.mix.music);
    this.applyBuses();
  }

  toggle() {
    if (!this.ctx) {
      this.start();
      return this.enabled;
    }
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /*
   * A one shot cue. kind is 'crash', 'gate', 'clip', 'land' or 'takeoff'.
   * Safe to call before attach, and it creates no nodes: every cue is an
   * envelope on a voice that already exists.
   *
   * A cue also ducks the bed, which is what keeps it audible with everything
   * else at maximum.
   */
  event(kind, atTime) {
    if (!this.ctx || !this.cueGain) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    if (kind === 'crash') {
      const g = this.crashGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      /*
       * A crash is broadband and low, so it lands in the same 200 to 1800 Hz
       * region the motors own, which means ducking the motors also removes the
       * band the crash lives in. Measured at 0.85 the crash raised its own band
       * by 0.03 dB at maximum stems, and with the duck in place it read 0.81 dB
       * DOWN: the mix got quieter and nothing arrived. The cue has to carry the
       * level itself. The soft clip and MASTER_CEILING bound what this can do
       * to the true peak.
       */
      g.exponentialRampToValueAtTime(2.6, t + 0.006);
      g.exponentialRampToValueAtTime(0.0001, t + 0.42);
      const f = this.crashLp.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(1800, t);
      f.exponentialRampToValueAtTime(220, t + 0.4);
      /* The click cues lean on this filter's Q, so a crash states its own
       * rather than inheriting whatever the last click left. */
      this.crashLp.Q.cancelScheduledValues(t);
      this.crashLp.Q.setValueAtTime(1.1, t);
      /* Duck the MOTORS and the WIND, which are what mask a crash, and duck
       * them hard: a crash is the one moment the player must not miss. */
      this.duckFlight(t, 0.28, 0.5);
      this.music.duckNow(t, 0.25, 0.55);
      return;
    }
    if (kind === 'gate' || kind === 'clip') {
      /*
       * The gate click, which the owner asked for by feel: a satisfying
       * click, not a beep. Two layers on the two pooled voices. The crash
       * chain plays a resonant knuckle of noise a few tens of milliseconds
       * long, and the cue oscillator drops through it like a tongue click.
       * 'clip', the frame graze penalty, is the same gesture an octave and
       * a half down with a duller filter: unmistakably the same family,
       * unmistakably not the reward.
       *
       * The click's energy sits between 2 and 5 kHz where the motors (capped
       * at 1 kHz) and the wind (lowpassed at 900 Hz) have nothing, which is
       * why it reads through a full throttle mix with a LIGHTER duck than
       * the old blip needed.
       */
      const gate = kind === 'gate';
      const nf = this.crashLp.frequency;
      nf.cancelScheduledValues(t);
      nf.setValueAtTime(gate ? 4200 : 900, t);
      this.crashLp.Q.cancelScheduledValues(t);
      this.crashLp.Q.setValueAtTime(gate ? 1.6 : 0.8, t);
      const ng = this.crashGain.gain;
      ng.cancelScheduledValues(t);
      ng.setValueAtTime(0.0001, t);
      ng.exponentialRampToValueAtTime(gate ? 1.35 : 1.1, t + 0.002);
      ng.exponentialRampToValueAtTime(0.0001, t + (gate ? 0.045 : 0.11));
      const f = this.cueOsc.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(gate ? 1500 : 300, t);
      f.exponentialRampToValueAtTime(gate ? 720 : 170, t + (gate ? 0.03 : 0.06));
      const g = this.cueGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(gate ? 0.75 : 0.6, t + 0.003);
      g.exponentialRampToValueAtTime(0.0001, t + (gate ? 0.075 : 0.12));
      this.duckFlight(t, gate ? 0.55 : 0.5, gate ? 0.22 : 0.3);
      this.music.duckNow(t, gate ? 0.5 : 0.45, gate ? 0.25 : 0.3);
      return;
    }
    /* The blips. A landing is a low settle, a takeoff is a rising pair. */
    let hz = 620;
    let dur = 0.14;
    if (kind === 'land') {
      hz = 400;
      dur = 0.16;
    }
    const f = this.cueOsc.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(hz, t);
    if (kind === 'takeoff') {
      f.exponentialRampToValueAtTime(hz * 1.6, t + dur);
    }
    const g = this.cueGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(0.62, t + 0.004);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
    this.duckFlight(t, 0.66, 0.26);
    this.music.duckNow(t, 0.6, 0.3);
  }

  /*
   * Menu sounds: the same click family as the gate, small and dry. kind is
   * 'move', 'adjust', 'select' or 'back'. Runs on the same two pooled cue
   * voices, so it creates nothing; it never ducks anything, because a menu
   * is not a race. Quiet by design: these are fingernail taps, and the row
   * under the pointer is the loudest thing a menu should ever say.
   */
  ui(kind) {
    if (!this.ctx || !this.cueGain || !this.enabled) {
      return;
    }
    const t = this.ctx.currentTime;
    let oscHz = 1900;
    let oscTo = 0;
    let oscPeak = 0.085;
    let oscDur = 0.030;
    let nHz = 5200;
    let nPeak = 0.10;
    let nDur = 0.016;
    if (kind === 'select') {
      oscHz = 1350;
      oscTo = 850;
      oscPeak = 0.16;
      oscDur = 0.055;
      nHz = 4400;
      nPeak = 0.18;
      nDur = 0.028;
    } else if (kind === 'adjust') {
      oscHz = 2100;
      oscPeak = 0.10;
      oscDur = 0.035;
      nPeak = 0.12;
      nDur = 0.018;
    } else if (kind === 'back') {
      oscHz = 950;
      oscTo = 700;
      oscPeak = 0.12;
      oscDur = 0.05;
      nHz = 3400;
      nDur = 0.022;
    }
    const nf = this.crashLp.frequency;
    nf.cancelScheduledValues(t);
    nf.setValueAtTime(nHz, t);
    this.crashLp.Q.cancelScheduledValues(t);
    this.crashLp.Q.setValueAtTime(1.3, t);
    const ng = this.crashGain.gain;
    ng.cancelScheduledValues(t);
    ng.setValueAtTime(0.0001, t);
    ng.exponentialRampToValueAtTime(nPeak, t + 0.0015);
    ng.exponentialRampToValueAtTime(0.0001, t + nDur);
    const f = this.cueOsc.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(oscHz, t);
    if (oscTo > 0) {
      f.exponentialRampToValueAtTime(oscTo, t + oscDur * 0.6);
    }
    const g = this.cueGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(oscPeak, t + 0.002);
    g.exponentialRampToValueAtTime(0.0001, t + oscDur);
  }

  /*
   * Pull the motors and the wind down so a cue can be heard through them, then
   * let them back up. Depth and duration in the caller, because a crash needs
   * more than a gate does.
   */
  duckFlight(atTime, depth, seconds) {
    if (!this.flightDuck) {
      return;
    }
    const g = this.flightDuck.gain;
    g.cancelScheduledValues(atTime);
    g.setValueAtTime(1, atTime);
    g.linearRampToValueAtTime(depth, atTime + 0.010);
    g.linearRampToValueAtTime(1, atTime + seconds);
  }

  /* rpm is the four motor RPM values, speed is airspeed in m/s. atTime is
   * the context time to schedule at, for offline rendering; the live path
   * omits it and gets ctx.currentTime. */
  update(rpm, speed, atTime) {
    if (!this.ctx || !this.master) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    /*
     * MASTER_CEILING is headroom, and it is the number that makes A3's true
     * peak bar hold at every volume setting rather than only at the default.
     * Measured: with the soft clip saturating, the render's true peak in dBTP
     * comes out equal to the master gain in dB, so a master of 1.0 measures
     * 0.01 dBTP and a player on volume 10 clips a converter. 0.85 puts the
     * worst case at -1.41 dBTP, and the stem gains carry 1.5 dB more to keep
     * a normal flight render inside the -20 to -14 dBFS band.
     */
    const target = this.enabled ? this.level * MASTER_CEILING : 0.0;
    this.master.gain.setTargetAtTime(target, t, 0.05);
    if (!this.enabled) {
      return;
    }
    let loudest = 0;
    for (let m = 0; m < 4; m += 1) {
      const r = Math.max(0, rpm[m]);
      const node = this.motors[m];
      /*
       * A stopped motor is silent. Below MOTOR_MUTE_RPM the stem is faded out
       * rather than floored at 20 Hz, which is what put a -21.5 dBFS subsonic
       * drone under the title screen and on top of the bass line during every
       * spool down.
       */
      if (r < MOTOR_MUTE_RPM) {
        node.gain.gain.setTargetAtTime(0, t, 0.06);
        continue;
      }
      /* THE fundamental. No register correction, no scale factor: this is
       * the blade pass frequency, and A2 asserts it against the RPM the
       * module reports to within one percent. */
      const hz = (r / 60) * BLADES;
      /* setTargetAtTime, not linearRamp: the ear hears a step in
       * frequency as a click, and the motors change fast. */
      node.osc.frequency.setTargetAtTime(hz, t, 0.012);
      const corner = Math.min(MOTOR_LP_CAP, Math.max(MOTOR_LP_FLOOR, hz * MOTOR_LP_TRACK));
      node.lp1.frequency.setTargetAtTime(corner, t, 0.03);
      /*
       * Loudness, LINEAR in throttle rather than squared.
       *
       * The squared law swung the stem 11.6 dB across the throttle range, which
       * meant the thing the pilot flies on was being delivered mostly as volume
       * while the pitch cue, which is the informative one, rode underneath it.
       * A linear law with a high floor keeps the stem inside 6.0 dB, twenty log
       * of 0.44 over 0.22, and lets 1.79 octaves of pitch carry the
       * information instead. It also takes the peak drive well off the soft
       * clip's clamp, which was manufacturing distortion in the 2 to 2.5 kHz
       * bands at shipped defaults.
       *
       * SCALED BY 0.63 in this round, which is 4.0 dB off the stem and
       * nothing off the law: both terms move together, so the span stays
       * exactly 6.0 dB and the pitch, which is the information, is
       * untouched. See the header for where the other 6.5 dB of the owner's
       * 70 percent went and why it could not all come off here.
       */
      const loud = Math.min(1, r / 9000);
      node.gain.gain.setTargetAtTime(0.139 + 0.139 * loud, t, 0.03);
      if (loud > loudest) {
        loudest = loud;
      }
    }
    /*
     * The wind, scaled by 1.41, which is 3.0 dB up.
     *
     * This file has said since round 11 that the shipping sims put the
     * motors just audible UNDER the wind. It has never been true here: on a
     * flight render the motor stem measured -18.45 dBFS against the wind's
     * -32.99, so the motors were fourteen and a half dB over the thing they
     * were supposed to be under. Four dB off the motors and three on to the
     * wind closes half of that. The rest is left for a round that can listen
     * to it, because the wind is broadband and raising it further is how a
     * mix gets hissy.
     */
    const rush = Math.min(1, speed / 32);
    this.noiseGain.gain.setTargetAtTime(0.085 + 0.71 * rush * rush + 0.17 * loudest, t, 0.06);
    /* The bed's own clock. Ticked from here so the probe, which drives this
     * exact update, exercises the scheduler too: an instrument that cannot
     * see the music cannot measure it. */
    this.music.tick(t);
  }
}
