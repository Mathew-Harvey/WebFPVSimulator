/*
 * audio.js: motor noise as a flight instrument, and a mix around it.
 *
 * Pilots fly quads by ear as much as by eye: the motor tone tells you what
 * the throttle is doing before the picture does. So this is driven by the
 * RPM the module reports for the motors, not a single throttle-scaled loop.
 * It was one voice per motor so their speeds would beat; the owner heard
 * that beat as a "wha wha wha" and it is one voice at their mean speed now.
 *
 * THE MOTOR VOICE IS COPIED FROM A REAL QUAD (2026-11-02). Everything the
 * next three paragraphs say about the blade pass as the fundamental and the
 * capped lowpass is history now: the fundamental is the motor's rotation
 * rate, and the harmonic stack, the throttle brightness law and the
 * camera's band are fitted to a measured recording of a 6S five inch on its
 * onboard camera. Its hiss and the beating between its four motors were
 * copied too and then taken out again at the owner's word, so the voice is
 * one steady tone: see ONE STEADY VOICE below. The constants say which
 * number each one came from, and PROGRESS.md has the comparison.
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
 * Music is the recorded crates in assets/music, Opus in a WebM with an mp3
 * fallback, played by src/render/music.js through one MediaElementSource
 * on this same mix. Cues still duck it. The generated drum and bass crate
 * is gone. There are two crates and setMusicContext says which one is
 * wanted: the flight records while the pilot is flying, a quieter two
 * record bed everywhere else. Cues only ever fire in flight, so the duck
 * is a flight thing and the menu bed never sees it.
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
 * THE MOTOR VOICE IS THE ROTATION TONE NOW, and the reason is a measurement
 * of a real quad. The owner (2026-11-02) supplied a characterisation of a
 * 6S five inch flown through 202 s of freestyle and recorded on its onboard
 * camera: the lowest line of the harmonic stack runs 285 Hz in the cruise
 * cluster and 529 Hz wide open, which is the motor's ROTATION rate (17,100
 * and 31,800 rpm), not the blade pass. A frame mounted mic hears the 1x
 * imbalance tone loudest and every integer multiple above it, the blade pass
 * included as the third. This file used to put the blade pass at the
 * fundamental and lowpass everything above it, which on the current plant
 * (hover 8,700 rpm, wide open 25,600) measured as a near pure sine at three
 * times the right pitch that faded to -53.6 dBFS at full throttle under its
 * own 430 Hz cap. PROGRESS.md has the numbers either side.
 *
 * So the fundamental is rpm / 60, and the plant's RPM goes in untouched: the
 * pitch the pilot flies on still comes from the module's own motor speed.
 */
const ROTATION_HZ_PER_RPM = 1 / 60;
/*
 * The plant's wide open RPM, used only to place a motor on a 0 to 1 throttle
 * scale for the brightness and loudness laws. The shell sets it per airframe
 * from PLANT_FACTS through setFullRpm, so a whoop's 74,800 is not heard as a
 * five inch three times past full. Idle is taken as a tenth of it.
 */
const DEFAULT_FULL_RPM = 25600;
/*
 * The harmonic stack, measured. Magnitudes are the reference's WIDE OPEN
 * column, H1 to H8 relative to H1: 0, -11.1, -15.1, -19.6, -21.1, -21.5,
 * -22.9, -23.4 dB. That is the brightest the motor ever is, so the wave is
 * written at full throttle and the per motor lowpass below darkens it
 * toward the cruise column (-15.6 at H2 down to -36.7 at H8) as the throttle
 * falls. Phases are scattered so the waveform has no sawtooth edge.
 */
const MOTOR_HARMONIC_DB = [0, -11.1, -15.1, -19.6, -21.1, -21.5, -22.9, -23.4];
const MOTOR_HARMONIC_PHASE = [0, 1.9, 4.1, 0.7, 3.3, 5.6, 2.4, 4.9];
/*
 * The per motor brightness law. The reference's cruise column sits under
 * its wide open one by a nearly steady 4.4 dB per octave, which is a FIRST
 * order slope, and a Web Audio lowpass is second order. A biquad lowpass
 * with a very low Q (-12 dB, linear 0.25) splits its two poles to 0.27 and
 * 3.7 times its corner, so between them it falls at 6 dB per octave: a first
 * order tilt that can still be moved. The corner is BRIGHT_LO times the
 * fundamental at idle and BRIGHT_HI times it wide open, geometric in the
 * square of throttle. Fitted offline against the reference's cruise and
 * wide open columns; PROGRESS.md has both sets of numbers. BAND_Q is the
 * Butterworth -3 dB the plain band limits use.
 */
const BRIGHT_LO = 2.2;
const BRIGHT_HI = 60;
const MOTOR_LP_CAP = 16000;
const MOTOR_LP_Q = -12;
const BAND_Q = -3;
/*
 * The camera's band limit and the bass. The reference rolls off steeply
 * above about 7 kHz, which is the camera's processing and is what real FPV
 * footage sounds like, so the motor bus ends in a lowpass there instead of
 * the 800 Hz muffle the blade pass voice needed. The low shelf is the
 * owner's "a touch more bass" of 2026-11-02, smaller now that the
 * fundamental itself sits an octave and a half lower.
 */
/*
 * The wind: heard only with airspeed, its gain the square of airspeed over
 * 32 m/s times this, through a plain Butterworth lowpass with no resonant
 * bump to make it gurgle. See the note in update().
 */
const WIND_RUSH_GAIN = 0.355;
const WIND_LP_HZ = 450;
const CAM_SHELF_HZ = 160;
const CAM_SHELF_DB = 2;
const CAM_LP_HZ = 7000;
/* The camera's step: the reference falls 9.8 dB across 1.5 kHz and stays
 * there to its 7 kHz roll off, which is an action camera's processing and
 * part of what FPV footage sounds like. A high shelf, on the motor bus. */
const CAM_STEP_HZ = 1500;
const CAM_STEP_DB = -10;
const MOTOR_COMP_THRESHOLD = -30;
const MOTOR_COMP_TRIM = 1.0;
/*
 * Loudness: close to flat, because the reference is. Its RMS moved 1.5 dB
 * from idle to wide open (an onboard camera's level control, which is also
 * what every FPV video a pilot has heard does), and the throttle is carried
 * by brightness instead. The gain rises from MOTOR_VOICE_FLOOR to 1 across
 * the throttle, which with the brightness measures -27.8 dBFS at hover and
 * -23.9 wide open on the motor stem, so a punch still swells.
 */
const MOTOR_VOICE_GAIN = 0.38;
const MOTOR_VOICE_FLOOR = 0.8;
/*
 * Below this the motor stem is silent. A stationary quad was not quiet: with
 * the oscillator floored at 20 Hz and a 0.119 idle gain, the title screen
 * measured -21.5 dBFS of 20 to 46 Hz drone, which is louder than the entire
 * music bed at maximum and sits directly on top of the bass line. No headphone
 * reproduces it as pitch, so it was pure wasted headroom.
 */
const MOTOR_MUTE_RPM = 600;
/*
 * ONE STEADY VOICE, NO BEATS AND NO HISS (the owner, 2026-11-02 11:38Z:
 * "remove the hiss and the wha wha wha cycle in the background").
 *
 * The reference has both: four motors a few Hz apart beat against each other
 * (it measured 57 percent amplitude wobble at 1 to 6 Hz), its pitch wanders
 * 40 cents at 3.6 Hz, and a broadband floor rises with throttle. The first
 * cut of this voice copied all three, with four oscillators spread across
 * the stereo field, a shared wander, and a prop noise layer. Measured on a
 * steady 12,200 rpm render that was 52 percent amplitude modulation peaking
 * at 1.4 to 5.2 Hz, which is the wha wha wha, and the noise was the hiss.
 * So there is one oscillator now, at the mean of the four motors' speeds:
 * four tones a few Hz apart cannot beat if there is only one of them. Its
 * harmonic stack and brightness law are still the reference's. Eleven
 * fewer audio nodes than the first cut, and two fewer buffers to build.
 */

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

/* How many times in a row the context may be asked back on its own, with no
 * gesture behind it, before it is left for the next one. See stateChanged. */
const SELF_WAKES = 3;

/*
 * Duck a bus, starting from where it actually IS.
 *
 * cancelScheduledValues followed by setValueAtTime(1) is a JUMP TO UNITY
 * whenever a second cue arrives while the first one is still ducking: the
 * bus is at 0.28, the schedule is cleared, and the next sample is 1. That
 * is a step on the motors, the wind and the music, at the exact instant a
 * cue is playing over them, and a step is a click. Two gates a tenth of a
 * second apart put one in. It has to start from the current value.
 *
 * Deeper wins. If the bus is already further down than this cue asks for,
 * the duck stays where it is and only the release is rescheduled: raising
 * it to the shallower depth would be the same step in the other direction.
 */
function duckParam(g, t, depth, seconds, attack) {
  const from = g.value;
  if (typeof g.cancelAndHoldAtTime === 'function') {
    g.cancelAndHoldAtTime(t);
  } else {
    g.cancelScheduledValues(t);
  }
  g.setValueAtTime(from, t);
  const to = from < depth ? from : depth;
  g.linearRampToValueAtTime(to, t + attack);
  g.linearRampToValueAtTime(1, t + seconds);
}

export class MotorAudio {
  constructor() {
    this.ctx = null;
    this.motors = [];
    this.enabled = false;
    this.master = null;
    this.noiseGain = null;
    this.voice = null;
    this.fullRpm = DEFAULT_FULL_RPM;
    this.level = 0.5; /* mix level, driven by the volume setting */
    /* Per stem, each 0 to 1, driven by their own settings rows. These
     * mirror the DEFAULTS in src/ui/ui.js divided by ten, and the probe
     * measures at exactly these values when no mix argument is given. */
    this.mix = { motors: 0.5, wind: 0.5, music: 0.5, focus: 1, ambience: 0, effects: 1 };
    this.focusOn = false;
    this.music = new Music();
    /* Every AudioNode this instance owns, for P12. A node created and
     * dropped without being counted is exactly the leak P12 forbids, so
     * the count is kept where the nodes are made rather than derived by
     * reading the file later. */
    this.nodes = [];
    /* How many times the context has been asked back without a gesture since
     * it last ran: see stateChanged. */
    this.selfWakes = 0;
  }

  /* P12: steady state AudioNode count. */
  nodeCount() {
    return this.nodes.length;
  }

  /* The flying airframe's wide open RPM, from the shell's PLANT_FACTS, so
   * the brightness and loudness laws place a whoop's motors on its own
   * throttle scale. Anything not a sensible number keeps the five inch. */
  setFullRpm(rpm) {
    this.fullRpm = rpm > 5000 && rpm < 200000 ? rpm : DEFAULT_FULL_RPM;
  }

  /* Volume from the settings screen, zero to one. */
  setLevel(v) {
    this.level = Math.max(0, Math.min(1, v));
  }

  setEnabled(on) {
    this.enabled = Boolean(on) && Boolean(this.ctx);
    if (!this.enabled) {
      this.music.pause();
    } else {
      this.music.resume();
    }
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
    if (typeof m.effects === 'number') {
      /* The cues (crash, gate, graze, landing, takeoff, menu taps). Read when
       * a cue fires and by nothing else: no node, no per frame work. */
      this.mix.effects = Math.max(0, Math.min(1, m.effects));
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

  /* Which music track, or 'rotation' for a random start then the crate
   * in order. A setting, safe before attach: the player object holds it
   * as data. This is the FLIGHT crate. The menu bed is not selectable. */
  setMusicTrack(sel) {
    this.music.setTrack(sel);
  }

  /*
   * 'flight' or 'menu': which crate the bed should be playing. Driven off
   * the screen by the shell, because the shell is the only side that
   * knows what is on screen, and safe before attach for the same reason
   * setMusicTrack is.
   */
  setMusicContext(name) {
    this.music.setContext(name);
  }

  skipMusic(dir) {
    this.music.skip(dir);
  }

  musicStatus() {
    return this.music.status();
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
      this.wake();
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
   * BRING A CONTEXT THE BROWSER TOOK AWAY BACK. bug-453fb074, "SOUND JUST
   * STOPPED WORKING", on a Mac, from a pilot flying a radio. A browser
   * suspends a context for its own reasons (an output device changing, a
   * sleep, a tab put away, and 'interrupted' on Safari), and nothing here ever
   * asked for it back: start() had a resume for it, but the shell only calls
   * start() while there is no context yet, so that line could not run after
   * the first gesture. Measured in the real shell, suspending the context and
   * then pressing a key and clicking left it suspended with its clock stopped,
   * for good, while the settings said sound was on.
   *
   * resume() is a promise that rejects when the browser will not have it yet,
   * for want of a gesture: that is not an error here, the next gesture asks
   * again. `automatic` is the statechange path below, which is limited in how
   * often it may ask, and a gesture starts that allowance over.
   */
  wake(automatic = false) {
    const c = this.ctx;
    if (!c || typeof c.resume !== 'function' || (c.state !== 'suspended' && c.state !== 'interrupted')) {
      return;
    }
    if (!automatic) {
      this.selfWakes = 0;
    }
    const p = c.resume();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
    }
  }

  /*
   * The context changed state on its own. A radio pilot makes no keypress and
   * no click for the whole flight, so waiting for a gesture would leave them
   * in silence until they reached for the keyboard; a page that has had one
   * gesture may resume in Chrome without another. A few tries and then stop,
   * so a browser that suspends again at once is not argued with in a loop.
   */
  stateChanged() {
    const c = this.ctx;
    if (!c) {
      return;
    }
    if (c.state === 'running') {
      this.selfWakes = 0;
      return;
    }
    if (!this.enabled || this.selfWakes >= SELF_WAKES) {
      return;
    }
    this.selfWakes += 1;
    this.wake(true);
  }

  /* What the browser is doing with the context, for a bug report: without it
   * "the sound stopped" cannot be told from a setting or a mute. */
  report() {
    return { state: this.ctx ? this.ctx.state : 'none', on: this.enabled };
  }

  /*
   * Build the graph on any BaseAudioContext. Called by start() with a live
   * AudioContext and by the probe with an OfflineAudioContext. Does not
   * set enabled: the caller decides, because the probe wants the mix up
   * from sample zero and the shell wants it to follow a setting.
   */
  /* A context that changes state on its own is asked back: see stateChanged. */
  watchState(ctx) {
    if (ctx && typeof ctx.addEventListener === 'function') {
      ctx.addEventListener('statechange', () => this.stateChanged());
    }
  }

  attach(ctx, destination) {
    this.ctx = ctx;
    this.watchState(ctx);
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
    const camShelf = keep(ctx.createBiquadFilter());
    camShelf.type = 'lowshelf';
    camShelf.frequency.value = CAM_SHELF_HZ;
    camShelf.gain.value = CAM_SHELF_DB;
    const camLp = keep(ctx.createBiquadFilter());
    camLp.type = 'lowpass';
    camLp.frequency.value = CAM_LP_HZ;
    camLp.Q.value = BAND_Q;
    motorBus.connect(motorHp);
    motorHp.connect(camShelf);
    /*
     * A LIGHT COMPRESSOR on the motor bus (the owner, 2026-11-02: "a touch more
     * bass in the motor sounds with a little compression"). One shared node,
     * none per motor, run by the browser's audio thread, so nothing on the
     * main thread and nothing per frame. Low ratio, soft knee and a slow
     * release: it settles the throttle swell into one fatter body instead of
     * squashing anything.
     */
    const camComp = keep(ctx.createDynamicsCompressor());
    camComp.threshold.value = MOTOR_COMP_THRESHOLD;
    camComp.knee.value = 12;
    camComp.ratio.value = 3;
    camComp.attack.value = 0.02;
    camComp.release.value = 0.25;
    const camStep = keep(ctx.createBiquadFilter());
    camStep.type = 'highshelf';
    camStep.frequency.value = CAM_STEP_HZ;
    camStep.gain.value = CAM_STEP_DB;
    camShelf.connect(camStep);
    camStep.connect(camLp);
    camLp.connect(camComp);
    /* The compressor's automatic make up gain is about 6 dB at these settings,
     * which would have been a loud motor and not "a touch more bass", so it is
     * trimmed back here, after the compressor, where it cannot change what the
     * compressor does. Measured on the flight trace, see PROGRESS.md. */
    const camTrim = keep(ctx.createGain());
    camTrim.gain.value = MOTOR_COMP_TRIM;
    camComp.connect(camTrim);
    camTrim.connect(flightDuck);
    this.motorBus = motorBus;
    const windBus = keep(ctx.createGain());
    windBus.gain.value = this.mix.wind * FLIGHT_STEM;
    windBus.connect(flightDuck);
    this.windBus = windBus;
    const focusBus = keep(ctx.createGain());
    focusBus.gain.value = 0;
    focusBus.connect(shaper);
    this.focusBus = focusBus;

    const hN = MOTOR_HARMONIC_DB.length + 1;
    const wReal = new Float32Array(hN);
    const wImag = new Float32Array(hN);
    for (let k = 1; k < hN; k += 1) {
      const mag = Math.pow(10, MOTOR_HARMONIC_DB[k - 1] / 20);
      wReal[k] = mag * Math.cos(MOTOR_HARMONIC_PHASE[k - 1]);
      wImag[k] = mag * Math.sin(MOTOR_HARMONIC_PHASE[k - 1]);
    }
    const motorWave = ctx.createPeriodicWave(wReal, wImag);
    /* The one motor voice: oscillator, the brightness law's lowpass (its
     * corner rides the fundamental and the throttle, set in update()), and
     * a gain. Centred, the way an onboard camera's mono track is. */
    const osc = keep(ctx.createOscillator());
    osc.setPeriodicWave(motorWave);
    osc.frequency.value = 120;
    const lp1 = keep(ctx.createBiquadFilter());
    lp1.type = 'lowpass';
    lp1.frequency.value = 600;
    lp1.Q.value = MOTOR_LP_Q;
    const voiceGain = keep(ctx.createGain());
    voiceGain.gain.value = 0.0;
    osc.connect(lp1);
    lp1.connect(voiceGain);
    voiceGain.connect(motorBus);
    osc.start();
    this.voice = { osc, lp1, gain: voiceGain };
    /* `motors` stays a four entry list for anything that counts motors; all
     * four are the one voice. */
    for (let m = 0; m < 4; m += 1) {
      this.motors.push(this.voice);
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
    /*
     * THE WIND HAS ITS OWN BUFFERS, SOFTER, AND THEY DO NOT REPEAT AS ONE.
     * The cues share the white buffer above, but the wind is the one sound
     * that runs for minutes, so it is where a loop gets heard. A one pole
     * smoothing on the way in leans the spectrum toward the low end like air
     * round a canopy instead of a flat shh; the smoothing costs a power
     * factor of a/(2-a), so the 1.8 puts the level back.
     *
     * The owner heard a cycle in the lap (2026-11-02 11:50Z, "in the lap
     * after there is still a cyclical sound"), and it was this: a single
     * 4 s loop, which correlated 0.95 with itself 4 s later, and whose seam
     * jumped from the buffer's last sample to one 20 ms short of it, a small
     * step every 4 s. So there are three loops now, 4.7, 6.1 and 7.9 s,
     * summed at equal level: none repeats on another's beat, the three line
     * up again only after minutes, and each one's own repeat is a third of
     * the power under two that are not repeating (measured: correlation 0.95
     * at 4 s before, about 0.3 at any lag now). Each is built 20 ms long,
     * its head crossfaded with that extra tail, and the tail dropped, so the
     * loop point is continuous. Two more nodes and about 3.6 MB of samples,
     * built once at attach, nothing per frame.
     */
    const windLoop = (seed, seconds) => {
      const n = Math.floor(ctx.sampleRate * seconds);
      const seam = Math.floor(ctx.sampleRate * 0.02);
      const tmp = new Float32Array(n + seam);
      let ws = seed;
      let wy = 0;
      for (let i = 0; i < n + seam; i += 1) {
        ws = (ws * 1103515245 + 12345) & 0x7fffffff;
        wy += 0.25 * (((ws / 0x3fffffff) - 1.0) - wy);
        tmp[i] = wy * 1.8 * WIND_LOOP_SCALE;
      }
      /* Sample n - 1 is followed, on the loop, by sample 0, which is now
       * tmp[n] at the start of the fade: the sample that followed it when
       * the noise was made. */
      for (let i = 0; i < seam; i += 1) {
        const k = i / seam;
        tmp[i] = tmp[i] * k + tmp[n + i] * (1 - k);
      }
      const wb = ctx.createBuffer(1, n, ctx.sampleRate);
      wb.getChannelData(0).set(tmp.subarray(0, n));
      const src = keep(ctx.createBufferSource());
      src.buffer = wb;
      src.loop = true;
      return src;
    };
    const WIND_LOOP_SCALE = 1 / Math.sqrt(3);
    const noise = windLoop(97531, 4.7);
    const noise2 = windLoop(13579, 6.1);
    const noise3 = windLoop(24601, 7.9);
    const nf = keep(ctx.createBiquadFilter());
    nf.type = 'lowpass';
    nf.frequency.value = WIND_LP_HZ;
    nf.Q.value = BAND_Q;
    const ng = keep(ctx.createGain());
    ng.gain.value = 0.0;
    noise.connect(nf);
    noise2.connect(nf);
    noise3.connect(nf);
    nf.connect(ng);
    ng.connect(windBus);
    noise.start();
    noise2.start();
    noise3.start();
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
    cueOsc.type = 'sine';
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
   * envelope on a voice that already exists. `level` is optional and only
   * the contact cues read it; see the note in the body.
   *
   * A cue also ducks the bed, which is what keeps it audible with everything
   * else at maximum.
   */
  event(kind, atTime, level) {
    if (!this.ctx || !this.cueGain) {
      return;
    }
    const fx = this.mix.effects;
    if (!(fx > 0)) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    /*
     * `level` is how hard the thing that caused this cue actually was, 0
     * to 1, and it exists because the on-screen hit text is gone: the
     * sound is now the whole of what a pilot is told about a contact, so
     * it has to say how hard as well as that it happened. Absent, every
     * cue plays at its written level, which is what every caller outside
     * the contact path wants: a gate is a gate.
     *
     * The floor is deliberate. A cue scaled to nothing is a cue the
     * player will swear did not fire, and this one is carrying the
     * message on its own.
     */
    let lv = 1;
    if (level != null && level === level) {
      lv = level < 0 ? 0 : level > 1 ? 1 : level;
      lv = 0.42 + 0.58 * lv;
    }
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
      g.exponentialRampToValueAtTime(2.3 * lv * fx, t + 0.03);
      g.exponentialRampToValueAtTime(0.0001, t + 0.8);
      const f = this.crashLp.frequency;
      f.cancelScheduledValues(t);
      /* A thud, not a smack: the noise starts under 600 Hz and falls to 70, so
       * nothing above the motors' own band reaches the ear, and a harder hit
       * still opens the filter further and rings longer. The body is the
       * pooled cue oscillator dropped from 110 to 45 Hz, which is the weight. */
      f.setValueAtTime(240 + 200 * lv, t);
      f.exponentialRampToValueAtTime(65, t + 0.65);
      const bf = this.cueOsc.frequency;
      bf.cancelScheduledValues(t);
      bf.setValueAtTime(110, t);
      bf.exponentialRampToValueAtTime(45, t + 0.22);
      const bg = this.cueGain.gain;
      bg.cancelScheduledValues(t);
      bg.setValueAtTime(0.0001, t);
      bg.exponentialRampToValueAtTime(0.9 * lv * fx, t + 0.02);
      bg.exponentialRampToValueAtTime(0.0001, t + 0.55);
      /* The click cues lean on this filter's Q, so a crash states its own
       * rather than inheriting whatever the last click left. */
      this.crashLp.Q.cancelScheduledValues(t);
      this.crashLp.Q.setValueAtTime(0.7, t);
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
       * The click energy sits between 1 and 3 kHz, softened from 2 to 5 kHz, where the motors (capped
       * at 1 kHz) and the wind (lowpassed at 560 Hz) have nothing, which is
       * why it reads through a full throttle mix with a LIGHTER duck than
       * the old blip needed.
       */
      const gate = kind === 'gate';
      const nf = this.crashLp.frequency;
      nf.cancelScheduledValues(t);
      nf.setValueAtTime(gate ? 1800 : 600, t);
      this.crashLp.Q.cancelScheduledValues(t);
      this.crashLp.Q.setValueAtTime(gate ? 0.9 : 0.7, t);
      const ng = this.crashGain.gain;
      ng.cancelScheduledValues(t);
      ng.setValueAtTime(0.0001, t);
      ng.exponentialRampToValueAtTime((gate ? 0.9 : 0.8) * (gate ? 1 : lv) * fx, t + 0.009);
      ng.exponentialRampToValueAtTime(0.0001, t + (gate ? 0.12 : 0.2));
      const f = this.cueOsc.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(gate ? 900 : 240, t);
      f.exponentialRampToValueAtTime(gate ? 520 : 150, t + (gate ? 0.06 : 0.09));
      const g = this.cueGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime((gate ? 0.55 : 0.5) * (gate ? 1 : lv) * fx, t + 0.01);
      g.exponentialRampToValueAtTime(0.0001, t + (gate ? 0.22 : 0.24));
      this.duckFlight(t, gate ? 0.55 : 0.5, gate ? 0.22 : 0.3);
      this.music.duckNow(t, gate ? 0.5 : 0.45, gate ? 0.25 : 0.3);
      return;
    }
    /*
     * THE THOCK. A landing and a take off used to be a pair of pitched blips,
     * which the owner heard as "boop bop" (2026-11-02) and asked to have a deep
     * thock. A thock is a knock on something heavy and hollow: a sine that
     * falls fast through a low octave, with a short dull knuckle of noise on
     * the front of it and no pitch to hum along to. The landing is the deepest,
     * the take off a size lighter and quicker, and 'select' (the career pick)
     * a small one. Same two pooled voices as every other cue, nothing created.
     * The noise is the crash chain's, opened to a few hundred Hz only.
     */
    let hz = 190;
    let hzEnd = 60;
    let dur = 0.3;
    let peak = 0.85;
    if (kind === 'takeoff') {
      hz = 230;
      hzEnd = 85;
      dur = 0.22;
      peak = 0.7;
    } else if (kind !== 'land') {
      hz = 300;
      hzEnd = 130;
      dur = 0.14;
      peak = 0.5;
    }
    const f = this.cueOsc.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(hz, t);
    f.exponentialRampToValueAtTime(hzEnd, t + dur * 0.55);
    const g = this.cueGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak * fx, t + 0.007);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
    const nf = this.crashLp.frequency;
    nf.cancelScheduledValues(t);
    nf.setValueAtTime(420, t);
    this.crashLp.Q.cancelScheduledValues(t);
    this.crashLp.Q.setValueAtTime(0.7, t);
    const ng = this.crashGain.gain;
    ng.cancelScheduledValues(t);
    ng.setValueAtTime(0.0001, t);
    ng.exponentialRampToValueAtTime(0.5 * peak * fx, t + 0.006);
    ng.exponentialRampToValueAtTime(0.0001, t + 0.05);
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
    const fx = this.mix.effects;
    if (!this.ctx || !this.cueGain || !this.enabled || !(fx > 0)) {
      return;
    }
    const t = this.ctx.currentTime;
    let oscHz = 1500;
    let oscTo = 0;
    let oscPeak = 0.075;
    let oscDur = 0.040;
    let nHz = 3000;
    let nPeak = 0.07;
    let nDur = 0.022;
    if (kind === 'select') {
      oscHz = 1100;
      oscTo = 700;
      oscPeak = 0.14;
      oscDur = 0.07;
      nHz = 2600;
      nPeak = 0.11;
      nDur = 0.034;
    } else if (kind === 'adjust') {
      oscHz = 1650;
      oscPeak = 0.09;
      oscDur = 0.045;
      nPeak = 0.08;
      nDur = 0.024;
    } else if (kind === 'back') {
      oscHz = 800;
      oscTo = 600;
      oscPeak = 0.10;
      oscDur = 0.06;
      nHz = 2200;
      nDur = 0.028;
    }
    const nf = this.crashLp.frequency;
    nf.cancelScheduledValues(t);
    nf.setValueAtTime(nHz, t);
    this.crashLp.Q.cancelScheduledValues(t);
    this.crashLp.Q.setValueAtTime(0.8, t);
    const ng = this.crashGain.gain;
    ng.cancelScheduledValues(t);
    ng.setValueAtTime(0.0001, t);
    ng.exponentialRampToValueAtTime(nPeak * fx, t + 0.006);
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
    g.exponentialRampToValueAtTime(oscPeak * fx, t + 0.008);
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
    duckParam(this.flightDuck.gain, atTime, depth, seconds, 0.010);
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
      this.music.pause();
      return;
    }
    /* The voice takes the MEAN speed of the motors that are turning: one
     * pitch, so nothing beats. */
    let sum = 0;
    let turning = 0;
    for (let m = 0; m < 4; m += 1) {
      const r = Math.max(0, rpm[m]);
      if (r < MOTOR_MUTE_RPM) {
        continue;
      }
      sum += r;
      turning += 1;
    }
    const v = this.voice;
    /*
     * A stopped motor is silent. Below MOTOR_MUTE_RPM a motor is left out,
     * and with none turning the stem is faded out rather than floored at
     * 20 Hz, which is what put a -21.5 dBFS subsonic drone under the title
     * screen and on top of the bass line during every spool down. A voice
     * for four motors with one stopped is three quarters as loud.
     */
    if (turning === 0) {
      v.gain.gain.setTargetAtTime(0, t, 0.06);
    } else {
      const r = sum / turning;
      const full = this.fullRpm;
      const idle = 0.1 * full;
      /* THE fundamental: the rotation rate, straight from the RPM the module
       * reports, with no register correction and no scale. The blade pass is
       * the third harmonic of it, in the wave. */
      const hz = r * ROTATION_HZ_PER_RPM;
      /* setTargetAtTime, not linearRamp: the ear hears a step in frequency
       * as a click, and the motors change fast. The 12 ms is the whole of
       * the smoothing. The reference's pitch took 280 ms to swing on a
       * punch, but that is its pilot's thumb plus its motors, and the plant
       * already models the motors: lagging the sound behind the physics
       * would be latency, and it is not added. */
      v.osc.frequency.setTargetAtTime(hz, t, 0.012);
      let thr = (r - idle) / (full - idle);
      thr = thr < 0 ? 0 : thr > 1 ? 1 : thr;
      const corner = Math.min(MOTOR_LP_CAP, hz * BRIGHT_LO * Math.pow(BRIGHT_HI / BRIGHT_LO, thr * thr));
      v.lp1.frequency.setTargetAtTime(corner, t, 0.03);
      v.gain.gain.setTargetAtTime(
        MOTOR_VOICE_GAIN * (turning / 4) * (MOTOR_VOICE_FLOOR + (1 - MOTOR_VOICE_FLOOR) * thr), t, 0.03);
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
    /*
     * THE 0.085 IS THE AIR A FLYING QUAD SITS IN, NOT A HUM THE PAGE MAKES.
     *
     * It was an unconditional term, so the wind bed never went below it, and
     * with the motors muted it was the ONLY thing left in the graph. Measured
     * offline through this very class with the motors stopped and the
     * airspeed zero: -57.77 dBFS RMS at the default volume, and zeroing the
     * wind stem alone took the render to exact digital silence while zeroing
     * the motor stem changed nothing at all. So after the round that stopped
     * the motors droning on the results screen the owner still heard
     * something, "lower in pitch and quieter", and that is what it was: a
     * dead flat band of noise under a 900 Hz lowpass, running under the
     * title screen, under the results table and through every crash lockout,
     * never changing, which is exactly the kind of sound an ear locks on to.
     *
     * Stopped air is silent, for the same reason a stopped motor is. The
     * floor stays whenever anything is actually moving, which includes a
     * hover, where `loudest` is what carries the prop wash; it is gone only
     * when every motor is below MOTOR_MUTE_RPM and the craft is not moving
     * either. The 0.06 tau takes it down over about 200 ms rather than
     * cutting, the same way the motor stem goes.
     */
    /*
     * AIRSPEED ONLY NOW, AND HALF AS LOUD (the owner, 2026-11-02 12:07Z,
     * "still got that messy background, can you clean it up"). With the
     * motor stem measured clean (energy off its harmonics 43 dB under the
     * energy on them over the lap), the only background left was this noise
     * bed, and its 0.085 floor and 0.17 prop wash term kept it running at a
     * hover and through every slow corner. Both are gone: the air is heard
     * when the quad is moving through it, rising with the square of
     * airspeed, at 0.355 where it was 0.71.
     */
    this.noiseGain.gain.setTargetAtTime(WIND_RUSH_GAIN * rush * rush, t, 0.06);
    /* The bed. Ticked from here so a paused element is restarted while
     * the mix is live, and so the probe still exercises the same update. */
    this.music.tick(t);
  }
}
