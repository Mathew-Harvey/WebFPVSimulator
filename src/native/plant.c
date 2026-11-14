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
 * THE FIGURE OF MERIT WAS 0.565 AND THAT IS AN OPTIMISTIC ROTOR. It is now
 * 0.520, and the reason is a board report about the craft gaining altitude
 * on a yaw input. kq is the whole of this airframe's yaw authority, because
 * yaw torque is prop drag reacting through the stator, so an optimistic kq
 * is a quad that has to move more air to turn its nose than it should.
 *
 * The number was not chosen to fix the report, it was checked against an
 * independent measurement and found wrong. Published thrust stand data for
 * a 2207 1900 kV on 6S with a 5x4.3x3 gives about 1.5 kgf and roughly 600 W
 * of shaft power at 26,000 RPM, so shaft torque is P / w = 600 / 2723 =
 * 0.22 N m against 14.7 N of thrust, and the ratio a rotor actually holds
 * is Q / T = 0.0150 m. That ratio is kq / kt and nothing else. At FM 0.565
 * this plant held 0.01414, seven percent light; at 0.520 it holds 0.01536,
 * which is the closest any value in the P5 band gets to the stand.
 *
 * 0.565 was always the top of the 0.4 to 0.6 band, and the top of that band
 * is a clean two blade rotor. A five inch TRIBLADE is not one: the third
 * blade buys thrust in a smaller disc and pays for it in profile drag, and
 * 0.50 to 0.53 is where they measure. PLANT_TORQUE_IND below is the same
 * number and has to move with it, because the induced share of shaft torque
 * IS the figure of merit at hover; that identity is what keeps this pair
 * exactly kq w^2 in the hover and is why checks 5 and 8 do not move.
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
 *
 * THE TABLE IS THE MOTOR AT SCALE 1.0. sim_set_motor_kv winds the same motor
 * hotter or milder at run time, dividing ke by the scale and r_motor by its
 * square at the top of plant_step; nothing in this table moves. See
 * SIM_MOTOR_KV in sim_internal.h.
 */
const PlantParams PLANT_TABLE[SIM_AIRFRAME_COUNT] = {
/* ---------------------------------------------------------------------
 * SIM_AIRFRAME_5IN. The machine STAGE1.md describes and every threshold in
 * tests/ was measured against. Nothing in this entry moved when the table
 * grew around it: the values below are byte for byte the ones that were in
 * the single const PLANT before, and the trace hash is measured identical.
 * ------------------------------------------------------------------- */
[SIM_AIRFRAME_5IN] = {
  /*
   * 0.71, in two owner steps from 0.65, off a board report that asked for
   * the race tune "with more gravity or a heavier quad": 0.68 flew, the
   * owner asked for a tiny bit more, and sixty grams total is a bigger
   * pack AND the HD camera. Thrust is untouched, so thrust to weight goes
   * 9.21 to 8.43, hover climbs a few points up the stick, and a punch
   * tops out lower, which regains margin under check 6's ceiling. The
   * inertia stays: the extra mass sits at the CG and a slab there moves
   * Iyy by under a percent, below what this model resolves. The kt
   * derivation comment below still says 650 g because that is the
   * airframe kt was derived AGAINST, a historical fact; the constant it
   * produced is a property of the prop and motor, not of the pack flown
   * that day.
   */
  .mass_kg = 0.71,
  .inertia = { 0.0035, 0.0038, 0.0068 },
  .gravity = 9.80665,
  .arm_x = 0.0777817459305202, /* 0.110 / sqrt(2) */
  .arm_y = 0.0777817459305202,
  .kt = 1.98e-6,
  .kq = 3.04e-8,   /* figure of merit 0.520, see the triblade note below */
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
   *
   * 0.0104, four fifths of that, on 2026-10-04, off a pilot's report that the
   * low throttle had a little too much grip in the air and the mid throttle
   * was a little soft. Of the two drags that brake this craft, this one does
   * not care where the throttle is: with the motors at idle it is nearly all
   * of the braking there is, and that is the grip the report named. The
   * rotor drag below grows with thrust, so the grip came off this term and
   * went onto that one, and the two were moved together until full throttle
   * level speed came out where it was. 0.0104 is the same 0.011 m squared at
   * a Cd near 0.95, still a bluff body. Measured at the shell's 1.62 g,
   * levelled at idle from 20 m/s: 4.14 s to lose half the speed before, 4.97
   * after. See PROGRESS.md under the same date.
   */
  .cda_front = 0.0104,
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
   *
   * Scaled by the same four fifths as cda_front on 2026-10-04, so the front
   * to side ratio, which is the pack, is kept.
   */
  .cda_side = 0.01176,
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
   * to come back. 0.12 was the value the RMS derivation originally landed
   * on; the owner then flew it and asked for a tiny bit more, so 0.15,
   * which is half of the 0.30 that was too hot, with the wider descent
   * window kept. The ladder so far: 0.60, 0.12, 0.30, 0.08, 0.12, 0.15,
   * every rung a pilot's word, which is what a FEEL constant means.
   *
   * 0.075 on 2026-10-09, half of 0.15, on the owner's word: "reduce prop
   * wash by 50% its a bit much". The window it applies in is unchanged, so
   * this is the same wash at half the strength. The ladder is now 0.60,
   * 0.12, 0.30, 0.08, 0.12, 0.15, 0.075.
   */
  .k_propwash = 0.075,
  .prop_r = 0.0635,
  /*
   * 0.55, up from the 0.43842 the block at 3b derives, on 2026-10-04 and
   * together with cda_front. The derivation anchors k on one published total
   * linear drag fit and says itself that the split between this and body
   * drag is not measured; the pilot's report is a measurement of that split.
   * This term is the throttle's grip on the air: it goes as the induced
   * velocity, so it is nearly nothing at idle and grows with thrust, which is
   * where the report wanted more. Hover, punch, climb, descent and every
   * rate figure cannot see it, because it is in plane only. What it does
   * move: the nose up couple at speed and the small yaw damping, both by the
   * same quarter. See PROGRESS.md under the same date.
   */
  .k_rotor_drag = 0.55,
  /*
   * ZERO, AND THAT IS NOT AN OMISSION.
   *
   * cda_plan above is 0.0225, and it is not a silhouette calculation: it was
   * FITTED against this airframe's measured props level descent terminal of
   * 20.7 m/s, which is a measurement of the whole machine falling, discs
   * included. Adding a separate disc term here would charge the four rotors
   * twice and move a number the calibration rests on. The whoop's cda_plan
   * was derived the other way, from a silhouette with the duct throats
   * counted as holes, so its rotors are genuinely missing and are charged
   * there. See the block at k_rotor_axial in the descent branch.
   */
  .k_rotor_axial = 0.0,
  /*
   * NO GROUND EFFECT ON THE FIVE INCH, YET, and the reason is the envelope
   * rather than the physics. A five inch has one, inside about four rotor
   * radii, 25 cm, which it passes through for a second on the way up and a
   * second on the way down. Checks 5 through 12 and the baseline trace were
   * measured without it, and a term that changes the first second of every
   * flight changes the trace. It belongs on this airframe too, in a turn
   * that is about it and carries its own verify run. See the whoop's.
   */
  .k_ground = 0.0,
  .k_inflow = 0.017382, /* repurposed: prop pitch radius, metres per radian.
                         * 4.3 inch pitch / 2 pi. Axial speed at which thrust
                         * crosses zero is w times this. */
  .torque_ind = 0.520,  /* was #define PLANT_TORQUE_IND, same number, same
                         * meaning: the figure of merit kq was derived
                         * through, which IS the induced share of shaft
                         * torque at hover. It is a rotor property, so it
                         * belongs to the airframe. */
  /* An open rotor has no duct, so the three duct terms are the identity. */
  .k_duct = 1.0,
  .duct_fade = 0.0,
  .k_duct_lip = 0.0,
  .spin = { -1.0, 1.0, 1.0, -1.0 },
  .pos_x = { -0.0777817459305202, 0.0777817459305202,
             -0.0777817459305202, 0.0777817459305202 },
  .pos_y = { -0.0777817459305202, -0.0777817459305202,
             0.0777817459305202, 0.0777817459305202 },
  .pos_z = { 0.020, 0.020, 0.020, 0.020 },
  .cant_radial_deg = { 1.4, 0.85, 1.15, 0.6 },
  .cant_tangent_deg = { -0.9, 1.4, 0.6, -1.2 },
  /*
   * THE CONTACT HULL, made smaller on 2026-10-09 on the owner's word: "make
   * the quad a bit smaller, i should be able to get closer to the ground
   * before i hit it".
   *
   * Down was 0.045 and the lowest thing src/render/herocraft.js draws, the
   * strap under the pack, is 30 mm under the CG, so a parked five inch
   * floated 15 mm and a low pass met the grass 15 mm before the drawn quad
   * did. scripts/craft-check.js pinned that gap and said it waited on a
   * rebuild of this file. 0.033 leaves 3 mm under the strap, and it is also
   * where the whoop, which flies this plant, has its drawn ducts: 9.6 mm
   * under a real whoop's CG through the room's factor is 32.9 mm.
   *
   * Across stays 0.094, the motor offset plus an arm pad's radius. 0.085
   * was tried for the same ask and it is what a wall tap is made of: at
   * 3 m/s on all four yaws the craft stopped turning back off the face
   * (npm run check:wall) and a side arrival locked its attitude instead of
   * rolling (contact:selftest). So the width is the drawn arms and only the
   * belly moved.
   *
   * What it buys, CG height at first touch on flat ground: level, 45 mm to
   * 33; pitched 40 degrees, 95 mm to 86. Up is unchanged: it is the drawn
   * stack and an inverted craft rests on it.
   */
  .hull_hx = 0.094,
  .hull_hy = 0.094,
  .hull_hz_down = 0.033,
  .hull_hz_up = 0.038,
  .contact_patch_r = 0.060,
  .contact_arm_max = 0.20,
  /* The bridge's GYRO_VIB_REF_W, unchanged: 2700 is the full throttle speed
   * the injection was calibrated against, and the five inch's trace is bit
   * identical with the same divisor in the same place. */
  .vib_ref_w = 2700.0,
  .camera_x = 0.104,
  .camera_y = 0.0,
  .camera_z = 0.018,
  .len_scale = 1.0, /* life size: the field is built in its metres */
  .ground_tip_accel = 200.0, /* sim.c TUMBLE FLAT, the drop probe's figure */
  .ducted = 0,
  /* The Realistic physics switch's numbers; see the block at PLANT_REAL. */
  .inertia_real = { 0.00235, 0.00246, 0.0039 },
  .j_rotor_real = 11.0e-6,
  .r_cell_real = 0.0052,
  .k_ground_real = 1.0,
  .pack_ah = 1.3,
  .r_cell_slow = 0.0015,
},

/* ---------------------------------------------------------------------
 * SIM_AIRFRAME_WHOOP65: a 65 mm 1S brushless whoop on 0702 28,000 kV motors,
 * rebuilt on 2026-10-09 on the owner's ask: "whoops need proper physics, 28k
 * kv motors are about right, the 5 inch model feels ok, the previous whoop
 * model was bad", and then: "Whoop motor should be 0702, sag to about 3.65v
 * on punch".
 *
 * WHAT THE PREVIOUS ONE WAS. This entry held a 23.4 g 0702 36,000 kV whoop
 * from 2026-09-06, flown at life size until 2026-09-14, when the owner gave up
 * on it ("the whoop flight feel sucks") and the whoop was moved onto the five
 * inch's plant in a room built 3.43 times life size. That trick cannot scale
 * gravity, and the room's whoop fell at 0.59 of a g. This entry is the whoop's
 * own plant again, and len_scale at its foot is how it flies in that room at
 * one real g. PROGRESS.md 2026-10-09 has the measurements that chose it.
 *
 * IT IS BUILT THE WAY THE FIVE INCH IS BUILT, because the five inch is the one
 * the owner says feels right. Same derivation chain (a momentum theory pair
 * for kt and kq, then the plant's own equilibria solved for the rest), same terms,
 * and the previous whoop's three duct terms at zero. Those were the duct
 * counted on top of a bench figure that already contained it, a nose up lip
 * moment, and thrust that faded as soon as the craft moved. All three are real
 * effects of a deep shroud; none was measured on a whoop's short ring, and
 * together they were the "wading" and the drift the owner flew. They come back
 * at a magnitude somebody can defend, or not at all. Kept from the previous
 * whoop, because a whoop lives in them: ground effect and the stalled disc
 * drag of a descent.
 *
 * THE MACHINE. A 65 mm frame, four 0702 28,000 kV motors, 31 mm three blade
 * props, a 1S pack: 23 g all up, the previous whoop's frame with the owner's
 * motor in it.
 *
 * THRUST AND THE ELECTRICAL SET, solved together against what a real 1S
 * whoop does rather than typed. The targets: thrust to weight 4.0 to 5.4 all
 * up (the maker's 6.3 to one is the dry figure); a punch that draws 10 to 22 A
 * at the pack; a motor time constant of 15 to 45 ms; and a fresh cell that
 * sags to about 3.65 V under a punch, which is the owner's figure from the
 * real thing. scripts/whoop-gates.js holds those bands with their sources.
 *
 * ke IS THE PLATE, 28,000 kV, because that is the motor the owner named.
 *
 * THE SAG IS THE PACK, NOT THE MOTOR. 3.65 V from 4.2 at about 18 A is 30
 * mOhm from the cell to the board: a good 1S HV pack, a BT2.0 lead and short
 * wire. The previous whoop used 55 mOhm and sagged to 3.25, which the owner
 * says a real one does not.
 *
 * kq through the same identity as the five inch, at a figure of merit of
 * 0.305: a 31 mm blade at 70,000 rpm runs at a chord Reynolds number near
 * 10^4, where Harris puts a rotor at 0.30 to 0.40, and real 31 mm whoop props
 * measure 1.6 to 1.8 g a watt, which is the bottom of that band.
 *
 * Then kt and r_motor, solved against those bands and then measured on the
 * built module by scripts/whoop-gates.js, on a charged 4.2 V cell:
 *
 *   full throttle   72,800 rpm, 17.4 A pack, 3.68 V a cell, 5.4 to one
 *   hover           0.36 of stick
 *   time constant   22 ms
 *
 * r_motor 0.24 is a 0702's winding, more than an 0802's for the same kV
 * on a smaller stator, and j_rotor is the previous whoop's 0702 bell plus a
 * 31 mm three blade.
 *
 * INERTIA is the previous whoop's point mass estimate for this frame.
 * ------------------------------------------------------------------- */
[SIM_AIRFRAME_WHOOP65] = {
  .mass_kg = 0.023,
  .inertia = { 6.0e-6, 7.4e-6, 1.25e-5 },
  .gravity = 9.80665,
  .arm_x = 0.0229809704566899, /* 0.065 / (2 sqrt 2), a 65 mm wheelbase */
  .arm_y = 0.0229809704566899,
  .kt = 5.2e-9,
  .kq = 2.85901e-11, /* figure of merit 0.305 */
  .ke = 3.41046e-4,  /* 28,000 kV, the plate: 60 / (2 pi 28000) */
  .r_motor = 0.240,
  .j_rotor = 1.5e-8,
  .cells = 1.0,
  .r_cell = 0.030,  /* 30 mOhm cell to board, the owner's 3.65 V sag; see above */
  /*
   * Body drag, the solid airframe only: 9.3e-4 m^2 of frontal silhouette at a
   * bluff body Cd near 0.9, and 2.2e-3 m^2 of plan at 1.15. Unchanged from the
   * previous whoop; the frame is the same frame.
   */
  .cda_plan = 0.00253,
  .cda_front = 0.00084,
  .cda_side = 0.00092,
  .k_body_lift = 0.00065, /* the five inch's, by the ratio of side areas */
  .rho = 1.225,
  /* A third of the five inch's 0.15 when this was set; a FEEL constant. */
  .k_propwash = 0.05,
  .prop_r = 0.0155,
  /*
   * 0.70, the owner's number on the previous whoop, flown, between the five
   * inch's open rotor fit and a full shroud's 1.0. This is the whoop's grip
   * on the air and most of why it stops sooner than a five inch.
   */
  .k_rotor_drag = 0.70,
  /*
   * The four stalled discs in a descent, as a bluff plate at 1.10 on disc
   * area, descent only. The plan silhouette counts the duct throats as holes
   * and a stalled disc in a duct is not one; without this a whoop chopped
   * settled at 11.7 m/s.
   */
  .k_rotor_axial = 1.10,
  /*
   * Ground effect, Cheeseman and Bennett on the four discs merged, R = 2 r.
   * A whoop skims the mat and crosses a gate's bottom bar a few centimetres
   * up; this is the cushion under it.
   */
  .k_ground = 1.0,
  .k_inflow = 0.003234, /* a 0.8 inch pitch prop, 20.3 mm over 2 pi */
  .torque_ind = 0.305,  /* the figure of merit above */
  /* The duct: inside the bench thrust, so the identity. See the head note. */
  .k_duct = 1.0,
  .duct_fade = 0.0,
  .k_duct_lip = 0.0,
  .spin = { -1.0, 1.0, 1.0, -1.0 },
  .pos_x = { -0.0229809704566899, 0.0229809704566899,
             -0.0229809704566899, 0.0229809704566899 },
  .pos_y = { -0.0229809704566899, -0.0229809704566899,
             0.0229809704566899, 0.0229809704566899 },
  .pos_z = { 0.006, 0.006, 0.006, 0.006 }, /* disc 6 mm above the CG */
  /* A moulded frame's build tolerance, a third of the five inch's, the
   * radial set solved to cancel the tangential set's side force at hover. */
  .cant_radial_deg = { 0.47, 0.28, 0.38, 0.20 },
  .cant_tangent_deg = { -0.3, 0.47, 0.2, -0.4 },
  /*
   * THE HULL, made much smaller on 2026-10-10 on the owner's word: "Fix the
   * 65mm whoop hit box, make much smaller".
   *
   * It was a solid box 41 mm out on each side, the motor offset plus the
   * whole duct, so its corners stood 8 mm outside the round ducts and the
   * air between the ducts was carbon. Through len_scale that was 0.141 m of
   * the room on each side, half again the five inch's 0.094, and its
   * corners met a pole or a bar 7 mm (24 mm of the room) before the drawn
   * ducts did.
   *
   * Now it is the body and the motor bells only: 0.094 / len_scale = 27.4
   * mm, which is the five inch's own 0.094 in the room. That is two thirds
   * of the drawn machine across its sides and of its corner reach, and the
   * ducts are not contacts at all (.ducted below), so a duct may brush a
   * gate bar, a pole or a wall by up to 14 mm of the real machine (47 mm of
   * the room) before anything is felt. The props never strike: they are in
   * ducts. Down is 9.6 mm, the drawn duct floor (src/render/whoopcraft.js),
   * so the ducts sit on the floor. Up is the canopy.
   */
  .hull_hx = 0.094 / ((0.110 + 0.0635) / (0.0325 + 0.0181)),
  .hull_hy = 0.094 / ((0.110 + 0.0635) / (0.0325 + 0.0181)),
  .hull_hz_down = 0.0096,
  .hull_hz_up = 0.018,
  .contact_patch_r = 0.0115,
  .contact_arm_max = 0.060,
  .vib_ref_w = 7830.0, /* this airframe's own full throttle speed */
  .camera_x = 0.024,
  .camera_y = 0.0,
  .camera_z = 0.012,
  /*
   * MICRO_SCALE, the factor the whoop's room is built at, written as the same
   * expression configs/airframes.js derives it with so the double is the same
   * double: the five inch's sweep, 0.110 + 0.0635, over the real whoop's,
   * 0.0325 + 0.0181. whoop:gates W15 drops the module on the shell's floor
   * and fails if the two ever disagree about where the craft parks.
   */
  .len_scale = (0.110 + 0.0635) / (0.0325 + 0.0181),
  /*
   * TIPPED FLAT HARDER THAN THE FIVE INCH, because of the smaller hull above.
   * A craft on its side has to lift its CG over the box's edge to go over,
   * and that costs more the narrower the box is against its height; on a
   * 23 g whoop with a 27 mm half width, 200 left scripts/plant-golden.js
   * "whoop, side drop tumbles flat" lying on its side for good. A real whoop
   * on its side is on two round ducts and rolls off them. Measured on a drop
   * probe of 60 (heights 1.2 and 0.3 m, roll 0 to 180 by 20, pitch 0, 40,
   * 80, throttle cut, 6 s on the shell's grass): at 200, 15 did not end flat;
   * at 1000 none rested on a side; at 3000 none on a side and none still
   * moving, against one on its side and two still moving on the 41 mm box
   * this replaced. It acts only on a stalled crash lying off flat.
   */
  .ground_tip_accel = 3000.0,
  /* Props in ducts: the hull above is the whole of what meets the world. */
  .ducted = 1,
  /* The switch's numbers for this plant, which the shell does not fly
   * (configs/airframes.js seats the whoop on the five inch's). Its inertia
   * and its ground effect are the ones above, because nobody has built
   * this frame up from its parts; the pack is a 1S 300 with two fifths of
   * its sag slow, the five inch's proportion. */
  .inertia_real = { 6.0e-6, 7.4e-6, 1.25e-5 },
  /* No whoop has been logged: the rotor and the cell stay the table's. */
  .j_rotor_real = 1.5e-8,
  .r_cell_real = 0.030,
  .k_ground_real = 1.0,
  .pack_ah = 0.30,
  .r_cell_slow = 0.012,
},
};

/*
 * The airframe in force. Airframe 0 until a host says otherwise, which is
 * the whole of the compatibility promise: the harness never calls
 * sim_set_airframe, so it flies the five inch it always flew.
 */
const PlantParams *PLANT_P = &PLANT_TABLE[SIM_AIRFRAME_5IN];
static int g_airframe = SIM_AIRFRAME_5IN;

/*
 * EVERY AIRFRAME IN SCENE METRES, built from the table above in one pass.
 *
 * The plant computes the airframe it is: a whoop's rotors, drag and ground
 * cushion in a whoop's own metres. The world it flies in is in scene metres,
 * and the whoop's room is built MICRO_SCALE times life size. So the one
 * conversion between the two happens here and in the last six lines of
 * plant_step, and nowhere else: a length goes up by len_scale, an inertia by
 * its square (a contact impulse at a lever len_scale times longer must turn
 * the craft exactly as much), and gravity by len_scale, because the room's
 * metre is a fraction of the whoop's and the whoop must fall one real g of
 * them. Mass, rates, angles, volts and amps do not have a length in them.
 *
 * WHY THIS AND NOT THE OLD TRICK. From 2026-09-14 the whoop flew the five
 * inch's plant in this room, which keeps every frame the same picture and
 * cannot keep gravity: in the room's own terms it fell at 2.025 / 3.43 of a
 * g, and pilots reported exactly that, floaty, carries too far, too light
 * even at 120. Scaling the plant into the room instead of the room around
 * another plant is the only way the picture AND the fall are both a whoop's.
 *
 * Built at first use from the const table, every entry, so the contents do
 * not depend on which airframe a run touched first. PLANT_W_P starts on the
 * five inch's own true entry, which is the same doubles its world entry
 * holds, because 1.0 is exact.
 */
static PlantParams PLANT_WORLD[SIM_AIRFRAME_COUNT];
static int plant_world_ready = 0;
const PlantParams *PLANT_W_P = &PLANT_TABLE[SIM_AIRFRAME_5IN];

/* One airframe's entry into scene metres, in place. */
static void plant_to_world(PlantParams *wp) {
  PlantParams w = *wp;
  const double L = w.len_scale;
  w.gravity *= L;
  w.arm_x *= L;
  w.arm_y *= L;
  w.prop_r *= L;
  w.inertia[0] *= L * L;
  w.inertia[1] *= L * L;
  w.inertia[2] *= L * L;
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    w.pos_x[m] *= L;
    w.pos_y[m] *= L;
    w.pos_z[m] *= L;
  }
  w.hull_hx *= L;
  w.hull_hy *= L;
  w.hull_hz_down *= L;
  w.hull_hz_up *= L;
  w.contact_patch_r *= L;
  w.contact_arm_max *= L;
  w.camera_x *= L;
  w.camera_y *= L;
  w.camera_z *= L;
  *wp = w;
}

static void plant_build_world(void) {
  for (int a = 0; a < SIM_AIRFRAME_COUNT; a += 1) {
    PlantParams w = PLANT_TABLE[a];
    plant_to_world(&w);
    PLANT_WORLD[a] = w;
  }
  plant_world_ready = 1;
}

/*
 * ---------------------------------------------------------------------
 * PLANT_REAL: THE REALISTIC PHYSICS SWITCH, and where its numbers are from.
 *
 * A viewer who had read this file said the plant was basic and that it
 * leaned on hacks, "changing the weight to adjust the floaty feeling". The
 * review of 2026-11-14 found him right about the weight (the shell flies
 * 1.62 g, a heavier world rather than a heavier quad) and right that the
 * rotors know nothing of each other's wake or of the craft's own, and
 * found four things he did not name. The owner asked for all of it, behind
 * one switch that is off until a pilot turns it on. SIM_REAL in
 * sim_internal.h lists the bits; this block is the reasoning for each.
 *
 * NOTHING HERE IS FITTED TO A FLIGHT YET. Every number below is derived
 * from the airframe or from the textbook and is written down as that. The
 * owner has a real five inch and no blackbox log from it has been read;
 * scripts/blackbox-fit.js is the tool that will measure these against one.
 *
 * INFLOW. A blade's lift goes as its pitch angle less the angle the air
 * arrives at, and that inflow angle is the craft's own axial speed PLUS
 * the induced velocity the rotor makes for itself, over the blade's speed.
 * plant_step's own line is T = kt w^2 (1 - va / (w kp)), which keeps the
 * first of those and treats the second as fixed. It is not fixed. Climb,
 * and the rotor needs less induced velocity to make its thrust, which
 * gives back about half of what the climb took. Momentum theory says how
 * much: T = 2 rho A vi sqrt(vperp^2 + (va + vi)^2). Writing vi0 for the
 * induced velocity kt w^2 implies at rest, x = va / vi0, xp = vperp / vi0
 * and y = vi / vi0, the two together are
 *
 *     blade element   T / (kt w^2) = 1 - (x + y - 1) / k
 *     momentum        T / (kt w^2) = y sqrt(xp^2 + (x + y)^2)
 *
 * with ONE constant, k, and it is not a free one: kt w^2 is the thrust at
 * rest (x = 0, y = 1, both lines give 1), and the prop's pitch says where
 * thrust reaches zero (y = 0 at x = 1 + k, which has to be the pitch speed
 * w kp). vi0 = w sqrt(kt / (2 rho A)) is proportional to w, so k is the
 * same at every throttle: kp / sqrt(kt / (2 rho A)) - 1, 1.176 on the five
 * inch. Both ends of the old line are kept and only its shape between them
 * moves. At the hover the slope against axial speed comes out 0.65 of the
 * old line's, and in fast edgewise flight, where the induced velocity is
 * small and cannot give much back, up to 1.85 of it: a rotor's heave
 * damping rises with forward speed, which every helicopter text has.
 *
 * With no edgewise flow the pair is a quadratic in y and is solved in
 * closed form. With it they are a quartic, and it is solved by three
 * Newton steps from the axial answer. That is safe rather than hopeful:
 * the residual rises and is convex in y, the axial answer is never below
 * the root, so Newton comes down on the root from above and cannot step
 * past it. Three steps leave an error under one part in ten thousand over
 * the whole envelope (scripts/realism-check.js sweeps it against a
 * bisection). A fixed count, sim_sqrt only, so it is deterministic.
 *
 * The edgewise flow is inside the solve, so translational lift is too,
 * and the separate axial_gain term is not added in this mode. The descent
 * keeps its shape: the solve runs to the same ring state onset, measured
 * in pitch speed, and thrust rolls off from there to PLANT_VRS_FLOOR by
 * the same ramp, faded by edgewise speed (see EDGEWISE AIR in plant_step).
 * The torque block is unchanged.
 *
 * INERTIA. The table's 0.0035, 0.0038, 0.0068 is STAGE1.md's figure and
 * has no derivation. Built up from the parts of this airframe, 710 g all
 * up: four motors with props and screws, 40 g each at the arm ends; four
 * 9 g arms as slender rods; 200 g of plates, stack, video and hardware as
 * a 140 by 45 by 30 mm block; a 250 g 6S pack, 78 by 38 by 45 mm, on the
 * top plate; and a 64 g HD camera at the nose. About the centre of gravity
 * of that set, which sits 26 mm above the arms: 0.00145, 0.00204, 0.00281.
 * Two fifths to a half of the table. That was an estimate from a parts
 * list, and it was the first realistic table.
 *
 * THEN THE OWNER'S QUADS WERE LOGGED (2026-11-14, two five inch on 6S,
 * four flights, scripts/blackbox-fit.js; the numbers are in PROGRESS.md)
 * and the estimate had overshot. On the flight with full rate flips, roll
 * and pitch inertia over mass and arm read 45 to 57 mm, where the table
 * reads 71 and 74 and the parts estimate 30 and 40. The fit explains six
 * tenths of the snaps, and a fit that loose reads high, so the figure
 * taken is 48 mm on both axes, the low end of what was read: 0.00235 and
 * 0.00246. Yaw was not excited enough to read, so it keeps the parts
 * estimate's own share of roll plus pitch, 0.81: 0.0039. The owner's word
 * for it: "align the realism changes behind the switch with real life
 * best as you can". One quad, one flight; a string hang would settle it
 * (scripts/blackbox-fit.js --bifilar).
 *
 * MOTOR LAG, on the same bit, because it is the rotor's inertia. The same
 * four flights read 37 to 42 ms for an rpm to follow its command near
 * hover, and the same estimator reads 28 to 29 on this plant. A motor's
 * lag goes as the inertia it turns, so j_rotor_real is the table's 8.0e-6
 * times 39.4 over 28.6: 11.0e-6. That is more than a 2207 bell and a
 * triblade weigh out at (near 9e-6), so it is an effective figure that
 * also holds whatever the ESC adds, and it says so here rather than
 * pretending to be a part.
 *
 * GROUND. The five inch's k_ground is zero because its envelope was
 * measured without it (see the note at the field). With the switch on it
 * is 1.0, the whoop's Cheeseman and Bennett form on the four discs merged:
 * a cushion inside the last two rotor radii, a third more thrust parked,
 * seven percent at 13 cm, gone by 30 cm.
 *
 * WAKE. Prop wash is a rotor meeting air it has already thrown, and the
 * plant's own version fires whenever a disc is moving bottom first,
 * wherever the wake actually is. With the switch on it is in two places.
 *
 * Round the disc itself, the ring state: the same gate on the same ratio
 * of sink to induced velocity, now faded by edgewise speed, because air
 * crossing the disc at one induced velocity carries the wake off before
 * the rotor can sink into it (see EDGEWISE AIR in plant_step). So a hard
 * flare standing on its tail, a drop straight down and a pull out still
 * shake, and coming down while moving forward does not, which is what a
 * real quad does and what every pilot is told.
 *
 * And wherever the wake was left. Every 50 ms the craft sheds a puff:
 * where it was, the way the thrust was pointing, and twice the induced
 * velocity, which is the speed momentum theory gives the far wake. A puff
 * slows as a jet does and spreads as it goes, and the last 3.2 s of them
 * are kept. Every 10 ms the craft asks how near it is to the trail, older
 * than a tenth of a second so the column under a hover is never "met".
 * This is the drop back into the column under a hover, and the stop that
 * sinks into air just blown ahead. It is a smaller thing than the first:
 * measured, most moves leave their wake behind and below for good.
 *
 * Whichever is deeper scales the SAME turbulence at the SAME strength as
 * before, k_propwash, the owner's 0.075.
 *
 * PACK. The open circuit voltage follows a LiPo cell's own discharge
 * curve down as charge is drawn, from wherever the host set it, and a
 * second, slow resistance sits behind the fast one: its voltage builds
 * toward I R over about a second of load and falls back over a second of
 * rest, which is the punch that fades and the pack that comes back.
 *
 * SAG. The table's 2.5 mOhm a cell is a fresh race pack on a bench. The
 * owner's packs in the air, leads, connectors and age included, gave up
 * 0.16, 0.21 and 0.37 V to hold a hover (voltage against rpm cubed, no
 * current sensor, because theirs read a fifth of the truth), where this
 * plant gave up 0.09 with the fast and slow resistances together at 4.0
 * mOhm. The middle of the three is 0.21 V, and the same estimator reads
 * 0.21 off this plant with r_cell_real at 5.2 and the slow 1.5 left as it
 * was (it read 0.25 at 6.5). It has a bit of its own, SIM_REAL_SAG, so a
 * race flies the real sag too.
 *
 * TANDEM. At speed with the discs near edgewise, an upstream rotor's wake
 * is carried back over the downstream one, which then flies in descending
 * air and makes less thrust for its speed. The controller holds the nose
 * with more rear motor, and that split is on every real blackbox log of a
 * fast pass. The wake leaves an upstream disc along the relative wind and
 * sinks at the flow through the disc, so by the time it reaches the next
 * rotor it has dropped h below it; the interference is that rotor's
 * induced velocity, weighted by how much the two discs overlap across the
 * wind, by 1 / (1 + (h/R)^2), and by how edgewise the flow is. At racing
 * tilt the wake is gone below the rear discs before it reaches them, and
 * this does almost nothing, which is right. PLANT_REAL_TANDEM, 0.75, is an
 * estimate: a far wake carries up to twice the induced velocity and a
 * disc only partly in it sees less. Tunnel tests of quadrotors edgewise
 * put the rear pair 10 to 25 percent down on thrust at the same speed;
 * 0.75 lands a level coast at about 15, the middle of that.
 *
 * DYNAMIC INFLOW. The air through a disc has mass (8/3 rho R^3 of it, the
 * Pitt and Peters figure) and cannot change speed at once, so the induced
 * velocity lags what the blades ask for with a time constant of
 * 4/(3 pi) R over the flow through the disc (taken as the axial and the
 * edgewise parts added): two milliseconds at a five inch hover, under one
 * at full throttle. While it lags on a rising
 * throttle the blades see less inflow and make more thrust than the
 * steady answer, and on a chop less. It is a small effect on a prop this
 * size, a few percent for a few milliseconds, and it is modelled at its
 * derived size rather than at a size somebody would notice.
 * ------------------------------------------------------------------- */
#define PLANT_REAL_TANDEM 0.75
/*
 * How much of the edgewise speed the momentum line is given. Momentum
 * theory assumes the induced velocity is the same all over the disc, and
 * in edgewise flight it is not: it piles up at the back, and a real rotor
 * gets less translational lift than the ideal one. The textbook carries
 * that as an induced power factor of 1.2 or so in forward flight. 0.80 on
 * the speed puts the lift this solve gives at ordinary speeds on what
 * small props measure in a tunnel and on what the plant's own
 * translational lift term gave (a tenth more thrust at one induced
 * velocity of edgewise speed, a quarter more at two). An estimate.
 */
#define PLANT_REAL_EDGE 0.80
#define PLANT_REAL_DYN 0.42441318157838759 /* 4 / (3 pi) */
/* The wake trail. Seconds and plain numbers; lengths are per airframe. */
#define PLANT_WAKE_EVAL_STEPS 10
#define PLANT_WAKE_EMIT_STEPS 50
#define PLANT_WAKE_MIN_AGE 0.10
#define PLANT_WAKE_JET_TAU 0.35   /* a puff's speed falls as 1 / (1 + t/tau)^2 */
#define PLANT_WAKE_TURB_TAU 0.60  /* and its turbulence as 1 / (1 + t/tau) */
#define PLANT_WAKE_SPREAD 0.20    /* radius gained per metre travelled */
#define PLANT_WAKE_MIN_SPEED 4.0  /* a wake slower than this is not kept */
/* The slow half of the pack's sag builds and recovers over this, seconds. */
#define PLANT_PACK_TAU 1.0

/* Per airframe constants of the inflow solve, built once from the table. */
typedef struct {
  double ci;     /* induced velocity per rad/s at rest, sqrt(kt / (2 rho A)) */
  double k;      /* the blade element constant, kp / ci - 1 */
  double x_on;   /* ring state onset, in vi0 */
  double x_full; /* where the loss has bottomed out */
  double t_on;   /* the thrust factor at the onset with no edgewise flow */
  double wake_r; /* the trail's radius where it is shed: arm plus prop */
} PlantReal;
static PlantReal PLANT_REAL[SIM_AIRFRAME_COUNT];
static int plant_real_ready = 0;

double PLANT_DBG_REAL[8];

/*
 * y = vi / vi0 from the pair above. x is the axial speed and xp the
 * edgewise speed, both over vi0. Returns 0 at or past the pitch speed,
 * where the blades have nothing left to push with.
 */
static inline double plant_real_y(double x, double xp, double k) {
  const double ik = 1.0 / k;
  const double b = x + ik;
  const double c = (x - 1.0) * ik - 1.0;
  if (c >= 0.0) {
    return 0.0;
  }
  /* The positive root of y^2 + b y + c, written so it never subtracts two
   * nearly equal numbers. c is negative, so the root is real. */
  const double disc = sim_sqrt(b * b - 4.0 * c);
  double y = (b >= 0.0) ? (-2.0 * c) / (b + disc) : 0.5 * (disc - b);
  if (xp > 1e-9) {
    const double y_top = y;
    const double xp2 = xp * xp;
    for (int it = 0; it < 3; it += 1) {
      const double a = x + y;
      const double sq = sim_sqrt(xp2 + a * a);
      const double f = y * sq - 1.0 + (a - 1.0) * ik;
      double fp = sq + (y * a) / sq + ik;
      if (fp < 0.2) {
        fp = 0.2;
      }
      y -= f / fp;
      if (y < 0.0) {
        y = 0.0;
      }
      if (y > y_top) {
        y = y_top;
      }
    }
  }
  return y;
}

/*
 * The table the realism bits ask for. Inertia and ground effect are the
 * two corrections that are plain numbers in the table, and the contact
 * solvers in sim.c and world.c read inertia through PLANT_W, so they are
 * swapped in as a second pair of tables rather than tested for wherever
 * they are read. With neither bit set the pointers are the const table's
 * and its world copy's, exactly as plant_set_airframe always left them.
 */
static PlantParams PLANT_SEL[SIM_AIRFRAME_COUNT];
static PlantParams PLANT_SEL_WORLD[SIM_AIRFRAME_COUNT];

static void plant_select(void) {
  if (!plant_world_ready) {
    plant_build_world();
  }
  if (!(SIM_REAL & (SIM_REAL_INERTIA | SIM_REAL_GROUND | SIM_REAL_SAG))) {
    PLANT_P = &PLANT_TABLE[g_airframe];
    PLANT_W_P = &PLANT_WORLD[g_airframe];
    return;
  }
  for (int a = 0; a < SIM_AIRFRAME_COUNT; a += 1) {
    PlantParams t = PLANT_TABLE[a];
    if (SIM_REAL & SIM_REAL_INERTIA) {
      t.inertia[0] = t.inertia_real[0];
      t.inertia[1] = t.inertia_real[1];
      t.inertia[2] = t.inertia_real[2];
      t.j_rotor = t.j_rotor_real;
    }
    if (SIM_REAL & SIM_REAL_SAG) {
      t.r_cell = t.r_cell_real;
    }
    if (SIM_REAL & SIM_REAL_GROUND) {
      t.k_ground = t.k_ground_real;
    }
    PLANT_SEL[a] = t;
    plant_to_world(&t);
    PLANT_SEL_WORLD[a] = t;
  }
  PLANT_P = &PLANT_SEL[g_airframe];
  PLANT_W_P = &PLANT_SEL_WORLD[g_airframe];
}

void plant_set_realism(void) { plant_select(); }

void plant_real_forget(SimState *s, int pack_too) {
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    s->real_vi[m] = 0.0;
  }
  s->wake_depth = 0.0;
  s->wake_head = 0;
  s->wake_count = 0;
  if (pack_too) {
    s->pack_used_ah = 0.0;
    s->pack_vp = 0.0;
  }
}

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
/* The values are now .spin in the table above; the sign chain the comment
 * traces is unchanged and every airframe in the table shares it. */

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
/* The values are now .cant_radial_deg and .cant_tangent_deg in the table
 * above, per airframe, because a moulded 23 g frame does not hold its
 * motor mounts to the same tolerance a bolted carbon one does. */

/*
 * Unit thrust axes in the body frame, built from the cant table at first use.
 * Small angles, so the axis is (radial * rhat + tangent * that + zhat)
 * normalised; sim_sqrt is the only libm call and it is ours.
 */
static double PLANT_AXIS[SIM_AIRFRAME_COUNT][SIM_MOTOR_COUNT][3];
static int plant_axis_ready = 0;

/* The arcade airframe's axes: four thrust lines exactly vertical, the
 * frame no factory ever shipped. Selected per step by SIM_ARCADE so the
 * flag can flip between runs without a rebuild of anything. */
static const double PLANT_AXIS_FLAT[SIM_MOTOR_COUNT][3] = {
  { 0.0, 0.0, 1.0 }, { 0.0, 0.0, 1.0 }, { 0.0, 0.0, 1.0 }, { 0.0, 0.0, 1.0 },
};

/*
 * Every airframe's axes are built in one pass at first use rather than the
 * selected one's on demand, so the arithmetic does not depend on which
 * airframe a run happened to touch first. A cache whose CONTENTS depend on
 * call order is exactly the kind of thing that stops a replay reproducing,
 * and it is cheap to refuse to have one.
 */
static void plant_build_axes(void) {
  const double deg = 0.017453292519943295;
  for (int a = 0; a < SIM_AIRFRAME_COUNT; a += 1) {
    const PlantParams *P = &PLANT_TABLE[a];
    for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
      const double x = P->pos_x[m];
      const double y = P->pos_y[m];
      const double len = sim_sqrt(x * x + y * y);
      const double rx = x / len;
      const double ry = y / len;
      /* Counter clockwise tangential direction, spin independent. */
      const double tx = -ry;
      const double ty = rx;
      const double er = P->cant_radial_deg[m] * deg;
      const double et = P->cant_tangent_deg[m] * deg;
      double vx = er * rx + et * tx;
      double vy = er * ry + et * ty;
      double vz = 1.0;
      const double n = sim_sqrt(vx * vx + vy * vy + vz * vz);
      PLANT_AXIS[a][m][0] = vx / n;
      PLANT_AXIS[a][m][1] = vy / n;
      PLANT_AXIS[a][m][2] = vz / n;
    }
  }
  plant_axis_ready = 1;
}

void plant_set_airframe(int id) {
  if (id < 0 || id >= SIM_AIRFRAME_COUNT) {
    return;
  }
  g_airframe = id;
  plant_select();
}

int plant_airframe(void) { return g_airframe; }
/* .pos_x and .pos_y live in the table above. */

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
/* .pos_z lives in the table above: 0.020 on the five inch, 0.006 on the
 * whoop, which is a machine 23 mm thick from duct floor to canopy. */

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
/* PLANT_TORQUE_IND is .torque_ind in the airframe table now: it IS the
 * figure of merit kq was derived through, so it moves with the rotor. */
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
/* Duct taps, for the same reason: the duct terms are the whoop's whole
 * character and a gate that INFERS them from a trajectory measures the
 * pilot's flying, not the model. Motor 0's applied augmentation factor and
 * the in plane air speed it saw, plus the total nose up couple the rotor
 * plane and the lips produce between them, in newton metres. */
double PLANT_DBG_DUCT;
double PLANT_DBG_VPERP;
double PLANT_DBG_PITCH_UP;

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

/*
 * 3D PROPS, which is what a quad flown in 3D mode wears, and they are why it
 * is a little slower than the race quad it otherwise is.
 *
 * A race prop has a cambered blade with one leading edge. Spun backwards it
 * still pushes, but badly: a bench test of a 7x5 run both ways measured 0.59
 * kgf reversed against 0.81 forward, with 30 to 50 percent less thrust per
 * watt. A 3D prop is symmetric, two leading edges and no camber, so it makes
 * the same thrust whichever way it turns, and it pays for that in both
 * directions: the hobby figure is up to 30 percent less efficient than a
 * one way prop. 0.85 of the race prop's thrust at the same shaft speed is
 * the estimate taken here. The torque is left as it is, so at a given thrust
 * the motor spins faster and draws more, which puts the efficiency loss at
 * about 22 percent, inside that band. It is an estimate from two sources and
 * not a measurement, and it is written down as one.
 *
 * Applied only in 3D mode, both directions alike.
 */
#define PLANT_3D_PROP_THRUST 0.85

static void plant_build_real(void) {
  for (int a = 0; a < SIM_AIRFRAME_COUNT; a += 1) {
    const PlantParams *P = &PLANT_TABLE[a];
    PlantReal r;
    r.ci = sim_sqrt(P->kt / (2.0 * P->rho * 3.14159265358979323846 * P->prop_r * P->prop_r));
    r.k = P->k_inflow / r.ci - 1.0;
    if (r.k < 0.2) {
      r.k = 0.2;
    }
    /* The onset and the floor where they always were, in pitch speed: one
     * pitch speed is 1 + k of vi0. */
    r.x_on = -PLANT_VRS_ONSET * (1.0 + r.k);
    r.x_full = -PLANT_VRS_FULL * (1.0 + r.k);
    r.t_on = 1.0 - (r.x_on + plant_real_y(r.x_on, 0.0, r.k) - 1.0) / r.k;
    r.wake_r = sim_sqrt(P->arm_x * P->arm_x + P->arm_y * P->arm_y) + P->prop_r;
    PLANT_REAL[a] = r;
  }
  plant_real_ready = 1;
}

/*
 * The steady inflow solve, for a check to sweep without flying it: what 0
 * is the thrust factor at axial speed x and edgewise speed xp (both over
 * vi0), ring state ramp included; 1 is y, the induced velocity over vi0;
 * 2 is the blade element constant k of the airframe in force; 3 is
 * PLANT_REAL_EDGE, so the check can solve the same pair.
 */
double plant_real_curve(int what, double x, double xp) {
  if (!plant_real_ready) {
    plant_build_real();
  }
  const PlantReal *R = &PLANT_REAL[g_airframe];
  if (what == 2) {
    return R->k;
  }
  if (what == 3) {
    return PLANT_REAL_EDGE;
  }
  const double xs = (x < R->x_on) ? R->x_on : x;
  const double y = plant_real_y(xs, PLANT_REAL_EDGE * xp, R->k);
  if (what == 1) {
    return y;
  }
  double axial = 1.0 - (xs + y - 1.0) / R->k;
  if (axial < 0.0) {
    axial = 0.0;
  }
  if (x < R->x_on) {
    double kk = (R->x_on - x) / (R->x_on - R->x_full);
    if (kk > 1.0) {
      kk = 1.0;
    }
    axial *= 1.0 - (1.0 - PLANT_VRS_FLOOR / R->t_on) * kk;
  }
  return axial;
}

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
  /* No floor until the host raises one. See ground_h in sim_internal.h. */
  s->ground_h = -1.0;
  s->ground_n[0] = 0.0;
  s->ground_n[1] = 0.0;
  s->ground_n[2] = 1.0;
  s->step_index = 0;
  /* A reset is a fresh pack and still air. */
  plant_real_forget(s, 1);
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

/*
 * THE WAKE TRAIL: how deep the craft is in its own old downwash, then,
 * every 50 ms, one more puff of it left behind. See WAKE at PLANT_REAL.
 *
 * A puff shed at speed v along a unit direction has travelled
 * v tau t / (t + tau) after t seconds, which is a jet whose speed falls as
 * 1 / (1 + t/tau)^2: closed form, so nothing is integrated per puff and
 * nothing transcendental is called. Its radius grows with the distance
 * travelled and its turbulence falls with age and with that spreading.
 * Consecutive puffs are joined, so a fast pass leaves a line rather than
 * a row of dots a craft could fly between. The depth is the strongest
 * such stretch the craft is inside, over the induced velocity the rotors
 * are making now, capped at one: a rotor working hard shrugs off an old
 * weak wake and a rotor at low throttle does not.
 */
static void plant_wake_step(SimState *s) {
  const PlantReal *R = &PLANT_REAL[g_airframe];
  const double len = PLANT.len_scale;
  const double inv_len = 1.0 / len;
  const double w_mean = 0.25 * (sim_fabs(s->motor_omega[0]) + sim_fabs(s->motor_omega[1])
    + sim_fabs(s->motor_omega[2]) + sim_fabs(s->motor_omega[3]));
  const double vi_now = R->ci * (w_mean < 60.0 ? 60.0 : w_mean);
  double best = 0.0;
  int have_prev = 0;
  double prev_c[3] = { 0.0, 0.0, 0.0 };
  double prev_r = 0.0;
  double prev_u = 0.0;
  const int n = s->wake_count;
  for (int k = 0; k < n; k += 1) {
    /* Oldest first, so each puff is joined to the one shed after it. */
    const int i = (s->wake_head - n + k + 2 * SIM_WAKE_N) & (SIM_WAKE_N - 1);
    const double v = s->wake_v[i];
    const double age = (double)(s->step_index - s->wake_t[i]) * SIM_DT;
    if (v <= 0.0 || age < PLANT_WAKE_MIN_AGE) {
      have_prev = 0;
      continue;
    }
    const double travel = v * PLANT_WAKE_JET_TAU * age / (age + PLANT_WAKE_JET_TAU);
    const double c[3] = {
      s->wake_p[i][0] + s->wake_u[i][0] * travel * len,
      s->wake_p[i][1] + s->wake_u[i][1] * travel * len,
      s->wake_p[i][2] + s->wake_u[i][2] * travel * len,
    };
    const double rad = R->wake_r + PLANT_WAKE_SPREAD * travel;
    /* v (R / rad) / (1 + age / tau), as one division. */
    const double turb = (v * R->wake_r * PLANT_WAKE_TURB_TAU) / (rad * (PLANT_WAKE_TURB_TAU + age));
    /* The nearest point of the stretch from the last puff to this one. */
    double near_c[3] = { c[0], c[1], c[2] };
    double near_r = rad;
    double near_u = turb;
    if (have_prev) {
      const double ex = c[0] - prev_c[0];
      const double ey = c[1] - prev_c[1];
      const double ez = c[2] - prev_c[2];
      const double e2 = ex * ex + ey * ey + ez * ez;
      if (e2 > 1e-12) {
        double t = ((s->pos[0] - prev_c[0]) * ex + (s->pos[1] - prev_c[1]) * ey
          + (s->pos[2] - prev_c[2]) * ez) / e2;
        if (t < 0.0) {
          t = 0.0;
        }
        if (t > 1.0) {
          t = 1.0;
        }
        near_c[0] = prev_c[0] + ex * t;
        near_c[1] = prev_c[1] + ey * t;
        near_c[2] = prev_c[2] + ez * t;
        near_r = prev_r + (rad - prev_r) * t;
        near_u = prev_u + (turb - prev_u) * t;
      }
    }
    const double dx = (s->pos[0] - near_c[0]) * inv_len;
    const double dy = (s->pos[1] - near_c[1]) * inv_len;
    const double dz = (s->pos[2] - near_c[2]) * inv_len;
    const double d2 = dx * dx + dy * dy + dz * dz;
    const double r2 = near_r * near_r;
    if (d2 < r2) {
      const double u = near_u * (1.0 - d2 / r2);
      if (u > best) {
        best = u;
      }
    }
    have_prev = 1;
    prev_c[0] = c[0];
    prev_c[1] = c[1];
    prev_c[2] = c[2];
    prev_r = rad;
    prev_u = turb;
  }
  double depth = best / vi_now;
  if (depth > 1.0) {
    depth = 1.0;
  }
  s->wake_depth = depth;

  if (s->step_index % PLANT_WAKE_EMIT_STEPS == 0) {
    /* Shed one. The far wake of a rotor making kt w^2 moves at twice the
     * induced velocity, along the way the thrust is not pointing. A wake
     * too slow to matter is kept as a gap, so the trail is not joined
     * across it. */
    const double w2 = 0.25 * (s->motor_omega[0] * s->motor_omega[0] + s->motor_omega[1] * s->motor_omega[1]
      + s->motor_omega[2] * s->motor_omega[2] + s->motor_omega[3] * s->motor_omega[3]);
    const double v_wake = 2.0 * R->ci * sim_sqrt(w2);
    const double down_b[3] = { 0.0, 0.0,
      (SIM_3D && (s->motor_omega[0] + s->motor_omega[1] + s->motor_omega[2] + s->motor_omega[3]) < 0.0) ? 1.0 : -1.0 };
    double down_w[3];
    quat_rotate(s->quat, down_b, down_w);
    const int h = s->wake_head;
    s->wake_p[h][0] = s->pos[0];
    s->wake_p[h][1] = s->pos[1];
    s->wake_p[h][2] = s->pos[2];
    s->wake_u[h][0] = down_w[0];
    s->wake_u[h][1] = down_w[1];
    s->wake_u[h][2] = down_w[2];
    s->wake_v[h] = (v_wake >= PLANT_WAKE_MIN_SPEED) ? v_wake : 0.0;
    s->wake_t[h] = s->step_index;
    s->wake_head = (h + 1) % SIM_WAKE_N;
    if (s->wake_count < SIM_WAKE_N) {
      s->wake_count += 1;
    }
  }
}

/*
 * The open circuit voltage of one LiPo cell against the charge left in it,
 * the resting figures every charger's chart prints, joined by straight
 * lines. Below empty it falls away fast, as a cell does.
 */
#define PLANT_OCV_N 13
static const double PLANT_OCV_SOC[PLANT_OCV_N] = {
  -0.05, 0.00, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00,
};
static const double PLANT_OCV_V[PLANT_OCV_N] = {
  2.80, 3.27, 3.61, 3.69, 3.73, 3.77, 3.80, 3.84, 3.87, 3.95, 4.02, 4.11, 4.20,
};

static double plant_ocv(double soc) {
  if (soc <= PLANT_OCV_SOC[0]) {
    return PLANT_OCV_V[0];
  }
  for (int i = 1; i < PLANT_OCV_N; i += 1) {
    if (soc <= PLANT_OCV_SOC[i]) {
      const double u = (soc - PLANT_OCV_SOC[i - 1]) / (PLANT_OCV_SOC[i] - PLANT_OCV_SOC[i - 1]);
      return PLANT_OCV_V[i - 1] + (PLANT_OCV_V[i] - PLANT_OCV_V[i - 1]) * u;
    }
  }
  return PLANT_OCV_V[PLANT_OCV_N - 1];
}

/* And the other way: the charge a resting cell at this voltage holds. */
static double plant_soc_of(double volts) {
  if (volts <= PLANT_OCV_V[0]) {
    return PLANT_OCV_SOC[0];
  }
  for (int i = 1; i < PLANT_OCV_N; i += 1) {
    if (volts <= PLANT_OCV_V[i]) {
      const double u = (volts - PLANT_OCV_V[i - 1]) / (PLANT_OCV_V[i] - PLANT_OCV_V[i - 1]);
      return PLANT_OCV_SOC[i - 1] + (PLANT_OCV_SOC[i] - PLANT_OCV_SOC[i - 1]) * u;
    }
  }
  return PLANT_OCV_SOC[PLANT_OCV_N - 1];
}

/*
 * The pack's open circuit voltage with the switch on: the host's cell
 * voltage is where the flight starts, and it comes down the curve from
 * there by the charge used. Written as the start plus the curve's own
 * fall, so with nothing used it is the host's number exactly, and a pack
 * charged past 4.2 keeps its extra.
 */
static double plant_pack_voc(const SimState *s) {
  const double soc0 = plant_soc_of(s->cell_voltage_oc);
  const double used = s->pack_used_ah / PLANT.pack_ah;
  const double cell = s->cell_voltage_oc + (plant_ocv(soc0 - used) - plant_ocv(soc0));
  return cell * PLANT.cells - s->pack_vp;
}

static inline __attribute__((always_inline)) void plant_step_body(SimState *s, const double duty_in[SIM_MOTOR_COUNT], const int mode3d, const int real) {
  /*
   * REALISTIC PHYSICS. `real` is a literal at each call, like mode3d, so in
   * the copies built with 0 every line below that names it is folded away
   * and the step is the one it was. In the copies built with 1 each bit of
   * SIM_REAL is read once, here.
   */
  const int real_inflow = real && (SIM_REAL & SIM_REAL_INFLOW);
  const int real_wake = real && (SIM_REAL & SIM_REAL_WAKE);
  const int real_pack = real && (SIM_REAL & SIM_REAL_PACK);
  const int real_tandem = real_inflow && (SIM_REAL & SIM_REAL_TANDEM);
  const int real_dyn = real_inflow && (SIM_REAL & SIM_REAL_DYNINFLOW);
  if (real) {
    if (!plant_real_ready) {
      plant_build_real();
    }
    if (real_wake && s->step_index % PLANT_WAKE_EVAL_STEPS == 0) {
      plant_wake_step(s);
    }
  }

  /*
   * 0. The motor as the pilot has wound it. SIM_MOTOR_KV scales kV, so the
   * back EMF constant goes down by that much and the winding resistance by
   * its square (sim_internal.h has the reasoning). These two are the only
   * place the scale enters, and every use of ke and r_motor below reads
   * them. At 1.0, x / 1.0 is x and 1.0 * 1.0 is 1.0 for every finite double,
   * so the machine that shipped is unmoved bit for bit; the plant golden
   * measures that.
   */
  const double kv = SIM_MOTOR_KV;
  const double ke_eff = PLANT.ke / kv;
  const double r_motor_eff = PLANT.r_motor / (kv * kv);

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
  /* A bidirectional ESC in 3D mode drives either way: the duty is signed,
   * and a negative one is a reversed voltage on the winding. The solve below
   * is already right for that, because d^2 and d ke w do not care which way
   * round the bridge is. */
  const double d_min = mode3d ? -1.0 : 0.0;
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    double d = duty_in[m];
    if (d < d_min) {
      d = d_min;
    }
    if (d > 1.0) {
      d = 1.0;
    }
    duty[m] = d;
    sumA += d * d;
    sumB += d * ke_eff * s->motor_omega[m];
  }
  const double v_oc = real_pack ? plant_pack_voc(s) : s->cell_voltage_oc * PLANT.cells;
  double v_load = (v_oc + (r_pack * sumB) / r_motor_eff) /
                  (1.0 + (r_pack * sumA) / r_motor_eff);
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
  const double (*AXIS)[3] = SIM_ARCADE ? PLANT_AXIS_FLAT : PLANT_AXIS[g_airframe];
  double thrust[SIM_MOTOR_COUNT];
  /* Which way along the motor axis each rotor pushes: +1 always, unless 3D
   * mode has it spinning backwards. thrust[] stays a magnitude, because the
   * rotor drag below wants one. */
  double thrust_dir[SIM_MOTOR_COUNT];
  double stator_torque[3] = { 0.0, 0.0, 0.0 }; /* reaction on the frame */
  double h_prop[3] = { 0.0, 0.0, 0.0 };        /* net prop angular momentum */
  double pack_current = 0.0;
  const double p = s->omega[0];
  const double q = s->omega[1];
  const double r = s->omega[2];
  /* Axial inflow needs the body frame velocity before the motor loop. */
  double v_body[3];
  quat_rotate_inv(s->quat, s->vel, v_body);
  /* Scene metres to the airframe's own: the air sees the whoop's real speed. */
  const double len = PLANT.len_scale;
  v_body[0] = v_body[0] / len;
  v_body[1] = v_body[1] / len;
  v_body[2] = v_body[2] / len;

  /*
   * What the tandem term needs that is the same for all four rotors, once a
   * step: the unit direction of the craft's speed across the discs, and,
   * for each rotor as a source, its induced velocity as it stood a step
   * ago times how edgewise the flow is. See TANDEM in the rotor loop.
   */
  const double dyn_gain = real_dyn ? SIM_DT / (PLANT_REAL_DYN * PLANT.prop_r) : 0.0;
  int tandem_on = 0;
  double tandem_ux = 0.0;
  double tandem_uy = 0.0;
  double tandem_inv_vp_r = 0.0;
  double tandem_inv_2r = 0.0;
  double tandem_vi[SIM_MOTOR_COUNT] = { 0.0, 0.0, 0.0, 0.0 };
  double tandem_src[SIM_MOTOR_COUNT] = { 0.0, 0.0, 0.0, 0.0 };
  if (real_tandem) {
    const double vp2 = v_body[0] * v_body[0] + v_body[1] * v_body[1];
    if (vp2 > 0.01) {
      const double inv_vp = 1.0 / sim_sqrt(vp2);
      tandem_on = 1;
      tandem_ux = v_body[0] * inv_vp;
      tandem_uy = v_body[1] * inv_vp;
      tandem_inv_vp_r = inv_vp / PLANT.prop_r;
      tandem_inv_2r = 0.5 / PLANT.prop_r;
      for (int o = 0; o < SIM_MOTOR_COUNT; o += 1) {
        const double vi_o = s->real_vi[o];
        tandem_vi[o] = vi_o;
        tandem_src[o] = PLANT_REAL_TANDEM * vi_o * vp2 / (vp2 + vi_o * vi_o);
      }
    }
  }

  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    const double d = duty[m];
    /*
     * 3D MODE: A ROTOR CAN SPIN BACKWARDS, and then everything the air does
     * to it happens along the other end of its axis. The signed speed drives
     * the rotor equation, the reaction torques and the gyroscopic term, which
     * already carry their own signs; the aerodynamics below are written for a
     * rotor pushing along +z, so they get the speed's magnitude and the axial
     * inflow measured along the way this rotor is actually pushing. A 3D prop
     * is symmetric, so that mirror is the whole of it.
     *
     * In normal mode the speed is never negative, rotor_dir is 1.0, and a
     * multiply by 1.0 is the identity in IEEE 754, so every number below is
     * the one it was.
     */
    const double w_signed = s->motor_omega[m];
    const double rotor_dir = (mode3d && w_signed < 0.0) ? -1.0 : 1.0;
    const double w = rotor_dir * w_signed;
    /* Prop speed relative to the air about body z, including body yaw. */
    const double w_rel = PLANT_SPIN[m] * w_signed + r;
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
    const double va_own = (v_body[2] + v_rot) * rotor_dir;
    /*
     * TANDEM: the air this rotor is handed by the ones upwind of it. See
     * PLANT_REAL. Each other rotor's wake leaves along the relative wind
     * and sinks at the flow through its disc, so it arrives here offset
     * across the wind by c and below the disc by h, and what it adds is
     * that rotor's induced velocity as it stood a step ago, descending.
     */
    double v_int = 0.0;
    if (real_tandem) {
      if (tandem_on) {
        for (int o = 0; o < SIM_MOTOR_COUNT; o += 1) {
          if (o == m) {
            continue;
          }
          const double ddx = PLANT_POS_X[m] - PLANT_POS_X[o];
          const double ddy = PLANT_POS_Y[m] - PLANT_POS_Y[o];
          /* Downwind distance: the wake goes the way the craft is not. */
          const double along = -(ddx * tandem_ux + ddy * tandem_uy);
          if (along <= 0.0) {
            continue;
          }
          const double across = sim_fabs(ddx * tandem_uy - ddy * tandem_ux);
          const double w_c = 1.0 - across * tandem_inv_2r;
          if (w_c <= 0.0) {
            continue;
          }
          const double vi_o = tandem_vi[o];
          const double hr = (v_body[2] * rotor_dir + vi_o) * along * tandem_inv_vp_r;
          v_int += tandem_src[o] * w_c / (1.0 + hr * hr);
        }
      }
      if (m == 0) {
        PLANT_DBG_REAL[2] = v_int;
      }
    }
    const double va = real_tandem ? va_own + v_int : va_own;
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
    /* In plane air speed at this rotor. Hoisted out of the translational
     * lift block below because the duct fade reads the same number, and two
     * places computing the same square root is how they drift apart. */
    const double vx_r = v_body[0] - r * PLANT_POS_Y[m];
    const double vy_r = v_body[1] + r * PLANT_POS_X[m];
    const double vperp_m = sim_sqrt(vx_r * vx_r + vy_r * vy_r);
    double axial_gain = 0.0;
    {
      const double vperp = vperp_m;
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
    /*
     * EDGEWISE AIR CARRIES THE WAKE AWAY, and with the switch on the ring
     * state knows it. A rotor is in its own wake only while the air leaves
     * it slowly: sink at about the induced velocity with little speed
     * across the disc. Give it one induced velocity of edgewise speed and
     * the wake is swept off behind before the disc can sink into it, which
     * is the whole of the advice every pilot is given, come down moving
     * forward and it will not wobble. The published ring state boundaries
     * (Johnson's model is the usual one) close at about that speed. So the
     * thrust loss and the shake both fade as one minus the square of the
     * edgewise speed over the induced velocity, to nothing at one. The
     * plant without the switch fires both at any forward speed.
     */
    double real_flush = 1.0;
    if (real) {
      const double xf = vperp_m / ((w < 60.0 ? 60.0 : w) * PLANT_REAL[g_airframe].ci);
      real_flush = (xf < 1.0) ? 1.0 - xf * xf : 0.0;
    }
    if (real_inflow) {
      /*
       * THE COUPLED SOLVE, in place of every branch below and of the
       * translational lift term, which it contains. See INFLOW at
       * PLANT_REAL. Everything is over vi0, the induced velocity kt w^2
       * implies at rest, with the same floor on w the pitch speed has.
       */
      const PlantReal *R = &PLANT_REAL[g_airframe];
      const double vi0 = (w < 60.0 ? 60.0 : w) * R->ci;
      const double x = va / vi0;
      const double xp = PLANT_REAL_EDGE * vperp_m / vi0;
      /* Past the ring state onset the solve is held at the onset and the
       * loss is the old ramp, measured in the same pitch speed. */
      const double xs = (x < R->x_on) ? R->x_on : x;
      const double y_ss = plant_real_y(xs, xp, R->k);
      double vi = y_ss * vi0;
      if (real_dyn) {
        /* The air's own lag: 4/(3 pi) R over the flow through the disc,
         * taken implicitly so the step is stable however short it is. */
        /* The speed is the two parts added rather than squared and
         * rooted: a time constant of a millisecond or two does not need
         * the square root, and this is on every rotor of every step. */
        const double thru = va + 2.0 * vi;
        double vm = vperp_m + sim_fabs(thru);
        if (vm < 0.5) {
          vm = 0.5;
        }
        const double a_lag = vm * dyn_gain;
        vi = (s->real_vi[m] + a_lag * vi) / (1.0 + a_lag);
      }
      s->real_vi[m] = vi;
      axial = 1.0 - (xs + vi / vi0 - 1.0) / R->k;
      if (axial < 0.0) {
        axial = 0.0;
      }
      if (x < R->x_on) {
        double kk = (R->x_on - x) / (R->x_on - R->x_full);
        if (kk > 1.0) {
          kk = 1.0;
        }
        axial *= 1.0 - (1.0 - PLANT_VRS_FLOOR / R->t_on) * kk * real_flush;
      }
      if (m == 0) {
        PLANT_DBG_REAL[1] = vi;
      }
    } else if (mu >= 0.0) {
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
    if (!real_inflow) {
      axial += axial_gain;
    }
    /* With the switch on the shake is in two places: the ring state round
     * the disc itself, which edgewise air flushes, and the craft's own old
     * wake wherever it was left. Whichever is deeper. See WAKE at
     * PLANT_REAL. */
    if (real_wake) {
      wash_depth *= real_flush;
      if (s->wake_depth > wash_depth) {
        wash_depth = s->wake_depth;
      }
      if (m == 0) {
        PLANT_DBG_REAL[6] = wash_depth;
      }
    }
    if (axial < 1.0 && !SIM_ARCADE && SIM_PROPWASH) {
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
    if (wash_depth > 0.0 && !SIM_ARCADE && SIM_PROPWASH) {
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
     * THE DUCT, AND WHY IT STOPS WORKING THE MOMENT YOU GO ANYWHERE.
     *
     * A shroud round a rotor removes the wake contraction a free rotor
     * suffers: the slipstream leaves at the duct's exit area instead of
     * squeezing to half the disc, so for the same shaft power the rotor
     * moves more air more slowly and makes more thrust. The ideal result
     * for an exit area equal to the disc is 2^(1/3), about 1.26, and no
     * real duct is close, because a tip gap lets the pressure difference
     * short circuit round the blade. This whoop's gap is about three
     * percent of the throat, which is large, and 1.10 is what that earns.
     *
     * The fade is the important half. A duct only removes contraction while
     * the flow it is shaping goes THROUGH it. Fly sideways and the stream
     * tube leaves through the wall instead of the exit, the lip separates,
     * and the augmentation goes with it. duct_fade is where half of it has
     * gone, measured in the rotor's own induced velocity so it scales with
     * thrust rather than being a fixed speed: on this whoop that is about
     * 5.6 m/s in a hover. It is the single most characteristic thing about
     * flying a whoop. It hangs in the air beautifully and then feels like it
     * is wading the instant it is moving, and this is the term that does it.
     *
     * The five inch's k_duct is 1.0 and its duct_fade is 0, so the branch is
     * not taken and the multiply below is by exactly 1.0, which in IEEE 754
     * is the identity. That is what keeps its trace bit identical.
     */
    double duct = PLANT.k_duct;
    if (PLANT.duct_fade > 0.0) {
      const double t_ideal = PLANT.kt * w * w;
      if (t_ideal > 1e-6) {
        const double vh = sim_sqrt(t_ideal / (2.0 * PLANT.rho * 3.14159265358979323846 *
                                              PLANT.prop_r * PLANT.prop_r));
        const double xr = vperp_m / (PLANT.duct_fade * vh);
        duct = 1.0 + (PLANT.k_duct - 1.0) / (1.0 + xr * xr);
      }
    }
    /* A duct is shaped for air going one way through it, lip in front. Run
     * backwards the lip is at the exit and the gain is gone. Only a 3D whoop
     * spinning backwards reaches this. */
    if (rotor_dir < 0.0) {
      duct = 1.0;
    }
    axial *= duct;
    /*
     * The thrust factor the TORQUE below is charged for, taken before the
     * ground effect goes on. A rotor in ground effect makes its extra thrust
     * at the same shaft speed and draws the same current: the image rotor
     * raises the thrust by the same factor it lowers the induced velocity,
     * so T v_i, the induced power, does not move. Charging the torque for
     * the augmented thrust (which this did, for the whole of the term's
     * first week) made the induced load go as the factor to the three
     * halves, 18 percent more torque at the parked height, so the motor
     * slowed, the cushion came out a quarter weaker than the number above
     * says, and the pack current ROSE on the floor where a bench shows it
     * falling. The five inch's k_ground is zero, so for it the two factors
     * are the same double and its trace is bit identical.
     */
    const double axial_oge = axial;
    /*
     * GROUND EFFECT, per rotor, on the thrust only. See axial_oge above for
     * why the torque load does not see it.
     *
     * The rotor's own height above the plane, not the CG's: a banked whoop
     * has one duct nearer the mat than the other and the near one gets the
     * cushion, which is a rolling moment away from the floor and part of why
     * a low hover feels planted. The offset is rotated by the attitude and
     * projected on the plane's normal. Off entirely when the host has
     * raised no plane, and on the five inch, whose k_ground is zero.
     *
     * AND ONLY FOR A ROTOR WHOSE WAKE REACHES THE FLOOR. The image rotor is
     * the wake stagnating against the plane, so it exists for a disc whose
     * thrust axis points away from the floor and not for one that points at
     * it: a whoop on its back with the throttle up is blowing its wake at
     * the ceiling, and the first version handed that rotor the full parked
     * factor too, pinning an inverted craft to the mat a third harder than
     * its own thrust did. The augmentation is scaled by the cosine between
     * the rotor axis and the plane's normal, which is exact level, nothing
     * at ninety degrees and nothing inverted, and continuous between. The
     * cosine is an assumption about how the image weakens with tilt, not a
     * derivation, and it is written down as one.
     */
    if (PLANT.k_ground > 0.0 && s->ground_h >= 0.0) {
      const double up_b[3] = { 0.0, 0.0, 1.0 };
      double up_w[3];
      quat_rotate(s->quat, up_b, up_w);
      /* A reversed rotor's wake leaves through the top of the craft, so it is
       * the top that has to face the floor for the cushion to form. */
      const double facing = (s->ground_n[0] * up_w[0] + s->ground_n[1] * up_w[1]
        + s->ground_n[2] * up_w[2]) * rotor_dir;
      if (facing > 0.0) {
        const double off_b[3] = { PLANT_POS_X[m], PLANT_POS_Y[m], PLANT_POS_Z[m] };
        double off_w[3];
        quat_rotate(s->quat, off_b, off_w);
        const double h = s->ground_h / len
          + s->ground_n[0] * off_w[0] + s->ground_n[1] * off_w[1] + s->ground_n[2] * off_w[2];
        const double r_eff = 2.0 * PLANT.prop_r;
        /* Half a radius is the pole of the form; a rotor lower than that is
         * one a contact has pushed into the floor and it gets the parked
         * figure rather than a larger one. */
        const double hh = (h < 0.5 * r_eff) ? 0.5 * r_eff : h;
        const double x = r_eff / (4.0 * hh);
        const double ige = 1.0 / (1.0 - PLANT.k_ground * x * x);
        axial *= 1.0 + (ige - 1.0) * facing;
      }
    }
    if (m == 0) {
      PLANT_DBG_DUCT = duct;
      PLANT_DBG_VPERP = vperp_m;
      if (real) {
        PLANT_DBG_REAL[5] = axial;
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
    double q_mag = (1.0 - PLANT.torque_ind) * qb_mag;
    {
      const double t_load = PLANT.kt * w * w * axial_oge;
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
    const double i = (d * v_load - ke_eff * w_signed) / r_motor_eff;
    /* Rotor sees the drag torque resisting its own spin direction. */
    const double torque = ke_eff * i - PLANT_SPIN[m] * drag_mag;
    double w_next = w_signed + (torque / PLANT.j_rotor) * SIM_DT;
    /* A one way ESC cannot drive a motor backwards, so normal mode stops it
     * at zero. A 3D ESC brakes it through zero and on the other way. */
    if (w_next < 0.0 && !mode3d) {
      w_next = 0.0;
    }
    s->motor_omega[m] = w_next;
    double t = PLANT.kt * w_next * w_next * axial;
    if (t < 0.0) {
      t = 0.0;
    }
    if (mode3d) {
      t *= PLANT_3D_PROP_THRUST;
    }
    thrust[m] = t;
    thrust_dir[m] = rotor_dir;
    /* Frame feels minus the stator drive torque, about the MOTOR's axis
     * rather than about body z, because the axes are not parallel. */
    const double st = -PLANT_SPIN[m] * ke_eff * i;
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
  if (real_pack) {
    /* What this step drew comes out of the pack, and the slow half of the
     * sag moves toward what this current would hold it at. */
    s->pack_used_ah += pack_current * (SIM_DT / 3600.0);
    s->pack_vp += (SIM_DT / PLANT_PACK_TAU)
      * (pack_current * PLANT.r_cell_slow * PLANT.cells - s->pack_vp);
  }
  if (real) {
    PLANT_DBG_REAL[0] = s->wake_depth;
    PLANT_DBG_REAL[3] = s->pack_used_ah;
    PLANT_DBG_REAL[4] = s->pack_vp;
  }

  /*
   * 3. Body frame forces: thrust along +z, quadratic drag per axis.
   *
   * SIM_AIR scales every term the air uses to slow this craft down, and it
   * is applied HERE rather than folded into the table because the table is
   * the airframe and this is the pilot's knob. See sim_internal.h for what
   * it does and does not touch. At 1.0 each product below is the same IEEE
   * double the constant was, so the shipped machine is unmoved.
   */
  const double air = SIM_AIR;
  const double cda[3] = {
    PLANT.cda_front * air, PLANT.cda_side * air, PLANT.cda_plan * air,
  };
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
    const double tf = thrust_dir[m] * thrust[m];
    f_body[0] += tf * AXIS[m][0];
    f_body[1] += tf * AXIS[m][1];
    f_body[2] += tf * AXIS[m][2];
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
    const double h = PLANT.k_rotor_drag * air * PLANT.rho * disc_area * vi * vperp;
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
    /*
     * DUCT LIP SUCTION, WHICH IS WHY A DUCTED MACHINE PITCHES UP.
     *
     * A shroud in edgewise flow does not meet the air symmetrically. The
     * upwind lip turns the stream sharply into the throat and carries a
     * large suction peak doing it; the downwind lip is in separated wake and
     * carries almost nothing. The result is an upward force AHEAD of the
     * duct's centre, which is a nose up moment, and it is the single best
     * known handling characteristic of ducted fan aircraft: every one of
     * them, from the X-22A to a tiny whoop, pitches up into the wind and has
     * to be trimmed out of it.
     *
     * M = Cm q A D, the standard form, with q the free stream dynamic
     * pressure at this rotor, A the disc area and D the duct diameter. The
     * in plane speed the rotor actually sees is used rather than the craft's
     * airspeed, so a hover is exactly zero by construction and the hover,
     * punch, sag and rate checks cannot move; a yaw rate also feeds it,
     * which is right, because a yawing duct really does see edgewise flow.
     *
     * Sign: the moment tips the duct axis toward the free stream. With the
     * unit in plane direction u the upward force acts at +u, so
     * tau = r x F gives tau_x = +M u_y and tau_y = -M u_x. In this frame a
     * negative pitch torque is nose UP (a positive rotation about +y tips
     * the nose toward -z), so flying forward gives nose up, and sliding left
     * rolls away from the slide. Both are what a ducted machine does.
     *
     * The five inch's k_duct_lip is 0, so the branch is never taken.
     */
    if (PLANT.k_duct_lip > 0.0) {
      const double m_lip = PLANT.k_duct_lip * 0.5 * PLANT.rho * vperp * vperp *
                           disc_area * (2.0 * PLANT.prop_r);
      rotor_drag_tau[0] += m_lip * (vy / vperp);
      rotor_drag_tau[1] -= m_lip * (vx / vperp);
    }
  }

  /*
   * 3c. THE DESCENT HALF OF THE ROTOR'S DRAG, WHICH 3b DOES NOT COVER.
   *
   * 3b is the H force and it says so at length: only the IN PLANE component
   * matters, so a climb or a dive through the disc is untouched. That is the
   * right shape for an open rotor's edgewise drag and it was fitted as one.
   * What it leaves out is what the disc does to air coming at it ALONG the
   * shaft, and for a ducted whoop that is the difference between a controlled
   * sink and a stone.
   *
   * A rotor in its own wake past the point where the wake breaks down is not
   * a propulsor any more. The blades are stalled, the flow through the disc
   * is reversed, and the thing acts as a bluff plate of roughly its own disc
   * area. plant.c already models the THRUST half of that, in the vortex ring
   * branch above, which rolls thrust down to PLANT_VRS_FLOOR. It never
   * modelled the DRAG half, so a rotor deep in the broken wake produced a
   * reduced thrust and no resistance at all, and a whoop, whose four discs
   * are larger than its entire solid plan silhouette, fell as if it had no
   * rotors on it.
   *
   * DESCENT ONLY, and the ramp is the same criterion the wash uses: nothing
   * below a quarter of the rotors' own induced velocity, where the wake is
   * still healthy and the disc is still a propulsor, rising to all of it by
   * the point the descent matches the induced velocity and the wake is gone.
   * At and above a hover it is exactly zero, which is what keeps every hover,
   * punch, climb and rate figure in the calibrated set where it was.
   *
   * ONE FORCE ON THE AIRCRAFT, not four on the rotors, and deliberately: a
   * roll rate moves the four discs vertically at different speeds, so a per
   * rotor version would add an aerodynamic rate damping term that nobody has
   * measured. This is a pure force through the CG with no moment, which is
   * the smallest honest version of the effect.
   *
   * The five inch's k_rotor_axial is 0 and the branch is never entered, so
   * its trace is bit identical. See the note on that field.
   */
  /* A 3D whoop pushing mostly backwards sinks the other way through its
   * discs, so the brake is measured along the way the thrust is going. */
  double axial_dir = 1.0;
  if (mode3d) {
    const double t_net = thrust_dir[0] * thrust[0] + thrust_dir[1] * thrust[1]
      + thrust_dir[2] * thrust[2] + thrust_dir[3] * thrust[3];
    if (t_net < 0.0) {
      axial_dir = -1.0;
    }
  }
  if (PLANT.k_rotor_axial > 0.0 && v_body[2] * axial_dir < 0.0) {
    const double sink = -v_body[2] * axial_dir;
    const double disc_all = 4.0 * disc_area;
    const double t_all = thrust[0] + thrust[1] + thrust[2] + thrust[3];
    /* The four discs' induced velocity, from the thrust they are actually
     * making. Falls to zero with the throttle, which is exactly when the
     * brake should be fully in. */
    const double vh_all = sim_sqrt(t_all / (2.0 * PLANT.rho * disc_all));
    const double onset = 0.25 * vh_all;
    const double span = 0.75 * vh_all;
    double brake;
    if (sink <= onset) {
      brake = 0.0;
    } else if (span < 1e-9) {
      /* No thrust, so no induced velocity to be measured against and no
       * healthy wake to protect: the discs are plates. */
      brake = 1.0;
    } else {
      brake = (sink - onset) / span;
      if (brake > 1.0) {
        brake = 1.0;
      }
    }
    f_body[2] += axial_dir * brake * 0.5 * PLANT.rho * PLANT.k_rotor_axial * air * disc_all * sink * sink;
  }

  /* Nose up is a NEGATIVE pitch torque in this frame, so the tap is negated
   * to read as "how hard the air is lifting the nose". */
  PLANT_DBG_PITCH_UP = -rotor_drag_tau[1];

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
    const double tf = thrust_dir[m] * thrust[m];
    const double fx = tf * AXIS[m][0];
    const double fy = tf * AXIS[m][1];
    const double fz = tf * AXIS[m][2];
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
  /* And back: the force is the real machine's, the room is in scene metres,
   * so its acceleration there is len times larger, gravity included. */
  s->vel[0] += f_world[0] * inv_m * len * SIM_DT;
  s->vel[1] += f_world[1] * inv_m * len * SIM_DT;
  s->vel[2] += (f_world[2] * inv_m * len - PLANT_W.gravity * SIM_GRAVITY) * SIM_DT;
  s->pos[0] += s->vel[0] * SIM_DT;
  s->pos[1] += s->vel[1] * SIM_DT;
  s->pos[2] += s->vel[2] * SIM_DT;
}

/*
 * THE STEP, IN TWO COPIES. The body above takes 3D mode as a constant, and
 * each call below hands it a literal, so the compiler builds one step for a
 * one way motor and one for a reversible one. In the one way copy every 3D
 * branch is dead and folded away, rotor_dir is the constant 1.0, and a
 * multiply by 1.0 is folded too, so normal flight runs the instructions it
 * ran before 3D mode existed rather than paying a test for it on every
 * rotor of every step. The flag is read once, here.
 */
/*
 * AND TWO MORE FOR REALISTIC PHYSICS, on the same argument: with SIM_REAL
 * at zero the step takes one of the first two calls, in which `real` is the
 * literal 0 and none of that code exists.
 */
void plant_step(SimState *s, const double duty_in[SIM_MOTOR_COUNT]) {
  if (SIM_REAL) {
    if (SIM_3D) {
      plant_step_body(s, duty_in, 1, 1);
    } else {
      plant_step_body(s, duty_in, 0, 1);
    }
  } else if (SIM_3D) {
    plant_step_body(s, duty_in, 1, 0);
  } else {
    plant_step_body(s, duty_in, 0, 0);
  }
}
