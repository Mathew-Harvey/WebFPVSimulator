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
      /*
       * The outermost radius about a motor that this aircraft presents to
       * the world, which is what src/game/collide.js sweeps. On a naked
       * five inch that IS the blade, so the two are the same number, and
       * saying so here rather than defaulting it keeps the collider from
       * silently inheriting the prop radius on an airframe where the prop
       * is not the outside. See the whoop below, where it is not.
       */
      hullR: 0.0635,
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
     * THE CHAMPION'S OWN TUNE, AS BETAFPV SHIP IT, and the choice is the
     * owner's, made twice. The whoop shipped on this tune first, moved to
     * the Freestyle preset with the master slider at 150 percent on a feel
     * report, and came back when the owner reported the machine hard to fly
     * and a review of the model found the loop tight and well damped on
     * every shipped configuration but calmest by a distance on this one: a
     * third of the hover motor jitter of the Freestyle at 150, 6 percent of
     * yaw overshoot against 14, and a 23 deg/s reversal on a full yaw snap
     * against 60. PROGRESS.md carries the tables.
     *
     * It is also the tune the plant is modelled on: plant.c's 0702 is the
     * Champion's 36,000 kV motor on a GF1207, and scripts/whoop-gates.js
     * measures the Champion. A tune is a Betaflight configuration and the
     * plant is a separate thing, so the other two presets fly on the same
     * plant, exactly as a pilot who flashes them onto a Champion gets, and
     * the Racing and Freestyle stay on the Tune row as their authors
     * shipped them.
     *
     * NO STARTING PID ADJUSTMENT SHIPS WITH IT. The 150 percent master that
     * came with the Freestyle default was a seed keyed to that tune, and
     * src/ui/ui.js takes it back out of a profile that only ever received
     * it, so a pilot who picks the Freestyle later gets it as BetaFPV wrote
     * it. seedAirframePids and defaultPids still exist for an airframe that
     * wants a seed; this one no longer carries one.
     */
    defaultTune: 'whoop-champion',
    /*
     * BetaFPV's own rate profile for the Air65 II Champion and Racing:
     * ACTUAL, srate 58 / 58 / 50, expo 0, which is 580 deg/s on roll and
     * pitch and 500 on yaw.
     *
     * KEPT THROUGH THE FREESTYLE INTERLUDE, deliberately, and the
     * Champion's own again now that the default tune is back on it. Rates
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
       * SIXTY FIVE PERCENT, AND IT IS A SCALE RATHER THAN A CLIP.
       *
       * A 23 g aircraft with 4.7 to one of thrust to weight holds a hover
       * at 33.6 percent of stick uncapped and climbs at 13 m/s at full
       * throttle, which is a hall's ceiling in a third of a second. Left
       * uncapped the top two thirds of the stick are unusable and the bottom
       * third is where all the flying happens, which is the definition of
       * twitchy.
       *
       * Betaflight's SCALE limit redistributes the WHOLE travel under the
       * cap rather than clipping the top off it, so nothing is lost: full
       * stick commands 65 percent, hover moves up to 49.0 percent of stick
       * (measured, see HOVER_STICK_PERCENT in configs/rates.js), and every
       * millimetre of stick is worth two thirds as much throttle. That is
       * the whole reason it is SCALE and not OFF, and the Rates screen says
       * so in the same words.
       *
       * IT WAS 65, THEN 75, AND IT IS 65 AGAIN, and every step was the
       * owner's. 75 put the hover at 43.1 percent and bought 10.9 m/s of
       * climb at full stick; the owner then reported the whoop hard to fly
       * and asked for a cap that makes the Champion easy. 65 puts the hover
       * at 49.0 percent, the middle of the stick with as much travel below
       * it as above, and full stick still buys 9.5 m/s of climb, a 4 m
       * hall's ceiling in well under a second. Finer everywhere, coarser
       * nowhere a room can use. 75 stays on the list in configs/rates.js
       * for anybody who wants it back, and src/ui/ui.js moves a stored 75
       * to 65 once, the way it moved 65 to 75 before.
       *
       * The five inch keeps 100 because it does not have the problem: 8.2 to
       * 1 on a 710 g airframe over a sixty metre field is a throttle a pilot
       * uses all of.
       */
      throttleCap: 65,
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
      /*
       * THE DUCT, WHICH IS THE OUTSIDE OF THIS AIRCRAFT, AND THE PROP IS NOT.
       *
       * 0.0181 is src/render/whoopcraft.js's DUCT_BORE plus DUCT_WALL, the
       * 33 mm bore that gives a 31 mm prop its 1 mm tip gap plus the 1.6 mm
       * moulded wall. whoopcraft derives its wall from THIS number now, so
       * the drawn duct and the swept hull cannot disagree.
       *
       * The comment two paragraphs down has said since the whoop landed
       * that it presents its ducts to everything it hits, always, because
       * they are the outermost thing on it in every direction, and that
       * this is the entire point of the design. The collider did not
       * implement it: collide.js derived the whole sweep from propR, so the
       * hull it swept was the bare blade at 0.0155 and the machine was
       * 5.2 mm narrower to the world than it was on screen. Measured
       * against a RaceGOW pole, contact happened at 50 to 52.5 mm where the
       * drawn ducts were already 2.6 mm inside it on each side.
       *
       * Axis aligned this gives 2 * (0.0325 / sqrt(2) + 0.0181) = 82.2 mm,
       * against BetaFPV's published 82.6 by 82.6 mm for the Air65 frame.
       * That is the number to check this against, not the 65 mm wheelbase,
       * which is a motor spacing and not a size.
       */
      hullR: 0.0181,
      vHalf: 0.018,
      /*
       * The FRAME, 82.6 mm square, from BetaFPV's own figure. These were
       * 0.072, which was smaller than the props the aircraft carries: two
       * ducts at 0.0181 about motors 0.0230 off each axis span 0.0822, so
       * the old body dimension described something 10 mm narrower than the
       * thing it was naming. Nothing draws from it, because whoopcraft.js
       * models the ducts directly, but whoopcraft builds a hidden
       * measurement box from these for tests/verify.js check 15, which
       * reads that box and nothing else.
       */
      bodyLength: 0.0826,
      bodyWidth: 0.0826,
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
