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
  double k_propwash; /* unsteady inflow amplitude, fraction of thrust at full
                      * recirculation depth. See plant.c. */
  double prop_r;     /* prop radius, metres. Sets the disc area the induced
                      * velocity is computed over. */
  double k_rotor_drag; /* rotor drag (H force) scale, dimensionless O(1).
                      * See plant.c: H = k rho A v_i v_perp per rotor. */
  double k_inflow;   /* prop pitch radius, metres per radian: the prop's
                      * geometric pitch over 2 pi. A rotor at omega has a
                      * pitch speed of omega times this, and thrust scales
                      * with (1 - axial speed / pitch speed). The name is
                      * historical, from when this was a thrust loss
                      * coefficient; plant.c says so at the constant. */
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
  /* Propwash: a band limited turbulence field, one channel per rotor, run
   * every step whether the craft is in the wash or not so that flying into
   * it does not restart it. Deterministic; see plant.c. */
  unsigned int wash_seed;
  double wash_fast[SIM_MOTOR_COUNT];
  double wash_slow[SIM_MOTOR_COUNT];
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

/* sqrt for the debug exports, backed by libm/sim_math.h. */
double sim_sqrt_pub(double x);

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
 *
 * rx_new is 1 on the steps where a fresh input sample arrived, which the
 * bridge treats as an RC frame exactly as a flight controller treats a
 * packet from the receiver. Betaflight recomputes setpoints and
 * feedforward only on those steps and interpolates in between, so the
 * input sample rate is a real part of the feel, not a detail.
 */
void bridge_run(const SimState *s, const double rc[4], int rx_new,
                double duty[SIM_MOTOR_COUNT]);

/*
 * Betaflight glue, implemented in bf/bf_glue.c which is compiled against
 * the vendored Betaflight headers. bridge.c stays free of Betaflight
 * includes so the tokenizer compiles standalone.
 *
 * bf_config_begin resets the Betaflight parameter groups to their real
 * defaults. bf_config_apply_setting applies one "set key = value" line;
 * unknown keys return SIM_OK and are ignored. bf_config_finish runs the
 * Betaflight init chain (pid, rc processing, mixer endpoints).
 */
void bf_config_begin(void);
int bf_config_apply_setting(const char *key, const char *value, double num,
                            int have_num);
/* One non-"set" CLI line, tokenised to its first two words. This is how
 * `simplified_tuning apply` reaches Betaflight's own slider tuning. */
int bf_config_apply_command(const char *word0, const char *word1);
int bf_config_finish(void);

#endif /* SIM_INTERNAL_H */
