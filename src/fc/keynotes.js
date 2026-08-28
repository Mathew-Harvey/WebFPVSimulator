/*
 * keynotes.js: what a firmware key DOES, in a sentence a pilot can act on.
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

/*
 * WHY THIS EXISTS.
 *
 * fieldNote() ended in `return field.key`, so the help column beside 115
 * typed rows on the firmware bench read the key name back at the pilot who
 * had just moved the cursor onto a row labelled with that key name. The one
 * column in this product that everybody praises, the plain-English
 * explanation beside the row, said "p_roll" next to p_roll.
 *
 * The catalog carries no descriptions: it is generated from Betaflight's own
 * settings table, which has a type, a range and a parameter group and no
 * prose at all. So the prose has to live somewhere, and it lives here rather
 * than in the generator, because the generator's output is regenerated from
 * vendored source and a hand-written sentence would be wiped by the next
 * `npm run gen:catalog`.
 *
 * TWO RULES, and the second one is the important one.
 *
 * A sentence says the CONSEQUENCE, not the expansion. "How hard it corrects
 * the error it can see right now" rather than "proportional gain": a pilot
 * who already knows what P stands for does not need the row, and one who
 * does not is no better off being told.
 *
 * And nothing here claims a meaning it cannot back. Where there is no
 * hand-written sentence the fallback states only what the catalog actually
 * knows, the units and the range and the tab, which is duller than an
 * invented explanation and is the reason to prefer it. A wrong sentence
 * about a filter cutoff costs a pilot an evening.
 *
 * Matched in order, first hit wins, so a specific key can sit above its
 * family.
 */
const NOTES = [
  /* ---- PID, per axis ------------------------------------------------ */
  [/^p_(roll|pitch|yaw)$/, 'How hard the controller corrects the error it can see right now. More holds the line harder and shakes more in propwash.'],
  [/^i_(roll|pitch|yaw)$/, 'How hard it corrects error that has been there a while. This is what holds an angle against wind and against a heavy battery.'],
  [/^d_(roll|pitch|yaw)$/, 'Damping ceiling. Resists fast movement, which is what stops P ringing. Betaflight calls this D max in the GUI.'],
  [/^d_min_(roll|pitch|yaw)$/, 'Damping floor: where D sits while the sticks are still. It rises toward the ceiling only when the quad is being thrown about, so cruise stays cool and quiet.'],
  [/^f_(roll|pitch|yaw)$/, 'Feedforward. Pushes on stick MOVEMENT, before any error has appeared, so the quad starts turning with your thumb rather than after it.'],
  [/^d_min_advance$/, 'How eagerly D climbs from its floor toward its ceiling as the gyro speeds up.'],
  [/^d_min_boost_gain$/, 'How much of the gap between the D floor and the D ceiling a hard move is allowed to use.'],

  /* ---- Iterm -------------------------------------------------------- */
  [/^iterm_relax$/, 'Which axes stop accumulating I while the sticks are moving. Without it, a fast flick banks up I that then springs back when you stop: the bounce at the end of a roll.'],
  [/^iterm_relax_type$/, 'Whether relax watches the gyro or the setpoint. Setpoint is the modern default and reacts to what you asked for rather than to what happened.'],
  [/^iterm_relax_cutoff$/, 'How quick a stick movement counts as moving. Lower leaves relax on for longer and is calmer; higher lets I build sooner and holds better.'],
  [/^iterm_windup$/, 'The motor saturation point past which I stops growing, so a quad pinned at full throttle does not bank up correction it can never deliver.'],
  [/^iterm_limit$/, 'A hard ceiling on how much I is allowed to contribute at all.'],
  [/^iterm_rotation$/, 'Rotates accumulated I with the craft as it yaws, so I earned on roll does not end up fighting pitch after a spin.'],

  /* ---- Anti gravity -------------------------------------------------- */
  [/^anti_gravity_gain$/, 'How much extra I is thrown in during a fast throttle change. This is what stops the nose dropping when you punch out.'],
  [/^anti_gravity_(cutoff_hz|p_gain)$/, 'Shapes how anti gravity reacts to the throttle: how quickly it decides a throttle move counts, and how much P rides along with the I boost.'],

  /* ---- TPA and throttle ---------------------------------------------- */
  [/^tpa_rate$/, 'How much PID gain is taken away at high throttle. Fast air needs less correction, and leaving full gain there is what makes a quad buzz on a straight.'],
  [/^tpa_breakpoint$/, 'The throttle position where that reduction starts. Below this, gains are untouched.'],
  [/^tpa_mode$/, 'Whether TPA reduces D only, or P and D together.'],
  [/^throttle_boost/, 'A short kick of extra throttle on a fast throttle movement, so punch outs feel sharper than the motors alone would give.'],
  [/^thr_mid$/, 'Where the middle of the throttle stick sits in output terms. Raising it gives finer control near hover at the cost of the top end.'],
  [/^thr_expo$/, 'Softens the throttle around the middle of its travel, so hover is easier to hold and the ends stay reachable.'],
  [/^throttle_limit_(type|percent)$/, 'Caps the throttle output, either by scaling the whole range or by clipping the top. Used to make a fast quad flyable on a tight track.'],

  /* ---- Feedforward ---------------------------------------------------- */
  [/^feedforward_transition$/, 'Fades feedforward in away from centre stick, so tiny corrections around the middle are not amplified.'],
  [/^feedforward_smooth_factor$/, 'Smooths the feedforward signal. More is calmer and slightly later; less is sharper and noisier.'],
  [/^feedforward_jitter_factor$/, 'Ignores the small stick jitter a radio always has, so feedforward does not chase a thumb tremor.'],
  [/^feedforward_boost$/, 'Extra push on the sharpest part of a stick movement, on top of feedforward itself.'],
  [/^feedforward_max_rate_limit$/, 'Stops feedforward asking for more rotation than the rates allow.'],
  [/^feedforward_averaging$/, 'Averages feedforward over a number of RC frames. Smoother on a slow link, later on a fast one.'],

  /* ---- Filters -------------------------------------------------------- */
  [/^gyro_lpf1_dyn_(min|max)_hz$/, 'The ends of the dynamic gyro filter’s travel. It sits low when the quad is calm and opens up when you move, so cruise is quiet without costing you sharpness in a corner.'],
  [/^gyro_lpf1_(type|static_hz)$/, 'The first gyro lowpass. Lower is cleaner and hotter motors; higher is sharper and noisier. This is the cutoff to move first if the motors are cooking.'],
  [/^gyro_lpf2_/, 'The second gyro lowpass, sitting after the first. A backstop for noise the first one let through.'],
  [/^dterm_lpf1_dyn_(min|max)_hz$/, 'The ends of the dynamic D-term filter’s travel. D is the noisiest term, so this is usually the filter that decides how hot the motors run.'],
  [/^dterm_lpf1_/, 'The first D-term lowpass. Lowering it is the usual cure for hot motors, at the cost of some damping authority.'],
  [/^dterm_lpf2_/, 'The second D-term lowpass, after the first.'],
  [/^dterm_notch_/, 'A narrow notch in the D-term, for one specific frequency a frame rings at.'],
  [/^dyn_notch_count$/, 'How many moving notches hunt for motor noise at once. More catches more and costs more delay.'],
  [/^dyn_notch_q$/, 'How narrow each moving notch is. Higher is narrower: it removes less signal along with the noise, but has to be more accurate to catch it.'],
  [/^dyn_notch_(min|max)_hz$/, 'The band the moving notches are allowed to hunt in. Set the bottom above your frame’s natural ring or the notches will sit on it and never come off.'],
  [/^rpm_filter_harmonics$/, 'How many multiples of the motor’s own turning frequency to notch out. Most of what a quad hears is the first two.'],
  [/^rpm_filter_q$/, 'How narrow the RPM notches are. These track the motors exactly, so they can be narrow.'],
  [/^rpm_filter_(min_hz|fade_range_hz|lpf_hz|weights)/, 'Shapes the RPM notch filter: where it starts working, how it fades in, and how strongly each harmonic is cut.'],
  [/^yaw_lowpass_hz$/, 'A lowpass on yaw only. Yaw is slower and heavier than roll and pitch, so it tolerates more filtering than they do.'],
  [/^simplified_/, 'One of Betaflight’s own simplified tuning sliders. Moving it rewrites a whole group of PIDs or filters the way the firmware would. The Quad room drives these same sliders with fewer steps.'],

  /* ---- Rates ---------------------------------------------------------- */
  [/^rates_type$/, 'Which rates curve shape the sticks follow. All five of Betaflight’s are compiled and the quad flies whichever you choose.'],
  [/_srate$|_rc_rate$|_expo$/, 'Part of the rates curve: how far the sticks go and how sharply they get there. The Rates screen draws this curve live and is the better place to set it.'],

  /* ---- Angle and horizon ---------------------------------------------- */
  [/^angle_limit$/, 'How far Angle mode will let the quad lean. This is the ceiling a hands-off recovery levels back to.'],
  [/^level_/, 'How hard Angle and Horizon pull the quad back toward level, and how quickly.'],
  [/^horizon_/, 'Shapes Horizon mode, which is Angle near centre stick and Acro at the ends.'],

  /* ---- Airmode and motors --------------------------------------------- */
  [/^motor_output_limit$/, 'A cap on how much of the motor range the mixer may use.'],
  [/^motor_poles$/, 'The magnet count on the motors, which is what turns eRPM from the ESC into real RPM.'],
  [/^(mixer_type|thrust_linear)/, 'How the mixer turns the controller’s roll, pitch, yaw and throttle demands into four motor outputs.'],
  [/^idle_min_rpm$|^dshot_idle_value$/, 'How hard the motors idle. Enough idle keeps the props loaded so a descent does not become a tumble; too much makes the quad creep.'],
];

/*
 * The fallback. Only what the catalog actually knows, which is duller than an
 * invented explanation and is exactly why it is preferred. See the rules
 * above.
 */
export function genericNote(field) {
  const bits = [];
  if (field.lookup) {
    bits.push('A named choice from Betaflight’s own list.');
  } else if (Number.isFinite(field.min) && Number.isFinite(field.max)) {
    bits.push(`A number from ${field.min} to ${field.max}${field.units ? ` ${field.units}` : ''}.`);
  }
  bits.push('No plain-English note has been written for this key yet, so nothing here will guess at one.');
  return bits.join(' ');
}

export function keyNote(field) {
  if (!field || !field.key) {
    return '';
  }
  for (const [re, note] of NOTES) {
    if (re.test(field.key)) {
      return note;
    }
  }
  return genericNote(field);
}

/* How many of the catalog's keys have a written sentence, for the lint that
 * keeps this file honest as the catalog grows. */
export function hasKeyNote(key) {
  return NOTES.some(([re]) => re.test(String(key || '')));
}
