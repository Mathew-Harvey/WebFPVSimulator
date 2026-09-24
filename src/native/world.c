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
#define WORLD_MAX_MOVERS 16
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
 * every millisecond. */
#define PROP_MU 0.12
#define PROP_STRIKE_K 0.06
#define PROP_STRIKE_MAX 0.70
#define PROP_RUB 0.02
#define PROP_RIM 12

/* The lens bumper, as a fraction of the hull's half width: 19 mm on the five
 * inch, 8 mm on the whoop. */
#define LENS_R_FRAC 0.2

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

typedef struct {
  double lo[3];
  double hi[3];
  double v[3];
  double e;
  double mu;
  int on;
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

/* Empty the world. Shapes, movers and the grid all go. */
SIM_EXPORT int sim_world_clear(void) {
  g_nshape = 0;
  g_built = 0;
  g_gnx = 0;
  g_gny = 0;
  g_support = -1;
  g_prev_ok = 0;
  for (int m = 0; m < WORLD_MAX_MOVERS; m += 1) {
    g_mover[m].on = 0;
  }
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
 * Contacts against the world, for one 1 ms step. apply is sim.c's impulse
 * (contact_impulse), which the ground solver uses too.
 */
void world_step(SimState *s, int ground_on, const double gn[3], double gd,
                int (*apply)(const double n[3], const double r[3], const double vs[3],
                             double e, double mu, double pen)) {
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

  /* Sequential impulses, the ground solver's own iteration count. */
  for (int it = 0; it < 4; it += 1) {
    int any = 0;
    for (int c = 0; c < nc; c += 1) {
      const Contact *ct = &g_con[c];
      double pen = ct->depth;
      if (ct->kind == 2) {
        /* A blade is not a wall: it bends before it pushes. Only what is
         * past half the disc's radius is owed a correction. */
        pen = ct->depth - 0.5 * PLANT.prop_r;
        pen = pen < 0.0 ? 0.0 : pen;
      }
      if (apply(np_[c], rp_[c], vsp_[c], ct->e, ct->mu, pen)) {
        any = 1;
      }
    }
    if (!any) {
      break;
    }
  }

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
