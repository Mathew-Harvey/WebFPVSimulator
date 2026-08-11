/*
 * sim_internal.h: shared state and interfaces between sim.c (entry points
 * and integrator), plant.c (motors, props, battery, aero) and bridge.c
 * (Betaflight side and config shim). Not part of the public ABI.
 *
 * Frames and units follow sim_abi.h: SI, world z up, body x forward,
 * y left, z up, right-handed.
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

#ifndef SIM_INTERNAL_H
#define SIM_INTERNAL_H

#define SIM_DT (1.0 / 1000.0)
#define SIM_MOTOR_COUNT 4

/*
 * Reference airframe constants from STAGE1.md. Everything not fixed by
 * STAGE1.md is a plant tuning constant, chosen to land inside the
 * verification bands; the reasoning lives in PROGRESS.md.
 */
typedef struct {
  double mass_kg;
  double inertia[3]; /* Ixx roll, Iyy pitch, Izz yaw */
  double gravity;
  double arm_x;      /* |x| of each motor from CG, metres */
  double arm_y;      /* |y| of each motor from CG, metres */
  double kt;         /* thrust coefficient, N per (rad/s)^2 */
  double kq;         /* prop drag torque coefficient, N m per (rad/s)^2 */
  double ke;         /* back EMF constant, V s/rad, from 1900 kV */
  double r_motor;    /* effective motor plus ESC resistance, ohms */
  double j_rotor;    /* rotor plus prop inertia, kg m^2 */
  double cells;      /* series cells */
  double r_cell;     /* internal resistance per cell, ohms */
  double cda_plan;   /* drag area top, m^2, along body z */
  double cda_front;  /* drag area front, m^2, along body x */
  double cda_side;   /* drag area side, m^2, along body y */
  double rho;        /* air density */
} PlantParams;

typedef struct {
  /* rigid body, world frame */
  double pos[3];
  double vel[3];
  double quat[4]; /* w x y z, body to world */
  double omega[3]; /* body rates p q r, rad/s */
  /* motors, Betaflight order: 0 RR, 1 FR, 2 RL, 3 FL */
  double motor_omega[SIM_MOTOR_COUNT]; /* rad/s */
  double motor_domega[SIM_MOTOR_COUNT]; /* last step's d omega / dt */
  /* battery */
  double cell_voltage_oc; /* open circuit per cell, volts */
  double pack_current;    /* total draw last step, amps */
  double vbat_load;       /* pack voltage under load, volts */
  /* time */
  long long step_index; /* completed 1 ms steps since reset */
} SimState;

extern const PlantParams PLANT;

/* Motor spin direction about body z, +1 CCW seen from above, -1 CW.
 * Betaflight props-in (normal): RR and FL clockwise, FR and RL counter
 * clockwise. */
extern const double PLANT_SPIN[SIM_MOTOR_COUNT];

/* Motor position in the body xy plane, Betaflight order. */
extern const double PLANT_POS_X[SIM_MOTOR_COUNT];
extern const double PLANT_POS_Y[SIM_MOTOR_COUNT];

void plant_reset(SimState *s);

/*
 * Advance motors, battery and rigid body by one 1 ms step given the four
 * commanded duties in 0..1. Deterministic: fixed operation order, no
 * branches on host properties.
 */
void plant_step(SimState *s, const double duty[SIM_MOTOR_COUNT]);

/* Bridge: Betaflight control loop and config shim. */

int bridge_parse_config(const unsigned char *diff_utf8, int len);

/* Reset controller state (PID integrators, filters) after sim_reset. */
void bridge_reset(void);

/*
 * One 1 kHz controller iteration: body rates and normalised stick
 * channels in, four motor duties in 0..1 out.
 */
void bridge_run(const SimState *s, const double rc[4],
                double duty[SIM_MOTOR_COUNT]);

/* Parsed rate profile access for the bridge implementation. */
typedef struct {
  int rates_type; /* 0 betaflight, 1 kiss?, 2 actual; matches Betaflight enum at apply time */
  double rc_rate[3];
  double expo[3];
  double srate[3];
} SimRates;

const SimRates *bridge_rates(void);

#endif /* SIM_INTERNAL_H */
