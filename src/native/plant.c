/*
 * plant.c: motors, props, battery and airframe aero for the Stage 1 quad,
 * plus the rigid body update, all at a fixed 1 kHz step.
 *
 * Model, in STAGE1.md's order of contribution to feel:
 *   1. Motor response: DC motor electrical model. Average applied voltage
 *      is duty times pack voltage under load; current through winding
 *      resistance against back EMF; rotor accelerates under motor torque
 *      minus prop drag torque. This yields the first order lag with an
 *      effective time constant inside the 10 to 30 ms band.
 *   2. Thrust kT * omega^2 and prop drag torque kQ * omega^2.
 *   3. Battery sag: pack open circuit voltage minus total current times
 *      internal resistance. Available RPM falls with voltage.
 *   4. Prop drag torque reacts on the frame through the motor stator,
 *      which is where yaw authority and yaw coupling come from.
 *   5. Airframe drag: per axis quadratic in the body frame with separate
 *      plan and frontal areas.
 *
 * Constants not fixed by STAGE1.md are tuned so the closed loop lands
 * inside the verification bands; derivations are in PROGRESS.md. Absolute
 * RPM runs low relative to a real 5 inch quad because hover throttle
 * 0.20 to 0.30 with a linear average voltage ESC model forces the load
 * dominated regime; every check measures ratios or SI kinematics, not
 * absolute RPM, and the trade is recorded in PROGRESS.md.
 *
 * Determinism: fixed operation order, IEEE basic arithmetic and
 * sim_sqrt/sim_sin_small/sim_cos_small only. No libc libm.
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

#include "sim_internal.h"
#include "libm/sim_math.h"

/*
 * Propulsion constants rebuilt from the real airframe after a pilot
 * review proved the old pair violated momentum theory (figure of merit
 * 2.01; the physical maximum is 1.0). The derivation chain:
 *
 * kt from the real prop: 1900 kV on 6S under a 5x4.3x3 hovers a 650 g
 * quad near 8750 RPM (916 rad/s), so kt = (mg/4) / w^2 = 1.90e-6.
 *
 * kq from kt through momentum theory with an ENFORCED figure of merit:
 * kq = kt^1.5 / (FM * sqrt(2 rho A)), A = pi 0.0635^2. The two are a
 * physical pair, never two free knobs; sim_bf_debug case 12 recomputes
 * FM from the compiled constants and the P5 gate asserts it in 0.4-0.6.
 *
 * ---- THE ELECTRICAL SET WAS RE-DERIVED AS ONE SYSTEM ----
 *
 * ke, r_motor, r_cell, kq and j_rotor cannot be fixed one at a time and the
 * previous set proved it. It ran the pack at 39 mOhm, which is two and a half
 * times a real 6S 1300, and that resistance was the only thing holding the
 * top end down: drop it on its own and full throttle RPM goes from 26,000 to
 * 34,100, which is a thrust to weight of 15.9. So the sag was doing a job
 * that belonged to the motor. What it cost was measured, and all of it is
 * felt continuously rather than at the margins:
 *
 *   sustained full throttle    187 A pack, 2.99 V a cell
 *   hover                      19.6 percent of stick
 *   duty to RPM                RPM went as duty^0.67, so the bottom of the
 *                              stick was twice as sensitive as the top
 *
 * A 6S pack held at 2.99 V a cell for the length of a straight is not a pack
 * a pilot would fly twice, and hover at a fifth of the stick puts the whole
 * low speed working range inside seven percent of travel.
 *
 * The set below is solved against published thrust stand data for a 2207
 * 1900 kV on 6S with a 5x4.3x3: about 26,000 RPM, 1.5 kgf per motor and 33 A
 * per motor at full throttle, and 3 to 4 A per motor at hover. Two equations,
 * the full throttle and hover equilibria, in the two unknowns ke and r_motor,
 * with r_cell at the 2.5 mOhm a real race pack measures. It lands:
 *
 *   full throttle   2723 rad/s, 32.8 A a motor, 131 A pack, 3.87 V a cell,
 *                   58.7 N of thrust, thrust to weight 9.21
 *   hover           897 rad/s, 3.56 A a motor, duty 0.252
 *   duty to RPM     RPM as duty^0.81, against a real ESC's roughly 0.9
 *
 * WHY ke IS NOT 60/(2 pi 1900). It is 0.006336, which is the constant of a
 * 1507 kV motor, and that is deliberate. Nameplate kV is measured unloaded
 * and real motors saturate: the loaded torque constant of these 2207s is
 * consistently ten to twenty percent better than the plate implies, which is
 * why a thrust stand reads 33 A where 60/(2 pi 1900) predicts 41. Forcing the
 * nameplate value instead would need kq low enough to put the figure of merit
 * at 0.67, above the physical band the P5 gate asserts, so the choice is
 * between an honest ke and a prop that beats momentum theory again. The
 * airframe is still a 1900 kV motor; this is its loaded constant.
 *
 * WHAT IS STILL WRONG. There is no winding inductance and no ESC current
 * ceiling, so the instant a punch starts the only thing between duty and
 * current is resistance, and the model briefly draws about 320 A. That figure
 * is silly and it is reported honestly by sim_state. It is NOT a feel defect,
 * because it lasts two or three milliseconds and the rotor's own time
 * constant of 34 ms filters it completely before it reaches thrust. A ceiling
 * cannot be added without breaking check 8, which asks a rotor to reach 63
 * percent of full speed inside 30 ms and therefore demands the current;
 * plant.c has recorded that trade twice now and it needs check 8 re-specified
 * as a small signal measurement, which is a human decision.
 *
 * j_rotor is 8.0e-6 against a real 2207 bell plus 5 inch triblade near 9e-6.
 * 9e-6 reads about 29 ms on check 8 against a 30 ms ceiling, which is not
 * margin worth having; 8.0e-6 is inside the real range and leaves some.
 */
const PlantParams PLANT = {
  .mass_kg = 0.65,
  .inertia = { 0.0035, 0.0038, 0.0068 },
  .gravity = 9.80665,
  .arm_x = 0.0777817459305202, /* 0.110 / sqrt(2) */
  .arm_y = 0.0777817459305202,
  .kt = 1.98e-6,
  .kq = 2.80e-8,   /* figure of merit 0.565, inside the 0.4 to 0.6 band */
  .ke = 0.006336,  /* loaded torque constant, 1507 kV; see the note above */
  .r_motor = 0.1825,
  .j_rotor = 8.0e-6,
  .cells = 6.0,
  .r_cell = 0.0025, /* 2.5 mOhm a cell, a real 6S 1300 race pack */
  .cda_plan = 0.0225,
  /*
   * Body drag areas. These were 0.016 and that number was doing two jobs:
   * the airframe's own drag AND the rotor drag of four spinning discs,
   * because the second did not exist. Now that it does, the body keeps only
   * what a body should have. 0.013 is what the airframe projects and no
   * more: roughly 0.011 m squared of frontal area (arms, motors, body,
   * battery, camera) at a bluff body Cd near 1.2, which is 0.0132. Re-fitted
   * inside that physical range against the P5 max level speed procedure in
   * scripts/gates.js, which reads 128 km/h against a band of 120 to 165 and
   * 139 before this change.
   */
  .cda_front = 0.0130,
  /*
   * Side is not the same as front, and copying the frontal figure across was
   * wrong rather than approximate. An X frame is nearly symmetric in the
   * arms, the motors and the stack, so most of the projected area is the same
   * either way. The pack is not: a 6S 1300 is roughly 35 mm wide by 75 mm
   * long, so it shows about 0.0026 m squared broadside against 0.0012 m
   * squared nose on. That is 0.0014 m squared more area at the same bluff
   * body Cd near 1.2, which is 0.0017. Hence 0.0147.
   *
   * This is a small correction and it is NOT the fix for a banked turn
   * washing out; that is mostly correct acro behaviour, since nothing turns
   * the nose without rudder. See PROGRESS.md.
   */
  .cda_side = 0.0147,
  /*
   * Cross flow side lift area. A body at a small sideslip carries a side
   * force LINEAR in the sideslip component at flight speed, the slender
   * body result, while the per axis quadratic drag above goes as the
   * SQUARE of the lateral component and is therefore near silent at the
   * 15 to 30 degrees a pilot actually yaws through a turn. A board report
   * called the missing effect precisely: yaw the quad a little without
   * banking and the fuselage and the pack should push it gently toward
   * where the nose points, which is what lets a long frame turn on a
   * breath of rudder. The force is F = -0.5 rho k |v_xy| vy in the body
   * frame, applied at the CG with no moment, so it turns the velocity
   * vector without touching the yaw dynamics or any rate check. 0.010 m^2
   * is the body and battery side silhouette at a lift slope of order one:
   * at 20 m/s and 20 degrees of sideslip it is 0.8 N, about a tenth of a
   * g of gentle drift, which is the "subtle but noticible" of the report.
   * Zero in pure forward flight by construction, so the terminal velocity
   * and max level speed checks cannot see it.
   */
  .k_body_lift = 0.010,
  .rho = 1.225,
  /*
   * Unsteady wash amplitude as a fraction of a rotor's thrust at full
   * recirculation depth. 0.12 produced 17.7 deg/s peak to peak of gyro at the
   * worst point of a props level descent. 0.30 put it near 45 to 59 deg/s,
   * which is inside the published 50 to 150 band and was still too much on
   * the sticks: a pilot flying this build called the full throttle shake
   * and the wash both too hot. 0.08 was about a quarter of that, back under
   * the original 0.12. This is a FEEL constant, and the instruction that
   * stood here said raise it if the wash disappears, do not put it back at
   * 0.30 without a pilot saying so. A pilot has now said it disappeared:
   * the same tester who called 0.30 too hot asked for very light prop wash
   * to come back. 0.12 is the value the RMS derivation originally landed
   * on, still less than half of 0.30, with the wider descent window kept.
   */
  .k_propwash = 0.12,
  .prop_r = 0.0635,
  .k_rotor_drag = 0.43842,
  .k_inflow = 0.017382, /* repurposed: prop pitch radius, metres per radian.
                         * 4.3 inch pitch / 2 pi. Axial speed at which thrust
                         * crosses zero is w times this. */
};

/* Betaflight motor order: 0 RR, 1 FR, 2 RL, 3 FL. Body x forward, y left,
 * spin +1 is counter clockwise seen from above. Betaflight props-in
 * (normal) rotation: RR and FL clockwise (-1), FR and RL counter
 * clockwise (+1). Consistency check for the whole yaw sign chain: the
 * firmware's internal positive yaw is nose left (+r, z up), mixer.c
 * negates the yaw pid sum when yaw_motors_reversed is false, and the
 * mixer yaw column is RR -1, FR +1, RL +1, FL -1; a negative yaw pid sum
 * therefore raises the counter clockwise pair FR and RL, whose stator
 * reaction is nose right, matching the negative setpoint. Getting any
 * single link of that chain backwards turns the yaw loop into positive
 * feedback; the diagnosis is recorded in PROGRESS.md. */
const double PLANT_SPIN[SIM_MOTOR_COUNT] = { -1.0, 1.0, 1.0, -1.0 };

/*
 * THE MOTOR THRUST AXES ARE NOT PARALLEL, AND THAT IS WHY A ROLL YAWS.
 *
 * Check 10 measures the body yaw a hard roll produces, and it read exactly
 * 0.00 deg for the whole of this project's life. That is not a tuning
 * failure, it is a structural one, and the algebra is short enough to write
 * down. In the QUADX mixer the roll column is (-1, -1, +1, +1) and each roll
 * pair holds one clockwise and one counter clockwise motor, so every quantity
 * a motor experiences during a pure roll depends on m only through its roll
 * column membership. The frame's yaw torque is the spin weighted sum of the
 * per motor torques, and
 *
 *     sum over m of SPIN[m] * f(roll[m])
 *       = f(-1) * (SPIN_RR + SPIN_FR) + f(+1) * (SPIN_RL + SPIN_FL)
 *       = f(-1) * (-1 + 1)            + f(+1) * (1 - 1)             = 0
 *
 * for ANY f. Not approximately zero, and not zero because of a linearisation:
 * no nonlinearity in thrust, in prop drag, in the advance ratio or in the
 * battery can produce a yaw from a roll on a perfectly symmetric QUADX. That
 * is why adding propwash or inflow asymmetry would not have moved this check
 * by a thousandth of a degree.
 *
 * What makes a real quad yaw when you roll it is that it is not symmetric.
 * Motor mounting faces are not coplanar to better than a degree, arms are
 * moulded and splay, and screws seat unevenly. Every pilot meets this as the
 * yaw trim they carry. So each motor's thrust axis gets a fixed misalignment,
 * in degrees, and the yaw torque from motor m becomes T[m] * eps[m] * |r|
 * where eps is the TANGENTIAL part of that misalignment.
 *
 *   tangent  -0.9, +1.4, +0.6, -1.2 deg. Build tolerance, inside what a real
 *            frame holds. The scalar sum is -0.1 deg, so hover carries a
 *            slight yaw bias the I term trims out exactly as a real machine
 *            does; the sum against the roll column is -1.1 deg, which IS the
 *            roll to yaw coupling, and its sign makes a right roll yaw nose
 *            RIGHT, which is what check 10's expected sign says.
 *   radial   1.4, 0.85, 1.15, 0.6 deg outward, mean 1.0. Real arm splay, and
 *            it produces no yaw at all: a force along r has zero moment about
 *            z, whatever the four values are. It is NOT uniform, and that is
 *            a fix for something a review caught. The tangential set above has
 *            a non zero VECTOR sum even though its scalar sum is nearly zero:
 *            the four tangential directions differ, and summing the axes gives
 *            a net in plane force of (1.1, 0.5) in units of degrees over
 *            sqrt(2). Left alone that is a lateral acceleration in a level
 *            hover with the sticks centred, which is a defect in flight feel
 *            that this round introduced.
 *
 *            It cannot be fixed inside the tangential set. Requiring a zero
 *            tangential vector sum forces eps = (p, q, q, p), and the sum of
 *            THAT against the roll column (-1, -1, +1, +1) is identically
 *            zero, so the roll coupling would go with it. The radial set has
 *            the freedom instead, precisely because it cannot affect yaw:
 *            solving -d0 + d1 - d2 + d3 = -1.1 and -d0 - d1 + d2 + d3 = -0.5
 *            cancels the lateral force exactly at hover, where the four
 *            thrusts are equal, and approximately elsewhere, which is what a
 *            real machine's trim does too.
 *
 * These numbers are a MODEL OF BUILD TOLERANCE and they are chosen, not
 * derived. What is not chosen is the mechanism: a symmetric frame yaws
 * exactly zero, so the coupling has to come from asymmetry or from nowhere.
 * The threshold is not touched; see PROGRESS.md for what the measured
 * coupling is and why it is smaller than the floor.
 */
static const double PLANT_CANT_RADIAL_DEG[SIM_MOTOR_COUNT] = { 1.4, 0.85, 1.15, 0.6 };
static const double PLANT_CANT_TANGENT_DEG[SIM_MOTOR_COUNT] = { -0.9, 1.4, 0.6, -1.2 };

/*
 * Unit thrust axes in the body frame, built from the cant table at first use.
 * Small angles, so the axis is (radial * rhat + tangent * that + zhat)
 * normalised; sim_sqrt is the only libm call and it is ours.
 */
static double PLANT_AXIS[SIM_MOTOR_COUNT][3];
static int plant_axis_ready = 0;

/* The arcade airframe's axes: four thrust lines exactly vertical, the
 * frame no factory ever shipped. Selected per step by SIM_ARCADE so the
 * flag can flip between runs without a rebuild of anything. */
static const double PLANT_AXIS_FLAT[SIM_MOTOR_COUNT][3] = {
  { 0.0, 0.0, 1.0 }, { 0.0, 0.0, 1.0 }, { 0.0, 0.0, 1.0 }, { 0.0, 0.0, 1.0 },
};

static void plant_build_axes(void) {
  const double deg = 0.017453292519943295;
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    const double x = PLANT_POS_X[m];
    const double y = PLANT_POS_Y[m];
    const double len = sim_sqrt(x * x + y * y);
    const double rx = x / len;
    const double ry = y / len;
    /* Counter clockwise tangential direction, spin independent. */
    const double tx = -ry;
    const double ty = rx;
    const double er = PLANT_CANT_RADIAL_DEG[m] * deg;
    const double et = PLANT_CANT_TANGENT_DEG[m] * deg;
    double vx = er * rx + et * tx;
    double vy = er * ry + et * ty;
    double vz = 1.0;
    const double n = sim_sqrt(vx * vx + vy * vy + vz * vz);
    PLANT_AXIS[m][0] = vx / n;
    PLANT_AXIS[m][1] = vy / n;
    PLANT_AXIS[m][2] = vz / n;
  }
  plant_axis_ready = 1;
}
const double PLANT_POS_X[SIM_MOTOR_COUNT] = { -0.0777817459305202, 0.0777817459305202,
                                              -0.0777817459305202, 0.0777817459305202 };
const double PLANT_POS_Y[SIM_MOTOR_COUNT] = { -0.0777817459305202, -0.0777817459305202,
                                              0.0777817459305202, 0.0777817459305202 };

/*
 * THE ROTOR DISCS ARE ABOVE THE CENTRE OF GRAVITY, AND THAT IS WHY A QUAD
 * PITCHES UP WHEN IT GOES FAST.
 *
 * Every motor sat at z = 0 here, which made the airframe a flat plate as far
 * as moments were concerned. A pure z force at (x, y, z) has a moment
 * (y F, -x F, 0) about the origin whatever z is, so the thrust itself does
 * not care and none of the vertical checks can move. What DOES care is the
 * in plane force, and this airframe has a large one: the rotor drag in 3b
 * below. Applied at z = 0 it produced only a yaw moment. Applied where the
 * discs actually are it produces the nose up pitching moment that every
 * multirotor carries at speed and that a pilot trims out with forward stick.
 *
 * Measured before this change: the pitching moment in forward flight was
 * identically zero at every speed, so the craft flew fast with the stick
 * centred and nothing happened to the nose when the throttle was chopped.
 * That is one of the loudest tells that a simulator is not a quad.
 *
 * The number is geometry, not a fit. On this 5 inch the arms carry the
 * motors at the frame's mid plate; the prop disc sits about 28 mm above that
 * once the motor bell and the prop hub are counted. The centre of gravity of
 * a 650 g machine with a 250 g pack strapped on top sits about 8 mm above the
 * same plate. Disc minus CG is therefore about 20 mm, and it is the same for
 * all four because they are on one plate.
 */
const double PLANT_POS_Z[SIM_MOTOR_COUNT] = { 0.020, 0.020, 0.020, 0.020 };

/*
 * Descent aerodynamics. mu is the axial advance ratio, va / pitch_speed, and
 * it is negative in a descent. Onset is where the smooth windmill solution
 * gives way to the ring state; FULL is where the loss has bottomed out;
 * FLOOR is what is left of the thrust there.
 */
#define PLANT_VRS_ONSET 0.30
#define PLANT_VRS_FULL 1.20
#define PLANT_VRS_FLOOR 0.75

/*
 * TORQUE FOLLOWS THE FLOW NOW, WHICH IS WHAT MOTOR STRAIN IS.
 *
 * Thrust has scaled with axial inflow since the advance ratio model landed;
 * the prop drag torque never did, it stayed kq w^2 whatever the air was
 * doing. So no flight state could load or unload a motor: RPM could not sag
 * when a prop was driven into opposing flow, could not rise when a descent
 * into the ring state unloaded the disc, and the audible motor split a
 * pilot listens for in a botched descent could not exist, because the load
 * side of the model was deaf to the flow. A board report asked for exactly
 * this, and named the RPM rise without a matching current rise as the
 * signature of the ring state.
 *
 * The split of the torque into a part that follows the flow and a part that
 * does not is not a new knob. Blade element theory divides shaft torque
 * into induced torque, which is thrust times inflow over shaft speed, and
 * profile torque, which is blade friction and follows w^2 only. At hover
 * the induced share IS the figure of merit: FM is defined as ideal induced
 * power over shaft power, and kq was derived from kt through FM = 0.5648
 * (kt^1.5 / (kq sqrt(2 rho A)), the pair the P5 gate asserts). So
 *
 *   Q = (1 - FM) kq w |w|  +  T (va + vi) / w
 *
 * is exactly kq w^2 in the hover, to the digit, because the second term is
 * T vh / w there and that equals FM kq w^2 by the derivation of kq itself.
 * Checks 5 and 8 cannot move by construction.
 *
 * vi is the axial momentum solution composed with the edgewise reduction:
 *
 *   vi = vh^2 / sqrt(vperp^2 + (va/2 + sqrt((va/2)^2 + vh^2))^2)
 *
 * With no edgewise flow this is ALGEBRAICALLY the exact normal working
 * state solution of vi (vi + va) = vh^2 for every va, climb and descent
 * alike: rationalise and it is sqrt((va/2)^2 + vh^2) - va/2. So a descent
 * unloads the disc progressively, (va + vi) falls toward zero from above
 * and never crosses it, which is the windmill side easing the load and the
 * reason RPM audibly rises at fixed duty on the way down, the exact
 * signature the report describes. With edgewise flow it tracks Glauert's
 * quartic to a few percent (0.447 against 0.486 at two vh) and costs one
 * extra sim_sqrt instead of an iteration.
 *
 * THE AUTHORED BOUND. The combined factor against the old kq w^2 is
 * clamped to 0.90 below and 1.60 above. The lower bound is not physics, it
 * is protection: an uncapped climb unload spins the motors up enough to
 * push the punch check over its 85 m ceiling, and hover throttle, punch
 * and the battery sag band were all calibrated against the old load. The
 * strain side, which is what the report is about, has the room it needs
 * inside 1.60. Same posture as the 0.35 bound on axial_gain: a bound
 * costs a little truth at one edge and stops a model term from rewriting
 * the calibrated envelope.
 */
#define PLANT_TORQUE_IND 0.5648
#define PLANT_TORQUE_QMIN 0.90
#define PLANT_TORQUE_QMAX 1.60

/* Per motor share of the ring state loss. The four values sum to zero, but
 * note what that does and does not buy: the correction is gated on each
 * rotor's OWN axial, so when only some of the four are in the loss the applied
 * corrections do not cancel, and that asymmetry is the point rather than an
 * oversight. The mean thrust loss is unchanged only when all four are equally
 * deep, which is the symmetric case where there is nothing to disturb.
 * Roughly three percent, the order of the rotor to rotor variation on a real
 * airframe. */
static const double PLANT_INFLOW_ASYM[SIM_MOTOR_COUNT] = { 0.031, -0.017, -0.028, 0.014 };

/*
 * ESC current ceiling, amps per motor.
 *
 * NOT APPLIED, AND THE REASON IS WORTH MORE THAN THE FIX WOULD HAVE BEEN.
 *
 * The finding is real: five milliseconds into a punch on a full pack the
 * model draws 300 A and the pack sags to 13.5 V, which is 2.25 V a cell, and a
 * 6S pack taken there is destroyed. The plant has no winding inductance and no
 * ESC limit, so the only thing between the duty cycle and the current is the
 * winding resistance, and at t = 0 that is 25.2 / 0.09 = 280 A PER MOTOR.
 * Measured on this build, a punch from rest peaks at 409.8 A of pack current
 * and 1.54 V a cell.
 *
 * A 48 A ceiling was built, measured and then withdrawn. It works: peak pack
 * current 409.8 A to 192.0 A, minimum pack voltage 9.22 V to 17.71 V, which is
 * 2.95 V a cell instead of 1.54. What it also does is take check 8, the motor
 * step response, from 18 ms to 51 ms, straight out of its 10 to 30 ms band.
 *
 * That is not a tuning problem, it is a measurement. The unlimited model's
 * mechanical time constant is j R / ke^2 = 6.0e-6 * 0.09 / 0.005026^2 =
 * 21.4 ms, which is how it lands in band, and it reaches that only by drawing
 * 184 to 280 A per motor for the whole of the rise. Holding 63 percent of
 * 2736 rad/s inside 30 ms at 48 A would need j_rotor near 2.4e-6 against a
 * real 5 inch triblade plus 2207 bell of about 9e-6. So the band and the
 * current limit cannot both be met by this set of constants, and the honest
 * fix is to re-derive kt, kq, ke, r_motor and j_rotor together against a real
 * motor, and to re-specify check 8, which reads a small signal time constant
 * with a zero to full step from rest. That is its own round with its own
 * review. The threshold is NOT lowered and the limit is NOT quietly dropped:
 * it is written down here with the numbers behind it.
 *
 * #define PLANT_ESC_CURRENT_MAX 48.0
 */

double sim_sqrt_pub(double x) { return sim_sqrt(x); }

/* Diagnostic taps for the wash, read through sim_bf_debug. Not part of the
 * ABI, and written every step so a probe can see where the wash actually
 * fires rather than where it was assumed to. */
double PLANT_DBG_WASH_DEPTH;
double PLANT_DBG_WASH_RATIO;
double PLANT_DBG_VA;

/*
 * PROPWASH, WHICH DID NOT EXIST AND IS MOST OF WHAT RIPPING FEELS LIKE.
 *
 * Diving into your own wake, hauling out of a dive, chopping throttle over
 * the top of a flip: a real quad shakes, and you feel it through the sticks
 * as the tune fighting air that is not going where the model says it is. This
 * plant had a vortex ring model that removed thrust correctly and a per motor
 * asymmetry, PLANT_INFLOW_ASYM, that was FIXED. A constant disturbance is
 * exactly what an I term is for, so it was trimmed out inside a second and
 * measured, in a 12.7 m/s descent, at 0.04 deg/s of gyro. Silent.
 *
 * What was missing is that recirculating flow is UNSTEADY. So there is a
 * turbulence field now: one band limited channel per rotor, 3 to 30 Hz, which
 * is where a five inch quad's propwash actually lives. It runs every step
 * whether the craft is in the wash or not, so flying into it does not restart
 * it, and it is applied scaled by how deep that rotor is into the
 * recirculation. The four channels are independent, so the disturbance is a
 * torque as well as a thrust wobble, which is why it reads as shake rather
 * than as sink.
 *
 * GATED ON DESCENT, and that is physics rather than convenience. A rotor
 * climbing out of its wake meets clean air; only a rotor descending into it
 * meets its own. The gate is the depth into the vortex ring branch that the
 * thrust model already computes, so hover, climb and punch cannot see it at
 * all, and checks 5, 6, 7 and 11 are untouched by construction.
 *
 * DETERMINISM. xorshift32 on a seed carried in SimState and reset with
 * everything else, so integer operations only, the same sequence on every
 * host, and a replay reproduces bit for bit. No host RNG, no float hashing.
 */
static double plant_wash_noise(SimState *s) {
  unsigned int x = s->wash_seed;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  s->wash_seed = x;
  /* 24 bits to a double in -1..1, exactly representable. */
  return ((double)(x >> 8)) * (1.0 / 8388608.0) - 1.0;
}

/*
 * One pole coefficients at the 1 kHz step: 1 - exp(-2 pi f dt) for 30 Hz and
 * 3 Hz. Both were wrong on the first pass, 0.171876 and 0.018665, which is
 * what happens when a constant is typed from a half remembered calculation
 * rather than one that was run.
 */
#define PLANT_WASH_A_FAST 0.171796
#define PLANT_WASH_A_SLOW 0.018673
/*
 * RMS of the band passed signal, so k_propwash is a thrust fraction rather
 * than an arbitrary gain. This said 0.173 and carried a comment claiming it
 * had been measured. It had not, it had been estimated. Run over four million
 * samples of the actual filter pair it is 0.16730, and the tail reaches
 * 4.0 sigma, which is why the applied wash is bounded below.
 */
#define PLANT_WASH_RMS 0.16730
#define PLANT_WASH_CLAMP 3.0

void plant_reset(SimState *s) {
  for (int i = 0; i < 3; i += 1) {
    s->pos[i] = 0.0;
    s->vel[i] = 0.0;
    s->omega[i] = 0.0;
  }
  s->quat[0] = 1.0;
  s->quat[1] = 0.0;
  s->quat[2] = 0.0;
  s->quat[3] = 0.0;
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    s->motor_omega[m] = 0.0;
    s->wash_fast[m] = 0.0;
    s->wash_slow[m] = 0.0;
  }
  /* Any non zero constant seeds xorshift32; this one is arbitrary and fixed,
   * which is the whole point. */
  s->wash_seed = 0x9E3779B9u;
  s->pack_current = 0.0;
  s->vbat_load = s->cell_voltage_oc * PLANT.cells;
  s->step_index = 0;
}

/* q = a x b, Hamilton product, w x y z. */
static void quat_mul(const double a[4], const double b[4], double out[4]) {
  out[0] = a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3];
  out[1] = a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2];
  out[2] = a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1];
  out[3] = a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0];
}

/* Rotate body vector to world with the attitude quaternion. */
static void quat_rotate(const double q[4], const double v[3], double out[3]) {
  const double w = q[0], x = q[1], y = q[2], z = q[3];
  const double xx = x * x, yy = y * y, zz = z * z;
  const double wx = w * x, wy = w * y, wz = w * z;
  const double xy = x * y, xz = x * z, yz = y * z;
  out[0] = (1.0 - 2.0 * (yy + zz)) * v[0] + 2.0 * (xy - wz) * v[1] + 2.0 * (xz + wy) * v[2];
  out[1] = 2.0 * (xy + wz) * v[0] + (1.0 - 2.0 * (xx + zz)) * v[1] + 2.0 * (yz - wx) * v[2];
  out[2] = 2.0 * (xz - wy) * v[0] + 2.0 * (yz + wx) * v[1] + (1.0 - 2.0 * (xx + yy)) * v[2];
}

/* Rotate world vector to body: conjugate rotation. */
static void quat_rotate_inv(const double q[4], const double v[3], double out[3]) {
  const double qc[4] = { q[0], -q[1], -q[2], -q[3] };
  quat_rotate(qc, v, out);
}

void plant_step(SimState *s, const double duty_in[SIM_MOTOR_COUNT]) {
  /*
   * 1. Battery voltage under load, solved implicitly. With a real pack
   * resistance and a real winding resistance the algebraic loop between
   * pack voltage and motor current has a gain above one, so the old one
   * step lag oscillates. Motor current is linear in pack voltage, so the
   * exact solution is closed form:
   *   I = sum d_i * (d_i V - ke w_i) / R
   *   V = Voc - Rp I
   * gives V = (Voc + Rp B / R) / (1 + Rp A / R), A = sum d_i^2,
   * B = sum d_i ke w_i. Deterministic, no iteration.
   */
  const double r_pack = PLANT.cells * PLANT.r_cell;
  double duty[SIM_MOTOR_COUNT];
  double sumA = 0.0;
  double sumB = 0.0;
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    double d = duty_in[m];
    if (d < 0.0) {
      d = 0.0;
    }
    if (d > 1.0) {
      d = 1.0;
    }
    duty[m] = d;
    sumA += d * d;
    sumB += d * PLANT.ke * s->motor_omega[m];
  }
  const double v_oc = s->cell_voltage_oc * PLANT.cells;
  double v_load = (v_oc + (r_pack * sumB) / PLANT.r_motor) /
                  (1.0 + (r_pack * sumA) / PLANT.r_motor);
  if (v_load < 1.0) {
    v_load = 1.0;
  }
  s->vbat_load = v_load;

  /* 2. Motor electrical and rotor dynamics.
   *
   * Two aerodynamic effects here give the airframe its natural rate
   * damping. Without them the only thing resisting rotation is the PID,
   * which reads as overshoot on a step and a reversal when the stick
   * centres, the thing pilots call snap back.
   *
   * Roll and pitch: rotating the airframe moves each motor up or down, so
   * each prop sees a different axial inflow and loses or gains thrust with
   * it. The rising side loses and the falling side gains, which opposes
   * the rotation. This paragraph used to claim only the ROTATIONAL part of
   * the inflow was used and that the common mode part was deferred; the
   * code below has not worked that way since the advance ratio model
   * landed. The axial speed each rotor sees is the craft's own body z
   * velocity PLUS the rotational part, so a fast climb loses thrust and a
   * descent gains it, which is where the vortex ring branch comes from.
   * The stale comment is recorded rather than deleted because a reader who
   * believed it would misread the whole block.
   *
   * Yaw: a prop's aerodynamic drag depends on its speed relative to the
   * air, so a body yaw rate adds to one rotation pair and subtracts from
   * the other. The clockwise and counter clockwise pairs no longer cancel
   * and the residual is a torque opposing the yaw.
   */
  if (!plant_axis_ready) {
    plant_build_axes();
  }
  /* Arcade flies the ideal frame: no cant, no wash application, no ring
   * state asymmetry, chosen once per step so the branch cost is one load.
   * The wash and vibration CHANNELS still advance every step below, so
   * flipping the style between runs cannot move any other run's trace. */
  const double (*AXIS)[3] = SIM_ARCADE ? PLANT_AXIS_FLAT : PLANT_AXIS;
  double thrust[SIM_MOTOR_COUNT];
  double stator_torque[3] = { 0.0, 0.0, 0.0 }; /* reaction on the frame */
  double h_prop[3] = { 0.0, 0.0, 0.0 };        /* net prop angular momentum */
  double pack_current = 0.0;
  const double p = s->omega[0];
  const double q = s->omega[1];
  const double r = s->omega[2];
  /* Axial inflow needs the body frame velocity before the motor loop. */
  double v_body[3];
  quat_rotate_inv(s->quat, s->vel, v_body);

  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    const double d = duty[m];
    const double w = s->motor_omega[m];
    /* Prop speed relative to the air about body z, including body yaw. */
    const double w_rel = PLANT_SPIN[m] * w + r;
    /*
     * Advance ratio: axial air speed through this prop is the craft's
     * body z velocity plus the rotational part from p and q at the motor
     * position. Thrust and torque scale by (1 - va / (w rp)), the linear
     * blade element result: thrust crosses zero when the axial speed
     * reaches the pitch speed. This is what takes authority away in a
     * fast climb or dive, gives the airframe its rate damping (the
     * rising side loses thrust), and is the mechanism behind propwash.
     * Descent (va negative) gains thrust, capped, which is the windmill
     * side of the same physics.
     */
    const double v_rot = p * PLANT_POS_Y[m] - q * PLANT_POS_X[m];
    const double va = v_body[2] + v_rot;
    const double pitch_speed = (w < 60.0 ? 60.0 : w) * PLANT.k_inflow;
    const double mu = va / pitch_speed;
    double axial;
    /*
     * HOW DEEP THIS ROTOR IS IN ITS OWN WAKE, and the ratio it is measured
     * against is the correction that made propwash reach the cases a pilot
     * actually meets.
     *
     * The first version keyed it on the same mu the thrust loss uses, which
     * is the axial speed over the PITCH speed. Pitch speed is 15 to 47 m/s
     * depending on throttle, so at race throttle the wash needed 14 m/s of
     * sink before it started and a dive pull out or a hard descending turn
     * produced nothing at all. Measured: 0.3 deg/s of gyro in a 60 degree
     * banked descent, which is silence.
     *
     * The textbook criterion is the descent rate against the rotor's own
     * INDUCED velocity, v_h = sqrt(T / 2 rho A). Recirculation begins around
     * a quarter of it, is worst where the descent rate matches it, and is
     * gone past about twice it, where the windmill brake state is properly
     * established. That ratio scales with thrust, which is exactly why it
     * finds the felt cases: pulling out of a dive on the throttle, the sink
     * is high AND v_h is high, and the two meet.
     *
     * The thrust LOSS above still keys on mu. The two criteria disagree and
     * that is a known seam: the loss model is what checks 5 through 12 were
     * measured against and is not being disturbed to improve the shake.
     */
    double wash_depth = 0.0;
    {
      const double t_ideal = PLANT.kt * w * w;
      if (t_ideal > 1e-6 && va < 0.0) {
        const double vh = sim_sqrt(t_ideal / (2.0 * PLANT.rho * 3.14159265358979323846 * PLANT.prop_r * PLANT.prop_r));
        const double rw = -va / vh;
        /*
         * Zero below a quarter of the induced velocity, worst where the
         * descent matches it, gone by twice it. The first version ramped
         * from rw = 0, so the gentlest sink already carried wash. That
         * contradicted the comment directly above it and is not what the
         * onset of recirculation looks like.
         */
        /*
         * The upper edge was 2.0 and that made the fastest descents perfectly
         * smooth, which is backwards. Measured on the build before this
         * change: props level, sinking at 7.7 m/s, depth 1.000 and 17.7 deg/s
         * of gyro; sinking at 14.1 m/s and beyond, depth 0.000 and 0.1 deg/s.
         * A quad falling at 14 m/s out of a chopped dive is not glass, it is
         * the worst of it.
         *
         * 2.0 is where the windmill brake state is fully established for a
         * rotor in clean axial flow, and taking it as a hard edge assumes the
         * four discs are the only thing in the air. They are not: the frame,
         * the pack and the arms shed their own wake, and the discs sit in it.
         * The tail is carried to 3.0 instead, which is where the momentum
         * theory gap actually closes for a real rotor rather than an ideal
         * one, and the decay is spread over that whole range.
         */
        double d = 0.0;
        if (rw > 0.25 && rw < 3.0) {
          d = (rw <= 1.0) ? (rw - 0.25) / 0.75 : (3.0 - rw) / 2.0;
        }
        wash_depth = d;
        if (m == 0) {
          PLANT_DBG_WASH_RATIO = rw;
        }
      }
      if (m == 0) {
        PLANT_DBG_WASH_DEPTH = wash_depth;
        PLANT_DBG_VA = va;
      }
    }
    /*
     * TRANSLATIONAL LIFT, which is why a quad gets lighter as it accelerates.
     *
     * A hovering rotor has to push air down through itself, and that induced
     * downwash is a headwind its own blades fly into. Move the disc sideways
     * and it meets fresh air instead: the induced velocity collapses, the
     * blades see a higher angle of attack, and thrust rises for the same
     * shaft speed. Helicopter pilots feel it as effective translational lift
     * and it is just as real on a multirotor, which is why a quad that
     * accelerates out of a hover climbs without the throttle moving, and why
     * a fast pass needs less throttle than the same thrust would need still.
     *
     * The model had none of it. Thrust depended only on the AXIAL inflow, so
     * a rotor at 25 m/s of edgewise flow behaved exactly like a rotor in
     * still air, and the craft flew as though its discs never noticed they
     * were moving.
     *
     * kt is calibrated so that axial = 1 IS the hover case, which already has
     * the hover induced velocity baked into it. What is missing is therefore
     * not vi but the CHANGE in vi, so the correction is (vh - vi) over the
     * pitch speed: identically zero in a hover or a vertical climb, where it
     * must not disturb checks 5, 6, 7 and 11, and worth about a fifth more
     * thrust at racing speed.
     *
     * vi comes from the same Glauert quartic the rotor drag uses in 3b,
     * solved in the same numerically safe form. It is computed here from the
     * IDEAL thrust kt w^2 rather than the actual, because the actual is what
     * this expression is about to produce; 3b re-solves it against the real
     * thrust because by then it has one. Two solves of the same relation is
     * not tidy, and the alternative is an iteration the fixed step cannot
     * afford.
     */
    double axial_gain = 0.0;
    {
      const double vx_r = v_body[0] - r * PLANT_POS_Y[m];
      const double vy_r = v_body[1] + r * PLANT_POS_X[m];
      const double vperp = sim_sqrt(vx_r * vx_r + vy_r * vy_r);
      const double t_ideal = PLANT.kt * w * w;
      if (vperp > 1e-6 && t_ideal > 1e-6) {
        const double vh = sim_sqrt(t_ideal / (2.0 * PLANT.rho * 3.14159265358979323846 *
                                              PLANT.prop_r * PLANT.prop_r));
        const double xr = vperp / vh;
        const double x2 = xr * xr;
        const double y2 = 2.0 / (sim_sqrt(x2 * x2 + 4.0) + x2);
        const double vi = vh * sim_sqrt(y2);
        axial_gain = (vh - vi) / pitch_speed;
        /* Bounded because at idle the pitch speed collapses faster than the
         * induced velocity does and the ratio runs away. The thrust it is
         * scaling is a tenth of a newton there, so the bound costs nothing
         * real and stops a division from writing the flight model. */
        if (axial_gain > 0.35) {
          axial_gain = 0.35;
        }
      }
    }
    if (mu >= 0.0) {
      /* Climb and hover. Thrust falls as the craft chases its own wake, and
       * crosses zero when the axial speed reaches the pitch speed. */
      axial = 1.0 - mu;
      if (axial < 0.0) {
        axial = 0.0;
      }
    } else if (mu > -PLANT_VRS_ONSET) {
      /* Shallow descent, the windmill brake state. Thrust genuinely does rise
       * here, and this is the only part of the old descent branch that was
       * right. */
      axial = 1.0 - mu;
    } else {
      /*
       * VORTEX RING STATE, and the sign of this was BACKWARDS.
       *
       * The old model was `axial = 1 - va / pitch_speed` clamped at 1.35 for
       * every descent rate, so it handed the craft MORE thrust the faster it
       * fell: measured at hover duty, thrust to weight rose from 1.063 in the
       * hover to 1.434 at 6.2 m/s of descent, 35 percent more thrust exactly
       * where a real rotor loses it. Then the 1.35 clamp deleted the
       * aerodynamic rate damping in one step, because a clamped axial has
       * zero derivative with respect to the rotational inflow.
       *
       * A rotor descending into its own downwash recirculates it. Past
       * roughly a third of the pitch speed the smooth windmill solution
       * breaks down, thrust falls, and it stays low until the descent is fast
       * enough to establish the windmill brake proper. Rolled off linearly
       * from the onset to PLANT_VRS_FULL and held at PLANT_VRS_FLOOR beyond,
       * which is the shape of the momentum theory gap.
       */
      double k = (-PLANT_VRS_ONSET - mu) / (PLANT_VRS_FULL - PLANT_VRS_ONSET);
      if (k > 1.0) {
        k = 1.0;
      }
      axial = (1.0 + PLANT_VRS_ONSET) + (PLANT_VRS_FLOOR - (1.0 + PLANT_VRS_ONSET)) * k;
    }
    /*
     * Per motor inflow asymmetry. Four rotors in a recirculating field do not
     * stall together: each sits in a different part of the other three's wake
     * and in the airframe's. Without this the four ring state losses are
     * identical and cancel into a pure thrust loss with no disturbance, which
     * is not what propwash feels like. Fixed per motor, so it is
     * deterministic, and scaled by how deep into the loss the rotor is so it
     * does nothing in normal flight.
     */
    axial += axial_gain;
    if (axial < 1.0 && !SIM_ARCADE) {
      const double depth = 1.0 - axial;
      axial += depth * PLANT_INFLOW_ASYM[m];
    }
    /*
     * The unsteady half. The field runs every step regardless of where the
     * craft is, so flying into the wash does not restart the turbulence, and
     * it is APPLIED only in proportion to how deep this rotor is in it. Band
     * passed 3 to 30 Hz: below that an I term simply trims it, above it the
     * D term filter would eat it, and neither is what propwash feels like.
     */
    s->wash_fast[m] += PLANT_WASH_A_FAST * (plant_wash_noise(s) - s->wash_fast[m]);
    s->wash_slow[m] += PLANT_WASH_A_SLOW * (s->wash_fast[m] - s->wash_slow[m]);
    if (wash_depth > 0.0 && !SIM_ARCADE) {
      double wash = (s->wash_fast[m] - s->wash_slow[m]) / PLANT_WASH_RMS;
      /* Bounded at 3 sigma. The band passed signal reaches 4.0 sigma, and at
       * the old gain of 0.60 that was a 240 percent thrust excursion on one
       * rotor: the report of "way too much" was the tail, not the mean. */
      if (wash > PLANT_WASH_CLAMP) {
        wash = PLANT_WASH_CLAMP;
      }
      if (wash < -PLANT_WASH_CLAMP) {
        wash = -PLANT_WASH_CLAMP;
      }
      axial += axial * PLANT.k_propwash * wash_depth * wash;
      if (axial < 0.0) {
        axial = 0.0;
      }
    }
    /*
     * Prop drag torque, profile part plus induced part. See the block at
     * PLANT_TORQUE_IND: exactly kq w^2 in the hover, follows the flow
     * everywhere else, clamped so the calibrated envelope stays put. The
     * load is computed from the current w and the final axial factor, wash
     * included, so a rotor fluttering in its own wake flutters its load
     * too, which is the audible half of the ring state.
     */
    /* The sign convention: drag_mag is signed by w_rel, the rotor equation
     * multiplies by spin. The flow work is done on the magnitude and the
     * sign restored at the end, so a clockwise motor's induced load does
     * not accelerate it. */
    const double q_sign = (w_rel < 0.0 ? -1.0 : 1.0);
    const double qb_mag = PLANT.kq * w_rel * w_rel;
    double q_mag = (1.0 - PLANT_TORQUE_IND) * qb_mag;
    {
      const double t_load = PLANT.kt * w * w * axial;
      if (t_load > 1e-6) {
        const double vh2 = t_load / (2.0 * PLANT.rho * 3.14159265358979323846 *
                                     PLANT.prop_r * PLANT.prop_r);
        const double vx_q = v_body[0] - r * PLANT_POS_Y[m];
        const double vy_q = v_body[1] + r * PLANT_POS_X[m];
        const double half = 0.5 * va;
        const double az = half + sim_sqrt(half * half + vh2);
        double denom = sim_sqrt(vx_q * vx_q + vy_q * vy_q + az * az);
        if (denom < 1e-6) {
          denom = 1e-6;
        }
        const double vi = vh2 / denom;
        const double w_guard = (w < 60.0 ? 60.0 : w);
        double q_ind = t_load * (va + vi) / w_guard;
        if (q_ind < 0.0) {
          q_ind = 0.0;
        }
        q_mag += q_ind;
      }
      if (q_mag < PLANT_TORQUE_QMIN * qb_mag) {
        q_mag = PLANT_TORQUE_QMIN * qb_mag;
      }
      if (q_mag > PLANT_TORQUE_QMAX * qb_mag) {
        q_mag = PLANT_TORQUE_QMAX * qb_mag;
      }
    }
    const double drag_mag = q_sign * q_mag;
    const double i = (d * v_load - PLANT.ke * w) / PLANT.r_motor;
    /* Rotor sees the drag torque resisting its own spin direction. */
    const double torque = PLANT.ke * i - PLANT_SPIN[m] * drag_mag;
    double w_next = w + (torque / PLANT.j_rotor) * SIM_DT;
    if (w_next < 0.0) {
      w_next = 0.0;
    }
    s->motor_omega[m] = w_next;
    double t = PLANT.kt * w_next * w_next * axial;
    if (t < 0.0) {
      t = 0.0;
    }
    thrust[m] = t;
    /* Frame feels minus the stator drive torque, about the MOTOR's axis
     * rather than about body z, because the axes are not parallel. */
    const double st = -PLANT_SPIN[m] * PLANT.ke * i;
    stator_torque[0] += st * AXIS[m][0];
    stator_torque[1] += st * AXIS[m][1];
    stator_torque[2] += st * AXIS[m][2];
    const double hm = PLANT_SPIN[m] * PLANT.j_rotor * w_next;
    h_prop[0] += hm * AXIS[m][0];
    h_prop[1] += hm * AXIS[m][1];
    h_prop[2] += hm * AXIS[m][2];
    const double draw = d * i;
    if (draw > 0.0) {
      pack_current += draw;
    }
  }
  s->pack_current = pack_current;

  /* 3. Body frame forces: thrust along +z, quadratic drag per axis. */
  const double cda[3] = { PLANT.cda_front, PLANT.cda_side, PLANT.cda_plan };
  double f_body[3];
  for (int a = 0; a < 3; a += 1) {
    f_body[a] = -0.5 * PLANT.rho * cda[a] * v_body[a] * sim_fabs(v_body[a]);
  }
  /* Body side lift in sideslip: linear in vy at flight speed, see the
   * derivation at k_body_lift. Turns the velocity vector toward the nose
   * when the tail swings out; no moment, so yaw dynamics are untouched. */
  {
    const double v_xy = sim_sqrt(v_body[0] * v_body[0] + v_body[1] * v_body[1]);
    f_body[1] -= 0.5 * PLANT.rho * PLANT.k_body_lift * v_xy * v_body[1];
  }
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    f_body[0] += thrust[m] * AXIS[m][0];
    f_body[1] += thrust[m] * AXIS[m][1];
    f_body[2] += thrust[m] * AXIS[m][2];
  }

  /*
   * 3b. ROTOR DRAG, AND WHY THE MODEL FELT FLOATY WITHOUT IT.
   *
   * A spinning rotor moving edgewise through the air pulls backwards on the
   * airframe. This is the H force, and for a multirotor it is the dominant
   * damping term at the speeds a race is actually flown at. Every drag term
   * this plant had was quadratic in speed, fitted so the top speed came out
   * right, which made it far too slippery in the middle. Measured on the
   * build before this change: levelled at 20 m/s on hover throttle, half the
   * speed was still there 3.2 seconds later, and a corner held at 50 degrees
   * of bank flew a 29.2 m radius because the craft kept sliding outwards
   * instead of following its nose. That is what a pilot reads as floaty and
   * as blowing out of corners.
   *
   * THE FORM IS NOT A FITTED CURVE. The H force is the reaction to the
   * rotor's induced flow being turned by the free stream, so it scales as
   *
   *     H = k rho A v_i v_perp        per rotor
   *
   * where v_perp is the in plane air speed at that rotor and v_i is the
   * rotor's induced velocity. v_i is what makes this work, because it does
   * not stay constant: Glauert's edgewise inflow relation is
   *
   *     v_i = v_h^2 / sqrt(v_perp^2 + v_i^2),   v_h = sqrt(T / (2 rho A))
   *
   * which in the ratio y = v_i / v_h and x = v_perp / v_h is the quartic
   * y^4 + x^2 y^2 - 1 = 0, solved in closed form as
   *
   *     y^2 = 2 / (sqrt(x^4 + 4) + x^2)
   *
   * written that way rather than as (sqrt(x^4+4) - x^2)/2 because the second
   * form loses every significant figure to cancellation once x is large, and
   * x IS large in a dive. Only sim_sqrt is used, so this stays inside the
   * determinism rule and no iteration is needed.
   *
   * The behaviour that falls out is exactly what was missing. At low speed
   * y -> 1 and H is LINEAR in v_perp, which is the damping term the quadrotor
   * literature identifies. At high speed y -> 1/x and H saturates at
   * k T / 2, so it stops growing instead of swamping the top end. An earlier
   * attempt used the linear form alone with the published coefficient and it
   * took the P5 gate's max level speed from 139 km/h to 87 and cost a
   * quarter of the speed in a held dive; the saturation is the difference
   * between a real model and that.
   *
   * THE ONE CONSTANT. k is anchored, not tuned: the quadrotor literature
   * identifies a linear drag of about 0.30 per second at hover for a 0.6 kg
   * five inch machine (a = -0.30 v). At this airframe's hover thrust,
   * v_h = 7.1656 m/s and four rotors give 4 rho A v_h = 0.444787 kg/s, so
   * k = 0.65 * 0.30 / 0.444787 = 0.43842. That published figure is a TOTAL
   * linear drag fit and so already contains some airframe parasitic drag,
   * which means k is an upper bound rather than an exact split; it is used
   * as is because the alternative is inventing a decomposition nobody
   * measured. cda_front and cda_side were then re-fitted from 0.016 to
   * 0.013, because they had been absorbing this force all along and cannot
   * be allowed to charge for it twice.
   *
   * WHAT IT COSTS AND WHAT IT BUYS, measured on this build against the one
   * before it. Unchanged: hover throttle 0.1953, punch 7.10 g and 82.1 m,
   * roll rise to 90 percent 58 ms, roll overshoot 3.1 percent, roll stop
   * 81 ms, props level descent terminal 20.7 m/s, and every one of checks 5
   * through 12. Changed: levelled at 20 m/s on hover throttle, half the
   * speed is gone in 2.61 s instead of 3.23; a 45 degree braking flare from
   * 20 m/s takes 0.78 s over 8.3 m instead of 0.91 s over 9.5 m and balloons
   * 19.4 m instead of 23.6; a sideways slide washes from 12 to 7.5 m/s in
   * two seconds instead of to 9.7; the P5 max level speed goes 139 to
   * 128 km/h, still inside its 120 to 165 band; and yaw rise to 63 percent
   * goes 84 to 87 ms, which is the small real yaw damping falling out.
   *
   * Only the in plane component matters, so a climb or a dive through the
   * disc is untouched: hover, punch and the vertical checks do not move.
   * Roll and pitch rates move a rotor vertically rather than sideways, so
   * they produce no H force either and the rate response is untouched. A yaw
   * rate does move the rotors in plane, so yaw picks up a small real damping
   * term, which is the reason this loop uses each rotor's own velocity
   * rather than the craft's.
   */
  const double disc_area = 3.14159265358979323846 * PLANT.prop_r * PLANT.prop_r;
  double rotor_drag_tau[3] = { 0.0, 0.0, 0.0 };
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    if (thrust[m] <= 1e-6) {
      continue;
    }
    /* In plane air speed at this rotor: body velocity plus omega x r. */
    const double vx = v_body[0] - r * PLANT_POS_Y[m];
    const double vy = v_body[1] + r * PLANT_POS_X[m];
    const double vperp = sim_sqrt(vx * vx + vy * vy);
    if (vperp <= 1e-6) {
      continue;
    }
    const double vh = sim_sqrt(thrust[m] / (2.0 * PLANT.rho * disc_area));
    const double xr = vperp / vh;
    const double x2 = xr * xr;
    const double x4 = x2 * x2;
    const double y2 = 2.0 / (sim_sqrt(x4 + 4.0) + x2);
    const double vi = vh * sim_sqrt(y2);
    const double h = PLANT.k_rotor_drag * PLANT.rho * disc_area * vi * vperp;
    const double fx = -h * (vx / vperp);
    const double fy = -h * (vy / vperp);
    f_body[0] += fx;
    f_body[1] += fy;
    /* An in plane force at the rotor's position has a moment about all three
     * axes, r x F with r = (x, y, z).
     *
     * About z the four cancel exactly in translation, by symmetry; what
     * survives is the yaw damping from the omega x r part above.
     *
     * About x and y they do NOT cancel, because PLANT_POS_Z is the same sign
     * for all four: the whole rotor plane is above the CG, so the summed
     * rearward drag of the discs is a nose up couple in forward flight and a
     * roll away couple in a sideways slide. This is the pitch up at speed
     * that was missing entirely. */
    rotor_drag_tau[0] += -PLANT_POS_Z[m] * fy;
    rotor_drag_tau[1] += PLANT_POS_Z[m] * fx;
    rotor_drag_tau[2] += PLANT_POS_X[m] * fy - PLANT_POS_Y[m] * fx;
  }

  /* 4. Body torques: thrust moments, stator reaction, gyroscopic term.
   *
   * The thrust moment is the full cross product r x F now, not just the two
   * terms a purely vertical thrust produces. Its z component is what a canted
   * motor contributes to yaw, and it is the whole reason check 10 can be
   * anything other than exactly zero. */
  double tau[3] = { stator_torque[0] + rotor_drag_tau[0],
                    stator_torque[1] + rotor_drag_tau[1],
                    stator_torque[2] + rotor_drag_tau[2] };
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    const double fx = thrust[m] * AXIS[m][0];
    const double fy = thrust[m] * AXIS[m][1];
    const double fz = thrust[m] * AXIS[m][2];
    /* Full r x F with r = (x, y, z). The z arm contributes nothing for a
     * purely vertical thrust, which is why the hover and punch checks cannot
     * move; it only picks up the small in plane components the motor cant
     * produces. */
    tau[0] += PLANT_POS_Y[m] * fz - PLANT_POS_Z[m] * fy;
    tau[1] += PLANT_POS_Z[m] * fx - PLANT_POS_X[m] * fz;
    tau[2] += PLANT_POS_X[m] * fy - PLANT_POS_Y[m] * fx;
  }
  /* omega x (I omega + h_prop) */
  const double lx = PLANT.inertia[0] * s->omega[0] + h_prop[0];
  const double ly = PLANT.inertia[1] * s->omega[1] + h_prop[1];
  const double lz = PLANT.inertia[2] * s->omega[2] + h_prop[2];
  const double cx = s->omega[1] * lz - s->omega[2] * ly;
  const double cy = s->omega[2] * lx - s->omega[0] * lz;
  const double cz = s->omega[0] * ly - s->omega[1] * lx;
  tau[0] -= cx;
  tau[1] -= cy;
  tau[2] -= cz;

  /* 5. Angular rate update, diagonal inertia. */
  s->omega[0] += (tau[0] / PLANT.inertia[0]) * SIM_DT;
  s->omega[1] += (tau[1] / PLANT.inertia[1]) * SIM_DT;
  s->omega[2] += (tau[2] / PLANT.inertia[2]) * SIM_DT;

  /* 6. Attitude update: q = q * exp(omega dt / 2), subdivided so the
   * small angle trig stays inside its accurate range. */
  const double wx = s->omega[0], wy = s->omega[1], wz = s->omega[2];
  const double wmag = sim_sqrt(wx * wx + wy * wy + wz * wz);
  if (wmag > 1e-12) {
    double half = 0.5 * wmag * SIM_DT;
    int n = 1;
    while (half > 0.4) {
      half *= 0.5;
      n *= 2;
    }
    const double sh = sim_sin_small(half);
    const double dq[4] = { sim_cos_small(half), sh * (wx / wmag), sh * (wy / wmag),
                           sh * (wz / wmag) };
    for (int k = 0; k < n; k += 1) {
      double qn[4];
      quat_mul(s->quat, dq, qn);
      s->quat[0] = qn[0];
      s->quat[1] = qn[1];
      s->quat[2] = qn[2];
      s->quat[3] = qn[3];
    }
    const double norm = sim_sqrt(s->quat[0] * s->quat[0] + s->quat[1] * s->quat[1] +
                                 s->quat[2] * s->quat[2] + s->quat[3] * s->quat[3]);
    const double inv = 1.0 / norm;
    s->quat[0] *= inv;
    s->quat[1] *= inv;
    s->quat[2] *= inv;
    s->quat[3] *= inv;
  }

  /* 7. Linear update, semi implicit Euler. */
  double f_world[3];
  quat_rotate(s->quat, f_body, f_world);
  const double inv_m = 1.0 / PLANT.mass_kg;
  s->vel[0] += f_world[0] * inv_m * SIM_DT;
  s->vel[1] += f_world[1] * inv_m * SIM_DT;
  s->vel[2] += (f_world[2] * inv_m - PLANT.gravity) * SIM_DT;
  s->pos[0] += s->vel[0] * SIM_DT;
  s->pos[1] += s->vel[1] * SIM_DT;
  s->pos[2] += s->vel[2] * SIM_DT;
}
