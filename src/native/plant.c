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

const PlantParams PLANT = {
  .mass_kg = 0.65,
  .inertia = { 0.0055, 0.0060, 0.0110 },
  .gravity = 9.80665,
  .arm_x = 0.0777817459305202, /* 0.110 / sqrt(2) */
  .arm_y = 0.0777817459305202,
  .kt = 1.1257e-5,
  .kq = 1.0651e-7,
  .ke = 0.005025938238811099, /* 60 / (2 pi 1900) */
  .r_motor = 1.3697,
  .j_rotor = 2.6e-6,
  .cells = 6.0,
  .r_cell = 0.012,
  .cda_plan = 0.0319,
  .cda_front = 0.006,
  .cda_side = 0.006,
  .rho = 1.225,
  .k_inflow = 5.9e-4,
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
const double PLANT_POS_X[SIM_MOTOR_COUNT] = { -0.0777817459305202, 0.0777817459305202,
                                              -0.0777817459305202, 0.0777817459305202 };
const double PLANT_POS_Y[SIM_MOTOR_COUNT] = { -0.0777817459305202, -0.0777817459305202,
                                              0.0777817459305202, 0.0777817459305202 };

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
  }
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
  /* 1. Battery voltage under last step's load. */
  const double r_pack = PLANT.cells * PLANT.r_cell;
  double v_load = s->cell_voltage_oc * PLANT.cells - s->pack_current * r_pack;
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
   * each prop sees a different axial inflow and its thrust changes by
   * -k_inflow * prop speed * axial velocity. The rising side loses thrust
   * and the falling side gains it, which opposes the rotation. Only the
   * rotational part of the inflow is used; the common mode part (thrust
   * loss in a fast climb) is the axial flight effect STAGE1.md defers to
   * Stage 2 and would collide with the terminal velocity check.
   *
   * Yaw: a prop's aerodynamic drag depends on its speed relative to the
   * air, so a body yaw rate adds to one rotation pair and subtracts from
   * the other. The clockwise and counter clockwise pairs no longer cancel
   * and the residual is a torque opposing the yaw.
   */
  double thrust[SIM_MOTOR_COUNT];
  double stator_torque_z = 0.0; /* reaction on the frame about body z */
  double h_prop_z = 0.0;        /* net prop angular momentum about body z */
  double aero_torque_z = 0.0;   /* prop drag about z, in the air's frame */
  double pack_current = 0.0;
  const double p = s->omega[0];
  const double q = s->omega[1];
  const double r = s->omega[2];
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    double d = duty_in[m];
    if (d < 0.0) {
      d = 0.0;
    }
    if (d > 1.0) {
      d = 1.0;
    }
    const double w = s->motor_omega[m];
    /* Prop speed relative to the air about body z, including body yaw. */
    const double w_rel = PLANT_SPIN[m] * w + r;
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
    /* Axial velocity at this motor from body rotation only. */
    const double v_rot = p * PLANT_POS_Y[m] - q * PLANT_POS_X[m];
    double t = PLANT.kt * w_next * w_next - PLANT.k_inflow * w_next * v_rot;
    if (t < 0.0) {
      t = 0.0;
    }
    thrust[m] = t;
    /* Frame feels minus the stator drive torque about z. */
    stator_torque_z += -PLANT_SPIN[m] * PLANT.ke * i;
    h_prop_z += PLANT_SPIN[m] * PLANT.j_rotor * w_next;
    aero_torque_z += -drag_mag;
    const double draw = d * i;
    if (draw > 0.0) {
      pack_current += draw;
    }
  }
  s->pack_current = pack_current;
  (void)aero_torque_z;

  /* 3. Body frame forces: thrust along +z, quadratic drag per axis. */
  double v_body[3];
  quat_rotate_inv(s->quat, s->vel, v_body);
  const double cda[3] = { PLANT.cda_front, PLANT.cda_side, PLANT.cda_plan };
  double f_body[3];
  for (int a = 0; a < 3; a += 1) {
    f_body[a] = -0.5 * PLANT.rho * cda[a] * v_body[a] * sim_fabs(v_body[a]);
  }
  f_body[2] += thrust[0] + thrust[1] + thrust[2] + thrust[3];

  /* 4. Body torques: thrust moments, stator reaction, gyroscopic term. */
  double tau[3] = { 0.0, 0.0, stator_torque_z };
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    tau[0] += PLANT_POS_Y[m] * thrust[m];
    tau[1] += -PLANT_POS_X[m] * thrust[m];
  }
  /* omega x (I omega + h_prop) */
  const double lx = PLANT.inertia[0] * s->omega[0];
  const double ly = PLANT.inertia[1] * s->omega[1];
  const double lz = PLANT.inertia[2] * s->omega[2] + h_prop_z;
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
