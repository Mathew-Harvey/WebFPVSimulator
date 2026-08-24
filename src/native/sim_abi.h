/*
 * sim_abi.h: the ABI between the compiled physics module and every host,
 * meaning the verification harness (Node and browser) and later the render
 * shell. This header is the contract. The harness in tests/ is written
 * against it and tests/ is read-only to the simulator implementer, so any
 * change here is an ABI change and must be argued in PROGRESS.md first.
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

#ifndef SIM_ABI_H
#define SIM_ABI_H

/*
 * Conventions, fixed by CLAUDE.md and this header:
 *
 * World frame: right-handed, z up, metres, SI throughout.
 * Body frame: right-handed, x forward, y left, z up.
 *   Positive p (about body x) rolls the quad to the right.
 *   Positive q (about body y) pitches the nose down.
 *   Positive r (about body z) yaws the nose to the left, counter-clockwise
 *   seen from above.
 *
 * Stick channels, as stored in .rec files and passed to sim_input:
 *   roll     -1..+1, +1 commands a roll to the right
 *   pitch    -1..+1, +1 commands nose up
 *   yaw      -1..+1, +1 commands nose right
 *   throttle  0..+1
 * Mapping these RC-convention channels onto Betaflight's internal signs is
 * the bridge's job, not the host's.
 *
 * Time: the module steps at a fixed 1000 Hz. One step is exactly 1 ms of
 * simulated time. sim_step(n) advances n steps. How the host batches calls
 * to sim_step must not affect the trajectory. Input samples carry their own
 * timestamps and the module consumes them by that timestamp, never by
 * arrival order relative to real time.
 */

#define SIM_ABI_VERSION 1

/* Physics step rate, Hz. Fixed. */
#define SIM_STEP_HZ 1000

/* Return codes. Every entry point returning int uses these. */
#define SIM_OK 0
#define SIM_ERR_NOT_IMPLEMENTED -1
#define SIM_ERR_BAD_ARG -2
#define SIM_ERR_BAD_STATE -3
#define SIM_ERR_CONFIG_PARSE -4

/*
 * State block layout, doubles, written by sim_state:
 *   [0]      t, simulated time, seconds
 *   [1..3]   position x y z, metres, world frame
 *   [4..6]   velocity x y z, m/s, world frame
 *   [7..10]  attitude quaternion w x y z, body to world
 *   [11..13] angular rate p q r, rad/s, body frame
 *   [14..17] motor RPM, motors 0..3 in Betaflight order
 *            (0 rear right, 1 front right, 2 rear left, 3 front left)
 *   [18]     pack voltage under load, volts
 *   [19]     pack current draw, amps
 */
#define SIM_STATE_DOUBLES 20

/*
 * Entry points. All are exported from the WASM module under these exact
 * names. The stub implementation returns SIM_ERR_NOT_IMPLEMENTED from every
 * entry point except sim_abi_version, which must always report the version
 * so a host can tell "module loaded, not implemented yet" from "wrong
 * module".
 */

/* Returns SIM_ABI_VERSION compiled into the module. */
int sim_abi_version(void);

/*
 * Initialise from a Betaflight CLI diff, UTF-8 text of the given length.
 * Full reset: config parsed and applied, dynamic state zeroed as in
 * sim_reset. Returns SIM_OK or an error code.
 */
int sim_init(const unsigned char *diff_utf8, int len);

/*
 * Reset dynamic state, keeping the parsed config. After reset: t = 0, quad
 * level and at rest at the world origin, free in the air (no ground contact
 * in the reset pose), motors stopped, armed, airmode on, battery at the
 * currently configured open-circuit cell voltage.
 */
int sim_reset(void);

/* Set open-circuit per-cell voltage, volts. Takes effect immediately. */
int sim_set_cell_voltage(double volts);

/*
 * Deliver one input sample. t_seconds is the sample's own timestamp on the
 * simulated clock. Samples arrive in non-decreasing timestamp order, always
 * before the 1 ms step in which their timestamp falls is executed. The
 * stream restarts at t = 0 after sim_init or sim_reset.
 */
int sim_input(double t_seconds, double roll, double pitch, double yaw,
              double throttle);

/* Advance n fixed 1 ms steps. n >= 0. */
int sim_step(int n);

/*
 * Bench override for check 8, motor-step-response. While a motor is
 * overridden the flight controller output for that motor is replaced by
 * the given duty, 0..1. motor is 0..3, or -1 for all motors. A negative
 * duty clears the override for the addressed motor or motors.
 */
int sim_motor_override(int motor, double duty);

/*
 * The ground holds the craft: zero the linear velocity and the body rates,
 * keeping position, attitude, motor speeds and battery state. The shell
 * calls this once at the moment a touchdown is judged a landing, because a
 * craft resting on the ground is held by a normal force this free-air model
 * does not have. Without it the frozen landed state kept its touchdown
 * descent rate, every freeze/unfreeze cycle of a slow takeoff resumed and
 * grew it, and at 60 fps a gentle throttle ramp accumulated 2.1 m/s of
 * phantom descent and was judged a crash the pilot never flew. Additive ABI
 * change, version unchanged: no existing entry point moved or changed
 * meaning. A replay that reproduces a flown session must issue the same
 * call at the same step, which the shell guarantees by deriving it from the
 * deterministic landing judgement.
 */
int sim_rest(void);

/*
 * Bounce off a world-frame contact. n is a unit normal pointing out of the
 * obstacle (from the solid toward the craft). Incoming speed along n is
 * reflected with the given restitution, the tangent is scaled by
 * tangent_keep, body rates are scaled by rate_keep, and the craft is placed
 * at world position p (metres, z up). The shell supplies p at the first
 * contact plus a small outward separation, already converted into the plant
 * frame, so a tunneled frame is rewound to the entry face rather than
 * pushed further through.
 *
 * This is the obstacle counterpart of sim_rest: the plant has no scene
 * geometry, so the shell judges the contact and writes the impulse. Additive
 * ABI change, version unchanged: no existing entry point moved or changed
 * meaning. A replay that never calls this is bit-identical to one from
 * before it existed. The verification harness never calls it.
 */
int sim_deflect(double nx, double ny, double nz,
                double restitution, double tangent_keep, double rate_keep,
                double px, double py, double pz);

/*
 * Enable or disable Betaflight ANGLE_MODE. Off (0) is acro, the default,
 * and the path every harness replay takes. On (non-zero) feeds the plant
 * attitude into Betaflight's compiled pidLevel and sets ANGLE_MODE, so
 * stick is a tilt target and centred sticks recover to level. Plant,
 * mixer and the acro PID are not reimplemented here: this is the same
 * flag a radio aux switch would raise. Additive ABI change, version
 * unchanged: no existing entry point moved or changed meaning. A replay
 * that never calls this is bit-identical to one from before it existed.
 */
int sim_set_angle_mode(int on);

/*
 * Enable or disable Betaflight launch control, the race-start hold.
 * Off (0) is the default, and the path every harness replay takes.
 * On (non-zero) is BOXLAUNCHCONTROL at arm: pid.c's applyLaunchControl
 * holds attitude at idle throttle until the stick crosses
 * launch_trigger_throttle_percent, then the mixer releases throttle
 * and the feature latches off. Additive ABI change, version unchanged:
 * no existing entry point moved or changed meaning. A replay that never
 * calls this is bit-identical to one from before it existed.
 */
int sim_set_launch_control(int on);

/*
 * Launch control state for the OSD. 0 off, 1 holding, 2 holding and
 * throttle within 10 percent of the trigger, 3 launched this arm.
 * Additive, same rule as sim_set_launch_control.
 */
int sim_launch_control_state(void);

/*
 * Mechanical launch stand. Off (0) is the default. On (non-zero) holds
 * the craft on a hinge at the rear underside: linear velocity is killed,
 * roll and yaw rates are killed, attitude is projected onto pitch about
 * world y (nose down), and the rear contact stays put so pitching does
 * not walk the quad off the block. qw..qz is the pitch-only pose to
 * seed when raising the stand, matching a ramp that the shell drew as
 * a render overlay while landed. Applied inside sim_step, so a batched
 * frame cannot accumulate gyroscopic roll between pins. Additive ABI,
 * version unchanged. The harness never calls this.
 */
int sim_set_launch_stand(int on, double px, double py, double pz,
                         double qw, double qx, double qy, double qz);

/*
 * Flight style. 0 is expert, the default and the full model, the path
 * every harness replay takes. Non-zero is arcade: the imperfection terms
 * are switched off so the craft flies as the symmetric ideal it is drawn
 * as. Arcade removes the propwash turbulence application, the per rotor
 * ring state asymmetry, the motor cant tables (thrust axes become exactly
 * vertical, so the build tolerance yaw coupling and its hover trim go),
 * and the gyro vibration and noise floor. The smooth aerodynamics stay:
 * advance ratio, ring state thrust loss, rotor drag, translational lift,
 * body side lift and the torque inflow coupling are physics, not
 * imperfections. Survives sim_reset and sim_init, exactly as the angle
 * mode flag does, so a shell that set it before a tune swap still has it
 * after. Additive ABI change, version unchanged: a replay that never
 * calls this is bit-identical to one from before it existed, which is
 * what keeps every recorded check honest.
 */
int sim_set_flight_style(int arcade);

/* Number of doubles sim_state writes. SIM_STATE_DOUBLES for this version. */
int sim_state_size(void);

/* Write the state block described above into out. */
int sim_state(double *out);

#endif /* SIM_ABI_H */
