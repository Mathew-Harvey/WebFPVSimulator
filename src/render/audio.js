/*
 * audio.js: motor noise as a flight instrument, and a mix around it.
 *
 * Pilots fly quads by ear as much as by eye: the blade pass tone tells you
 * what the throttle is doing before the picture does, and the beat between
 * four slightly different motor speeds is what makes a quad sound like a
 * quad instead of a drone. So this is per motor, driven by that motor's own
 * RPM, not a single throttle-scaled loop.
 *
 * WHAT THIS ROUND CHANGED, AND WHY. The owner's words were "the motor noise
 * needs to be more muted and lower so not to kill my ears". The defect
 * statement of record was "loud screaming", and it was measurable: the old
 * graph multiplied the blade pass frequency by a constant of 2.9, so at 8589
 * RPM the oscillator sat at 1245 Hz, in the ear's most sensitive octave, with
 * a SQUARE partial an octave above it running to 8 kHz and a lowpass that
 * opened to 4776 Hz and let all of it through. Measured with
 * scripts/audio-probe.js, the 2 to 8 kHz band was 22 dB LOUDER than the band
 * containing the blade pass fundamental.
 *
 * So the register correction is gone. The fundamental IS the blade pass
 * frequency now, motor RPM over 60 times the blade count, which on this plant
 * is 130 to 430 Hz in flight. That is a hum with body rather than a saw in
 * the presence band, and it is what the owner asked for. A single sawtooth
 * through two cascaded lowpasses whose corner tracks the fundamental but is
 * CAPPED gives the harmonics that make it read as a motor and nothing above
 * them. There is no square wave anywhere in this file any more.
 *
 * The rest of the mix is built around that band: src/render/music.js puts its
 * sub bass and kick below 120 Hz and its snare and hats above 1.5 kHz, so the
 * bed never sings in the octaves the pilot is listening to.
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
 * decides whether this mix hurts. 1150 Hz keeps at most the first seven
 * harmonics of a 165 Hz hover tone and nothing at all in the 2 to 8 kHz band
 * the ear complains about first.
 */
const MOTOR_LP_TRACK = 3.4;
const MOTOR_LP_CAP = 1150;
const MOTOR_LP_FLOOR = 220;

/*
 * The binaural focus tone. 6 Hz is in the theta band, 4 to 8 Hz, and 220 Hz
 * is the carrier, chosen high enough to sit above the motor fundamental's
 * hover range and low enough that a binaural difference is a difference of
 * carriers rather than of overtones. It is off by default, it is a setting,
 * and the interface says it needs headphones and claims nothing else.
 */
const MASTER_CEILING = 0.85;
const FOCUS_CARRIER_HZ = 220;
const FOCUS_BEAT_HZ = 6;

export class MotorAudio {
  constructor() {
    this.ctx = null;
    this.motors = [];
    this.enabled = false;
    this.master = null;
    this.noiseGain = null;
    this.level = 0.5; /* mix level, driven by the volume setting */
    /* Per stem, each 0 to 1, driven by their own settings rows. */
    this.mix = { motors: 0.6, wind: 0.5, music: 0.5, focus: 1 };
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
    this.applyBuses();
  }

  setMusicEnabled(on) {
    this.music.setEnabled(on);
  }

  setFocusEnabled(on) {
    this.focusOn = Boolean(on);
    this.applyBuses();
  }

  applyBuses() {
    if (!this.motorBus) {
      return;
    }
    this.motorBus.gain.value = this.mix.motors;
    this.windBus.gain.value = this.mix.wind;
    /* The focus tone is quiet on purpose. It is a tone under a mix, not a
     * test signal, and two steady carriers at any real level would mask the
     * flight instrument. */
    this.focusBus.gain.value = this.focusOn ? this.mix.focus * 0.09 : 0;
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
    const motorBus = keep(ctx.createGain());
    motorBus.gain.value = this.mix.motors;
    motorBus.connect(shaper);
    this.motorBus = motorBus;
    const windBus = keep(ctx.createGain());
    windBus.gain.value = this.mix.wind;
    windBus.connect(shaper);
    this.windBus = windBus;
    const focusBus = keep(ctx.createGain());
    focusBus.gain.value = 0;
    focusBus.connect(shaper);
    this.focusBus = focusBus;

    for (let m = 0; m < 4; m += 1) {
      const osc = keep(ctx.createOscillator());
      osc.type = 'sawtooth';
      osc.frequency.value = 120;
      /* Two cascaded lowpasses, so the rolloff above the cap is 24 dB per
       * octave rather than 12. One pole was not enough: a sawtooth has
       * energy everywhere, and a single 12 dB slope still left audible
       * harmonics in the presence band. */
      const lp1 = keep(ctx.createBiquadFilter());
      lp1.type = 'lowpass';
      lp1.frequency.value = 600;
      lp1.Q.value = 0.7;
      const lp2 = keep(ctx.createBiquadFilter());
      lp2.type = 'lowpass';
      lp2.frequency.value = 600;
      lp2.Q.value = 0.7;
      const gain = keep(ctx.createGain());
      gain.gain.value = 0.0;
      /* Spread the four motors across the stereo field so the beating
       * between them is audible, the way it is behind real goggles. */
      const pan = ctx.createStereoPanner ? keep(ctx.createStereoPanner()) : null;
      if (pan) {
        pan.pan.value = [0.45, 0.32, -0.45, -0.32][m];
      }
      osc.connect(lp1);
      lp1.connect(lp2);
      lp2.connect(gain);
      if (pan) {
        gain.connect(pan);
        pan.connect(motorBus);
      } else {
        gain.connect(motorBus);
      }
      osc.start();
      this.motors.push({ osc, lp1, lp2, gain });
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
     * One shot cues, pooled: a persistent oscillator for the gate, landing
     * and takeoff blips, and a persistent noise chain for the crash. Nothing
     * is created per event, which is what A10 asks for by name.
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
   * A one shot cue. kind is 'crash', 'gate', 'land' or 'takeoff'. Safe to
   * call before attach, and it creates no nodes: every cue is an envelope on
   * a voice that already exists.
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
      g.exponentialRampToValueAtTime(0.85, t + 0.006);
      g.exponentialRampToValueAtTime(0.0001, t + 0.42);
      const f = this.crashLp.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(1800, t);
      f.exponentialRampToValueAtTime(220, t + 0.4);
      this.music.duckNow(t, 0.25, 0.55);
      return;
    }
    /* The blips. A gate is a bright confirmation, a landing is the same
     * shape two octaves down, and a takeoff is a rising pair. */
    let hz = 1180;
    let dur = 0.11;
    if (kind === 'land') {
      hz = 400;
      dur = 0.16;
    } else if (kind === 'takeoff') {
      hz = 620;
      dur = 0.14;
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
    g.exponentialRampToValueAtTime(kind === 'gate' ? 0.5 : 0.34, t + 0.004);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
    this.music.duckNow(t, kind === 'gate' ? 0.42 : 0.6, 0.3);
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
      /* THE fundamental. No register correction, no scale factor: this is
       * the blade pass frequency, and A2 asserts it against the RPM the
       * module reports to within one percent. */
      const hz = (r / 60) * BLADES;
      const node = this.motors[m];
      /* setTargetAtTime, not linearRamp: the ear hears a step in
       * frequency as a click, and the motors change fast. */
      node.osc.frequency.setTargetAtTime(Math.max(20, hz), t, 0.012);
      const corner = Math.min(MOTOR_LP_CAP, Math.max(MOTOR_LP_FLOOR, hz * MOTOR_LP_TRACK));
      node.lp1.frequency.setTargetAtTime(corner, t, 0.03);
      node.lp2.frequency.setTargetAtTime(corner, t, 0.03);
      /* Loudness against a full throttle reference. The exponent is what
       * makes a hover quiet and a punch loud without the punch clipping. */
      const loud = Math.min(1, r / 9000);
      node.gain.gain.setTargetAtTime(0.119 + 0.738 * loud * loud, t, 0.03);
      if (loud > loudest) {
        loudest = loud;
      }
    }
    const rush = Math.min(1, speed / 32);
    this.noiseGain.gain.setTargetAtTime(0.06 + 0.50 * rush * rush + 0.12 * loudest, t, 0.06);
    /* The bed's own clock. Ticked from here so the probe, which drives this
     * exact update, exercises the scheduler too: an instrument that cannot
     * see the music cannot measure it. */
    this.music.tick(t);
  }
}
