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

#include "sim_abi.h"

/*
 * The step, derived from the ONE declared rate rather than typed again.
 *
 * SIM_STEP_HZ in sim_abi.h is the single place the loop rate is written
 * down. It used to be written down here as well, as a bare 1.0/1000.0, and
 * in four more places in the Betaflight glue as a bare 1000, so raising the
 * rate meant finding all six and getting every one right. At 1000 these
 * expressions are exactly the constants they replace: 1000000 / 1000 is
 * 1000 in integer arithmetic and 1.0 / 1000.0 is unchanged, so a rebuild at
 * the current rate must produce a bit identical trace. That equality is the
 * test that this refactor changed nothing.
 */
#define SIM_DT (1.0 / (double)SIM_STEP_HZ)
/* Microseconds of simulated time per step. Exact at every rate that divides
 * a megahertz, which every rate worth running does. */
#define SIM_US_PER_STEP (1000000 / SIM_STEP_HZ)
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
  double ke;         /* back EMF constant, V s/rad. The LOADED constant, not
                      * 60/(2 pi kV) off the nameplate; plant.c says why. */
  double r_motor;    /* effective motor plus ESC resistance, ohms */
  double j_rotor;    /* rotor plus prop inertia, kg m^2 */
  double cells;      /* series cells */
  double r_cell;     /* internal resistance per cell, ohms */
  double cda_plan;   /* drag area top, m^2, along body z */
  double cda_front;  /* drag area front, m^2, along body x */
  double cda_side;   /* drag area side, m^2, along body y */
  double k_body_lift; /* cross flow side lift area, m^2. Side force linear in
                      * the lateral velocity component at flight speed, the
                      * body and pack as a lifting slab; see plant.c. */
  double rho;        /* air density */
  double k_propwash; /* unsteady inflow amplitude, fraction of thrust at full
                      * recirculation depth. See plant.c. */
  double prop_r;     /* prop radius, metres. Sets the disc area the induced
                      * velocity is computed over. */
  double k_rotor_drag; /* rotor drag (H force) scale, dimensionless O(1).
                      * See plant.c: H = k rho A v_i v_perp per rotor. */
  double k_ground;   /* ground effect strength, 0 for none, 1 for the
                      * Cheeseman and Bennett form on the four discs' merged
                      * radius. See plant.c: zero on the five inch, whose
                      * calibrated envelope was measured without it. */
  double k_rotor_axial; /* drag coefficient of ONE STALLED ROTOR DISC in a
                      * descent, on disc area, dimensionless O(1). Zero for
                      * an airframe whose cda_plan was fitted against a
                      * measured descent and therefore already carries it.
                      * See plant.c: this is the descent only half of the
                      * rotor's drag and it never acts in a climb. */
  double k_inflow;   /* prop pitch radius, metres per radian: the prop's
                      * geometric pitch over 2 pi. A rotor at omega has a
                      * pitch speed of omega times this, and thrust scales
                      * with (1 - axial speed / pitch speed). The name is
                      * historical, from when this was a thrust loss
                      * coefficient; plant.c says so at the constant. */
  double torque_ind; /* induced share of shaft torque at hover, which IS the
                      * figure of merit kq was derived through. Was the file
                      * scope PLANT_TORQUE_IND; it is a property of the rotor
                      * and moves with the airframe. */
  /*
   * THE DUCT. Three numbers, and all three are 1, 0 and 0 on an open rotor,
   * which is what makes the five inch's arithmetic bit identical after this
   * struct grew: x * 1.0 is x and x + 0.0 is x in IEEE 754.
   */
  double k_duct;      /* static thrust augmentation from the shroud. 1.0 is an
                       * open rotor. A moulded whoop duct with a 3 percent tip
                       * gap earns about 1.10; the ideal duct of momentum
                       * theory would be 1.26 and no real one is close. */
  double duct_fade;   /* edgewise air speed, as a multiple of the rotor's own
                       * induced velocity, at which HALF the augmentation is
                       * gone. A duct works by removing wake contraction, and
                       * a duct flying sideways stops being able to. 0 disables
                       * the fade, which is what an open rotor wants. */
  double k_duct_lip;  /* duct lip suction moment coefficient. A shroud in
                       * edgewise flow carries a large suction peak on its
                       * UPWIND lip, which is an upward force ahead of the
                       * centre and therefore a nose up moment. This is the
                       * defining ducted fan handling characteristic and an
                       * open rotor has none of it, so 0. */
  /* Motor geometry and build tolerance, per airframe. These were four file
   * scope tables in plant.c and are fields now for the same reason the rest
   * of this struct is: a second airframe has its own. */
  double spin[SIM_MOTOR_COUNT];         /* +1 counter clockwise seen from above */
  double pos_x[SIM_MOTOR_COUNT];
  double pos_y[SIM_MOTOR_COUNT];
  double pos_z[SIM_MOTOR_COUNT];        /* rotor disc height above the CG */
  double cant_radial_deg[SIM_MOTOR_COUNT];
  double cant_tangent_deg[SIM_MOTOR_COUNT];
  /*
   * The collision hull, which sim.c used to #define. A whoop is a third of
   * the five inch in every direction, so a shared hull would have it
   * touching a floor a centimetre before it reached one.
   */
  double hull_hx;       /* half extent, body x */
  double hull_hy;       /* half extent, body y */
  double hull_hz_down;  /* CG to the surface it parks on */
  double hull_hz_up;    /* CG to the top of the stack, what an inverted craft rests on */
  double contact_patch_r; /* resting spin friction lever, metres */
  double contact_arm_max; /* largest impulse arm a caller may hand sim_contact_at */
  double vib_ref_w;     /* rotor speed, rad/s, at which the bridge's gyro
                         * vibration injection reads its full amplitude. This
                         * airframe's own full throttle speed; bf_glue.c says
                         * why it cannot be one number for both. */
  double camera_x;      /* lens glass in the body frame */
  double camera_y;
  double camera_z;
} PlantParams;

/*
 * The airframes, in the order sim_set_airframe indexes them. 0 is the five
 * inch this project was built around and is the default, so a host that
 * never calls sim_set_airframe gets exactly the machine it always had.
 */
#define SIM_AIRFRAME_5IN 0
#define SIM_AIRFRAME_WHOOP65 1
#define SIM_AIRFRAME_COUNT 2

typedef struct {
  /* rigid body, world frame */
  double pos[3];
  double vel[3];
  double quat[4]; /* w x y z, body to world */
  double omega[3]; /* body rates p q r, rad/s */
  /* motors, Betaflight order: 0 RR, 1 FR, 2 RL, 3 FL */
  double motor_omega[SIM_MOTOR_COUNT]; /* rad/s */
  /* Propwash: a band limited turbulence field, one channel per rotor, run
   * every step whether the craft is in the wash or not so that flying into
   * it does not restart it. Deterministic; see plant.c. */
  unsigned int wash_seed;
  double wash_fast[SIM_MOTOR_COUNT];
  double wash_slow[SIM_MOTOR_COUNT];
  /*
   * The ground, as the plant sees it: the CG's height above the host's
   * ground plane along the plane's normal, metres, and the normal itself in
   * the plant's world frame. ground_h is negative when the host has raised no
   * plane, which is every harness run and the reason the term it feeds is
   * off by default. Written by sim.c before every step from the same plane
   * the contact solver uses, so the air and the floor agree about where the
   * floor is.
   */
  double ground_h;
  double ground_n[3];
  /* battery */
  double cell_voltage_oc; /* open circuit per cell, volts */
  double pack_current;    /* total draw last step, amps */
  double vbat_load;       /* pack voltage under load, volts */
  /* time */
  long long step_index; /* completed 1 ms steps since reset */
} SimState;

/*
 * The airframe in force, as a pointer into a const table in plant.c.
 *
 * PLANT was a const global and every read of it constant folded at -O2.
 * Selecting an airframe at runtime costs that folding, and the reason that
 * is safe rather than merely probable is the build's own flags: with
 * -fno-fast-math and -ffp-contract=off the compiler may neither reassociate
 * nor contract, so a folded expression and a computed one are the SAME IEEE
 * double, and wasm has no excess precision to lose either. The five inch's
 * trace is measured bit identical across this change, not assumed; see
 * PROGRESS.md.
 */
extern const PlantParams PLANT_TABLE[SIM_AIRFRAME_COUNT];
extern const PlantParams *PLANT_P;
#define PLANT (*PLANT_P)

/* Select the airframe. Out of range is ignored. Clears the cached thrust
 * axes, which are built from the airframe's own cant table. */
void plant_set_airframe(int id);
int plant_airframe(void);

/*
 * Flight style, set by sim_set_flight_style: 0 expert, 1 arcade. Owned by
 * sim.c, read by plant.c (wash application, inflow asymmetry, cant tables)
 * and bf_glue.c (gyro vibration). Deliberately NOT part of SimState: it is
 * a mode like angle mode, it survives reset and init, and the shell owns
 * asserting it.
 */
extern int SIM_ARCADE;

/*
 * AIR, set by sim_set_air: a scale on everything the air does to slow this
 * airframe down. 1.0 is the machine every band in tests/ and gates.config.json
 * was measured against; below 1 the quad carries further, above 1 it washes
 * speed off harder.
 *
 * THE ONE WORD THIS ANSWERS IS "FLOATY". The board keeps returning it, and
 * the two rounds that answered it moved exactly these numbers by hand: round
 * 17b added the rotor H force because the model "felt floaty and blew out
 * corners", and the mass went up twice off a report asking for more gravity.
 * Of the two, the drag set is the one that moves the feel without moving
 * anything a pilot has learned: hover stays where it is on the stick, the
 * punch and the climb are untouched, and what changes is how far the craft
 * carries with the sticks centred. Measured on the shipped five inch,
 * levelled and coasting from 20 m/s down to 10 m/s: 3.64 s and 102 m at 1.0,
 * 2.93 s and 79 m at 1.5 on the rotor term alone, 2.14 s and 60 m at 1.5 on
 * the whole set.
 *
 * WHAT IT SCALES, and why each one belongs: the per axis quadratic body drag
 * (cda_front, cda_side, cda_plan), which is the airframe's own bluff body
 * drag; k_rotor_drag, the H force, which is the dominant translational
 * damping at the speeds a race is flown at; and k_rotor_axial, the ducted
 * machine's descent brake. All three are the air pushing back on the craft.
 *
 * WHAT IT DOES NOT SCALE, deliberately. Not rho, because rho also sets the
 * induced velocity, the vortex ring thresholds and the propwash, so scaling
 * it would move hover, the descent model and the shake, none of which is what
 * "floaty" names. Not k_body_lift, which is a turning force rather than a
 * brake. Not mass, thrust or anything electrical: hover throttle is a number
 * pilots memorise and configs/rates.js quotes in a menu, so this knob leaves
 * it exactly where it is.
 *
 * A MODE, not dynamic state, in the same sense SIM_ARCADE is one: it survives
 * sim_reset and sim_init and the shell owns asserting it. At 1.0 the plant is
 * bit identical to the one before this existed, because x * 1.0 is x for
 * every finite double and no expression here was reassociated to get it. That
 * is measured against the recorded trace hash, not assumed.
 */
extern double SIM_AIR;

/*
 * GRAVITY, set by sim_set_gravity: a scale on the weight this craft carries.
 * 1.0 is 9.80665 and the machine every band was measured against.
 *
 * THIS IS THE OTHER HALF OF "FLOATY", and the pilot named it: asked to try
 * the drag slider, the answer came back "the difference is hardly
 * discernable" and "have it as floaty and sinky". Sinky is not planted.
 * Planted is the HORIZONTAL axis, how far the craft carries with the sticks
 * centred, which is what SIM_AIR moves. Sinky is the VERTICAL one, how fast
 * it comes down and how little it hangs, and no amount of drag buys it:
 * raising drag LOWERS the props level terminal, 22.0 m/s to 18.0 at 1.5, so
 * the drag slider was making the craft hang slightly MORE at the same time
 * as it made it corner better, which is exactly how a knob comes out feeling
 * like nothing.
 *
 * Gravity is the surgical version of that axis. It changes weight and
 * nothing else: inertia is untouched, so the craft rotates identically and
 * every rate figure holds; drag is untouched, so the horizontal coast is
 * unchanged; the motors and the pack are untouched. What moves is hover
 * throttle, sink rate, terminal velocity and how far a punch balloons, which
 * is the whole of what a pilot means by floaty on the vertical axis.
 *
 * Applied to the weight term in plant_step and to the two ground load terms
 * in sim.c, because a heavier craft presses harder on the floor and its
 * friction has to follow or a sinky quad would slide like a light one.
 *
 * A MODE, same rule as SIM_AIR and SIM_ARCADE: it survives sim_reset and
 * sim_init and the shell owns asserting it. Bit identical at 1.0, measured
 * against the recorded trace hash.
 */
extern double SIM_GRAVITY;

/* Motor spin direction, position and cant moved INTO PlantParams when the
 * second airframe landed: they are airframe data and a whoop's are its own.
 * The names below are the shorthand plant.c reads them through. */
#define PLANT_SPIN (PLANT.spin)
#define PLANT_POS_X (PLANT.pos_x)
#define PLANT_POS_Y (PLANT.pos_y)
#define PLANT_POS_Z (PLANT.pos_z)

/*
 * world.c: the solid world, stepped from sim.c. See that file's header.
 *   world_active          a world has been built and has something in it
 *   world_forget          a teleport or a reset: forget last step's points
 *   world_select_support  pick this step's ground: the shell's plane, or the
 *                         top of the box the CG is over if that is higher
 *   world_step            contacts against every nearby solid, solved in
 *                         world.c with accumulated impulses
 *   world_tick            one step of the road vehicles' clock, every step,
 *                         on the launch stand too
 */
int world_active(void);
void world_forget(void);
int world_select_support(const SimState *s, const double tn[3], double td,
                         double out_n[3], double *out_d);
void world_step(SimState *s, int ground_on, const double gn[3], double gd);
void world_tick(void);

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
 * Raise or lower Betaflight ANGLE_MODE. Stored across reset so a shell
 * that asked for angle before sim_reset still has it after. The plant
 * does not read this.
 */
void bridge_set_angle_mode(int on);

/*
 * Betaflight BOXLAUNCHCONTROL, captured the way arming captures it.
 * Off is the default. The harness never calls this, so the acro
 * trajectory does not enter applyLaunchControl. The plant does not
 * read this.
 */
void bridge_set_launch_control(int on);

/*
 * 0 off, 1 holding, 2 holding with throttle near the trigger (OSD
 * blink), 3 launched this arm. Matches fc/core.c's state plus the
 * 4.2 OSD near-trigger warning.
 */
int bridge_launch_control_state(void);

/*
 * Betaflight crashflip, the mixer path in mixer.c. Off is the default.
 * The harness never calls this. isFlipOverAfterCrashActive lives in
 * bf_glue.c, the same pattern as isLaunchControlActive.
 */
void bridge_set_crashflip(int on);
int bridge_crashflip_active(void);

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
