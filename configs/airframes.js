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
 * to a PLANT: the Tune row offers the tunes written for the plant the seated
 * airframe selects. Loading a tune onto a plant it was never written for is
 * not a thing a pilot should be able to do by accident, and that rule is why
 * the whoop, on the five inch's plant, gets the five inch's tunes and not
 * the three whoop presets it used to carry.
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

/*
 * THE 65 MM WHOOP AS A REAL OBJECT, which is a different thing from the
 * airframe above that wears its name.
 *
 * These are the numbers the whoop entry's `dims` held until the machine
 * started flying the five inch's plant, and they are quoted from the published
 * specification for a 65 mm whoop: a 65 mm wheelbase, so arm is 0.065 / (2 sqrt 2) and is plant.c's
 * arm_x times sqrt 2; a 31 mm Gemfan 1207 three blade; a duct whose outer
 * radius is the 33 mm bore that gives that prop a 1 mm tip gap plus a 1.6 mm
 * moulded wall. Axis aligned that is 2 * (0.0325 / sqrt 2 + 0.0181) =
 * 82.2 mm against the maker's published 82.6 by 82.6 mm for the frame, which
 * is the figure to check these against and not the 65 mm wheelbase, which is
 * a motor spacing and not a size.
 *
 * The duct is the outside of this aircraft and the prop is not, in every
 * horizontal direction, which is the entire point of the design. 10 mm of
 * duct sits below the CG and 18 mm of canopy and camera above it.
 *
 * TWO THINGS READ THIS. src/render/whoopcraft.js models the ducts, the
 * canopy and the body from it, so the drawn machine keeps a whoop's
 * proportions however large it is drawn. And MICRO_SCALE below is derived
 * from it. Nothing else should: the collider, the plant and the shell all
 * want the airframe's own `dims`, which is the five inch.
 */
export const WHOOP_TRUE_DIMS = {
  arm: 0.0325,
  propR: 0.0155,
  hullR: 0.0181,
  vHalfDown: 0.010,
  vHalfUp: 0.018,
  bodyLength: 0.0826,
  bodyWidth: 0.0826,
  bodyHeight: 0.028,
};

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
      /*
       * HOW FAR THE HULL REACHES BELOW AND ABOVE THE CG, level, in metres.
       *
       * These are `hull_hz_down` and `hull_hz_up` from src/native/plant.c,
       * which is the copy of record for them: the plant rests this craft on a
       * ground plane with exactly these extents, so the collider that sweeps
       * it past a kerb has to be the same machine or the two disagree about
       * where the bottom of the quad is. Measured off dist/sim.wasm, a five
       * inch dropped on a floor first contacts at a CG height of 45.1 mm and
       * settles at 43.1 mm, which is what hull_hz_down 0.045 means.
       *
       * This was ONE number, `vHalf: 0.040`, used the same both ways, and its
       * comment explained it as covering the drawn stack, the body's underside
       * at -0.017 and the prop discs at +0.034, with half a centimetre over
       * the prop plane. Covering the larger extent and mirroring it is only
       * harmless on a craft that is about as deep below as it is tall above.
       * See the whoop, which is not: it is 18 mm of canopy over 10 mm of duct,
       * so mirroring the canopy gave it 18 mm of hull under a machine that has
       * 10, and a pilot skimming a 26.7 mm RaceGOW pipe felt 8 mm of nothing.
       *
       * `vHalfDown` is also WHERE THE FLOOR IS as far as the shell is
       * concerned: src/main.js seats SPAWN_ALT and REST_HEIGHT from it, so
       * the ground plane goes that far under the plant's origin, the craft
       * spawns and parks there, and "is this height the ground" is asked
       * against it. Those were the five inch's 45 mm on every aircraft, so
       * A whoop rested 35 mm in the air. `npm run whoop:gates` W15 drops
       * the real module on a plane raised by this number and fails if it
       * ever stops being where the craft settles.
       */
      vHalfDown: 0.045,
      vHalfUp: 0.038,
      bodyLength: 0.155,
      bodyWidth: 0.088,
      bodyHeight: 0.034,
    },
  },
  {
    id: 'whoop65',
    /*
     * ZERO, WHICH IS THE FIVE INCH'S PLANT, AND THE WHOLE POINT OF THIS
     * AIRFRAME NOW.
     *
     * It was 1, a 23 g 1S ducted whoop modelled honestly off the published
     * specification: three times the five inch's angular acceleration, a fifth of
     * its speed, its own inertia, its own drag, its own 1S sag. It is still
     * in src/native/plant.c as SIM_AIRFRAME_WHOOP65 and nothing selects it.
     *
     * The owner flew every version of it and the verdict never moved: it
     * does not feel like flying. The five inch does. A real whoop in a real
     * room flies mostly like a five inch with slightly less momentum,
     * because a pilot flies to what the picture does and the picture is the
     * same picture; the dynamic differences the plant was reproducing are
     * real and are not what the hands feel.
     *
     * So this machine flies the five inch's plant, and the room it flies in
     * is built MICRO_SCALE times life size to give a five inch the space it
     * needs. Scaling a world and the craft in it by one factor is a change
     * of units and nothing else, so every frame is the frame it was: the
     * picture is a whoop threading 28 inch RaceGOW gates and the feel
     * underneath it is the five inch's. See MICRO_SCALE at the foot of this
     * file for the derivation and for what the fiction costs.
     */
    simId: 0,
    name: '65 mm whoop',
    short: 'Whoop',
    blurb: 'A 65 mm ducted whoop indoors, flying the five inch\'s flight model. The hall and its gates are built to match it, so what you see is a whoop through 28 inch gates and what you feel is the 5 inch.',
    facts: ['Indoors', '65 mm', '5 inch feel'],
    trackClass: 'micro',
    /*
     * SIX, BECAUSE THE PLANT IS THE FIVE INCH'S AND ITS THRUST IS KEYED TO
     * PACK VOLTS. A 1S pack on a 6S plant is a quad that will not leave the
     * floor. The launch card says 6S on a whoop, which is a visible seam in
     * the fiction and is the honest place to put one: the alternative is a
     * card that lies about the machine it is about to hand over.
     */
    cells: 6,
    /*
     * A 1S LiHV charges to 4.35 and a whoop is flown until it is at about
     * 3.40 under load, which is why the empty figure here is higher than the
     * 5 inch's 3.50 rather than lower: these are OPEN CIRCUIT volts, and a
     * 1S whoop pack at 3.60 open circuit is already sagging under a punch to
     * the 3.00 its own battery profile warns at.
     */
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    /*
     * THE FIVE INCH'S TUNE, BECAUSE THE PLANT IS THE FIVE INCH'S.
     *
     * This was 'whoop-champion', the maker's own shipped configuration for the
     * whoop, and it was the right answer for as long as SIM_AIRFRAME_WHOOP65
     * was what flew. It is the wrong answer now and not by a little: a whoop
     * preset is a 1S configuration, its P and D are sized against 6e-6 kg m^2
     * of inertia, its filter cutoffs against a 23 g frame's resonances and its
     * motor idle and voltage compensation against a cell that sags to 3.0 V
     * under a punch. Loaded onto a 710 g 6S machine it is an underdamped
     * sluggish tune, which is exactly the complaint this whole change exists
     * to answer.
     *
     * The three whoop presets stay on disk in configs/ and are retired from
     * the Tune row by configs/registry.js. They are real published configurations and
     * cost nothing to keep; what they must not do is be offerable for a plant
     * they were never written for.
     */
    defaultTune: 'betaflight-default',
    /*
     * THE FIVE INCH'S RATES, FOR THE SAME REASON AS THE TUNE.
     *
     * These were the maker's own profile for the whoop: ACTUAL, srate
     * 58 / 58 / 50, which is 580 deg/s on roll and pitch and 500 on yaw, with
     * a 65 percent SCALE throttle cap. Every one of those numbers was chosen
     * against a machine with three times this plant's angular acceleration
     * and 4.7 to one of thrust on 23 grams, and the cap in particular existed
     * only because that machine put its hover at a third of the stick.
     *
     * A five inch does not have that problem. It holds a hover near half
     * stick on the whole travel, which is what the five inch's own entry says
     * and why it keeps 100. Carrying the 65 percent cap over would leave this
     * aircraft with two thirds of the thrust of the plant it is flying, in a
     * hall built for all of it.
     *
     * Rates are still the pilot's. Three rows on the Rates screen change
     * them, configs/rates.js strips every rate key out of a tune on the way
     * in, and src/ui/ui.js keeps a pilot's own rates across an airframe
     * change unless they are still the stock ones.
     */
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
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
     * THE FIVE INCH'S, EXACTLY, BECAUSE THIS AIRCRAFT IS ONE.
     *
     * `dims` is documented above as the airframe AS THE RENDERER DRAWS IT AND
     * THE COLLIDER SWEEPS IT, and both of those are the five inch now. The
     * plant is SIM_AIRFRAME_5IN, so its hull extents are the five inch's and
     * the shell's REST_HEIGHT has to agree with them or the craft spawns
     * buried or floating. The collider sweeps a five inch because a five inch
     * is what the physics is resolving contacts for. And the renderer draws
     * the whoop at five inch size, because the world it is drawn in is built
     * MICRO_SCALE times life size: a 65 mm model in a hall scaled by 3.43
     * would be a speck, and scaled up by the same 3.43 it lands on these
     * numbers to within two percent.
     *
     * THE REAL MACHINE'S GEOMETRY IS NOT LOST. It is WHOOP_TRUE_DIMS below,
     * which is what src/render/whoopcraft.js models the ducts and the canopy
     * from and what MICRO_SCALE is derived against. That separation is the
     * point: one block is a 65 mm whoop, which is a fact about a real
     * product, and the other is the machine this simulator flies.
     */
    dims: {
      arm: 0.110,
      propR: 0.0635,
      hullR: 0.0635,
      /*
       * DOWN IS THE PLANT'S, UP IS THE MODEL'S, and the split is not a fudge.
       *
       * vHalfDown is where the floor is as far as the shell is concerned:
       * src/main.js seats SPAWN_ALT and REST_HEIGHT from it and the plant
       * settles the craft at its own hull_hz_down, so this HAS to be the five
       * inch's 45 mm or the aircraft spawns buried or hovering. It costs a
       * whoop body 12 mm of ground clearance it would not have, 3.5 mm once
       * divided back down to the size the picture is of, and scripts/craft-check.js
       * pins it at that.
       *
       * vHalfUp has no such owner. Nothing in the plant rests a craft on its
       * canopy; what reads this is src/game/collide.js, deciding whether the
       * top of the aircraft met a gate's bar or a horizontal pole. So it is
       * the DRAWN machine's, because the drawn machine is what the pilot is
       * threading under: a whoop is proportionally much taller than a five
       * inch, 18 mm of canopy and camera over a 41 mm half span against the
       * five inch's 38 over 173, and taking the five inch's number here left
       * 7 apparent millimetres of canopy standing above the hull that sweeps
       * it. On a machine 28 mm tall that is a quarter of it passing through
       * a pipe before anything touched.
       *
       * 0.0617 is WHOOP_TRUE_DIMS.vHalfUp times MICRO_SCALE, and the
       * assertion under MICRO_SCALE fails the build if the two ever drift.
       */
      vHalfDown: 0.045,
      vHalfUp: 0.0617,
      bodyLength: 0.155,
      bodyWidth: 0.088,
      bodyHeight: 0.034,
    },
  },
];


/*
 * HOW MUCH LARGER THAN LIFE SIZE A MICRO WORLD IS BUILT, as a pure number.
 *
 * The whoop flies the five inch's plant. A five inch cannot fly a 10 by 12 m
 * room, so the room is built bigger, and this is the factor. src/game/track.js
 * re-exports it and carries the argument for why the class works this way at
 * all; what belongs here is the derivation, because it is a fact about these
 * two aircraft and nothing else.
 *
 * IT IS THE RATIO OF THE TWO SWEEP RADII, arm plus hull, which is the measure
 * src/game/collide.js derives CRAFT_R with for both machines and the one the
 * GATE_SCALE argument in src/game/track.js is written in. 0.1735 m of five
 * inch against 0.0506 m of real whoop is 3.4289.
 *
 * That factor is exactly the one that leaves every clearance on a micro track
 * the number of craft widths it already was. A 0.7112 m RaceGOW gate against
 * a 0.1012 m whoop is 7.03 gate widths; built through this it is a 2.4387 m
 * opening against a 0.347 m five inch, which is 7.03. The run off, the
 * ceiling, rule 3's gate spacing and the 14 inch pole gap all carry across
 * the same way, so the seven shipped RaceGOW tracks still read the way their
 * authors drew them.
 *
 * DERIVED AND NOT TYPED, so that it cannot drift from the two blocks it is
 * about. If either aircraft's sweep changes this follows it, which is the
 * only way the clearance identity above stays true.
 */
export const MICRO_SCALE = (() => {
  const five = AIRFRAMES.find((a) => a.id === '5inch').dims;
  const sweep = (d) => d.arm + (d.hullR ?? d.propR);
  return sweep(five) / sweep(WHOOP_TRUE_DIMS);
})();

/*
 * The whoop's collider top is the drawn canopy through the room's factor, and
 * it is typed in the table above because the table is read before this line
 * runs. Typed once and checked once: a change to either end that does not
 * change the other stops the module loading rather than moving a hull 25 mm
 * without a word.
 */
{
  const want = WHOOP_TRUE_DIMS.vHalfUp * MICRO_SCALE;
  const got = AIRFRAMES.find((a) => a.id === 'whoop65').dims.vHalfUp;
  if (Math.abs(got - want) > 0.0001) {
    throw new Error(
      `airframes: whoop65 vHalfUp is ${got.toFixed(4)} and should be `
      + `${want.toFixed(4)}, the drawn canopy times MICRO_SCALE`);
  }
}

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
