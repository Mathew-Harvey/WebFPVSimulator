/*
 * airframes.js: the aircraft the shell offers, and the only place any of
 * them is named.
 *
 * An AIRFRAME is a plant, not a tune. It is the mass, the inertia, the
 * motors, the rotors, the pack, the drag and the ducts, all of which are
 * compiled into dist/sim.wasm and selected at runtime by `sim_set_airframe`
 * (src/native/sim_abi.h). `simId` is that call's argument and it is the one
 * number in this file the module cares about; everything else here is the
 * shell's own knowledge of the machine.
 *
 * A TUNE is a Betaflight CLI diff, lives in configs/registry.js, and belongs
 * to exactly one airframe. Loading a 6S 5 inch race tune onto a 1S whoop is
 * not a thing a pilot should be able to do by accident, so the Tune row
 * offers only the tunes of the seated airframe.
 *
 * `id` is what goes in localStorage and into the record key, so changing one
 * orphans a stored choice and every local best flown on it. src/ui/ui.js
 * falls back to the first row rather than throwing, because a stale setting
 * must never stop the page booting.
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

export const AIRFRAMES = [
  {
    id: '5inch',
    simId: 0,
    name: 'Five inch',
    short: '5 inch',
    /* What a pilot calls it out loud, for a card and for the board. */
    blurb: 'A 710 gram 6S freestyle and race quad. Eight and a half to one, forty metres a second, and a field big enough to use it.',
    facts: ['6S', '220 mm', '8.4 : 1'],
    /* Track class. The builder, the world and the board all branch on this
     * rather than on the airframe id, because what changes is the SIZE OF
     * THE PLACE and one day there may be two airframes that fly the same
     * size of track. */
    trackClass: 'full',
    cells: 6,
    /* Pack open circuit volts a cell, in the order the launch card offers
     * them: charged, mid, empty. A 6S LiPo, so 4.20 down to 3.50. */
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'betaflight-default',
    /*
     * Betaflight 4.5.1's own rate defaults, which is what RATE_DEFAULTS in
     * configs/rates.js already is. Named here as well so the two airframes
     * are read the same way rather than one of them being the special case
     * that inherits.
     */
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      /* The whole stick. See the whoop's, which does not get one. */
      throttleCap: 100,
    },
    /*
     * The camera the airframe carries, seeded onto the pilot's settings when
     * the airframe is chosen. src/ui/ui.js keeps camera in the Quad screen
     * rather than in Pilot for exactly this reason: it is bolted to the
     * machine and changes what a yaw does to the picture. Both values are
     * from the lists src/render/lens.js offers, so a seeded value is one the
     * pilot could have chosen themselves.
     *
     * 85 and 30 are Betaflight-era normal for a 5 inch: a fast machine flown
     * with a lot of tilt.
     */
    cameraFov: 85,
    cameraAngle: 30,
    /*
     * The airframe as the renderer draws it and the collider sweeps it, in
     * metres. src/game/collide.js reads these and derives CRAFT_R from them,
     * src/render/craft.js draws from the same two, and tests/lib/checks.js
     * check 15 asserts the two agree against the DRAWN geometry, because
     * this project has shipped a scale error before.
     *
     * arm is motor centre to airframe centre: 0.110 is a 220 mm machine, and
     * it is the same number as plant.c's arm_x times sqrt 2.
     */
    dims: {
      arm: 0.110,
      propR: 0.0635,
      /* Vertical semi extent in level flight. The drawn stack runs from the
       * body's underside at -0.017 to the prop discs at +0.034. */
      vHalf: 0.040,
      bodyLength: 0.155,
      bodyWidth: 0.088,
      bodyHeight: 0.034,
    },
  },
  {
    id: 'whoop65',
    simId: 1,
    name: '65 mm whoop',
    short: 'Whoop',
    blurb: 'A 23 gram 1S ducted whoop, modelled on the BetaFPV Air65 II. Three times the angular acceleration of the 5 inch and a fifth of its speed, which is what fits a track in a living room.',
    facts: ['1S', '65 mm', 'Indoors'],
    trackClass: 'micro',
    cells: 1,
    /*
     * A 1S LiHV charges to 4.35 and a whoop is flown until it is at about
     * 3.40 under load, which is why the empty figure here is higher than the
     * 5 inch's 3.50 rather than lower: these are OPEN CIRCUIT volts, and a
     * 1S whoop pack at 3.60 open circuit is already sagging under a punch to
     * the 3.00 its own battery profile warns at.
     */
    packVoltages: [4.35, 4.0, 3.6],
    packLabels: { 4.35: 'Charged', 4.0: 'Half', 3.6: 'Nearly empty' },
    /*
     * THE FREESTYLE TUNE, and it is the owner's choice flown rather than a
     * derivation. BetaFPV ship three for the Air65 II and this is the one
     * with the highest gains of the three: 49 / 79 / 35 on roll against the
     * Champion's 33 / 57 / 21, and the only one they ship on Betaflight
     * rates rather than Actual.
     *
     * IT IS NOT THE TUNE THE PLANT IS MODELLED ON, and that is worth saying
     * once. plant.c models the Champion's 0702 at 36,000 kV on a GF1207;
     * BetaFPV wrote this tune for the 25,000 kV variant on the bigger
     * GF1219S. A tune is a Betaflight configuration, PIDs and filters and
     * feedforward, and the plant is a separate thing, so there is nothing
     * inconsistent about flying one on the other: it is what a pilot who
     * flashes the Freestyle preset onto a Champion gets. It does mean the
     * gains are aimed at a motor with less authority than this one has,
     * which is part of why the master below is where it is.
     *
     * scripts/whoop-gates.js still measures the Champion. That is right:
     * the gates are about the PLANT, and the plant is the Champion's.
     */
    defaultTune: 'whoop-freestyle',
    /*
     * AND THE PID ADJUSTMENT THAT COMES WITH IT, 150 percent on the master
     * slider, which is the owner's number flown.
     *
     * It is Betaflight's own simplified tuning, not a second PID model:
     * configs/pids.js emits `set simplified_master_multiplier = 150` and
     * `simplified_tuning apply` after the tune, exactly as Configurator
     * does, and the firmware re-derives P, I, D and feedforward from the
     * tune's own slider set. Measured on this build, against the freestyle
     * tune as shipped: p_roll 49 to 74, i_roll 79 to 118, d_min_roll 35 to
     * 54, f_roll 35 to 54, and the same 1.5 on pitch and yaw, because
     * Betaflight 4.5's simplified_pids_mode defaults to RPY and none of the
     * whoop tunes change it.
     *
     * KEYED TO THE DEFAULT TUNE, not to the aircraft. The Champion ships
     * its own master at 75 and the Racing at 85, both of which are figures
     * BetaFPV chose for those tunes; 150 on top of one of those would be a
     * number nobody picked. A pilot who moves to another whoop tune gets
     * that tune as its author shipped it, and their own adjustment if they
     * have made one.
     *
     * It is a SEED, so it only ever lands on a profile that has not
     * adjusted this tune. See seedAirframePids in src/ui/ui.js.
     */
    defaultPids: { master: 150 },
    /*
     * BetaFPV's own rate profile for the Air65 II Champion and Racing:
     * ACTUAL, srate 58 / 58 / 50, expo 0, which is 580 deg/s on roll and
     * pitch and 500 on yaw.
     *
     * KEPT WHEN THE DEFAULT TUNE MOVED TO FREESTYLE, deliberately. Rates
     * are the pilot's in this project and a tune never sets them: the Rates
     * row says so in capitals and configs/rates.js strips every rate key
     * out of a tune on the way in. BetaFPV's Freestyle preset does carry
     * its own, on Betaflight rates rather than Actual, and adopting them
     * would be this file quietly changing a pilot's stick authority because
     * a PID preset changed. If they are wanted they are three rows on the
     * Rates screen.
     *
     * A RACING whoop flies SLOWER rates than a 5 inch freestyle quad, and
     * that surprises people. The reason is the track: a RaceGOW course fits
     * in 1.22 by 1.83 m and its gates are 610 mm square, so the whole thing
     * is flown inside a few metres and the stick has to be able to place the
     * aircraft rather than throw it. Expo is zero because ACTUAL already
     * gives an independent centre stick, 70 deg/s here, which is the shape a
     * racer wants and the structural difference from a 5 inch setup.
     */
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 58, expo: 0 },
      pitch: { rcRate: 7, srate: 58, expo: 0 },
      yaw: { rcRate: 7, srate: 50, expo: 0 },
      /*
       * SEVENTY FIVE PERCENT, AND IT IS A SCALE RATHER THAN A CLIP.
       *
       * A 23 g aircraft with 4.7 to one of thrust to weight holds a hover
       * at 33.6 percent of stick uncapped and climbs at 12.9 m/s at full
       * throttle, which is a room's ceiling in a fifth of a second. Left uncapped the top two thirds of the stick are unusable
       * and the bottom third is where all the flying happens, which is the
       * definition of twitchy.
       *
       * Betaflight's SCALE limit redistributes the WHOLE travel under the
       * cap rather than clipping the top off it, so nothing is lost: full
       * stick commands 75 percent, hover moves up to 43.1 percent of stick
       * (measured, see HOVER_STICK_PERCENT in configs/rates.js), and every
       * millimetre of stick is worth three quarters as much throttle. That
       * is the whole reason it is SCALE and not OFF, and the Rates screen
       * says so in the same words.
       *
       * IT WAS 65 AND THE OWNER FLEW IT TO 75. That is a feel judgement and
       * the pilot's to make, so it is recorded rather than argued with. What
       * it trades: hover comes down the stick from 49.0 percent to 43.1, so
       * there is more travel below hover and less above it, and full stick
       * buys 10.9 m/s of climb instead of 9.4. Finer at the top, coarser at
       * the bottom, and 65 is still on the list in configs/rates.js for
       * anybody who wants it back.
       *
       * The five inch keeps 100 because it does not have the problem: 8.2 to
       * 1 on a 710 g airframe over a sixty metre field is a throttle a pilot
       * uses all of.
       */
      throttleCap: 75,
    },
    /*
     * The Air II canopy takes a C03 on a 15 to 45 degree adjustable mount, so
     * 25 is inside the real range and is where an indoor racer sits: a whoop
     * track is flown slowly enough that a steep camera would put the next
     * gate off the top of the picture.
     *
     * 95, AND IT WAS 115 UNTIL THE ROOM GREW.
     *
     * The old argument was about the ROOM rather than the lens: a RaceGOW
     * track is 1.42 by 2.13 m, the aircraft is inside it the whole lap, the
     * next gate is regularly to one side rather than ahead, and in a 5 by
     * 6 m room an 85 degree picture shows a wall. That was true of a 5 by
     * 6 m room. The room is 10 by 12 now, four times the floor, and the
     * walls are metres further out: the reason for the widest stop on the
     * list went with them.
     *
     * What 115 costs is the gate. A fisheye pushes everything toward the
     * centre of the frame, so a 0.711 m opening at three metres reads
     * smaller and closer to every other thing in the picture, and picking
     * a line through a stack is harder than it should be. 95 is a real FPV
     * camera's field, it is what most pilots fly, and it puts the gate back
     * at the size the eye expects. The owner flew both.
     */
    cameraFov: 95,
    cameraAngle: 25,
    /*
     * 0.0325 is half of the 65 mm wheelbase, which for a whoop is measured
     * motor to motor across the diagonal exactly as it is on a five inch, so
     * this is plant.c's arm_x times sqrt 2 again. 0.0155 is a 31 mm Gemfan
     * 1207 three blade.
     *
     * vHalf is 0.018, the canopy top, because a whoop is thicker upward than
     * downward: the ducts sit 10 mm under the CG and the Air II canopy with
     * its camera sits 18 mm over it. A symmetric semi extent has to cover the
     * larger, and 18 mm is under half the five inch's 40 which is what a
     * machine a third of the size should measure.
     *
     * bodyWidth is the DUCT SPAN rather than the frame's waist, and that is
     * deliberate: a whoop presents its ducts to everything it hits, always,
     * because they are the outermost thing on it in every direction. That is
     * the entire point of the design.
     */
    dims: {
      arm: 0.0325,
      propR: 0.0155,
      vHalf: 0.018,
      bodyLength: 0.072,
      bodyWidth: 0.072,
      bodyHeight: 0.028,
    },
  },
];

export const AIRFRAME_IDS = AIRFRAMES.map((a) => a.id);

export function airframeById(id) {
  return AIRFRAMES.find((a) => a.id === id) ?? AIRFRAMES[0];
}

/* The sim_set_airframe argument for a stored id, falling back to the five
 * inch rather than throwing. A stale setting must not stop the page. */
export function simIdFor(id) {
  return airframeById(id).simId;
}

/*
 * Which track class an airframe flies. 'full' is the 60 by 40 m field the
 * builder has always drawn; 'micro' is a RaceGOW room. The builder, the
 * world, the gate meshes and the board all read this.
 */
export function trackClassFor(id) {
  return airframeById(id).trackClass;
}
