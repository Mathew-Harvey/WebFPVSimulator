/*
 * world.c: the solid world, inside the plant, at 1 kHz.
 *
 * WHY THIS FILE EXISTS. Until 2026-09-24 the only solid thing the plant knew
 * about was one ground plane. Every wall, every ordinary roof and the train
 * lived in the shell, which swept the craft every 4 ms AFTER the fact, put it
 * back on the face it had passed and applied one impulse at one point. The
 * owner's report from the freestyle city was that crashing bounces you
 * around, clips you through buildings and sometimes makes you vanish, and the
 * review measured why (PROGRESS.md, 2026-09-24): a 20 m/s hit spun the craft
 * at 131 rad/s and threw it upward off a vertical wall, a roof was a wall you
 * could stand on, and a crash that wedged the hull was hidden by a catch that
 * froze the craft and moved it. The owner approved moving the solid world
 * into the plant, with soft props, and with no automatic teleport.
 *
 * WHAT IT DOES, per 1 ms step:
 *
 *   1. SUPPORT. If the CG is over the top of a box that is higher than the
 *      terrain plane the shell raised, that top IS the ground plane for the
 *      step. So a roof is ground in every sense the plant has: the same
 *      contact, the same slide friction, the same settle, perch and turtle,
 *      the same ground effect. The owner's words were that a roof should
 *      behave exactly like the street, and this makes it the same code.
 *
 *   2. FRAME. The plant's own hull box, the one the ground solver rests on,
 *      against every nearby box by the separating axis test, with a contact
 *      MANIFOLD of up to eight points from clipping one face against the
 *      other. A side flat against a wall is a patch, not a pivot, which is
 *      the fix for the "wall ratchet" PROGRESS.md recorded on 2026-09-16:
 *      one impulse at one extreme corner spun the craft up on every contact.
 *      Capsules (gates, trees, the race field) are solved segment to box.
 *
 *   3. LENS. The camera glass stands a centimetre proud of the five inch's
 *      hull box. It carries a small bumper sphere so the lens can never be
 *      put against a face, which is half of why a wall no longer vanishes
 *      from the FPV view (the shell's near plane is the other half).
 *
 *   4. PROPS, when the airframe's props stand outside its hull (the five
 *      inch; a whoop's ducts are its hull). The owner chose SOFT props: a
 *      blade that meets a wall flexes, chips and skates, and the shove
 *      reaches the frame through the motor shaft, not at the blade tip. So a
 *      disc contact pushes at the MOTOR, with no restitution and little
 *      friction, and costs that rotor speed: a strike in proportion to the
 *      closing speed, and a rub for every millisecond it stays in contact.
 *
 *   5. VEHICLES (section 5 below, Stage D part 2). A road is uploaded once
 *      and a car on it is a mover with a heading, its pose worked out here
 *      from the module's own step clock. The craft meets a car in the car's
 *      own frame, by the same box test as every box, and the contacts are
 *      turned back with the car's surface velocity where they touch: its
 *      velocity, and the rate its box actually turns, taken from the pose
 *      itself at this step and the next. The shell reads the pose back to
 *      draw the car, so the car a pilot sees, a drift car's slide included,
 *      is the car the craft hits, where it is and how it moves.
 *
 * THE VEHICLE ABI, added 2026-09-25, additive like the rest: a module never
 * handed a road steps exactly as it did before. World frame, SI throughout.
 *
 *   int sim_world_road(const double *xyz, int n, int closed)
 *       A road's centre line at road level: n points, x y z each (3 n
 *       doubles), metres. closed 1 joins the last point to the first, which
 *       is not repeated. Returns the road's index, 0 up in the order roads
 *       were added. SIM_ERR_BAD_ARG: fewer than 2 points (3 closed), more
 *       than ROAD_MAX_POINTS, a coordinate not finite or past ROAD_COORD_MAX,
 *       a segment under ROAD_MIN_SEG in plan, or a point where the road
 *       turns by more than ROAD_TURN_MAX_DEG (30 degrees) in plan, a fold
 *       back on itself included. SIM_ERR_BAD_STATE: WORLD_MAX_ROADS roads
 *       already, or more points than the tables hold once long segments are
 *       cut to ROAD_STEP. Refused, it leaves nothing behind.
 *
 *       What the shell's road tool must hand over: bends EASED over several
 *       points, a point every metre or closer on a bend, never a corner as
 *       one sharp point. The car's centre follows the points, so at each one
 *       its velocity turns by the road's own turn there within a step; eased,
 *       that is a few degrees at a time, and a corner drawn as one point is
 *       refused rather than driven as a lurch.
 *
 *   int sim_world_road_info(int road, double *out)
 *       Three doubles: the points kept after cutting, the length in metres,
 *       and 1 if closed.
 *
 *   int sim_world_vehicle(int m, int road, double offset,
 *                         double top_speed, double lateral, double drift,
 *                         double length, double width, double height,
 *                         double clearance, double e, double mu)
 *       Mover slot m (0 to 63, shared with sim_world_mover) follows `road`.
 *       offset: metres along its route from the road's first point at step
 *       0 of the clock; the route is lap after lap of a closed road, and out
 *       and back of an open one, so an offset past an open road's length is
 *       on the way back, to 1e7 either way. top_speed m/s, 0.1 to 100;
 *       lateral, the most lateral acceleration its driver corners at, m/s/s,
 *       0.1 to 50; drift, the slip gain per m/s/s of lateral acceleration, 0
 *       for an ordinary car, to 1. The body is a box in the car's own frame
 *       (x along its heading, y left, z up from the road point under its
 *       centre): length along, width across, height tall, standing clearance
 *       over the road, metres. e and mu as every shape. SIM_OK;
 *       SIM_ERR_BAD_ARG for anything out of range or a road that does not
 *       exist; SIM_ERR_BAD_STATE when the speed tables are full
 *       (sim_world_clear empties them). Taking a vehicle away is
 *       sim_world_mover parking its slot.
 *
 *   The speed a car takes a bend at comes from the bend's curvature, capped
 *   at ROAD_KAPPA_MAX (a half metre radius): a road drawn smoothly but
 *   tighter than that is driven as if it were that. A road drawn with a
 *   sharp corner or a fold is not driven at all: sim_world_road refuses it.
 *
 *   int sim_world_clock(double step)
 *       The vehicles' clock, a whole number of 1 ms steps, |step| <= 2^53:
 *       the shell's lap clock. sim_step advances it one a step, on the
 *       launch stand too; sim_reset leaves it; sim_world_clear sets it to 0.
 *       Setting it to the value it has changes nothing.
 *
 *   int sim_world_vehicle_poses(double *out)
 *       64 slots of SIM_VEHICLE_POSE_DOUBLES (16), laid out in sim_abi.h:
 *       the pose at the clock, which after sim_step is the step the craft's
 *       state is at and the pose the next step's contacts use. Returns 64.
 *       Its velocity is the pose's own, and its yaw rate is how fast the box
 *       turns from this step's pose to the next one's: what a contact on
 *       the car reads.
 *
 *   int sim_world_vehicle_contacts(double *out, int max)
 *       The last step's contacts against road vehicles, for the checks that
 *       hold a car's contact to the car drawn: up to max of them,
 *       SIM_VEHICLE_CONTACT_DOUBLES (12) each, laid out in sim_abi.h.
 *       Returns how many there were, which may be more than max. Reading
 *       only: nothing it keeps is read back by the physics.
 *
 * A vehicle is never ground: its roof is never the support, so a craft on a
 * moving car is held by friction and nothing else (plan section 8's limit).
 * Contacts report a vehicle as -2 - m, as they report the train.
 *
 * Everything is in the plant's own units and runs on the plant's clock. The
 * shell hands the world over once, in the physics frame (Z up, SI), and the
 * spawn transform as an origin and a yaw, which this file turns into a
 * rotation with the fixed libm. There is no frame time here, no JS Math, and
 * a module that is never handed a world is bit identical to one that has no
 * world at all: scripts/plant-golden.js holds that.
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

#include "sim_abi.h"
#include "sim_internal.h"
#include "libm/sim_math.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define SIM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define SIM_EXPORT
#endif

/* The city is 19,515 boxes. Static, so nothing here allocates. */
#define WORLD_MAX_SHAPES 49152
/* Movers, the train's cars and the road vehicles in one table, so a contact
 * the shell reads names any moving thing the same way (-2 - m) and the one
 * limit is the one the owner approved on 2026-09-24: sixteen was the train's
 * three cars and room; sixty four is a built map's traffic beside them. An
 * empty slot costs one flag test a step. */
#define WORLD_MAX_MOVERS 64
#define WORLD_MAX_CELLS (1 << 18)
#define WORLD_MAX_ITEMS (1 << 20)
#define WORLD_MAX_CAND 1024
#define WORLD_MAX_CONTACTS 96
#define WORLD_CELL_MIN 8.0

#define SHAPE_BOX 1
#define SHAPE_CAPSULE 2

/* Same slop the ground solver works to, so the two agree on "touching". */
#define WORLD_SLOP 0.002
/* A top within this of the ground plane is the ground plane. */
#define WORLD_COPLANAR 0.015
/* Largest correction one step may make. A craft that is somehow a metre into
 * a solid comes out over a few milliseconds instead of teleporting onto the
 * roof, which is the "pop" the review measured. */
#define WORLD_PROJECT_MAX 0.05
/* Deeper than this and the inbound normal speed is also cancelled, exactly
 * the ground projector's rule. */
#define WORLD_BURIED 0.02

/* Soft props. A carbon or polycarbonate blade on masonry grips little and
 * gives nothing back. The strike takes this fraction of rotor speed per m/s
 * of closing speed, capped, and a disc left in contact rubs this much off
 * every millisecond. A blade dragging on a wall at 25,000 rpm stops almost
 * at once, because the drag torque swamps the motor's: at 0.02 the motor won
 * and a craft tapped nose first hovered against the face with its tips
 * rubbing, sinking 0.6 m in three seconds (scripts/wall-check.js check 6,
 * the owner's "stuck and bounce forever"). At 0.08 it drops 2.0 to 2.7 m;
 * 0.15 was worse at 6 m/s, not better, so this is not a more-is-safer knob. */
#define PROP_MU 0.12
/* The most force a blade carries into the frame before it bends out of the
 * way, newtons. It makes the props a crumple zone: they soak the first few
 * centimetres of a hit and the frame, which is rigid, takes the rest. */
#define PROP_F_MAX 60.0
#define PROP_STRIKE_K 0.06
#define PROP_STRIKE_MAX 0.70
#define PROP_RUB 0.08
#define PROP_RIM 12

/* The lens bumper, as a fraction of the hull's half width: 19 mm on the five
 * inch, 8 mm on the whoop. */
#define LENS_R_FRAC 0.2

/*
 * A CRAFT HOLDING ITSELF ON A FACE WITH ITS OWN THRUST, moved here from the
 * shell's contact pass with the rest of the solid world (src/game/collide.js
 * PRESS_UP_DOT has the argument and the measurements). The owner's report
 * was a craft stuck on a wall "bouncing forever"; the physics of it is that a
 * disc whose intake is pressed against masonry has no air to take, and the
 * shell's answer was to bleed the rotors once the thrust axis had been held
 * into a face for 150 ms, releasing after 60 ms free of it. Same numbers
 * here. The bleed was 0.15 per 4 ms pass; per millisecond that is
 * 1 - 0.85^(1/4). Crashflip is exempt, as it was: turtle drives rotors into
 * whatever the craft is lying on by design.
 */
#define PRESS_UP_DOT 0.5
#define PRESS_CONFIRM_MS 150
#define PRESS_RELEASE_MS 60
#define PRESS_BLEED_MS 0.0398

typedef struct {
  double lo[3];
  double hi[3];
  double a[3];
  double b[3];
  double r;
  double e;
  double mu;
  int type;
} Shape;

/*
 * Where a road vehicle is at one step of the clock (section 5). World
 * frame, SI, the same numbers sim_world_vehicle_poses hands the shell.
 * omega is the turn from this step's heading to the next step's
 * (vehicle_turn), so it is set only on the pose the contacts use; every
 * other number is the pose function's own at this step.
 */
typedef struct {
  double p[3];    /* the road point under its centre: its own frame's origin */
  double h[2];    /* its heading in plan, unit: the body's +x, the drift in it */
  double u[2];    /* its direction of travel in plan, unit */
  double vel[3];  /* the velocity of p, m/s: its speed along its segment */
  double speed;   /* along the road, m/s, never negative */
  double omega;   /* how fast h turns over the next step, about +z, rad/s */
  double dist;    /* driven, m, from the road's first point, every lap counted */
  double kap;     /* the path's curvature along the travel, 1/m, left positive */
  double slip;    /* tan(slip / 2), left positive; 0 for an ordinary car */
} Pose;

typedef struct {
  double lo[3];
  double hi[3];
  double v[3];
  double e;
  double mu;
  int on;
  /* A road vehicle when veh is 1, and then lo and hi are its box in its OWN
   * frame. Otherwise the train's kind: an axis aligned box in the world that
   * the shell seats every step, solved by exactly the code it always was. */
  int veh;
  int prof;       /* its speed profile, g_prof */
  int seg;        /* the segment its last pose fell in: where to look first */
  double toff;    /* its route time at clock 0, s */
  double drift;   /* drift gain, per m/s/s of lateral acceleration */
  double zc;      /* its box's centre over p, m */
  double rad;     /* its box's bounding radius, m */
  Pose cur;       /* at the clock, with its turn to nxt */
  Pose prev;      /* at the clock less one step */
  Pose nxt;       /* at the clock plus one step, kept so a step works out one
                   * new pose and not two */
} Mover;

typedef struct {
  double n[3];   /* world, out of the solid, toward the craft */
  double p[3];   /* world contact point */
  double depth;
  double e;
  double mu;
  double vs[3];  /* world surface velocity */
  int shape;     /* shape index, or -2 - mover */
  int kind;      /* 0 frame, 1 lens, 2 prop */
  int motor;
} Contact;

static Shape g_shape[WORLD_MAX_SHAPES];
static int g_nshape = 0;
static Mover g_mover[WORLD_MAX_MOVERS];
static int g_built = 0;

/*
 * THE ROADS (section 5). Static like everything else here, and bounded:
 *
 *   a road keeps at most ROAD_MAX_POINTS points once its long segments are
 *   cut to ROAD_STEP, 8.2 km of road, and all roads together at most
 *   WORLD_ROAD_POINTS, at 56 bytes a point: 917,504 bytes;
 *   a speed profile keeps a speed and a time for every point of its road,
 *   and all profiles together at most WORLD_PROFILE_POINTS of them, 16
 *   bytes each: 1,048,576 bytes.
 *
 * Under two megabytes, beside the eleven and a half the town's shapes and
 * grid already hold. The largest built map is 480 m across, so a road right
 * round it is under two thousand points. sim_world_clear frees all of it.
 */
#define WORLD_MAX_ROADS 16
#define ROAD_MAX_POINTS 8192
#define WORLD_ROAD_POINTS 16384
#define WORLD_MAX_PROFILES WORLD_MAX_MOVERS
#define WORLD_PROFILE_POINTS 65536

typedef struct {
  double p[3];   /* world, m */
  double s;      /* arc length from the road's first point, m */
  double t[2];   /* unit tangent in plan, the chord across ROAD_WINDOW */
  double k;      /* curvature in plan, 1/m, left positive */
} RoadPt;

typedef struct {
  int first;     /* its first point in g_rpt */
  int np;        /* points kept; a closed road repeats its first at the end */
  int closed;
  double len;    /* its length, m, a closed road's closing segment included */
} Road;

/* A speed and time table: one road driven with one top speed and one
 * lateral limit. Cars that share all three share the table. */
typedef struct {
  int road;
  int first;     /* its entries in g_pv and g_ptm */
  double vmax;
  double alat;
  double T;      /* one way, s: a lap of a closed road, end to end of an open one */
} Profile;

static RoadPt g_rpt[WORLD_ROAD_POINTS];
static int g_nrpt = 0;
static Road g_road[WORLD_MAX_ROADS];
static int g_nroad = 0;
static double g_pv[WORLD_PROFILE_POINTS];
static double g_ptm[WORLD_PROFILE_POINTS];
static int g_nppt = 0;
static Profile g_prof[WORLD_MAX_PROFILES];
static int g_nprof = 0;
static int g_nveh = 0;
/* The vehicles' clock: whole 1 ms steps. The shell sets it from its lap clock
 * (sim_world_clock) and sim_step advances it one a step, so a pose is a
 * function of this integer and of nothing about the frame. */
static long long g_clock = 0;
/* The contacts against road vehicles, for sim_world_vehicle_contacts:
 * world_step writes them and how many it found, and world_tick hands the
 * count over at the end of the step, so a step that never reached
 * world_step (the launch stand) reads as none. Written here and never read
 * back by anything that moves the craft. */
static double g_vc[WORLD_MAX_CONTACTS][SIM_VEHICLE_CONTACT_DOUBLES];
static int g_nvc_found = 0;
static int g_nvc = 0;

static double g_cell = WORLD_CELL_MIN;
static double g_gx0 = 0.0;
static double g_gy0 = 0.0;
static int g_gnx = 0;
static int g_gny = 0;
static int g_cell_start[WORLD_MAX_CELLS + 1];
static int g_items[WORLD_MAX_ITEMS];
static unsigned int g_stamp[WORLD_MAX_SHAPES];
static unsigned int g_query = 0;

/* The plant frame in the world: W = Rz(yaw) p + O. */
static double g_org[3] = { 0.0, 0.0, 0.0 };
static double g_cy = 1.0;
static double g_sy = 0.0;

static int g_cand[WORLD_MAX_CAND];
static Contact g_con[WORLD_MAX_CONTACTS];

/* Last step's world position of every prop point and of the lens, for the
 * face a point came in through. */
static double g_prev_prop[SIM_MOTOR_COUNT][PROP_RIM + 1][3];
static double g_prev_lens[3];
static int g_prev_ok = 0;

static int g_support = -1;
static int g_press_held = 0;
static int g_press_idle = 0;
static int g_pressing = 0;

/* What the shell reads once a frame, and clears. */
static double g_rep_steps = 0.0;
static double g_rep_closing = 0.0;
static double g_rep_dv = 0.0;
static double g_rep_index = -1.0;
static double g_rep_n[3] = { 0.0, 0.0, 0.0 };
static double g_rep_props = 0.0;
static double g_rep_frame = 0.0;
static double g_rep_depth = 0.0;

/* Rim directions, multiples of 30 degrees, written exactly. */
static const double RIM_C[PROP_RIM] = {
  1.0, 0.86602540378443865, 0.5, 0.0, -0.5, -0.86602540378443865,
  -1.0, -0.86602540378443865, -0.5, 0.0, 0.5, 0.86602540378443865,
};
static const double RIM_S[PROP_RIM] = {
  0.0, 0.5, 0.86602540378443865, 1.0, 0.86602540378443865, 0.5,
  0.0, -0.5, -0.86602540378443865, -1.0, -0.86602540378443865, -0.5,
};

/* ------------------------------------------------------------------ *
 * sin and cos of any angle, from the libm's small angle series.
 *
 * The spawn yaw can be anything, and sim_sin_small is only good to 0.5 rad.
 * So: reduce by the nearest quarter turn with pi/2 split in two (the Cody
 * and Waite reduction, exact for the angles a map uses), halve what is left
 * so it is inside the series' range, and double back with the double angle
 * identities. Every step is an IEEE operation, so the answer is the same
 * bit pattern on every engine.
 * ------------------------------------------------------------------ */
#define PIO2_HI 1.57079632673412561417e+00
#define PIO2_LO 6.07710050650619224932e-11
#define TWO_OVER_PI 6.36619772367581382433e-01

static void world_sincos(double a, double *s_out, double *c_out) {
  const double k = __builtin_floor(a * TWO_OVER_PI + 0.5);
  const double r = (a - k * PIO2_HI) - k * PIO2_LO;
  const double h = r * 0.5;
  const double sh = sim_sin_small(h);
  const double ch = sim_cos_small(h);
  const double sr = 2.0 * sh * ch;
  const double cr = ch * ch - sh * sh;
  double q = k - 4.0 * __builtin_floor(k * 0.25);
  if (q < 0.5) {
    *s_out = sr;
    *c_out = cr;
  } else if (q < 1.5) {
    *s_out = cr;
    *c_out = -sr;
  } else if (q < 2.5) {
    *s_out = -sr;
    *c_out = -cr;
  } else {
    *s_out = -cr;
    *c_out = sr;
  }
}

static int world_finite(double x) {
  return x == x && x - x == 0.0;
}

/* ------------------------------------------------------------------ *
 * Frame helpers.
 * ------------------------------------------------------------------ */
static void plant_to_world_dir(const double v[3], double out[3]) {
  out[0] = g_cy * v[0] - g_sy * v[1];
  out[1] = g_sy * v[0] + g_cy * v[1];
  out[2] = v[2];
}

static void world_to_plant_dir(const double v[3], double out[3]) {
  out[0] = g_cy * v[0] + g_sy * v[1];
  out[1] = -g_sy * v[0] + g_cy * v[1];
  out[2] = v[2];
}

static void plant_to_world_pos(const double p[3], double out[3]) {
  plant_to_world_dir(p, out);
  out[0] += g_org[0];
  out[1] += g_org[1];
  out[2] += g_org[2];
}

/* Body axes in the world, as the columns of R. */
static void body_axes_world(const SimState *s, double R[3][3]) {
  const double w = s->quat[0];
  const double x = s->quat[1];
  const double y = s->quat[2];
  const double z = s->quat[3];
  double B[3][3];
  B[0][0] = 1.0 - 2.0 * (y * y + z * z);
  B[0][1] = 2.0 * (x * y - w * z);
  B[0][2] = 2.0 * (x * z + w * y);
  B[1][0] = 2.0 * (x * y + w * z);
  B[1][1] = 1.0 - 2.0 * (x * x + z * z);
  B[1][2] = 2.0 * (y * z - w * x);
  B[2][0] = 2.0 * (x * z - w * y);
  B[2][1] = 2.0 * (y * z + w * x);
  B[2][2] = 1.0 - 2.0 * (x * x + y * y);
  for (int j = 0; j < 3; j += 1) {
    const double col[3] = { B[0][j], B[1][j], B[2][j] };
    double wcol[3];
    plant_to_world_dir(col, wcol);
    R[0][j] = wcol[0];
    R[1][j] = wcol[1];
    R[2][j] = wcol[2];
  }
}

static void body_to_world_point(const double c[3], double R[3][3], const double b[3],
                                double out[3]) {
  for (int i = 0; i < 3; i += 1) {
    out[i] = c[i] + R[i][0] * b[0] + R[i][1] * b[1] + R[i][2] * b[2];
  }
}

/* ------------------------------------------------------------------ *
 * The ABI. All additive: a host that never calls these gets the plant
 * exactly as it was.
 * ------------------------------------------------------------------ */

/* Empty the world. Shapes, movers, roads, vehicles and the grid all go, and
 * the vehicles' clock goes back to step 0 until the shell sets it. */
SIM_EXPORT int sim_world_clear(void) {
  g_nshape = 0;
  g_built = 0;
  g_gnx = 0;
  g_gny = 0;
  g_support = -1;
  g_prev_ok = 0;
  for (int m = 0; m < WORLD_MAX_MOVERS; m += 1) {
    g_mover[m].on = 0;
    g_mover[m].veh = 0;
  }
  g_nroad = 0;
  g_nrpt = 0;
  g_nprof = 0;
  g_nppt = 0;
  g_nveh = 0;
  g_clock = 0;
  g_nvc_found = 0;
  g_nvc = 0;
  return SIM_OK;
}

/*
 * Where the plant's origin is in the world and which way it faces: a world
 * point is Rz(yaw) times the plant point, plus (ox, oy, oz). World axes are
 * the physics frame's, Z up, the shell converting from its own through
 * src/render/frame.js as it does every other position. Called whenever the
 * shell moves its spawn.
 */
SIM_EXPORT int sim_world_frame(double ox, double oy, double oz, double yaw) {
  if (!world_finite(ox) || !world_finite(oy) || !world_finite(oz) || !world_finite(yaw)) {
    return SIM_ERR_BAD_ARG;
  }
  g_org[0] = ox;
  g_org[1] = oy;
  g_org[2] = oz;
  world_sincos(yaw, &g_sy, &g_cy);
  g_prev_ok = 0;
  return SIM_OK;
}

static int shape_material_ok(double e, double mu) {
  return world_finite(e) && world_finite(mu) && e >= 0.0 && e <= 1.0 && mu >= 0.0 && mu <= 2.0;
}

/* An axis aligned box, world frame. Returns its index, which is the order
 * shapes were added in, so the host can keep its own table beside it. */
SIM_EXPORT int sim_world_box(double x0, double y0, double z0,
                             double x1, double y1, double z1,
                             double e, double mu) {
  if (g_nshape >= WORLD_MAX_SHAPES) {
    return SIM_ERR_BAD_STATE;
  }
  if (!world_finite(x0) || !world_finite(y0) || !world_finite(z0) || !world_finite(x1) || !world_finite(y1)
      || !world_finite(z1) || !shape_material_ok(e, mu)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(x1 >= x0) || !(y1 >= y0) || !(z1 >= z0)) {
    return SIM_ERR_BAD_ARG;
  }
  Shape *s = &g_shape[g_nshape];
  s->type = SHAPE_BOX;
  s->lo[0] = x0;
  s->lo[1] = y0;
  s->lo[2] = z0;
  s->hi[0] = x1;
  s->hi[1] = y1;
  s->hi[2] = z1;
  s->r = 0.0;
  s->e = e;
  s->mu = mu;
  g_built = 0;
  g_nshape += 1;
  return g_nshape - 1;
}

/* A capsule: the segment a to b, world frame, and a radius. A sphere is a
 * capsule with a == b. */
SIM_EXPORT int sim_world_capsule(double ax, double ay, double az,
                                 double bx, double by, double bz,
                                 double r, double e, double mu) {
  if (g_nshape >= WORLD_MAX_SHAPES) {
    return SIM_ERR_BAD_STATE;
  }
  if (!world_finite(ax) || !world_finite(ay) || !world_finite(az) || !world_finite(bx) || !world_finite(by)
      || !world_finite(bz) || !world_finite(r) || !(r > 0.0) || !shape_material_ok(e, mu)) {
    return SIM_ERR_BAD_ARG;
  }
  Shape *s = &g_shape[g_nshape];
  s->type = SHAPE_CAPSULE;
  s->a[0] = ax;
  s->a[1] = ay;
  s->a[2] = az;
  s->b[0] = bx;
  s->b[1] = by;
  s->b[2] = bz;
  s->r = r;
  for (int i = 0; i < 3; i += 1) {
    const double lo = s->a[i] < s->b[i] ? s->a[i] : s->b[i];
    const double hi = s->a[i] < s->b[i] ? s->b[i] : s->a[i];
    s->lo[i] = lo - r;
    s->hi[i] = hi + r;
  }
  s->e = e;
  s->mu = mu;
  g_built = 0;
  g_nshape += 1;
  return g_nshape - 1;
}

/* A box's vertical extent, for the level crossing's booms. The footprint is
 * what the grid files a box under, so this cannot move it in the grid. */
SIM_EXPORT int sim_world_box_z(int i, double z0, double z1) {
  if (i < 0 || i >= g_nshape || g_shape[i].type != SHAPE_BOX) {
    return SIM_ERR_BAD_ARG;
  }
  if (!world_finite(z0) || !world_finite(z1) || !(z1 >= z0)) {
    return SIM_ERR_BAD_ARG;
  }
  g_shape[i].lo[2] = z0;
  g_shape[i].hi[2] = z1;
  return SIM_OK;
}

/*
 * A moving box: the train. Set every step from the map's own closed form, so
 * the solid train is a function of the step count and nothing else. v is its
 * surface velocity for the friction and restitution the contact reads;
 * position jumps (a wrap, a seek) are never read as speed. x1 < x0 parks it.
 * m is 0 to WORLD_MAX_MOVERS - 1, one table with the road vehicles.
 */
SIM_EXPORT int sim_world_mover(int m, double x0, double y0, double z0,
                               double x1, double y1, double z1,
                               double vx, double vy, double vz,
                               double e, double mu) {
  if (m < 0 || m >= WORLD_MAX_MOVERS) {
    return SIM_ERR_BAD_ARG;
  }
  if (!world_finite(x0) || !world_finite(y0) || !world_finite(z0) || !world_finite(x1) || !world_finite(y1)
      || !world_finite(z1) || !world_finite(vx) || !world_finite(vy) || !world_finite(vz)
      || !shape_material_ok(e, mu)) {
    return SIM_ERR_BAD_ARG;
  }
  Mover *mv = &g_mover[m];
  /* Seating or parking a box here ends a road vehicle in the same slot: this
   * is also how the shell takes a vehicle away. */
  if (mv->veh) {
    mv->veh = 0;
    g_nveh -= 1;
  }
  if (!(x1 >= x0) || !(y1 >= y0) || !(z1 >= z0)) {
    mv->on = 0;
    return SIM_OK;
  }
  mv->lo[0] = x0;
  mv->lo[1] = y0;
  mv->lo[2] = z0;
  mv->hi[0] = x1;
  mv->hi[1] = y1;
  mv->hi[2] = z1;
  mv->v[0] = vx;
  mv->v[1] = vy;
  mv->v[2] = vz;
  mv->e = e;
  mv->mu = mu;
  mv->on = 1;
  return SIM_OK;
}

/*
 * File every shape in a uniform grid on the ground plane. Returns the number
 * of shapes, or SIM_ERR_BAD_STATE if the town will not fit, which the shell
 * must treat as loudly as a missing export.
 */
SIM_EXPORT int sim_world_build(void) {
  g_built = 0;
  g_prev_ok = 0;
  if (g_nshape == 0) {
    g_gnx = 0;
    g_gny = 0;
    g_built = 1;
    return 0;
  }
  double x0 = g_shape[0].lo[0];
  double y0 = g_shape[0].lo[1];
  double x1 = g_shape[0].hi[0];
  double y1 = g_shape[0].hi[1];
  for (int i = 1; i < g_nshape; i += 1) {
    const Shape *s = &g_shape[i];
    x0 = s->lo[0] < x0 ? s->lo[0] : x0;
    y0 = s->lo[1] < y0 ? s->lo[1] : y0;
    x1 = s->hi[0] > x1 ? s->hi[0] : x1;
    y1 = s->hi[1] > y1 ? s->hi[1] : y1;
  }
  double cell = WORLD_CELL_MIN;
  int nx = 0;
  int ny = 0;
  for (;;) {
    nx = (int)((x1 - x0) / cell) + 1;
    ny = (int)((y1 - y0) / cell) + 1;
    if ((long long)nx * (long long)ny <= WORLD_MAX_CELLS) {
      break;
    }
    cell *= 2.0;
  }
  g_cell = cell;
  g_gx0 = x0;
  g_gy0 = y0;
  g_gnx = nx;
  g_gny = ny;
  const int ncell = nx * ny;
  for (int c = 0; c <= ncell; c += 1) {
    g_cell_start[c] = 0;
  }
  long long total = 0;
  for (int i = 0; i < g_nshape; i += 1) {
    const Shape *s = &g_shape[i];
    const int cx0 = (int)((s->lo[0] - x0) / cell);
    const int cx1 = (int)((s->hi[0] - x0) / cell);
    const int cy0 = (int)((s->lo[1] - y0) / cell);
    const int cy1 = (int)((s->hi[1] - y0) / cell);
    for (int cx = cx0; cx <= cx1; cx += 1) {
      for (int cy = cy0; cy <= cy1; cy += 1) {
        g_cell_start[cx * ny + cy + 1] += 1;
        total += 1;
      }
    }
  }
  if (total > WORLD_MAX_ITEMS) {
    g_gnx = 0;
    g_gny = 0;
    return SIM_ERR_BAD_STATE;
  }
  for (int c = 0; c < ncell; c += 1) {
    g_cell_start[c + 1] += g_cell_start[c];
  }
  /* Fill, each cell's own start as a moving cursor. Afterwards start[c] is
   * where cell c ends, which is where c + 1 begins, so shifting the array
   * one place right puts every start back. */
  for (int i = 0; i < g_nshape; i += 1) {
    const Shape *s = &g_shape[i];
    const int cx0 = (int)((s->lo[0] - x0) / cell);
    const int cx1 = (int)((s->hi[0] - x0) / cell);
    const int cy0 = (int)((s->lo[1] - y0) / cell);
    const int cy1 = (int)((s->hi[1] - y0) / cell);
    for (int cx = cx0; cx <= cx1; cx += 1) {
      for (int cy = cy0; cy <= cy1; cy += 1) {
        const int c = cx * ny + cy;
        g_items[g_cell_start[c]] = i;
        g_cell_start[c] += 1;
      }
    }
  }
  for (int c = ncell; c > 0; c -= 1) {
    g_cell_start[c] = g_cell_start[c - 1];
  }
  g_cell_start[0] = 0;
  for (int i = 0; i < g_nshape; i += 1) {
    g_stamp[i] = 0;
  }
  g_query = 0;
  g_built = 1;
  return g_nshape;
}

SIM_EXPORT int sim_world_count(void) {
  return g_nshape;
}

/* The box acting as the ground this step, or -1 for the shell's own plane. */
SIM_EXPORT int sim_world_support(void) {
  return g_support;
}

/*
 * What touched what since the last read, then cleared. Eleven doubles:
 *   [0] steps with any obstacle contact    [1] largest closing speed, m/s
 *   [2] largest CG velocity change, m/s    [3] shape of [2], -2 - m a mover
 *   [4..6] its normal, world               [7] steps with a prop contact
 *   [8] steps with a frame or lens contact [9] deepest penetration, m
 *   [10] the support box now, -1 for the shell's plane
 */
SIM_EXPORT int sim_world_report(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  out[0] = g_rep_steps;
  out[1] = g_rep_closing;
  out[2] = g_rep_dv;
  out[3] = g_rep_index;
  out[4] = g_rep_n[0];
  out[5] = g_rep_n[1];
  out[6] = g_rep_n[2];
  out[7] = g_rep_props;
  out[8] = g_rep_frame;
  out[9] = g_rep_depth;
  out[10] = (double)g_support;
  g_rep_steps = 0.0;
  g_rep_closing = 0.0;
  g_rep_dv = 0.0;
  g_rep_index = -1.0;
  g_rep_n[0] = 0.0;
  g_rep_n[1] = 0.0;
  g_rep_n[2] = 0.0;
  g_rep_props = 0.0;
  g_rep_frame = 0.0;
  g_rep_depth = 0.0;
  return SIM_OK;
}

int world_active(void) {
  if (!g_built) {
    return 0;
  }
  if (g_nshape > 0) {
    return 1;
  }
  for (int m = 0; m < WORLD_MAX_MOVERS; m += 1) {
    if (g_mover[m].on) {
      return 1;
    }
  }
  return 0;
}

/* A teleport (sim_set_pose, a reset) leaves the previous points meaningless. */
void world_forget(void) {
  g_prev_ok = 0;
  g_support = -1;
  g_press_held = 0;
  g_press_idle = 0;
  g_pressing = 0;
}

/* ------------------------------------------------------------------ *
 * Broadphase.
 * ------------------------------------------------------------------ */
static int world_gather(double x0, double y0, double x1, double y1) {
  int n = 0;
  if (g_gnx == 0) {
    return 0;
  }
  g_query += 1;
  if (g_query == 0) {
    for (int i = 0; i < g_nshape; i += 1) {
      g_stamp[i] = 0;
    }
    g_query = 1;
  }
  int cx0 = (int)__builtin_floor((x0 - g_gx0) / g_cell);
  int cx1 = (int)__builtin_floor((x1 - g_gx0) / g_cell);
  int cy0 = (int)__builtin_floor((y0 - g_gy0) / g_cell);
  int cy1 = (int)__builtin_floor((y1 - g_gy0) / g_cell);
  if (cx1 < 0 || cy1 < 0 || cx0 >= g_gnx || cy0 >= g_gny) {
    return 0;
  }
  cx0 = cx0 < 0 ? 0 : cx0;
  cy0 = cy0 < 0 ? 0 : cy0;
  cx1 = cx1 >= g_gnx ? g_gnx - 1 : cx1;
  cy1 = cy1 >= g_gny ? g_gny - 1 : cy1;
  for (int cx = cx0; cx <= cx1; cx += 1) {
    for (int cy = cy0; cy <= cy1; cy += 1) {
      const int c = cx * g_gny + cy;
      for (int k = g_cell_start[c]; k < g_cell_start[c + 1]; k += 1) {
        const int i = g_items[k];
        if (g_stamp[i] == g_query) {
          continue;
        }
        g_stamp[i] = g_query;
        if (n < WORLD_MAX_CAND) {
          g_cand[n] = i;
          n += 1;
        }
      }
    }
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * 1. SUPPORT: the highest box top under the CG, if it beats the terrain.
 * ------------------------------------------------------------------ */

/*
 * Given the plane the shell raised (plant frame, n.p = d), decide what the
 * ground is for this step. Writes the plane to use; returns the box index or
 * -1. Only boxes, never movers: a train roof is not a floor to perch on.
 */
int world_select_support(const SimState *s, const double tn[3], double td,
                         double out_n[3], double *out_d) {
  out_n[0] = tn[0];
  out_n[1] = tn[1];
  out_n[2] = tn[2];
  *out_d = td;
  g_support = -1;
  if (!g_built || g_nshape == 0) {
    return -1;
  }
  double w[3];
  plant_to_world_pos(s->pos, w);
  const int n = world_gather(w[0], w[1], w[0], w[1]);
  /* The CG may sit a little below the top in a hard landing, never by more
   * than half the parked height or it is inside the box, not on it. */
  const double sink = 0.5 * PLANT.hull_hz_down;
  int best = -1;
  double best_top = 0.0;
  for (int k = 0; k < n; k += 1) {
    const int i = g_cand[k];
    const Shape *sh = &g_shape[i];
    if (sh->type != SHAPE_BOX) {
      continue;
    }
    if (!(w[0] > sh->lo[0] && w[0] < sh->hi[0] && w[1] > sh->lo[1] && w[1] < sh->hi[1])) {
      continue;
    }
    if (!(w[2] >= sh->hi[2] - sink)) {
      continue;
    }
    if (best < 0 || sh->hi[2] > best_top) {
      best = i;
      best_top = sh->hi[2];
    }
  }
  if (best < 0) {
    return -1;
  }
  /* The terrain plane's height under the CG, plant frame. A plane that is
   * nearly vertical is not a floor, so it cannot win. */
  const double top_p = best_top - g_org[2];
  if (tn[2] > 0.2) {
    const double zt = (td - tn[0] * s->pos[0] - tn[1] * s->pos[1]) / tn[2];
    if (!(top_p > zt)) {
      return -1;
    }
  }
  out_n[0] = 0.0;
  out_n[1] = 0.0;
  out_n[2] = 1.0;
  *out_d = top_p;
  g_support = best;
  return best;
}

/* ------------------------------------------------------------------ *
 * 2. FRAME: the hull box against a world box, separating axis test with a
 * clipped manifold. The standard box-box collision; see Gottschalk, Lin and
 * Manocha for the fifteen axes and Box2D's b2CollidePolygons for the
 * reference and incident face clip, which this follows in three dimensions.
 * ------------------------------------------------------------------ */

typedef struct {
  double c[3];     /* hull box centre, world */
  double R[3][3];  /* body axes, world, as columns */
  double h[3];     /* half extents */
} Obb;

static double dot3(const double a[3], const double b[3]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

static double absd(double x) {
  return x < 0.0 ? -x : x;
}

/* Clip a convex polygon (in place) to the half space n.p <= d. */
static int clip_poly(double poly[][3], int n, const double pn[3], double d, double out[][3]) {
  int m = 0;
  for (int i = 0; i < n; i += 1) {
    const double *a = poly[i];
    const double *b = poly[(i + 1) % n];
    const double da = dot3(pn, a) - d;
    const double db = dot3(pn, b) - d;
    if (da <= 0.0) {
      out[m][0] = a[0];
      out[m][1] = a[1];
      out[m][2] = a[2];
      m += 1;
    }
    if ((da < 0.0 && db > 0.0) || (da > 0.0 && db < 0.0)) {
      const double t = da / (da - db);
      out[m][0] = a[0] + (b[0] - a[0]) * t;
      out[m][1] = a[1] + (b[1] - a[1]) * t;
      out[m][2] = a[2] + (b[2] - a[2]) * t;
      m += 1;
    }
  }
  return m;
}

static int push_contact(int nc, const double n[3], const double p[3], double depth,
                        double e, double mu, const double vs[3], int shape, int kind,
                        int motor) {
  if (nc >= WORLD_MAX_CONTACTS) {
    return nc;
  }
  Contact *c = &g_con[nc];
  for (int i = 0; i < 3; i += 1) {
    c->n[i] = n[i];
    c->p[i] = p[i];
    c->vs[i] = vs[i];
  }
  c->depth = depth;
  c->e = e;
  c->mu = mu;
  c->shape = shape;
  c->kind = kind;
  c->motor = motor;
  return nc + 1;
}

/*
 * Is a contact with this normal at this point the ground plane itself? A top
 * face lying on the plane the plant is already resting the craft on must not
 * be solved twice, once as ground and once as a wall, or the two fight.
 */
static int on_ground_plane(const double n[3], double top_z, const double p[3],
                           int ground_on, const double gn[3], double gd) {
  if (!ground_on || n[2] < 0.9) {
    return 0;
  }
  /* The plane's height at this point, world. */
  double pp[3];
  const double rel[3] = { p[0] - g_org[0], p[1] - g_org[1], p[2] - g_org[2] };
  world_to_plant_dir(rel, pp);
  if (!(gn[2] > 0.2)) {
    return 0;
  }
  const double zp = (gd - gn[0] * pp[0] - gn[1] * pp[1]) / gn[2] + g_org[2];
  return top_z <= zp + WORLD_COPLANAR;
}

static int obb_vs_box(int nc, const Obb *o, const double lo[3], const double hi[3],
                      double e, double mu, const double vs[3], int shape,
                      int ground_on, const double gn[3], double gd) {
  double B[3];
  double b[3];
  for (int i = 0; i < 3; i += 1) {
    B[i] = 0.5 * (lo[i] + hi[i]);
    b[i] = 0.5 * (hi[i] - lo[i]);
  }
  double d[3] = { o->c[0] - B[0], o->c[1] - B[1], o->c[2] - B[2] };
  double AR[3][3];
  for (int i = 0; i < 3; i += 1) {
    for (int j = 0; j < 3; j += 1) {
      AR[i][j] = absd(o->R[i][j]) + 1e-12;
    }
  }
  /* Best axis: 0..2 box faces, 3..5 hull faces, 6..14 edge pairs. s is the
   * separation, positive when apart. */
  double best_s = -1e300;
  int best = -1;
  double best_n[3] = { 0.0, 0.0, 0.0 };

  double face_s = -1e300;
  int face = -1;
  double face_n[3] = { 0.0, 0.0, 0.0 };
  for (int i = 0; i < 3; i += 1) {
    const double ra = o->h[0] * AR[i][0] + o->h[1] * AR[i][1] + o->h[2] * AR[i][2];
    const double s = absd(d[i]) - (b[i] + ra);
    if (s > 0.0) {
      return nc;
    }
    if (s > face_s) {
      face_s = s;
      face = i;
      face_n[0] = 0.0;
      face_n[1] = 0.0;
      face_n[2] = 0.0;
      face_n[i] = d[i] < 0.0 ? -1.0 : 1.0;
    }
  }
  best_s = face_s;
  best = face;
  best_n[0] = face_n[0];
  best_n[1] = face_n[1];
  best_n[2] = face_n[2];

  double hull_s = -1e300;
  int hull = -1;
  double hull_n[3] = { 0.0, 0.0, 0.0 };
  for (int j = 0; j < 3; j += 1) {
    const double dj = d[0] * o->R[0][j] + d[1] * o->R[1][j] + d[2] * o->R[2][j];
    const double rb = b[0] * AR[0][j] + b[1] * AR[1][j] + b[2] * AR[2][j];
    const double s = absd(dj) - (o->h[j] + rb);
    if (s > 0.0) {
      return nc;
    }
    if (s > hull_s) {
      hull_s = s;
      hull = j;
      const double sg = dj < 0.0 ? -1.0 : 1.0;
      hull_n[0] = sg * o->R[0][j];
      hull_n[1] = sg * o->R[1][j];
      hull_n[2] = sg * o->R[2][j];
    }
  }
  /* Box2D's tolerances: a hull face only beats a world face clearly. */
  if (hull_s > 0.98 * best_s + 0.001) {
    best_s = hull_s;
    best = 3 + hull;
    best_n[0] = hull_n[0];
    best_n[1] = hull_n[1];
    best_n[2] = hull_n[2];
  }

  double edge_s = -1e300;
  int edge = -1;
  double edge_n[3] = { 0.0, 0.0, 0.0 };
  for (int i = 0; i < 3; i += 1) {
    for (int j = 0; j < 3; j += 1) {
      /* L = e_i x R_j */
      double L[3] = { 0.0, 0.0, 0.0 };
      const double r0 = o->R[0][j];
      const double r1 = o->R[1][j];
      const double r2 = o->R[2][j];
      if (i == 0) {
        L[0] = 0.0; L[1] = -r2; L[2] = r1;
      } else if (i == 1) {
        L[0] = r2; L[1] = 0.0; L[2] = -r0;
      } else {
        L[0] = -r1; L[1] = r0; L[2] = 0.0;
      }
      const double ll = sim_sqrt(dot3(L, L));
      if (ll < 1e-6) {
        continue;
      }
      L[0] /= ll;
      L[1] /= ll;
      L[2] /= ll;
      const double rb = b[0] * absd(L[0]) + b[1] * absd(L[1]) + b[2] * absd(L[2]);
      double rh = 0.0;
      for (int m = 0; m < 3; m += 1) {
        const double col[3] = { o->R[0][m], o->R[1][m], o->R[2][m] };
        rh += o->h[m] * absd(dot3(L, col));
      }
      const double dl = dot3(d, L);
      const double s = absd(dl) - (rb + rh);
      if (s > 0.0) {
        return nc;
      }
      if (s > edge_s) {
        edge_s = s;
        edge = i * 3 + j;
        const double sg = dl < 0.0 ? -1.0 : 1.0;
        edge_n[0] = sg * L[0];
        edge_n[1] = sg * L[1];
        edge_n[2] = sg * L[2];
      }
    }
  }
  if (edge >= 0 && edge_s > 0.98 * best_s + 0.001) {
    best_s = edge_s;
    best = 6 + edge;
    best_n[0] = edge_n[0];
    best_n[1] = edge_n[1];
    best_n[2] = edge_n[2];
  }

  const double *n = best_n;
  if (best < 3) {
    /* A world face. Reference: the box face with normal n. Incident: the
     * hull face most against it. */
    const int i = best;
    const double sg = n[i];
    const double plane = B[i] + sg * b[i];
    int jb = 0;
    double dm = 0.0;
    for (int j = 0; j < 3; j += 1) {
      const double dj = o->R[i][j];
      if (absd(dj) > dm) {
        dm = absd(dj);
        jb = j;
      }
    }
    const double fs = o->R[i][jb] * sg > 0.0 ? -1.0 : 1.0;
    const int k1 = (jb + 1) % 3;
    const int k2 = (jb + 2) % 3;
    double fc[3];
    for (int a = 0; a < 3; a += 1) {
      fc[a] = o->c[a] + fs * o->h[jb] * o->R[a][jb];
    }
    double poly[8][3];
    double tmp[8][3];
    const double s1[4] = { 1.0, -1.0, -1.0, 1.0 };
    const double s2[4] = { 1.0, 1.0, -1.0, -1.0 };
    for (int v = 0; v < 4; v += 1) {
      for (int a = 0; a < 3; a += 1) {
        poly[v][a] = fc[a] + s1[v] * o->h[k1] * o->R[a][k1] + s2[v] * o->h[k2] * o->R[a][k2];
      }
    }
    int np = 4;
    for (int a = 0; a < 3 && np > 0; a += 1) {
      if (a == i) {
        continue;
      }
      double pn[3] = { 0.0, 0.0, 0.0 };
      pn[a] = 1.0;
      np = clip_poly(poly, np, pn, hi[a], tmp);
      pn[a] = -1.0;
      np = clip_poly(tmp, np, pn, -lo[a], poly);
    }
    for (int v = 0; v < np; v += 1) {
      const double sep = sg * (poly[v][i] - plane);
      if (sep <= WORLD_SLOP) {
        if (on_ground_plane(n, hi[2], poly[v], ground_on, gn, gd)) {
          continue;
        }
        nc = push_contact(nc, n, poly[v], -sep, e, mu, vs, shape, 0, -1);
      }
    }
    return nc;
  }
  if (best < 6) {
    /* A hull face. Reference: the hull face against the box, outward -n.
     * Incident: the box face most along n. */
    const int j = best - 3;
    double ia = 0.0;
    int ib = 0;
    for (int a = 0; a < 3; a += 1) {
      if (absd(n[a]) > ia) {
        ia = absd(n[a]);
        ib = a;
      }
    }
    const double fsg = n[ib] < 0.0 ? -1.0 : 1.0;
    const int k1 = (ib + 1) % 3;
    const int k2 = (ib + 2) % 3;
    double poly[8][3];
    double tmp[8][3];
    const double s1[4] = { 1.0, -1.0, -1.0, 1.0 };
    const double s2[4] = { 1.0, 1.0, -1.0, -1.0 };
    for (int v = 0; v < 4; v += 1) {
      poly[v][ib] = B[ib] + fsg * b[ib];
      poly[v][k1] = B[k1] + s1[v] * b[k1];
      poly[v][k2] = B[k2] + s2[v] * b[k2];
    }
    int np = 4;
    for (int m = 0; m < 3 && np > 0; m += 1) {
      if (m == j) {
        continue;
      }
      const double col[3] = { o->R[0][m], o->R[1][m], o->R[2][m] };
      const double cc = dot3(col, o->c);
      np = clip_poly(poly, np, col, cc + o->h[m], tmp);
      const double ncol[3] = { -col[0], -col[1], -col[2] };
      np = clip_poly(tmp, np, ncol, -(cc - o->h[m]), poly);
    }
    /* The reference face: outward -n, through c - n h_j. */
    const double ref = -dot3(n, o->c) + o->h[j];
    for (int v = 0; v < np; v += 1) {
      const double sep = -dot3(n, poly[v]) - ref;
      if (sep <= WORLD_SLOP) {
        double p[3];
        for (int a = 0; a < 3; a += 1) {
          p[a] = poly[v][a] + n[a] * sep;
        }
        if (on_ground_plane(n, hi[2], p, ground_on, gn, gd)) {
          continue;
        }
        nc = push_contact(nc, n, p, -sep, e, mu, vs, shape, 0, -1);
      }
    }
    return nc;
  }
  {
    /* Edge on edge: the closest points of the two supporting edges. */
    const int ei = (best - 6) / 3;
    const int ej = (best - 6) % 3;
    double P0[3];
    for (int a = 0; a < 3; a += 1) {
      P0[a] = o->c[a];
    }
    for (int m = 0; m < 3; m += 1) {
      if (m == ej) {
        continue;
      }
      const double col[3] = { o->R[0][m], o->R[1][m], o->R[2][m] };
      const double sgm = dot3(col, n) > 0.0 ? -1.0 : 1.0;
      for (int a = 0; a < 3; a += 1) {
        P0[a] += sgm * o->h[m] * col[a];
      }
    }
    double Q0[3];
    for (int a = 0; a < 3; a += 1) {
      Q0[a] = B[a];
    }
    for (int a = 0; a < 3; a += 1) {
      if (a == ei) {
        continue;
      }
      Q0[a] += (n[a] > 0.0 ? 1.0 : -1.0) * b[a];
    }
    const double u[3] = { o->R[0][ej], o->R[1][ej], o->R[2][ej] };
    double v[3] = { 0.0, 0.0, 0.0 };
    v[ei] = 1.0;
    const double w0[3] = { P0[0] - Q0[0], P0[1] - Q0[1], P0[2] - Q0[2] };
    const double uv = dot3(u, v);
    const double uw = dot3(u, w0);
    const double vw = dot3(v, w0);
    const double den = 1.0 - uv * uv;
    double sp = 0.0;
    double tq = 0.0;
    if (den > 1e-9) {
      sp = (uv * vw - uw) / den;
      tq = (vw - uv * uw) / den;
    }
    sp = sp < -o->h[ej] ? -o->h[ej] : (sp > o->h[ej] ? o->h[ej] : sp);
    tq = tq < -b[ei] ? -b[ei] : (tq > b[ei] ? b[ei] : tq);
    double p[3];
    for (int a = 0; a < 3; a += 1) {
      p[a] = 0.5 * ((P0[a] + sp * u[a]) + (Q0[a] + tq * v[a]));
    }
    return push_contact(nc, n, p, -best_s, e, mu, vs, shape, 0, -1);
  }
}

/*
 * Segment to box: the closest point of a segment (box local) to the box, by
 * walking the breakpoints where the segment crosses a slab face. The squared
 * distance is a convex piecewise quadratic in t, so each piece is minimised
 * in closed form and the smallest wins. Exact, and no iteration count.
 */
static double seg_box_closest(const double a[3], const double b[3], const double h[3],
                              double *t_out) {
  const double dd[3] = { b[0] - a[0], b[1] - a[1], b[2] - a[2] };
  double tb[8];
  int nt = 0;
  tb[nt++] = 0.0;
  tb[nt++] = 1.0;
  for (int k = 0; k < 3; k += 1) {
    if (absd(dd[k]) > 1e-12) {
      const double t1 = (h[k] - a[k]) / dd[k];
      const double t2 = (-h[k] - a[k]) / dd[k];
      if (t1 > 0.0 && t1 < 1.0) {
        tb[nt++] = t1;
      }
      if (t2 > 0.0 && t2 < 1.0) {
        tb[nt++] = t2;
      }
    }
  }
  /* Insertion sort, at most eight. */
  for (int i = 1; i < nt; i += 1) {
    const double x = tb[i];
    int j = i - 1;
    while (j >= 0 && tb[j] > x) {
      tb[j + 1] = tb[j];
      j -= 1;
    }
    tb[j + 1] = x;
  }
  double best_t = 0.0;
  double best_f = 1e300;
  for (int iv = 0; iv + 1 < nt; iv += 1) {
    const double t0 = tb[iv];
    const double t1 = tb[iv + 1];
    const double tm = 0.5 * (t0 + t1);
    double A = 0.0;
    double Bq = 0.0;
    for (int k = 0; k < 3; k += 1) {
      const double pm = a[k] + tm * dd[k];
      if (pm > h[k]) {
        A += dd[k] * dd[k];
        Bq += 2.0 * dd[k] * (a[k] - h[k]);
      } else if (pm < -h[k]) {
        A += dd[k] * dd[k];
        Bq += 2.0 * dd[k] * (a[k] + h[k]);
      }
    }
    double cands[3] = { t0, t1, t0 };
    int ncand = 2;
    if (A > 1e-18) {
      double ts = -Bq / (2.0 * A);
      if (ts > t0 && ts < t1) {
        cands[2] = ts;
        ncand = 3;
      }
    }
    for (int c = 0; c < ncand; c += 1) {
      const double t = cands[c];
      double f = 0.0;
      for (int k = 0; k < 3; k += 1) {
        const double p = a[k] + t * dd[k];
        const double o = p > h[k] ? p - h[k] : (p < -h[k] ? p + h[k] : 0.0);
        f += o * o;
      }
      if (f < best_f) {
        best_f = f;
        best_t = t;
      }
    }
  }
  *t_out = best_t;
  return best_f;
}

static int obb_vs_capsule(int nc, const Obb *o, const Shape *cap, int shape,
                          int ground_on, const double gn[3], double gd) {
  double al[3];
  double bl[3];
  for (int m = 0; m < 3; m += 1) {
    const double col[3] = { o->R[0][m], o->R[1][m], o->R[2][m] };
    const double ra[3] = { cap->a[0] - o->c[0], cap->a[1] - o->c[1], cap->a[2] - o->c[2] };
    const double rb[3] = { cap->b[0] - o->c[0], cap->b[1] - o->c[1], cap->b[2] - o->c[2] };
    al[m] = dot3(col, ra);
    bl[m] = dot3(col, rb);
  }
  double t = 0.0;
  const double f = seg_box_closest(al, bl, o->h, &t);
  const double dist = sim_sqrt(f);
  if (dist >= cap->r) {
    return nc;
  }
  double pl[3];
  double ql[3];
  for (int k = 0; k < 3; k += 1) {
    pl[k] = al[k] + t * (bl[k] - al[k]);
    ql[k] = pl[k] > o->h[k] ? o->h[k] : (pl[k] < -o->h[k] ? -o->h[k] : pl[k]);
  }
  double nl[3];
  double depth;
  if (dist > 1e-9) {
    for (int k = 0; k < 3; k += 1) {
      nl[k] = (ql[k] - pl[k]) / dist;
    }
    depth = cap->r - dist;
  } else {
    /* The axis is inside the hull: out through the nearest hull face. */
    int kb = 0;
    double gap = 1e300;
    for (int k = 0; k < 3; k += 1) {
      const double g = o->h[k] - absd(pl[k]);
      if (g < gap) {
        gap = g;
        kb = k;
      }
    }
    nl[0] = 0.0;
    nl[1] = 0.0;
    nl[2] = 0.0;
    nl[kb] = pl[kb] < 0.0 ? 1.0 : -1.0;
    ql[kb] = pl[kb] < 0.0 ? -o->h[kb] : o->h[kb];
    depth = cap->r + gap;
  }
  double n[3];
  double p[3];
  for (int a = 0; a < 3; a += 1) {
    n[a] = o->R[a][0] * nl[0] + o->R[a][1] * nl[1] + o->R[a][2] * nl[2];
    p[a] = o->c[a] + o->R[a][0] * ql[0] + o->R[a][1] * ql[1] + o->R[a][2] * ql[2];
  }
  (void)ground_on;
  (void)gn;
  (void)gd;
  const double zero[3] = { 0.0, 0.0, 0.0 };
  return push_contact(nc, n, p, depth, cap->e, cap->mu, zero, shape, 0, -1);
}

/*
 * A point against a box, by the face it came in through. prev is where the
 * point was a step ago, or null. Returns the depth, 0 if outside.
 */
static double point_in_box(const double p[3], const double *prev, const double lo[3],
                           const double hi[3], double n[3]) {
  for (int k = 0; k < 3; k += 1) {
    if (!(p[k] > lo[k] && p[k] < hi[k])) {
      return 0.0;
    }
  }
  int face = -1;
  double tbest = -1.0;
  if (prev) {
    for (int k = 0; k < 3; k += 1) {
      const double dk = p[k] - prev[k];
      if (prev[k] <= lo[k] && dk > 1e-12) {
        const double t = (lo[k] - prev[k]) / dk;
        if (t > tbest) {
          tbest = t;
          face = 2 * k;
        }
      } else if (prev[k] >= hi[k] && dk < -1e-12) {
        const double t = (hi[k] - prev[k]) / dk;
        if (t > tbest) {
          tbest = t;
          face = 2 * k + 1;
        }
      }
    }
  }
  if (face < 0) {
    double g = 1e300;
    for (int k = 0; k < 3; k += 1) {
      if (p[k] - lo[k] < g) {
        g = p[k] - lo[k];
        face = 2 * k;
      }
      if (hi[k] - p[k] < g) {
        g = hi[k] - p[k];
        face = 2 * k + 1;
      }
    }
  }
  const int k = face / 2;
  n[0] = 0.0;
  n[1] = 0.0;
  n[2] = 0.0;
  if (face % 2 == 0) {
    n[k] = -1.0;
    return p[k] - lo[k];
  }
  n[k] = 1.0;
  return hi[k] - p[k];
}

/* A point against a capsule. Returns the depth, 0 if outside. */
static double point_in_capsule(const double p[3], const Shape *cap, double n[3]) {
  const double ab[3] = { cap->b[0] - cap->a[0], cap->b[1] - cap->a[1], cap->b[2] - cap->a[2] };
  const double ap[3] = { p[0] - cap->a[0], p[1] - cap->a[1], p[2] - cap->a[2] };
  const double l2 = dot3(ab, ab);
  double t = l2 > 1e-18 ? dot3(ap, ab) / l2 : 0.0;
  t = t < 0.0 ? 0.0 : (t > 1.0 ? 1.0 : t);
  const double q[3] = { cap->a[0] + t * ab[0], cap->a[1] + t * ab[1], cap->a[2] + t * ab[2] };
  const double dv[3] = { p[0] - q[0], p[1] - q[1], p[2] - q[2] };
  const double d = sim_sqrt(dot3(dv, dv));
  if (!(d < cap->r)) {
    return 0.0;
  }
  if (d > 1e-9) {
    n[0] = dv[0] / d;
    n[1] = dv[1] / d;
    n[2] = dv[2] / d;
  } else {
    n[0] = 0.0;
    n[1] = 0.0;
    n[2] = 1.0;
  }
  return cap->r - d;
}

/* A sphere against a box. Returns the depth; writes the normal and the
 * sphere's own surface point. */
static double sphere_in_box(const double c[3], double r, const double *prev,
                            const double lo[3], const double hi[3], double n[3],
                            double p[3]) {
  double q[3];
  for (int k = 0; k < 3; k += 1) {
    q[k] = c[k] < lo[k] ? lo[k] : (c[k] > hi[k] ? hi[k] : c[k]);
  }
  const double dv[3] = { c[0] - q[0], c[1] - q[1], c[2] - q[2] };
  const double d2 = dot3(dv, dv);
  double depth;
  if (d2 > 1e-18) {
    const double d = sim_sqrt(d2);
    if (!(d < r)) {
      return 0.0;
    }
    n[0] = dv[0] / d;
    n[1] = dv[1] / d;
    n[2] = dv[2] / d;
    depth = r - d;
  } else {
    depth = point_in_box(c, prev, lo, hi, n) + r;
  }
  for (int k = 0; k < 3; k += 1) {
    p[k] = c[k] - n[k] * r;
  }
  return depth;
}

/* ------------------------------------------------------------------ *
 * The step.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * The solve: sequential impulses with ACCUMULATED impulses, Catto's form.
 *
 * sim.c's contact_impulse is one shot: each call applies what that call
 * sees and returns early once the point is no longer approaching. That is
 * right for the ground, whose goldens pin it, and wrong for an edge hitting
 * a wall. The first pass stops the edge and spins the craft about it; the
 * spin then slides the edge along the face at metres a second, and a one
 * shot solver never sees that slide because the edge is no longer
 * approaching. Measured in world-check before this: a 5 m/s nose first hit
 * left at 33 rad/s. A real edge grips the wall it hits. So each contact
 * keeps the impulse it has already given, the normal total stays above
 * zero, the friction total stays inside mu times it, and every pass can
 * take back what an earlier one overdid. The restitution target is fixed
 * from the approach before the first pass, so passes cannot pump energy.
 *
 * The restitution curve is the ground's own (sim.c, CONTACT_E_KNEE and
 * CONTACT_E_FLOOR), written again here rather than shared so that nothing
 * in this file can move a ground golden.
 * ------------------------------------------------------------------ */
#define WORLD_ITERS 8
#define WORLD_E_KNEE 1.7
#define WORLD_REST_VN 0.25
#define WORLD_E_FLOOR 0.35
#define WORLD_BAUMGARTE 0.0
#define WORLD_BIAS_MAX 1.2

typedef struct {
  double n[3];
  double t1[3];
  double t2[3];
  double r[3];
  double vs[3];
  double kn;
  double kt1;
  double kt2;
  double target;
  double pn;
  double pt1;
  double pt2;
  double mu;
  double cap;
} Solve;

static Solve g_sv[WORLD_MAX_CONTACTS];

static void cross3(const double a[3], const double b[3], double out[3]) {
  out[0] = a[1] * b[2] - a[2] * b[1];
  out[1] = a[2] * b[0] - a[0] * b[2];
  out[2] = a[0] * b[1] - a[1] * b[0];
}

/* Body to plant axes and back, for the inertia. */
static void q_rot(const double q[4], const double v[3], double out[3]) {
  const double w = q[0], x = q[1], y = q[2], z = q[3];
  const double ux = 2.0 * (y * v[2] - z * v[1]);
  const double uy = 2.0 * (z * v[0] - x * v[2]);
  const double uz = 2.0 * (x * v[1] - y * v[0]);
  out[0] = v[0] + w * ux + (y * uz - z * uy);
  out[1] = v[1] + w * uy + (z * ux - x * uz);
  out[2] = v[2] + w * uz + (x * uy - y * ux);
}

static void q_rot_inv(const double q[4], const double v[3], double out[3]) {
  const double qc[4] = { q[0], -q[1], -q[2], -q[3] };
  q_rot(qc, v, out);
}

/* The inverse inertia applied to a plant axes vector. */
static void iinv(const double q[4], const double v[3], double out[3]) {
  double b[3];
  q_rot_inv(q, v, b);
  b[0] /= PLANT.inertia[0];
  b[1] /= PLANT.inertia[1];
  b[2] /= PLANT.inertia[2];
  q_rot(q, b, out);
}

static double eff_mass_inv(const double q[4], const double r[3], const double d[3]) {
  double rd[3];
  double ird[3];
  cross3(r, d, rd);
  iinv(q, rd, ird);
  return 1.0 / PLANT.mass_kg + dot3(rd, ird);
}

static void tangents(const double n[3], double t1[3], double t2[3]) {
  /* Any unit vector not along n, then two cross products. */
  double a[3] = { 1.0, 0.0, 0.0 };
  if (absd(n[0]) > 0.7) {
    a[0] = 0.0;
    a[1] = 1.0;
  }
  cross3(n, a, t1);
  const double l = sim_sqrt(dot3(t1, t1));
  t1[0] /= l;
  t1[1] /= l;
  t1[2] /= l;
  cross3(n, t1, t2);
}

static double rel_vel(const double v[3], const double w[3], const Solve *c, const double d[3]) {
  double wr[3];
  cross3(w, c->r, wr);
  return (v[0] + wr[0] - c->vs[0]) * d[0] + (v[1] + wr[1] - c->vs[1]) * d[1]
      + (v[2] + wr[2] - c->vs[2]) * d[2];
}

static void apply_j(double v[3], double w[3], const double q[4], const double r[3],
                    const double J[3]) {
  const double im = 1.0 / PLANT.mass_kg;
  v[0] += J[0] * im;
  v[1] += J[1] * im;
  v[2] += J[2] * im;
  double tau[3];
  double dw[3];
  cross3(r, J, tau);
  iinv(q, tau, dw);
  w[0] += dw[0];
  w[1] += dw[1];
  w[2] += dw[2];
}

static void world_solve(SimState *s, int nc, double np_[][3], double rp_[][3],
                        double vsp_[][3]) {
  double v[3] = { s->vel[0], s->vel[1], s->vel[2] };
  double w[3];
  q_rot(s->quat, s->omega, w);
  for (int c = 0; c < nc; c += 1) {
    const Contact *ct = &g_con[c];
    Solve *sv = &g_sv[c];
    for (int a = 0; a < 3; a += 1) {
      sv->n[a] = np_[c][a];
      sv->r[a] = rp_[c][a];
      sv->vs[a] = vsp_[c][a];
    }
    tangents(sv->n, sv->t1, sv->t2);
    sv->kn = eff_mass_inv(s->quat, sv->r, sv->n);
    sv->kt1 = eff_mass_inv(s->quat, sv->r, sv->t1);
    sv->kt2 = eff_mass_inv(s->quat, sv->r, sv->t2);
    sv->mu = ct->mu;
    sv->pn = 0.0;
    sv->pt1 = 0.0;
    sv->pt2 = 0.0;
    double pen = ct->depth;
    sv->cap = 1.0e300;
    if (ct->kind == 2) {
      /* A blade bends before it pushes, and carries at most PROP_F_MAX. */
      pen = ct->depth - 0.5 * PLANT.prop_r;
      pen = pen < 0.0 ? 0.0 : pen;
      sv->cap = PROP_F_MAX * SIM_DT;
    }
    const double vn = rel_vel(v, w, sv, sv->n);
    const double vin = vn < 0.0 ? -vn : 0.0;
    double e = ct->e;
    if (vin > WORLD_E_KNEE) {
      e = e * WORLD_E_KNEE / vin;
    }
    if (vn > -WORLD_REST_VN) {
      const double soft = vin / WORLD_REST_VN;
      e *= WORLD_E_FLOOR + (1.0 - WORLD_E_FLOOR) * (soft > 0.0 ? soft : 0.0);
    }
    double bias = 0.0;
    if (pen > WORLD_SLOP) {
      bias = WORLD_BAUMGARTE * (pen - WORLD_SLOP) / SIM_DT;
      bias = bias > WORLD_BIAS_MAX ? WORLD_BIAS_MAX : bias;
    }
    sv->target = (vn < 0.0 ? -e * vn : 0.0) + bias;
  }
  for (int it = 0; it < WORLD_ITERS; it += 1) {
    for (int c = 0; c < nc; c += 1) {
      Solve *sv = &g_sv[c];
      /* Normal. */
      const double vn = rel_vel(v, w, sv, sv->n);
      double dp = (sv->target - vn) / sv->kn;
      double pn = sv->pn + dp;
      pn = pn < 0.0 ? 0.0 : pn;
      pn = pn > sv->cap ? sv->cap : pn;
      dp = pn - sv->pn;
      sv->pn = pn;
      if (dp != 0.0) {
        const double J[3] = { sv->n[0] * dp, sv->n[1] * dp, sv->n[2] * dp };
        apply_j(v, w, s->quat, sv->r, J);
      }
      /* Friction, both tangents, inside a box of mu times the normal. */
      const double lim = sv->mu * sv->pn;
      const double v1 = rel_vel(v, w, sv, sv->t1);
      double p1 = sv->pt1 - v1 / sv->kt1;
      p1 = p1 < -lim ? -lim : (p1 > lim ? lim : p1);
      const double d1 = p1 - sv->pt1;
      sv->pt1 = p1;
      const double v2 = rel_vel(v, w, sv, sv->t2);
      double p2 = sv->pt2 - v2 / sv->kt2;
      p2 = p2 < -lim ? -lim : (p2 > lim ? lim : p2);
      const double d2 = p2 - sv->pt2;
      sv->pt2 = p2;
      if (d1 != 0.0 || d2 != 0.0) {
        const double J[3] = {
          sv->t1[0] * d1 + sv->t2[0] * d2,
          sv->t1[1] * d1 + sv->t2[1] * d2,
          sv->t1[2] * d1 + sv->t2[2] * d2,
        };
        apply_j(v, w, s->quat, sv->r, J);
      }
    }
  }
  s->vel[0] = v[0];
  s->vel[1] = v[1];
  s->vel[2] = v[2];
  q_rot_inv(s->quat, w, s->omega);
}

/* ================================================================== *
 * 5. VEHICLES: movers that turn, and follow a road inside the module.
 *
 * P2 of FREESTYLE-MAPS-PLAN.md, approved by the owner on 2026-09-24, with
 * the go on 2026-09-25 and a drift car's slide put in the physics, so the car
 * a pilot sees sliding is the car the craft hits. A road is uploaded once, and
 * everything about driving it that can be worked out once is worked out
 * here, once, with + - * / and the square root, which is f64.sqrt and which
 * the WebAssembly specification defines to the bit: the arc length, the
 * direction and the bend at every point, the speed a car takes there, and the
 * time it gets there. From then on a car's pose is a lookup in those tables at
 * the module's own clock, the same bits in Node and in every browser, and the
 * shell reads the pose back to draw it.
 *
 * No trigonometry, anywhere. A heading is a unit vector, never an angle, and
 * the drift turns it by a rational rotation of t = tan(slip / 2):
 * cos = (1 - t^2) / (1 + t^2), sin = 2 t / (1 + t^2).
 * ================================================================== */

/* The longest segment a road keeps, m. The speed profile lives at the
 * points, and a car has to be able to brake and pull away between two
 * corners, so a straight drawn as one long segment is cut into pieces no
 * longer than this. Along a piece v squared is linear in distance, which is
 * exactly constant acceleration, so the cut costs nothing in accuracy, and a
 * point every metre is finer than any change of speed a pilot could see on a
 * car five metres long. */
#define ROAD_STEP 1.0
/* A segment shorter than this in plan gives no direction to drive in, m. */
#define ROAD_MIN_SEG 0.01
/* The most a road may turn at one of its points, in plan: 30 degrees, held
 * as its cosine, the square root of 3 over 2 to seventeen figures. The car's
 * centre follows the points, so where the road turns, the car's velocity
 * turns by as much within one step. An eased bend drawn a point a metre
 * turns under 29 degrees a point down to a two metre radius, far tighter
 * than any car steers. A corner drawn as one point past this is refused, and
 * so is a road folded back on itself, where the chord its bend is measured
 * across folds to nothing, the bend reads as none, and a car would reverse at
 * speed within one step. */
#define ROAD_TURN_MAX_DEG 30
#define ROAD_TURN_COS 0.86602540378443865
/* No road coordinate past a thousand kilometres, m. No map is a thousandth
 * of that, and a road far enough out (1e16 m, where doubles are 2 m apart)
 * cuts into pieces of no length, whose direction is not a number. */
#define ROAD_COORD_MAX 1e6
/* Half the chord a direction and a bend are taken across, m. A car's heading
 * is the line from its rear axle to its front axle, 2.7 m apart on a family
 * car, so the road's direction under a car is the chord that long through
 * it: a road drawn a point every metre or closer does not step at every
 * point, and where the road turns at a point the heading turns smoothly
 * across the window rather than at the point, which is what a driver makes
 * of a bend. */
#define ROAD_WINDOW 1.5
/* Pulling away and braking for a corner, m/s/s. VEHICLE_ACCEL is a family
 * car pulling away briskly, 0 to 100 km/h in about eleven seconds.
 * VEHICLE_BRAKE is firm braking for a corner the driver can see coming,
 * 0.4 g: an emergency stop is twice that, and nobody drives a lap as a
 * series of emergency stops. */
#define VEHICLE_ACCEL 2.5
#define VEHICLE_BRAKE 4.0
/* The drift's largest slip, as tan(slip / 2): tan(30 degrees), so a slide
 * never passes 60 degrees, the far side of a big drift and the near side of
 * a spin. Seventeen figures, enough to name one double. */
#define DRIFT_T_MAX 0.57735026918962576
/* Beyond these the numbers are not a road vehicle: 100 m/s is 360 km/h; 50
 * m/s/s is five g, more than any tyre gives; a drift gain of 1 per m/s/s
 * reaches the slip cap at 0.6 m/s/s of cornering, so a larger one is the cap
 * everywhere; nothing on a road is 50 m long. */
#define VEHICLE_SPEED_MAX 100.0
#define VEHICLE_LATERAL_MAX 50.0
#define VEHICLE_DRIFT_MAX 1.0
#define VEHICLE_SIZE_MAX 50.0
/* And below these, and past the last, the time tables would run to infinity,
 * and an infinite time is a pose that is not a number, which a contact would
 * carry into the craft: a car slower than 0.1 m/s is parked, a driver who
 * corners at under 0.1 m/s/s never turns, and an offset is a place on a road
 * a few kilometres long, so ten thousand kilometres is not one. */
#define VEHICLE_SPEED_MIN 0.1
#define VEHICLE_LATERAL_MIN 0.1
#define VEHICLE_OFFSET_MAX 1e7
/* The tightest bend a road keeps, 1/m: half a metre's radius. Under the
 * turn limit above, a road drawn with its points a quarter metre apart or
 * more never bends this tight, so no real road is touched by this; a road
 * drawn smoothly with its points closer and knotted tighter than this would
 * have a corner speed with no floor and a lap with no end, so it is driven
 * at this bend. */
#define ROAD_KAPPA_MAX 2.0
/* The clock is a whole number of steps held in a double, which holds every
 * integer to 2^53 exactly: 285,000 years of 1 ms steps. */
#define CLOCK_MAX 9007199254740992.0

/* The segment arc length sg falls on: the last point at or before it, found
 * by halving, so a long road costs a dozen comparisons. */
static int road_seg_s(const Road *r, double sg) {
  const RoadPt *q = &g_rpt[r->first];
  int lo = 0;
  int hi = r->np - 2;
  while (lo < hi) {
    const int mid = (lo + hi + 1) / 2;
    if (q[mid].s <= sg) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/* An arc length on the road: round and round a closed one, stopped at the
 * ends of an open one. */
static double road_on(const Road *r, double sg) {
  if (r->closed) {
    sg -= __builtin_floor(sg / r->len) * r->len;
  }
  return sg < 0.0 ? 0.0 : (sg > r->len ? r->len : sg);
}

static void road_point_at(const Road *r, double sg, double out[3]) {
  const double at = road_on(r, sg);
  const int i = road_seg_s(r, at);
  const RoadPt *a = &g_rpt[r->first + i];
  const RoadPt *b = a + 1;
  double f = (at - a->s) / (b->s - a->s);
  f = f < 0.0 ? 0.0 : (f > 1.0 ? 1.0 : f);
  for (int c = 0; c < 3; c += 1) {
    out[c] = a->p[c] + (b->p[c] - a->p[c]) * f;
  }
}

/* How many pieces a segment of this length is cut into. An open road of one
 * short segment is still cut in two: a car stops at each end to turn round,
 * and needs a point between them to be moving at. */
static int road_pieces(double len, int lone) {
  int k = (int)__builtin_ceil(len / ROAD_STEP);
  k = k < 1 ? 1 : k;
  if (lone && k < 2) {
    k = 2;
  }
  return k;
}

/*
 * A road: n points of x, y, z, world frame, SI, the centre line at road
 * level. closed 1 joins the last point back to the first, which is not
 * repeated. Returns the road's index, 0 up in the order roads were added;
 * SIM_ERR_BAD_ARG for a road nobody could drive (too few points, a
 * coordinate that is not finite or is past ROAD_COORD_MAX, a segment shorter
 * than ROAD_MIN_SEG in plan, a point where it turns by more than
 * ROAD_TURN_MAX_DEG, a piece that cuts to no length), SIM_ERR_BAD_STATE when
 * it will not fit the tables. A road that is refused leaves nothing behind.
 */
SIM_EXPORT int sim_world_road(const double *xyz, int n, int closed) {
  if (g_nroad >= WORLD_MAX_ROADS) {
    return SIM_ERR_BAD_STATE;
  }
  if (xyz == 0 || n < (closed ? 3 : 2) || n > ROAD_MAX_POINTS) {
    return SIM_ERR_BAD_ARG;
  }
  for (int i = 0; i < 3 * n; i += 1) {
    if (!world_finite(xyz[i]) || !(absd(xyz[i]) <= ROAD_COORD_MAX)) {
      return SIM_ERR_BAD_ARG;
    }
  }
  const int nseg = closed ? n : n - 1;
  const int lone = !closed && nseg == 1;
  /* Counted before anything is written. */
  long long total = 1;
  for (int i = 0; i < nseg; i += 1) {
    const double *a = &xyz[3 * i];
    const double *b = &xyz[3 * ((i + 1) % n)];
    const double dx = b[0] - a[0];
    const double dy = b[1] - a[1];
    const double dz = b[2] - a[2];
    if (!(sim_sqrt(dx * dx + dy * dy) >= ROAD_MIN_SEG)) {
      return SIM_ERR_BAD_ARG;
    }
    const double len = sim_sqrt(dx * dx + dy * dy + dz * dz);
    if (!(len <= ROAD_STEP * (double)ROAD_MAX_POINTS)) {
      return SIM_ERR_BAD_STATE;
    }
    total += road_pieces(len, lone);
    if (total > ROAD_MAX_POINTS) {
      return SIM_ERR_BAD_STATE;
    }
  }
  /* The turn at every point with a segment either side, in plan, as the
   * cosine of the angle between them: the dot product over the product of
   * their lengths, which the loop above has shown are not nothing. Written
   * as "not at least", so a turn the arithmetic cannot put a number to is
   * refused too. */
  for (int i = closed ? 0 : 1; i < (closed ? n : n - 1); i += 1) {
    const double *a = &xyz[3 * ((i + n - 1) % n)];
    const double *b = &xyz[3 * i];
    const double *c = &xyz[3 * ((i + 1) % n)];
    const double ux = b[0] - a[0];
    const double uy = b[1] - a[1];
    const double vx = c[0] - b[0];
    const double vy = c[1] - b[1];
    const double lens = sim_sqrt(ux * ux + uy * uy) * sim_sqrt(vx * vx + vy * vy);
    if (!(ux * vx + uy * vy >= ROAD_TURN_COS * lens)) {
      return SIM_ERR_BAD_ARG;
    }
  }
  if (g_nrpt + total > WORLD_ROAD_POINTS) {
    return SIM_ERR_BAD_STATE;
  }
  Road *r = &g_road[g_nroad];
  RoadPt *q = &g_rpt[g_nrpt];
  r->first = g_nrpt;
  r->closed = closed ? 1 : 0;
  int np = 0;
  for (int i = 0; i < nseg; i += 1) {
    const double *a = &xyz[3 * i];
    const double *b = &xyz[3 * ((i + 1) % n)];
    const double dx = b[0] - a[0];
    const double dy = b[1] - a[1];
    const double dz = b[2] - a[2];
    const int k = road_pieces(sim_sqrt(dx * dx + dy * dy + dz * dz), lone);
    /* A point the shell drew is kept as it came; the cuts lie on the
     * segment between two of them. */
    for (int c = 0; c < 3; c += 1) {
      q[np].p[c] = a[c];
    }
    np += 1;
    for (int j = 1; j < k; j += 1) {
      const double f = (double)j / (double)k;
      for (int c = 0; c < 3; c += 1) {
        q[np].p[c] = a[c] + (b[c] - a[c]) * f;
      }
      np += 1;
    }
  }
  /* The end: an open road's last point, or a closed road's first again, so
   * every segment runs from a point to the next and a lap ends where it
   * began. */
  const double *end = closed ? &xyz[0] : &xyz[3 * (n - 1)];
  for (int c = 0; c < 3; c += 1) {
    q[np].p[c] = end[c];
  }
  np += 1;
  r->np = np;
  q[0].s = 0.0;
  for (int i = 1; i < np; i += 1) {
    const double dx = q[i].p[0] - q[i - 1].p[0];
    const double dy = q[i].p[1] - q[i - 1].p[1];
    const double dz = q[i].p[2] - q[i - 1].p[2];
    q[i].s = q[i - 1].s + sim_sqrt(dx * dx + dy * dy + dz * dz);
    /* Every piece has a length, or a car on it has a direction that is not
     * a number. Nothing counted yet, so the refusal leaves nothing behind. */
    if (!(q[i].s > q[i - 1].s)) {
      return SIM_ERR_BAD_ARG;
    }
  }
  r->len = q[np - 1].s;
  /*
   * Each point's direction and bend, from the road ROAD_WINDOW behind it and
   * ROAD_WINDOW ahead. The direction is the chord between those two, as a
   * car's is the line from its rear axle to its front one. The bend is the
   * Menger curvature of the three points, twice the cross product over the
   * product of the three sides (four times the triangle's area over them):
   * exact for any three points on a circle, zero on a straight, and signed,
   * left positive, by the cross product.
   */
  const int own = closed ? np - 1 : np;
  for (int i = 0; i < own; i += 1) {
    double A[3];
    double C[3];
    road_point_at(r, q[i].s - ROAD_WINDOW, A);
    road_point_at(r, q[i].s + ROAD_WINDOW, C);
    const double cx = C[0] - A[0];
    const double cy = C[1] - A[1];
    const double cl = sim_sqrt(cx * cx + cy * cy);
    if (cl > 1e-9) {
      q[i].t[0] = cx / cl;
      q[i].t[1] = cy / cl;
    } else {
      /* A hairpin tighter than the window folds the chord to nothing: the
       * point's own segment has a direction. */
      const int j = i + 1 < np ? i : i - 1;
      const double sx = q[j + 1].p[0] - q[j].p[0];
      const double sy = q[j + 1].p[1] - q[j].p[1];
      const double sl = sim_sqrt(sx * sx + sy * sy);
      q[i].t[0] = sx / sl;
      q[i].t[1] = sy / sl;
    }
    const double abx = q[i].p[0] - A[0];
    const double aby = q[i].p[1] - A[1];
    const double bcx = C[0] - q[i].p[0];
    const double bcy = C[1] - q[i].p[1];
    const double cross = abx * bcy - aby * bcx;
    const double den = sim_sqrt(abx * abx + aby * aby) * sim_sqrt(bcx * bcx + bcy * bcy) * cl;
    double k = den > 0.0 ? 2.0 * cross / den : 0.0;
    k = k > ROAD_KAPPA_MAX ? ROAD_KAPPA_MAX : (k < -ROAD_KAPPA_MAX ? -ROAD_KAPPA_MAX : k);
    q[i].k = k;
  }
  if (closed) {
    q[np - 1].t[0] = q[0].t[0];
    q[np - 1].t[1] = q[0].t[1];
    q[np - 1].k = q[0].k;
  }
  g_nrpt += np;
  g_nroad += 1;
  return g_nroad - 1;
}

/* Road r as the module keeps it, three doubles: [0] the points kept, its
 * long segments cut; [1] its length, m; [2] 1 if it is closed. */
SIM_EXPORT int sim_world_road_info(int road, double *out) {
  if (out == 0 || road < 0 || road >= g_nroad) {
    return SIM_ERR_BAD_ARG;
  }
  out[0] = (double)g_road[road].np;
  out[1] = g_road[road].len;
  out[2] = (double)g_road[road].closed;
  return SIM_OK;
}

/*
 * The speed and time tables for road `road` driven with top speed vmax and
 * lateral limit alat, shared by every car that drives it so. Returns the
 * profile, or -1 when the tables are full.
 *
 * The speed at each point is the lowest of three. The top speed. The corner
 * speed, sqrt(alat / curvature), taking the tightest curvature on either
 * segment that touches the point: along a segment v squared runs between its
 * two ends and so does the curvature, so their product, the lateral
 * acceleration, then keeps under alat between the points as well as on
 * them. And what braking and pulling away allow, a pass forward with
 * VEHICLE_ACCEL and a pass back with VEHICLE_BRAKE, each v' = sqrt(v^2 +
 * 2 a L). On a closed road both passes start at the slowest point, which
 * nothing can make slower, so one lap each way settles the whole loop, the
 * join included. An open road stops at each end to turn round, so its ends
 * are 0, and its way back is its way out run backwards in time, which would
 * pull away at the braking rate: both its passes use VEHICLE_ACCEL, so it
 * is drivable both ways.
 *
 * Then the time. Along a segment the acceleration is constant, so a segment
 * of length L from v0 to v1 takes exactly 2 L / (v0 + v1).
 */
static int profile_for(int road, double vmax, double alat) {
  for (int i = 0; i < g_nprof; i += 1) {
    if (g_prof[i].road == road && g_prof[i].vmax == vmax && g_prof[i].alat == alat) {
      return i;
    }
  }
  const Road *r = &g_road[road];
  if (g_nprof >= WORLD_MAX_PROFILES || g_nppt + r->np > WORLD_PROFILE_POINTS) {
    return -1;
  }
  Profile *pf = &g_prof[g_nprof];
  pf->road = road;
  pf->first = g_nppt;
  pf->vmax = vmax;
  pf->alat = alat;
  const RoadPt *q = &g_rpt[r->first];
  double *v = &g_pv[pf->first];
  double *t = &g_ptm[pf->first];
  const int np = r->np;
  const int nu = r->closed ? np - 1 : np;
  for (int i = 0; i < nu; i += 1) {
    int ia = i - 1;
    int ib = i + 1;
    if (r->closed) {
      ia = (i + nu - 1) % nu;
      ib = (i + 1) % nu;
    } else {
      ia = ia < 0 ? 0 : ia;
      ib = ib > np - 1 ? np - 1 : ib;
    }
    double kk = absd(q[i].k);
    kk = absd(q[ia].k) > kk ? absd(q[ia].k) : kk;
    kk = absd(q[ib].k) > kk ? absd(q[ib].k) : kk;
    double vc = vmax;
    if (kk > 0.0) {
      const double vl = sim_sqrt(alat / kk);
      vc = vl < vc ? vl : vc;
    }
    v[i] = vc;
  }
  if (r->closed) {
    int m = 0;
    for (int i = 1; i < nu; i += 1) {
      if (v[i] < v[m]) {
        m = i;
      }
    }
    for (int j = 1; j < nu; j += 1) {
      const int i = (m + j) % nu;
      const int h = (i + nu - 1) % nu;
      const double lim = sim_sqrt(v[h] * v[h] + 2.0 * VEHICLE_ACCEL * (q[h + 1].s - q[h].s));
      v[i] = lim < v[i] ? lim : v[i];
    }
    for (int j = 1; j < nu; j += 1) {
      const int i = (m + nu - j) % nu;
      const int h = (i + 1) % nu;
      const double lim = sim_sqrt(v[h] * v[h] + 2.0 * VEHICLE_BRAKE * (q[i + 1].s - q[i].s));
      v[i] = lim < v[i] ? lim : v[i];
    }
    v[np - 1] = v[0];
  } else {
    v[0] = 0.0;
    v[np - 1] = 0.0;
    for (int i = 1; i < np; i += 1) {
      const double lim = sim_sqrt(v[i - 1] * v[i - 1] + 2.0 * VEHICLE_ACCEL * (q[i].s - q[i - 1].s));
      v[i] = lim < v[i] ? lim : v[i];
    }
    for (int i = np - 2; i >= 0; i -= 1) {
      const double lim = sim_sqrt(v[i + 1] * v[i + 1] + 2.0 * VEHICLE_ACCEL * (q[i + 1].s - q[i].s));
      v[i] = lim < v[i] ? lim : v[i];
    }
  }
  t[0] = 0.0;
  for (int i = 0; i + 1 < np; i += 1) {
    t[i + 1] = t[i] + 2.0 * (q[i + 1].s - q[i].s) / (v[i] + v[i + 1]);
  }
  pf->T = t[np - 1];
  g_nppt += np;
  g_nprof += 1;
  return g_nprof - 1;
}

/* The time into a profile at which its car reaches arc length sg: the
 * constant acceleration of the segment solved for time, 2 d / (v0 + v(d)),
 * which never divides by a speed that is nearly nothing. */
static double time_at_s(const Profile *pf, const Road *r, double sg) {
  const RoadPt *q = &g_rpt[r->first];
  const double *vt = &g_pv[pf->first];
  const double *tt = &g_ptm[pf->first];
  const double at = sg < 0.0 ? 0.0 : (sg > r->len ? r->len : sg);
  const int i = road_seg_s(r, at);
  const double L = q[i + 1].s - q[i].s;
  double d = at - q[i].s;
  d = d < 0.0 ? 0.0 : (d > L ? L : d);
  const double v0 = vt[i];
  const double v1 = vt[i + 1];
  double w = v0 * v0 + (v1 * v1 - v0 * v0) * (d / L);
  w = w < 0.0 ? 0.0 : w;
  const double den = v0 + sim_sqrt(w);
  return tt[i] + (den > 0.0 ? 2.0 * d / den : 0.0);
}

/*
 * A car's route is its road driven over and over: lap after lap of a closed
 * road, out and back and out again on an open one. `offset` is a distance
 * along that route, m, from the road's first point, so an offset past an
 * open road's length is on the way back. Returns the route time at which
 * the car is there.
 */
static double route_time(const Profile *pf, const Road *r, double offset) {
  const double troute = r->closed ? pf->T : 2.0 * pf->T;
  const double sroute = r->closed ? r->len : 2.0 * r->len;
  double lap = __builtin_floor(offset / sroute);
  double rem = offset - lap * sroute;
  if (rem >= sroute) {
    rem -= sroute;
    lap += 1.0;
  }
  rem = rem < 0.0 ? 0.0 : rem;
  const double tl = r->closed || rem <= r->len
      ? time_at_s(pf, r, rem)
      : troute - time_at_s(pf, r, sroute - rem);
  return lap * troute + tl;
}

/* Is segment i of a time table the one time tl falls in: its start at or
 * before tl, and the next one's after it? */
static int seg_holds(const double *tt, int i, int last, double tl) {
  return i >= 0 && i <= last && tt[i] <= tl && (i == last || tl < tt[i + 1]);
}

/*
 * Mover mv's pose at step `clock`. A pure function of the integer: the time
 * is clock / SIM_STEP_HZ from the car's own start, the table says which
 * segment that time falls in and how far along it, and nothing that decides
 * the pose is carried from one step to the next (the segment it was last on
 * is kept only as the place to start looking). So the pose at step N set
 * directly is the pose after stepping to N, to the bit. Its yaw rate is left
 * at nothing here: vehicle_turn works it out from this pose and the next.
 */
static void vehicle_pose(Mover *mv, long long clock, Pose *P) {
  const Profile *pf = &g_prof[mv->prof];
  const Road *r = &g_road[pf->road];
  const RoadPt *q = &g_rpt[r->first];
  const double *vt = &g_pv[pf->first];
  const double *tt = &g_ptm[pf->first];
  const double T = pf->T;
  const double troute = r->closed ? T : 2.0 * T;
  const double sroute = r->closed ? r->len : 2.0 * r->len;
  const double tau = mv->toff + (double)clock / (double)SIM_STEP_HZ;
  double lap = __builtin_floor(tau / troute);
  double tr = tau - lap * troute;
  if (tr >= troute) {
    tr -= troute;
    lap += 1.0;
  }
  tr = tr < 0.0 ? 0.0 : tr;
  /* An open road's way back is its way out run backwards in time. */
  const int back = !r->closed && tr > T;
  double tl = back ? troute - tr : tr;
  tl = tl < 0.0 ? 0.0 : (tl > T ? T : tl);
  /* The segment the time falls in: the last point at or before it. A car
   * moves a millimetre or two a step, so the segment it was on is tried
   * first, then the ones either side, and only then is the table halved.
   * The times strictly increase, so there is one answer however it is
   * found, and where the search starts changes no bit of the pose. */
  const int last = r->np - 2;
  int lo = mv->seg;
  if (!seg_holds(tt, lo, last, tl)) {
    if (seg_holds(tt, lo + 1, last, tl)) {
      lo += 1;
    } else if (seg_holds(tt, lo - 1, last, tl)) {
      lo -= 1;
    } else {
      lo = 0;
      int hi = last;
      while (lo < hi) {
        const int mid = (lo + hi + 1) / 2;
        if (tt[mid] <= tl) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
    }
  }
  mv->seg = lo;
  const RoadPt *a = &q[lo];
  const RoadPt *b = &q[lo + 1];
  const double dt = tt[lo + 1] - tt[lo];
  double into = tl - tt[lo];
  into = into < 0.0 ? 0.0 : (into > dt ? dt : into);
  /* Constant acceleration along the segment: the speed is linear in time,
   * held between its two ends so no rounding takes it past either, and the
   * distance is the time times the mean of the speeds. */
  const double v0 = vt[lo];
  const double v1 = vt[lo + 1];
  double v = v0 + (v1 - v0) * (into / dt);
  const double vlo = v0 < v1 ? v0 : v1;
  const double vhi = v0 < v1 ? v1 : v0;
  v = v < vlo ? vlo : (v > vhi ? vhi : v);
  const double L = b->s - a->s;
  double d = into * (v0 + v) * 0.5;
  d = d > L ? L : d;
  const double f = d / L;
  for (int c = 0; c < 3; c += 1) {
    P->p[c] = a->p[c] + (b->p[c] - a->p[c]) * f;
  }
  /* The road's direction here, between its two points' own, and its bend. */
  double tx = a->t[0] + (b->t[0] - a->t[0]) * f;
  double ty = a->t[1] + (b->t[1] - a->t[1]) * f;
  double tn = sim_sqrt(tx * tx + ty * ty);
  if (!(tn > 1e-9)) {
    tx = b->p[0] - a->p[0];
    ty = b->p[1] - a->p[1];
    tn = sim_sqrt(tx * tx + ty * ty);
  }
  tx /= tn;
  ty /= tn;
  const double k = a->k + (b->k - a->k) * f;
  const double sg = back ? -1.0 : 1.0;
  const double sh = a->s + d;
  P->u[0] = sg * tx;
  P->u[1] = sg * ty;
  P->kap = sg * k;
  /* The velocity of p is the pose's own derivative, exactly: p runs along
   * the segment at speed v. Differencing two positions tens of metres out
   * instead would round at their size, a thousand times over in a velocity,
   * and a hit on a road laid at 37 degrees then parts from the same hit at
   * 0 by 1e-9 (measured 2026-09-25) where this keeps it at 3e-12. */
  for (int c = 0; c < 3; c += 1) {
    P->vel[c] = sg * v * ((b->p[c] - a->p[c]) / L);
  }
  P->speed = v;
  P->dist = lap * sroute + (back ? sroute - sh : sh);
  P->omega = 0.0;
  if (mv->drift > 0.0) {
    /*
     * THE DRIFT. The slip grows with the lateral acceleration, speed squared
     * times the path's curvature, times the car's gain, capped, and the
     * nose goes INTO the corner, which is what a drifting car does: the
     * body is turned from its direction of travel toward the inside of the
     * bend. As tan(slip / 2) the turn is rational: no angle is ever formed.
     * How fast the slip changes is not worked out here: it is in the turn of
     * the heading from one step to the next, which vehicle_turn reads.
     */
    double t = mv->drift * v * v * P->kap;
    t = t > DRIFT_T_MAX ? DRIFT_T_MAX : (t < -DRIFT_T_MAX ? -DRIFT_T_MAX : t);
    const double den = 1.0 + t * t;
    const double c = (1.0 - t * t) / den;
    const double s = 2.0 * t / den;
    P->h[0] = c * P->u[0] - s * P->u[1];
    P->h[1] = s * P->u[0] + c * P->u[1];
    P->slip = t;
  } else {
    /* An ordinary car points the way it goes, untouched. */
    P->h[0] = P->u[0];
    P->h[1] = P->u[1];
    P->slip = 0.0;
  }
}

/*
 * How fast the box turns over the step from pose P to pose N, the pose one
 * step later, written into P as its yaw rate. It is read from the headings
 * the pose function gives, so the surface a contact feels turning is the box
 * the shell draws at this step and the next: the road's bend as the heading
 * actually follows it (a chord across the window, which turns before a bend
 * and after it where the curvature at the point says nothing yet), and the
 * drift's slide coming and going, all in it by construction and none of it
 * modelled twice.
 *
 * The turn is 2 c / (1 + d) for the cross c and dot d of the two headings,
 * which is 2 tan(turn / 2): the turn itself to a few parts in a million
 * for anything a car does in a millisecond (the difference is the turn cubed
 * over twelve), and + - * / only. A box is the same box turned half round, so the
 * turn is read the short way modulo half a turn: where an open road's car
 * turns round, its nose becomes its tail within one step and no part of the
 * solid moves, and 1 + |d| is never less than 1.
 */
static void vehicle_turn(Pose *P, const Pose *N) {
  const double sn = P->h[0] * N->h[1] - P->h[1] * N->h[0];
  const double cs = P->h[0] * N->h[0] + P->h[1] * N->h[1];
  const double sg = cs < 0.0 ? -1.0 : 1.0;
  P->omega = 2.0 * sg * sn / (1.0 + sg * cs) * (double)SIM_STEP_HZ;
}

/* A car's poses a step before the clock, at it, and a step after it: the
 * first for the face a point of the craft came in through, as the car saw
 * it, the last for how fast it turns over the step. */
static void vehicle_seat(Mover *mv) {
  vehicle_pose(mv, g_clock - 1, &mv->prev);
  vehicle_pose(mv, g_clock, &mv->cur);
  vehicle_pose(mv, g_clock + 1, &mv->nxt);
  vehicle_turn(&mv->cur, &mv->nxt);
}

/*
 * Mover m becomes a vehicle on road `road`: `offset` m along its route from
 * the road's first point at step 0 of the clock; top_speed m/s; lateral, the
 * most lateral acceleration its driver takes a corner at, m/s/s; drift, the
 * slip gain per m/s/s of lateral acceleration, 0 for an ordinary car (each
 * within the bounds VEHICLE_*_MIN, _MAX and VEHICLE_OFFSET_MAX give). Its
 * body is a box in its own frame, x along its heading and z up from the road
 * point under its centre: `length` along, `width` across, `height` tall,
 * starting `clearance` over the road. e and mu as for every shape. Returns
 * SIM_OK; SIM_ERR_BAD_ARG for anything out of range, SIM_ERR_BAD_STATE when
 * the speed tables are full (sim_world_clear empties them).
 */
SIM_EXPORT int sim_world_vehicle(int m, int road, double offset,
                                 double top_speed, double lateral, double drift,
                                 double length, double width, double height,
                                 double clearance, double e, double mu) {
  if (m < 0 || m >= WORLD_MAX_MOVERS || road < 0 || road >= g_nroad) {
    return SIM_ERR_BAD_ARG;
  }
  if (!world_finite(offset) || !(absd(offset) <= VEHICLE_OFFSET_MAX)
      || !(top_speed >= VEHICLE_SPEED_MIN && top_speed <= VEHICLE_SPEED_MAX)
      || !(lateral >= VEHICLE_LATERAL_MIN && lateral <= VEHICLE_LATERAL_MAX)
      || !(drift >= 0.0 && drift <= VEHICLE_DRIFT_MAX)
      || !(length > 0.0 && length <= VEHICLE_SIZE_MAX) || !(width > 0.0 && width <= VEHICLE_SIZE_MAX)
      || !(height > 0.0 && height <= VEHICLE_SIZE_MAX)
      || !(clearance >= 0.0 && clearance <= VEHICLE_SIZE_MAX) || !shape_material_ok(e, mu)) {
    return SIM_ERR_BAD_ARG;
  }
  const int pf = profile_for(road, top_speed, lateral);
  if (pf < 0) {
    return SIM_ERR_BAD_STATE;
  }
  Mover *mv = &g_mover[m];
  if (!mv->veh) {
    g_nveh += 1;
  }
  mv->veh = 1;
  mv->on = 1;
  mv->prof = pf;
  mv->seg = 0;
  mv->lo[0] = -0.5 * length;
  mv->lo[1] = -0.5 * width;
  mv->lo[2] = clearance;
  mv->hi[0] = 0.5 * length;
  mv->hi[1] = 0.5 * width;
  mv->hi[2] = clearance + height;
  mv->v[0] = 0.0;
  mv->v[1] = 0.0;
  mv->v[2] = 0.0;
  mv->e = e;
  mv->mu = mu;
  mv->drift = drift;
  mv->zc = clearance + 0.5 * height;
  mv->rad = 0.5 * sim_sqrt(length * length + width * width + height * height);
  mv->toff = route_time(&g_prof[pf], &g_road[road], offset);
  vehicle_seat(mv);
  return SIM_OK;
}

/*
 * The vehicles' clock, a whole number of 1 ms steps: the shell's lap clock.
 * Set it at a run's start, on a seek, and whenever the lap clock has run on
 * without the module stepping (a craft parked on the ground, a turtle
 * wait); setting it to the value it has changes nothing. sim_step advances
 * it one a step, on the launch stand too, and sim_reset leaves it alone,
 * because a crash does not stop the traffic.
 */
SIM_EXPORT int sim_world_clock(double step) {
  if (!world_finite(step) || step != __builtin_floor(step) || absd(step) > CLOCK_MAX) {
    return SIM_ERR_BAD_ARG;
  }
  g_clock = (long long)step;
  for (int m = 0; m < WORLD_MAX_MOVERS; m += 1) {
    if (g_mover[m].veh) {
      vehicle_seat(&g_mover[m]);
    }
  }
  return SIM_OK;
}

/*
 * Every mover slot's vehicle pose at the clock, SIM_VEHICLE_POSE_DOUBLES
 * each, slot by slot: all zeros for a slot that is not a road vehicle.
 * Returns WORLD_MAX_MOVERS, the number of slots written. After sim_step it is
 * the pose at the step the craft's state is at, the one the next step's
 * contacts use.
 */
SIM_EXPORT int sim_world_vehicle_poses(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  for (int m = 0; m < WORLD_MAX_MOVERS; m += 1) {
    double *o = &out[m * SIM_VEHICLE_POSE_DOUBLES];
    const Mover *mv = &g_mover[m];
    if (!mv->veh) {
      for (int j = 0; j < SIM_VEHICLE_POSE_DOUBLES; j += 1) {
        o[j] = 0.0;
      }
      continue;
    }
    const Pose *P = &mv->cur;
    o[0] = 1.0;
    o[1] = P->p[0];
    o[2] = P->p[1];
    o[3] = P->p[2];
    o[4] = P->h[0];
    o[5] = P->h[1];
    o[6] = P->speed;
    o[7] = P->dist;
    o[8] = P->vel[0];
    o[9] = P->vel[1];
    o[10] = P->vel[2];
    o[11] = P->omega;
    o[12] = P->u[0];
    o[13] = P->u[1];
    o[14] = P->kap;
    o[15] = P->slip;
  }
  return WORLD_MAX_MOVERS;
}

/*
 * The contacts the craft made with road vehicles on the last step, up to max
 * of them, SIM_VEHICLE_CONTACT_DOUBLES each: [0] the slot m; [1] what
 * touched, 0 the hull, 1 the lens, 2 a prop (at its hub, where the shove
 * reaches the frame); [2..4] the point, world, m; [5..7] the normal, world,
 * unit, from the car toward the craft; [8..10] the car's surface velocity
 * there, world, m/s; [11] the depth, m. Returns how many there were, which
 * may be more than max. The checks read it to hold a contact to the car the
 * shell draws; the physics never reads it back.
 */
SIM_EXPORT int sim_world_vehicle_contacts(double *out, int max) {
  if (max < 0 || (out == 0 && max > 0)) {
    return SIM_ERR_BAD_ARG;
  }
  const int n = g_nvc < max ? g_nvc : max;
  for (int c = 0; c < n; c += 1) {
    for (int j = 0; j < SIM_VEHICLE_CONTACT_DOUBLES; j += 1) {
      out[c * SIM_VEHICLE_CONTACT_DOUBLES + j] = g_vc[c][j];
    }
  }
  return g_nvc;
}

/* One step of the vehicles' clock, from sim_step after each step's contacts:
 * with no vehicle it is an integer add and a count handed over. The pose a
 * step ahead becomes the pose at the clock, so a step works out one new pose
 * a car, and every pose is still the pose function's own. */
void world_tick(void) {
  g_clock += 1;
  g_nvc = g_nvc_found;
  g_nvc_found = 0;
  if (g_nveh == 0) {
    return;
  }
  for (int m = 0; m < WORLD_MAX_MOVERS; m += 1) {
    Mover *mv = &g_mover[m];
    if (mv->veh) {
      mv->prev = mv->cur;
      mv->cur = mv->nxt;
      vehicle_pose(mv, g_clock + 1, &mv->nxt);
      vehicle_turn(&mv->cur, &mv->nxt);
    }
  }
}

/* The car's own frame: origin at the road point under its centre, x along
 * its heading, z up. A heading about the vertical only, so z passes. */
static void veh_in(const Pose *P, const double w[3], double out[3]) {
  const double dx = w[0] - P->p[0];
  const double dy = w[1] - P->p[1];
  out[0] = P->h[0] * dx + P->h[1] * dy;
  out[1] = -P->h[1] * dx + P->h[0] * dy;
  out[2] = w[2] - P->p[2];
}

static void veh_dir_in(const Pose *P, const double w[3], double out[3]) {
  out[0] = P->h[0] * w[0] + P->h[1] * w[1];
  out[1] = -P->h[1] * w[0] + P->h[0] * w[1];
  out[2] = w[2];
}

static void veh_dir_out(const Pose *P, const double l[3], double out[3]) {
  out[0] = P->h[0] * l[0] - P->h[1] * l[1];
  out[1] = P->h[1] * l[0] + P->h[0] * l[1];
  out[2] = l[2];
}

/* The car's surface velocity at world point w: its origin's velocity, plus
 * the rate its heading turns over the step (vehicle_turn) across the lever
 * arm from that origin. */
static void veh_surface(const Pose *P, const double w[3], double out[3]) {
  out[0] = P->vel[0] - P->omega * (w[1] - P->p[1]);
  out[1] = P->vel[1] + P->omega * (w[0] - P->p[0]);
  out[2] = P->vel[2];
}

/*
 * The craft against road vehicle m, in the vehicle's own frame. The hull,
 * the lens and the prop points are turned into it, the box test is the one
 * every box has (obb_vs_box, sphere_in_box, point_in_box, unchanged), and
 * each contact is turned back with the car's surface velocity where it
 * touches. A car is never ground (plan section 8): its faces are never
 * merged with the plane the plant stands the craft on, and world_select_support
 * never offers one, so a craft on a car's roof is held only by friction.
 */
static int vehicle_contacts(int nc, int m, const Obb *o, const double cg[3], double reach,
                            const double lens[3], double lens_r, int prev_ok, int exposed,
                            const double prop_pts[][PROP_RIM + 1][3], double prop_depth[],
                            double prop_n[][3], double prop_e[], double prop_vs[][3],
                            int prop_shape[], const double gn[3], double gd) {
  const Mover *mv = &g_mover[m];
  const Pose *P = &mv->cur;
  /* The cheap reject first: the car's bounding sphere against the craft's
   * reach, squared, so a car across the map costs a few multiplies. Written
   * as "not within", so a pose that is not a number is skipped and never
   * reaches the craft. */
  const double bx = cg[0] - P->p[0];
  const double by = cg[1] - P->p[1];
  const double bz = cg[2] - (P->p[2] + mv->zc);
  const double rr = reach + mv->rad;
  if (!(bx * bx + by * by + bz * bz <= rr * rr)) {
    return nc;
  }
  const int shape = -2 - m;
  const double zero[3] = { 0.0, 0.0, 0.0 };
  Obb ol;
  veh_in(P, o->c, ol.c);
  for (int j = 0; j < 3; j += 1) {
    const double col[3] = { o->R[0][j], o->R[1][j], o->R[2][j] };
    double lc[3];
    veh_dir_in(P, col, lc);
    ol.R[0][j] = lc[0];
    ol.R[1][j] = lc[1];
    ol.R[2][j] = lc[2];
    ol.h[j] = o->h[j];
  }
  const int nc0 = nc;
  nc = obb_vs_box(nc, &ol, mv->lo, mv->hi, mv->e, mv->mu, zero, shape, 0, gn, gd);
  double ll[3];
  double lprev[3];
  veh_in(P, lens, ll);
  if (prev_ok) {
    veh_in(&mv->prev, g_prev_lens, lprev);
  }
  double ln[3];
  double lp[3];
  const double ld = sphere_in_box(ll, lens_r, prev_ok ? lprev : 0, mv->lo, mv->hi, ln, lp);
  if (ld > 0.0) {
    nc = push_contact(nc, ln, lp, ld, mv->e, mv->mu, zero, shape, 1, -1);
  }
  for (int c = nc0; c < nc; c += 1) {
    Contact *ct = &g_con[c];
    double n[3];
    double p[3];
    veh_dir_out(P, ct->n, n);
    veh_dir_out(P, ct->p, p);
    for (int a = 0; a < 3; a += 1) {
      ct->n[a] = n[a];
      ct->p[a] = p[a] + P->p[a];
    }
    veh_surface(P, ct->p, ct->vs);
  }
  if (exposed) {
    for (int k = 0; k < SIM_MOTOR_COUNT; k += 1) {
      for (int q = 0; q <= PROP_RIM; q += 1) {
        double ql[3];
        double qprev[3];
        double pn[3];
        veh_in(P, prop_pts[k][q], ql);
        if (prev_ok) {
          veh_in(&mv->prev, g_prev_prop[k][q], qprev);
        }
        const double pd = point_in_box(ql, prev_ok ? qprev : 0, mv->lo, mv->hi, pn);
        if (pd > prop_depth[k]) {
          prop_depth[k] = pd;
          veh_dir_out(P, pn, prop_n[k]);
          prop_e[k] = 0.0;
          veh_surface(P, prop_pts[k][q], prop_vs[k]);
          prop_shape[k] = shape;
        }
      }
    }
  }
  return nc;
}

static int props_exposed(void) {
  /* A duct IS the hull: when the hull box already reaches past every disc,
   * the props cannot touch anything the hull does not touch first. */
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    const double ax = absd(PLANT.pos_x[m]) + PLANT.prop_r;
    const double ay = absd(PLANT.pos_y[m]) + PLANT.prop_r;
    if (ax > PLANT.hull_hx + 1e-9 || ay > PLANT.hull_hy + 1e-9) {
      return 1;
    }
  }
  return 0;
}

/*
 * Contacts against the world, for one 1 ms step.
 */
void world_step(SimState *s, int ground_on, const double gn[3], double gd) {
  if (!world_active()) {
    return;
  }
  double cg[3];
  plant_to_world_pos(s->pos, cg);
  Obb o;
  body_axes_world(s, o.R);
  const double hzh = 0.5 * (PLANT.hull_hz_up + PLANT.hull_hz_down);
  const double hzo = 0.5 * (PLANT.hull_hz_up - PLANT.hull_hz_down);
  o.h[0] = PLANT.hull_hx;
  o.h[1] = PLANT.hull_hy;
  o.h[2] = hzh;
  const double off[3] = { 0.0, 0.0, hzo };
  body_to_world_point(cg, o.R, off, o.c);

  /* Everything the craft can reach, as one sphere about the CG. */
  double reach = sim_sqrt(PLANT.hull_hx * PLANT.hull_hx + PLANT.hull_hy * PLANT.hull_hy
                          + PLANT.hull_hz_down * PLANT.hull_hz_down + PLANT.hull_hz_up * PLANT.hull_hz_up);
  const int exposed = props_exposed();
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    const double pr = sim_sqrt(PLANT.pos_x[m] * PLANT.pos_x[m] + PLANT.pos_y[m] * PLANT.pos_y[m]
                               + PLANT.pos_z[m] * PLANT.pos_z[m]) + PLANT.prop_r;
    reach = pr > reach ? pr : reach;
  }
  const double lens_r = LENS_R_FRAC * PLANT.hull_hx;
  const double lens_b[3] = { PLANT.camera_x, PLANT.camera_y, PLANT.camera_z };
  const double lr = sim_sqrt(dot3(lens_b, lens_b)) + lens_r;
  reach = lr > reach ? lr : reach;
  reach += 0.05;

  int ncand = world_gather(cg[0] - reach, cg[1] - reach, cg[0] + reach, cg[1] + reach);

  double lens[3];
  body_to_world_point(cg, o.R, lens_b, lens);
  double prop_pts[SIM_MOTOR_COUNT][PROP_RIM + 1][3];
  if (exposed) {
    for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
      for (int k = 0; k <= PROP_RIM; k += 1) {
        double bp[3] = { PLANT.pos_x[m], PLANT.pos_y[m], PLANT.pos_z[m] };
        if (k < PROP_RIM) {
          bp[0] += PLANT.prop_r * RIM_C[k];
          bp[1] += PLANT.prop_r * RIM_S[k];
        }
        body_to_world_point(cg, o.R, bp, prop_pts[m][k]);
      }
    }
  }
  /* A step that moved a point further than any craft can fly in a
   * millisecond was a teleport: its previous point is no evidence. */
  int prev_ok = g_prev_ok;
  if (prev_ok) {
    const double dl[3] = { lens[0] - g_prev_lens[0], lens[1] - g_prev_lens[1], lens[2] - g_prev_lens[2] };
    if (dot3(dl, dl) > 0.25) {
      prev_ok = 0;
    }
  }

  int nc = 0;
  double prop_depth[SIM_MOTOR_COUNT] = { 0.0, 0.0, 0.0, 0.0 };
  double prop_n[SIM_MOTOR_COUNT][3];
  double prop_e[SIM_MOTOR_COUNT];
  double prop_vs[SIM_MOTOR_COUNT][3];
  int prop_shape[SIM_MOTOR_COUNT] = { -1, -1, -1, -1 };
  const double zero[3] = { 0.0, 0.0, 0.0 };

  /* Shapes first, then movers, with one body of code: a mover is a box with
   * a surface velocity. */
  for (int k = 0; k < ncand + WORLD_MAX_MOVERS; k += 1) {
    const double *lo;
    const double *hi;
    const double *vs = zero;
    double e;
    double mu;
    int type;
    int shape;
    const Shape *sh = 0;
    if (k < ncand) {
      shape = g_cand[k];
      if (shape == g_support) {
        continue;
      }
      sh = &g_shape[shape];
      lo = sh->lo;
      hi = sh->hi;
      e = sh->e;
      mu = sh->mu;
      type = sh->type;
    } else {
      const int m = k - ncand;
      if (!g_mover[m].on) {
        continue;
      }
      if (g_mover[m].veh) {
        /* A road vehicle has a heading, so it is met in its own frame. */
        nc = vehicle_contacts(nc, m, &o, cg, reach, lens, lens_r, prev_ok, exposed,
                              (const double (*)[PROP_RIM + 1][3])prop_pts, prop_depth, prop_n,
                              prop_e, prop_vs, prop_shape, gn, gd);
        continue;
      }
      shape = -2 - m;
      lo = g_mover[m].lo;
      hi = g_mover[m].hi;
      vs = g_mover[m].v;
      e = g_mover[m].e;
      mu = g_mover[m].mu;
      type = SHAPE_BOX;
    }
    /* A cheap reject on the reach sphere's box. */
    if (lo[0] > cg[0] + reach || hi[0] < cg[0] - reach || lo[1] > cg[1] + reach
        || hi[1] < cg[1] - reach || lo[2] > cg[2] + reach || hi[2] < cg[2] - reach) {
      continue;
    }
    if (type == SHAPE_BOX) {
      nc = obb_vs_box(nc, &o, lo, hi, e, mu, vs, shape, ground_on, gn, gd);
      double ln[3];
      double lp[3];
      const double ld = sphere_in_box(lens, lens_r, prev_ok ? g_prev_lens : 0, lo, hi, ln, lp);
      if (ld > 0.0 && !on_ground_plane(ln, hi[2], lp, ground_on, gn, gd)) {
        nc = push_contact(nc, ln, lp, ld, e, mu, vs, shape, 1, -1);
      }
    } else {
      nc = obb_vs_capsule(nc, &o, sh, shape, ground_on, gn, gd);
      double ln[3];
      const double ld = point_in_capsule(lens, sh, ln);
      if (ld > 0.0) {
        nc = push_contact(nc, ln, lens, ld, e, mu, vs, shape, 1, -1);
      }
    }
    if (exposed) {
      for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
        for (int q = 0; q <= PROP_RIM; q += 1) {
          double pn[3];
          double pd;
          if (type == SHAPE_BOX) {
            pd = point_in_box(prop_pts[m][q], prev_ok ? g_prev_prop[m][q] : 0, lo, hi, pn);
            if (pd > 0.0 && on_ground_plane(pn, hi[2], prop_pts[m][q], ground_on, gn, gd)) {
              pd = 0.0;
            }
          } else {
            pd = point_in_capsule(prop_pts[m][q], sh, pn);
          }
          if (pd > prop_depth[m]) {
            prop_depth[m] = pd;
            prop_n[m][0] = pn[0];
            prop_n[m][1] = pn[1];
            prop_n[m][2] = pn[2];
            prop_e[m] = 0.0;
            prop_vs[m][0] = vs[0];
            prop_vs[m][1] = vs[1];
            prop_vs[m][2] = vs[2];
            prop_shape[m] = shape;
          }
        }
      }
    }
  }
  if (exposed) {
    for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
      if (prop_depth[m] > 0.0) {
        /* The hub, not the blade: that is where the shove reaches the frame. */
        nc = push_contact(nc, prop_n[m], prop_pts[m][PROP_RIM], prop_depth[m], prop_e[m],
                          PROP_MU, prop_vs[m], prop_shape[m], 2, m);
      }
    }
  }

  /* Keep the contacts against road vehicles for sim_world_vehicle_contacts,
   * as they go into the solve. Only written, so no run is changed by it. */
  if (g_nveh > 0) {
    for (int c = 0; c < nc; c += 1) {
      const Contact *ct = &g_con[c];
      if (ct->shape > -2 || !g_mover[-2 - ct->shape].veh) {
        continue;
      }
      double *o = g_vc[g_nvc_found];
      o[0] = (double)(-2 - ct->shape);
      o[1] = (double)ct->kind;
      for (int a = 0; a < 3; a += 1) {
        o[2 + a] = ct->p[a];
        o[5 + a] = ct->n[a];
        o[8 + a] = ct->vs[a];
      }
      o[11] = ct->depth;
      g_nvc_found += 1;
    }
  }

  /* Remember where the points were, for the face they come in through. */
  g_prev_lens[0] = lens[0];
  g_prev_lens[1] = lens[1];
  g_prev_lens[2] = lens[2];
  if (exposed) {
    for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
      for (int q = 0; q <= PROP_RIM; q += 1) {
        g_prev_prop[m][q][0] = prop_pts[m][q][0];
        g_prev_prop[m][q][1] = prop_pts[m][q][1];
        g_prev_prop[m][q][2] = prop_pts[m][q][2];
      }
    }
  }
  g_prev_ok = 1;

  /* Is the thrust axis held into a face this step? */
  int press_now = 0;
  const double thrust[3] = { o.R[0][2], o.R[1][2], o.R[2][2] };
  for (int c = 0; c < nc; c += 1) {
    if (dot3(g_con[c].n, thrust) <= -PRESS_UP_DOT) {
      press_now = 1;
      break;
    }
  }
  if (press_now) {
    g_press_idle = 0;
    g_pressing = 1;
  } else if (g_pressing) {
    g_press_idle += 1;
    if (g_press_idle > PRESS_RELEASE_MS) {
      g_pressing = 0;
      g_press_held = 0;
      g_press_idle = 0;
    }
  }
  if (g_pressing) {
    g_press_held += 1;
    if (g_press_held >= PRESS_CONFIRM_MS && !bridge_crashflip_active()) {
      for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
        s->motor_omega[m] *= 1.0 - PRESS_BLEED_MS;
      }
    }
  }

  if (nc == 0) {
    return;
  }

  /* Closing speed at each contact, before anything is applied, in the
   * plant frame the impulse works in. */
  const double v0[3] = { s->vel[0], s->vel[1], s->vel[2] };
  double w_world_p[3];
  {
    /* Body rates to plant axes. */
    const double qw = s->quat[0];
    const double qx = s->quat[1];
    const double qy = s->quat[2];
    const double qz = s->quat[3];
    const double *v = s->omega;
    const double ux = 2.0 * (qy * v[2] - qz * v[1]);
    const double uy = 2.0 * (qz * v[0] - qx * v[2]);
    const double uz = 2.0 * (qx * v[1] - qy * v[0]);
    w_world_p[0] = v[0] + qw * ux + (qy * uz - qz * uy);
    w_world_p[1] = v[1] + qw * uy + (qz * ux - qx * uz);
    w_world_p[2] = v[2] + qw * uz + (qx * uy - qy * ux);
  }
  double closing_max = 0.0;
  double prop_closing[SIM_MOTOR_COUNT] = { 0.0, 0.0, 0.0, 0.0 };
  int strongest = 0;
  double deepest = 0.0;
  int any_prop = 0;
  int any_frame = 0;
  double np_[WORLD_MAX_CONTACTS][3];
  double rp_[WORLD_MAX_CONTACTS][3];
  double vsp_[WORLD_MAX_CONTACTS][3];
  for (int c = 0; c < nc; c += 1) {
    const Contact *ct = &g_con[c];
    world_to_plant_dir(ct->n, np_[c]);
    const double rw[3] = { ct->p[0] - cg[0], ct->p[1] - cg[1], ct->p[2] - cg[2] };
    world_to_plant_dir(rw, rp_[c]);
    world_to_plant_dir(ct->vs, vsp_[c]);
    const double *r = rp_[c];
    const double vp[3] = {
      v0[0] + (w_world_p[1] * r[2] - w_world_p[2] * r[1]) - vsp_[c][0],
      v0[1] + (w_world_p[2] * r[0] - w_world_p[0] * r[2]) - vsp_[c][1],
      v0[2] + (w_world_p[0] * r[1] - w_world_p[1] * r[0]) - vsp_[c][2],
    };
    const double vin = -dot3(vp, np_[c]);
    if (vin > closing_max) {
      closing_max = vin;
      strongest = c;
    }
    if (ct->depth > deepest) {
      deepest = ct->depth;
      if (closing_max <= 0.0) {
        strongest = c;
      }
    }
    if (ct->kind == 2) {
      any_prop = 1;
      if (vin > prop_closing[ct->motor]) {
        prop_closing[ct->motor] = vin;
      }
    } else {
      any_frame = 1;
    }
  }

  world_solve(s, nc, np_, rp_, vsp_);

  /* Out of the solid, translation only, one shape at a time along its own
   * deepest normal: the ground projector's rule, capped per step. */
  for (int c = 0; c < nc; c += 1) {
    const Contact *ct = &g_con[c];
    if (ct->kind == 2) {
      continue;
    }
    /* Only the deepest contact of each shape moves the craft. */
    int deepest_of_shape = 1;
    for (int c2 = 0; c2 < nc; c2 += 1) {
      if (c2 != c && g_con[c2].shape == ct->shape && g_con[c2].kind != 2
          && (g_con[c2].depth > ct->depth || (g_con[c2].depth == ct->depth && c2 < c))) {
        deepest_of_shape = 0;
        break;
      }
    }
    if (!deepest_of_shape) {
      continue;
    }
    double push = ct->depth - WORLD_SLOP;
    if (!(push > 0.0)) {
      continue;
    }
    push = push > WORLD_PROJECT_MAX ? WORLD_PROJECT_MAX : push;
    const double *n = np_[c];
    s->pos[0] += n[0] * push;
    s->pos[1] += n[1] * push;
    s->pos[2] += n[2] * push;
    if (ct->depth > WORLD_BURIED) {
      const double vn = s->vel[0] * n[0] + s->vel[1] * n[1] + s->vel[2] * n[2]
          - (vsp_[c][0] * n[0] + vsp_[c][1] * n[1] + vsp_[c][2] * n[2]);
      if (vn < 0.0) {
        s->vel[0] -= n[0] * vn;
        s->vel[1] -= n[1] * vn;
        s->vel[2] -= n[2] * vn;
      }
    }
  }

  /* Soft props: the strike, and the rub. */
  if (any_prop) {
    for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
      if (!(prop_depth[m] > 0.0)) {
        continue;
      }
      double sev = PROP_STRIKE_K * prop_closing[m];
      sev = sev > PROP_STRIKE_MAX ? PROP_STRIKE_MAX : sev;
      sev += PROP_RUB;
      sev = sev > 1.0 ? 1.0 : sev;
      s->motor_omega[m] *= 1.0 - sev;
    }
  }

  const double dv[3] = { s->vel[0] - v0[0], s->vel[1] - v0[1], s->vel[2] - v0[2] };
  const double dvm = sim_sqrt(dot3(dv, dv));
  g_rep_steps += 1.0;
  if (any_prop) {
    g_rep_props += 1.0;
  }
  if (any_frame) {
    g_rep_frame += 1.0;
  }
  if (deepest > g_rep_depth) {
    g_rep_depth = deepest;
  }
  if (closing_max > g_rep_closing) {
    g_rep_closing = closing_max;
  }
  if (dvm >= g_rep_dv) {
    g_rep_dv = dvm;
    g_rep_index = (double)g_con[strongest].shape;
    g_rep_n[0] = g_con[strongest].n[0];
    g_rep_n[1] = g_con[strongest].n[1];
    g_rep_n[2] = g_con[strongest].n[2];
  }
}
