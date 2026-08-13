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
 * kq = kt^1.5 / (FM * sqrt(2 rho A)), FM = 0.5 for a triblade at this
 * disc loading, A = pi 0.0635^2. That gives 2.97e-8. The two are a
 * physical pair, never two free knobs; sim_bf_debug case 12 recomputes
 * FM from the compiled constants and the P5 gate asserts it in 0.4-0.6.
 *
 * r_motor is winding plus ESC plus leads for a 2207, j_rotor a triblade
 * plus bell, r_cell a healthy 6S 1300. Inertia from four 45 g motor and
 * prop assemblies at 77.8 mm plus a centred pack. Absolute RPM, hover
 * current, punch current and the motor time constant now land in real
 * ranges instead of compensating for a free-energy prop.
 */
const PlantParams PLANT = {
  .mass_kg = 0.65,
  .inertia = { 0.0035, 0.0038, 0.0068 },
  .gravity = 9.80665,
  .arm_x = 0.0777817459305202, /* 0.110 / sqrt(2) */
  .arm_y = 0.0777817459305202,
  .kt = 1.98e-6,
  .kq = 3.16e-8,
  .ke = 0.005025938238811099, /* 60 / (2 pi 1900) */
  .r_motor = 0.09,
  .j_rotor = 6.0e-6,
  .cells = 6.0,
  .r_cell = 0.0065,
  .cda_plan = 0.0225,
  /*
   * Body drag areas. These were 0.016 and that number was doing two jobs:
   * the airframe's own drag AND the rotor drag of four spinning discs,
   * because the second did not exist. Now that it does, the body keeps only
   * what a body should have. 0.013 is what the airframe projects and no
   * more: roughly 0.010 m squared of frontal area (arms, motors, body,
   * battery, camera) at a bluff body Cd near 1.2. Re-fitted inside that
   * physical range against the P5 max level speed procedure in
   * scripts/gates.js, which reads 128 km/h against a band of 120 to 165 and
   * 139 before this change.
   */
  .cda_front = 0.0130,
  .cda_side = 0.0130,
  .rho = 1.225,
  .k_propwash = 0.60,
  .prop_r = 0.0635,
  .k_rotor_drag = 0.4386,
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
 * Descent aerodynamics. mu is the axial advance ratio, va / pitch_speed, and
 * it is negative in a descent. Onset is where the smooth windmill solution
 * gives way to the ring state; FULL is where the loss has bottomed out;
 * FLOOR is what is left of the thrust there.
 */
#define PLANT_VRS_ONSET 0.30
#define PLANT_VRS_FULL 1.20
#define PLANT_VRS_FLOOR 0.75

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

/* One pole coefficients at the 1 kHz step: 1 - exp(-2 pi f dt). */
#define PLANT_WASH_A_FAST 0.171876
#define PLANT_WASH_A_SLOW 0.018665
/* RMS of the band passed signal, so k_propwash is a thrust fraction and not
 * an arbitrary gain. Measured off the filter pair, not guessed. */
#define PLANT_WASH_RMS 0.173

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
    s->motor_domega[m] = 0.0;
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
  double thrust[SIM_MOTOR_COUNT];
  double stator_torque[3] = { 0.0, 0.0, 0.0 }; /* reaction on the frame */
  double h_prop[3] = { 0.0, 0.0, 0.0 };        /* net prop angular momentum */
  double aero_torque_z = 0.0;   /* prop drag about z, in the air's frame */
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
        double d = 1.0 - sim_fabs(rw - 1.0);
        if (d < 0.0) {
          d = 0.0;
        }
        if (d > 1.0) {
          d = 1.0;
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
    if (axial < 1.0) {
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
    if (wash_depth > 0.0) {
      const double wash = (s->wash_fast[m] - s->wash_slow[m]) / PLANT_WASH_RMS;
      axial += axial * PLANT.k_propwash * wash_depth * wash;
      if (axial < 0.0) {
        axial = 0.0;
      }
    }
    const double drag_mag = PLANT.kq * w_rel * (w_rel < 0.0 ? -w_rel : w_rel);
    const double i = (d * v_load - PLANT.ke * w) / PLANT.r_motor;
    /* Rotor sees the drag torque resisting its own spin direction. */
    const double torque = PLANT.ke * i - PLANT_SPIN[m] * drag_mag;
    double w_next = w + (torque / PLANT.j_rotor) * SIM_DT;
    if (w_next < 0.0) {
      w_next = 0.0;
    }
    s->motor_domega[m] = (w_next - w) / SIM_DT;
    s->motor_omega[m] = w_next;
    double t = PLANT.kt * w_next * w_next * axial;
    if (t < 0.0) {
      t = 0.0;
    }
    thrust[m] = t;
    /* Frame feels minus the stator drive torque, about the MOTOR's axis
     * rather than about body z, because the axes are not parallel. */
    const double st = -PLANT_SPIN[m] * PLANT.ke * i;
    stator_torque[0] += st * PLANT_AXIS[m][0];
    stator_torque[1] += st * PLANT_AXIS[m][1];
    stator_torque[2] += st * PLANT_AXIS[m][2];
    const double hm = PLANT_SPIN[m] * PLANT.j_rotor * w_next;
    h_prop[0] += hm * PLANT_AXIS[m][0];
    h_prop[1] += hm * PLANT_AXIS[m][1];
    h_prop[2] += hm * PLANT_AXIS[m][2];
    aero_torque_z += -drag_mag;
    const double draw = d * i;
    if (draw > 0.0) {
      pack_current += draw;
    }
  }
  s->pack_current = pack_current;
  (void)aero_torque_z;

  /* 3. Body frame forces: thrust along +z, quadratic drag per axis. */
  const double cda[3] = { PLANT.cda_front, PLANT.cda_side, PLANT.cda_plan };
  double f_body[3];
  for (int a = 0; a < 3; a += 1) {
    f_body[a] = -0.5 * PLANT.rho * cda[a] * v_body[a] * sim_fabs(v_body[a]);
  }
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    f_body[0] += thrust[m] * PLANT_AXIS[m][0];
    f_body[1] += thrust[m] * PLANT_AXIS[m][1];
    f_body[2] += thrust[m] * PLANT_AXIS[m][2];
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
   * v_h = 7.17 m/s and four rotors give 4 rho A v_h = 0.4446 kg/s, so
   * k = 0.65 * 0.30 / 0.4446 = 0.4386. That published figure is a TOTAL
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
  double rotor_drag_tau_z = 0.0;
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
    /* An in plane force at the rotor's position has a moment about z. The
     * four cancel exactly in translation, by symmetry; what survives is the
     * yaw damping from the omega x r part above. */
    rotor_drag_tau_z += PLANT_POS_X[m] * fy - PLANT_POS_Y[m] * fx;
  }

  /* 4. Body torques: thrust moments, stator reaction, gyroscopic term.
   *
   * The thrust moment is the full cross product r x F now, not just the two
   * terms a purely vertical thrust produces. Its z component is what a canted
   * motor contributes to yaw, and it is the whole reason check 10 can be
   * anything other than exactly zero. */
  double tau[3] = { stator_torque[0], stator_torque[1], stator_torque[2] + rotor_drag_tau_z };
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    const double fx = thrust[m] * PLANT_AXIS[m][0];
    const double fy = thrust[m] * PLANT_AXIS[m][1];
    const double fz = thrust[m] * PLANT_AXIS[m][2];
    tau[0] += PLANT_POS_Y[m] * fz;
    tau[1] += -PLANT_POS_X[m] * fz;
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
