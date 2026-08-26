/*
 * cli.js: one wiki page per Betaflight 4.5.1 catalog field.
 *
 * LIVE, GATED and APPLIED_INERT keys have authored copy in this file.
 * INERT and ABSENT keys use a family template plus the catalog reason, so
 * a VTX channel is not described as if it were a PID, and a grey key never
 * claims to fly.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  FEATURES,
  FIELDS,
  STATUS,
  TABS,
  fieldBounds,
  lookupValues,
} from '../fc/catalog.js';

function copy({
  title, air, lab, sim, upAir, upLab, downAir, downLab, related, figure,
}) {
  return {
    title,
    air,
    lab,
    sim,
    upAir,
    upLab,
    downAir,
    downLab,
    related: related || [],
    figure: figure || null,
  };
}

function axisNoun(axis) {
  if (axis === 'roll') {
    return { axis, Axis: 'Roll', motion: 'rolling', stick: 'the right stick left and right', mixer: 'the left/right motor pairs' };
  }
  if (axis === 'pitch') {
    return { axis, Axis: 'Pitch', motion: 'pitching', stick: 'the right stick forward and back', mixer: 'the front/rear motor pairs' };
  }
  return { axis, Axis: 'Yaw', motion: 'yawing', stick: 'the left stick left and right', mixer: 'the clockwise versus counter-clockwise pairs' };
}

const AUTHORED = {};

function put(key, spec) {
  AUTHORED[key] = spec;
}

for (const axis of ['roll', 'pitch', 'yaw']) {
  const a = axisNoun(axis);
  put(`p_${axis}`, copy({
    title: `P ${a.axis}`,
    figure: 'pid',
    related: ['control-pid', `cli-i_${axis}`, `cli-d_${axis}`, `cli-f_${axis}`],
    air: `P is the immediate shove on ${a.axis}. When the craft is not ${a.motion} at the rate you asked, P pushes ${a.mixer} harder in proportion to how far off you are. It is the gain people mean when they say the quad is snappy or lazy.`,
    lab: `In compiled pid.c the P term is Kp times (setpoint minus filtered gyro) on the ${a.axis} axis, in firmware units, not SI. The output is mixed onto the ${a.axis} mixer column. P does not remember; a constant disturbance (nose-up at speed, motor cant) is I's job.`,
    sim: `LIVE. Writes pidProfiles(0)->pid[PID_${a.Axis.toUpperCase()}].P. The plant never reads this number. It only sees motor duty after mixTable.`,
    upAir: `${a.Axis} starts sooner. Small moves on ${a.stick} feel more connected. Past a point the craft buzzes, especially on punch when the gyro hash is loud.`,
    upLab: `Higher Kp raises closed-loop bandwidth and shrinks tracking lag. It also amplifies whatever noise survived the gyro filter. Damping ratio falls; the D term has to work harder. On yaw, extra P is often cheaper than extra D because yaw D is noisy.`,
    downAir: `${a.Axis} feels soft and late. You wait for the craft, then you over-move the stick.`,
    downLab: `Lower Kp increases the time to reject a rate error. I winds more. Feedforward can hide this on stick moves and still leave disturbance rejection poor.`,
  }));
  put(`i_${axis}`, copy({
    title: `I ${a.axis}`,
    figure: 'pid',
    related: ['control-pid', `cli-p_${axis}`, 'cli-iterm_relax', 'cli-anti_gravity_gain'],
    air: `I is memory on ${a.axis}. If a rate error sits there (the nose wanting to come up at speed, a slightly canted motor), I keeps pushing until it is gone. You meet it as trim you do not have to hold.`,
    lab: `Integral of error, with itermLimit, iterm_windup, iterm_relax and iterm_rotation all LIVE and able to stop or rotate that accumulator. Anti-gravity boosts I during fast throttle changes so a punch does not bow. A constant plant couple (H-force above the CG on pitch) is exactly what this term exists to cancel.`,
    sim: `LIVE. Writes the I gain on PID_${a.Axis.toUpperCase()}. The cant table's hover yaw bias is a worked example: I trims it, as a real machine would.`,
    upAir: `${a.Axis} holds a line better and fights the nose-up or drift you would otherwise hold out of. Too much and the craft lurches when you stop a flip, unless relax is doing its job.`,
    upLab: `Higher Ki reduces steady-state rate error and winds faster. The unwind is the danger: a large accumulator dumped into the mixer is a twitch. Relax, windup percent and the limit exist to bound that.`,
    downAir: `You will hold a little ${a.axis} trim forever. Fast moves may still look fine because P and F handle those.`,
    downLab: `Lower Ki leaves residual error. On pitch, the 20 mm disc height plus H-force is a persistent couple; starving I makes high-speed flight a constant push.`,
  }));
  put(`d_${axis}`, copy({
    title: `D ${a.axis}`,
    figure: 'pid',
    related: ['control-pid', 'control-filters', `cli-d_min_${axis === 'yaw' ? 'yaw' : axis}`, 'cli-dterm_lpf1_static_hz'],
    air: `D is the brakes on ${a.axis}. It opposes a rate error that is changing fast, which is how overshoot dies. It also hears every rattle in the gyro, which is why D has its own filter and why a quiet sim makes D look free.`,
    lab: `Kd times a filtered derivative of gyro, not of error, so a clean stick move is not punished. d_min_* (D max in the UI) can keep a low hover D and raise D when the stick slams. TPA often attenuates D at high throttle. Yaw D is frequently low on real 5 inches.`,
    sim: `LIVE. Gyro hash in bf_glue.c is why this gain is not free here. If you raise D and the craft buzzes on punch, cut less filter than you think, or you will take a tune that only works in a browser.`,
    upAir: `Stops ${a.motion} more cleanly. Too much is a grinding buzz you can hear in the motors and see in the picture.`,
    upLab: `Adds damping to the rate loop and gain at high frequency. Past the phase margin the axis oscillates at a few tens of hertz, which the D filter then either hides or feeds.`,
    downAir: `${a.Axis} overshoots a stop and feels bouncy. Snap-back when you centre the stick.`,
    downLab: `Lower Kd drops damping. Aero rate damping in the plant still exists; starving D is less catastrophic here than on a plant with no inflow derivative, but it is still a worse stop.`,
  }));
  put(`f_${axis}`, copy({
    title: `Feedforward ${a.axis}`,
    related: ['control-ff', 'physics-radio', `cli-p_${axis}`, 'cli-feedforward_smooth_factor'],
    air: `Feedforward on ${a.axis} starts the motors when you move ${a.stick}, before the gyro has had time to be wrong. It is the connected feeling. It is also the first thing a jittery radio makes ugly.`,
    lab: `F gain on the setpoint derivative after averaging, smoothing, jitter attenuation, boost and max-rate limit. Not an error term. A perfect 250 Hz grid makes this derivative cleaner than ExpressLRS will.`,
    sim: `LIVE. Writes pid[].F. Tune F on the ELRS 250 Hz link preset if you actually fly ELRS, or you will ship a twitchy dump.`,
    upAir: `${a.Axis} leads the stick. Too much overshoots, especially at the start of a move.`,
    upLab: `Higher F reduces P's workload on stick tracking and can hide a low P in plots. Disturbance rejection does not improve. Jitter becomes motor activity.`,
    downAir: `You wait a beat after the stick. The craft feels like it thinks about it.`,
    downLab: `Tracking lag returns to P and the motor lag. That is honest, and it is how many people still fly.`,
  }));
}

put('d_min_roll', copy({
  title: 'D min roll (D max)',
  related: ['control-pid', 'cli-d_roll', 'cli-d_max_gain'],
  air: 'D min is the D you want in a hover, when you are not slamming the stick. Betaflight\'s UI now says D max for the high value; the CLI still says d_min for the low value. The firmware blends toward full D as setpoint acceleration rises.',
  lab: 'd_min[FD_ROLL] in the PID profile. d_max_gain and d_max_advance control how fast and how far D is allowed to climb from this floor toward d_roll. Hover D can be low (less noise) while a flick still gets damping.',
  sim: 'LIVE. Same plant as d_roll; this only changes when the extra D is used.',
  upAir: 'More D even when you are not throwing the stick. Quieter if you then lower d_roll. Noisier if you do not.',
  upLab: 'Raises the floor of the D scheduler. The blend has less room to work.',
  downAir: 'Hover gets calmer. Flicks may bounce unless d_roll and d_max_gain are doing the job.',
  downLab: 'A low floor with a high d_roll is the intended shape: D where you pay for it.',
}));
put('d_min_pitch', copy({
  title: 'D min pitch (D max)',
  related: ['control-pid', 'cli-d_pitch', 'cli-d_max_gain'],
  air: 'The pitch-axis copy of D min. Pitch often wants a little more D than roll because the craft is longer that way and the camera makes pitch error more visible.',
  lab: 'd_min[FD_PITCH]. Same scheduler as roll. Pitch also carries the nose-up H-force couple, so the D you feel on a stop is mixed with I unwinding that couple.',
  sim: 'LIVE.',
  upAir: 'Pitch stops harder in slow flight, and may buzz in a hover if gyro hash is up.',
  upLab: 'Same as roll, on FD_PITCH.',
  downAir: 'Pitch bounce on a flip stop. The picture nods.',
  downLab: 'Floor down, rely on d_pitch during slams.',
}));
put('d_min_yaw', copy({
  title: 'D min yaw (D max)',
  related: ['control-pid', 'cli-d_yaw', 'physics-yaw'],
  air: 'Yaw D min. Many real 5 inches run yaw D at zero and never miss it. Yaw measurement is dirty and yaw is slow anyway.',
  lab: 'd_min[FD_YAW]. If d_yaw is already 0, this field does nothing useful.',
  sim: 'LIVE. The plant\'s yaw damping from drag torque is the physical brake; yaw D is optional.',
  upAir: 'Usually a hiss, not a better stop.',
  upLab: 'Adds a noisy derivative to an axis whose mixer is already torque-poor.',
  downAir: 'Typical, and often correct.',
  downLab: 'Prefer 0 unless a log shows a real yaw overshoot that filters cannot explain.',
}));
put('d_max_gain', copy({
  title: 'D max gain',
  related: ['cli-d_min_roll', 'control-pid'],
  air: 'How aggressively D is allowed to climb from D min toward D as you throw the stick.',
  lab: 'd_min_gain in the profile. Larger means the blend reaches d_* sooner for a given setpoint acceleration.',
  sim: 'LIVE.',
  upAir: 'Flicks get their D faster. Hover stays on D min if the floor is low.',
  upLab: 'Higher gain on the D scheduler. Can make D look like it is always on if you fly busily.',
  downAir: 'D stays near the min unless you really slam it.',
  downLab: 'Slower blend. A timid stick never reaches d_roll.',
}));
put('d_max_advance', copy({
  title: 'D max advance',
  related: ['cli-d_max_gain', 'control-pid'],
  air: 'How early the D scheduler starts climbing, relative to the stick move.',
  lab: 'd_min_advance. It is a timing knob on the same blend as d_max_gain, not a second D term.',
  sim: 'LIVE.',
  upAir: 'D arrives sooner in a move. Can feel like extra P at the start of a flick.',
  upLab: 'Advances the D max envelope. Interacts with feedforward, which is also a start-of-move effect.',
  downAir: 'D max waits. The stop at the end of a move still sees d_* if the blend has caught up.',
  downLab: 'Later envelope. Useful if early D is feeding stick jitter.',
}));

function lpfPut(key, title, where, related) {
  put(key, copy({
    title,
    figure: 'filters',
    related,
    air: `A low-pass on ${where}. Lower Hz means more smoothing and more delay. The PID becomes later and calmer. Zero on some of these fields means the filter is off.`,
    lab: 'Filter type is PT1, BIQUAD, PT2 or PT3. Static Hz is the cutoff. Dynamic min/max/expo, when set, move that cutoff with throttle or dynamic lpf logic in gyro_init / pid_init. A 1 kHz loop cannot cut what it cannot sample; this is still a phase-delay knob on the 0 to 500 Hz content that exists.',
    sim: 'LIVE. Gyro path is compiled gyro.c. D-term path is compiled pid_init.c. The shake they are smoothing is injected in bf_glue.c, not in the rigid body.',
    upAir: 'If this is a cutoff in Hz, raising it lets more noise through and costs less delay. The craft feels more connected and more raw.',
    upLab: 'Higher cutoff, less phase lag, more D-term hash. Measure in a punch, not a hover.',
    downAir: 'Smoother, later, easier to fly badly. Too low and the craft feels like it is in gravy.',
    downLab: 'More lag in the loop. You will often raise P to compensate and then oscillate. Do not.',
  }));
}

lpfPut('gyro_lpf1_type', 'Gyro LPF1 type', 'the first gyro low-pass', ['control-filters', 'cli-gyro_lpf1_static_hz']);
lpfPut('gyro_lpf1_static_hz', 'Gyro LPF1 Hz', 'the first gyro low-pass', ['control-filters', 'physics-gyro']);
lpfPut('gyro_lpf2_type', 'Gyro LPF2 type', 'the second gyro low-pass', ['control-filters', 'cli-gyro_lpf2_static_hz']);
lpfPut('gyro_lpf2_static_hz', 'Gyro LPF2 Hz', 'the second gyro low-pass', ['control-filters']);
lpfPut('gyro_lpf1_dyn_min_hz', 'Gyro LPF1 dyn min Hz', 'dynamic gyro LPF1 at low demand', ['cli-gyro_lpf1_dyn_max_hz']);
lpfPut('gyro_lpf1_dyn_max_hz', 'Gyro LPF1 dyn max Hz', 'dynamic gyro LPF1 at high demand', ['cli-gyro_lpf1_dyn_min_hz']);
put('gyro_lpf1_dyn_expo', copy({
  title: 'Gyro LPF1 dyn expo',
  related: ['cli-gyro_lpf1_dyn_min_hz', 'control-filters'],
  air: 'How the dynamic gyro filter interpolates between min and max Hz. Higher expo holds the quieter (lower) end longer.',
  lab: 'gyro_lpf1_dyn_expo, 0 to 10. The dynamic LPF is compiled. Expo is a curve on the throttle-or-dynamic index, not a second filter.',
  sim: 'LIVE.',
  upAir: 'Stays filtered longer as you add throttle.',
  upLab: 'More weight on the min Hz end of the blend.',
  downAir: 'Opens up sooner toward max Hz.',
  downLab: 'Near-linear blend at 0.',
}));
put('gyro_notch1_hz', copy({
  title: 'Gyro notch 1 Hz',
  related: ['control-filters', 'cli-gyro_notch1_cutoff'],
  air: 'Centre of a static notch on the gyro. Put it on a whistle that does not move with RPM (a frame mode). Zero disables.',
  lab: 'gyro_soft_notch_hz_1. A notch without a matching cutoff is incomplete. RPM-proportional lines belong in the RPM filter, not here.',
  sim: 'LIVE. Imbalance lines move with RPM, so a static notch can only help a fixed peak.',
  upAir: 'Moves the notch up the spectrum.',
  upLab: 'If you miss the peak, you pay delay for nothing.',
  downAir: 'Moves down, or off at 0.',
  downLab: '0 is off. Do not leave a 1 Hz notch as a "barely on" experiment.',
}));
put('gyro_notch1_cutoff', copy({
  title: 'Gyro notch 1 cutoff',
  related: ['cli-gyro_notch1_hz'],
  air: 'Width of notch 1. Closer to the centre Hz is narrower and gentler. Further is a wider bite.',
  lab: 'gyro_soft_notch_cutoff_1. Classic biquad notch geometry as in Betaflight\'s filter.c.',
  sim: 'LIVE.',
  upAir: 'Wider notch if you are moving away from centre. Check the pair together.',
  upLab: 'Cutoff relative to Hz sets Q. Read both fields before you spin them independently.',
  downAir: 'Narrower, if still below the centre.',
  downLab: 'A cutoff equal to Hz is a degenerate notch.',
}));
put('gyro_notch2_hz', copy({
  title: 'Gyro notch 2 Hz',
  related: ['cli-gyro_notch1_hz', 'cli-gyro_notch2_cutoff'],
  air: 'Second static gyro notch. Same idea as notch 1, for a second fixed peak.',
  lab: 'gyro_soft_notch_hz_2.',
  sim: 'LIVE.',
  upAir: 'Moves the second notch up.',
  upLab: 'Two static notches are two delay bills. Prefer RPM filter for moving lines.',
  downAir: 'Down, or off at 0.',
  downLab: '0 disables.',
}));
put('gyro_notch2_cutoff', copy({
  title: 'Gyro notch 2 cutoff',
  related: ['cli-gyro_notch2_hz'],
  air: 'Width of notch 2.',
  lab: 'gyro_soft_notch_cutoff_2.',
  sim: 'LIVE.',
  upAir: 'Wider or narrower depending on the centre. Treat as a pair.',
  upLab: 'Same geometry as notch 1.',
  downAir: 'Same.',
  downLab: 'Same.',
}));

lpfPut('dterm_lpf1_type', 'D-term LPF1 type', 'the first D-term low-pass', ['control-filters', 'cli-d_roll']);
lpfPut('dterm_lpf1_static_hz', 'D-term LPF1 Hz', 'the first D-term low-pass', ['control-filters']);
lpfPut('dterm_lpf2_type', 'D-term LPF2 type', 'the second D-term low-pass', ['control-filters']);
lpfPut('dterm_lpf2_static_hz', 'D-term LPF2 Hz', 'the second D-term low-pass', ['control-filters']);
lpfPut('dterm_lpf1_dyn_min_hz', 'D-term LPF1 dyn min Hz', 'dynamic D LPF at low demand', ['cli-dterm_lpf1_dyn_max_hz']);
lpfPut('dterm_lpf1_dyn_max_hz', 'D-term LPF1 dyn max Hz', 'dynamic D LPF at high demand', ['cli-dterm_lpf1_dyn_min_hz']);
put('dterm_lpf1_dyn_expo', copy({
  title: 'D-term LPF1 dyn expo',
  related: ['cli-dterm_lpf1_dyn_min_hz'],
  air: 'Expo on the D-term dynamic filter blend, same idea as the gyro one.',
  lab: 'dterm_lpf1_dyn_expo.',
  sim: 'LIVE.',
  upAir: 'Holds the calmer cutoff longer.',
  upLab: 'Weight on min Hz.',
  downAir: 'Opens sooner.',
  downLab: 'Linear blend at 0.',
}));
put('dterm_notch_hz', copy({
  title: 'D-term notch Hz',
  related: ['cli-dterm_notch_cutoff', 'control-filters'],
  air: 'A static notch on the D branch only. Use it for a D-specific whistle you do not want to pay for on P. Zero off.',
  lab: 'dterm_notch_hz in the PID profile, pid_init.c.',
  sim: 'LIVE.',
  upAir: 'Moves the D notch up.',
  upLab: 'D is where noise becomes motor heat. A well-placed D notch can let you raise D. A misplaced one just delays the stop.',
  downAir: 'Down or off.',
  downLab: '0 disables.',
}));
put('dterm_notch_cutoff', copy({
  title: 'D-term notch cutoff',
  related: ['cli-dterm_notch_hz'],
  air: 'Width of the D-term notch.',
  lab: 'dterm_notch_cutoff.',
  sim: 'LIVE.',
  upAir: 'Treat as a pair with the centre Hz.',
  upLab: 'Q geometry as other notches.',
  downAir: 'Same.',
  downLab: 'Same.',
}));
put('yaw_lowpass_hz', copy({
  title: 'Yaw low-pass Hz',
  related: ['control-filters', 'cli-p_yaw', 'physics-gyro'],
  air: 'Extra smoothing on yaw only. Yaw is a dirty axis. This lets you filter it without making roll and pitch gravy.',
  lab: 'yaw_lowpass_hz. 0 is off. It is in addition to the gyro LPF.',
  sim: 'LIVE. Glue yaw vibration is 0.5 of the in-plane line, a chosen coupling. This filter is still the right place to spend delay if yaw D is noisy.',
  upAir: 'If raising Hz: less extra yaw filter. If you meant "more smoothing", lower it.',
  upLab: 'Cutoff up, less yaw lag.',
  downAir: 'Yaw feels later and calmer.',
  downLab: 'More yaw phase lag. Yaw P will start to feel disconnected if you go too low.',
}));

const RPM = (key, title, air, lab, upA, upL, downA, downL) => {
  put(key, copy({
    title,
    figure: 'filters',
    related: ['control-filters', 'physics-gyro', 'cli-rpm_filter_q'],
    air,
    lab,
    sim: 'LIVE. RPM filter is compiled. getMotorFrequencyHz injects each rotor\'s Hz with telemetry-like lag. Harmonics of the once-per-rev imbalance lines are what it can catch. Blade passing is not in the glue, so the third harmonic is a guess about a line that is not modelled.',
    upAir: upA,
    upLab: upL,
    downAir: downA,
    downLab: downL,
  }));
};
RPM(
  'rpm_filter_harmonics',
  'RPM filter harmonics',
  'How many multiples of motor RPM to notch. 1 is the once-per-rev wobble. 2 and 3 are twice and three times that.',
  'rpm_filter_harmonics. Each harmonic is a tracking notch. More harmonics is more delay and more chance of notching something useful.',
  'Notches more of the spectrum around RPM. Can calm a bent bell. Can also eat authority.',
  'More SDFT/notch work at 1 kHz. Diminishing returns past the lines that actually exist.',
  'Fewer notches. Cleaner loop, dirtier gyro at those multiples.',
  '1 is the imbalance line this sim actually injects.',
);
RPM(
  'rpm_filter_weights_1',
  'RPM filter weight, harmonic 1',
  'How hard the first RPM notch bites. 0 leaves that harmonic alone.',
  'rpm_filter_weights[0]. Export uses the array form a 4.5 Configurator accepts.',
  'Stronger 1st harmonic notch.',
  'Higher weight, more attenuation at rotor Hz.',
  'Weaker. 0 is off for this harmonic.',
  'A zero weight is the honest "I do not want this harmonic."',
);
RPM(
  'rpm_filter_weights_2',
  'RPM filter weight, harmonic 2',
  'Bite of the second harmonic notch.',
  'rpm_filter_weights[1].',
  'Stronger 2nd harmonic notch.',
  'There is no guaranteed 2× line in this glue. You may be paying delay for a hole in a flat spectrum.',
  'Weaker or off.',
  'Prefer evidence from a log. This sim\'s injected spectrum is 1× plus broadband.',
);
RPM(
  'rpm_filter_weights_3',
  'RPM filter weight, harmonic 3',
  'Bite of the third harmonic notch. A triblade\'s blade passing would live near here on a real machine. This sim does not inject it.',
  'rpm_filter_weights[2].',
  'Stronger 3rd. On a real triblade this can be the money notch. Here it is mostly delay.',
  'Blade passing was explicitly not modelled (Nyquist and dominance of 1×).',
  'Weaker or off.',
  'Off is consistent with the plant.',
);
RPM(
  'rpm_filter_min_hz',
  'RPM filter min Hz',
  'Below this, the RPM notches fade out. Idle should still be covered if you care about hover hash.',
  'rpm_filter_min_hz. Fade range then blends.',
  'Notches start higher. Low RPM is unfiltered by RPM notches.',
  'Hover may get noisier. Punch unchanged if already above min.',
  'Notches reach lower RPM. More delay in a descent idle.',
  'Too low and you notch near DC, which is not a vibration, it is a manoeuvre.',
);
put('rpm_filter_fade_range_hz', copy({
  title: 'RPM filter fade range Hz',
  related: ['cli-rpm_filter_min_hz'],
  air: 'How wide the blend is when RPM notches turn on above min Hz.',
  lab: 'rpm_filter_fade_range_hz.',
  sim: 'LIVE.',
  upAir: 'Softer, wider fade-in.',
  upLab: 'More Hz of partial notching.',
  downAir: 'Snappier on/off of the RPM notches.',
  downLab: 'A step in delay as motors pass min Hz.',
}));
put('rpm_filter_q', copy({
  title: 'RPM filter Q',
  related: ['cli-rpm_filter_harmonics', 'control-filters'],
  air: 'Narrow versus wide RPM notches. High Q is a thin cut. Low Q is a wide bite with more delay.',
  lab: 'rpm_filter_q. Same Q idea as other biquads: centre / bandwidth.',
  sim: 'LIVE. The imbalance lines are thin. High Q can hit them. Low Q is a blunt instrument.',
  upAir: 'Narrower notches, less collateral delay, easier to miss the line.',
  upLab: 'High Q, low bandwidth.',
  downAir: 'Wider, safer, later.',
  downLab: 'Low Q eats neighbours.',
}));
put('rpm_filter_lpf_hz', copy({
  title: 'RPM filter LPF Hz',
  related: ['cli-rpm_filter_q'],
  air: 'Smoothing on the RPM estimate the notches track. Too low and the notches lag a punch. Too high and they twitch with hash.',
  lab: 'rpm_filter_lpf_hz on the frequency tracker, not on the gyro.',
  sim: 'LIVE. The plant RPM is exact; the glue still lags it like telemetry, and this LPF lags it more.',
  upAir: 'Notches follow RPM faster, and may wiggle.',
  upLab: 'Tracker bandwidth up.',
  downAir: 'Notches trail a punch. You notch where the motor was.',
  downLab: 'Tracker bandwidth down.',
}));

for (const [key, title, air] of [
  ['dyn_notch_count', 'Dynamic notch count', 'How many peaks the dynamic notch is allowed to chase.'],
  ['dyn_notch_q', 'Dynamic notch Q', 'Narrow versus wide dynamic notches.'],
  ['dyn_notch_min_hz', 'Dynamic notch min Hz', 'Low edge of the band the dynamic notch is allowed to hunt in.'],
  ['dyn_notch_max_hz', 'Dynamic notch max Hz', 'High edge of that hunt band.'],
]) {
  put(key, copy({
    title,
    related: ['control-filters', 'start-honesty', 'physics-gyro'],
    air: `${air} On a real 8 kHz board this is a hunting spectrogram filter. It is one of the reasons modern 5 inches can run more D than 2018 could.`,
    lab: 'Compiled dyn_notch_filter.c. Betaflight refuses to arm it below DYN_NOTCH_UPDATE_MIN_HZ (2 kHz) because SDFT resolution at 1 kHz is not useful. This build is 1 kHz by contract.',
    sim: 'GATED. The keys write the real PG so a dump round-trips. At 1 kHz the firmware does what a 1 kHz board does: nothing. Raising the loop rate to un-grey this is a human decision, not a wiki suggestion to hack the step.',
    upAir: 'Would hunt more or differently on an 8 kHz board. Here you will not feel a change in the air.',
    upLab: 'PG value changes. SDFT stays disarmed. Trace should not move. scripts/fc-trace.js exists to keep that honest.',
    downAir: 'Same: no flight change here.',
    downLab: 'Same.',
  }));
}

put('pid_process_denom', copy({
  title: 'PID process denom',
  related: ['physics-timestep', 'start-honesty'],
  air: 'On a real board this divides the PID rate from the gyro rate. 1 means they match. 4 means PID at a quarter of gyro.',
  lab: 'pidConfig.pid_process_denom. The plant step is 1 kHz. bf_config_finish forces this back to 1 after applying a dump so a diff cannot silently desynchronise the compiled loop from the plant.',
  sim: 'GATED. Stored, then forced to 1. The value you read back after init is 1.',
  upAir: 'Would slow PID on a board that honours it. Not here.',
  upLab: 'Applied then overwritten. Do not use this to "make D easier."',
  downAir: '1 is the only honest value in this sim.',
  downLab: 'Forced.',
}));

put('iterm_relax', copy({
  title: 'I-term relax',
  related: ['control-pid', 'cli-iterm_relax_cutoff'],
  air: 'Stops I winding during a fast stick move, so a flip does not store a punch for when you stop. OFF, RP, RPY, or the _INC variants that only relax while I would increase.',
  lab: 'itermRelax_e in pid.h. GYRO versus SETPOINT types in iterm_relax_type choose which signal\'s high-pass gates the relax.',
  sim: 'LIVE.',
  upAir: 'Not a numeric raise; cycling toward RPY relaxes more axes. More protection, less I during the move.',
  upLab: 'RPY includes yaw. _INC is less aggressive because it still allows unwind.',
  downAir: 'Toward OFF: I fights you through a flip and spits on the stop.',
  downLab: 'OFF is the historical default and a common source of "why did it twitch after the roll."',
}));
put('iterm_relax_type', copy({
  title: 'I-term relax type',
  related: ['cli-iterm_relax'],
  air: 'GYRO: relax when the craft is actually rotating fast. SETPOINT: relax when you ask it to. Setpoint is stick-driven and works even if the craft has not caught up.',
  lab: 'itermRelaxType_e.',
  sim: 'LIVE.',
  upAir: 'N/A as a number. SETPOINT is usually what people want for acro.',
  upLab: 'SETPOINT high-pass on the rates demand.',
  downAir: 'GYRO waits for the plant, so a late craft still winds I.',
  downLab: 'GYRO is the older idea.',
}));
put('iterm_relax_cutoff', copy({
  title: 'I-term relax cutoff Hz',
  related: ['cli-iterm_relax'],
  air: 'How fast a move has to be before relax kicks in. Lower Hz means even leisurely stick moves suppress I.',
  lab: 'High-pass cutoff on the relax detector.',
  sim: 'LIVE.',
  upAir: 'Only violent moves relax I. Smooth flying keeps I working.',
  upLab: 'Higher cutoff, less relax.',
  downAir: 'I gives up earlier. Tracking a slow push may sag.',
  downLab: 'Lower cutoff, more relax.',
}));
put('iterm_windup', copy({
  title: 'I-term windup',
  related: ['cli-iterm_limit', 'control-pid'],
  air: 'Stops I accumulating when the motors are already pinned. A percentage of motor range. Without this, a punch that saturates the mixer stores a huge I and then spits.',
  lab: 'itermWindupPointPercent.',
  sim: 'LIVE. Airmode and motor limits change when you hit this point.',
  upAir: 'I keeps working closer to saturation. Risk of a bigger spit if you still hit the wall.',
  upLab: 'Higher percent, later freeze.',
  downAir: 'I freezes sooner, safer, maybe more droop in a long saturated roll.',
  downLab: 'Earlier freeze.',
}));
put('iterm_limit', copy({
  title: 'I-term limit',
  related: ['cli-iterm_windup'],
  air: 'A cap on how large I is allowed to grow, in firmware units. The last line of defence against a stored punch.',
  lab: 'itermLimit, uint16.',
  sim: 'LIVE.',
  upAir: 'I can trim a larger constant error (more nose-up authority). A bigger possible spit.',
  upLab: 'Higher clamp.',
  downAir: 'Safer, and it may not trim a strong couple.',
  downLab: 'The H-force pitch couple is a test of whether this is too small.',
}));
put('iterm_rotation', copy({
  title: 'I-term rotation',
  related: ['control-pid', 'physics-gyroscopic'],
  air: 'Rotates the I vector with the craft so a stored roll I becomes a pitch I as you yaw, matching the error in the world. Some pilots love it. Some find it spooky.',
  lab: 'iterm_rotation OFF/ON. It is a transformation of the I state, not a second gain.',
  sim: 'LIVE.',
  upAir: 'ON: I follows attitude. Useful in slow, mixed moves. Odd in racing flicks for some people.',
  upLab: 'Enables the rotation.',
  downAir: 'OFF: I stays in body axes as accumulated.',
  downLab: 'Default off on many race dumps.',
}));

put('pidsum_limit', copy({
  title: 'PID sum limit',
  related: ['control-mixer', 'cli-pidsum_limit_yaw'],
  air: 'Caps how hard roll and pitch PID may push, so one axis cannot eat the whole motor range. You will spin slower than the rates curve at the stop if you hit this.',
  lab: 'pidSumLimit, typically 500-ish firmware units. Mixer input clamp.',
  sim: 'LIVE.',
  upAir: 'More authority, easier to pin a motor in a combined roll+pitch+throttle.',
  upLab: 'Higher clamp, closer to raw PID.',
  downAir: 'Safer motors, softer max rate than srate suggests.',
  downLab: 'Check 9 assumes you are not clamped. A tiny limit would fail tracking.',
}));
put('pidsum_limit_yaw', copy({
  title: 'PID sum limit yaw',
  related: ['cli-pidsum_limit', 'physics-yaw'],
  air: 'The yaw copy. Yaw is usually limited tighter because it is easy to ask for more yaw than the props can pay for.',
  lab: 'pidSumLimitYaw.',
  sim: 'LIVE.',
  upAir: 'More yaw authority, more chance of starving roll/pitch when you stamp both.',
  upLab: 'Yaw mixer input clamp up.',
  downAir: 'Yaw saturates sooner. The craft will not match a huge yaw rate.',
  downLab: 'Honest with the plant: yaw is torque-poor.',
}));
put('pid_at_min_throttle', copy({
  title: 'PID at min throttle',
  related: ['control-tpa', 'control-mixer'],
  air: 'When ON, PID still moves motors at idle. That is airmode\'s friend. When OFF, idle is idle and a flip at zero throttle is a prayer.',
  lab: 'pidAtMinThrottle. Feature AIRMODE still needs mixer support; this flag is the PID-side gate.',
  sim: 'LIVE.',
  upAir: 'ON: the usual race setting.',
  upLab: 'Enables PID below the idle floor in software, then the mixer clips to idle/dyn idle.',
  downAir: 'OFF: chopping throttle kills authority.',
  downLab: 'A good demo of why airmode exists. A bad race dump.',
}));
put('motor_output_limit', copy({
  title: 'Motor output limit %',
  related: ['cli-throttle_limit_percent', 'control-mixer'],
  air: 'A percentage cap on motor output in the PID profile. Cousin of throttle limit, but it also clips PID, not just the throttle stick.',
  lab: 'motor_output_limit, 1 to 100.',
  sim: 'LIVE.',
  upAir: 'Toward 100: full motors. That is the default.',
  upLab: '100 is off in spirit.',
  downAir: 'Softer aircraft, less punch, more headroom for PID.',
  downLab: 'A 5 inch at 9.2 TWR may still be lively at 80 percent. Do not stack this with throttle SCALE without meaning to.',
}));
put('thrust_linear', copy({
  title: 'Thrust linearisation',
  related: ['control-mixer', 'physics-fm'],
  air: 'Compensation for thrust not being linear with motor output (it goes with RPM squared, and RPM is not linear with duty). Makes stick throttle feel more even.',
  lab: 'thrustLinearization in the PID profile, mixer.c. 0 is off.',
  sim: 'LIVE. The plant really is kt ω², so this compensation is pointed at a real nonlinearity, not a decorative one.',
  upAir: 'More compensation. Hover and punch spacing on the stick changes.',
  upLab: 'Higher percent of the linearisation mix.',
  downAir: 'Toward 0: raw, hover crammed into the bottom of the stick on this 9.2 TWR machine.',
  downLab: '0 is firmware default on many profiles. Racers often prefer throttle SCALE instead.',
}));
put('transient_throttle_limit', copy({
  title: 'Transient throttle limit',
  related: ['control-mixer'],
  air: 'Limits how fast throttle in the mixer is allowed to change, to spare the ESC and the pack a brick-wall punch.',
  lab: 'transient_throttle_limit.',
  sim: 'LIVE. The plant has no ESC current ceiling, so this is one of the few firmware-side current softeners that actually exists here.',
  upAir: 'More limiting: punches feel rounded.',
  upLab: 'Lower slew on mixer throttle.',
  downAir: 'Sharper punches, sillier millisecond current spikes in sim_state.',
  downLab: 'Those spikes still do not reach thrust; rotor lag eats them.',
}));

put('launch_control_mode', copy({
  title: 'Launch control mode',
  related: ['control-mixer', 'cli-launch_control_gain'],
  air: 'NORMAL, PITCHONLY, or FULL. Launch control holds you on the line at idle until throttle passes the trigger. Settings and the L key drive the same feature in this shell.',
  lab: 'launchControlMode. The state machine is in bf_glue.c because core.c is not compiled. The profile fields are real.',
  sim: 'LIVE, via the glue state machine plus pid.c launch gains.',
  upAir: 'Cycling mode changes which axes are held. Not a numeric raise.',
  upLab: 'PITCHONLY is the race favourite: hold pitch, let roll sit.',
  downAir: 'OFF is not this field; mode selects the shape while launch is armed.',
  downLab: 'See Settings Launch control for the on/off the shell owns.',
}));
put('launch_trigger_allow_reset', copy({
  title: 'Launch trigger allow reset',
  related: ['cli-launch_control_mode'],
  air: 'Whether you can back out of a launch trigger and try again without disarming. There is no disarm here, so this is the retry bit.',
  lab: 'launchControlAllowTriggerReset.',
  sim: 'LIVE in the glue machine.',
  upAir: 'ON: you can un-punch and hold again.',
  upLab: 'Reset allowed.',
  downAir: 'OFF: once triggered, you are in it.',
  downLab: 'Stricter.',
}));
put('launch_trigger_throttle_percent', copy({
  title: 'Launch trigger throttle %',
  related: ['cli-launch_control_mode'],
  air: 'How far you must push throttle to leave the launch hold and actually go.',
  lab: 'launchControlThrottlePercent, cap 90.',
  sim: 'LIVE.',
  upAir: 'Harder to trigger. Safer on a twitchy finger.',
  upLab: 'Higher threshold.',
  downAir: 'Leaves the line earlier. Easier to false-start.',
  downLab: 'Lower threshold.',
}));
put('launch_angle_limit', copy({
  title: 'Launch angle limit',
  related: ['cli-launch_control_mode', 'control-angle'],
  air: 'How far launch control will let the attitude wander while holding.',
  lab: 'launchControlAngleLimit, degrees in the firmware field.',
  sim: 'LIVE.',
  upAir: 'More wiggle on the line.',
  upLab: 'Larger allowed error.',
  downAir: 'A firmer hold. May fight a stand that is not level.',
  downLab: 'Tighter.',
}));
put('launch_control_gain', copy({
  title: 'Launch control gain',
  related: ['cli-launch_control_mode'],
  air: 'How hard launch control holds attitude. Too much on a stand and it oscillates. Too little and you sag off the line.',
  lab: 'launchControlGain.',
  sim: 'LIVE.',
  upAir: 'Firmer hold, possible bounce on the foam.',
  upLab: 'Higher gain on the launch P-like term.',
  downAir: 'Softer hold.',
  downLab: 'Lower gain.',
}));

put('anti_gravity_gain', copy({
  title: 'Anti-gravity gain',
  related: ['control-tpa', 'cli-anti_gravity_p_gain'],
  air: 'How much extra I (and the loop around it) you get when throttle changes fast. It exists so a punch does not bow. It is not a G sensor.',
  lab: 'anti_gravity_gain, plus the ANTI_GRAVITY feature flag. mixTable updates the throttle high-pass that drives it.',
  sim: 'LIVE. Feature ANTI_GRAVITY is a separate LIVE feature line.',
  upAir: 'Punches stay flatter. Too much and the craft leaps in attitude when you blip throttle.',
  upLab: 'Larger I boost on throttle transients.',
  downAir: 'Bows on punch. Classic, visible in the camera.',
  downLab: '0 with the feature on is still "almost off." Turning the feature off is the true off.',
}));
put('anti_gravity_cutoff_hz', copy({
  title: 'Anti-gravity cutoff Hz',
  related: ['cli-anti_gravity_gain'],
  air: 'How fast a throttle change must be to count as a punch for anti-gravity. Lower Hz means even lazy throttle moves trigger it.',
  lab: 'anti_gravity_cutoff_hz, the high-pass on throttle.',
  sim: 'LIVE.',
  upAir: 'Only sharp punches trigger AG.',
  upLab: 'Higher cutoff.',
  downAir: 'AG during ordinary flying. I becomes busy.',
  downLab: 'Lower cutoff.',
}));
put('anti_gravity_p_gain', copy({
  title: 'Anti-gravity P gain',
  related: ['cli-anti_gravity_gain'],
  air: 'Optional extra P during the same throttle transients, on top of the I boost.',
  lab: 'anti_gravity_p_gain.',
  sim: 'LIVE.',
  upAir: 'Punch is snappier in attitude, and maybe twitchy.',
  upLab: 'P boost on the AG detector.',
  downAir: 'AG is I-only, the usual shape.',
  downLab: '0 is fine.',
}));

put('feedforward_transition', copy({
  title: 'Feedforward transition',
  related: ['control-ff'],
  air: 'Blends feedforward in as the stick leaves centre, so tiny stick noise does not become motor activity.',
  lab: 'feedforward_transition.',
  sim: 'LIVE.',
  upAir: 'FF waits for a larger stick. Centre is calmer.',
  upLab: 'Higher transition.',
  downAir: 'FF is on even near centre. Connected, maybe busy on a noisy radio.',
  downLab: '0 is always-on FF.',
}));
put('feedforward_averaging', copy({
  title: 'Feedforward averaging',
  related: ['control-ff', 'physics-radio'],
  air: 'Average the stick derivative over 2, 3 or 4 packets. Smoother FF, later FF.',
  lab: 'feedforward_averaging enum OFF, 2_POINT, 3_POINT, 4_POINT.',
  sim: 'LIVE. Perfect link makes this look optional. ELRS makes it look necessary.',
  upAir: 'More points: calmer, later.',
  upLab: 'Longer moving average on d(setpoint).',
  downAir: 'OFF: raw derivative. Sharp on Perfect, nasty on jitter.',
  downLab: 'OFF.',
}));
put('feedforward_smooth_factor', copy({
  title: 'Feedforward smooth factor',
  related: ['cli-feedforward_averaging'],
  air: 'Extra low-pass on feedforward after averaging.',
  lab: 'feedforward_smooth_factor.',
  sim: 'LIVE.',
  upAir: 'Softer FF.',
  upLab: 'More smoothing.',
  downAir: 'Rawer FF.',
  downLab: 'Less smoothing.',
}));
put('feedforward_jitter_factor', copy({
  title: 'Feedforward jitter factor',
  related: ['physics-radio', 'control-ff'],
  air: 'Attenuates small FF spikes that are probably radio jitter rather than a real stick move.',
  lab: 'feedforward_jitter_factor.',
  sim: 'LIVE. On Perfect this does almost nothing useful. On Crossfire it is the difference between motors that sit still and motors that fizz.',
  upAir: 'More jitter rejection, slightly duller tiny moves.',
  upLab: 'Higher attenuation of small d(setpoint).',
  downAir: 'Every packet edge becomes FF.',
  downLab: 'Lower.',
}));
put('feedforward_boost', copy({
  title: 'Feedforward boost',
  related: ['control-ff'],
  air: 'Extra FF at the start of a move, then it settles. The "breakout" feeling.',
  lab: 'feedforward_boost.',
  sim: 'LIVE.',
  upAir: 'Harder initial bite. Can overshoot the first 50 ms.',
  upLab: 'Higher boost envelope.',
  downAir: 'Flatter FF.',
  downLab: '0 is uniform F gain.',
}));
put('feedforward_max_rate_limit', copy({
  title: 'Feedforward max rate limit',
  related: ['control-ff', 'control-rates'],
  air: 'Keeps FF from asking for more rotation than the rates curve allows, as a percent.',
  lab: 'feedforward_max_rate_limit.',
  sim: 'LIVE.',
  upAir: 'Toward 100: FF may lead the rates curve. Sharp, sometimes ahead of what P can catch.',
  upLab: 'Higher percent.',
  downAir: 'FF is capped earlier. Safer, duller.',
  downLab: 'Lower percent.',
}));

put('tpa_mode', copy({
  title: 'TPA mode',
  related: ['control-tpa', 'cli-tpa_rate'],
  air: 'PD: turn down P and D as throttle rises. D: only D. D-only is common on modern 5 inches that want hover P and punch D to be different stories.',
  lab: 'tpaMode_e PD or D.',
  sim: 'LIVE.',
  upAir: 'Not numeric. PD is more TPA, D is narrower.',
  upLab: 'PD attenuates two terms.',
  downAir: 'D mode leaves P alone at high throttle.',
  downLab: 'D.',
}));
put('tpa_rate', copy({
  title: 'TPA rate',
  related: ['control-tpa', 'cli-tpa_breakpoint'],
  air: 'How much to attenuate above the breakpoint, as a percent. 0 is off. 70 is a heavy cut.',
  lab: 'tpa_rate, 0 to 100.',
  sim: 'LIVE. This plant\'s thrust is strongly throttle-dependent (TWR 9.2). TPA is not optional flavour.',
  upAir: 'Softer on punch, more stable, less authority at the top of the stick.',
  upLab: 'Larger attenuation.',
  downAir: 'Hover tune follows you to full throttle. Often a buzz.',
  downLab: '0 disables TPA.',
}));
put('tpa_breakpoint', copy({
  title: 'TPA breakpoint',
  related: ['cli-tpa_rate'],
  air: 'Throttle value where TPA starts, in PWM-ish units (1500 is mid stick in the old scale). Below this, full PID. Above, the cut.',
  lab: 'tpa_breakpoint, uint16.',
  sim: 'LIVE. Hover is near 20 percent on this airframe, so a breakpoint around there versus around 1500 changes whether hover is already attenuated.',
  upAir: 'TPA starts later. Hover and cruise keep more PID.',
  upLab: 'Higher breakpoint.',
  downAir: 'TPA starts earlier. Even a mild climb is attenuated.',
  downLab: 'Lower breakpoint.',
}));
put('tpa_low_rate', copy({
  title: 'TPA low rate',
  related: ['cli-tpa_low_breakpoint', 'control-tpa'],
  air: 'Attenuation at very low throttle, where the props have little authority and a hover-tune D can be too much in a descent.',
  lab: 'tpa_low_rate.',
  sim: 'LIVE.',
  upAir: 'More cut at idle. Descents calmer, maybe mushy yaw.',
  upLab: 'Larger low-throttle attenuation.',
  downAir: 'Full PID at idle. Airmode descents can buzz.',
  downLab: '0 off.',
}));
put('tpa_low_breakpoint', copy({
  title: 'TPA low breakpoint',
  related: ['cli-tpa_low_rate'],
  air: 'Below this throttle, tpa_low applies.',
  lab: 'tpa_low_breakpoint.',
  sim: 'LIVE.',
  upAir: 'Low-TPA region is larger (if the rate is non-zero).',
  upLab: 'Depends on comparison direction; read with tpa_low_always.',
  downAir: 'Narrower low region.',
  downLab: 'See pid.c for the exact inequality. Do not set this equal to tpa_breakpoint and assume it cancels.',
}));
put('tpa_low_always', copy({
  title: 'TPA low always',
  related: ['cli-tpa_low_rate'],
  air: 'Whether low-throttle TPA applies even when you are not in the "low" story the firmware otherwise uses (for example during certain dynamic idle conditions).',
  lab: 'tpa_low_always OFF/ON.',
  sim: 'LIVE.',
  upAir: 'ON: low TPA is more willing to apply.',
  upLab: 'Forces the low branch.',
  downAir: 'OFF: firmware decides.',
  downLab: 'Default off on many profiles.',
}));

put('throttle_boost', copy({
  title: 'Throttle boost',
  related: ['control-mixer'],
  air: 'A kick of extra throttle when you move the stick fast, then it fades. Makes a lazy machine feel awake. On a 9.2 TWR 5 inch it is easy to overdo.',
  lab: 'throttle_boost in mixer.c, a high-pass on throttle added back.',
  sim: 'LIVE.',
  upAir: 'Punchier blips. Can bounce altitude.',
  upLab: 'Larger boost.',
  downAir: '0 is off. Honest stick.',
  downLab: '0.',
}));
put('throttle_boost_cutoff', copy({
  title: 'Throttle boost cutoff Hz',
  related: ['cli-throttle_boost'],
  air: 'How fast a throttle move must be to earn the boost.',
  lab: 'throttle_boost_cutoff.',
  sim: 'LIVE.',
  upAir: 'Only sharp blips boost.',
  upLab: 'Higher cutoff.',
  downAir: 'Even slow throttle gets a kick.',
  downLab: 'Lower cutoff.',
}));

put('acc_limit', copy({
  title: 'Setpoint acceleration limit',
  related: ['control-rates', 'cli-acc_limit_yaw'],
  air: 'Caps how fast the rates setpoint is allowed to change on roll and pitch, in deg/s²-ish firmware units. It is a smoothness cap, not a max rate.',
  lab: 'rateAccelLimit. 0 is off.',
  sim: 'LIVE. processRcCommand path.',
  upAir: 'If raising the cap: faster stick response. If you wanted smoother, lower it.',
  upLab: 'Higher limit, closer to raw stick.',
  downAir: 'Stick is rounded. Flips take a moment to build.',
  downLab: '0 off. Non-zero is a slew on setpoint.',
}));
put('acc_limit_yaw', copy({
  title: 'Setpoint acceleration limit yaw',
  related: ['cli-acc_limit', 'physics-yaw'],
  air: 'The yaw copy. Yaw motors cannot follow a square stick as it is; this admits that.',
  lab: 'yawRateAccelLimit.',
  sim: 'LIVE.',
  upAir: 'Faster yaw setpoint changes.',
  upLab: 'Higher slew cap.',
  downAir: 'Yaw builds. Feels like more motor lag than you have.',
  downLab: 'A moderate yaw accel limit is common even when roll is 0.',
}));

put('abs_control_gain', copy({
  title: 'Absolute control gain',
  related: ['control-pid', 'cli-use_integrated_yaw'],
  air: 'Absolute control tries to keep the craft from drifting heading while you hold a roll, by feeding a yaw correction from the angle it has wandered. Some racers run it at 0. Some freestylers like a little.',
  lab: 'abs_control_gain and its limit/error/cutoff cousins. 0 is off.',
  sim: 'LIVE.',
  upAir: 'More heading hold during rolls. Can fight you in a genuine yaw mix.',
  upLab: 'Higher gain on the abs-control loop.',
  downAir: '0: acro is acro. A roll yaws however the plant couples.',
  downLab: '0 is the race default on many dumps.',
}));
put('abs_control_limit', copy({
  title: 'Absolute control limit',
  related: ['cli-abs_control_gain'],
  air: 'Cap on the yaw correction abs-control may apply.',
  lab: 'abs_control_limit.',
  sim: 'LIVE.',
  upAir: 'Allows a larger correction.',
  upLab: 'Higher clamp.',
  downAir: 'Weaker, safer.',
  downLab: 'Lower clamp.',
}));
put('abs_control_error_limit', copy({
  title: 'Absolute control error limit',
  related: ['cli-abs_control_gain'],
  air: 'How far the heading error is allowed to grow in the abs-control accumulator.',
  lab: 'abs_control_error_limit.',
  sim: 'LIVE.',
  upAir: 'Remembers a larger wander.',
  upLab: 'Higher error cap.',
  downAir: 'Forgets sooner.',
  downLab: 'Lower.',
}));
put('abs_control_cutoff', copy({
  title: 'Absolute control cutoff',
  related: ['cli-abs_control_gain'],
  air: 'Filtering on the abs-control path. Higher is rawer.',
  lab: 'abs_control_cutoff.',
  sim: 'LIVE.',
  upAir: 'Faster abs-control.',
  upLab: 'Higher cutoff Hz-ish.',
  downAir: 'Smoother, later.',
  downLab: 'Lower.',
}));
put('use_integrated_yaw', copy({
  title: 'Integrated yaw',
  related: ['physics-yaw', 'control-mixer'],
  air: 'A mixer mode that treats yaw as an integral of motor difference rather than a direct torque demand. It can make yaw feel more "in the world" and can also feel like yaw lag. Default is off on most race dumps.',
  lab: 'use_integrated_yaw OFF/ON, plus integrated_yaw_relax.',
  sim: 'LIVE if the compiled mixer honours it, which this build does compile.',
  upAir: 'ON: yaw changes character. Try it on grass, not in a gate.',
  upLab: 'Enables the integrated yaw path in pid/mixer.',
  downAir: 'OFF: classic yaw.',
  downLab: 'OFF.',
}));
put('integrated_yaw_relax', copy({
  title: 'Integrated yaw relax',
  related: ['cli-use_integrated_yaw'],
  air: 'Leaks the integrated yaw state so it does not wind forever.',
  lab: 'integrated_yaw_relax.',
  sim: 'LIVE, meaningful when integrated yaw is on.',
  upAir: 'Faster leak, less stored yaw.',
  upLab: 'Higher relax.',
  downAir: 'Yaw integrator holds longer.',
  downLab: 'Lower.',
}));

put('vbat_sag_compensation', copy({
  title: 'VBat sag compensation',
  related: ['physics-sag', 'control-pid'],
  air: 'Firmware turns PID up as the pack sags, so the last minute of a pack feels more like the first. It is a controller trick. It does not add voltage.',
  lab: 'vbat_sag_compensation, 0 off. The glue feeds plant cell voltage into the path Betaflight already has for this.',
  sim: 'LIVE. Pack charge in Settings is the Voc. This scales PID with the sagged reading.',
  upAir: 'More compensation. A sagged pack stays twitchy. A full pack is unchanged.',
  upLab: 'Higher percent.',
  downAir: '0: the plant gets softer as it sags, which is physical, and the PID does not pretend otherwise.',
  downLab: '0 is honest. Non-zero is a feel match to a "pack that does not fall off."',
}));

put('dyn_idle_min_rpm', copy({
  title: 'Dynamic idle min RPM',
  related: ['control-mixer', 'cli-dshot_idle_value', 'physics-motor'],
  air: 'The RPM governor\'s floor. If a motor would drop below this, dynamic idle raises the mixer floor. On a real ESC this fights desync. Here the plant cannot desync, but the loop still runs on real rotor Hz.',
  lab: 'dyn_idle_min_rpm. 0 is off. Units are hundreds of RPM in firmware convention.',
  sim: 'LIVE. getMotorFrequencyHz is the telemetry.',
  upAir: 'Motors refuse to go as slow. Descents are floatier. Harder to fall through. Harder to land softly.',
  upLab: 'Higher RPM floor.',
  downAir: '0 off. Idle is dshot_idle_value only.',
  downLab: '0.',
}));
put('dyn_idle_p_gain', copy({
  title: 'Dynamic idle P',
  related: ['cli-dyn_idle_min_rpm'],
  air: 'How hard the governor pushes when RPM is below the floor.',
  lab: 'dyn_idle_p_gain.',
  sim: 'LIVE.',
  upAir: 'Firmer RPM hold, possible bounce in idle.',
  upLab: 'Higher P.',
  downAir: 'Softer governor.',
  downLab: 'Lower P.',
}));
put('dyn_idle_i_gain', copy({
  title: 'Dynamic idle I',
  related: ['cli-dyn_idle_min_rpm'],
  air: 'Memory in the RPM governor. Trims a lasting droop.',
  lab: 'dyn_idle_i_gain.',
  sim: 'LIVE.',
  upAir: 'Tighter long-term RPM, possible windup.',
  upLab: 'Higher I.',
  downAir: 'Less trim.',
  downLab: 'Lower I.',
}));
put('dyn_idle_d_gain', copy({
  title: 'Dynamic idle D',
  related: ['cli-dyn_idle_min_rpm'],
  air: 'Damping in the RPM governor.',
  lab: 'dyn_idle_d_gain.',
  sim: 'LIVE.',
  upAir: 'Less RPM overshoot, more twitch if noisy.',
  upLab: 'Higher D.',
  downAir: 'Softer.',
  downLab: 'Lower D.',
}));
put('dyn_idle_max_increase', copy({
  title: 'Dynamic idle max increase',
  related: ['cli-dyn_idle_min_rpm'],
  air: 'How far above ordinary idle the governor may raise the floor.',
  lab: 'dyn_idle_max_increase.',
  sim: 'LIVE.',
  upAir: 'Governor can push idle higher. Safer on a real ESC, floatier here.',
  upLab: 'Larger allowed increase.',
  downAir: 'Governor is capped. May not hold min RPM in a hard descent.',
  downLab: 'Smaller cap.',
}));
put('dyn_idle_start_increase', copy({
  title: 'Dynamic idle start increase',
  related: ['cli-dyn_idle_min_rpm'],
  air: 'An initial bump when dynamic idle engages, before the PID takes over.',
  lab: 'dyn_idle_start_increase.',
  sim: 'LIVE.',
  upAir: 'Bigger kick onto the governor.',
  upLab: 'Larger start increase.',
  downAir: 'Gentler engagement.',
  downLab: 'Smaller.',
}));

put('ez_landing_threshold', copy({
  title: 'Ez landing threshold',
  related: ['cli-mixer_type', 'physics-ground'],
  air: 'Used when mixer_type is EZLANDING. How much "I am landing" the mixer needs to see before it starts helping. This is not the shell\'s landing judgement.',
  lab: 'ez_landing_threshold.',
  sim: 'LIVE fields, meaningful only with mixer_type EZLANDING. The shell still decides crash versus perch independently.',
  upAir: 'Harder to trigger ez landing in firmware.',
  upLab: 'Higher threshold.',
  downAir: 'Helps earlier, maybe in a descent you did not mean as a landing.',
  downLab: 'Lower.',
}));
put('ez_landing_limit', copy({
  title: 'Ez landing limit',
  related: ['cli-ez_landing_threshold'],
  air: 'How much the ez-landing mixer may intervene.',
  lab: 'ez_landing_limit.',
  sim: 'LIVE with EZLANDING mixer.',
  upAir: 'Stronger help.',
  upLab: 'Higher limit.',
  downAir: 'Weaker.',
  downLab: 'Lower.',
}));
put('ez_landing_speed', copy({
  title: 'Ez landing speed',
  related: ['cli-ez_landing_threshold'],
  air: 'The descent speed idea ez landing is built around.',
  lab: 'ez_landing_speed.',
  sim: 'LIVE with EZLANDING mixer. Does not replace the shell\'s m/s crash gate.',
  upAir: 'Allows a faster descent in the helper\'s logic.',
  upLab: 'Higher speed field.',
  downAir: 'Helper expects a slower arrival.',
  downLab: 'Lower.',
}));

function crashPut(key, title, air, lab) {
  put(key, copy({
    title,
    related: ['control-pid', 'physics-ground'],
    air,
    lab,
    sim: 'LIVE in pid.c. isFlipOverAfterCrashActive is stubbed false, so crashflip mixer is dead, but crash recovery PID logic can still run if a dump enables it. The shell\'s crash is a separate judgement.',
    upAir: 'Typically more sensitive or longer, depending on the field. Read the name.',
    upLab: 'See pid.c crash recovery. These are not SI.',
    downAir: 'Toward off, or shorter, or less sensitive.',
    downLab: 'crash_recovery OFF is the race default.',
  }));
}
crashPut('crash_recovery', 'Crash recovery', 'OFF, ON, BEEP, DISARM. Firmware tries to save an inverted or slammed craft. Racers leave it off.', 'crash_recovery enum.');
crashPut('crash_dthreshold', 'Crash D threshold', 'D-term spike that counts as a crash.', 'crash_dthreshold.');
crashPut('crash_gthreshold', 'Crash gyro threshold', 'Gyro spike that counts as a crash.', 'crash_gthreshold.');
crashPut('crash_setpoint_threshold', 'Crash setpoint threshold', 'Setpoint activity that disqualifies a crash (you meant it).', 'crash_setpoint_threshold.');
crashPut('crash_time', 'Crash recovery time', 'How long recovery runs.', 'crash_time ms.');
crashPut('crash_delay', 'Crash recovery delay', 'Wait after detection before recovery.', 'crash_delay ms.');
crashPut('crash_recovery_angle', 'Crash recovery angle', 'Attitude target during recovery.', 'crash_recovery_angle.');
crashPut('crash_recovery_rate', 'Crash recovery rate', 'Rate limit during recovery.', 'crash_recovery_rate.');
crashPut('crash_limit_yaw', 'Crash yaw limit', 'Yaw cap during recovery.', 'crash_limit_yaw.');

put('angle_p_gain', copy({
  title: 'Angle P',
  related: ['control-angle', 'cli-angle_limit'],
  air: 'How hard angle mode levels and how hard it tracks a stick tilt. Too much and it oscillates. Too little and it sags.',
  lab: 'pid[PID_LEVEL].P, read by pidLevel when ANGLE_MODE is on.',
  sim: 'LIVE. Keyboard flight raises angle. Acro never reads this.',
  upAir: 'Firmer self-level, twitchier.',
  upLab: 'Higher outer-loop P.',
  downAir: 'Soggy angle mode.',
  downLab: 'Lower P.',
}));
put('angle_feedforward', copy({
  title: 'Angle feedforward',
  related: ['cli-angle_p_gain', 'control-ff'],
  air: 'Feedforward on the angle outer loop, so a stick tilt starts a rate before the attitude error builds.',
  lab: 'pid[PID_LEVEL].F.',
  sim: 'LIVE in angle mode.',
  upAir: 'Angle mode leads the stick.',
  upLab: 'Higher angle F.',
  downAir: 'Waits for error.',
  downLab: 'Lower.',
}));
put('angle_feedforward_smoothing_ms', copy({
  title: 'Angle FF smoothing ms',
  related: ['cli-angle_feedforward'],
  air: 'Smoothing time on angle feedforward.',
  lab: 'angle_feedforward_smoothing_ms.',
  sim: 'LIVE in angle mode.',
  upAir: 'Softer angle FF.',
  upLab: 'More ms.',
  downAir: 'Rawer.',
  downLab: 'Less ms.',
}));
put('angle_limit', copy({
  title: 'Angle limit',
  related: ['control-angle'],
  air: 'Maximum tilt angle mode will ask for, in degrees. This is why you cannot flip in angle.',
  lab: 'angle_limit.',
  sim: 'LIVE in angle mode.',
  upAir: 'Steeper max tilt. More of a "almost acro" angle mode.',
  upLab: 'Higher deg cap.',
  downAir: 'Flatter. Safer hover, useless for a gate.',
  downLab: 'Lower cap.',
}));
put('angle_earth_ref', copy({
  title: 'Angle earth reference',
  related: ['control-angle'],
  air: 'How much angle mode uses the earth frame versus the craft. It changes whether a yaw in a bank feels like a helicopter or a quad.',
  lab: 'angle_earth_ref.',
  sim: 'LIVE in angle mode.',
  upAir: 'More earth-referenced. Heading holds in a bank differently.',
  upLab: 'Higher mix of earth frame.',
  downAir: 'More body-referenced.',
  downLab: 'Lower.',
}));
put('level_race_mode', copy({
  title: 'Level race mode',
  related: ['control-angle'],
  air: 'A Betaflight switch that changes how angle uses yaw for racing in self-level, not a second angle gain.',
  lab: 'level_race_mode OFF/ON.',
  sim: 'LIVE, only visible in angle.',
  upAir: 'ON: the race flavour of angle yaw.',
  upLab: 'Enabled.',
  downAir: 'OFF: classic angle yaw.',
  downLab: 'Off.',
}));

for (const [key, title, air] of [
  ['horizon_level_strength', 'Horizon level strength', 'How hard Horizon mode pulls to level. Horizon is the blend of acro and angle.'],
  ['horizon_limit_sticks', 'Horizon stick limit', 'Where in the stick Horizon gives up levelling and becomes acro.'],
  ['horizon_limit_degrees', 'Horizon angle limit', 'Attitude range Horizon cares about.'],
  ['horizon_ignore_sticks', 'Horizon ignore sticks', 'Whether Horizon keeps levelling even with stick input.'],
  ['horizon_delay_ms', 'Horizon delay ms', 'Delay before Horizon starts levelling after you centre.'],
]) {
  put(key, copy({
    title,
    related: ['control-angle', 'start-honesty'],
    air: `${air} This shell never raises HORIZON_MODE. There is no half-self-level in the product, only acro and angle.`,
    lab: 'Stored on pid[PID_LEVEL] I/D and related fields, which pidLevel would read in Horizon. ANGLE is sim_set_angle_mode. Horizon sticks are never mapped.',
    sim: 'APPLIED_INERT. A dump that carries them will still carry them on export. They do not fly.',
    upAir: 'Would change Horizon on a board that had a Horizon switch. Not here.',
    upLab: 'PG write only.',
    downAir: 'Same.',
    downLab: 'Same.',
  }));
}

put('simplified_pids_mode', copy({
  title: 'Simplified PIDs mode',
  related: ['control-simplified'],
  air: 'OFF, RP, or RPY. When not OFF, the sliders are allowed to overwrite the typed PID numbers on apply.',
  lab: 'simplified_pids_mode. applySimplifiedTuning is compiled.',
  sim: 'LIVE.',
  upAir: 'Toward RPY: sliders own yaw too.',
  upLab: 'Wider slider authority.',
  downAir: 'OFF: typed p_roll etc. stick, until a dump says apply.',
  downLab: 'OFF.',
}));
function simp(key, title, air) {
  put(key, copy({
    title,
    related: ['control-simplified', 'control-pid'],
    air,
    lab: 'A simplified_tuning.c slider. 100 is "as authored." 0 to 200 typically. apply overwrites the raw gains.',
    sim: 'LIVE. Race presets in configs/ depend on this. If apply is missing, you fly defaults and think the preset is the plant.',
    upAir: 'More of that slider\'s quantity.',
    upLab: 'Higher multiplier, then apply.',
    downAir: 'Less.',
    downLab: 'Lower. 0 can be a degenerate tune. Do not.',
  }));
}
simp('simplified_master_multiplier', 'Simplified master', 'The master slider. Turns the whole PID shape up and down together.');
simp('simplified_i_gain', 'Simplified I', 'I slider relative to the shape.');
simp('simplified_d_gain', 'Simplified D', 'D slider.');
simp('simplified_pi_gain', 'Simplified PI', 'P and I together, leaving D\'s relative shape.');
simp('simplified_dmax_gain', 'Simplified D max', 'D max / D min ratio slider.');
simp('simplified_feedforward_gain', 'Simplified feedforward', 'F slider.');
simp('simplified_pitch_d_gain', 'Simplified pitch D', 'Pitch D relative to roll, historically named roll_pitch_ratio in the struct.');
simp('simplified_pitch_pi_gain', 'Simplified pitch PI', 'Pitch P/I relative to roll.');
put('simplified_dterm_filter', copy({
  title: 'Simplified D-term filter',
  related: ['control-simplified', 'control-filters'],
  air: 'ON: the D-term filter slider may overwrite dterm LPF Hz. OFF: your typed Hz stick.',
  lab: 'simplified_dterm_filter.',
  sim: 'LIVE.',
  upAir: 'ON: sliders own D filters.',
  upLab: 'Enabled.',
  downAir: 'OFF: typed dterm_lpf* stick.',
  downLab: 'Off.',
}));
put('simplified_dterm_filter_multiplier', copy({
  title: 'Simplified D-term filter multiplier',
  related: ['cli-simplified_dterm_filter'],
  air: 'Filter slider for D-term Hz. Higher is typically less filtering (higher Hz), matching Configurator\'s "multiplier" language. Confirm on the Hz fields after apply.',
  lab: 'simplified_dterm_filter_multiplier, 10 to 200 style.',
  sim: 'LIVE when the simplified D filter switch is on.',
  upAir: 'Usually rawer D (check the Hz it wrote).',
  upLab: 'Read back dterm_lpf1_static_hz after apply. Do not trust the slider direction from memory.',
  downAir: 'Usually more D filtering.',
  downLab: 'Same: read back.',
}));
put('simplified_gyro_filter', copy({
  title: 'Simplified gyro filter',
  related: ['control-filters'],
  air: 'ON: gyro filter slider may overwrite gyro LPF Hz.',
  lab: 'simplified_gyro_filter on gyroConfig.',
  sim: 'LIVE.',
  upAir: 'ON: sliders own gyro filters.',
  upLab: 'Enabled.',
  downAir: 'OFF: typed gyro_lpf* stick.',
  downLab: 'Off.',
}));
put('simplified_gyro_filter_multiplier', copy({
  title: 'Simplified gyro filter multiplier',
  related: ['cli-simplified_gyro_filter'],
  air: 'Gyro filter slider. Read back gyro_lpf1_static_hz after apply.',
  lab: 'simplified_gyro_filter_multiplier.',
  sim: 'LIVE when the switch is on.',
  upAir: 'Usually rawer gyro. Confirm on the Hz field.',
  upLab: 'Read back.',
  downAir: 'Usually more gyro filtering.',
  downLab: 'Read back.',
}));

put('gyro_hardware_lpf', copy({
  title: 'Gyro hardware LPF',
  related: ['control-filters', 'start-honesty'],
  air: 'On a real ICM/MPU this is the analog/on-chip LPF before the sample ever reaches Betaflight. NORMAL, OPTION_1, OPTION_2, EXPERIMENTAL.',
  lab: 'gyro_hardware_lpf. There is no analog chip here. The digital path does not read it.',
  sim: 'APPLIED_INERT. Stored on gyroConfig. The SITL-style device is already a 16-bit 2000 dps conversion of a float.',
  upAir: 'Would change a real chip\'s analog filter. Not here.',
  upLab: 'PG only.',
  downAir: 'Same.',
  downLab: 'Same.',
}));
put('gyro_filter_debug_axis', copy({
  title: 'Gyro filter debug axis',
  related: ['start-honesty'],
  air: 'Which axis a debug trace would show for filter development.',
  lab: 'gyro_filter_debug_axis. DEBUG_SET would read it. Blackbox debug is not a flight control here.',
  sim: 'APPLIED_INERT.',
  upAir: 'Would change a debug trace, not the flight.',
  upLab: 'PG only.',
  downAir: 'Same.',
  downLab: 'Same.',
}));
put('yaw_spin_recovery', copy({
  title: 'Yaw spin recovery',
  related: ['physics-yaw', 'control-pid'],
  air: 'If the craft is yaw-spinning beyond a threshold (a crash, a desync), firmware can cut motors or try to save it. AUTO lets Betaflight decide.',
  lab: 'yaw_spin_recovery OFF/ON/AUTO, plus yaw_spin_threshold.',
  sim: 'LIVE in gyro config. The plant will spin if you ask it to; this is a firmware safety net, not aero damping.',
  upAir: 'Toward ON: more willing to intervene in a yaw spin.',
  upLab: 'ON is force on. AUTO is firmware policy.',
  downAir: 'OFF: you own the spin.',
  downLab: 'OFF is a racer choice.',
}));
put('yaw_spin_threshold', copy({
  title: 'Yaw spin threshold',
  related: ['cli-yaw_spin_recovery'],
  air: 'How fast yaw has to be before recovery cares, in deg/s firmware units.',
  lab: 'yaw_spin_threshold.',
  sim: 'LIVE with recovery not OFF.',
  upAir: 'Harder to trigger. Lets you yaw harder on purpose.',
  upLab: 'Higher threshold.',
  downAir: 'Easier to trigger in a fast yaw.',
  downLab: 'Lower.',
}));

put('rates_type', copy({
  title: 'Rates type',
  figure: 'pid',
  related: ['control-rates', 'cli-roll_srate'],
  air: 'BETAFLIGHT, RACEFLIGHT, KISS, ACTUAL, or QUICK. The same three numbers mean different curves. ACTUAL is the one whose max rate is what it says at full stick. This sim\'s menu writes ACTUAL unless you change it on the FC screen.',
  lab: 'rates_type, apply*Rates in fc/rc.c, all compiled. The FC graph is a JS preview of those formulas, not a second controller.',
  sim: 'LIVE. Check 9 parses max rate from the fixture. If you switch type, the same rc_rate/srate/expo are a different aircraft.',
  upAir: 'Not numeric. Pick a type on purpose. Do not mix a KISS dump\'s numbers with ACTUAL and expect 670 deg/s.',
  upLab: 'Enum.',
  downAir: 'Same.',
  downLab: 'Same.',
}));
put('quickrates_rc_expo', copy({
  title: 'Quickrates RC expo',
  related: ['cli-rates_type'],
  air: 'A Quick rates only switch: whether expo is applied the Quick way. Ignored on ACTUAL.',
  lab: 'quickRatesRcExpo, used in applyQuickRates.',
  sim: 'LIVE, meaningful when rates_type is QUICK.',
  upAir: 'ON: Quick expo path.',
  upLab: 'See ratescurve.js applyQuickRates.',
  downAir: 'OFF: the other Quick curve.',
  downLab: 'Off.',
}));

function rateAxis(axis) {
  const a = axisNoun(axis);
  put(`${axis}_rc_rate`, copy({
    title: `${a.Axis} RC rate (centre)`,
    related: ['control-rates', `cli-${axis}_srate`, `cli-${axis}_expo`],
    air: `On ACTUAL, this is ${a.axis} centre sensitivity in tens of deg/s (7 means 70 deg/s per stick unit at centre). It is the slope at the middle, not the rate at half stick.`,
    lab: `rcRates[FD_${a.Axis.toUpperCase()}]. ACTUAL: centreSensitivity = rc_rate * 10. Other types: see applyBetaflightRates and friends. Stored uint8, max 255.`,
    sim: 'LIVE. The title menu\'s centre knob writes all three axes together. The FC page can split them.',
    upAir: `Twitchier ${a.axis} near centre. Fine aiming gets harder.`,
    upLab: 'Steeper linear term on ACTUAL.',
    downAir: `Softer centre. You will move ${a.stick} further for a small correction.`,
    downLab: 'Shallower slope. Max rate is still srate on ACTUAL.',
  }));
  put(`${axis}_srate`, copy({
    title: `${a.Axis} super rate (max)`,
    related: ['control-rates', `cli-${axis}_rc_rate`],
    air: `On ACTUAL, full-stick ${a.axis} rate is srate * 10 deg/s. 67 means 670. That is the number Check 9 cares about on roll.`,
    lab: `rates[FD_${a.Axis.toUpperCase()}]. ACTUAL: at |stick|=1, rate = srate*10. Super-rate on the Betaflight type is a different equation; do not convert in your head.`,
    sim: 'LIVE. Default 67/67/67. Tune files do not override this unless you import a dump that includes a rateprofile and the rates policy keeps it.',
    upAir: `Faster ${a.motion} at full stick. Flips happen in less time. Aiming at the edge is harder.`,
    upLab: 'Higher max setpoint. The plant must be able to follow or you will pin motors and the gyro will lag the command.',
    downAir: `Slower. Easier to aim, slower flicks. A 5 inch can still pull a lot of G.`,
    downLab: 'Check 12 is this field, on purpose, on two fixtures.',
  }));
  put(`${axis}_expo`, copy({
    title: `${a.Axis} expo`,
    related: ['control-rates', `cli-${axis}_rc_rate`],
    air: `Bends ${a.axis} so the middle of the stick is gentler and the ends still reach max rate (on ACTUAL). 0 is linear in the ACTUAL sense (still not linear in stick-to-rate if centre and max differ).`,
    lab: `rcExpo[FD_${a.Axis.toUpperCase()}], 0 to 100 as percent. ACTUAL uses a 5th-power blend. Betaflight type uses a cubic. They are not interchangeable numbers.`,
    sim: 'LIVE. Default 0.',
    upAir: `More expo: the middle of ${a.stick} does less. Precision up, a dead feeling if you overdo it.`,
    upLab: 'Higher expof weight.',
    downAir: '0: whatever the centre/max pair already is, unbent.',
    downLab: '0.',
  }));
  put(`${axis}_rate_limit`, copy({
    title: `${a.Axis} rate limit`,
    related: [`cli-${axis}_srate`],
    air: `A clamp in deg/s on the ${a.axis} setpoint after the curve. Default 1998 is "off" for any sane max rate.`,
    lab: `rate_limit[FD_${a.Axis.toUpperCase()}], CONTROL_RATE_CONFIG_RATE_LIMIT_MAX 1998.`,
    sim: 'LIVE.',
    upAir: 'Toward 1998: no extra clamp.',
    upLab: 'Clamp above the curve does nothing.',
    downAir: `Caps ${a.axis} below what srate asked. A safety, or a surprise.`,
    downLab: 'If this is below srate*10 on ACTUAL, Check 9 would fail on roll. Do not ship that.',
  }));
}
rateAxis('roll');
rateAxis('pitch');
rateAxis('yaw');

put('thr_mid', copy({
  title: 'Throttle mid',
  related: ['cli-thr_expo', 'cli-throttle_limit_type', 'physics-airframe'],
  air: 'Shifts where "mid stick" sits in the throttle curve, so hover can live at a comfortable place without a SCALE limit.',
  lab: 'thrMid8, 0 to 100.',
  sim: 'LIVE. Hover is ~20 percent duty on this plant at 4.0 V/cell. Mid 50 with no expo still leaves hover in the bottom fifth.',
  upAir: 'More of the stick is below hover, if you also have expo. Easy to over-think; SCALE is clearer.',
  upLab: 'Higher mid.',
  downAir: 'Mid down.',
  downLab: 'Lower.',
}));
put('thr_expo', copy({
  title: 'Throttle expo',
  related: ['cli-thr_mid'],
  air: 'Bends throttle so the middle is gentler. Does not add motor range. SCALE throttle limit is usually the better hover fix on this airframe.',
  lab: 'thrExpo8.',
  sim: 'LIVE.',
  upAir: 'Softer around mid.',
  upLab: 'More expo.',
  downAir: 'Linear throttle map (plus thr_mid).',
  downLab: '0.',
}));
put('throttle_limit_type', copy({
  title: 'Throttle limit type',
  related: ['control-rates', 'cli-throttle_limit_percent', 'physics-airframe'],
  air: 'OFF, SCALE, or CLIP. SCALE redistributes the whole stick across 0 to cap, which is how racers get hover off the floor on a 9 TWR machine. CLIP just ignores the top of the stick.',
  lab: 'applyThrottleLimit in mixer.c. SCALE: output = stick * cap. CLIP: output = min(stick, cap).',
  sim: 'LIVE. The title menu writes SCALE when the cap is below 100, OFF at 100.',
  upAir: 'Not numeric. SCALE is the one that returns resolution.',
  upLab: 'SCALE.',
  downAir: 'OFF is full 9.2 TWR on this plant. CLIP is a trap: you lose the top and keep the twitchy bottom.',
  downLab: 'OFF / CLIP.',
}));
put('throttle_limit_percent', copy({
  title: 'Throttle limit percent',
  related: ['cli-throttle_limit_type'],
  air: 'The cap. 100 is no cap. 60 puts a lot of hover into the stick. 40 puts hover near half on this airframe, classic.',
  lab: 'throttle_limit_percent, 25 to 100 with SCALE/CLIP.',
  sim: 'LIVE. configs/rates.js documents 19.5 percent hover and the 9.2 TWR. That is why this field exists in the menu.',
  upAir: 'Toward 100: more punch, twitchier hover band.',
  upLab: 'Higher cap.',
  downAir: 'Less punch, more stick around hover. You will not win a punch-out contest at 40 percent, and that is the idea.',
  downLab: 'Lower cap. Check 6 is a full-throttle punch; a tiny cap would fail it. The harness uses its own dump.',
}));

put('rc_smoothing', copy({
  title: 'RC smoothing',
  related: ['physics-radio', 'control-ff'],
  air: 'Low-pass on the stick before it becomes a setpoint. Auto mode tunes the cutoff from packet interval. A perfect link therefore picks a sharper filter than ELRS would.',
  lab: 'rc_smoothing_mode, plus auto factors and per-path cutoffs. fc/rc.c, compiled.',
  sim: 'LIVE. Default Perfect link under-stresses auto smoothing. Turn on ELRS to see it work.',
  upAir: 'ON is the usual. OFF is raw packets, ugly with loss.',
  upLab: 'Enabled.',
  downAir: 'OFF: every jitter is a setpoint.',
  downLab: 'Off.',
}));
put('rc_smoothing_auto_factor', copy({
  title: 'RC smoothing auto factor (RPY)',
  related: ['cli-rc_smoothing'],
  air: 'How conservative auto smoothing is on roll/pitch/yaw. Higher typically means more smoothing (later). Confirm in the active cutoff if you have a log.',
  lab: 'rc_smoothing_auto_factor_rpy.',
  sim: 'LIVE.',
  upAir: 'Usually smoother sticks.',
  upLab: 'Read Betaflight\'s auto factor docs with the 4.5.1 table. Direction is "more factor, more filter" in stock Configurator language.',
  downAir: 'Usually rawer.',
  downLab: 'Lower factor.',
}));
put('rc_smoothing_auto_factor_throttle', copy({
  title: 'RC smoothing auto factor (throttle)',
  related: ['cli-rc_smoothing'],
  air: 'The throttle copy of the auto factor. Throttle FF is not a thing in the same way; this is about a smooth punch.',
  lab: 'rc_smoothing_auto_factor_throttle.',
  sim: 'LIVE.',
  upAir: 'Usually smoother throttle.',
  upLab: 'Higher factor.',
  downAir: 'Rawer throttle packets.',
  downLab: 'Lower.',
}));
put('rc_smoothing_setpoint_cutoff', copy({
  title: 'RC smoothing setpoint cutoff',
  related: ['cli-rc_smoothing'],
  air: 'Manual setpoint filter Hz when you are not leaving it at auto (0 often means auto). Higher Hz, less smoothing.',
  lab: 'rc_smoothing_setpoint_cutoff. 0 is auto in 4.5 style.',
  sim: 'LIVE.',
  upAir: 'Rawer if non-zero and above auto.',
  upLab: 'Higher Hz cutoff.',
  downAir: 'Smoother, or auto at 0.',
  downLab: '0 auto / lower Hz.',
}));
put('rc_smoothing_feedforward_cutoff', copy({
  title: 'RC smoothing feedforward cutoff',
  related: ['cli-rc_smoothing', 'control-ff'],
  air: 'Filter on the derivative that becomes FF. This is the one jitter hits first.',
  lab: 'rc_smoothing_feedforward_cutoff. 0 auto.',
  sim: 'LIVE.',
  upAir: 'Rawer FF derivative.',
  upLab: 'Higher Hz.',
  downAir: 'Calmer FF, later FF.',
  downLab: 'Lower / auto.',
}));
put('rc_smoothing_throttle_cutoff', copy({
  title: 'RC smoothing throttle cutoff',
  related: ['cli-rc_smoothing'],
  air: 'Manual throttle smoothing Hz, 0 auto.',
  lab: 'rc_smoothing_throttle_cutoff.',
  sim: 'LIVE.',
  upAir: 'Rawer throttle.',
  upLab: 'Higher Hz.',
  downAir: 'Smoother throttle.',
  downLab: 'Lower / auto.',
}));

put('mid_rc', copy({
  title: 'Mid RC',
  related: ['cli-min_check', 'physics-radio'],
  air: 'What PWM value the firmware calls centre, usually 1500. Sticks in this sim are already −1 to 1; this still matters for how a dump\'s PWM-era fields interpret centre.',
  lab: 'midrc, 1200 to 1700.',
  sim: 'LIVE. The gamepad path is not a PWM radio. A wild mid_rc will still shift where firmware thinks centre is.',
  upAir: 'Centre moves up in PWM space.',
  upLab: 'Higher midrc.',
  downAir: 'Centre down. Can look like trim.',
  downLab: 'Lower. Leave 1500 unless you know you have a weird radio.',
}));
put('min_check', copy({
  title: 'Min check',
  related: ['cli-mid_rc', 'cli-max_check'],
  air: 'PWM below which firmware considers a stick at min (arming, throttle zero).',
  lab: 'mincheck.',
  sim: 'LIVE, but ARM is always on and sticks are analog −1..1. This is dump compatibility more than a min-throttle switch.',
  upAir: 'A larger "at min" zone.',
  upLab: 'Higher mincheck.',
  downAir: 'Tighter min.',
  downLab: 'Lower. Do not invert min and max.',
}));
put('max_check', copy({
  title: 'Max check',
  related: ['cli-min_check'],
  air: 'PWM above which firmware considers a stick at max.',
  lab: 'maxcheck.',
  sim: 'LIVE, same caveat as min_check.',
  upAir: 'Easier to reach "max."',
  upLab: 'Higher.',
  downAir: 'Harder to reach max in PWM space.',
  downLab: 'Lower.',
}));
put('airmode_start_throttle_percent', copy({
  title: 'Airmode start throttle %',
  related: ['control-tpa', 'cli-pid_at_min_throttle'],
  air: 'Throttle percent where airmode becomes active, if it is not already forced on. Racers often want it always.',
  lab: 'airModeActivateThreshold.',
  sim: 'LIVE. Feature AIRMODE is separate. The shell does not expose an AUX to turn airmode off in flight.',
  upAir: 'Airmode waits for more throttle.',
  upLab: 'Higher threshold.',
  downAir: 'Airmode from lower throttle, including idle if 0 and the feature is on.',
  downLab: 'Lower.',
}));
put('fpv_mix_degrees', copy({
  title: 'FPV mix degrees',
  related: ['physics-lens', 'start-honesty'],
  air: 'On a real board, mixes camera tilt into roll/yaw so "left" in the goggles is left on the horizon. This shell never raises BOXFPVANGLEMIX. You mix with your neck and the camera mount.',
  lab: 'rxConfig.fpvCamAngleDegrees. rc.c would mix it if the box were on.',
  sim: 'APPLIED_INERT. Settings Camera angle is the mount, a different number, and it does fly because it is the renderer.',
  upAir: 'Would mix more on a board with the mode on. Not here.',
  upLab: 'PG only.',
  downAir: 'Same.',
  downLab: 'Same.',
}));

put('dshot_idle_value', copy({
  title: 'DShot idle',
  related: ['control-mixer', 'physics-motor', 'cli-dyn_idle_min_rpm'],
  air: 'The motor floor in DShot units (roughly percent times 100, 550 is 5.5 percent). Below this the mixer will not command. Too low, yaw dies at idle. Too high, you cannot descend.',
  lab: 'digitalIdleOffsetValue. Glue motorInitEndpoints uses DShot constants, not min_throttle PWM.',
  sim: 'LIVE. This is the idle that airmode stands on.',
  upAir: 'Motors keep spinning more. Floaty idle, stronger yaw at the bottom, harder to drop.',
  upLab: 'Higher digital idle.',
  downAir: 'Motors closer to stopping. Snappier drop, mushy yaw, desync risk on a real ESC (not modelled).',
  downLab: 'Lower idle. The plant will spin down to whatever duty it is given; it will not desync.',
}));
put('motor_kv', copy({
  title: 'Motor kV',
  related: ['physics-airframe', 'physics-motor', 'start-honesty'],
  air: 'Nameplate kV on a real setup page. People type 1900 and expect a different aircraft. This plant\'s ke is a loaded constant, not 60/(2π kV).',
  lab: 'motorConfig.kv. Plant ke is 0.006336, independent.',
  sim: 'APPLIED_INERT. Stored. The airframe is still the Stage 1 5 inch. Pack charge still sags. You cannot CLI your way into a 7 inch.',
  upAir: 'Would mean a faster unloaded motor on a board that used this for OSD or RPM conversion. Not thrust here.',
  upLab: 'PG only. RPM filter does not convert eRPM via this field; rotor Hz is injected.',
  downAir: 'Same.',
  downLab: 'Same.',
}));
put('motor_poles', copy({
  title: 'Motor poles',
  related: ['cli-motor_kv', 'cli-rpm_filter_harmonics'],
  air: 'Pole count for converting eRPM to RPM on a real ESC telemetry path.',
  lab: 'motorPoleCount. Rotor Hz is injected from the plant. The RPM filter does not need poles to do that.',
  sim: 'APPLIED_INERT.',
  upAir: 'Would change eRPM math on a real FC. Not here.',
  upLab: 'PG only.',
  downAir: 'Same.',
  downLab: 'Same.',
}));
put('min_throttle', copy({
  title: 'Min throttle (PWM)',
  related: ['cli-dshot_idle_value', 'start-honesty'],
  air: 'PWM-era motor minimum. DShot idle replaced this for digital protocols.',
  lab: 'motorConfig.minthrottle. Glue uses DShot endpoints.',
  sim: 'APPLIED_INERT.',
  upAir: 'Would raise PWM idle on a PWM board. Not this mixer.',
  upLab: 'PG only.',
  downAir: 'Same.',
  downLab: 'Same.',
}));
put('max_throttle', copy({
  title: 'Max throttle (PWM)',
  related: ['cli-min_throttle'],
  air: 'PWM-era motor maximum.',
  lab: 'maxthrottle. DShot path does not use it.',
  sim: 'APPLIED_INERT.',
  upAir: 'No flight change here.',
  upLab: 'PG only.',
  downAir: 'Same.',
  downLab: 'Same.',
}));
put('min_command', copy({
  title: 'Min command (PWM)',
  related: ['cli-min_throttle'],
  air: 'PWM value sent when stopped, below idle, the "off" command.',
  lab: 'mincommand. DShot stop is a DShot command, not this field.',
  sim: 'APPLIED_INERT.',
  upAir: 'No flight change here.',
  upLab: 'PG only.',
  downAir: 'Same.',
  downLab: 'Same.',
}));

put('mixer_type', copy({
  title: 'Mixer type',
  figure: 'mixer',
  related: ['control-mixer', 'cli-ez_landing_threshold'],
  air: 'LEGACY, LINEAR, DYNAMIC, EZLANDING. How throttle and PID share the four motors when you are asking for more than 100 percent on a corner. EZLANDING is a landing helper, not a race default.',
  lab: 'mixer_type enum, mixer.c compiled.',
  sim: 'LIVE.',
  upAir: 'Not numeric. DYNAMIC is a modern race choice. EZLANDING will change descents; try it on grass.',
  upLab: 'Enum. LINEAR/DYNAMIC change the mapping from pidSum+throttle to motor range.',
  downAir: 'LEGACY is the textbook add-up, easy to saturate a motor.',
  downLab: 'LEGACY.',
}));
put('yaw_motors_reversed', copy({
  title: 'Yaw motors reversed',
  related: ['physics-yaw', 'start-loop'],
  air: 'Flips the mixer yaw sign for props-out versus props-in. If this does not match the actual spin of the bells, yaw runs away.',
  lab: 'yaw_motors_reversed. mixer.c negates yaw PID when this is off, matching the plant\'s props-in table.',
  sim: 'LIVE. The plant spin table does not flip with this field. Turn it on and you will build a yaw runaway. That is the correct bug, not a wiki error.',
  upAir: 'ON: yaw inverts relative to this plant. Do not.',
  upLab: 'Sign flip. The glue comments are the bible.',
  downAir: 'OFF: matches PLANT_SPIN as shipped.',
  downLab: 'Off.',
}));
put('crashflip_motor_percent', copy({
  title: 'Crashflip motor percent',
  related: ['cli-crash_recovery', 'start-honesty'],
  air: 'How hard turtle mode (flip over after crash) runs the motors.',
  lab: 'crashflip_motor_percent. isFlipOverAfterCrashActive is stubbed false.',
  sim: 'APPLIED_INERT. You cannot turtle in this sim. A crash is a crash.',
  upAir: 'Would turtle harder on a real board. Not here.',
  upLab: 'PG only.',
  downAir: 'Same.',
  downLab: 'Same.',
}));
put('crashflip_expo', copy({
  title: 'Crashflip expo',
  related: ['cli-crashflip_motor_percent'],
  air: 'Expo on turtle-mode sticks.',
  lab: 'crashflip_expo. Turtle is stubbed off.',
  sim: 'APPLIED_INERT.',
  upAir: 'No turtle here.',
  upLab: 'PG only.',
  downAir: 'Same.',
  downLab: 'Same.',
}));

put('runaway_takeoff_prevention', copy({
  title: 'Runaway takeoff prevention',
  related: ['start-honesty'],
  air: 'Firmware that disarms if the craft takes off without a plausible stick. A safety for a real arming switch.',
  lab: 'runaway_takeoff_prevention. Would need fc/core.c. The craft is always armed.',
  sim: 'APPLIED_INERT.',
  upAir: 'Would enable a safety on a real FC. Not here.',
  upLab: 'PG only.',
  downAir: 'Same.',
  downLab: 'Same.',
}));

const FEATURE_COPY = {
  AIRMODE: copy({
    title: 'Feature AIRMODE',
    related: ['control-tpa', 'cli-pid_at_min_throttle'],
    air: 'Keeps PID authority at zero throttle. Race default in spirit. Without it, idle is a brick.',
    lab: 'feature AIRMODE in the dump. Compiled mixer/pid path.',
    sim: 'LIVE feature line.',
    upAir: 'On: flips at zero throttle still have motors that can move.',
    upLab: 'Feature bit on.',
    downAir: 'Off: chopping throttle kills the loop\'s leverage.',
    downLab: 'Feature bit off.',
  }),
  ANTI_GRAVITY: copy({
    title: 'Feature ANTI_GRAVITY',
    related: ['cli-anti_gravity_gain', 'control-tpa'],
    air: 'Master switch for anti-gravity. The gains do nothing useful if this is off.',
    lab: 'feature ANTI_GRAVITY.',
    sim: 'LIVE feature line.',
    upAir: 'On: punches can be flattened by the AG gains.',
    upLab: 'Feature on.',
    downAir: 'Off: bow on punch, gains ignored.',
    downLab: 'Feature off.',
  }),
};

function featurePage(feat) {
  const authored = FEATURE_COPY[feat.name];
  const base = authored || copy({
    title: `Feature ${feat.name}`,
    air: `A Betaflight feature flag named ${feat.name}. On a real board this turns a whole subsystem on.`,
    lab: 'Features are CLI commands, not valueTable keys.',
    sim: `${feat.status}. ${feat.reason}`,
    upAir: 'Would enable that subsystem in life.',
    upLab: 'Feature bit.',
    downAir: 'Would disable it.',
    downLab: 'Off.',
  });
  return finishPage(`feature-${feat.name}`, {
    ...base,
    kicker: 'Feature',
    status: feat.status,
    key: `feature ${feat.name}`,
    metaLine: `Feature flag. ${feat.status}.`,
    reason: feat.reason,
  });
}

function prettyOsd(key) {
  return key.replace(/^osd_/, '').replace(/_pos$/, '').replace(/_/g, ' ');
}

function family(field) {
  const k = field.key;
  const reason = field.reason || '';
  const inert = `${field.status}. ${reason}`.trim();
  if (k.startsWith('osd_')) {
    const elName = prettyOsd(k);
    return copy({
      title: `OSD: ${elName}`,
      related: ['start-honesty', 'physics-lens'],
      air: `OSD element "${elName}". On a real quad this is drawn on the camera video in the goggles: a timer, a voltage, a warning, a position on the character grid. This simulator does not draw Betaflight OSD pixels in the FPV view. The HUD you see (lap clock, pack) is the game shell, not this field.`,
      lab: 'OSD parameter group in 4.5.1. Positions are packed grid coordinates. Alarms are thresholds. Units select metric/imperial for OSD text.',
      sim: inert,
      upAir: 'On a real board this would move, raise, or enable that OSD item. Here it round-trips in a dump and does not change the picture.',
      upLab: 'Would write the OSD PG on a full firmware. This build does not compile osd.c into the loop.',
      downAir: 'Same: dump only.',
      downLab: 'Same.',
    });
  }
  if (k.startsWith('vtx_')) {
    return copy({
      title: k,
      related: ['start-honesty'],
      air: 'Video transmitter setting: band, channel, power, pit mode. That is the radio that sends analog or digital video to goggles. This sim has no VTX. The picture is a WebGL camera.',
      lab: 'VTX parameter groups. MSP/VTX tables on a real board.',
      sim: inert,
      upAir: 'Would change video power or channel in life. Not here.',
      upLab: 'No VTX device.',
      downAir: 'Same.',
      downLab: 'Same.',
    });
  }
  if (k.startsWith('gps_') || k === 'gps') {
    return copy({
      title: k,
      related: ['start-honesty', 'physics-missing'],
      air: 'GPS and GPS-rescue settings. Return-to-home, rescue altitude, sat counts. There is no GPS sensor in the plant and no map of Earth.',
      lab: 'GPS and GPS_RESCUE parameter groups. Not compiled into the 1 ms loop.',
      sim: inert,
      upAir: 'Would change rescue behaviour on a GPS build. Not this aircraft.',
      upLab: 'No GPS.',
      downAir: 'Same.',
      downLab: 'Same.',
    });
  }
  if (k.startsWith('led_') || k.startsWith('ledstrip')) {
    return copy({
      title: k,
      air: 'LED strip colour, mode, and mapping. Pretty, heavy on a PDB, irrelevant to rate tracking.',
      lab: 'LEDSTRIP PG.',
      sim: inert,
      upAir: 'Would change lights. No LEDs in the plant.',
      upLab: 'No strip.',
      downAir: 'Same.',
      downLab: 'Same.',
    });
  }
  if (k.startsWith('blackbox_')) {
    return copy({
      title: k,
      related: ['physics-gyro'],
      air: 'Onboard blackbox: rate, fields, device. This sim can dump a CSV from the shell when Flight log is on. That is not this device.',
      lab: 'BLACKBOX_CONFIG. No flash/SD logger in the WASM loop.',
      sim: inert,
      upAir: 'Would change onboard logging on a real FC. Use Settings Flight log here.',
      upLab: 'No blackbox device.',
      downAir: 'Same.',
      downLab: 'Same.',
    });
  }
  if (k.startsWith('failsafe_')) {
    return copy({
      title: k,
      air: 'What the craft does if the radio dies: drop, land, GPS rescue. The link never fails in this sim unless you model loss in the radio preset, and even then there is no failsafe.c.',
      lab: 'FAILSAFE_CONFIG. Would need flight/failsafe.c.',
      sim: inert,
      upAir: 'Would change a real failsafe. Not compiled.',
      upLab: 'No failsafe machine.',
      downAir: 'Same.',
      downLab: 'Same.',
    });
  }
  if (/^(mag_|baro_|acc_|align_|gyro_calib|gyro_overflow|gyro_offset|gyro_high_range|gyro_to_use)/.test(k)) {
    return copy({
      title: k,
      related: ['physics-gyro', 'control-angle'],
      air: 'Sensor hardware: accelerometer, mag, baro, alignment, calibration, which gyro chip. The simulated gyro needs none of that. Angle mode attitude comes from the plant quaternion, not from fusing an acc.',
      lab: 'Setup PGs. Acc-based modes are not flown. No mag heading. No baro altitude.',
      sim: inert,
      upAir: 'Would calibrate or align a real board. Not here.',
      upLab: 'No those sensors.',
      downAir: 'Same.',
      downLab: 'Same.',
    });
  }
  if (/^(serial|telemetry_|msp_|rssi_|sbus_|spektrum_|srxl2_|crsf_|rx_)/.test(k)) {
    return copy({
      title: k,
      related: ['physics-radio'],
      air: 'UART grid, receiver protocol, RSSI, telemetry back to the radio. Sticks here come from the Gamepad or keyboard path, optionally through the link model. There is no CRSF wire.',
      lab: 'SERIAL, RX, TELEMETRY PGs. Not a radio stack.',
      sim: inert,
      upAir: 'Would change a real port or protocol. Use Settings Radio link for delay and loss.',
      upLab: 'No UART.',
      downAir: 'Same.',
      downLab: 'Same.',
    });
  }
  if (/^(vbat_|ibat_|bat_|battery_|current_meter|cbat_|use_vbat|use_cbat|force_battery|ibata|ibatt)/.test(k)) {
    return copy({
      title: k,
      related: ['physics-sag', 'cli-vbat_sag_compensation'],
      air: 'Onboard battery meter: scales, warnings, capacity. The plant owns voltage and current. Pack charge in Settings sets Voc. These CLI meters do not.',
      lab: 'BATTERY_CONFIG and ADC PGs. Plant r_cell and cells are constants.',
      sim: inert,
      upAir: 'Would change OSD warnings on a real FC. Use Pack charge here for sag.',
      upLab: 'Plant owns the pack.',
      downAir: 'Same.',
      downLab: 'Same.',
    });
  }
  if (/^(beeper_|sdcard_|dashboard_|camera_|cam_|esc_|dshot_|usb_|pinio|displayport_|frsky_|sdio_|system_|scheduler_|cpu_overclock|stats_|rcdevice_|debug_)/.test(k)) {
    return copy({
      title: k,
      air: 'A real flight controller has beepers, SD cards, cameras, ESC protocols, debug traces, overclock. This WASM target does not.',
      lab: 'Various PGs, not in the 1 ms step.',
      sim: inert || `${field.status}. Would need the matching Betaflight subsystem compiled.`,
      upAir: 'No effect on this aircraft.',
      upLab: 'Not compiled, or not a flight control here.',
      downAir: 'Same.',
      downLab: 'Same.',
    });
  }
  if (/^(motor_pwm|motor_output_reordering|3d_|servo|deadband|yaw_deadband|yaw_control_reversed|small_angle|mixer_)/.test(k) && k !== 'mixer_type') {
    return copy({
      title: k,
      related: ['control-mixer'],
      air: 'PWM motor details, 3D reversible motors, servos, stick deadband, mixer extras. This airframe is a DShot-ish quad X with calibration in Settings, always armed, no servos, no 3D.',
      lab: 'MOTOR / MIXER / RC PGs not wired to the plant.',
      sim: inert,
      upAir: 'No effect, or not the idle you want (use dshot_idle_value).',
      upLab: 'Not modelled.',
      downAir: 'Same.',
      downLab: 'Same.',
    });
  }
  if (k.startsWith('#')) {
    return copy({
      title: field.tab ? `${field.tab} (Configurator chrome)` : k,
      related: ['start-honesty'],
      air: 'A Configurator tab or painter that is not a CLI key in 4.5.1 firmware. Flasher, cloud backups, LED painter, autotune as an app: none of those are this WASM module.',
      lab: 'ABSENT in catalog.js. Grey tab, named reason.',
      sim: `${STATUS.ABSENT}. ${reason}`,
      upAir: 'There is nothing to raise. The tab is grey.',
      upLab: 'Not a set line.',
      downAir: 'Same.',
      downLab: 'Same.',
    });
  }
  return copy({
    title: k,
    related: ['start-honesty'],
    air: `A real Betaflight 4.5.1 CLI key named ${k}. It is in the catalog so a dump can round-trip. It is not a mystery PID.`,
    lab: field.pg ? `Parameter group ${field.pg}.` : 'No PG mapping in the live table.',
    sim: inert || `${field.status}. Would need the matching Betaflight subsystem compiled.`,
    upAir: 'On a board that implements this key, the labelled quantity would increase. Here it does not fly unless status is LIVE (and this family is the fallback, so it is not).',
    upLab: reason || 'Not in the LIVE write path that pidController/mixTable read every 1 ms.',
    downAir: 'Same in reverse.',
    downLab: 'Same.',
  });
}

function finishPage(id, spec) {
  const sections = [
    { id: 'air', title: 'In the air', paras: [spec.air] },
    { id: 'lab', title: 'In the lab', paras: [spec.lab] },
    { id: 'sim', title: 'In this simulator', paras: [spec.sim] },
    { id: 'up', title: 'If you raise it', paras: [spec.upAir, spec.upLab] },
    { id: 'down', title: 'If you lower it', paras: [spec.downAir, spec.downLab] },
  ];
  return {
    id,
    chapter: 'cli',
    title: spec.title,
    kicker: spec.kicker || 'Betaflight 4.5.1',
    lede: spec.metaLine || '',
    figure: spec.figure || null,
    sections,
    related: spec.related || [],
    source: spec.source || 'src/fc/catalog.js, src/native/bf/bf_settings.c, vendor/betaflight 4.5.1',
    kind: 'cli',
    status: spec.status,
    key: spec.key,
    reason: spec.reason || '',
    meta: spec.meta || null,
  };
}

export function cliPageId(key) {
  if (key.startsWith('#')) {
    return `cli-${key.slice(1).replace(/[^a-z0-9]+/gi, '-')}`;
  }
  return `cli-${key.replace(/[^a-z0-9_]+/gi, '-')}`;
}

export function pageForField(field) {
  const authored = AUTHORED[field.key];
  const spec = authored ? { ...authored } : family(field);
  if (!authored) {
    spec.title = spec.title || field.key;
  }
  const bounds = field.min != null || field.max != null ? fieldBounds(field) : null;
  const lut = field.lookup ? lookupValues(field.lookup) : null;
  const boundText = bounds
    ? `Range ${bounds.min} to ${bounds.max}${field.units ? ` ${field.units}` : ''}.`
    : '';
  const lutText = lut ? `Values: ${lut.join(', ')}.` : '';
  const typeText = field.type ? `Firmware type ${field.type}.` : '';
  const pgText = field.pg ? `Parameter group ${field.pg}.` : '';
  const metaLine = [
    field.key.startsWith('#') ? 'Configurator chrome, not a set line.' : `CLI key ${field.key}.`,
    field.status,
    pgText,
    typeText,
    boundText,
    lutText,
  ].filter(Boolean).join(' ');
  return finishPage(cliPageId(field.key), {
    ...spec,
    status: field.status,
    key: field.key,
    reason: field.reason,
    metaLine,
    meta: { bounds, lut, type: field.type, pg: field.pg, tab: field.tab, page: field.page },
    source: authored
      ? 'src/wiki/cli.js (authored), bf_settings.c, catalog.js'
      : 'src/wiki/cli.js (family), catalog.js',
  });
}

export function allCliPages() {
  const pages = FIELDS.map(pageForField);
  for (const feat of FEATURES) {
    pages.push(featurePage(feat));
  }
  return pages;
}

export function authoredKeys() {
  return Object.keys(AUTHORED);
}

export function cliIndexPage() {
  const counts = { LIVE: 0, GATED: 0, APPLIED_INERT: 0, INERT: 0, ABSENT: 0 };
  for (const f of FIELDS) {
    counts[f.status] += 1;
  }
  return {
    id: 'cli-index',
    chapter: 'cli',
    title: 'Every Betaflight setting',
    kicker: 'The catalog',
    lede: `${FIELDS.length} Configurator fields from the 4.5.1 value table plus chrome, and ${FEATURES.length} feature flags. ${counts.LIVE} LIVE, ${counts.GATED} GATED, ${counts.APPLIED_INERT} APPLIED_INERT, ${counts.INERT} INERT, ${counts.ABSENT} ABSENT. Search, or open a tab.`,
    figure: 'loop',
    sections: [
      {
        id: 'air',
        title: 'In the air',
        paras: [
          'If you flew a real 5 inch last weekend, this list is the same firmware you already know. LIVE rows change this aircraft. Grey rows are named so a dump is not a lie. Open any key. You will get the field, then life, then this sim, then raise and lower.',
        ],
      },
      {
        id: 'lab',
        title: 'In the lab',
        paras: [
          `catalog.js is the status authority. bf_settings.c is the write table. pid.c, mixer.c, rc.c, gyro.c, rpm_filter.c are the readers. A LIVE key with no reader is a bug. A family page for an INERT key is not a bug: OSD has hundreds of coordinates, and they all honestly do not fly.`,
        ],
      },
      {
        id: 'sim',
        title: 'In this simulator',
        paras: [
          'The list below is generated from FIELDS at runtime. wiki-lint fails if a catalog key has no page, or if a LIVE key has no authored copy. Close enough is not the rule.',
        ],
      },
    ],
    related: ['start-honesty', 'control-pid', 'control-filters', 'control-rates'],
    source: 'src/fc/catalog.js',
    kind: 'index',
    tabs: TABS,
    counts,
  };
}

export { AUTHORED, FEATURE_COPY };
