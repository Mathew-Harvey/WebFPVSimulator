/*
 * sim.c: Stage 1 physics module entry points and the fixed-step driver.
 *
 * The module is one deterministic unit stepped at exactly 1000 Hz. Input
 * samples carry their own timestamps and are consumed by that timestamp:
 * a sample is applied before the 1 ms step containing it executes, never
 * by arrival time. How the host batches sim_step calls cannot affect the
 * trajectory; there is no frame time anywhere in this file.
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

#define INPUT_QUEUE_CAP 8192

typedef struct {
  long long t_us;
  double ch[4]; /* roll, pitch, yaw, throttle */
} InputSample;

static SimState S;
static int g_initialised = 0;
static double g_current_rc[4] = { 0.0, 0.0, 0.0, 0.0 };
static double g_override[SIM_MOTOR_COUNT] = { -1.0, -1.0, -1.0, -1.0 };
static InputSample g_queue[INPUT_QUEUE_CAP];
static int g_q_head = 0;
static int g_q_tail = 0;
static long long g_last_input_us = -1;
static int g_stand_on = 0;
static double g_stand_hinge[3];
/* Underside of the parked pose, metres below the CG. Matches REST_HEIGHT
 * in the shell so the hinge sits on the foam, not in the air above it. */
static const double STAND_HINGE_Z = -0.045;

/*
 * Ground plane, plant frame. Off unless the shell raises it, so a harness
 * replay that never calls sim_set_ground cannot see a floor.
 *
 * The hull is an OBB around the 5 inch airframe. Half extents in x and y
 * are the motor offset plus a motor-bell radius, so a side arrival contacts
 * an arm, not empty air. Down is REST_HEIGHT so a level craft at plant z = 0
 * sits on a plane at z = -0.045, matching the parked pose. Up is the prop
 * disc / camera stack, which is what an inverted craft rests on.
 */
static int g_ground_on = 0;
static double g_ground_n[3] = { 0.0, 0.0, 1.0 };
static double g_ground_d = STAND_HINGE_Z;
static double g_ground_mu = 1.40;
static double g_ground_e = 0.0;
static int g_ground_hits = 0;
static int g_ground_projected = 0;
static int g_ground_near = 0;

#define CONTACT_HX 0.094
#define CONTACT_HY 0.094
#define CONTACT_HZ_DOWN 0.045
#define CONTACT_HZ_UP 0.038
#define CONTACT_CORNERS 8
#define CONTACT_ITERS 4
#define CONTACT_SLOP 0.002
#define CONTACT_BAUMGARTE 0.15
#define CONTACT_REST_VN 0.25
#define CONTACT_E_SPEED 14.0
#define CONTACT_STATIC_VT 0.08
#define CONTACT_BIAS_MAX 1.2
#define CONTACT_POS_PUSH 0.20
/* Lens glass, plant body metres. Mount is 0.080 forward and 0.018 up;
 * herocraft.js puts the glass another 0.024 past the mount. The hull
 * OBB stops at 0.094, so a nose-down arrival used to park the lens
 * under the plane. Projection samples this point too. */
#define CAMERA_BODY_X 0.104
#define CAMERA_BODY_Y 0.0
#define CAMERA_BODY_Z 0.018
#define CONTACT_INVERT_UPZ -0.50
/* Halo invert-stop is props-down only. A roll or flip that is only
 * partly inverted can put a corner in the 8 mm slab with the CG still
 * a decimetre up; that must not freeze. */
#define CONTACT_INVERT_HALO_UPZ -0.90
#define CONTACT_SLIDE_KEEP 0.970
#define CONTACT_OMEGA_KEEP 0.920
#define CONTACT_SLIDE_STOP 0.12
#define CONTACT_OMEGA_STOP 0.35
#define CONTACT_NEAR 0.008
/* Inbound normal faster than this in the 8 mm halo is a live arrival,
 * not a seated props-down slide. Invert-stop on near-only used to
 * freeze a flip the moment a corner entered that slab, with the CG
 * still a decimetre up and hits still 0. */
#define CONTACT_INVERT_DIVE 0.20
/* Deepest-pen sentinel. Must be a large negative: starting at 0 made
 * every airborne hull look "near" the plane (worst stayed 0), so an
 * inverted flip in free air ran invert-stop and froze the craft. */
#define CONTACT_PEN_NONE (-1.0e9)

static const double CONTACT_CORNER[CONTACT_CORNERS][3] = {
  { -CONTACT_HX, -CONTACT_HY, -CONTACT_HZ_DOWN },
  {  CONTACT_HX, -CONTACT_HY, -CONTACT_HZ_DOWN },
  { -CONTACT_HX,  CONTACT_HY, -CONTACT_HZ_DOWN },
  {  CONTACT_HX,  CONTACT_HY, -CONTACT_HZ_DOWN },
  { -CONTACT_HX, -CONTACT_HY,  CONTACT_HZ_UP },
  {  CONTACT_HX, -CONTACT_HY,  CONTACT_HZ_UP },
  { -CONTACT_HX,  CONTACT_HY,  CONTACT_HZ_UP },
  {  CONTACT_HX,  CONTACT_HY,  CONTACT_HZ_UP },
};

SIM_EXPORT int sim_abi_version(void) { return SIM_ABI_VERSION; }

static void reset_dynamics(void) {
  plant_reset(&S);
  bridge_reset();
  g_q_head = 0;
  g_q_tail = 0;
  g_last_input_us = -1;
  for (int i = 0; i < 4; i += 1) {
    g_current_rc[i] = 0.0;
  }
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    g_override[m] = -1.0;
  }
  g_stand_on = 0;
  g_ground_on = 0;
  g_ground_hits = 0;
  g_ground_projected = 0;
  g_ground_near = 0;
}

SIM_EXPORT int sim_init(const unsigned char *diff_utf8, int len) {
  if (diff_utf8 == 0 || len < 0) {
    return SIM_ERR_BAD_ARG;
  }
  const int rc = bridge_parse_config(diff_utf8, len);
  if (rc != SIM_OK) {
    return rc;
  }
  if (!g_initialised) {
    S.cell_voltage_oc = 4.2;
  }
  g_initialised = 1;
  reset_dynamics();
  return SIM_OK;
}

SIM_EXPORT int sim_reset(void) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  reset_dynamics();
  return SIM_OK;
}

SIM_EXPORT int sim_set_cell_voltage(double volts) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!(volts > 0.5) || !(volts < 5.0)) {
    return SIM_ERR_BAD_ARG;
  }
  S.cell_voltage_oc = volts;
  return SIM_OK;
}

SIM_EXPORT int sim_input(double t_seconds, double roll, double pitch, double yaw,
                         double throttle) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!(t_seconds >= 0.0)) {
    return SIM_ERR_BAD_ARG;
  }
  const long long t_us = (long long)(t_seconds * 1e6 + 0.5);
  if (t_us < g_last_input_us) {
    return SIM_ERR_BAD_ARG;
  }
  const int next = (g_q_tail + 1) % INPUT_QUEUE_CAP;
  if (next == g_q_head) {
    return SIM_ERR_BAD_STATE;
  }
  g_queue[g_q_tail].t_us = t_us;
  g_queue[g_q_tail].ch[0] = roll;
  g_queue[g_q_tail].ch[1] = pitch;
  g_queue[g_q_tail].ch[2] = yaw;
  g_queue[g_q_tail].ch[3] = throttle;
  g_q_tail = next;
  g_last_input_us = t_us;
  return SIM_OK;
}

SIM_EXPORT int sim_rest(void) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  for (int i = 0; i < 3; i += 1) {
    S.vel[i] = 0.0;
    S.omega[i] = 0.0;
  }
  return SIM_OK;
}

/* IEEE NaN and Inf without math.h: NaN != NaN, Inf - Inf is NaN. */
static int sim_finite(double x) {
  return x == x && x - x == 0.0;
}

/* Body vector to world, plant quaternion. */
static void contact_rotate(const double v[3], double out[3]) {
  const double w = S.quat[0];
  const double x = S.quat[1];
  const double y = S.quat[2];
  const double z = S.quat[3];
  const double ux = 2.0 * (y * v[2] - z * v[1]);
  const double uy = 2.0 * (z * v[0] - x * v[2]);
  const double uz = 2.0 * (x * v[1] - y * v[0]);
  out[0] = v[0] + w * ux + (y * uz - z * uy);
  out[1] = v[1] + w * uy + (z * ux - x * uz);
  out[2] = v[2] + w * uz + (x * uy - y * ux);
}

/* World vector to body: conjugate rotation. */
static void contact_rotate_inv(const double v[3], double out[3]) {
  const double w = S.quat[0];
  const double x = -S.quat[1];
  const double y = -S.quat[2];
  const double z = -S.quat[3];
  const double ux = 2.0 * (y * v[2] - z * v[1]);
  const double uy = 2.0 * (z * v[0] - x * v[2]);
  const double uz = 2.0 * (x * v[1] - y * v[0]);
  out[0] = v[0] + w * ux + (y * uz - z * uy);
  out[1] = v[1] + w * uy + (z * ux - x * uz);
  out[2] = v[2] + w * uz + (x * uy - y * ux);
}

/* I_world^{-1} * v, diagonal inertia in the body frame. */
static void contact_iinv(const double v_world[3], double out[3]) {
  double b[3];
  contact_rotate_inv(v_world, b);
  b[0] /= PLANT.inertia[0];
  b[1] /= PLANT.inertia[1];
  b[2] /= PLANT.inertia[2];
  contact_rotate(b, out);
}

/*
 * One rigid-body impulse at offset r from the CG, against unit normal n
 * (out of the solid) and surface velocity vs. pen is positive penetration.
 * Returns 1 if an impulse was applied.
 *
 * Sequential Coulomb, Baraff's form: the normal impulse uses the effective
 * mass along n including the angular term, so a hit on an arm produces
 * spin instead of a point-mass bounce. Restitution falls with closing
 * speed so a crash dumps energy and a skip still skips. Friction cancels
 * as much tangent speed as mu * jn allows, which is a slide when it
 * saturates and a stick when it does not.
 */
static int contact_impulse(const double n[3], const double r[3], const double vs[3],
                           double e, double mu, double pen) {
  double w_world[3];
  contact_rotate(S.omega, w_world);

  double vp[3];
  vp[0] = S.vel[0] + (w_world[1] * r[2] - w_world[2] * r[1]) - vs[0];
  vp[1] = S.vel[1] + (w_world[2] * r[0] - w_world[0] * r[2]) - vs[1];
  vp[2] = S.vel[2] + (w_world[0] * r[1] - w_world[1] * r[0]) - vs[2];

  const double vn = vp[0] * n[0] + vp[1] * n[1] + vp[2] * n[2];
  if (vn >= 0.0 && !(pen > CONTACT_SLOP)) {
    return 0;
  }

  double rn[3];
  rn[0] = r[1] * n[2] - r[2] * n[1];
  rn[1] = r[2] * n[0] - r[0] * n[2];
  rn[2] = r[0] * n[1] - r[1] * n[0];
  double irn[3];
  contact_iinv(rn, irn);
  const double kn = 1.0 / PLANT.mass_kg
      + (rn[0] * irn[0] + rn[1] * irn[1] + rn[2] * irn[2]);
  if (kn < 1e-12) {
    return 0;
  }

  double e_used = e;
  if (vn > -CONTACT_REST_VN) {
    e_used = 0.0;
  } else {
    double fall = 1.0 + vn / CONTACT_E_SPEED;
    if (fall < 0.05) {
      fall = 0.05;
    }
    if (fall > 1.0) {
      fall = 1.0;
    }
    e_used = e * fall;
  }

  double bias = 0.0;
  if (pen > CONTACT_SLOP) {
    bias = CONTACT_BAUMGARTE * (pen - CONTACT_SLOP) / SIM_DT;
    if (bias > CONTACT_BIAS_MAX) {
      bias = CONTACT_BIAS_MAX;
    }
  }

  const double vn_in = vn < 0.0 ? vn : 0.0;
  const double vn_target = -e_used * vn_in + bias;
  double jn = (vn_target - vn) / kn;
  if (jn < 0.0) {
    return 0;
  }

  double jt[3] = { 0.0, 0.0, 0.0 };
  const double vtx = vp[0] - vn * n[0];
  const double vty = vp[1] - vn * n[1];
  const double vtz = vp[2] - vn * n[2];
  const double vt2 = vtx * vtx + vty * vty + vtz * vtz;
  if (vt2 > 1e-16 && mu > 0.0) {
    const double vtm = sim_sqrt(vt2);
    const double tx = vtx / vtm;
    const double ty = vty / vtm;
    const double tz = vtz / vtm;
    double rt[3];
    rt[0] = r[1] * tz - r[2] * ty;
    rt[1] = r[2] * tx - r[0] * tz;
    rt[2] = r[0] * ty - r[1] * tx;
    double irt[3];
    contact_iinv(rt, irt);
    const double kt = 1.0 / PLANT.mass_kg
        + (rt[0] * irt[0] + rt[1] * irt[1] + rt[2] * irt[2]);
    if (kt > 1e-12) {
      double jtm = -vtm / kt;
      const double mu_use = (vtm < CONTACT_STATIC_VT) ? mu * 1.15 : mu;
      const double jmax = mu_use * jn;
      if (jtm < -jmax) {
        jtm = -jmax;
      }
      if (jtm > jmax) {
        jtm = jmax;
      }
      jt[0] = jtm * tx;
      jt[1] = jtm * ty;
      jt[2] = jtm * tz;
    }
  }

  const double Jx = jn * n[0] + jt[0];
  const double Jy = jn * n[1] + jt[1];
  const double Jz = jn * n[2] + jt[2];
  const double invm = 1.0 / PLANT.mass_kg;
  S.vel[0] += Jx * invm;
  S.vel[1] += Jy * invm;
  S.vel[2] += Jz * invm;

  double tau[3];
  tau[0] = r[1] * Jz - r[2] * Jy;
  tau[1] = r[2] * Jx - r[0] * Jz;
  tau[2] = r[0] * Jy - r[1] * Jx;
  double dw[3];
  contact_iinv(tau, dw);
  w_world[0] += dw[0];
  w_world[1] += dw[1];
  w_world[2] += dw[2];
  contact_rotate_inv(w_world, S.omega);
  return 1;
}

static void contact_support_neg_n(const double n[3], double r[3]) {
  /* Supporting vertex of the OBB in the -n direction: the hull point that
   * meets a surface with outward normal n. */
  double nb[3];
  const double inn[3] = { -n[0], -n[1], -n[2] };
  contact_rotate_inv(inn, nb);
  double b[3];
  b[0] = nb[0] >= 0.0 ? CONTACT_HX : -CONTACT_HX;
  b[1] = nb[1] >= 0.0 ? CONTACT_HY : -CONTACT_HY;
  b[2] = nb[2] >= 0.0 ? CONTACT_HZ_UP : -CONTACT_HZ_DOWN;
  contact_rotate(b, r);
}

static int contact_unit3(double nx, double ny, double nz, double n[3]) {
  const double n2 = nx * nx + ny * ny + nz * nz;
  if (!(n2 > 0.97) || !(n2 < 1.03)) {
    return 0;
  }
  const double inv = 1.0 / sim_sqrt(n2);
  n[0] = nx * inv;
  n[1] = ny * inv;
  n[2] = nz * inv;
  return 1;
}

/* One hull point against the ground plane. Returns 1 if that point is in
 * the contact band (impulse may or may not have been applied). */
static int ground_hit_at(const double r[3], const double vs[3]) {
  const double px = S.pos[0] + r[0];
  const double py = S.pos[1] + r[1];
  const double pz = S.pos[2] + r[2];
  const double side = g_ground_n[0] * px + g_ground_n[1] * py + g_ground_n[2] * pz;
  const double pen = g_ground_d - side;
  if (!(pen > -CONTACT_SLOP)) {
    return 0;
  }
  const double use_p = pen > 0.0 ? pen : 0.0;
  contact_impulse(g_ground_n, r, vs, g_ground_e, g_ground_mu, use_p);
  if (pen > CONTACT_SLOP) {
    const double push = (pen - CONTACT_SLOP) * CONTACT_POS_PUSH;
    S.pos[0] += g_ground_n[0] * push;
    S.pos[1] += g_ground_n[1] * push;
    S.pos[2] += g_ground_n[2] * push;
  }
  return 1;
}

/*
 * After the impulses, no hull sample may stay below the plane. A single
 * support (turtle, a roll) leaves the other seven corners free, and
 * those sweep through the dirt as the hull rotates. Motors inverted
 * also push along world -z. Without this, the camera clips through the
 * grass and a tumble through a gate opening can score a phantom lap.
 *
 * Translation only: no torque, so the mixer couple that flips the hull
 * is not cancelled. The deepest corner is parked on the slop band; as
 * the craft rotates, a new corner becomes deepest and the CG rises.
 */
static void ground_project_sample(const double body[3], double *worst) {
  double r[3];
  contact_rotate(body, r);
  const double px = S.pos[0] + r[0];
  const double py = S.pos[1] + r[1];
  const double pz = S.pos[2] + r[2];
  const double side = g_ground_n[0] * px + g_ground_n[1] * py + g_ground_n[2] * pz;
  const double pen = g_ground_d - side;
  if (pen > *worst) {
    *worst = pen;
  }
}

static void ground_project_hull(void) {
  double worst = CONTACT_PEN_NONE;
  const double cam[3] = { CAMERA_BODY_X, CAMERA_BODY_Y, CAMERA_BODY_Z };
  for (int c = 0; c < CONTACT_CORNERS; c += 1) {
    ground_project_sample(CONTACT_CORNER[c], &worst);
  }
  ground_project_sample(cam, &worst);
  g_ground_projected = 0;
  g_ground_near = (worst > -CONTACT_NEAR) ? 1 : 0;
  if (!(worst > CONTACT_SLOP)) {
    return;
  }
  g_ground_projected = 1;
  const double push = worst - CONTACT_SLOP;
  S.pos[0] += g_ground_n[0] * push;
  S.pos[1] += g_ground_n[1] * push;
  S.pos[2] += g_ground_n[2] * push;
  /* Only kill inbound speed when the hull was truly buried. A roll
   * drives a corner a few millimetres through as it rotates about the
   * support; zeroing vn there cancelled the linear part of a couple.
   * Turtle is the host-latched mixer path; the ABI self-test still
   * proves crashflip against this plane. */
  if (worst > 0.02) {
    const double vn = S.vel[0] * g_ground_n[0]
        + S.vel[1] * g_ground_n[1]
        + S.vel[2] * g_ground_n[2];
    if (vn < 0.0) {
      S.vel[0] -= g_ground_n[0] * vn;
      S.vel[1] -= g_ground_n[1] * vn;
      S.vel[2] -= g_ground_n[2] * vn;
    }
  }
}

/*
 * Grass is a dead thump, not a trampoline. Baumgarte can leave a 1.2 m/s
 * outbound kick even with e = 0; this removes it once the hull is seated.
 *
 * Props down (upz clearly negative): the discs grab and the hull stops
 * in place. Props up: a short slide, then stick. A side tumble still
 * rolls; extra omega damping is belly-only so a 90 deg arrival can
 * fall over instead of welding on an arm.
 *
 * Crashflip is latched by the shell when the hull is inverted and
 * settled. The mixer path is compiled, and the contact self-test still
 * drives it, so settle must not cancel that couple while crashflip is
 * latched. A waiting inverted hull with centered sticks is seated by
 * the shell (sim_rest), not here.
 */
static void ground_settle(double upz, double vn_plant) {
  if (!g_ground_hits && !g_ground_projected) {
    /* Inverted rest can sit on the slop with no impulse and no
     * push, which used to skip settle and leave a props-down slide.
     * near is only true within CONTACT_NEAR of the plane. Starting
     * the projector's worst pen at 0 made every airborne hull look
     * near, and invert-stop froze a flip in free air. */
    if (!(upz < CONTACT_INVERT_UPZ && g_ground_near)) {
      return;
    }
  }
  if (bridge_crashflip_active()) {
    return;
  }

  const double nx = g_ground_n[0];
  const double ny = g_ground_n[1];
  const double nz = g_ground_n[2];
  double vn = S.vel[0] * nx + S.vel[1] * ny + S.vel[2] * nz;

  /* Strip an outbound kick the contact just invented (Baumgarte, a
   * residual bounce). Leave a climb the plant already had: killing
   * that every step glued a punch to the pad. */
  if (vn > 0.0 && !(vn_plant > 0.0)) {
    S.vel[0] -= nx * vn;
    S.vel[1] -= ny * vn;
    S.vel[2] -= nz * vn;
    vn = 0.0;
  }

  /* Props-down on grass: stop immediately when the hull is on the
   * plane, or when it is only in the 8 mm halo and not diving in.
   * A live flip whose lowest corner just entered that halo must keep
   * vel and omega until it actually hits. */
  if (upz < CONTACT_INVERT_UPZ) {
    const int touching = g_ground_hits || g_ground_projected;
    const int seated_halo = g_ground_near
        && upz < CONTACT_INVERT_HALO_UPZ
        && !(vn_plant < -CONTACT_INVERT_DIVE);
    if (touching || seated_halo) {
      S.vel[0] = 0.0;
      S.vel[1] = 0.0;
      S.vel[2] = 0.0;
      S.omega[0] = 0.0;
      S.omega[1] = 0.0;
      S.omega[2] = 0.0;
    }
    return;
  }

  /* Tangent only. Scaling the whole velocity damped the punch while
   * the hull was still in the contact band. */
  const double vtx = (S.vel[0] - nx * vn) * CONTACT_SLIDE_KEEP;
  const double vty = (S.vel[1] - ny * vn) * CONTACT_SLIDE_KEEP;
  const double vtz = (S.vel[2] - nz * vn) * CONTACT_SLIDE_KEEP;
  const double vt2 = vtx * vtx + vty * vty + vtz * vtz;
  if (vt2 < CONTACT_SLIDE_STOP * CONTACT_SLIDE_STOP) {
    S.vel[0] = nx * vn;
    S.vel[1] = ny * vn;
    S.vel[2] = nz * vn;
    if (!(vn > 0.0)) {
      S.vel[0] = 0.0;
      S.vel[1] = 0.0;
      S.vel[2] = 0.0;
    }
  } else {
    S.vel[0] = nx * vn + vtx;
    S.vel[1] = ny * vn + vty;
    S.vel[2] = nz * vn + vtz;
  }

  if (upz >= 0.5) {
    S.omega[0] *= CONTACT_OMEGA_KEEP;
    S.omega[1] *= CONTACT_OMEGA_KEEP;
    S.omega[2] *= CONTACT_OMEGA_KEEP;
    const double w2 = S.omega[0] * S.omega[0]
        + S.omega[1] * S.omega[1]
        + S.omega[2] * S.omega[2];
    if (w2 < CONTACT_OMEGA_STOP * CONTACT_OMEGA_STOP) {
      S.omega[0] = 0.0;
      S.omega[1] = 0.0;
      S.omega[2] = 0.0;
    }
  }
}

static void ground_apply(void) {
  g_ground_hits = 0;
  g_ground_projected = 0;
  g_ground_near = 0;
  if (!g_ground_on || g_stand_on) {
    return;
  }
  const double vn_plant = S.vel[0] * g_ground_n[0]
      + S.vel[1] * g_ground_n[1]
      + S.vel[2] * g_ground_n[2];
  const double vs[3] = { 0.0, 0.0, 0.0 };
  /* World-z of body up. A belly landing wants a four-leg table. Anything
   * past about 60 deg is a roll, a turtle or a side arrival: one support
   * so the contact cannot cancel the motor couple. Four coplanar contacts
   * at 1 kHz locked pitch and turtle could not rotate. */
  const double qx = S.quat[1];
  const double qy = S.quat[2];
  const double upz = 1.0 - 2.0 * (qx * qx + qy * qy);

  if (upz < 0.5) {
    int hits = 0;
    if (upz < 0.0) {
      /* Inverted rest is the camera / vtx bump, through the CG, so the
       * mixer couple is free to pitch. Projection, not an arm contact,
       * keeps the free corners out of the dirt. An arm impulse here
       * became a 1 kHz weld once the hull was parked on that vertex,
       * and turtle could not rotate. */
      double r[3];
      const double bump[3] = { 0.0, 0.0, CONTACT_HZ_UP };
      contact_rotate(bump, r);
      if (ground_hit_at(r, vs)) {
        hits = 1;
        for (int iter = 1; iter < CONTACT_ITERS; iter += 1) {
          if (!ground_hit_at(r, vs)) {
            break;
          }
        }
      }
    } else {
      /* Tumble on an arm, or on its side: the supporting vertex only. */
      double r[3];
      contact_support_neg_n(g_ground_n, r);
      for (int iter = 0; iter < CONTACT_ITERS; iter += 1) {
        if (!ground_hit_at(r, vs)) {
          break;
        }
        hits = 1;
      }
    }
    g_ground_hits = hits;
    ground_project_hull();
    ground_settle(upz, vn_plant);
    return;
  }

  int hit_mask = 0;
  for (int iter = 0; iter < CONTACT_ITERS; iter += 1) {
    int nuse = 0;
    for (int c = 0; c < CONTACT_CORNERS; c += 1) {
      double r[3];
      contact_rotate(CONTACT_CORNER[c], r);
      if (ground_hit_at(r, vs)) {
        nuse += 1;
        hit_mask |= (1 << c);
      }
    }
    if (nuse == 0) {
      break;
    }
  }
  int hits = 0;
  int m = hit_mask;
  while (m) {
    hits += m & 1;
    m >>= 1;
  }
  g_ground_hits = hits;
  ground_project_hull();
  ground_settle(upz, vn_plant);
}

SIM_EXPORT int sim_contact(double nx, double ny, double nz,
                           double restitution, double mu,
                           double px, double py, double pz,
                           double vsx, double vsy, double vsz) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!sim_finite(nx) || !sim_finite(ny) || !sim_finite(nz)
      || !sim_finite(restitution) || !sim_finite(mu)
      || !sim_finite(px) || !sim_finite(py) || !sim_finite(pz)
      || !sim_finite(vsx) || !sim_finite(vsy) || !sim_finite(vsz)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(restitution >= 0.0) || !(restitution <= 1.0)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(mu >= 0.0) || !(mu <= 2.0)) {
    return SIM_ERR_BAD_ARG;
  }
  double n[3];
  if (!contact_unit3(nx, ny, nz, n)) {
    return SIM_ERR_BAD_ARG;
  }
  S.pos[0] = px;
  S.pos[1] = py;
  S.pos[2] = pz;
  double r[3];
  contact_support_neg_n(n, r);
  const double vs[3] = { vsx, vsy, vsz };
  /* Penetration is already resolved by the host placing p on the free
   * side of the face. The impulse still sees the inbound velocity. */
  contact_impulse(n, r, vs, restitution, mu, 0.0);
  return SIM_OK;
}

SIM_EXPORT int sim_set_ground(int on,
                              double nx, double ny, double nz,
                              double px, double py, double pz,
                              double mu, double restitution) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!on) {
    g_ground_on = 0;
    g_ground_hits = 0;
    g_ground_projected = 0;
    g_ground_near = 0;
    return SIM_OK;
  }
  if (!sim_finite(nx) || !sim_finite(ny) || !sim_finite(nz)
      || !sim_finite(px) || !sim_finite(py) || !sim_finite(pz)
      || !sim_finite(mu) || !sim_finite(restitution)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(mu >= 0.0) || !(mu <= 2.0)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(restitution >= 0.0) || !(restitution <= 1.0)) {
    return SIM_ERR_BAD_ARG;
  }
  double n[3];
  if (!contact_unit3(nx, ny, nz, n)) {
    return SIM_ERR_BAD_ARG;
  }
  g_ground_n[0] = n[0];
  g_ground_n[1] = n[1];
  g_ground_n[2] = n[2];
  g_ground_d = n[0] * px + n[1] * py + n[2] * pz;
  g_ground_mu = mu;
  g_ground_e = restitution;
  g_ground_on = 1;
  return SIM_OK;
}

SIM_EXPORT int sim_ground_contacts(void) {
  return g_ground_hits;
}

SIM_EXPORT int sim_set_crashflip(int on) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  bridge_set_crashflip(on);
  return SIM_OK;
}

SIM_EXPORT int sim_crashflip_active(void) {
  if (!g_initialised) {
    return 0;
  }
  return bridge_crashflip_active();
}

SIM_EXPORT int sim_set_pose(double px, double py, double pz,
                            double qw, double qx, double qy, double qz) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!sim_finite(px) || !sim_finite(py) || !sim_finite(pz)
      || !sim_finite(qw) || !sim_finite(qx) || !sim_finite(qy) || !sim_finite(qz)) {
    return SIM_ERR_BAD_ARG;
  }
  const double n2 = qw * qw + qx * qx + qy * qy + qz * qz;
  if (!(n2 > 0.25) || !(n2 < 4.0)) {
    return SIM_ERR_BAD_ARG;
  }
  const double ninv = 1.0 / sim_sqrt(n2);
  S.pos[0] = px;
  S.pos[1] = py;
  S.pos[2] = pz;
  S.quat[0] = qw * ninv;
  S.quat[1] = qx * ninv;
  S.quat[2] = qy * ninv;
  S.quat[3] = qz * ninv;
  return SIM_OK;
}

SIM_EXPORT int sim_deflect(double nx, double ny, double nz,
                           double restitution, double tangent_keep,
                           double rate_keep, double px, double py, double pz) {
  /* Kept so an old caller still compiles. The impulse is the rigid-body
   * one; tangent_keep and rate_keep are range-checked so the ABI does not
   * change meaning of the arguments, then ignored because Coulomb friction
   * and the angular term replace those two scale factors. */
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!sim_finite(tangent_keep) || !sim_finite(rate_keep)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(tangent_keep >= 0.0) || !(tangent_keep <= 1.0)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(rate_keep >= 0.0) || !(rate_keep <= 1.0)) {
    return SIM_ERR_BAD_ARG;
  }
  return sim_contact(nx, ny, nz, restitution, 0.35, px, py, pz, 0.0, 0.0, 0.0);
}

static void stand_rotate_body(double bx, double by, double bz, double out[3]) {
  const double w = S.quat[0];
  const double x = S.quat[1];
  const double y = S.quat[2];
  const double z = S.quat[3];
  const double ux = 2.0 * (y * bz - z * by);
  const double uy = 2.0 * (z * bx - x * bz);
  const double uz = 2.0 * (x * by - y * bx);
  out[0] = bx + w * ux + (y * uz - z * uy);
  out[1] = by + w * uy + (z * ux - x * uz);
  out[2] = bz + w * uz + (x * uy - y * ux);
}

static void stand_pitch_only(void) {
  const double w = S.quat[0];
  const double x = S.quat[1];
  const double y = S.quat[2];
  const double z = S.quat[3];
  /* Body forward in world, then drop the lateral component so yaw and
   * roll cannot accumulate. Gyroscopic pitch leaks into roll in free
   * air; a launch block does not allow that. */
  double fx = 1.0 - 2.0 * (y * y + z * z);
  double fz = 2.0 * (x * z - w * y);
  const double f2 = fx * fx + fz * fz;
  if (f2 < 1e-16) {
    return;
  }
  const double inv = 1.0 / sim_sqrt(f2);
  fx *= inv;
  fz *= inv;
  if (fx > 1.0) {
    fx = 1.0;
  }
  if (fx < -1.0) {
    fx = -1.0;
  }
  double qw = sim_sqrt(0.5 * (1.0 + fx));
  double qy;
  if (qw > 1e-12) {
    qy = -0.5 * fz / qw;
  } else {
    qw = 0.0;
    qy = fz < 0.0 ? 1.0 : -1.0;
  }
  const double n2 = qw * qw + qy * qy;
  const double ninv = 1.0 / sim_sqrt(n2);
  S.quat[0] = qw * ninv;
  S.quat[1] = 0.0;
  S.quat[2] = qy * ninv;
  S.quat[3] = 0.0;
}

static void stand_apply(void) {
  if (!g_stand_on) {
    return;
  }
  stand_pitch_only();
  S.vel[0] = 0.0;
  S.vel[1] = 0.0;
  S.vel[2] = 0.0;
  S.omega[0] = 0.0;
  S.omega[2] = 0.0;
  double hingeb[3];
  stand_rotate_body(-PLANT.arm_x, 0.0, STAND_HINGE_Z, hingeb);
  S.pos[0] = g_stand_hinge[0] - hingeb[0];
  S.pos[1] = g_stand_hinge[1] - hingeb[1];
  S.pos[2] = g_stand_hinge[2] - hingeb[2];
}

static void stand_capture_hinge(void) {
  double hingeb[3];
  stand_rotate_body(-PLANT.arm_x, 0.0, STAND_HINGE_Z, hingeb);
  g_stand_hinge[0] = S.pos[0] + hingeb[0];
  g_stand_hinge[1] = S.pos[1] + hingeb[1];
  g_stand_hinge[2] = S.pos[2] + hingeb[2];
}

SIM_EXPORT int sim_set_launch_stand(int on, double px, double py, double pz,
                                    double qw, double qx, double qy, double qz) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!on) {
    g_stand_on = 0;
    return SIM_OK;
  }
  if (!sim_finite(px) || !sim_finite(py) || !sim_finite(pz)
      || !sim_finite(qw) || !sim_finite(qx) || !sim_finite(qy) || !sim_finite(qz)) {
    return SIM_ERR_BAD_ARG;
  }
  const double n2 = qw * qw + qx * qx + qy * qy + qz * qz;
  if (!(n2 > 0.25) || !(n2 < 4.0)) {
    return SIM_ERR_BAD_ARG;
  }
  const double ninv = 1.0 / sim_sqrt(n2);
  S.pos[0] = px;
  S.pos[1] = py;
  S.pos[2] = pz;
  S.quat[0] = qw * ninv;
  S.quat[1] = qx * ninv;
  S.quat[2] = qy * ninv;
  S.quat[3] = qz * ninv;
  S.vel[0] = 0.0;
  S.vel[1] = 0.0;
  S.vel[2] = 0.0;
  S.omega[0] = 0.0;
  S.omega[2] = 0.0;
  g_stand_on = 1;
  stand_pitch_only();
  stand_capture_hinge();
  stand_apply();
  return SIM_OK;
}

SIM_EXPORT int sim_set_angle_mode(int on) {
  bridge_set_angle_mode(on);
  return SIM_OK;
}

/* Flight style flag, see sim_internal.h. Not reset by reset_dynamics on
 * purpose: it is a mode, not dynamic state, same rule as angle mode. */
int SIM_ARCADE = 0;

SIM_EXPORT int sim_set_flight_style(int arcade) {
  SIM_ARCADE = arcade ? 1 : 0;
  return SIM_OK;
}

SIM_EXPORT int sim_set_launch_control(int on) {
  bridge_set_launch_control(on);
  return SIM_OK;
}

SIM_EXPORT int sim_launch_control_state(void) {
  return bridge_launch_control_state();
}

SIM_EXPORT int sim_motor_override(int motor, double duty) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (motor < -1 || motor >= SIM_MOTOR_COUNT) {
    return SIM_ERR_BAD_ARG;
  }
  double d = duty;
  if (d > 1.0) {
    d = 1.0;
  }
  if (d < 0.0) {
    d = -1.0; /* clears */
  }
  if (motor == -1) {
    for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
      g_override[m] = d;
    }
  } else {
    g_override[motor] = d;
  }
  return SIM_OK;
}

SIM_EXPORT int sim_step(int n) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (n < 0) {
    return SIM_ERR_BAD_ARG;
  }
  for (int k = 0; k < n; k += 1) {
    /* Consume every sample whose timestamp falls inside this step. Each
     * consumed sample is an RC frame for the controller. */
    const long long step_end_us = (S.step_index + 1) * (1000000LL / SIM_STEP_HZ);
    int rx_new = 0;
    while (g_q_head != g_q_tail && g_queue[g_q_head].t_us < step_end_us) {
      g_current_rc[0] = g_queue[g_q_head].ch[0];
      g_current_rc[1] = g_queue[g_q_head].ch[1];
      g_current_rc[2] = g_queue[g_q_head].ch[2];
      g_current_rc[3] = g_queue[g_q_head].ch[3];
      g_q_head = (g_q_head + 1) % INPUT_QUEUE_CAP;
      rx_new = 1;
    }
    double duty[SIM_MOTOR_COUNT];
    bridge_run(&S, g_current_rc, rx_new, duty);
    for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
      if (g_override[m] >= 0.0) {
        duty[m] = g_override[m];
      }
    }
    plant_step(&S, duty);
    ground_apply();
    stand_apply();
    S.step_index += 1;
  }
  return SIM_OK;
}

SIM_EXPORT int sim_state_size(void) { return SIM_STATE_DOUBLES; }

SIM_EXPORT int sim_state(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  out[0] = (double)S.step_index / (double)SIM_STEP_HZ;
  out[1] = S.pos[0];
  out[2] = S.pos[1];
  out[3] = S.pos[2];
  out[4] = S.vel[0];
  out[5] = S.vel[1];
  out[6] = S.vel[2];
  out[7] = S.quat[0];
  out[8] = S.quat[1];
  out[9] = S.quat[2];
  out[10] = S.quat[3];
  out[11] = S.omega[0];
  out[12] = S.omega[1];
  out[13] = S.omega[2];
  /* rad/s to RPM is a display conversion fixed by the ABI. */
  const double to_rpm = 60.0 / (2.0 * 3.14159265358979323846);
  out[14] = S.motor_omega[0] * to_rpm;
  out[15] = S.motor_omega[1] * to_rpm;
  out[16] = S.motor_omega[2] * to_rpm;
  out[17] = S.motor_omega[3] * to_rpm;
  out[18] = S.vbat_load;
  out[19] = S.pack_current;
  return SIM_OK;
}
