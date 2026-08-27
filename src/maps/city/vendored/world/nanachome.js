import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  superFascia, superBoxSign, superHours, superBanner, superPoster, superDeal,
  superInterior, parkPlate, parkGuide, deckBay, coinParkPlate, deliveryPlate,
  warningPlate, roadPaint, shutterTex, paperSheet,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { pad, lane, laneLine, steps, wallRun, meshFence, railing, dapple, groundMats } from './ground.js';
import {
  plotBox, plotCollide, plotWall, hedgeRun, dressPlot, laneGutter, bollardRow,
  laneSign, poleRun,
} from './plots.js';
import { makeHouse } from './buildings.js';
import { makeAtticHouse, makeWalkup, makeBikeShelter } from './housing.js';
import { addVending } from './vending.js';
import { bayPaint, kerbLine, makeDelineator, tyreMarks } from './vehicles.js';
import {
  makeBench, makeBikeRack, makeBicycle, makeBins, makePlanter, makeFlowerBed,
  makeSignPost, makeMirror, makeNoticeBoard, makeGuardrail, makeCone, makeVendBin,
  makeUmbrellaStand, makeCrates, makeMilkCrate, makeRecycleBox, makeAircon,
  makeIvy, makeBucket, makeMailboxBank, makeDoormat,
  makeTapPost, makeHoseBox, makeLoosePaper,
} from './props.js';
import {
  makeWheelStops, makeLockerBank, makeScooter, makeGomiHouse, makeChalkMarks,
} from './streetprops.js';

/* ------------------------------------------------------------------ *
 * ひばり台七丁目 -- スーパー さかえ and its roof car park.
 *
 * The twenty-third district, and the first one built round a *building* that
 * is bigger than a house.  Everything in this world so far has been at the
 * scale of a shop, a hall or a school block; a 地域スーパー is the one thing a
 * Japanese suburb has that is genuinely large and genuinely ordinary, and the
 * whole design problem is to make 350 m² of shed read as somewhere people go
 * on the way home rather than as a box dropped on a field.
 *
 * Three things do that work, and none of them is the building:
 *
 *  - **the 前場** -- the apron between the doors and the road, which is where a
 *    Japanese supermarket actually lives: the trolley bay, the basket stack, the
 *    drinks cases, the recycling cage, the A-board, the umbrella stand and the
 *    machines.  It is dressed harder than any frontage in the world except the
 *    vending corner, and for the same reason: you stand two metres from all of
 *    it.
 *  - **the 屋上駐車場** -- the roof deck, fourteen bays, reached by a 34.5 m
 *    ramp that wraps the store's east and south flanks.  It is the second
 *    vertical viewpoint in the world after the overbridge, and the only one you
 *    can drive to.
 *  - **the 荷捌き場** -- the delivery yard behind the west gable, screened by a
 *    wall so you find it rather than are shown it.
 *
 * ------------------------------------------------------------------ *
 * THE LAND, measured rather than remembered -- the 四丁目 lesson.
 *
 * Envelope x -58..-6, z 58..102, swept against `world.colliders` before a
 * single coordinate was chosen.  What is in it:
 *
 *   湯の坂's terrace          x -46.80..-18.60, z 40.60..59.60, deck at **3.20**,
 *                             i.e. 2.75 m above this parcel.  Its north
 *                             retaining wall runs x -46.8..-27.0 and
 *                             -19.6..-18.6, top 3.75.
 *   **the 7.4 m gap in it**   x -27.0..-19.6 has *no wall and no railing*, and a
 *                             2.75 m drop.  `onsen.js` left the opening and
 *                             never built anything in it -- the same class of
 *                             finding as 川端の道's unguarded water.  This
 *                             district closes it: fourteen steps in the middle
 *                             of the gap and a railing either side, which is
 *                             also the store's own way up to 湯の坂.
 *   the onsen's east screen   grove at (-15.2, 58.8) and (-12.8, 62.2) -- the
 *                             two northernmost of `onsen.js`'s four screen
 *                             trees, and **neither moves**: they are 桜守裏町's
 *                             west side.  The 2.4 m footpath east threads
 *                             between them at z = 64.2, clearing the northern
 *                             one by 0.17 m.
 *   桜守裏町                  shrub (-16.6, 65.4), cherry (-16.4, 66.8), the
 *                             木造平屋 at x -15.18..-10.82 / z 66.62..69.78, a
 *                             grove at (-16.8, 70.6), the 長屋 at x -10.8..-0.4
 *                             / z 66.30..70.90 with its 0.92 m eave to z 71.82,
 *                             and its arm (a lane, no collider) at z 63.65..65.95
 *                             from x -11.45 east.
 *   桜守裏町's back planting  grove at (-8.0, 73.4) and (-2.0, 72.8)
 *   四丁目's pocket park      x 1.4..9.8, z 71.9..79.7, railed all round with one
 *                             3.2 m entrance at x 4.4..7.6
 *   四丁目's lane             x 4.3..7.7, running north to z = 72.0
 *
 * **Everything else in that envelope is empty field, dead flat at 0.45.**  Six
 * grove trees stood in the middle of it (`onsen.js`'s north screen, at
 * (-44.0, 62.4) (-39.4, 64.4) (-34.8, 66.4) (-30.2, 62.4) (-25.6, 64.4) and
 * (-21.0, 66.4)) and they are gone -- the brief asked for the ground to be
 * cleared, and the store now does the job they were doing, which was to give
 * 湯の坂's back something to stand against.
 *
 * ------------------------------------------------------------------ *
 * WHAT THE ARITHMETIC DECIDED
 *
 * **The deck is at 6.20 and the ramp is 34.5 m long, and the second number is
 * what fixed the first.**  A self-parking ramp is limited to 1/6, so the run is
 * six times the rise and there is nowhere to put a straight one: the parcel is
 * 30 m across and a 6.2 m deck wants 35.  Wrapping two adjacent flanks of the
 * store is the only shape that fits -- 16.4 m down the east flank, a landing at
 * the south-east corner, 18.1 m west along the south flank, and the deck
 * entered over its south parapet.  That is why the store is 21.6 x 16.4 and not
 * some rounder number: **the building is the length of its own ramp.**
 *
 * **The corner landing is 5.6 x 4.6 and a saloon does not take it in one.**
 * Same argument as 六丁目's turning circle: a landing a car sweeps in one go is
 * 8 m square, and at that size the ramp stops being a ramp up the side of a
 * shop.  A 軽 makes it; anything longer does one 切り返し, which is exactly what
 * happens in every small roof car park in Japan and the reason ten of the twelve
 * bays up there are 軽 bays.
 *
 * **Twelve bays, not twenty.**  The deck is 21.04 x 15.84 usable, which is two
 * 5.0 m rows either side of a 5.84 m aisle -- seven along the north parapet (one
 * of them the 3.4 m おもいやり bay) and five along the south, because the ramp's
 * own mouth takes 4.6 m out of that row and the cart return takes 2.8 m more.
 * Twenty bays needs a second aisle and a building half as big again.  (The first
 * draft of this header said fourteen, eight and six; the bay loop in `buildDeck`
 * is what the deck actually has, and `traffic.js`'s numbers index into it.)
 *
 * **The frontage faces +z and everything follows from that.**  The sun is at
 * (-52, 62, 56), so shadows fall east and south: a +z frontage is the only
 * orientation where the *wall* is lit and the apron in front of it is *also*
 * out of the building's own shadow.  Which puts the road on the north, the
 * ramp and the blank flank on the south against 湯の坂's terrace, the delivery
 * yard behind the west gable, and the pedestrian ways on the east where the
 * town is.  Four elevations, four jobs, no elevation doing two.
 *
 * **The store is served from 四丁目's lane and not from the main road.**  Its
 * head at (-3.40, 58.4) is 25 m away and there is no route: 桜守裏町's arm, its
 * 長屋 and `onsen.js`'s screen tree at (-12.8, 62.2) fill the whole corridor
 * between z = 60 and z = 66, and the tree does not move.  North of the 長屋
 * there is a clear band, so 七丁目通り leaves the district east, turns south at
 * x = -16.1 and runs east along z = 74.6 into 四丁目's lane at its north end.
 * That link costs the pocket park its south-west corner, which is recorded in
 * NEXT.md and commented in `yonchome.js`.
 *
 * ------------------------------------------------------------------ *
 * FLOODFILL -- every one of these must be reachable on foot from the spawn.
 * Several are written where a *person* can stand rather than at the middle of
 * the thing they name, because a bay with a car in it and a rack with a trolley
 * rank in it are correctly unreachable -- the artefact `NEXT.md` warns about.
 *
 *   linkE        [2.60, 73.90]   the link lane at 四丁目's park corner
 *   linkW        [-11.00, 73.90] the link lane, west of 桜守裏町's 長屋
 *   spurS        [-16.10, 77.00] 七丁目通り's south leg, at the houses
 *   spurN        [-16.10, 89.00] its north leg, at the junction
 *   roadE        [-22.00, 91.60] 七丁目通り, east end
 *   roadM        [-38.00, 91.60] 七丁目通り, at the crossing
 *   roadW        [-52.00, 91.60] its west end, at the service drive
 *   court        [-38.00, 84.60] the middle of the 前場
 *   doors        [-37.40, 83.00] outside the automatic doors
 *   courtE       [-29.90, 84.60] the apron's east end, at the machines.  Was
 *                                [-30.60, 84.60], which is inside the kei parked
 *                                in the middle short-stay bay -- correctly
 *                                unreachable, and the same artefact 五丁目's
 *                                送迎 bay and 四丁目's carport both hit
 *   courtW       [-45.00, 86.40] its west end, north of the trolley bay
 *   rampFoot     [-24.70, 83.40] the ramp's mouth, under the height bar
 *   rampMid      [-24.70, 74.00] halfway down the east leg
 *   rampCorner   [-24.70, 63.30] the corner landing
 *   rampTop      [-40.60, 63.30] the top landing, level with the deck
 *   deckE        [-30.00, 73.80] the deck's aisle, east end
 *   deckW        [-46.60, 73.80] the aisle's west end, at the service block
 *   deckAcc      [-44.20, 78.00] the おもいやり bay, which is left empty
 *   passS        [-20.60, 68.00] the service passage, south end
 *   passN        [-20.60, 79.00] its north end at the apron
 *   stepFoot     [-20.80, 64.60] the foot of the flight up to 湯の坂
 *   stepTop      [-20.80, 58.60] its head, on 湯の坂's terrace
 *   pathE        [-13.50, 64.20] the footpath east, into 桜守裏町's arm
 *   yardGate     [-51.50, 83.50] the delivery yard's gate off the service drive
 *   yard         [-53.90, 71.00] the yard itself, west of the lorry
 *   dock         [-50.10, 74.00] the loading dock's platform
 *   coin         [-38.00, 96.60] the coin park's apron
 *   corpFront    [-11.40, 79.40] コーポ さかえ's gallery
 *   houseGate    [-11.60, 88.20] the detached house's gate
 * ------------------------------------------------------------------ */

const Y = 0.45;                                   // dead flat over the whole parcel
const DECK = 6.20;                                // the roof car park surface
/* The parapet, and it is 0.80 rather than the 1.05 the first pass used, because
 * **the view off this deck is half the reason it exists**.  The player's eye on
 * the deck is 7.80; a 1.05 m upstand with a 0.55 m rail on it tops out at 7.80
 * exactly, and every outward view was a grey band with tree canopies over it.
 * 0.80 + a 0.42 m rail is 1.22 m of edge protection -- still well over the
 * 0.38 m step, so it is a real barrier -- and it puts the cap line across the
 * lower third of the frame instead of across the horizon. */
const PAR_H = 0.80;

/* --------------------------------- the store --------------------------------- */
const SX0 = -48.6, SX1 = -27.0;                   // 21.6 m of frontage
const SZ0 = 65.6, SZ1 = 82.0;                     // 16.4 m deep
const PLINTH = 0.16;
const GLASS_H = 3.60;                             // head of the shopfront glazing
const FASCIA0 = 4.30, FASCIA1 = 5.40;             // the signboard band
const REC = 1.60;                                 // how far the entrance bay is set back
const REC_X0 = -41.4, REC_X1 = -33.4;             // and how wide

/* ---------------------------------- the ramp ----------------------------------
 * One-way up.  4.6 m overall between 0.30 m upstands, which is 4.0 m of running
 * surface -- a Japanese roof-park ramp is 3.5-4.0 and this one has to take the
 * 2 t lorry that restocks the store as far as the corner landing, where it
 * turns round and comes back down. */
const RW = 4.60;
const R_EX0 = -27.0, R_EX1 = R_EX0 + RW;          // east leg, x -27.0..-22.4
const R_SZ0 = 61.0, R_SZ1 = R_SZ0 + RW;           // south leg, z 61.0..65.6
/* The two flights and the landing between them, and the arithmetic is the whole
 * design: 1/6 is the steepest a self-parking ramp may be, so a 5.75 m rise
 * needs 34.5 m of run and there is nowhere to put a straight one.
 *
 * **Leg 2 starts at the landing's far side, x = R_EX0, and not at R_EX1.**
 * Written the other way round it starts at the landing's *near* edge and climbs
 * straight across it -- and because `heightAt` is a max over platforms, the
 * landing then answers 3.58 where it should answer 3.55 and the corner is a
 * 0.48 m step the walker cannot take.  It rendered perfectly; the flood fill
 * read the whole roof deck unreachable, which is how it was found. */
const RAMP_Z0 = 84.20;                            // leg 1's foot, out on the apron
const LEG1 = RAMP_Z0 - SZ0;                       // 18.60
const Y_CORNER = Y + LEG1 / 6;                    // 3.55 -- the landing's height
const LEG2 = (DECK - Y) * 6 - LEG1;               // 15.90
const RAMP_TOP_X = R_EX0 - LEG2;                  // -42.90
const RAMP_ENTRY_X0 = RAMP_TOP_X - RW, RAMP_ENTRY_X1 = RAMP_TOP_X;   // the gap in the deck's south parapet

/* -------------------------------- the street -------------------------------- */
const CT_Z0 = SZ1, CT_Z1 = 87.2;                  // the 前場 apron
const WK = 1.40;                                  // footway width on 七丁目通り
const RD_Z0 = 88.6, RD_Z1 = 94.6;                 // 6.0 m carriageway
const RD_Z = (RD_Z0 + RD_Z1) / 2;                 // 91.6
const RD_X0 = -56.0, RD_X1 = -13.6;

/* the south leg down to the link, and the link east to 四丁目's lane */
const SP_X = -16.1, SP_W = 5.00;                  // x -18.6..-13.6
/* 73.90 and not a round number: 桜守裏町's 長屋 runs to z = 70.90 and its eave
 * overhangs 0.92 m to 71.82, so a 3.6 m lane can start at 72.10 and no further
 * south.  That eave is the northern edge of everything old on this side. */
const LK_Z = 73.90, LK_W = 3.60;                  // z 72.10..75.70
/**
 * Where the spur's carriageway, its footways and its kerbs each stop at the link.
 *
 * They are three different numbers and they were one, which is what made this
 * junction read as two slabs that miss each other.  The carriageway ended at the
 * link's *centre line* (73.90) and the link began at the spur's, so the junction's
 * south-west quadrant -- 2.5 x 1.8 m of it -- was never paved at all: bare grass
 * 0.11 m below two roads, with a notched corner in the middle of the frame.
 *
 * A T junction is paved to the far kerb line of the road it meets (72.10), its
 * footways stop at the near one (75.70), and the minor arm butts against the
 * major one's kerb line (x = -13.60) rather than overlapping it -- two coplanar
 * slabs at the same height are a coin toss, which is the スーパー さかえ deck.
 */
const SP_Z0 = LK_Z;
const SP_Z_END = LK_Z - LK_W / 2;                 // 72.10, the carriageway's south end
const SP_WALK_Z0 = LK_Z + LK_W / 2;               // 75.70, where the footways begin
const LK_X1 = 4.30;                               // 四丁目's lane, west kerb

/* the pedestrian service passage down the east side, and the footpath east */
const PS_X0 = -22.30, PS_X1 = -19.10;
const FP_Z = 64.2, FP_W = 2.40;                   // z 63.0..65.4
const STEP_X = -20.80, STEP_W = 2.00;             // the flight up onto 湯の坂

/* the delivery yard, behind the west gable */
const YD_X0 = -56.0, YD_X1 = SX0;
const YD_Z0 = 66.0, YD_Z1 = 82.0;
/* The loading dock, **at module scope because `buildStore` has to know about
 * it.**  The gable is `buildStore`'s elevation and the dock is `buildYard`'s
 * structure, and while these three numbers lived inside `buildYard` the store
 * dressed the gable as if it were blank: its service door went in at z = 74.6,
 * which is the middle of the shutter opening, with the leaf's front face at
 * exactly the curtain's own x.  Two coplanar door panels, so the depth test was
 * a coin toss over the whole patch and what showed was a stippled seam down the
 * shutter -- the same family as the onsen street's noren, and invisible from
 * everywhere except straight on. */
const DK_X = SX0, DK_Z0 = 71.0, DK_Z1 = 77.8, DK_H = 1.05;

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.concreteDark = cel({ color: PAL.concreteDark, bands: 3, tint: 0x655d84 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.drain = cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 });
  M.dark = cel({ color: PAL.blackSoft, bands: 2, tint: 0x4b4560 });
  /* The store's three body tones.  Pale cream over pale grey with a blue-grey
   * eaves band, which is the standard livery of a Japanese suburban supermarket
   * and, more to the point, is three values inside the range this world already
   * uses for houses -- so the biggest mass in the district is also one of the
   * quietest. */
  M.wall = cel({ color: 0xf6f1e4, bands: 3, tint: 0x6f6790 });
  M.wallGrey = cel({ color: 0xe2e0e4, bands: 3, tint: 0x6f6790 });
  M.band = cel({ color: 0x59617a, bands: 3, tint: 0x514b70 });
  M.bandDeep = cel({ color: 0x4d5468, bands: 3, tint: 0x514b70 });
  M.brand = cel({ color: PAL.leafDeep, bands: 3, tint: 0x4a5f7a });
  M.glass = cel({ color: PAL.glass, bands: 2, transparent: true, opacity: 0.42, tint: 0x6f6790 });
  M.mullion = cel({ color: 0xb0b4bc, bands: 3, tint: 0x666090 });
  M.white = cel({ color: PAL.lineWhite, bands: 2, tint: 0x8e86ad });
  M.yellow = flat({ color: PAL.lineYellow });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.board = cel({ color: 0xe4e0d4, bands: 3, tint: 0x6f6790 });
  M.canopy = cel({ color: 0xdfe4ea, bands: 3, tint: 0x6f6790 });
  return M;
}

/* Painted marking helper: a flat quad laid on a surface, out of the depth
 * buffer's way so the ink pass leaves it alone. */
function paintQuad(ctx, o) {
  const g = new THREE.PlaneGeometry(o.w, o.d);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, o.mat);
  if (o.mat.transparent) o.mat.depthWrite = false;
  mesh.position.set(o.x, o.y + 0.022, o.z);
  if (o.ry) mesh.rotation.y = o.ry;
  /* **`grade` rakes the quad with the surface, and a marking on a ramp needs it.**
   * A flat 1.2 m quad on a 1 in 6 slope is 0.1 m out at each end, so with the
   * 0.022 m lift at its centre the up-slope half is 0.078 m *under* the concrete:
   * every 進行方向 arrow on this ramp lost its head and rendered as a shaft with a
   * crossbar.  The geometry's own +y became local -z when it was rotated, so the
   * rake is a rotation about the *local* x after the yaw -- which makes one
   * expression right for both legs.  `Rx(t)` sends local (0,0,-1) to (0, sin t,
   * -cos t), so the -z end rises for **positive** t; the first attempt used -atan
   * and buried the head further, which is the one sign in this file worth deriving
   * rather than guessing. */
  if (o.grade) mesh.rotateX(Math.atan(o.grade));
  mesh.userData.noOutline = true;
  mesh.renderOrder = 1;
  ctx.add(mesh);
  return mesh;
}

/**
 * A ramp flight: **one raked solid for the eye, a run of stepped platforms for
 * the feet.**
 *
 * `heightAt` is a max over axis-aligned boxes and cannot express a slope, so
 * the walker needs the run of platforms -- but the ink pass fires on every
 * box's silhouette, so drawing that run is a staircase of pale slabs with a
 * black line between each.  川端の道's towpath ramp is where this was worked
 * out; this one is four times as long and carries its own upstands, deck edge
 * and soffit.
 *
 * A box along X turned by `rz` about Z sends its **+x** end up, so a flight
 * that climbs toward -x takes a *positive* rz; a box along Z turned by `rx`
 * about X sends its +z end **down**, so a flight climbing toward +z takes a
 * negative rx.  Both signs are derived here once rather than guessed at the
 * three call sites, which is exactly the mistake the overbridge stringers made
 * in both directions.
 */
function rampFlight(ctx, o) {
  const m = mats();
  const along = o.axis;                       // 'x' or 'z'
  const a0 = o.from, a1 = o.to;               // start (low) and end (high) along `axis`
  const y0 = o.y0, y1 = o.y1;
  const run = Math.abs(a1 - a0);
  const rise = y1 - y0;
  const dir = Math.sign(a1 - a0);
  const w = o.w;                              // across the flight
  const at = o.at;                            // its centreline on the other axis
  const T = 0.34;                             // structural thickness of the deck
  const tilt = Math.atan2(rise, run);
  const len = Math.hypot(run, rise);
  const mid = (a0 + a1) / 2, ymid = (y0 + y1) / 2;

  /* the running surface, one casting */
  const slabGeo = new THREE.BoxGeometry(along === 'x' ? len : w, T, along === 'x' ? w : len);
  const slab = new THREE.Mesh(slabGeo, o.mat ?? m.concrete);
  slab.position.set(along === 'x' ? mid : at, ymid - T / 2, along === 'x' ? at : mid);
  if (along === 'x') slab.rotation.z = tilt * dir;
  else slab.rotation.x = -tilt * dir;
  slab.castShadow = slab.receiveShadow = true;
  ctx.add(slab);
  hullOutline(slab, { thickness: 0.0030 });

  /* the two upstands, raked with it, and a collider per segment topped at its
   * own **low** end -- a swept barrier needs a swept collider */
  const SEG = 8;
  for (const s of [-1, 1]) {
    if (o.open === s) continue;
    const ux = along === 'x' ? mid : at + s * (w / 2 - 0.15);
    const uz = along === 'x' ? at + s * (w / 2 - 0.15) : mid;
    const up = new THREE.Mesh(
      new THREE.BoxGeometry(along === 'x' ? len : 0.30, 0.62, along === 'x' ? 0.30 : len),
      m.concreteMid);
    up.position.set(ux, ymid + 0.31 - 0.06, uz);
    if (along === 'x') up.rotation.z = tilt * dir;
    else up.rotation.x = -tilt * dir;
    up.castShadow = up.receiveShadow = true;
    ctx.add(up);
    for (let i = 0; i < SEG; i++) {
      const t0 = a0 + (a1 - a0) * (i / SEG), t1 = a0 + (a1 - a0) * ((i + 1) / SEG);
      const lowY = y0 + rise * (Math.min(i, i + 1) / SEG);
      if (along === 'x') {
        ctx.collide(Math.min(t0, t1), at + s * (w / 2 - 0.15) - 0.16,
          Math.max(t0, t1), at + s * (w / 2 - 0.15) + 0.16, lowY + 0.56);
      } else {
        ctx.collide(at + s * (w / 2 - 0.15) - 0.16, Math.min(t0, t1),
          at + s * (w / 2 - 0.15) + 0.16, Math.max(t0, t1), lowY + 0.56);
      }
    }
  }

  /* the feet: a platform every ~0.95 m, so the walk up is smooth to within
   * 0.16 m and every step is well inside `heightAt`'s 0.55 m reach */
  const n = Math.max(4, Math.round(run / 0.95));
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * (i / n), t1 = a0 + (a1 - a0) * ((i + 1) / n);
    const top = y0 + rise * ((i + 0.5) / n);
    ctx.platform(along === 'x'
      ? { x0: Math.min(t0, t1) - 0.02, x1: Math.max(t0, t1) + 0.02, z0: at - w / 2, z1: at + w / 2, top }
      : { x0: at - w / 2, x1: at + w / 2, z0: Math.min(t0, t1) - 0.02, z1: Math.max(t0, t1) + 0.02, top });
  }

  /* piers under it wherever it is more than a metre in the air */
  const pierAt = [];
  for (let i = 1; i < n; i++) {
    const t = a0 + (a1 - a0) * (i / n);
    const yy = y0 + rise * (i / n);
    if (yy - Y > 1.4 && i % 4 === 2) pierAt.push([t, yy]);
  }
  const piers = [];
  for (const [t, yy] of pierAt) {
    const h = yy - T - Y;
    if (h < 0.4) continue;
    const px = along === 'x' ? t : at;
    const pz = along === 'x' ? at : t;
    piers.push({ geometry: new THREE.BoxGeometry(0.44, h, 0.44), matrix: trs(px, Y + h / 2, pz) });
    piers.push({ geometry: new THREE.BoxGeometry(0.66, 0.18, 0.66), matrix: trs(px, Y + 0.09, pz) });
  }
  if (piers.length) {
    const pm = new THREE.Mesh(bake(piers), m.concreteMid);
    pm.castShadow = pm.receiveShadow = true;
    ctx.add(pm);
  }
  return { tilt, len };
}

/** A flat landing on the ramp: slab, upstands, piers, platform, colliders. */
function rampLanding(ctx, o) {
  const m = mats();
  const T = 0.34;
  const w = o.x1 - o.x0, d = o.z1 - o.z0;
  const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
  const slab = box(w, T, d, m.concrete, cx, o.y - T / 2, cz);
  slab.castShadow = slab.receiveShadow = true;
  ctx.add(slab);
  hullOutline(slab, { thickness: 0.0030 });
  ctx.platform({ x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, top: o.y });
  for (const side of o.walls ?? []) {
    const t = 0.30;
    let b;
    if (side === 'x-') b = { x0: o.x0, x1: o.x0 + t, z0: o.z0, z1: o.z1 };
    else if (side === 'x+') b = { x0: o.x1 - t, x1: o.x1, z0: o.z0, z1: o.z1 };
    else if (side === 'z-') b = { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z0 + t };
    else b = { x0: o.x0, x1: o.x1, z0: o.z1 - t, z1: o.z1 };
    const up = box(b.x1 - b.x0, 0.62, b.z1 - b.z0, m.concreteMid,
      (b.x0 + b.x1) / 2, o.y + 0.25, (b.z0 + b.z1) / 2);
    up.castShadow = up.receiveShadow = true;
    ctx.add(up);
    ctx.collide(b.x0, b.z0, b.x1, b.z1, o.y + 0.56);
  }
  if (o.y - Y > 1.4) {
    const h = o.y - T - Y;
    const piers = [];
    for (const px of [o.x0 + 0.7, o.x1 - 0.7]) {
      for (const pz of [o.z0 + 0.7, o.z1 - 0.7]) {
        piers.push({ geometry: new THREE.BoxGeometry(0.5, h, 0.5), matrix: trs(px, Y + h / 2, pz) });
        piers.push({ geometry: new THREE.BoxGeometry(0.74, 0.18, 0.74), matrix: trs(px, Y + 0.09, pz) });
      }
    }
    const pm = new THREE.Mesh(bake(piers), m.concreteMid);
    pm.castShadow = pm.receiveShadow = true;
    ctx.add(pm);
  }
}

/* ================================================================== *
 * The district.
 * ================================================================== */

export function buildNanachome(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(7700);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  buildGround(ctx, m, gm, rng);
  buildStore(ctx, m, gm, rng);
  buildRamp(ctx, m, gm);
  buildDeck(ctx, m, gm, rng);
  buildCourt(ctx, m, gm, rng, sakura, shrubs, petals);
  buildYard(ctx, m, gm, rng);
  buildRoad(ctx, m, gm, rng, sakura, shrubs, petals);
  buildSpur(ctx, m, gm, rng, sakura, shrubs, petals);
  buildEast(ctx, m, gm, rng, shrubs, petals);

  /* The planting.  A grove line closes the sky behind the store on the west and
   * north -- the store's own mass does the rest, which is the job the six trees
   * this district cleared used to do for 湯の坂. */
  for (let i = 0; i < 5; i++) {
    grove.push({ x: -58.4 - (i % 2) * 2.2, z: 68.0 + i * 4.6, y: Y, scale: 1.5 + (i % 2) * 0.18, seed: 7810 + i, spread: 1.2 });
  }
  /* The north line stands clear of the coin park -- its bays run to z = 101.6
   * and its hedge to 102.0, and a grove tree collides with a 1.4 m box. */
  for (let i = 0; i < 4; i++) {
    grove.push({ x: -50.0 + i * 6.4, z: 104.6 + (i % 2) * 2.4, y: Y, scale: 1.45 + (i % 3) * 0.15, seed: 7820 + i, spread: 1.15 });
  }
  grove.push({ x: -24.0, z: 98.4, y: Y, scale: 1.5, seed: 7826, spread: 1.2 });
  grove.push({ x: -3.4, z: 97.8, y: Y, scale: 1.4, seed: 7827, spread: 1.1 });

  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * The ground: every paved surface in the district, laid before anything
 * stands on it so `ctx.groundAt` answers correctly for the props.
 * ------------------------------------------------------------------ */
function buildGround(ctx, m, gm, rng) {
  /* -------------------------- 七丁目通り -------------------------- *
   * 6.0 m of carriageway, which is a shade wider than every residential lane in
   * the world (2.3-3.6) and a shade narrower than the main road (6.3).  That is
   * the brief's "slightly wider than an ordinary residential street", and it is
   * also simply what a road with a supermarket's delivery lorry, a ramp mouth
   * and kerbside parking on it has to be. */
  lane(ctx, {
    axis: 'x', at: RD_Z, from: RD_X0, to: RD_X1, w: RD_Z1 - RD_Z0,
    y: Y, rise: 0.05, kerb: false, mat: gm.asphalt, name: 'nanaRoad',
  });
  /* The kerbs, **split at everything that drives over one**.  A kerb carries no
   * collider anywhere in this world, so neither the flood fill nor a rendered
   * frame can find one laid across an entrance -- 六丁目 ran 0.105 m of concrete
   * over the mouth of a car park with two cars in it and nothing caught it. */
  const southBreaks = [[-54.6, -49.8], [-27.4, -22.0]];      // service drive, ramp mouth
  const northBreaks = [[-46.4, -30.6]];                      // the coin park
  kerbRun(ctx, gm, 'x', RD_Z0 - 0.13, RD_X0, RD_X1, southBreaks);
  kerbRun(ctx, gm, 'x', RD_Z1 + 0.13, RD_X0, RD_X1, northBreaks);
  // the footways
  padStrip(ctx, gm, RD_X0, RD_X1, CT_Z1, RD_Z0, 'nanaWalkS', gm.sidewalk);
  padStrip(ctx, gm, RD_X0, RD_X1, RD_Z1, RD_Z1 + WK, 'nanaWalkN', gm.sidewalkAlt);

  /* the 前場 -- the apron in front of the doors */
  pad(ctx, {
    x: (SX0 + R_EX1) / 2, z: (CT_Z0 + CT_Z1) / 2,
    w: R_EX1 - SX0, d: CT_Z1 - CT_Z0, y: Y, h: 0.09,
    mat: gm.concrete, name: 'nanaCourt',
  });
  /* The floor of the entrance recess is **not** laid here: `buildStore` tiles it
   * one step proud of the apron (top `Y + 0.17`) and registers the platform for
   * it, which is what a Japanese shopfront actually does.  A second slab here
   * would be two pads at two heights over one footprint. */
  /* the service drive down the store's west side into the yard */
  pad(ctx, {
    x: -52.3, z: (YD_Z1 + RD_Z0) / 2, w: 4.4, d: RD_Z0 - YD_Z1,
    y: Y, h: 0.06, mat: gm.asphaltWorn, name: 'nanaDrive',
  });
  pad(ctx, {
    x: (YD_X0 + YD_X1) / 2, z: (YD_Z0 + YD_Z1) / 2, w: YD_X1 - YD_X0, d: YD_Z1 - YD_Z0,
    y: Y, h: 0.06, mat: gm.asphaltWorn, name: 'nanaYard',
  });

  /* the ramp's mouth, at the apron's east end -- level as far as z = RAMP_Z0,
   * where the climb starts */
  pad(ctx, {
    x: (R_EX0 + R_EX1) / 2, z: (RAMP_Z0 + CT_Z1) / 2, w: RW, d: CT_Z1 - RAMP_Z0,
    y: Y, h: 0.09, mat: gm.concrete, name: 'nanaRampMouth',
  });

  /* -------------------- the south leg, and the link east -------------------- */
  lane(ctx, {
    axis: 'z', at: SP_X, from: SP_Z_END, to: RD_Z0, w: SP_W, rise: 0.05, kerb: false,
    mat: gm.asphalt, name: 'nanaSpur', platform: false,
  });
  ctx.platform({ x0: SP_X - SP_W / 2, x1: SP_X + SP_W / 2, z0: SP_Z_END, z1: RD_Z0, top: Y + 0.11 });
  padStrip(ctx, gm, SP_X - SP_W / 2 - 1.2, SP_X - SP_W / 2, SP_WALK_Z0, RD_Z0, 'nanaSpurWalkW', gm.sidewalk, true);
  padStrip(ctx, gm, SP_X + SP_W / 2, SP_X + SP_W / 2 + 1.2, SP_WALK_Z0, RD_Z0, 'nanaSpurWalkE', gm.sidewalkAlt, true);
  kerbRun(ctx, gm, 'z', SP_X - SP_W / 2 - 0.13, SP_WALK_Z0 + 0.6, RD_Z0 - 1.0, []);
  kerbRun(ctx, gm, 'z', SP_X + SP_W / 2 + 0.13, SP_WALK_Z0 + 0.6, RD_Z0 - 1.0, [[78.2, 80.6], [85.0, 87.4]]);

  /* The link.  3.6 m, unkerbed with a slotted channel down one side, which is
   * this world's grammar for "this one was not planned" -- and it was not: it is
   * the road the estate got when the field behind the onsen street was built on. */
  lane(ctx, {
    axis: 'x', at: LK_Z, from: SP_X + SP_W / 2, to: LK_X1, w: LK_W, y: Y, rise: 0.05,
    kerb: false, mat: gm.asphaltWorn, name: 'nanaLink',
  });
  laneGutter(ctx, { axis: 'x', at: LK_Z - LK_W / 2 - 0.24, from: SP_X + SP_W / 2 + 0.6, to: LK_X1 - 1.0, y: Y, w: 0.34 });
  laneLine(ctx, { axis: 'x', at: LK_Z, from: SP_X + SP_W / 2 + 1.2, to: LK_X1 - 1.4, y: Y + 0.13, dash: 0.9 });

  /* ------------------ the service passage and the footpath ------------------ */
  pad(ctx, {
    x: (PS_X0 + PS_X1) / 2, z: (63.4 + CT_Z1) / 2, w: PS_X1 - PS_X0, d: CT_Z1 - 63.4,
    y: Y, h: 0.07, mat: gm.concrete, name: 'nanaPassage',
  });
  pad(ctx, {
    x: (PS_X0 + -11.45) / 2, z: FP_Z, w: -11.45 - PS_X0, d: FP_W,
    y: Y, h: 0.06, mat: gm.concreteMid, name: 'nanaFootpath',
  });

  /* --------------- 湯の坂's north edge: the missing wall, and the steps --------------- *
   * `onsen.js` stops its north retaining wall at x = -27.0 and picks it up again
   * at -19.6, and there is nothing in the 7.4 m between: a 2.75 m drop off the
   * terrace with no wall, no railing and no way down.  It never showed because
   * until now there was nothing on this side to fall onto.  The gap gets the
   * flight the opening was presumably always meant to have, and a railing on the
   * terrace lip either side of it. */
  {
    const TER = 3.20;
    const RISE = (TER - Y) / 14;                   // 0.19642
    /* No side cheeks.  The ground here is flat and the terrace is a wall, so
     * the flight is free-standing rather than cut into a bank -- and a pair of
     * 0.28 m cheeks would take 1.1 m of walkable ground out of a 3.2 m passage
     * once the player's radius is added to each.  Every stair in this world
     * that has cheeks is retaining something. */
    steps(ctx, {
      x: STEP_X, z: 65.4, n: 14, rise: RISE, run: 0.42, w: STEP_W,
      y: Y, dir: -1, axis: 'z', mat: gm.stone, lipMat: gm.stoneDark,
    });
    // the railing along the rest of the terrace lip, which had none at all
    for (const [a, b] of [[-27.0, STEP_X - STEP_W / 2 - 0.24], [STEP_X + STEP_W / 2 + 0.24, -19.6]]) {
      if (b - a < 0.4) continue;
      wallRun(ctx, {
        axis: 'x', at: 59.60, from: a, to: b, y: 0, h: TER + 0.55, t: 0.40, panel: 3.4,
        mat: gm.stoneDark, capMat: gm.stoneWarm,
      });
    }
    // a pier at each end of the opening, the way every other break in that wall has
    for (const px of [-27.0, -19.6]) {
      const H = TER + 0.55;
      const p = box(0.72, H + 0.34, 0.72, gm.stoneDark, px, (H + 0.34) / 2 - 0.05, 59.60);
      p.castShadow = p.receiveShadow = true;
      ctx.add(p);
      ctx.add(box(0.9, 0.14, 0.9, gm.stoneWarm, px, H + 0.36, 59.60));
      ctx.collide(px - 0.4, 59.2, px + 0.4, 60.0, H + 0.4);
    }
  }
}

/** A run of kerb along one edge, split wherever something drives over it. */
function kerbRun(ctx, gm, axis, at, from, to, breaks) {
  const segs = [];
  let a = Math.min(from, to);
  const end = Math.max(from, to);
  const sorted = [...breaks].sort((p, q) => p[0] - q[0]);
  for (const [b0, b1] of sorted) {
    if (b0 > a) segs.push([a, Math.min(b0, end), 0.105]);
    if (b1 > a) segs.push([Math.max(b0, a), Math.min(b1, end), 0.040]);   // dropped across a crossing
    a = Math.max(a, b1);
  }
  if (a < end) segs.push([a, end, 0.105]);
  const parts = [];
  for (const [s0, s1, h] of segs) {
    if (s1 - s0 < 0.05) continue;
    const len = s1 - s0;
    parts.push({
      geometry: new THREE.BoxGeometry(axis === 'x' ? len : 0.26, 0.16, axis === 'x' ? 0.26 : len),
      matrix: axis === 'x' ? trs((s0 + s1) / 2, Y + h - 0.08, at) : trs(at, Y + h - 0.08, (s0 + s1) / 2),
    });
  }
  if (!parts.length) return;
  const mesh = new THREE.Mesh(bake(parts), gm.curb);
  mesh.receiveShadow = true;
  ctx.add(mesh);
}

/** A paved strip between two z (or two x) bounds. */
function padStrip(ctx, gm, x0, x1, z0, z1, name, mat, thin = false) {
  pad(ctx, {
    x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0,
    y: Y, h: thin ? 0.10 : 0.135, mat, name,
  });
}

/* ------------------------------------------------------------------ *
 * The store.
 *
 * A solid volume with the entrance bay cut back into it, because **you cannot
 * carve a recess into a box** -- the note the onsen street's 格子 panels and
 * the library's window plates both cost a round.  The volume is built as four
 * blocks with the recess as the hole between them, and the glazing, mullions
 * and interior plates are then built *outward* off the faces that hole leaves.
 * ------------------------------------------------------------------ */
function buildStore(ctx, m, gm, rng) {
  const parts = {
    wall: [], grey: [], band: [], brand: [], metal: [], metalDark: [],
    concrete: [], glassFrame: [],
  };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
  const W = SX1 - SX0, D = SZ1 - SZ0;
  const CX = (SX0 + SX1) / 2, CZ = (SZ0 + SZ1) / 2;
  const H = DECK - Y;                                   // 5.75 to the deck slab

  /* ------------------------------- the volume -------------------------------
   * **The mass stops 0.10 m short of the deck and the deck slab makes up the
   * difference.**  Built to the full height its top face -- pale cream render,
   * `m.wall` -- lands at exactly `DECK`, which is exactly where `buildDeck` lays
   * the deck slab: two coplanar faces are a coin toss, and the one that was
   * winning over most of the roof was the *render*.  So the roof car park was
   * surfaced in the same 0xf6f1e4 as the elevations, the sun's top cel band took
   * that to within a few per cent of white, and every white line, numeral and
   * arrow on it disappeared.  Changing the slab's material did nothing at all,
   * twice, which is the tell: it was not being drawn. */
  const HM = H - 0.10;
  // the mass, stopping REC short of the frontage across the entrance bay
  push('wall', new THREE.BoxGeometry(W, HM, D - REC), trs(CX, Y + HM / 2, CZ - REC / 2));
  for (const [a, b] of [[SX0, REC_X0], [REC_X1, SX1]]) {
    push('wall', new THREE.BoxGeometry(b - a, HM, REC), trs((a + b) / 2, Y + HM / 2, SZ1 - REC / 2));
  }
  // the header over the opening, and the soffit of the recess
  push('wall', new THREE.BoxGeometry(REC_X1 - REC_X0, HM - GLASS_H - 0.30, REC),
    trs((REC_X0 + REC_X1) / 2, Y + GLASS_H + 0.30 + (HM - GLASS_H - 0.30) / 2, SZ1 - REC / 2));
  push('grey', new THREE.BoxGeometry(REC_X1 - REC_X0, 0.30, REC),
    trs((REC_X0 + REC_X1) / 2, Y + GLASS_H + 0.15, SZ1 - REC / 2));
  // the recess floor, one step of tiling proud of the apron
  push('concrete', new THREE.BoxGeometry(REC_X1 - REC_X0 + 0.2, 0.12, REC + 0.12),
    trs((REC_X0 + REC_X1) / 2, Y + 0.11, SZ1 - REC / 2 + 0.06));
  ctx.platform({
    x0: REC_X0 - 0.1, x1: REC_X1 + 0.1, z0: SZ1 - REC, z1: SZ1 + 0.06, top: Y + 0.17,
  });

  // the plinth: a darker band all round, which is what stops a big pale mass
  // looking like it is floating on the paving
  push('concrete', new THREE.BoxGeometry(W + 0.22, PLINTH, D + 0.22), trs(CX, Y + PLINTH / 2, CZ));

  /* --------------------------- the facade banding --------------------------- *
   * Four bands, and they are the whole reason this reads as a building rather
   * than a shed: a glazed shop band, the deep signboard fascia, a pale upper
   * spandrel with the vent louvres in it, and the parapet.  The fascia stands
   * 0.22 proud of the wall so it catches its own shadow line. */
  for (const [z, nz] of [[SZ1, 1], [SZ0, -1]]) {
    push('band', new THREE.BoxGeometry(W + 0.44, FASCIA1 - FASCIA0, 0.24),
      trs(CX, Y + (FASCIA0 + FASCIA1) / 2, z + nz * 0.12));
  }
  for (const [x, nx] of [[SX0, -1], [SX1, 1]]) {
    push('band', new THREE.BoxGeometry(0.24, FASCIA1 - FASCIA0, D + 0.44),
      trs(x + nx * 0.12, Y + (FASCIA0 + FASCIA1) / 2, CZ));
  }
  // the string course under the fascia and the pale spandrel over it
  for (const [z, nz] of [[SZ1, 1], [SZ0, -1]]) {
    push('grey', new THREE.BoxGeometry(W + 0.30, 0.14, 0.16), trs(CX, Y + FASCIA0 - 0.07, z + nz * 0.08));
    push('grey', new THREE.BoxGeometry(W + 0.16, H - FASCIA1 - 0.2, 0.10), trs(CX, Y + FASCIA1 + (H - FASCIA1 - 0.2) / 2, z + nz * 0.05));
  }
  for (const [x, nx] of [[SX0, -1], [SX1, 1]]) {
    push('grey', new THREE.BoxGeometry(0.16, 0.14, D + 0.30), trs(x + nx * 0.08, Y + FASCIA0 - 0.07, CZ));
    push('grey', new THREE.BoxGeometry(0.10, H - FASCIA1 - 0.2, D + 0.16), trs(x + nx * 0.05, Y + FASCIA1 + (H - FASCIA1 - 0.2) / 2, CZ));
  }

  /* --------------------------------- parapet --------------------------------- *
   * Solid on three sides, and the fourth (the south) is where the ramp arrives,
   * so it has a 4.6 m gap in it.  The colliders are what keep the player on the
   * deck; each one is well clear of the deck surface by more than a step. */
  const PT = 0.28;
  const runs = [
    { x0: SX0, x1: SX1, z0: SZ1 - PT, z1: SZ1 },
    { x0: SX0, x1: SX1, z0: SZ0, z1: SZ0 + PT, gap: [RAMP_ENTRY_X0, RAMP_ENTRY_X1] },
    { x0: SX0, x1: SX0 + PT, z0: SZ0, z1: SZ1 },
    { x0: SX1 - PT, x1: SX1, z0: SZ0, z1: SZ1 },
  ];
  for (const r of runs) {
    const spans = r.gap
      ? [[r.x0, r.gap[0]], [r.gap[1], r.x1]]
      : [[r.x0, r.x1]];
    for (const [a, b] of spans) {
      if (b - a < 0.05) continue;
      push('grey', new THREE.BoxGeometry(b - a, PAR_H, r.z1 - r.z0),
        trs((a + b) / 2, DECK + PAR_H / 2, (r.z0 + r.z1) / 2));
      push('band', new THREE.BoxGeometry(b - a + 0.12, 0.12, r.z1 - r.z0 + 0.12),
        trs((a + b) / 2, DECK + PAR_H + 0.06, (r.z0 + r.z1) / 2));
      /* **Bottomed at the deck.**  A collider has no underside unless it is given
       * one, and the north run of this parapet stands directly over the entrance
       * recess: continuous from the ground it is a 21.6 m wall 0.34 m in front of
       * the shop doors, and it sealed the doorway, the mat, the tiled floor and
       * its platform completely.  What holds a walker on the deck is this box at
       * deck level; at ground level the store's own three boxes are the barrier,
       * and they are the ones with the gap for the recess in them. */
      ctx.collide(a, r.z0, b, r.z1, DECK + PAR_H, DECK);
    }
  }

  /* ------------------------------- the frontage ------------------------------- */
  buildFrontage(ctx, m, push, rng);

  /* --------------------------- the flanks and the back --------------------------- */
  /* The west gable: blank render with the service door and the plant screen.
   *
   * **The door opens onto the loading dock, north of the roll-up shutter.**  It
   * was at z = 74.6 with its sill on the yard slab, which is the middle of the
   * shutter opening (72.15..75.85) and 1.05 m below the dock platform -- so its
   * bottom metre was inside the dock and its leaf's front face landed at exactly
   * the shutter curtain's x.  Coplanar, so the whole panel lost the depth test
   * uniformly and all that showed was a stippled seam down the curtain.  The
   * 1.95 m of gable between the shutter and the platform's north end is where a
   * personnel door actually goes: staff come out of it onto the dock. */
  const SVD_Z = 76.85, SVD_Y = Y + DK_H;
  push('grey', new THREE.BoxGeometry(0.10, 2.30, 1.20), trs(SX0 - 0.06, SVD_Y + 1.15, SVD_Z));
  push('metalDark', new THREE.BoxGeometry(0.06, 2.10, 1.00), trs(SX0 - 0.10, SVD_Y + 1.05, SVD_Z));
  // horizontal joint lines down both blank elevations -- a 21 m wall needs them
  for (const zz of [SZ0 - 0.02, SZ1 + 0.02]) {
    for (const yy of [1.55, 2.85]) {
      push('grey', new THREE.BoxGeometry(W - 0.6, 0.06, 0.05), trs(CX, Y + yy, zz));
    }
  }
  for (let i = 1; i < 5; i++) {
    push('grey', new THREE.BoxGeometry(0.05, H - PLINTH - 0.4, 0.06), trs(SX1 + 0.02, Y + PLINTH + (H - PLINTH - 0.4) / 2, SZ0 + i * (D / 5)));
    push('grey', new THREE.BoxGeometry(0.05, H - PLINTH - 0.4, 0.06), trs(SX0 - 0.02, Y + PLINTH + (H - PLINTH - 0.4) / 2, SZ0 + i * (D / 5)));
  }
  // the louvred plant openings high on the south flank, over the ramp
  for (let i = 0; i < 4; i++) {
    const lx = SX0 + 3.6 + i * 4.4;
    push('metalDark', new THREE.BoxGeometry(2.20, 0.90, 0.12), trs(lx, Y + 4.70, SZ0 - 0.06));
    for (let k = 0; k < 5; k++) {
      push('metal', new THREE.BoxGeometry(2.10, 0.06, 0.16), trs(lx, Y + 4.36 + k * 0.17, SZ0 - 0.10));
    }
  }

  /* the roll-up shutter and dock on the west gable is the delivery yard's, and
   * is built with the yard so the two stay together */

  const matFor = {
    wall: m.wall, grey: m.wallGrey, band: m.band, brand: m.brand,
    metal: m.metal, metalDark: m.metalDark, concrete: m.concreteMid,
    glassFrame: m.mullion,
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    ctx.add(mesh);
    if (key === 'wall' || key === 'grey' || key === 'band') hullOutline(mesh, { thickness: 0.0034 });
  }

  /* The store's own collider, and **its top is the deck and not the parapet**.
   *
   * A collider has no underside: `_resolve` skips one whose top is within a step
   * of the feet and blocks otherwise, at every height.  Topped at the parapet
   * (7.25) this box blocks the whole of its own roof -- the ramp arrives, the
   * platform is continuous to the centimetre, and the walker is stopped dead at
   * the deck's edge by the building underneath him.  Topped at DECK it still
   * blocks from the ground (6.20 against 0.83 feet) and is skipped by anybody
   * standing on the deck, which is exactly the pair of behaviours wanted.  What
   * keeps them on the deck is the parapet, which carries its own colliders.
   *
   * **Three boxes and not one, because the entrance recess has to stay
   * walkable** -- the library's note, and this building had the same mistake in
   * a louder form: it tiles the recess floor one step proud of the apron and
   * registers a platform for it, and a single box over the whole footprint meant
   * nobody could ever stand on it.  The doors, the mat, the interior and the
   * basket stacks were all behind a wall 0.34 m out from the frontage line. */
  ctx.collide(SX0 - 0.12, SZ0 - 0.12, SX1 + 0.12, SZ1 - REC, DECK);
  ctx.collide(SX0 - 0.12, SZ1 - REC, REC_X0, SZ1 + 0.12, DECK);
  ctx.collide(REC_X1, SZ1 - REC, SX1 + 0.12, SZ1 + 0.12, DECK);
  // and the deck surface itself
  ctx.platform({ x0: SX0 + PT, x1: SX1 - PT, z0: SZ0 + PT, z1: SZ1 - PT, top: DECK });
}

/**
 * The entrance elevation.
 *
 * Order matters and it is the order the library's windows got wrong: the
 * opening is cut in the volume, the painted interior sits on the *face* of what
 * is behind it, the glass stands in front of that, and the mullions in front of
 * the glass.  Every plate here faces +z, which is the way `PlaneGeometry` faces
 * and the way this frontage looks, so none of them needs turning -- the one
 * elevation in the world where that is true by luck rather than by care.
 */
function buildFrontage(ctx, m, push, rng) {
  const HEAD = Y + GLASS_H;
  const SILL = Y + 0.62;

  /* the glazed shop band either side of the entrance bay */
  const bands = [[SX0 + 0.9, REC_X0 - 0.3], [REC_X1 + 0.3, SX1 - 0.9]];
  for (const [a, b] of bands) {
    // the interior, painted on the wall face and knocked back toward violet
    const inner = new THREE.Mesh(
      new THREE.PlaneGeometry(b - a, HEAD - SILL),
      flat({ color: 0xffffff, map: superInterior(rng.int(0, 2)), cache: false })
    );
    inner.position.set((a + b) / 2, (SILL + HEAD) / 2, SZ1 + 0.03);
    inner.userData.noOutline = true;
    ctx.add(inner);
    // the glass in front of it
    const glass = box(b - a, HEAD - SILL, 0.05, m.glass, (a + b) / 2, (SILL + HEAD) / 2, SZ1 + 0.10);
    glass.userData.noShadow = true;
    ctx.add(glass);
    // mullions in front of the glass, and the transom
    const n = Math.max(2, Math.round((b - a) / 1.9));
    for (let i = 0; i <= n; i++) {
      push('glassFrame', new THREE.BoxGeometry(0.10, HEAD - SILL + 0.16, 0.14),
        trs(a + ((b - a) * i) / n, (SILL + HEAD) / 2, SZ1 + 0.14));
    }
    push('glassFrame', new THREE.BoxGeometry(b - a + 0.1, 0.13, 0.16), trs((a + b) / 2, HEAD, SZ1 + 0.14));
    push('glassFrame', new THREE.BoxGeometry(b - a + 0.1, 0.15, 0.16), trs((a + b) / 2, SILL, SZ1 + 0.14));
    push('concrete', new THREE.BoxGeometry(b - a + 0.24, SILL - Y - PLINTH, 0.14), trs((a + b) / 2, (Y + PLINTH + SILL) / 2, SZ1 + 0.08));
  }

  /* the price sheets taped inside the glass -- four of them, on the inside face
   * so they are behind the glazing rather than stuck to the render */
  const sheetAt = [[SX0 + 2.4, 1.9], [SX0 + 4.1, 1.6], [SX1 - 4.6, 1.85], [SX1 - 2.6, 1.55]];
  sheetAt.forEach(([sx, sy], i) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.88),
      flat({ color: 0xffffff, map: superPoster(i), cache: false }));
    p.position.set(sx, sy + 0.4, SZ1 + 0.06);
    p.rotation.z = (i % 2 ? 1 : -1) * 0.012;
    p.userData.noOutline = true;
    ctx.add(p);
  });

  /* --------------------------- the entrance bay --------------------------- *
   * Two sliding leaves in a frame, set at the back of a 1.6 m recess, with the
   * lobby's own painted interior behind them and a lit ceiling strip over. */
  const EZ = SZ1 - REC;
  const dw = REC_X1 - REC_X0;
  {
    const inner = new THREE.Mesh(
      new THREE.PlaneGeometry(dw - 0.4, GLASS_H - 0.28),
      flat({ color: 0xffffff, map: superInterior(2), cache: false })
    );
    inner.position.set((REC_X0 + REC_X1) / 2, Y + 0.14 + (GLASS_H - 0.28) / 2, EZ + 0.04);
    inner.userData.noOutline = true;
    ctx.add(inner);
  }
  // the two leaves, parted, and the fixed side lights
  for (const s of [-1, 1]) {
    const leaf = box(1.55, GLASS_H - 0.42, 0.06, m.glass,
      (REC_X0 + REC_X1) / 2 + s * 1.62, Y + 0.20 + (GLASS_H - 0.42) / 2, EZ + 0.12);
    leaf.userData.noShadow = true;
    ctx.add(leaf);
    push('glassFrame', new THREE.BoxGeometry(0.09, GLASS_H - 0.30, 0.12),
      trs((REC_X0 + REC_X1) / 2 + s * (1.62 + 0.80), Y + 0.20 + (GLASS_H - 0.30) / 2, EZ + 0.14));
    push('glassFrame', new THREE.BoxGeometry(0.09, GLASS_H - 0.30, 0.12),
      trs((REC_X0 + REC_X1) / 2 + s * (1.62 - 0.80), Y + 0.20 + (GLASS_H - 0.30) / 2, EZ + 0.14));
    // the side light beyond each leaf
    const sl = box(dw / 2 - 2.42, GLASS_H - 0.42, 0.05, m.glass,
      (REC_X0 + REC_X1) / 2 + s * (2.42 + (dw / 2 - 2.42) / 2), Y + 0.20 + (GLASS_H - 0.42) / 2, EZ + 0.10);
    sl.userData.noShadow = true;
    ctx.add(sl);
  }
  push('glassFrame', new THREE.BoxGeometry(dw - 0.2, 0.16, 0.18), trs((REC_X0 + REC_X1) / 2, Y + GLASS_H - 0.16, EZ + 0.14));
  push('glassFrame', new THREE.BoxGeometry(dw - 0.2, 0.12, 0.16), trs((REC_X0 + REC_X1) / 2, Y + 0.20, EZ + 0.14));
  // the warm strip in the soffit of the recess
  {
    const strip = box(dw - 1.2, 0.07, 0.5, flat({ color: 0xfdf3d8 }),
      (REC_X0 + REC_X1) / 2, Y + GLASS_H + 0.24, EZ + REC / 2);
    strip.userData.noOutline = true;
    ctx.add(strip);
  }
  // the reveals either side of the recess, so the hole has thickness
  for (const s of [-1, 1]) {
    push('grey', new THREE.BoxGeometry(0.12, GLASS_H + 0.30, REC),
      trs(s < 0 ? REC_X0 + 0.06 : REC_X1 - 0.06, Y + (GLASS_H + 0.30) / 2, SZ1 - REC / 2));
  }

  /* ---------------------------------- signage ---------------------------------- */
  // the fascia board, on the band, over the entrance
  {
    const bw = 12.8, bh = 1.60;
    const face = flat({ color: 0xffffff, map: superFascia(), cache: false });
    const side = flat({ color: 0xf6f2ea });
    const board = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.18),
      [side, side, side, side, face, side]);
    board.position.set((REC_X0 + REC_X1) / 2, Y + (FASCIA0 + FASCIA1) / 2 + 0.05, SZ1 + 0.30);
    board.castShadow = true;
    ctx.add(board);
    hullOutline(board, { thickness: 0.0030 });
    // the two bracket lamps that wash it
    for (const s of [-1, 1]) {
      const lx = (REC_X0 + REC_X1) / 2 + s * 4.6;
      push('metalDark', new THREE.BoxGeometry(0.08, 0.08, 0.62), trs(lx, Y + FASCIA1 + 0.34, SZ1 + 0.42));
      push('metal', new THREE.BoxGeometry(0.46, 0.14, 0.20), trs(lx, Y + FASCIA1 + 0.28, SZ1 + 0.70));
    }
  }
  // the lit box sign on the east pier, seen from the road end-on
  {
    const face = flat({ color: 0xffffff, map: superBoxSign(), cache: false });
    const side = flat({ color: 0xf2eee4 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.55, 0.30),
      [side, side, side, side, face, face]);
    b.position.set(SX1 - 1.9, Y + 4.85, SZ1 + 0.34);
    b.castShadow = true;
    ctx.add(b);
    hullOutline(b, { thickness: 0.0030 });
  }
  // 営業時間 beside the doors, on the west reveal pier
  {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.70),
      flat({ color: 0xffffff, map: superHours(), cache: false }));
    p.position.set(REC_X0 - 0.62, Y + 1.62, SZ1 + 0.055);
    p.userData.noOutline = true;
    ctx.add(p);
    push('metal', new THREE.BoxGeometry(0.60, 0.78, 0.04), trs(REC_X0 - 0.62, Y + 1.62, SZ1 + 0.03));
  }

  /* --------------------------------- the canopy --------------------------------- *
   * A real structure and not a plane: four columns on the apron, a spine beam
   * back to the wall, purlins, a 0.16 m roof slab with a fall, a fascia gutter
   * along the front edge and two downpipes.  The brief asked for exactly this
   * and it is also the only thing that gives the frontage a shadow line at
   * eye level. */
  {
    const CX0 = SX0 + 0.6, CX1 = SX1 - 0.6;
    const PROJ = 2.90;
    const CZ1 = SZ1 + PROJ;
    const hBack = Y + 3.95, hFront = Y + 3.62;
    const cw = CX1 - CX0;
    // the columns
    for (let i = 0; i < 4; i++) {
      const cx = CX0 + 1.4 + i * ((cw - 2.8) / 3);
      push('metalDark', new THREE.BoxGeometry(0.17, hFront - Y - 0.05, 0.17), trs(cx, Y + (hFront - Y) / 2, CZ1 - 0.34));
      push('metal', new THREE.BoxGeometry(0.34, 0.10, 0.34), trs(cx, Y + 0.05, CZ1 - 0.34));
    }
    // the front beam and the wall plate
    push('metalDark', new THREE.BoxGeometry(cw + 0.2, 0.26, 0.18), trs((CX0 + CX1) / 2, hFront - 0.13, CZ1 - 0.34));
    push('metalDark', new THREE.BoxGeometry(cw + 0.2, 0.22, 0.16), trs((CX0 + CX1) / 2, hBack - 0.11, SZ1 + 0.14));
    // purlins across
    for (let i = 0; i <= 10; i++) {
      const px = CX0 + (cw * i) / 10;
      const len = PROJ;
      const mid = (SZ1 + CZ1) / 2;
      const tilt = Math.atan2(hBack - hFront, PROJ);
      const beam = { geometry: new THREE.BoxGeometry(0.09, 0.14, Math.hypot(len, hBack - hFront)), matrix: trs(px, (hBack + hFront) / 2 - 0.2, mid, tilt, 0, 0) };
      push('metal', beam.geometry, beam.matrix);
    }
    // the sheet, with a real thickness
    {
      const tilt = Math.atan2(hBack - hFront, PROJ);
      const sheet = box(cw + 0.24, 0.16, Math.hypot(PROJ, hBack - hFront) + 0.3, m.canopy,
        (CX0 + CX1) / 2, (hBack + hFront) / 2 - 0.02, (SZ1 + CZ1) / 2);
      sheet.rotation.x = tilt;
      sheet.castShadow = sheet.receiveShadow = true;
      ctx.add(sheet);
      hullOutline(sheet, { thickness: 0.0030 });
    }
    // the gutter along the low edge and two downpipes off the outer columns
    push('metal', new THREE.BoxGeometry(cw + 0.3, 0.15, 0.17), trs((CX0 + CX1) / 2, hFront - 0.28, CZ1 + 0.06));
    for (const cx of [CX0 + 1.4, CX1 - 1.4]) {
      push('metal', new THREE.CylinderGeometry(0.055, 0.055, hFront - Y - 0.42, 8), trs(cx + 0.16, Y + (hFront - Y - 0.42) / 2, CZ1 + 0.06));
    }
    /* the banners strung under it -- three, on the front beam, and they are the
     * loudest thing on the whole elevation, which is correct */
    for (let i = 0; i < 3; i++) {
      const bx = CX0 + 3.4 + i * ((cw - 6.8) / 2);
      const bn = new THREE.Mesh(new THREE.PlaneGeometry(3.10, 0.58),
        flat({ color: 0xffffff, map: superBanner(i), side: THREE.DoubleSide, cache: false }));
      bn.position.set(bx, hFront - 0.62, CZ1 - 0.42);
      bn.rotation.x = 0.04;
      bn.userData.noOutline = true;
      ctx.add(bn);
    }
    // the two columns nearest the doors carry the collider; the outer pair do
    // not, so the apron does not get four 1.08 m holes in it
    for (const cx of [CX0 + 1.4 + (cw - 2.8) / 3, CX1 - 1.4 - (cw - 2.8) / 3]) {
      ctx.collide(cx - 0.11, CZ1 - 0.45, cx + 0.11, CZ1 - 0.23, hFront);
    }
  }
}

/* ------------------------------------------------------------------ *
 * The ramp.
 * ------------------------------------------------------------------ */
function buildRamp(ctx, m, gm) {
  const EX = (R_EX0 + R_EX1) / 2;                 // -24.7
  const SZ = (R_SZ0 + R_SZ1) / 2;                 // 63.3

  /* leg 1 -- down the east flank from the apron, climbing toward -z */
  rampFlight(ctx, {
    axis: 'z', at: EX, w: RW, from: RAMP_Z0, to: SZ0, y0: Y, y1: Y_CORNER, mat: m.concrete,
  });
  /* the corner landing, walled on its south and east, open north into the flight
   * and west into leg 2 */
  rampLanding(ctx, {
    x0: R_EX0, x1: R_EX1, z0: R_SZ0, z1: R_SZ1, y: Y_CORNER, walls: ['z-', 'x+'],
  });
  /* leg 2 -- west along the south flank from the landing's far side, up to deck
   * level.  `from: R_EX0` and not `R_EX1`: see the note on the constants. */
  rampFlight(ctx, {
    axis: 'x', at: SZ, w: RW, from: R_EX0, to: RAMP_TOP_X, y0: Y_CORNER, y1: DECK, mat: m.concrete,
  });
  /* the top landing, level with the deck and open north into it */
  rampLanding(ctx, {
    x0: RAMP_ENTRY_X0, x1: RAMP_TOP_X, z0: R_SZ0, z1: R_SZ1, y: DECK, walls: ['z-', 'x-'],
  });
  /* **The threshold.**  The landing stops at z = R_SZ1 (65.60) and the deck's
   * own platform starts at `SZ0 + PT` (65.88), because the parapet band is
   * 0.28 m thick and the deck is registered inside it.  Two platforms that
   * *meet* leave a hole -- `heightAt` takes the max over boxes and 0.28 m of
   * ground between them answers with the field 5.75 m below, so the walker is
   * refused.  The whole roof deck read unreachable on the first flood fill for
   * exactly this, with the ramp itself reading fine to its last centimetre.
   * Platforms overlap, they do not abut. */
  ctx.platform({
    x0: RAMP_ENTRY_X0, x1: RAMP_TOP_X, z0: R_SZ1 - 0.40, z1: SZ0 + 0.40, top: DECK,
  });

  /* --------------------------- markings and furniture --------------------------- */
  /* The arrows up both legs, each seated at the height the ramp is at there.
   *
   * `roadPaint('go')`'s arrow points along **-z at ry = 0**: the plane is
   * `rotateX(-PI/2)`'d, which sends its own +y to world -z, and the canvas's
   * top row is v = 1 because `flipY` is on.  Leg 1 runs toward -z, so ry = 0;
   * leg 2 runs toward -x, which is that direction turned a quarter, so PI/2.
   * Worth deriving rather than guessing -- 'arrow' would have been the hollow
   * 菱形 anyway, which means "crossing ahead". */
  const arrowMat = () => flat({ color: 0xffffff, map: roadPaint('go'), transparent: true, cache: false });
  for (let i = 0; i < 4; i++) {
    const zz = RAMP_Z0 - 3.0 - i * 4.2;
    const t = (RAMP_Z0 - zz) / LEG1;
    paintQuad(ctx, { x: EX, z: zz, w: 1.2, d: 1.2, y: Y + t * (Y_CORNER - Y), mat: arrowMat(), ry: 0, grade: 1 / 6 });
  }
  for (let i = 0; i < 3; i++) {
    const xx = R_EX0 - 2.6 - i * 4.6;
    const t = (R_EX0 - xx) / LEG2;
    paintQuad(ctx, { x: xx, z: SZ, w: 1.2, d: 1.2, y: Y_CORNER + t * (DECK - Y_CORNER), mat: arrowMat(), ry: Math.PI / 2, grade: 1 / 6 });
  }
  /* the transverse anti-slip grooves.  A ramp this steep has them cast into it
   * every 0.4 m, and at this tonal range they are most of what says "slope" in
   * a frame that has no horizon in it. */
  {
    const grooves = [];
    const n1 = Math.floor(LEG1 / 0.42);
    for (let i = 1; i < n1; i++) {
      const zz = RAMP_Z0 - i * 0.42;
      const yy = Y + ((RAMP_Z0 - zz) / LEG1) * (Y_CORNER - Y);
      grooves.push({ geometry: new THREE.BoxGeometry(RW - 0.66, 0.02, 0.09), matrix: trs(EX, yy + 0.02, zz) });
    }
    const n2 = Math.floor(LEG2 / 0.42);
    for (let i = 1; i < n2; i++) {
      const xx = R_EX0 - i * 0.42;
      const yy = Y_CORNER + ((R_EX0 - xx) / LEG2) * (DECK - Y_CORNER);
      grooves.push({ geometry: new THREE.BoxGeometry(0.09, 0.02, RW - 0.66), matrix: trs(xx, yy + 0.02, SZ) });
    }
    const gmesh = new THREE.Mesh(bake(grooves), m.concreteDark);
    gmesh.userData.noOutline = true;
    ctx.add(gmesh);
  }

  /* the two mirrors on the corner, which are the whole reason a 4.6 m landing
   * works at all: neither leg can see round it, and a driver coming up cannot
   * see whether anybody is coming down */
  ctx.add(makeMirror({ x: R_EX1 - 0.45, z: R_SZ0 + 0.55, y: Y_CORNER + 0.30, ry: -2.35, h: 1.9, r: 0.38 }));
  /* The second mirror is **on leg 2, against its north upstand**, and not at
   * (-26.55, 65.10).  That was 0.45 m in from the landing's west edge and 0.50 m
   * in from its north edge, i.e. free-standing in the open corner of the one
   * 4.6 x 4.6 m square where every car on this ramp has to shunt.  A mirror pole
   * carries no collider, so nothing in this project finds it -- the flood fill
   * walks through it and a frame from the flight shows a mirror where a mirror
   * belongs.  Bolted to the wall at the head of the landing it does the same job
   * (a driver coming down leg 2 sees up leg 1) out of the swept path. */
  ctx.add(makeMirror({
    x: -28.90, z: SZ + RW / 2 - 0.45, y: Y_CORNER + 1.90 / 6, ry: 0.85, h: 1.9, r: 0.38,
  }));

  /* the height bar over the mouth -- 制限高 2.1 m, which is what stops the
   * lorry that restocks the store from taking the ramp with its body up */
  {
    const parts = [];
    const BZ = 85.60;
    for (const s of [-1, 1]) {
      parts.push({ geometry: new THREE.CylinderGeometry(0.075, 0.085, 2.62, 8), matrix: trs(EX + s * (RW / 2 - 0.10), Y + 1.31, BZ) });
    }
    parts.push({ geometry: new THREE.BoxGeometry(RW - 0.1, 0.16, 0.10), matrix: trs(EX, Y + 2.55, BZ) });
    /* The seven flaps **hang below** the yellow bar.  Written at the bar's own
     * height they were seven blocks embedded in it, and from under the gantry --
     * which is the only place you ever see it from -- that reads as luggage on a
     * beam rather than as the row of rubber plates that tells a driver where
     * 2.1 m is. */
    for (let i = 0; i < 7; i++) {
      parts.push({ geometry: new THREE.BoxGeometry(0.34, 0.22, 0.03), matrix: trs(EX - RW / 2 + 0.5 + i * 0.6, Y + 1.93, BZ - 0.06) });
    }
    const mesh = new THREE.Mesh(bake(parts), m.metalDark);
    mesh.name = 'openFrame';
    mesh.castShadow = true;
    ctx.add(mesh);
    const bar = box(RW - 0.6, 0.12, 0.13, flat({ color: PAL.yellow }), EX, Y + 2.10, BZ - 0.06);
    ctx.add(bar);
    /* Posts and the 2.1 m bar, not the mouth. Two posts plus a
     * crossbar baked together have a union AABB that walls the
     * apron; cover would fill it. The flaps are air. */
    const postHw = 0.09;
    for (const s of [-1, 1]) {
      const px = EX + s * (RW / 2 - 0.10);
      ctx.collide(px - postHw, BZ - postHw, px + postHw, BZ + postHw, Y + 2.62, Y, true);
    }
    ctx.collide(EX - (RW - 0.1) / 2, BZ - 0.08, EX + (RW - 0.1) / 2, BZ + 0.08,
      Y + 2.63, Y + 2.04, true);
  }
  /* The mouth's signage faces **+z**.  `makeSignPost` puts its plate on local
   * +z, so `ry = 0` is a face read by somebody coming *from* the road -- which
   * is every driver who uses this ramp.  Turned a half circle they are two
   * blank grey cards standing in the middle of the apron, which is exactly what
   * the first pass rendered. */
  ctx.add(makeSignPost({
    x: R_EX1 + 0.62, z: 86.20, y: Y + 0.09, ry: 0, h: 2.5, postMat: m.metal,
    plates: [
      { map: parkPlate(0), w: 0.60, h: 0.90, y: 2.00 },
      { map: parkPlate(3), w: 0.52, h: 0.78, y: 1.10 },
    ],
  }));
  ctx.add(makeSignPost({
    x: R_EX0 - 0.62, z: 86.20, y: Y + 0.09, ry: 0, h: 2.2, postMat: m.metal,
    plates: [{ map: parkPlate(2), w: 0.56, h: 0.84, y: 1.72 }],
  }));
  // the guide board at the foot, which is the section drawing of the whole idea
  {
    const nb = makeNoticeBoard({ ctx,
      x: R_EX0 - 2.4, z: 86.40, y: Y + 0.09, ry: 0, w: 1.35, h: 1.02, y0: 0.92,
      wood: 0x8a8496,
      sheets: [{ map: parkGuide(), x: 0, w: 1.06, h: 0.78, tilt: 0.0 }],
    });
    ctx.add(nb);
  }
  for (const [cx, cz] of [[R_EX0 - 0.5, 84.6], [R_EX1 + 0.4, 83.4]]) {
    ctx.add(makeCone({ x: cx, z: cz, y: Y + 0.09, ry: rng0(cx) }));
  }
  /* on the passage's 70 mm slab, not on the grade under it */
  ctx.add(makeDelineator({ x: R_EX1 + 0.35, z: 79.4, y: Y + 0.07, lean: 0.06 }));
  ctx.add(makeDelineator({ x: R_EX1 + 0.35, z: 76.4, y: Y + 0.07 }));

  /* **The ramp's lighting**: three bulkheads bolted to the store's own flanks,
   * each 2.05 m above the running surface *at its own x or z*, because the surface
   * is climbing -- a constant height would put the last one through the parapet,
   * and 2.05 keeps every one of them under the mass's top at 6.10.  A hood over a
   * warm flat face, which is the same prop as the dock's door light.
   *
   * Both offsets are *outward*: the store's east face is `SX1` = `R_EX0` and the
   * ramp is east of it, so the lamp is at `+0.07`; its south face is `SZ0` =
   * `R_SZ1` and the south leg is south of that, so `-0.07`.  Written the other way
   * round -- which is how they went in first -- all three are inside the building
   * and none of them is drawn.  `ry` is the wall's outward normal, the same rule
   * `makeAircon` and every name plate in the world follows. */
  for (const [lx, lz, ry] of [
    [R_EX0 + 0.07, 79.0, Math.PI / 2],                  // east flank, low down the leg
    [R_EX0 + 0.07, 71.4, Math.PI / 2],                  // east flank, near the landing
    [-29.60, R_SZ1 - 0.07, Math.PI],                    // south flank, over leg 2's foot
  ]) {
    const onEast = Math.abs(ry) < 2;
    const surf = onEast
      ? Y + (RAMP_Z0 - lz) / 6
      : Y_CORNER + (R_EX0 - lx) / 6;
    const yy = surf + 2.05;
    const g = new THREE.Group();
    g.add(box(0.30, 0.20, 0.13, m.metalDark, 0, 0, -0.07));
    g.add(box(0.26, 0.15, 0.05, flat({ color: 0xfaf1d8 }), 0, 0, 0.02));
    g.add(box(0.34, 0.05, 0.16, m.metalDark, 0, 0.11, -0.05));
    g.position.set(lx, yy, lz);
    g.rotation.y = ry;
    ctx.add(g);
  }

  /* The undercroft is not a route and does not need fencing: the ramp's own
   * upstands carry a collider from the ground up along both legs, and the strip
   * between the south leg and 湯の坂's retaining wall is closed at both ends by
   * the yard wall and the corner landing.  A mesh fence here would only take
   * another 0.34 m out of the 3.2 m passage beside it. */
  /* **And there are no pipe stacks on these two flanks.**  Two 2.4 m cylinders
   * stood at (R_EX0 + 0.5, 72.4) and (-33.0, R_SZ0 + 0.5) -- 0.5 m out from the
   * store's east and south faces, which on this building is not a service void,
   * it is the ramp.  The east one topped out at 2.85 against a running surface of
   * 2.42 at that z, so 0.43 m of it stood *through* the deck of the ramp with a
   * base plate on it, in the middle of the one-way climb; the south one ended
   * 1.70 m short of the underside of leg 2 and was never drawn at all.  A flank a
   * ramp climbs cannot carry a downpipe at any offset, which is why these are
   * gone rather than moved. */
}

const rng0 = (v) => ((Math.sin(v * 12.9898) * 43758.5453) % 1) * 0.6;

/* ------------------------------------------------------------------ *
 * The roof car park.
 * ------------------------------------------------------------------ */
function buildDeck(ctx, m, gm, rng) {
  const PT = 0.28;
  const x0 = SX0 + PT, x1 = SX1 - PT;             // -48.32 .. -27.28
  const z0 = SZ0 + PT, z1 = SZ1 - PT;             // 65.88 .. 81.72
  const white = flat({ color: PAL.lineWhite });

  /* the deck surface itself, laid as a slab so it catches the ink pass at the
   * parapet and reads as a floor rather than as the top of a box.
   *
   * **`concreteMid` and not `concrete`**, which is the one material decision up
   * here that matters: everything that says "car park" on this roof is white
   * paint -- twelve bays' lines, twelve numerals, three arrows, a centre line, a
   * 徐行 and the accessible bay's mark -- and `PAL.lineWhite` (0xf4f2f6) against
   * `PAL.concrete` (0xd9d5dd) is a 7 per cent difference *before* the sun's top
   * cel band lifts the concrete and flat white paint takes no light at all.  The
   * markings were legible only where the deck was in shadow.  `concreteMid`
   * (0xc2bdc8) is a fifth darker, which is also correct for a waterproofed deck
   * topping against a fair-faced parapet.
   *
   * ...and a fifth is not enough, measured: under this sun the top cel band
   * clips both of them to within a couple of per cent of white and the bays were
   * legible only in the parapet's own shade.  The deck is surfaced in
   * `asphaltWorn` (0x9a95a6), which is what a roof park over a shop is actually
   * finished in and is dark enough that flat white paint reads across the whole
   * of it.  The ramp stays pale concrete, so the two surfaces also tell you
   * which is which.
   *
   * It is laid over the store's **whole** footprint rather than inside the
   * parapet, because the mass under it now stops at `DECK - 0.10` -- so the slab
   * is what closes the top of the building, and the 0.28 m band the parapet
   * stands on is decked too. */
  const slab = box(SX1 - SX0, 0.10, SZ1 - SZ0, gm.asphaltWorn,
    (SX0 + SX1) / 2, DECK - 0.05, (SZ0 + SZ1) / 2);
  slab.receiveShadow = true;
  ctx.add(slab);

  /* -------------------------------- the bays -------------------------------- *
   * Twelve, and the arithmetic is tight enough to be worth writing down.  The
   * deck is 21.04 x 15.84 between parapets; two rows 5.0 m deep either side of a
   * 5.84 m aisle is the only way a car turns into a bay up here at all.  Then
   * the west end of the north row is the service block (the stair head and the
   * plant, 2.2 m), the west end of the south row is the cart return (2.8 m), and
   * the ramp's own mouth takes 4.6 m more out of the south side -- so it is
   * seven bays north (one of them the 3.4 m おもいやり bay) and five south.
   *
   * The first pass ran eight bays north and put the stair penthouse on top of
   * the last two of them.  Nothing throws when a 3.2 m box lands on a painted
   * rectangle; the frame just shows a car park with a shed in it. */
  const BAY_D = 5.00, BAY_W = 2.40, ACC_W = 3.40;
  const SVC_X1 = x0 + 2.42;                       // the north-west service block
  const CART_X0 = -30.60;                         // the cart return, south-east
  const north = [];
  {
    let x = SVC_X1;
    north.push({ x0: x, x1: x + ACC_W, acc: true });
    x += ACC_W;
    for (let i = 0; i < 6; i++) { north.push({ x0: x, x1: x + BAY_W }); x += BAY_W; }
  }
  const south = [];
  {
    let x = RAMP_TOP_X + 0.30;
    for (let i = 0; i < 5; i++) { south.push({ x0: x, x1: x + BAY_W }); x += BAY_W; }
  }
  const lines = [];
  const heads = [];
  let n = 1;
  const plateSpots = [];
  for (const [row, zNear, zFar] of [[north, z1 - BAY_D, z1], [south, z0, z0 + BAY_D]]) {
    for (const b of row) {
      for (const bx of [b.x0, b.x1]) {
        lines.push({ geometry: new THREE.BoxGeometry(0.11, 0.02, BAY_D), matrix: trs(bx, 0, (zNear + zFar) / 2) });
      }
      heads.push({ geometry: new THREE.BoxGeometry(b.x1 - b.x0, 0.02, 0.11), matrix: trs((b.x0 + b.x1) / 2, 0, row === north ? zFar - 0.12 : zNear + 0.12) });
      plateSpots.push({ x: (b.x0 + b.x1) / 2, z: row === north ? zFar - 0.95 : zNear + 0.95, n, acc: b.acc });
      n++;
    }
  }
  {
    const mesh = new THREE.Mesh(bake(lines.concat(heads)), white);
    mesh.position.y = DECK + 0.022;
    mesh.userData.noOutline = true;
    ctx.add(mesh);
  }
  // the painted numerals at the head of each bay
  for (const s of plateSpots) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5),
      flat({ color: 0xffffff, map: deckBay(s.n), transparent: true, cache: false }));
    q.geometry.rotateX(-Math.PI / 2);
    q.position.set(s.x, DECK + 0.024, s.z);
    q.rotation.y = s.z > 74 ? Math.PI : 0;
    q.userData.noOutline = true;
    ctx.add(q);
  }
  // the おもいやり bay's own mark and its plate
  {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7),
      flat({ color: 0x9fc8ea, transparent: true, opacity: 0.5, cache: false }));
    q.geometry.rotateX(-Math.PI / 2);
    q.position.set(SVC_X1 + ACC_W / 2, DECK + 0.023, z1 - BAY_D + 1.5);
    q.userData.noOutline = true;
    ctx.add(q);
    ctx.add(makeSignPost({
      x: SVC_X1 + ACC_W / 2, z: z1 - 0.42, y: DECK, ry: Math.PI, h: 1.9, postMat: m.metal,
      plates: [{ map: parkPlate(6), w: 0.46, h: 0.68, y: 1.42 }],
    }));
  }
  // wheel stops in every bay
  ctx.add(makeWheelStops({
    x: (north[1].x0 + north[north.length - 1].x1) / 2, z: z1 - 1.05, y: DECK, ry: 0,
    n: 6, pitch: BAY_W, gauge: 1.30,
  }));
  ctx.add(makeWheelStops({
    x: (south[0].x0 + south[south.length - 1].x1) / 2, z: z0 + 1.05, y: DECK, ry: Math.PI,
    n: 5, pitch: BAY_W, gauge: 1.30,
  }));

  /* the aisle: a centre line, an arrow each way and 徐行 at the ramp mouth */
  laneLine(ctx, { axis: 'x', at: (z0 + BAY_D + z1 - BAY_D) / 2, from: x0 + 1.4, to: x1 - 1.4, y: DECK + 0.022, dash: 1.0 });
  for (const [ax, ry] of [[-44.0, -Math.PI / 2], [-32.0, Math.PI / 2]]) {
    paintQuad(ctx, {
      x: ax, z: ry > 0 ? 72.6 : 75.0, w: 1.5, d: 1.5, y: DECK, ry,
      mat: flat({ color: 0xffffff, map: roadPaint('go'), transparent: true, cache: false }),
    });
  }
  paintQuad(ctx, {
    x: RAMP_TOP_X - 2.6, z: 71.0, w: 1.9, d: 1.9, y: DECK,
    mat: flat({ color: 0xffffff, map: roadPaint('slow'), transparent: true, cache: false }),
    ry: Math.PI / 2,
  });
  // the yellow hatch across the ramp mouth's throat, so nobody parks in it
  {
    const hatch = [];
    for (let i = 0; i < 6; i++) {
      hatch.push({ geometry: new THREE.BoxGeometry(0.10, 0.02, 3.0), matrix: trs(RAMP_ENTRY_X0 + 0.5 + i * 0.78, 0, z0 + 1.6, 0, 0.62, 0) });
    }
    const mesh = new THREE.Mesh(bake(hatch), m.yellow);
    mesh.position.y = DECK + 0.023;
    mesh.userData.noOutline = true;
    ctx.add(mesh);
  }

  /* ------------------------------ deck furniture ------------------------------ *
   * All of it is in the two end zones the bay arithmetic reserved -- the north-
   * west service block and the south-west cart return -- so nothing stands in a
   * bay or in the aisle. */
  // the stair head and the plant, in one block on the deck's north-west corner
  {
    const sx = (x0 + SVC_X1) / 2, sz = z1 - 2.5;
    const hut = [];
    hut.push({ geometry: new THREE.BoxGeometry(SVC_X1 - x0 - 0.12, 2.45, 4.80), matrix: trs(sx, DECK + 1.225, sz) });
    hut.push({ geometry: new THREE.BoxGeometry(SVC_X1 - x0 + 0.18, 0.18, 5.10), matrix: trs(sx, DECK + 2.44, sz) });
    const hm = new THREE.Mesh(bake(hut), m.wallGrey);
    hm.castShadow = hm.receiveShadow = true;
    ctx.add(hm);
    hullOutline(hm, { thickness: 0.0032 });
    ctx.collide(x0 - 0.06, sz - 2.55, SVC_X1 - 0.06, sz + 2.55, DECK + 2.55);
    // the doorway down into the store, on the face the aisle approaches from
    ctx.add(box(1.10, 2.05, 0.10, m.dark, sx, DECK + 1.03, sz - 2.44));
    ctx.add(box(1.26, 0.16, 0.16, m.metal, sx, DECK + 2.14, sz - 2.50));
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.28),
      flat({ color: 0xffffff, map: paperSheet(), cache: false }));
    p.position.set(sx + 0.72, DECK + 1.62, sz - 2.45);
    p.rotation.y = Math.PI;
    p.userData.noOutline = true;
    ctx.add(p);
    /* The two condensers, **flanking the door on the hut's south face.**
     *
     * The first pass wrote them at `sz - 2.46 + dz - 0.2` for `dz` of -0.9 and
     * +0.5, which is z 75.66 and 77.06 against a face at 76.82: one stood 1.11 m
     * out in the aisle with nothing behind it, and the other was inside the hut
     * and never drawn at all.  The face is 2.30 m wide with a 1.10 m doorway in
     * the middle of it, so what fits either side is 0.60 m -- two 0.55 m units
     * at `sx ± 0.86`, backs 50 mm off the wall, grille to the aisle. */
    for (const s of [-1, 1]) {
      ctx.add(makeAircon({
        x: sx + s * 0.86, z: sz - 2.40 - 0.23, y: DECK + 0.02, ry: Math.PI,
        w: 0.55, h: 0.68, d: 0.36, feet: true,
      }));
    }
  }
  // the cart return, two planters and the exit plate, south-east of the aisle
  {
    const cx = CART_X0 + 1.3, cz = z0 + 2.2;
    const rail = [];
    for (const s of [-1, 1]) {
      rail.push({ geometry: new THREE.BoxGeometry(0.06, 0.95, 2.40), matrix: trs(cx + s * 0.72, DECK + 0.475, cz) });
      rail.push({ geometry: new THREE.CylinderGeometry(0.045, 0.045, 2.40, 7), matrix: trs(cx + s * 0.72, DECK + 0.90, cz, Math.PI / 2, 0, 0) });
    }
    rail.push({ geometry: new THREE.BoxGeometry(1.56, 0.10, 0.10), matrix: trs(cx, DECK + 0.92, cz - 1.24) });
    const rm = new THREE.Mesh(bake(rail), m.metal);
    rm.castShadow = true;
    rm.name = 'openFrame';
    ctx.add(rm);
    for (const s of [-1, 1]) {
      ctx.collide(cx + s * 0.72 - 0.05, cz - 1.20, cx + s * 0.72 + 0.05, cz + 1.20,
        DECK + 0.95, DECK, true);
    }
    ctx.collide(cx - 0.78, cz - 1.29, cx + 0.78, cz - 1.19, DECK + 0.97, DECK + 0.85, true);
    addTrolleys(ctx, m, cx, cz + 0.2, DECK, 0, 4);
    ctx.add(makeSignPost({
      x: cx + 1.4, z: cz + 2.0, y: DECK, ry: Math.PI / 2, h: 2.0, postMat: m.metal,
      plates: [{ map: parkPlate(1), w: 0.48, h: 0.72, y: 1.52 }],
    }));
  }
  for (const [px, pz] of [[CART_X0 + 0.5, z0 + 4.5], [CART_X0 + 2.1, z0 + 4.6]]) {
    ctx.add(makePlanter({ x: px, z: pz, y: DECK, r: 0.32, flower: true, seed: 7731, n: 6 }));
  }

  /* three lamp columns on the parapet line, which is what a roof deck has
   * instead of street lamps */
  for (const [lx, lz, ry] of [[-42.50, z1 - 0.22, Math.PI], [-32.90, z1 - 0.22, Math.PI], [-35.40, z0 + 0.22, 0], [-40.20, z0 + 0.22, 0]]) {
    const parts = [];
    parts.push({ geometry: new THREE.CylinderGeometry(0.06, 0.075, 3.30, 8), matrix: trs(lx, DECK + 1.65, lz) });
    parts.push({ geometry: new THREE.BoxGeometry(0.20, 0.10, 0.60), matrix: trs(lx, DECK + 3.28, lz + (ry ? -0.30 : 0.30)) });
    const pm = new THREE.Mesh(bake(parts), m.metalDark);
    pm.castShadow = true;
    ctx.add(pm);
    const head = box(0.34, 0.13, 0.72, flat({ color: 0xf6f2e2 }), lx, DECK + 3.20, lz + (ry ? -0.58 : 0.58));
    ctx.add(head);
  }

  /* the safety railing above the parapet on the two edges you can see out over
   * -- 転落防止柵, and it is also what frames every view from up here */
  railing(ctx, { axis: 'x', at: z1 - 0.14, from: x0 + 0.2, to: x1 - 0.2, y: DECK + PAR_H, h: 0.42, spacing: 2.1, mat: m.metal });
  railing(ctx, { axis: 'z', at: x1 - 0.14, from: z0 + 0.2, to: z1 - 0.2, y: DECK + PAR_H, h: 0.42, spacing: 2.1, mat: m.metal });
  railing(ctx, { axis: 'z', at: x0 + 0.14, from: z0 + 0.2, to: z1 - 0.2, y: DECK + PAR_H, h: 0.42, spacing: 2.1, mat: m.metal });

  // tyre scrub in the aisle and at the ramp mouth
  tyreMarks(ctx, [
    { x: -38.0, z: 73.8, ry: Math.PI / 2, w: 0.26, d: 9.0, y: DECK },
    { x: -38.0, z: 74.9, ry: Math.PI / 2, w: 0.26, d: 7.4, y: DECK },
    { x: RAMP_TOP_X - 1.6, z: 69.4, ry: 1.1, w: 0.24, d: 4.4, y: DECK },
  ], { opacity: 0.085 });
}

function yawMember(ctx, ox, oz, y, ry, lx, lz, hw, hd, top, bot) {
  const ca = Math.cos(ry);
  const sa = Math.sin(ry);
  const px = ox + ca * lx - sa * lz;
  const pz = oz + sa * lx + ca * lz;
  const hx = Math.abs(ca) * hw + Math.abs(sa) * hd;
  const hz = Math.abs(sa) * hw + Math.abs(ca) * hd;
  ctx.collide(px - hx, pz - hz, px + hx, pz + hz, y + top, y + bot, true);
}

/** A short rank of nested trolleys. */
function addTrolleys(ctx, m, x, z, y, ry, n) {
  const parts = { metal: [], basket: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
  for (let i = 0; i < n; i++) {
    const dz = i * 0.30;
    // the basket, a shallow open box, and the handle
    push('basket', new THREE.BoxGeometry(0.48, 0.34, 0.62), trs(0, 0.62, dz));
    push('metal', new THREE.BoxGeometry(0.50, 0.05, 0.05), trs(0, 0.94, dz + 0.30));
    for (const s of [-1, 1]) {
      push('metal', new THREE.CylinderGeometry(0.018, 0.018, 0.62, 6), trs(s * 0.21, 0.31, dz + 0.24, 0.14, 0, 0));
      push('metal', new THREE.CylinderGeometry(0.018, 0.018, 0.50, 6), trs(s * 0.21, 0.25, dz - 0.24));
      for (const t of [-0.24, 0.24]) {
        push('metal', new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8), trs(s * 0.20, 0.05, dz + t, 0, 0, Math.PI / 2));
      }
    }
  }
  const g = new THREE.Group();
  const mm = new THREE.Mesh(bake(parts.metal), m.metal);
  mm.castShadow = true;
  g.add(mm);
  const bm = new THREE.Mesh(bake(parts.basket), cel({ color: 0xb6bcc6, bands: 3, tint: 0x666090 }));
  bm.castShadow = true;
  g.add(bm);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.name = 'openFrame';
  ctx.add(g);
  const ca = Math.cos(ry);
  const sa = Math.sin(ry);
  for (let i = 0; i < n; i++) {
    const dz = i * 0.30;
    const px = x - sa * dz;
    const pz = z + ca * dz;
    ctx.collide(px - 0.26, pz - 0.32, px + 0.26, pz + 0.32, y + 0.80, y + 0.45, true);
    for (const t of [-0.24, 0.24]) {
      for (const s of [-1, 1]) {
        const wx = px + ca * (s * 0.20) - sa * t;
        const wz = pz + sa * (s * 0.20) + ca * t;
        ctx.collide(wx - 0.06, wz - 0.06, wx + 0.06, wz + 0.06, y + 0.08, y, true);
      }
    }
  }
  return g;
}

/* ------------------------------------------------------------------ *
 * The 前場 -- everything between the doors and the road.
 * ------------------------------------------------------------------ */
function buildCourt(ctx, m, gm, rng, sakura, shrubs, petals) {
  const CY = Y + 0.09;                                   // the apron slab
  const white = flat({ color: PAL.lineWhite });

  /* the paving: a jointed grid over the apron so it is visibly a different
   * surface from the road, plus the pedestrian guide lines the brief asks for */
  {
    const joints = [];
    for (let x = SX0 + 2.4; x < R_EX1 - 1.0; x += 2.4) {
      joints.push({ geometry: new THREE.BoxGeometry(0.05, 0.012, CT_Z1 - CT_Z0 - 0.4), matrix: trs(x, 0, (CT_Z0 + CT_Z1) / 2) });
    }
    for (let z = CT_Z0 + 2.2; z < CT_Z1; z += 2.2) {
      joints.push({ geometry: new THREE.BoxGeometry(R_EX1 - SX0 - 0.4, 0.012, 0.05), matrix: trs((SX0 + R_EX1) / 2, 0, z) });
    }
    const jm = new THREE.Mesh(bake(joints), m.concreteDark);
    jm.position.y = CY + 0.006;
    jm.userData.noOutline = true;
    ctx.add(jm);
  }
  // the walking route from the footway to the doors, in white
  laneLine(ctx, { axis: 'z', at: -37.6, from: CT_Z0 + 0.4, to: CT_Z1 - 0.2, y: CY + 0.018 });
  laneLine(ctx, { axis: 'z', at: -35.2, from: CT_Z0 + 0.4, to: CT_Z1 - 0.2, y: CY + 0.018 });
  for (const [ax, az, ry] of [[-36.4, 85.9, 0], [-36.4, 83.6, 0]]) {
    paintQuad(ctx, {
      x: ax, z: az, w: 1.1, d: 1.1, y: CY, ry,
      mat: flat({ color: 0xffffff, map: roadPaint('arrow'), transparent: true, cache: false }),
    });
  }
  paintQuad(ctx, {
    x: -30.4, z: 85.4, w: 1.8, d: 1.8, y: CY, ry: Math.PI / 2,
    mat: flat({ color: 0xffffff, map: roadPaint('slow'), transparent: true, cache: false }),
  });

  /* ------------------------------ the trolley bay ------------------------------ *
   * The west end of the apron, under its own lean-to, which is what every
   * Japanese supermarket has and what makes the frontage read as one. */
  {
    /* **4.8 m and centred on 84.65, not 5.2 on 84.4.**  `makeBikeShelter` is
     * authored with `w` along local x, and `ry = PI/2` maps that to world z --
     * so the first numbers ran the lean-to from z 81.80 to 87.00, and the store's
     * frontage line is at 82.00 with its glazing and plinth standing proud of it
     * to 82.15.  The shelter's whole south bay, its two south posts and the end
     * of both guide rails were inside the shopfront.  4.8 on 84.65 spans
     * 82.25..87.05: clear of the glazing by 0.10 and of the apron's north edge
     * (87.20) by 0.15. */
    const bx = -46.4, bz = 84.65;
    ctx.add(makeBikeShelter({ ctx, x: bx, z: bz, y: CY, ry: Math.PI / 2, w: 4.8, d: 2.4, h: 2.30 }));
    const rail = [];
    for (const s of [-1, 1]) {
      /* The guide rail runs **along** the bay, so the cylinder needs `rx = PI/2`
       * -- a `CylinderGeometry`'s axis is +y, and without that rotation these
       * were two 4.4 m columns standing on the origin of the upstand they were
       * meant to cap: 0.74 m into the ground and 1.36 m out through the
       * lean-to's roof.  They rendered as two poles through the canopy and it
       * took a frame from the apron to see them. */
      rail.push({ geometry: new THREE.CylinderGeometry(0.045, 0.045, 4.4, 7), matrix: trs(bx + s * 0.78, 0.92, bz, Math.PI / 2, 0, 0) });
      rail.push({ geometry: new THREE.BoxGeometry(0.06, 0.92, 4.4), matrix: trs(bx + s * 0.78, 0.46, bz) });
    }
    const rm = new THREE.Mesh(bake(rail.map((p) => ({ geometry: p.geometry, matrix: p.matrix }))), m.metal);
    rm.position.set(0, CY, 0);
    rm.castShadow = true;
    rm.name = 'openFrame';
    ctx.add(rm);
    for (const s of [-1, 1]) {
      ctx.collide(bx + s * 0.78 - 0.08, bz - 2.2, bx + s * 0.78 + 0.08, bz + 2.2, CY + 0.95, CY, true);
    }
    addTrolleys(ctx, m, bx, bz - 1.5, CY, 0, 6);
    addTrolleys(ctx, m, bx, bz + 0.7, CY, 0, 4);
    ctx.add(makeSignPost({
      x: bx + 1.6, z: bz - 2.2, y: CY, ry: Math.PI, h: 2.0, postMat: m.metal,
      plates: [{ map: deliveryPlate(2), w: 0.70, h: 0.36, y: 1.62 }],
    }));
  }

  /* ------------------------------ by the doors ------------------------------ */
  const DX = (REC_X0 + REC_X1) / 2;
  /* The mat lies **on the tiling inside the recess**, not across its edge.  At
   * `SZ1 + 0.30` it spanned z 81.85..82.75 and the tiled floor `buildStore` lays
   * ends at 82.06, so half of it was flush with the tiling and half floated
   * 80 mm over the apron.  z = 81.30 puts the whole mat on the tiling, 0.78 m in
   * front of the door leaves. */
  ctx.add(makeDoormat({ x: DX, z: 81.30, y: Y + 0.17, ry: 0, w: 2.4, d: 0.9 }));
  /* The basket stacks, against the entrance bay's **east return, inside the
   * recess.**
   *
   * They were at `REC_X1 + 0.9`, i.e. 0.9 m *east* of the recess -- which is not
   * the reveal, it is the middle of the solid block between the recess and the
   * store's east corner, and `SZ1 - 0.55` put them 0.55 m behind the frontage
   * line as well.  Both stacks were entirely inside the building: no error, no
   * shadow, nothing in any frame.  The apron east of the recess is full (the
   * machine rank, the bin, two recycling boxes and the drinks cases all stand on
   * it), so the honest home for them is where a supermarket actually keeps them
   * -- just inside the covered recess, on the east return, out of the door's
   * swing.  The return's inner face is at `REC_X1 - 0.12`, and the fixed side
   * light beside the leaves runs from `REC_X1` to `REC_X1 - 1.58`, so the clear
   * floor inside it is 1.46 m -- which is two stacks at 0.76 m centres and
   * nothing else. */
  {
    const bx = REC_X1 - 1.19, bz = SZ1 - 0.55;
    const parts = { frame: [], basket: [] };
    parts.frame.push({ geometry: new THREE.BoxGeometry(0.70, 0.06, 0.50), matrix: trs(0, 0.30, 0) });
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        parts.frame.push({ geometry: new THREE.CylinderGeometry(0.022, 0.022, 0.30, 6), matrix: trs(s * 0.30, 0.15, t * 0.20) });
      }
    }
    for (let i = 0; i < 9; i++) {
      parts.basket.push({ geometry: new THREE.BoxGeometry(0.44, 0.10, 0.32), matrix: trs(0, 0.38 + i * 0.075, 0) });
    }
    const g = new THREE.Group();
    g.name = 'openFrame';
    const fm = new THREE.Mesh(bake(parts.frame), m.metal);
    fm.castShadow = true;
    g.add(fm);
    const bm = new THREE.Mesh(bake(parts.basket), cel({ color: 0xd8b24a, bands: 3, tint: 0x6f6790 }));
    bm.castShadow = true;
    g.add(bm);
    g.position.set(bx, Y + 0.17, bz);
    ctx.add(g);
    // a second, shorter stack in red beside it
    const g2 = new THREE.Group();
    g2.name = 'openFrame';
    const bm2 = new THREE.Mesh(bake(parts.basket.slice(0, 6)), cel({ color: 0xc4574c, bands: 3, tint: 0x6f6790 }));
    bm2.castShadow = true;
    g2.add(bm2);
    g2.add(new THREE.Mesh(bake(parts.frame), m.metal));
    g2.position.set(bx + 0.76, Y + 0.17, bz);
    ctx.add(g2);
    const y0 = Y + 0.17;
    for (const ox of [bx, bx + 0.76]) {
      for (const s of [-1, 1]) {
        for (const t of [-1, 1]) {
          ctx.collide(ox + s * 0.30 - 0.03, bz + t * 0.20 - 0.03,
            ox + s * 0.30 + 0.03, bz + t * 0.20 + 0.03, y0 + 0.30, y0, true);
        }
      }
      ctx.collide(ox - 0.36, bz - 0.26, ox + 0.36, bz + 0.26, y0 + 1.10, y0 + 0.27, true);
    }
  }
  // the A-board out on the apron, angled to the road
  {
    const ax = REC_X0 - 1.7, az = SZ1 + 1.9;
    const g = new THREE.Group();
    g.name = 'openFrame';
    const face = flat({ color: 0xffffff, map: superDeal(), cache: false });
    const side = cel({ color: 0x53504a, bands: 3, tint: 0x5c5680 });
    /* **The lean is `-s`, not `s`.**  A box rotated by `+t` about X sends its
     * `+y` end toward `+z`, so the `+z` leaf written with `rotation.x = +0.17`
     * splays *outward* at the top and pinches at the foot: the two leaves make a
     * V standing on its point instead of an A, which is a thing no A-board has
     * ever done.  Edge on from the road it reads as two blades and passes; from
     * anywhere above it is unmistakable.  Same derivation as the overbridge
     * stringers -- apply the rotation, do not guess its sign. */
    const LEAN = 0.17, HALF = 0.16, LEG = HALF + (0.92 / 2) * Math.sin(LEAN);
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.92, 0.045),
        [side, side, side, side, s > 0 ? face : side, s > 0 ? side : face]);
      leaf.position.set(0, 0.52, s * HALF);
      leaf.rotation.x = -s * LEAN;
      leaf.castShadow = true;
      g.add(leaf);
    }
    // the stay across the feet, spanning where the legs actually land
    g.add(box(0.05, 0.05, LEG * 2, m.metalDark, 0, 0.10, 0));
    g.position.set(ax, Y + 0.09, az);
    g.rotation.y = 0.42;
    ctx.add(g);
    const y0 = Y + 0.09;
    /* World-axis slabs, not yawed AABBs: a 24 deg slab's world box ate the
     * 0.24 m mouth. Inner faces stay 0.30 m apart. */
    for (const s of [-1, 1]) {
      ctx.collide(ax - 0.30, az + s * 0.175 - 0.025, ax + 0.30, az + s * 0.175 + 0.025,
        y0 + 0.98, y0 + 0.06, true);
    }
    ctx.collide(ax - 0.04, az - LEG, ax + 0.04, az + LEG, y0 + 0.13, y0 + 0.07, true);
  }
  ctx.add(makeUmbrellaStand({ x: REC_X0 - 0.75, z: SZ1 + 0.35, y: Y + 0.09, ry: 0, seed: 7742 }));

  /* the drinks cases and the produce stack, on the apron east of the doors --
   * a supermarket puts its cheapest bulk outside the door and that is most of
   * what makes an entrance read as trading */
  ctx.add(makeCrates({ x: REC_X1 + 2.5, z: SZ1 + 0.85, y: Y + 0.09, n: 4, seed: 7745, ry: 0.06 }));
  ctx.add(makeMilkCrate({ x: REC_X1 + 3.5, z: SZ1 + 0.75, y: Y + 0.09, ry: -0.22, n: 3 }));
  {
    // a low stack of carton trays, which is the other thing that is always there
    const parts = [];
    for (let i = 0; i < 5; i++) {
      parts.push({ geometry: new THREE.BoxGeometry(0.62, 0.16, 0.44), matrix: trs(0, 0.08 + i * 0.16, (i % 2) * 0.03) });
    }
    const mesh = new THREE.Mesh(bake(parts), cel({ color: 0xc8a97e, bands: 3, tint: 0x6f6790 }));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(REC_X1 + 4.6, Y + 0.09, SZ1 + 0.80);
    mesh.rotation.y = 0.1;
    ctx.add(mesh);
    hullOutline(mesh, { thickness: 0.0032 });
  }

  /* --------------------------- machines and recycling --------------------------- *
   * The district's interaction.  Two machines and a cage against the store's
   * east pier, which is where they always are -- out of the door's swing, on the
   * side people leave by. */
  /* The whole rank stops 0.57 m short of the entrance bay's east reveal
   * (-33.40).  On the first pass the crate cage stood at -34.40, i.e. *inside*
   * the doorway's span -- and the only thing that finds that is a scan line
   * across the doorstep, which is the check 六丁目's 弁当屋 added to this
   * project. */
  addVending(ctx, {
    x: SX1 - 0.95, z: SZ1 + 1.05, y: Y + 0.09, ry: 0, variant: 0,
    seed: 7751, label: 'じはんき  ·  さかえ 店前',
  });
  addVending(ctx, {
    x: SX1 - 2.15, z: SZ1 + 1.05, y: Y + 0.09, ry: 0, variant: 2,
    seed: 7752, label: 'じはんき  ·  つめたい おちゃ',
  });
  ctx.add(makeVendBin({ x: SX1 - 3.30, z: SZ1 + 1.0, y: Y + 0.09, ry: 0.2 }));
  ctx.add(makeRecycleBox({ x: SX1 - 4.40, z: SZ1 + 0.95, y: Y + 0.09, ry: 0.06, color: 0x4a7fae }));
  ctx.add(makeRecycleBox({ x: SX1 - 5.40, z: SZ1 + 0.95, y: Y + 0.09, ry: -0.05, color: 0x5f8f6a }));
  /* the drinks-crate cage, at the *west* end beside the trolley bay, because
   * that is the other half of a supermarket's frontage and there is no room
   * for it in the east rank */
  {
    const cx = -44.60, cz = SZ1 + 0.95;
    const g = new THREE.Group();
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push({ geometry: new THREE.BoxGeometry(0.05, 1.10, 0.72), matrix: trs(s * 0.44, 0.55, 0) });
    }
    parts.push({ geometry: new THREE.BoxGeometry(0.93, 1.10, 0.05), matrix: trs(0, 0.55, -0.36) });
    parts.push({ geometry: new THREE.BoxGeometry(0.93, 0.05, 0.72), matrix: trs(0, 0.03, 0) });
    for (let i = 0; i < 4; i++) {
      parts.push({ geometry: new THREE.BoxGeometry(0.93, 0.04, 0.04), matrix: trs(0, 0.22 + i * 0.26, 0.34) });
    }
    const fm = new THREE.Mesh(bake(parts), m.metal);
    fm.castShadow = true;
    g.add(fm);
    const crates = [];
    for (let i = 0; i < 4; i++) {
      crates.push({ geometry: new THREE.BoxGeometry(0.84, 0.24, 0.60), matrix: trs(0, 0.18 + i * 0.25, 0) });
    }
    const cm = new THREE.Mesh(bake(crates), cel({ color: PAL.crate, bands: 3, tint: 0x4a4a92 }));
    cm.castShadow = true;
    g.add(cm);
    g.position.set(cx, Y + 0.09, cz);
    ctx.add(g);
    ctx.collide(cx - 0.55, cz - 0.45, cx + 0.55, cz + 0.45, Y + 1.2);
  }

  /* --------------------------- the short-stay bays --------------------------- *
   * Three, on the apron's east end against the kerb, and deliberately **not**
   * across the doors: a car parked over a supermarket entrance is the one
   * mistake that makes a frontage unusable, and 六丁目's 弁当屋 already paid for
   * that lesson. */
  /* x -33.7, -31.2, -28.7.  The whole rank sits **east of the walking route**
   * (the two white guide lines at -37.6 and -35.2) and east of the entrance bay
   * (which runs to -33.4), and its east end stops 1.2 m short of the ramp's own
   * west upstand.  A car standing over a supermarket's doors is the one mistake
   * that makes a frontage unusable, and the first pass had the rank starting at
   * -34.7 with the kei half across the guide line. */
  const SS_Z = 85.6;
  for (let i = 0; i < 3; i++) {
    bayPaint(ctx, { x: -33.7 + i * 2.5, z: SS_Z, w: 2.4, d: 4.6, y: CY, ry: 0 });
  }
  ctx.add(makeWheelStops({ x: -31.2, z: SS_Z - 1.75, y: CY, ry: Math.PI, n: 3, pitch: 2.5, gauge: 1.35 }));
  ctx.add(makeSignPost({
    x: -35.4, z: SS_Z - 1.2, y: CY, ry: Math.PI / 2, h: 2.1, postMat: m.metal,
    plates: [{ map: warningPlate(2), w: 0.44, h: 0.86, y: 1.60 }],
  }));

  /* ------------------------------ beds and planting ------------------------------ */
  /* **The long bed is on the apron's road edge, not in the middle of it.**  At
   * (-44.2, 86.4) it ran x -46.95..-41.45 / z 85.75..87.05 and three separate
   * things stood in the soil: the trolley bay's lean-to (which reaches x -45.10
   * and z 87.13, so 1.85 m of the bed was under its roof and two of its posts
   * came up through the planting), the west bench, and two of the four bollards.
   * None of it throws and from the road it reads as a bed with furniture behind
   * it -- it is only from above, or from the footway looking down, that the posts
   * are visibly *in* it.
   *
   * z = 86.50 puts its north face 0.05 m inside the apron's edge (87.20), so it
   * lines the kerb the way a supermarket's frontage planting does; x = -42.15
   * starts it 0.20 m clear of the lean-to.  The bed is now the barrier along that
   * stretch, which is why the bollard row below shrank to the gap it leaves. */
  ctx.add(makeFlowerBed({ x: -42.15, z: 86.50, y: CY, ry: Math.PI / 2, w: 1.2, d: 5.4, seed: 7761 }));
  /* **The second bed is on the service passage, not beside the store's east
   * wall.**  It was at (-27.9, 79.6) -- and `SX1` is -27.0 with the ramp's own
   * east leg starting at exactly that x, so there is no strip between the two
   * and a 1.1 x 3.6 m bed there was 0.9 m inside the building.  The apron's east
   * end is full (the machine rank, the bin, two recycling boxes, the drinks
   * cases and the cherry pit are all on it), so the bed goes where this district
   * has a bare concrete slot that wants softening: the passage's east verge,
   * behind the gutter line at -19.32 and 1.95 m clear of the ramp's upstand. */
  ctx.add(makeFlowerBed({ x: -19.85, z: 77.6, y: Y + 0.07, ry: 0, w: 0.9, d: 3.0, seed: 7762 }));
  /* Two, in the 1.8 m the bed leaves between its east end (-39.40) and the west
   * guide line of the walking route (-37.6).  It was four from -44.0 to -38.6,
   * which is the bed's own footprint now. */
  bollardRow(ctx, { axis: 'x', at: CT_Z1 - 0.5, from: -39.10, to: -37.95, y: CY, n: 2, h: 0.72 });
  /* the cherry in its pit, which is the one soft thing on a hard apron -- and it
   * stands *east* of the walking route so it never closes the view of the
   * frontage from the road */
  {
    const px = -31.0, pz = 82.9;
    const pit = box(1.7, 0.10, 1.7, gm.dirt, px, CY + 0.02, pz);
    pit.receiveShadow = true;
    ctx.add(pit);
    for (const s of [-1, 1]) {
      ctx.add(box(1.86, 0.14, 0.10, m.concreteMid, px, CY + 0.05, pz + s * 0.88));
      ctx.add(box(0.10, 0.14, 1.86, m.concreteMid, px + s * 0.88, CY + 0.05, pz));
    }
    sakura.push({ x: px, z: pz, y: CY + 0.06, scale: 1.14, seed: 7771, lean: 0.11, leanDir: 2.2 });
  }
  shrubs.push({ x: -47.4, z: 80.6, y: Y, r: 0.46, count: 3, spread: 1.1, seed: 7775 });
  shrubs.push({ x: -25.6, z: 87.0, y: Y, r: 0.44, count: 3, spread: 1.0, seed: 7776 });
  petals.push({ x: -34.0, z: 83.4, w: 8.0, d: 3.0, y: CY + 0.02, n: 90 });
  petals.push({ x: -45.6, z: 85.4, w: 4.6, d: 2.6, y: CY + 0.02, n: 55 });
  dapple(ctx, { rng, x: -31.0, z: 84.2, y: CY, r: 1.5, spread: 1.7, n: 6, opacity: 0.11 });

  /* The two benches at the apron's quiet west end, **inboard of the bed**.  At
   * z = 86.2 they were 0.53 m deep inside its 85.85..87.15 and the west one had
   * its legs in the soil; at 85.10 they stand 0.44 m clear of it, facing the
   * shopfront with the planting and then the road behind them, which is the
   * arrangement they should always have had. */
  ctx.add(makeBench({ x: -42.6, z: 85.10, y: CY, ry: Math.PI, len: 1.8 }));
  ctx.add(makeBench({ x: -40.4, z: 85.10, y: CY, ry: Math.PI, len: 1.8 }));
  /* The staff bicycles, on the 1.5 m strip between the service drive's east edge
   * (-50.10) and the apron (-48.60).  It was bare grade and now carries its own
   * thin slab, butted to the drive rather than lapped over it -- two 60 mm pads
   * at one height z-fight, which is the 六丁目 turning-circle note at one tenth
   * the scale. */
  /* z 83.0..87.2, and the south end stops there on purpose: the delivery gate's
   * own sign post stands at (-49.6, 82.5) and is seated on the grade, so a slab
   * under it would leave it 60 mm in the air. */
  pad(ctx, { x: -49.35, z: 85.1, w: 1.5, d: 4.2, y: Y, h: 0.06, mat: gm.concrete, name: 'nanaBikeStrip' });
  const BSY = Y + 0.06;
  ctx.add(makeBikeRack({ x: -49.4, z: 84.0, y: BSY, ry: Math.PI / 2, n: 5, seed: 7781 }));
  /* **Both loose bicycles moved north of the rack.**  A bicycle is 1.73 m long
   * and these are parked *along* z, so at z 82.6 and 85.4 they ran 83.13..84.87
   * straight through the rack's own five machines -- 0.34 m of overlap at each
   * end -- and the southern one had its back wheel inside the delivery gate's
   * pier (x -50.26..-49.74, z 81.74..82.26).  North of the rack the strip is
   * empty as far as the apron's edge, and 0.6 m apart across their own width is
   * what `makeBikeRack` itself uses. */
  for (const [bx, bz, ry, col] of [
    [-49.62, 86.30, Math.PI / 2 + 0.05, 0x3f6f9c],
    [-49.02, 86.30, -Math.PI / 2 - 0.06, 0xd8a03c],
  ]) {
    ctx.add(makeBicycle({ x: bx, z: bz, y: BSY, ry, lean: 0.07, color: col }));
  }
  makeLoosePaper(ctx, [
    { x: -33.6, z: 86.4, y: CY, ry: 0.5 },
    { x: -43.9, z: 82.4, y: CY, ry: 2.1 },
  ]);
}

/* ------------------------------------------------------------------ *
 * The delivery yard.
 * ------------------------------------------------------------------ */
function buildYard(ctx, m, gm, rng) {
  /* The screen: a 2.1 m block wall across the yard's north end with a 4.2 m
   * gateway in it, so from the road and from the apron you see a wall and a
   * corner, and the yard is something you find. */
  wallRun(ctx, { axis: 'x', at: YD_Z1, from: YD_X0, to: -54.6, y: Y, h: 2.10, t: 0.26, panel: 3.2, mat: m.concreteMid });
  wallRun(ctx, { axis: 'x', at: YD_Z1, from: -50.0, to: YD_X1, y: Y, h: 2.10, t: 0.26, panel: 3.2, mat: m.concreteMid });
  wallRun(ctx, { axis: 'z', at: YD_X0, from: YD_Z0, to: YD_Z1, y: Y, h: 2.10, t: 0.26, panel: 3.6, mat: m.concreteMid });
  wallRun(ctx, { axis: 'x', at: YD_Z0, from: YD_X0, to: YD_X1, y: Y, h: 2.10, t: 0.26, panel: 3.6, mat: m.concreteMid });
  for (const px of [-54.6, -50.0]) {
    const p = box(0.52, 2.46, 0.52, m.concreteDark, px, Y + 1.23, YD_Z1);
    p.castShadow = p.receiveShadow = true;
    ctx.add(p);
    ctx.collide(px - 0.3, YD_Z1 - 0.3, px + 0.3, YD_Z1 + 0.3, Y + 2.46);
  }
  ctx.add(makeSignPost({
    x: -49.6, z: YD_Z1 + 0.5, y: Y, ry: Math.PI, h: 2.3, postMat: m.metal,
    plates: [
      { map: deliveryPlate(0), w: 0.86, h: 0.44, y: 1.90 },
      { map: parkPlate(4), w: 0.44, h: 0.66, y: 1.24 },
    ],
  }));

  /* the dock: a 1.05 m platform against the store's west gable with a roll-up
   * shutter over the opening, a canopy, the dock bumpers and the steps off it */
  {
    const dh = DK_H;
    const plat = box(3.0, dh, DK_Z1 - DK_Z0, m.concreteMid, DK_X - 1.5, Y + dh / 2, (DK_Z0 + DK_Z1) / 2);
    plat.castShadow = plat.receiveShadow = true;
    ctx.add(plat);
    hullOutline(plat, { thickness: 0.0032 });
    ctx.platform({ x0: DK_X - 3.0, x1: DK_X, z0: DK_Z0, z1: DK_Z1, top: Y + dh });
    // the edge kerb and the four rubber bumpers
    ctx.add(box(3.0, 0.10, 0.14, m.yellow, DK_X - 1.5, Y + dh + 0.05, DK_Z0 + 0.07));
    ctx.add(box(0.14, 0.10, DK_Z1 - DK_Z0, m.yellow, DK_X - 2.95, Y + dh + 0.05, (DK_Z0 + DK_Z1) / 2));
    for (let i = 0; i < 4; i++) {
      ctx.add(box(0.18, 0.34, 0.30, m.dark, DK_X - 3.02, Y + 0.62, DK_Z0 + 1.0 + i * 1.6));
    }
    // the shutter into the store
    /* **The surround stands proud and the curtain hangs in front of it.**  Both
     * were written *into* the wall -- the surround's 0.16 m box centred 0.06 m
     * behind the face, so 0.02 m of it showed, and the shutter 0.01 m in front of
     * that, which is a roll-up door drawn as a decal.  You cannot carve a recess
     * into a box; depth here is built outward, the same note the onsen street's
     * 格子 panels and the library's window plates each cost a round. */
    ctx.add(box(0.16, 3.10, 3.70, m.metalDark, DK_X - 0.04, Y + dh + 1.55, (DK_Z0 + DK_Z1) / 2 - 0.4));
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.9),
      flat({ color: 0xc6c2ce, map: shutterTex(20), cache: false }));
    sh.position.set(DK_X - 0.13, Y + dh + 1.45, (DK_Z0 + DK_Z1) / 2 - 0.4);
    sh.rotation.y = -Math.PI / 2;
    sh.userData.noOutline = true;
    ctx.add(sh);
    // its canopy
    const can = box(2.20, 0.14, 4.20, m.canopy, DK_X - 1.1, Y + dh + 3.05, (DK_Z0 + DK_Z1) / 2 - 0.4);
    can.rotation.z = -0.06;
    can.castShadow = can.receiveShadow = true;
    ctx.add(can);
    for (const dz of [-1.6, 1.6]) {
      ctx.add(box(0.08, 0.08, 1.9, m.metalDark, DK_X - 1.0, Y + dh + 3.42, (DK_Z0 + DK_Z1) / 2 - 0.4 + dz));
    }
    // the steps off the dock's north end
    steps(ctx, { x: DK_X - 1.5, z: DK_Z1 + 0.2, n: 5, rise: dh / 5, run: 0.34, w: 1.4, y: Y, dir: -1, axis: 'z', mat: gm.concreteMid });
    // the door light and its plate
    ctx.add(box(0.30, 0.16, 0.20, flat({ color: 0xf8efd4 }), DK_X - 0.18, Y + dh + 2.55, DK_Z0 + 0.5));
    ctx.add(makeSignPost({
      x: DK_X - 3.5, z: DK_Z1 - 0.6, y: Y + 0.06, ry: -Math.PI / 2, h: 2.1, postMat: m.metal,
      plates: [{ map: deliveryPlate(1), w: 0.72, h: 0.36, y: 1.66 }],
    }));
  }

  /* the yard's own clutter: pallets, roll cages, a carton stack, the waste bay
   * and the cold-store plant.  Tidy -- this is a supermarket's back yard, not
   * an industrial estate, and it gets swept every morning. */
  const YY = Y + 0.06;
  /* The yard's own clutter is laid out round the 2 t lorry `traffic.js` parks in
   * it: nothing stands in x -54.55..-52.85 / z 72.2..77.0, and nothing stands on
   * the dock platform (x -51.6..-48.6, z 71.0..77.8) either. */
  {
    const pal = [];
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 3; k++) {
        pal.push({ geometry: new THREE.BoxGeometry(1.10, 0.045, 0.14), matrix: trs(0, 0.10 + i * 0.14, -0.35 + k * 0.35) });
      }
      pal.push({ geometry: new THREE.BoxGeometry(1.10, 0.045, 0.90), matrix: trs(0, 0.14 + i * 0.14, 0) });
      for (const t of [-0.4, 0, 0.4]) {
        pal.push({ geometry: new THREE.BoxGeometry(0.10, 0.09, 0.90), matrix: trs(t, 0.045 + i * 0.14, 0) });
      }
    }
    const pm = new THREE.Mesh(bake(pal), cel({ color: 0xbfa279, bands: 3, tint: 0x5c5680 }));
    pm.castShadow = pm.receiveShadow = true;
    pm.position.set(-54.9, YY, 69.6);
    pm.rotation.y = 0.12;
    ctx.add(pm);
    hullOutline(pm, { thickness: 0.0032 });
    ctx.collide(-55.6, 69.0, -54.2, 70.2, YY + 0.5);
  }
  // two roll cages
  for (const [cx, cz, ry] of [[-52.6, 79.0, 0.3], [-51.6, 80.0, -0.5]]) {
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push({ geometry: new THREE.BoxGeometry(0.04, 1.55, 0.72), matrix: trs(s * 0.34, 0.80, 0) });
    }
    parts.push({ geometry: new THREE.BoxGeometry(0.72, 1.55, 0.04), matrix: trs(0, 0.80, -0.36) });
    for (let i = 0; i < 3; i++) {
      parts.push({ geometry: new THREE.BoxGeometry(0.68, 0.04, 0.70), matrix: trs(0, 0.24 + i * 0.44, 0) });
    }
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        parts.push({ geometry: new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8), matrix: trs(s * 0.30, 0.05, t * 0.30, 0, 0, Math.PI / 2) });
      }
    }
    const mm = new THREE.Mesh(bake(parts), m.metal);
    mm.castShadow = true;
    const g = new THREE.Group();
    g.name = 'openFrame';
    g.add(mm);
    g.position.set(cx, YY, cz);
    g.rotation.y = ry;
    ctx.add(g);
    for (const s of [-1, 1]) {
      yawMember(ctx, cx, cz, YY, ry, s * 0.34, 0, 0.03, 0.36, 1.55, 0.08);
    }
    yawMember(ctx, cx, cz, YY, ry, 0, -0.36, 0.36, 0.03, 1.55, 0.08);
    for (const hy of [0.24, 0.68, 1.12]) {
      yawMember(ctx, cx, cz, YY, ry, 0, 0, 0.34, 0.35, hy + 0.03, hy - 0.03);
    }
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        yawMember(ctx, cx, cz, YY, ry, s * 0.30, t * 0.30, 0.06, 0.06, 0.08, 0);
      }
    }
  }
  ctx.add(makeCrates({ x: -55.4, z: 72.4, y: YY, n: 5, seed: 7791, ry: -0.1 }));
  ctx.add(makeMilkCrate({ x: -54.4, z: 80.6, y: YY, ry: 0.3, n: 4 }));
  // the carton stack against the wall, and the recycling plate over it
  {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      parts.push({ geometry: new THREE.BoxGeometry(1.05, 0.22, 0.70), matrix: trs((i % 2) * 0.06, 0.11 + i * 0.22, (i % 3) * 0.04) });
    }
    const cm = new THREE.Mesh(bake(parts), cel({ color: 0xc8a97e, bands: 3, tint: 0x6f6790 }));
    cm.castShadow = cm.receiveShadow = true;
    cm.position.set(-55.2, YY, 79.4);
    cm.rotation.y = 0.06;
    ctx.add(cm);
    hullOutline(cm, { thickness: 0.0032 });
    ctx.collide(-55.8, 78.9, -54.6, 79.9, YY + 1.6);
  }
  ctx.add(makeBins({ x: -51.0, z: 67.0, y: YY, ry: 0 }));
  ctx.add(makeGomiHouse({ ctx, x: -53.4, z: 67.0, y: YY, ry: 0, w: 2.2, d: 1.5, seed: 7795 }));
  // the cold-store plant against the store's gable, and the extract fans
  {
    const parts = [];
    parts.push({ geometry: new THREE.BoxGeometry(2.60, 1.85, 1.10), matrix: trs(0, 0.925, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(2.76, 0.10, 1.24), matrix: trs(0, 1.90, 0) });
    const pm = new THREE.Mesh(bake(parts), m.metalDark);
    pm.castShadow = pm.receiveShadow = true;
    pm.position.set(SX0 - 1.7, YY, 68.6);
    ctx.add(pm);
    hullOutline(pm, { thickness: 0.0032 });
    ctx.collide(SX0 - 3.1, 67.9, SX0 - 0.3, 69.3, YY + 1.95);
    for (const dz of [-0.6, 0.6]) {
      ctx.add(makeAircon({ x: SX0 - 3.1 + 0.0, z: 68.6 + dz, y: YY + 0.02, ry: -Math.PI / 2, w: 0.95, h: 0.72, d: 0.40, feet: true }));
    }
  }
  /* **`SX0 - 0.27` and not `- 0.35`.**  A wall unit's bracket arms span exactly
   * `standoff` behind the body, so the back of the assembly is `d/2 + standoff`
   * = 0.27 m from the origin -- at 0.35 the arms stopped 71 mm short of the
   * gable and three units hung in the air with their own shadow on the wall
   * behind them.  Measured by firing a ray out of the back of each one, which is
   * the only direction that works: started inside the building it hits an
   * interior face and reports clearance that is not there. */
  for (let i = 0; i < 3; i++) {
    ctx.add(makeAircon({
      x: SX0 - 0.27, z: 79.6 + i * 1.05, y: Y + 1.55, ry: -Math.PI / 2,
      w: 0.92, h: 0.68, d: 0.36, feet: false, standoff: 0.09,
    }));
  }
  ctx.add(makeTapPost({ x: -54.9, z: 71.2, y: YY, ry: Math.PI / 2 }));
  ctx.add(makeBucket({ x: -54.5, z: 71.6, y: YY, ry: 0.4, water: true }));
  ctx.add(makeHoseBox({ x: -55.0, z: 75.2, y: YY, ry: Math.PI / 2 }));
  ctx.add(makeIvy({ x: YD_X0 + 0.16, z: 79.0, y: YY, ry: Math.PI / 2, len: 3.2, top: 2.05, drop: 0.85, seed: 7797 }));
  ctx.add(makeCone({ x: -50.8, z: 81.0, y: YY, ry: 0.2 }));
  ctx.add(makeCone({ x: -50.2, z: 80.2, y: YY, ry: -0.4, tilt: 0.05 }));
  makeChalkMarks(ctx, [{ x: -52.6, z: 79.6, y: ctx.groundAt(-52.6, 79.6), seed: 7798, scale: 0.8 }]);
}

/* ------------------------------------------------------------------ *
 * 七丁目通り and the road node.
 * ------------------------------------------------------------------ */
function buildRoad(ctx, m, gm, rng, sakura, shrubs, petals) {
  const RY = Y + 0.11;                                   // the carriageway surface

  /* edge lines both sides, a dashed centre line, and the two 徐行 the store's
   * mouths need */
  laneLine(ctx, { axis: 'x', at: RD_Z0 + 0.55, from: RD_X0 + 1.2, to: RD_X1 - 1.2, y: RY + 0.012 });
  laneLine(ctx, { axis: 'x', at: RD_Z1 - 0.55, from: RD_X0 + 1.2, to: RD_X1 - 1.2, y: RY + 0.012 });
  laneLine(ctx, { axis: 'x', at: RD_Z, from: RD_X0 + 2.4, to: RD_X1 - 2.4, y: RY + 0.012, dash: 1.2 });
  for (const [px, ry] of [[-26.0, Math.PI / 2], [-48.0, -Math.PI / 2]]) {
    paintQuad(ctx, {
      x: px, z: RD_Z + (ry > 0 ? -1.5 : 1.5), w: 2.0, d: 2.0, y: RY, ry,
      mat: flat({ color: 0xffffff, map: roadPaint('slow'), transparent: true, cache: false }),
    });
  }
  /* the simplified crossing outside the doors -- four bars, which is what a
   * 生活道路 crossing near a shop actually is */
  {
    const bars = [];
    for (let i = 0; i < 5; i++) {
      bars.push({ geometry: new THREE.BoxGeometry(0.55, 0.02, 5.4), matrix: trs(-38.6 + i * 0.95, 0, RD_Z) });
    }
    const mesh = new THREE.Mesh(bake(bars), flat({ color: PAL.lineWhite }));
    mesh.position.y = RY + 0.014;
    mesh.userData.noOutline = true;
    ctx.add(mesh);
  }
  // 駐停車禁止 on the south kerb across the ramp mouth and the crossing
  kerbLine(ctx, { axis: 'x', at: RD_Z0 + 0.30, from: -28.4, to: -20.8, y: RY });
  kerbLine(ctx, { axis: 'x', at: RD_Z0 + 0.30, from: -41.0, to: -35.4, y: RY });
  kerbLine(ctx, { axis: 'x', at: RD_Z0 + 0.30, from: -55.8, to: -48.6, y: RY });

  /* road patches, gullies and covers -- the ordinary wear that makes a new
   * carriageway read as a used one */
  {
    const patch = [];
    for (const [px, pz, pw, pd] of [[-43.0, 90.2, 3.2, 1.9], [-31.4, 92.8, 2.4, 1.5], [-19.8, 91.0, 2.0, 1.2]]) {
      patch.push({ geometry: new THREE.BoxGeometry(pw, 0.012, pd), matrix: trs(px, 0, pz) });
    }
    const pm = new THREE.Mesh(bake(patch), gm.asphaltWorn);
    pm.position.y = RY + 0.008;
    pm.userData.noOutline = true;
    ctx.add(pm);
  }
  {
    const covers = [];
    for (const [cx, cz] of [[-45.6, RD_Z], [-33.2, RD_Z], [-21.0, RD_Z], [SP_X, 80.2]]) {
      covers.push({ geometry: new THREE.CylinderGeometry(0.33, 0.33, 0.03, 12), matrix: trs(cx, 0, cz) });
    }
    const cm = new THREE.Mesh(bake(covers), m.drain);
    cm.position.y = RY + 0.012;
    cm.receiveShadow = true;
    ctx.add(cm);
  }
  {
    const gullies = [];
    for (const gx of [-52.0, -44.0, -36.0, -28.0, -20.0]) {
      gullies.push({ geometry: new THREE.BoxGeometry(0.52, 0.04, 0.30), matrix: trs(gx, 0, RD_Z0 + 0.20) });
      gullies.push({ geometry: new THREE.BoxGeometry(0.52, 0.04, 0.30), matrix: trs(gx + 4.0, 0, RD_Z1 - 0.20) });
    }
    const gmesh = new THREE.Mesh(bake(gullies), m.drain);
    gmesh.position.y = RY + 0.014;
    ctx.add(gmesh);
  }

  /* the poles, their cabling and the lamps */
  /* Every one of these stands on a footway, not on the grade: the road's north
   * walk is 0.135 m of pad and the spur's is 0.10, and `y: Y` sank the first four
   * by a kerb's height and the last two by 100 mm -- base collar and all.
   * `groundY(z)` is not the ground and neither is `Y`. */
  poleRun(ctx, {
    defs: [
      { x: -54.0, z: RD_Z1 + 0.8, y: Y + 0.135, lamp: true },
      { x: -42.0, z: RD_Z1 + 0.8, y: Y + 0.135 },
      { x: -30.0, z: RD_Z1 + 0.8, y: Y + 0.135, lamp: true },
      { x: -17.4, z: RD_Z1 + 0.8, y: Y + 0.135 },
      /* On the **kerb line**, x = -19.45, and not on the spur's centre.  A pole
       * is a 0.4 m box and the player's radius is added to every side of it, so
       * one at x = -17.4 stands in 1.08 m of a 5.0 m carriageway -- which is not
       * a blockage but is a pole in the middle of a road. */
      { x: -19.45, z: 83.0, y: Y + 0.10, lamp: true },
      { x: -19.45, z: 76.2, y: Y + 0.10 },
    ],
    chains: [[0, 1, 2, 3], [3, 4, 5]],
    drops: [[2, [-31.0, Y + 5.6, 84.0]], [5, [-13.6, Y + 5.4, 76.6]]],
  });

  /* the junction furniture at the spur's mouth */
  ctx.add(makeMirror({ x: -13.9, z: RD_Z0 - 0.6, y: Y + 0.135, ry: -0.8, h: 2.5 }));
  ctx.add(makeMirror({ x: -18.9, z: SP_Z0 + 0.7, y: Y + 0.10, ry: 2.4, h: 2.4 }));
  laneSign(ctx, { x: -19.6, z: RD_Z0 - 0.7, y: Y + 0.135, ry: Math.PI / 2, variant: 10, h: 2.2 });
  laneSign(ctx, { x: -13.2, z: LK_Z + LK_W / 2 + 0.6, y: ctx.groundAt(-13.2, LK_Z + LK_W / 2 + 0.6), ry: Math.PI, variant: 9, h: 2.1 });
  ctx.add(makeSignPost({
    x: -50.0, z: RD_Z0 - 0.7, y: Y + 0.135, ry: Math.PI, h: 2.4, postMat: m.metal,
    plates: [{ map: parkPlate(5), w: 0.50, h: 0.74, y: 1.86 }],
  }));
  ctx.add(makeGuardrail({ ctx, x: -23.0, z: RD_Z1 + 0.55, y: Y + 0.135, ry: 0, len: 5.0 }));
  /* **4.2 m, ending at z = 83.40, not 5.6 ending at 84.86.**  Both ends of this
   * run were inside something.  It is the boundary between the spur's east footway
   * and コーポ さかえ's forecourt, and its north end died 0.30 m into the side of
   * the block's mailbox bank -- a rail that stops in mid-air inside a cabinet.
   * Pulled back, the boundary reads as one line: rail, then the bank, then the
   * parcel locker.  (Its old length also skewered the four-bike rack that used to
   * stand at (-12.6, 80.4); see the note by the forecourt run.) */
  ctx.add(makeGuardrail({ ctx, x: -12.4, z: 81.30, y: Y + 0.10, ry: Math.PI / 2, len: 4.2 }));
  for (const dx of [-1.2, 1.2]) {
    ctx.add(makeDelineator({
      x: -15.2 + dx, z: SP_Z0 - 0.8, y: ctx.groundAt(-15.2 + dx, SP_Z0 - 0.8),
      lean: dx > 0 ? 0.05 : 0,
    }));
  }
  ctx.add(makeCone({ x: -21.4, z: RD_Z0 - 0.9, y: Y + 0.135, ry: 0.3 }));

  /* --------------------------- the coin park opposite --------------------------- *
   * Six bays and no more.  A supermarket with a roof deck does not need a
   * ground car park, so what is opposite it is the ordinary coin park that was
   * on that plot before the store arrived -- which is why it is scruffier, has
   * a gravel surface and two 月極 bays at its far end. */
  {
    const cx0 = -46.0, cx1 = -31.0, cz0 = RD_Z1 + WK, cz1 = RD_Z1 + WK + 5.6;
    pad(ctx, { x: (cx0 + cx1) / 2, z: (cz0 + cz1) / 2, w: cx1 - cx0, d: cz1 - cz0, y: Y, h: 0.07, mat: gm.gravel, name: 'nanaCoinPark' });
    for (let i = 0; i < 6; i++) {
      bayPaint(ctx, { x: cx0 + 1.25 + i * 2.5, z: cz0 + 2.6, w: 2.4, d: 5.0, y: Y + 0.07, ry: Math.PI });
    }
    ctx.add(makeWheelStops({ x: (cx0 + cx1) / 2, z: cz1 - 1.15, y: Y + 0.07, ry: 0, n: 6, pitch: 2.5, gauge: 1.35 }));
    hedgeRun(ctx, { axis: 'x', at: cz1 + 0.4, from: cx0, to: cx1, y: Y, h: 0.95, seed: 7801 });
    ctx.add(makeSignPost({
      x: cx1 - 0.5, z: cz0 + 0.5, y: Y + 0.07, ry: Math.PI, h: 2.5, postMat: m.metal,
      plates: [{ map: coinParkPlate(), w: 0.60, h: 0.80, y: 1.92 }],
    }));
    // the payment machine, at the mouth and clear of the bays
    {
      const px = cx1 - 0.6, pz = cz0 + 1.9;
      const g = new THREE.Group();
      g.add(box(0.46, 1.20, 0.36, m.metalDark, 0, 0.60, 0));
      g.add(box(0.50, 0.10, 0.40, m.metal, 0, 1.24, 0));
      g.add(box(0.34, 0.26, 0.04, flat({ color: 0x3c4450 }), 0, 0.92, -0.19));
      g.position.set(px, Y + 0.07, pz);
      g.rotation.y = Math.PI;
      ctx.add(g);
      ctx.collide(px - 0.3, pz - 0.25, px + 0.3, pz + 0.25, Y + 1.3);
    }
    ctx.add(makeCone({ x: cx0 + 0.5, z: cz0 + 1.0, y: Y + 0.07, ry: 0.2 }));
    petals.push({ x: -40.0, z: cz0 + 3.4, w: 5.0, d: 2.4, y: Y + 0.09, n: 55 });
  }

  /* the verge north of the road, west of the coin park */
  shrubs.push({ x: -52.0, z: RD_Z1 + 3.0, y: Y, r: 0.5, count: 4, spread: 1.4, seed: 7803 });
  shrubs.push({ x: -27.6, z: RD_Z1 + 2.6, y: Y, r: 0.46, count: 3, spread: 1.2, seed: 7804 });
  sakura.push({ x: -49.2, z: RD_Z1 + 3.6, y: Y, scale: 1.16, seed: 7805, lean: 0.12, leanDir: 1.6 });
  sakura.push({ x: -21.4, z: RD_Z1 + 3.2, y: Y, scale: 1.10, seed: 7806, lean: 0.1, leanDir: 4.2 });
}

/* ------------------------------------------------------------------ *
 * The residential spur: the three plots on the east side of the south leg.
 * "The supermarket is in the neighbourhood" needs neighbours.
 * ------------------------------------------------------------------ */
function buildSpur(ctx, m, gm, rng, sakura, shrubs, petals) {
  const FX = SP_X + SP_W / 2 + 1.2;                    // -12.4, the frontage line

  /* コーポ さかえ -- a three-storey walk-up with its gallery on the street.
   *
   * `makeWalkup` builds its open stair at local x -w/2-1.6 .. -w/2 and local
   * z d/2-1.55 .. d/2+0.3, i.e. *outside* the mass and therefore outside
   * `plotCollide`'s box.  Facing 'x-' the group is turned -PI/2, which maps
   * local -x to world -z: so for a block at (X, Z) the stair lands at
   * world x X-d/2-0.3 .. X-d/2+1.55, z Z-w/2-1.6 .. Z-w/2.  Written out and
   * collided by hand, because guessing at it is what put a staircase in
   * another block's 私道 two rounds ago. */
  /* コーポ さかえ -- and both of its numbers were got wrong once, in the two
   * ways `NEXT.md` already names.
   *
   * `x = -7.0` and not -9.6: with `face: 'x-'` the block's *depth* runs along
   * world x, so its gallery face lands at `x - d/2` = -10.20 and the strip
   * between it and the footway's east edge (-12.40) is 2.20 m.  At -9.6 that
   * strip was 0.40 m and the mailbox bank, the locker bank and the rack were
   * all inside the render -- the same arithmetic as 六丁目's コーポ ひがし.
   *
   * `z = 82.6` and not 79.6 because of **the open stair**.  `makeWalkup` builds
   * it 1.6 m beyond the local -x end, outside the mass and outside
   * `plotCollide`'s box; with `ry = -PI/2` local x maps to world *z*, so the
   * stair lands at `z - w/2 - 1.6 .. z - w/2` -- the block's **south** end.  At
   * z = 79.6 that is 73.50..75.10, which is squarely inside the link lane
   * (72.10..75.70): a real staircase standing in the only road into the
   * district.  At 82.6 with w = 7.2 it lands at 77.40..79.00, 1.7 m clear.
   * Derive the extent from the generator's own numbers; do not guess it. */
  const CORP = { x: -7.0, z: 82.6, w: 7.2, d: 6.4, face: 'x-' };
  {
    const g = makeWalkup({
      x: CORP.x, z: CORP.z, y: Y, w: CORP.w, d: CORP.d, face: CORP.face,
      floors: 3, units: 3, seed: 7811, wall: 4, plate: 9, ctx,
    });
    ctx.add(g);
  }
  pad(ctx, { x: -12.9, z: CORP.z, w: 2.2, d: CORP.w + 1.0, y: Y, h: 0.07, mat: gm.concrete, name: 'nanaCorpFore' });
  /* The forecourt run, measured rather than spaced by eye -- three of the five
   * things on it were inside one another.
   *
   * `makeMailboxBank` is 0.88 m across its header board and `makeLockerBank`
   * 1.39 m across its plinth, so at 1.0 m centres the mailbox's north post was
   * inside the locker's plinth; the bank moved to `+1.85` and they now stand
   * 0.42 m apart.  **The scooter came south of both.**  It is 1.66 m long parked
   * along z, so at `+4.3` it ran 86.06..87.73 and 0.63 m of it was inside the
   * locker -- the machine's own front wheel and fork were in the cabinet.  At
   * `+0.4` it has the whole 2.5 m the bike rack used to hold. */
  ctx.add(makeMailboxBank({ x: -12.5, z: CORP.z + 1.85, y: Y + 0.07, ry: -Math.PI / 2, n: 9 }));
  ctx.add(makeLockerBank({ x: -12.5, z: CORP.z + 3.4, y: Y + 0.07, ry: -Math.PI / 2, seed: 7812 }));
  /* **No rack here.**  A four-bike rack at (-12.6, 80.4) covers x -13.50..-11.67,
   * and `makeGuardrail`'s run down the footway's east edge is at x -12.34..-12.46
   * over z 79.15..84.86 -- so the rail threaded through all four machines between
   * the frame and the basket, and every one of them was skewered by it.  The rail
   * is what the footway needs; the rack is what the forecourt can do without.
   * The loose bicycle below stops at x -12.50 and is clear of it by 0.05 m. */
  ctx.add(makeBicycle({ x: -12.9, z: CORP.z - 3.6, y: Y + 0.07, ry: Math.PI / 2 + 0.06, lean: 0.07, color: 0x4f8f6a }));
  ctx.add(makeScooter({ x: -12.9, z: CORP.z + 0.2, y: Y + 0.07, ry: Math.PI / 2, seed: 7814, color: 0x6f7f96 }));

  shrubs.push({ x: -12.0, z: 78.0, y: Y, r: 0.42, count: 3, spread: 1.0, seed: 7818 });
  petals.push({ x: -11.4, z: 82.6, w: 2.0, d: 6.0, y: Y + 0.07, n: 55 });
  sakura.push({ x: -2.6, z: 84.6, y: Y, scale: 1.12, seed: 7822, lean: 0.1, leanDir: 3.0 });

  /* ------------------------ the two houses on the road ------------------------ *
   * North of 七丁目通り and facing -z onto it, which is the shaded quarter here
   * (the sun is at (-52, 62, 56)) and is correct for the type rather than a
   * compromise -- 四丁目's own north row makes the same call for the same
   * reason.  What is lit is their gardens, which is what you see from the road.
   *
   * The spur's east side holds exactly one building: 12.6 m between the link
   * lane and the road's footway, of which the walk-up and its open stair take
   * 9.8.  The first draft put a detached house in the remaining 2.8 m -- inside
   * the walk-up at one end and inside the carriageway at the other. */
  const HOUSE = { x: -16.2, z: 101.0, w: 6.4, d: 6.6, face: 'z-' };
  {
    const h = makeHouse({
      x: HOUSE.x, z: HOUSE.z, w: HOUSE.w, d: HOUSE.d, face: HOUSE.face, floors: 2,
      seed: 7815, wall: 6, roof: 1, roofKind: 'gable', y: Y, porch: true,
    });
    ctx.add(h);
    ctx.collide(HOUSE.x - HOUSE.w / 2 - 0.1, HOUSE.z - HOUSE.d / 2 - 0.1,
      HOUSE.x + HOUSE.w / 2 + 0.1, HOUSE.z + HOUSE.d / 2 + 0.1, Y + 5.5);
  }
  plotWall(ctx, {
    x0: -19.7, x1: -12.7, z0: 96.1, z1: 104.4, sides: ['z-'], kind: 'block',
    h: 0.95, blockH: 0.55, y: Y, seed: 7816, gate: { side: 'z-', at: -16.2, w: 1.9 },
  });
  /* `dressPlot` places the aircon **without** asking its own slot allocator, so
   * at the default offset it can land in the front step -- the report
   * `kawabata.js`'s 二階半 already paid for.  Pushed to the far end of the
   * frontage and up onto the wall on brackets. */
  dressPlot(ctx, {
    x: HOUSE.x, z: HOUSE.z, w: HOUSE.w, d: HOUSE.d, face: 'z-', y: Y, seed: 7817,
    plate: 3, gap: 1.6, gateAt: 0.0, airconAt: -2.4, airconUp: 1.25, airconOut: 0.09,
  });

  const ATT = { x: -8.6, z: 101.4, w: 6.2, d: 6.6, face: 'z-' };
  {
    const a = makeAtticHouse({
      x: ATT.x, z: ATT.z, w: ATT.w, d: ATT.d, face: ATT.face, y: Y, seed: 7820,
      wall: 2, roof: 0,
    });
    ctx.add(a);
    ctx.collide(ATT.x - ATT.w / 2 - 0.1, ATT.z - ATT.d / 2 - 0.1,
      ATT.x + ATT.w / 2 + 0.1, ATT.z + ATT.d / 2 + 0.1, Y + 6.4);
  }
  hedgeRun(ctx, { axis: 'x', at: 96.6, from: -11.9, to: -5.3, y: Y, h: 0.9, seed: 7821 });
  shrubs.push({ x: -12.4, z: 99.0, y: Y, r: 0.48, count: 3, spread: 1.2, seed: 7823 });
  sakura.push({ x: -20.8, z: 99.2, y: Y, scale: 1.14, seed: 7824, lean: 0.11, leanDir: 1.9 });
}

/* ------------------------------------------------------------------ *
 * The east side: the service passage, the footpath into 桜守裏町, and the
 * furniture that says which of the two is which.
 * ------------------------------------------------------------------ */
function buildEast(ctx, m, gm, rng, shrubs, petals) {
  const PY = Y + 0.07;
  laneGutter(ctx, { axis: 'z', at: PS_X1 - 0.22, from: 64.6, to: 80.6, y: Y, w: 0.30 });
  bollardRow(ctx, { axis: 'x', at: 81.2, from: PS_X0 + 0.4, to: PS_X1 - 0.4, y: PY, n: 3, h: 0.72 });
  laneSign(ctx, { x: PS_X0 + 0.35, z: 79.0, y: PY, ry: -Math.PI / 2, variant: 11, h: 2.0 });
  ctx.add(makeSignPost({
    x: PS_X1 - 0.4, z: 66.6, y: PY, ry: 0, h: 2.1, postMat: m.metal,
    plates: [{ map: parkPlate(4), w: 0.44, h: 0.66, y: 1.60 }],
  }));
  /* **The ivy on the ramp's east upstand, in five sections, because the wall it
   * grows on is raked.**  `makeIvy` scatters its leaves in a horizontal band at a
   * constant `top`, and this face is not horizontal -- the upstand climbs 1 in 6
   * with the flight, so its coping falls 0.57 m across the 3.4 m the ivy covered.
   * Hung at one height it sat on the wall at the north end and floated up to half
   * a metre clear of it at the south, which is the whole of the complaint: a plant
   * in mid-air beside a wall reads as neither.  Each section takes the coping's
   * height at its own z, which is `surface + 0.56` for an upstand 0.62 deep set
   * 0.06 into the slab, less the `PY` the group is seated at. */
  for (let i = 0; i < 5; i++) {
    const zc = 77.04 + i * 0.68;
    ctx.add(makeIvy({
      x: R_EX1 + 0.12, z: zc, y: PY, ry: Math.PI / 2,
      len: 0.72, top: (RAMP_Z0 - zc) / 6 + 0.49, drop: 0.62, seed: 7831 + i,
    }));
  }
  ctx.add(makeBicycle({ x: PS_X0 + 0.55, z: 74.0, y: PY, ry: 0.03, lean: 0.06, color: 0x9c5a4a }));
  ctx.add(makeCrates({ x: PS_X0 + 0.6, z: 71.2, y: PY, n: 3, seed: 7832, ry: 0.12 }));
  shrubs.push({ x: PS_X1 - 0.9, z: 68.6, y: Y, r: 0.4, count: 3, spread: 0.9, seed: 7833 });
  petals.push({ x: -20.0, z: 70.8, w: 2.4, d: 3.4, y: PY + 0.02, n: 45 });
  /* A bench on the passage, looking back at the store.
   *
   * **At z = 71.0 and x = -19.95**, and both are constrained.  It was at
   * (-19.4, 66.4), which is a 1.7 m bench centred 0.2 m from the two sign posts
   * at z 65.6 and 66.6 -- so both of them came up through its seat and its back,
   * which is the first thing anybody walking up the passage sees.  And -19.4 is
   * on the slotted channel that runs the length of it (-19.47..-19.17); -19.95
   * stands the legs on the slab beside it. */
  ctx.add(makeBench({ x: -19.95, z: 71.0, y: PY, ry: -Math.PI / 2, len: 1.7 }));
  /* The 案内 plate goes on the passage's **east verge**, not in the middle of
   * it.  On the first pass it stood at (-19.3, 64.9), which is 0.2 m off the
   * centre line of a 3.2 m passage: from the field east of the district the
   * whole view of the store, the ramp and the flight up to 湯の坂 was the blank
   * back of a sign at eye height.  Anything at eye height in a narrow passage
   * has to be checked from both ends. */
  ctx.add(makeSignPost({
    x: PS_X1 - 0.30, z: 65.6, y: Y + 0.06, ry: -Math.PI / 2, h: 2.2, postMat: m.metal,
    plates: [{ map: warningPlate(2), w: 0.42, h: 0.82, y: 1.66 }],
  }));
}
