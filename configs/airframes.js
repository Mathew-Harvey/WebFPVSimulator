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
 * the whoop, on its own plant again since 2026-10-09, gets a whoop tune and
 * the five inch gets its own.
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
 * from it. Nothing else should: the collider and the shell want the
 * airframe's own `dims`, which are in the room's metres. The plant has its
 * own copy of these numbers in src/native/plant.c, in the whoop's metres.
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
    /* The OSD prints ground speed in km/h. See the whoop, which does not. */
    osdSpeed: true,
    /* Pack open circuit volts a cell, in the order the launch card offers
     * them: charged, mid, empty. A 6S LiPo, so 4.20 down to 3.50. */
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'betaflight-default',
    /*
     * THE WEIGHT THIS AIRFRAME IS FLOWN AT, as a multiple of 9.80665 handed
     * to sim_set_gravity when the Weight slider reads 100. The module's own
     * default is 1.0 and every band in tests/ and gates.config.json was
     * measured there; this number is the pilot's, not the harness's.
     *
     * 1.62 is ninety percent of the top of the first slider's band. That
     * slider ran 70 to 180 percent of 1.0 and the owner flew it to the stop
     * and said full Sinky "feels about right", then asked for normal to sit
     * at ninety percent of that with headroom either way. The slider is now
     * Weight 60 to 140 around this base, so its floaty end, 0.97, is within
     * half a percent of the machine every earlier record was set on, and its
     * sinky end, 2.27, is heavier than anyone has yet asked for.
     *
     * Measured at this base on the five inch: hover 35.0 percent of stick,
     * ten metres of fall from a hover with the throttle cut in 1.20 s, a
     * 400 ms punch ballooning 1.62 m at idle afterwards, props level descent
     * 28.3 m/s. At 1.0 those were 26.4, 1.53 s, 3.80 m and 22.0.
     */
    gravityBase: 1.62,
    /*
     * The top of the Weight slider on this airframe, a slider value and not a
     * gravity. The module refuses a scale above 2.5 (sim_set_gravity in
     * src/native/sim.c), and 140 of 1.62 is 2.268, so the five inch gets the
     * whole of the shell's WEIGHT_MAX. The whoop's base is heavier and its
     * top is lower; see there.
     */
    weightMax: 140,
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
      /*
       * The whole stick, and the whoop gets the whole stick too since it
       * was brought onto the five inch's rates. This comment used to say
       * "see the whoop's, which does not get one", which was true of the
       * 65 percent cap that sat there until that change took it off.
       *
       * Hover is at 26.5 percent of stick here, so most of the travel is
       * above it, and a feel report has since said so in the words
       * "throttle is touchy". The cap is NOT being put back by default:
       * uncapped is what the board's times were flown on and what a real
       * quad hands you. It is offered instead, on the Rates screen and
       * again in the feel form the moment a pilot ticks that chip.
       */
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
       * inch dropped on a floor first contacted at a CG height of 45.1 mm and
       * settled at 43.1 mm, which is what hull_hz_down 0.045 meant. It is
       * 0.033 since 2026-10-09, the owner's ask to get closer to the ground
       * before hitting it, so 12 mm lower; it still settles on the contact
       * model's 2 mm slop, which whoop:gates W15 asserts.
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
      vHalfDown: 0.033,
      vHalfUp: 0.038,
      bodyLength: 0.155,
      bodyWidth: 0.088,
      bodyHeight: 0.034,
    },
  },
  {
    id: 'whoop65',
    /*
     * ONE, THE WHOOP'S OWN PLANT, SINCE 2026-10-09.
     *
     * From 2026-09-14 this was 0, the five inch's plant, flown in a room built
     * MICRO_SCALE times life size so a five inch fits. That keeps every frame
     * the same picture and it cannot keep gravity: in the room's own metres
     * the whoop fell at 2.025 / 3.43 of a g, which pilots reported in so many
     * words (floaty, carries too far, too light even at 120), and it carried
     * a five inch's momentum and throttle (a rocket ship, can't move slowly).
     *
     * SIM_AIRFRAME_WHOOP65 in src/native/plant.c is a 24 g 1S whoop on 0802
     * 28,000 kV motors, built on the five inch's derivation chain because the
     * five inch is the one the owner says feels right, and it carries
     * len_scale, which is MICRO_SCALE: the plant computes the real machine in
     * real metres and converts once, where the rigid body meets the world. So
     * the room, the gates, the builder and every collision stay exactly as
     * built, and the whoop in them falls at one real g. The 0702 36,000 kV
     * plant this entry flew before 2026-09-14 is what that entry replaced.
     */
    simId: 1,
    name: '65 mm whoop',
    short: 'Whoop',
    blurb: 'A 65 mm ducted whoop indoors. The hall and its gates are built to match it, so what you see is a whoop through 28 inch gates.',
    facts: ['1S', '65 mm', 'Indoors'],
    trackClass: 'micro',
    /*
     * 1S, AND SINCE 2026-10-09 THAT IS WHAT FLIES IT: the whoop's own plant
     * is a single cell (PLANT.cells in src/native/plant.c). It said 1S over a
     * 6S plant for a fortnight before that, on the owner's word on
     * bug-eb0552d6, and the OSD scaled the five inch's pack down to suit.
     */
    cells: 1,
    /*
     * NO SPEED ON THE OSD. The owner, 2026-09-26: "remove speed recording on
     * the whoop". The readout was the plant's ground speed, and the plant is
     * the five inch's in a room built MICRO_SCALE times life size, so it
     * printed a five inch's km/h over the picture of a whoop. Display only,
     * like cells: nothing that flies or scores reads it.
     */
    osdSpeed: false,
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
     * 1.0, REAL GRAVITY, because the plant is a real whoop now.
     *
     * It was 2.025, 125 percent of the five inch's 1.62, on a pilot who flew
     * Vdrone and here back to back and had to take the Weight to 120 to 130
     * before the whoop felt right. That was the five inch's plant in a room
     * 3.43 times life size, where 2.025 g of scene metres is 0.59 g of the
     * room's: the pilot was reaching for real gravity and the slider ran out.
     * The whoop's plant converts through len_scale, so 1.0 here is one g in
     * the room's own terms. Measured on the module: a 1.5 m drop from a
     * hover with the throttle cut takes 0.58 s against free fall's 0.55, and
     * the previous plant read 0.77.
     */
    gravityBase: 1.0,
    /*
     * 140, the five inch's: at a base of 1.0 the module's 2.5 ceiling is far
     * above it, so the whoop gets the whole of the shell's WEIGHT_MAX.
     */
    weightMax: 140,
    /*
     * THE WHOOP'S TUNE, BECAUSE THE PLANT IS THE WHOOP'S AGAIN.
     *
     * 'whoop-champion' is the maker's own shipped 1S whoop configuration, and
     * it was this entry's default while SIM_AIRFRAME_WHOOP65 flew before. It
     * was retired when the whoop moved onto the five inch's plant, because a
     * 1S tune on a 710 g 6S machine is the wrong tune. On the 0802 plant it
     * is a tight one: a quarter stick roll rises in 17 ms with 4 percent
     * overshoot, a full yaw snap overshoots 4 percent where the previous
     * whoop plant overshot 15, and the hover holds roll to 0.12 deg/s RMS.
     */
    defaultTune: 'whoop-champion',
    /*
     * THE FIVE INCH'S RATES, AND THE WHOLE STICK, ON PURPOSE.
     *
     * The maker's whoop profile is 580 / 580 / 500 with a 65 percent throttle
     * cap, and the cap existed because a 36,000 kV whoop hovered at a third
     * of the stick. The 0802 28,000 kV plant hovers at 39 percent with 4.4 to
     * one, so the whole stick is a whoop's whole range and the cap is not put
     * back. The rates are the five inch's so a pilot moving between the two
     * keeps their hands; one stock profile, not two.
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
     * THE WHOOP IN SCENE METRES, and the sweep is the five inch's.
     *
     * `dims` is the airframe AS THE COLLIDER SWEEPS IT, in the room's metres.
     * src/game/collide.js sweeps arm plus hull, and for this aircraft that is
     * the real whoop's 50.6 mm times MICRO_SCALE, which is the five inch's
     * 173.5 mm by the definition of MICRO_SCALE. So these stay the five
     * inch's numbers: same sweep, same collider, same room. They were the
     * five inch's because the whoop flew its plant from 2026-09-14 to
     * 2026-10-09; they are still right because the whoop's own plant
     * converts through the same factor (len_scale in src/native/plant.c).
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
       * settles the craft at its own hull_hz_down, so this has to be the
       * plant's or the aircraft spawns buried or hovering. The whoop's plant
       * parks on 9.6 mm of duct floor, which through len_scale is 32.9 mm of
       * the room; 33 is that to a tenth of a millimetre, inside the contact
       * model's 2 mm slop, and it is where the drawn ducts sit on the floor
       * (scripts/craft-check.js pins it).
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
      vHalfDown: 0.033,
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
 * The room was built bigger so the whoop could fly the five inch's plant in
 * it (2026-09-14 to 2026-10-09), and this is the factor. The whoop has its
 * own plant again and the room stays as built: the plant carries this same
 * factor as len_scale and converts at its boundary, so a real whoop flies a
 * room built 3.43 times life size at one real g. src/game/track.js
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
