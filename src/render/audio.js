/*
 * audio.js: motor noise, as a flight instrument.
 *
 * Pilots fly quads by ear as much as by eye: the blade pass tone tells you
 * what the throttle is doing before the picture does, and the beat between
 * four slightly different motor speeds is what makes a quad sound like a
 * quad instead of a drone. So this is per motor, driven by that motor's
 * own RPM, not a single throttle-scaled loop.
 *
 * Chain per motor: a sawtooth at the blade pass frequency plus one octave
 * partial, through a lowpass whose cutoff tracks RPM. Shared on top: a
 * filtered noise bed for prop wash and airframe rush, scaled by airspeed.
 *
 * On absolute pitch: the plant runs at roughly a third of a real 5 inch
 * quad's RPM, because the hover throttle band in tests/thresholds.json
 * forces the motor into a load dominated regime (argued in PROGRESS.md).
 * RPM_TO_HZ_SCALE corrects the audible register only. It is a display
 * conversion, exactly like the rad/s to RPM in the state block, and it
 * touches nothing in the physics path.
 *
 * The graph is built by attach(ctx), which takes any BaseAudioContext, and
 * update() takes the time to schedule at. Both exist so that
 * scripts/audio-probe.js can build this exact graph on an
 * OfflineAudioContext, drive it from a scripted RPM trace, and render it to
 * a buffer an FFT can read. A claim about the mix with no rendered buffer
 * behind it is a claim about nothing, and there is no way to hear this
 * container. The live path passes no time and reads ctx.currentTime, which
 * is what it did before.
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

const BLADES = 3;            /* 5 x 4.3 x 3 prop, three blades */
const RPM_TO_HZ_SCALE = 2.9; /* register correction only, see header */

export class MotorAudio {
  constructor() {
    this.ctx = null;
    this.motors = [];
    this.enabled = false;
    this.master = null;
    this.noiseGain = null;
    this.level = 0.5; /* mix level, driven by the volume setting */
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

    const master = keep(ctx.createGain());
    master.gain.value = 0.0;
    master.connect(out);
    this.master = master;

    for (let m = 0; m < 4; m += 1) {
      const osc = keep(ctx.createOscillator());
      osc.type = 'sawtooth';
      osc.frequency.value = 120;
      const partial = keep(ctx.createOscillator());
      partial.type = 'square';
      partial.frequency.value = 240;
      const partialGain = keep(ctx.createGain());
      partialGain.gain.value = 0.18;
      const lp = keep(ctx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.Q.value = 0.9;
      const gain = keep(ctx.createGain());
      gain.gain.value = 0.0;
      /* Spread the four motors across the stereo field so the beating
       * between them is audible, the way it is behind real goggles. */
      const pan = ctx.createStereoPanner ? keep(ctx.createStereoPanner()) : null;
      if (pan) {
        pan.pan.value = [0.45, 0.32, -0.45, -0.32][m];
      }
      osc.connect(lp);
      partial.connect(partialGain);
      partialGain.connect(lp);
      lp.connect(gain);
      if (pan) {
        gain.connect(pan);
        pan.connect(master);
      } else {
        gain.connect(master);
      }
      osc.start();
      partial.start();
      this.motors.push({ osc, partial, lp, gain });
    }

    /* Air rush: one second of deterministic noise, looped. */
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
    nf.type = 'bandpass';
    nf.frequency.value = 700;
    nf.Q.value = 0.5;
    const ng = keep(ctx.createGain());
    ng.gain.value = 0.0;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(master);
    noise.start();
    this.noiseGain = ng;
  }

  toggle() {
    if (!this.ctx) {
      this.start();
      return this.enabled;
    }
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /* rpm is the four motor RPM values, speed is airspeed in m/s. atTime is
   * the context time to schedule at, for offline rendering; the live path
   * omits it and gets ctx.currentTime. */
  update(rpm, speed, atTime) {
    if (!this.ctx || !this.master) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    const target = this.enabled ? this.level : 0.0;
    this.master.gain.setTargetAtTime(target, t, 0.05);
    if (!this.enabled) {
      return;
    }
    let loudest = 0;
    for (let m = 0; m < 4; m += 1) {
      const r = Math.max(0, rpm[m]);
      const hz = (r / 60) * BLADES * RPM_TO_HZ_SCALE;
      const node = this.motors[m];
      /* setTargetAtTime, not linearRamp: the ear hears a step in
       * frequency as a click, and the motors change fast. */
      node.osc.frequency.setTargetAtTime(Math.min(hz, 4200), t, 0.012);
      node.partial.frequency.setTargetAtTime(Math.min(hz * 2, 8000), t, 0.012);
      node.lp.frequency.setTargetAtTime(Math.min(600 + hz * 3.2, 9000), t, 0.03);
      const loud = Math.min(1, r / 9000);
      node.gain.gain.setTargetAtTime(0.02 + 0.2 * loud * loud, t, 0.03);
      loudest = Math.max(loudest, loud);
    }
    const rush = Math.min(1, speed / 32);
    this.noiseGain.gain.setTargetAtTime(0.012 + 0.1 * rush * rush + 0.03 * loudest, t, 0.06);
  }
}
