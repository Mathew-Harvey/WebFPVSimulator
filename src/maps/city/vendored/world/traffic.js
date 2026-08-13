import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { flat } from '../core/toon.js';
import { roadPaint } from '../core/textures.js';
import { centerX, groundY, ROAD_HALF } from './street.js';
import { laneLine } from './ground.js';
import { makeCone } from './props.js';
import { makeScooter } from './streetprops.js';
import {
  CAR, parkVehicle, vehicleSize, kerbLine, makeDelineator, makeBusStop, tyreMarks,
} from './vehicles.js';

/* ------------------------------------------------------------------ *
 * 駐車 -- where the town's cars actually are.
 *
 * A street-level sweep over the whole map rather than a district, and it is
 * one file for the same reason `district.js`'s housing sweep is one file:
 * the thing being got right is the *distribution*, and a distribution cannot
 * be reviewed thirty lines at a time in twenty-two modules.  Every vehicle in
 * the world outside a garage is in the table below, with the reason it is
 * where it is.
 *
 * ------------------------------------------------------------------ *
 * THE SIX RULES THIS TABLE IS BUILT ON
 *
 * **1.  Eighteen, and eight of them on a carriageway.**  The first pass put
 * thirty-six in, twenty of them at a kerb, and the town stopped reading as a
 * town: every view down a street had a vehicle in it, which is a car park with
 * houses round it rather than somewhere people live.  Two thirds of what is
 * left stands in parking that was already built -- a bay, a carport, an apron --
 * and the eight on the road are spaced so that no two are in the same frame at
 * the same distance.  **If a later round adds more, add them off the road.**
 *
 * **2.  Never two cars facing each other across a road.**  A 6.3 m carriageway
 * with a 1.7 m car at each kerb is 2.9 m between them, and the eye reads that
 * as a lane you could not drive down.  It is worse than it sounds because the
 * *collider* is 0.7 m bigger than the car in both axes.  No two entries below
 * overlap in the along-street axis on opposite kerbs of the same street, and
 * the nearest near-miss -- さくら坂's 軽トラ and the wholesaler's van -- is 5 m
 * clear end to end.
 *
 * **3.  Keep left.**  Japan drives on the left, so a car parked at a kerb noses
 * the way that side of the road runs: on the *east* kerb of the main road it
 * faces −z (`ry = +PI/2`), on the *west* kerb it faces +z (`ry = -PI/2`).
 * Getting this right costs nothing and it is most of what makes parked cars
 * look like a street rather than a car park.
 *
 * **4.  Nothing parks where it would not fit -- including inside another
 * vehicle.**  Every position was tested against `world.colliders` at its own
 * rotated footprint; what that misses is *the cars in this same table*, which
 * do not exist as colliders until the sweep runs.  `crossHatch` and
 * `canalHatch` were 1.6 m apart with 4.05 m of car each and were driven
 * straight through one another for a whole round.  There is a pairwise check at
 * the bottom of `buildTraffic` now, and it runs in dev on every load.
 *
 * A car is 4.4 x 1.7 and `parkVehicle` registers a collider for it, so the
 * player's 0.34 m radius is added to every side: a car takes 5.1 x 2.4 out of
 * whatever it stands on.  Three lanes in this world are 2.3-3.2 m wide, and a
 * car parked in the *middle* of one seals it -- 3.4 m less 1.7 m of car is
 * 1.7 m, less two radii is 1.02 m, which is fine; the same car 0.8 m further
 * over leaves 0.28 m, which is a wall.  Both look identical in a frame.  After
 * the cut nothing parks on a lane under 3.6 m at all.
 *
 * **5.  Some places have no cars because no car can reach them.**  桜守神社 is
 * up eleven stone steps off a 2 m alley, 湯の坂 is up a flight from the shrine
 * precinct, 夏まつり準備中 is behind both, and 川端の道's own header records
 * that nothing with four wheels can get onto it at all.  So those four have no
 * vehicles, and the cars belonging to the people who live there stand on the
 * main road at the top of the hill, which is exactly where they would.
 * ひばり台一丁目 is the same case for a different reason: its lane is 2.4 m, its
 * houses predate the car, and `ichome.js` deliberately leaves its one marked
 * bay empty with a note saying why.  That note stands.
 *
 * **6.  Fill the parking that was already built.**  Eleven marked bays, three
 * carports, a 月極 park, a coin park, a 送迎 bay and a conbini apron were all
 * standing empty.  Filling those is what makes the town read as inhabited;
 * kerbside parking is the seasoning on top of it, not the dish -- and a bay left
 * empty beside a full one does more work than a second car in it.
 *
 * ------------------------------------------------------------------ *
 * WHAT WAS FOUND ON THE WAY
 *
 * **ひばり駐車場 had trees growing in two of its three bays.**  `shotengai.js`
 * planted a grove at (26.0, 49.4) and `library.js` a street cherry at
 * (24.0, 48.6); both predate the coin park, which moved onto that ground from
 * the shopping street two rounds ago, and neither was moved with it.  The
 * grove's collider is 1.34 m square and sat dead in the middle of bay 2.  Both
 * are now on the planting strip along the park's back wall, where a coin park's
 * trees actually are -- recorded in NEXT.md with the other nudges.
 *
 * **The conbini's own bays are 0.6 m short.**  `approach.js` marks three of
 * them against ひばりマート's frontage and `gakkomae.js` then stood two vending
 * machines and a bin bank on the frontage line, so a car nosed fully in is
 * inside a machine.  Not moved -- the machines are right where they are, and a
 * car stopping a metre short of the wall is what happens.  The one parked there
 * noses to x = -7.0 instead of -7.4.
 *
 * ------------------------------------------------------------------ *
 * FLOODFILL -- these are the squeezes this file could plausibly have sealed,
 * and all of them must still be reachable on foot from the spawn:
 *   spineClinic  [48.2, 20.6]   past the sedan outside ひばり台内科
 *   szMid        [22.6, 22.0]   past the kei truck on さくら坂
 *   szNorth      [22.6, 31.0]   past the wholesaler's van
 *   coinPark     [26.8, 49.5]   the two empty bays beside the one that is used
 *   tsukiAisle   [56.0, 11.6]   the 月極 aisle behind two parked cars
 *   dropBay      [-6.4, -41.4]  the link past the 送迎 bay's minivan
 *   schoolKerb   [5.0, -54.1]   the east road edge past the relocated box lorry
 *   terrApron    [34.8, 60.4]   三丁目's terrace apron past the carport
 *   courtBay     [42.9, 10.5]   公園前's court past the kei in its bay
 *   hallBay      [19.2, 66.6]   the 町内会館's empty first bay
 *   busStop      [1.0, 39.0]    the east footway behind the minibus
 * ------------------------------------------------------------------ */

/* Kerb offsets on the main road.  A car's centre sits `KERB` from the road
 * centreline, which puts a 1.7 m body 0.25 m off the kerb face -- and leaves
 * 4.4 m of the 6.3 m carriageway, which is a road a bus can still get down. */
const KERB = 2.05;
const KERB_BUS = 1.90;                   // the minibus is 2.08 across, so it sits further out

const east = (z, k = KERB) => centerX(z) + k;
const west = (z, k = KERB) => centerX(z) - k;

const P = Math.PI;

/* ------------------------------------------------------------------ *
 * The table.
 *
 * `ry` is where the nose points.  `note` is why the vehicle is there, and it
 * is not decoration: half of these positions are one metre from something that
 * would make them wrong, and the note is what stops the next round moving one.
 * ------------------------------------------------------------------ */
function parked() {
  return [
    /* ---------- 踏切と駅前 -- the crossing, 青空商店 and the lineside ---------- *
     * Two vehicles over forty metres of the busiest street in the world, and
     * three constraints decided both.
     *
     * **The opening frame.**  The player spawns at (1.85, 13.6) looking down the
     * street at yaw 0.2, and the first thing tried was the shop's van on the
     * east kerb at z = 11.6 -- which put a 1.88 m box 0.3 m in front of the
     * camera.  The hero shot of the whole project came out as a flat dark
     * rectangle, and it took a render to see it, because nothing about the
     * placement is wrong except where the camera happens to be.  Both of these
     * are *behind* the spawn or far enough down the street to be scale rather
     * than obstruction.
     *
     * **The signs already on the road.**  `street.js` stands a 駐車禁止 disc on
     * the east footway at z = 22, and the crossing itself is 駐車禁止 for five
     * metres either side by law.  The kei truck `index.js` parks at
     * (-2.02, -7.4) is the closest thing to the gates that there is, and the
     * yellow line further down this file stops just short of it.
     *
     * **Nothing opposite either of them.**  The pair that used to face each
     * other across this road at z = 16-18 made the carriageway read as a slot;
     * and the two that used to sit at z = -18.6 and z = -20.2 were 1.6 m apart
     * with 4.05 m of car each, i.e. driven straight through one another. */
    { tag: 'shopVan', kind: 'keivan', color: CAR.white, x: east(18.4), z: 18.4, ry: P / 2,
      note: '青空商店の配送 -- at the alley mouth, where the shop\'s goods actually go in' },
    { tag: 'crossHatch', kind: 'hatch', color: CAR.cream, x: east(-18.6), z: -18.6, ry: P / 2, skew: -0.02,
      note: 'the east kerb between the crossing and the canal, and the only car on it' },

    /* ---------------------- さくら坂商店街 -- the shops ---------------------- *
     * A 6.0 m corridor with 4.8 m of it clear of clutter, so one vehicle at a
     * kerb leaves 3.0 m -- a street that is trading, not a car park.  Two of
     * them over twenty-six metres, on opposite kerbs but **five metres clear
     * end to end**, so you never see both narrowing the same stretch. */
    { tag: 'szTruck', kind: 'keitruck', color: CAR.slate, load: 'sheet', x: 20.5, z: 22.0, ry: -P / 2,
      note: '軽トラ unloading at the west row, sheeted down' },
    { tag: 'szVan', kind: 'van', color: CAR.pearl, x: 24.1, z: 31.0, ry: P / 2,
      note: 'the wholesaler\'s van against the east row -- 5 m north of the 軽トラ\'s tail' },

    /* -------------- the main road: library, corner, road head -------------- *
     * The library's own visitors park in ひばり駐車場 three metres off its east
     * flank -- which is the reason the coin park was moved next to it in the
     * first place -- so nothing stands on the north lane itself.  It is 3.1 m
     * wide and one car on it leaves 0.65 m, which is a wall. */
    /* **The bus moved.**  ひばり台ふれあい号 stood at 図書館前 because that was
     * the only stop in the world and there was nowhere for it to turn round;
     * ひばり台六丁目 now builds the end of its route, and a 一日四便 service
     * spends most of the day laid over at its terminus rather than halfway
     * along.  So the bus is in the yellow box on the 転回場 and 図書館前 keeps
     * its pole and its timetable -- which is the better of the two frames
     * anyway: a stop with no bus at it says the bus is somewhere else, and now
     * it is somewhere you can walk to.  Recorded in NEXT.md. */
    { tag: 'uraKei', kind: 'kei', color: CAR.forest, x: west(50.6), z: 50.6, ry: -P / 2,
      note: '桜守裏町 is a 2.4 m footpath -- its residents park on the road at its mouth. '
        + 'Eight metres clear of the bus, and nothing on the east kerb opposite it' },

    /* ------------------------ ひばり駐車場, 三丁目 ------------------------ *
     * Bays at x 24.53 / 26.80 / 29.07, nose-in from the lane at the south end,
     * wheel stops at z = 51.1.  **One of three.**  A coin park with every bay
     * taken is a coin park nobody can use, and it was two before -- which put a
     * car on each side of the middle bay and made the one thing the machine at
     * the mouth is for look impossible. */
    { tag: 'coinA', kind: 'hatch', color: CAR.silver, x: 24.53, z: 49.2, ry: -P / 2,
      note: 'ひばり駐車場, bay 1 -- the library\'s visitor parking in practice' },

    /* ------------------------ 月極駐車場, 二丁目 ------------------------ *
     * Four bays under the railway wall at x 53.0 / 55.4 / 57.8 / 60.2, nose-in
     * off the aisle on the north side.  Two of the four, and the two that are
     * used are **not adjacent**: at 2.4 m centres a full row leaves 0.9 m
     * between bodies, which reads as a wall of metal rather than as a car park.
     * Bay 1 stays empty because the vending machine and the 月極 board are at
     * its mouth; one of the two is reversed in, because in any real monthly
     * park one always is. */
    { tag: 'tsukiB', kind: 'hatch', color: CAR.white, x: 55.4, z: 9.1, ry: P / 2,
      note: '月極駐車場, bay 2' },
    { tag: 'tsukiD', kind: 'wagon', color: CAR.navy, x: 60.2, z: 9.2, ry: -P / 2,
      note: 'bay 4, reversed in against the railway wall, with bay 3 empty between them' },

    /* --------------------- 二丁目's spine, and the park --------------------- *
     * The only kerbed through street in the new half, 3.6 m of carriageway with
     * a footway on its east side.  One car against the east kerb leaves 1.75 m
     * of road and the whole footway.  It was two, thirteen metres apart, and on
     * a street this narrow that is a street with cars in it rather than a
     * street somebody has parked on. */
    /* **It moved to the *west* kerb, and its nose turned with it.**  At x = 50.0
     * a 1.7 m body reaches 50.85 against an east kerb line of 51.00, and the
     * footway's guard railing sits on that kerb: 0.15 m is not a parking bay, it
     * is a car with a rail through its flank.  The west kerb is at 47.40 and has
     * no railing on it, so 48.30 leaves 0.90 m at the kerb and 1.85 m of road --
     * and Japan drives on the left, so a car at the *west* kerb of a north-south
     * street noses +z, which is `-P/2`. */
    { tag: 'clinicSedan', kind: 'sedan', color: CAR.silver, x: 48.3, z: 20.6, ry: -P / 2,
      note: 'outside ひばり台内科 -- the one car in the district that is somebody\'s appointment' },

    /* ------------------------------ 公園前 ------------------------------
     * The 私道's marked bay under the overbridge.  `heightAt` answers with the
     * bridge *deck* here -- 4.68 m -- because a platform 7 m up covers the
     * point, so the ground is given explicitly.  Every other entry in this
     * table takes `ctx.groundAt`. */
    { tag: 'courtKei', kind: 'kei', color: CAR.white, x: 41.45, z: 10.5, ry: -P / 2, y: 0.06,
      note: 'the 木造平屋\'s own bay, between its scooter and its bike rack.  White, '
        + 'and it was a dark green first: this bay is under the overbridge and never '
        + 'sees the sun, so a dark body falls back to ambient and reads as a hole in '
        + 'the picture -- the same thing that happens to the grove canopies' },

    /* -------------------------- 四丁目 -- the hall --------------------------
     * One of the two bays, not both.  Centred in their own lines they were
     * 2.1 m apart, which after two 0.7375 m half-widths is 0.62 m of ground
     * between them and after the player's radius is nothing at all -- the trap
     * `CLAUDE.md` records against こばと橋's parapet, at a tenth of the scale.
     * The van alone says what the pair did and leaves the forecourt open, which
     * is what a 町内会館's forecourt is for.
     *
     * Nothing on 四丁目's own lane: it is 3.4 m and a car takes 2.4 m of it. */
    { tag: 'hallVan', kind: 'keivan', color: CAR.silver, x: 21.55, z: 66.3, ry: P / 2, skew: 0.025,
      note: '町内会館, bay 2 -- the association\'s van, which is what a 町内会 owns' },
    { tag: 'carbayKei', kind: 'kei', color: CAR.cream, x: 28.4, z: 74.9, ry: -P / 2,
      note: 'under the north row\'s carport, at the east end of the arm' },

    /* -------------------- 三丁目's 連棟 and its three bays --------------------
     * The apron runs x 34.0..39.2 with the terrace's frontage at 39.2 and the
     * wheel stops at 38.5, so a car noses to 38.9 and no further.  **The middle
     * bay only** -- the one with the carport over it, which is the whole read:
     * one household built a roof and the other two did not, and two of the
     * three are out. */
    { tag: 'terrPort', kind: 'kei', color: CAR.skyblue, x: 36.9, z: 60.4, ry: 0, skew: -0.02,
      note: 'the middle bay, under the carport' },

    /* ------------------ 学校前通り and 五丁目 -- the school run ------------------
     * Three: the minivan and kei use built parking, while the lorry stands at
     * the east kerb south of the gate.  It remains beyond the no-stopping line
     * and leaves the full gate approach and west lane clear. */
    { tag: 'dropMinivan', kind: 'minivan', color: CAR.pearl, x: -5.6, z: -39.4, ry: 0,
      note: '送迎 bay -- pulled in parallel because the bay is 2.6 m deep and a car is 4.3 m long' },
    { tag: 'martLorry', kind: 'boxtruck', color: CAR.white, x: 5.0, z: -55.1, ry: P / 2,
      note: 'the 2 t box lorry pulled onto the east kerb, south of the school gate and its no-stopping line' },
    { tag: 'staffKei', kind: 'kei', color: CAR.tea, x: -26.2, z: -49.65, ry: P,
      note: '五丁目\'s carport, in the 1.8 m between the 二階半 and the detached house' },

    /* ----------------------------- 用水路 -- the canal -----------------------------
     * One, and it is the only vehicle on the road anywhere between the crossing
     * and the school gate.  The banks are 2 m service paths and the towpath is a
     * footway; the quiet is the point of the whole channel. */
    { tag: 'worksTruck', kind: 'keitruck', color: CAR.white, load: 'empty', x: west(-33.6), z: -33.6, ry: -P / 2,
      note: 'ひばり台土地改良区\'s -- the channel gets maintained by somebody, and this is them' },

    /* ------------------------ ひばり台六丁目 -- the turnaround ------------------------
     * Three, and the district is the one place in the town where that many is
     * right: it exists *because* vehicles come here.  Only the bus is on the
     * carriageway, which is the reason the circle is there.
     *
     * The bus noses **west**, out of the box and back down the street, which is
     * how a vehicle laid over at a terminus is always left.  Its front door is
     * at local x 1.72, so at `ry = PI` the door lands at x = 67.48 and the stop
     * pole `rokuchome.js` puts at 67.40 is level with it rather than with the
     * back axle.
     *
     * The two in the 月極 are both 軽, and that is the bays rather than a
     * preference: they are 4.6 m deep with the stop 0.8 m off the head, so a
     * 4.05 m hatch noses to within 0.3 m of the street's kerb line.  A 4.6 m
     * bay in a Japanese estate is a 軽 bay and this one says so.  Bays 1 and 3,
     * with 2 empty between them -- the same reading as 二丁目's 月極. */
    { tag: 'rokuBus', kind: 'minibus', color: CAR.cream, x: 69.20, z: 54.60, ry: P,
      note: 'ひばり台ふれあい号 laid over on the 転回場, in its yellow box -- the end of the '
        + 'route, and the only vehicle that ever stands on the circle' },
    { tag: 'rokuBay1', kind: 'kei', color: CAR.white, x: 55.00, z: 56.75, ry: -P / 2,
      note: '月極 bay 1, nose-in off the street' },
    { tag: 'rokuBay3', kind: 'keitruck', color: CAR.mint, load: 'empty', x: 59.80, z: 56.79, ry: -P / 2,
      note: 'bay 3, with bay 2 empty between them -- a 軽トラ, because a 月極 on the edge of '
        + 'a town has one' },

    /* ---------------- ひばり台七丁目 -- スーパー さかえ and its roof deck ----------------
     * Twelve, which is more than any other district and is the point of the
     * district: a supermarket is where a suburb's cars *are* at four in the
     * afternoon.  It does not break rule 1, because **only one of the twelve is
     * on a carriageway** -- six are on the roof, two in the coin park opposite,
     * one in the yard, one on the service drive and one in a short-stay bay on
     * the store's own apron.
     *
     * The roof is half full and deliberately so.  Twelve marked bays with six
     * cars in them reads as a Tuesday; twelve with twelve in them reads as a
     * sale, and a full car park is also the one arrangement in which you cannot
     * see the bay markings, the wheel stops or the numbers -- which are most of
     * what makes a roof deck read as a roof deck rather than as a flat roof.
     * The おもいやり bay is one of the empty ones, which is what it usually is.
     *
     * The north row noses **+z** into the parapet (`ry = -PI/2`) and the south
     * row noses **-z** (`ry = +PI/2`), so the two rows face each other across
     * the aisle the way bays actually do.  Every z here is derived: nose 0.6 m
     * off the parapet, so the centre is `edge -/+ (0.6 + L/2)` and no two kinds
     * share a number.
     *
     * The deck is at **6.20**, and these are the only vehicles in the world that
     * are not seated on `ctx.groundAt` -- up there it would answer with the
     * apron 5.75 m below, because a platform is only offered to a query that is
     * already within a step of it. */
    { tag: 'nanaDeck3', kind: 'hatch', color: CAR.white, x: -38.90, z: 79.09, ry: -P / 2, y: 6.20,
      note: 'bay 3, north row -- the white compact that half the estate drives' },
    { tag: 'nanaDeck5', kind: 'kei', color: CAR.mint, x: -34.10, z: 79.42, ry: -P / 2, skew: 0.035, y: 6.20,
      note: 'bay 5, a mint 軽トールワゴン parked two degrees out, which is what a 軽 in a '
        + '2.4 m bay looks like' },
    { tag: 'nanaDeck7', kind: 'keivan', color: CAR.pearl, x: -29.30, z: 79.42, ry: -P / 2, y: 6.20,
      note: 'bay 7, the end one by the stair -- somebody\'s trade van doing the weekly shop' },
    /* The south row is numbered 8..12 from the ramp entry eastward, so these two
     * are bays **9 and 11** -- the tags said 8 and 10, which was the numbering
     * of the fourteen-bay draft the deck no longer has.  The x's were always the
     * centres of the bays they actually stand in; only the labels were stale.
     * Bays 8 and 10 are the empty ones, either side of the mustard 軽. */
    { tag: 'nanaDeck9', kind: 'kei', color: CAR.mustard, x: -39.00, z: 68.18, ry: P / 2, skew: -0.028, y: 6.20,
      note: 'bay 9, south row, pale yellow -- the one warm note on a grey deck' },
    { tag: 'nanaDeck11', kind: 'minivan', color: CAR.silver, x: -34.20, z: 68.65, ry: P / 2, y: 6.20,
      note: 'bay 11 -- the school-run minivan, and the largest thing that takes the corner '
        + 'landing without a 切り返し' },
    { tag: 'nanaDeck12', kind: 'wagon', color: CAR.tea, x: -31.80, z: 68.61, ry: P / 2, y: 6.20,
      note: 'bay 12, beige ライトバン, nose to the south parapet and 湯の坂 below it' },

    /* the yard, the drive and the apron */
    { tag: 'nanaLorry', kind: 'boxtruck', color: CAR.white, x: -53.70, z: 74.60, ry: -P / 2,
      note: 'the 2 t lorry in the delivery yard, nose to the gate so it can leave -- the yard\'s '
        + 'pallets, cages and cartons are all laid out round its footprint' },
    { tag: 'nanaService', kind: 'keitruck', color: CAR.skyblue, load: 'crates', x: -53.60, z: 85.40, ry: P / 2,
      note: 'the greengrocer\'s 軽トラ on the service drive, waiting its turn at the dock' },
    { tag: 'nanaShort', kind: 'kei', color: CAR.skyblue, x: -31.20, z: 85.30, ry: P / 2,
      note: 'the middle short-stay bay on the apron.  The other two are empty, and none of the '
        + 'three is across the doors -- 六丁目\'s 弁当屋 paid for that lesson' },
    { tag: 'nanaCoin2', kind: 'hatch', color: CAR.slate, x: -42.25, z: 98.53, ry: -P / 2,
      note: 'the coin park opposite, bay 2' },
    { tag: 'nanaCoin5', kind: 'kei', color: CAR.cream, x: -34.75, z: 98.20, ry: -P / 2, skew: 0.03,
      note: 'bay 5, with three empty between -- the coin park was here before the store was' },
    { tag: 'nanaKerb', kind: 'van', color: CAR.pearl, x: -28.00, z: 93.71, ry: P,
      note: 'the one vehicle on 七丁目通り itself, at the north kerb nosing west (keep left).  '
        + 'East of the coin park\'s mouth, east of the crossing, and with nothing opposite it '
        + 'on the store side -- that whole kerb carries a yellow line' },

    /* -------------------- 県立ひばり台高等学校 and ひばり山 -------------------- *
     * Five, and the brief asked for "適量, not a car park".  The school doubled
     * and the hill-foot road behind it is 89 m long, so the temptation is a row
     * of staff cars down it; what a school actually has at four in the afternoon
     * is two or three in the bays, a van at the store and somebody's 軽トラ at
     * the maintenance yard.
     *
     * Every one is **off the carriageway** -- two in marked bays, one on an
     * apron, one on a gravel yard, one in a turning head -- which keeps the
     * count of vehicles standing on a road at eleven, where it was.  The 裾道
     * itself is left completely clear: it is the only road in the world with a
     * hill on one side and a school wall on the other, and a parked car in the
     * middle of that view would be the only thing in it. */
    { tag: 'schStaff1', kind: 'hatch', color: CAR.pearl, x: 12.60, z: -68.60, ry: P / 2,
      note: '職員駐車場, bay 1 -- nose-in to the west wall off the school\'s own yard' },
    { tag: 'schStaff2', kind: 'kei', color: CAR.forest, x: 17.80, z: -68.60, ry: P / 2, skew: 0.02,
      note: 'bay 3, with bay 2 empty between them.  Two cars in adjacent bays at 2.6 m '
        + 'centres leave 1.1 m to walk between, which is fine -- 町内会館\'s pair at 2.1 m '
        + 'left nothing, and that is the arithmetic this spacing came from' },
    { tag: 'schStoreVan', kind: 'keivan', color: CAR.white, x: 51.20, z: -71.40, ry: P,
      note: 'the 小型面包車 on the 器材倉庫\'s apron, nosing west toward the service gate.  '
        + 'It is here rather than by the gym\'s back door because the store is what actually '
        + 'gets loaded, and it is clear of the 4.2 m gate\'s swept path' },
    /* **Along the yard, not across it.**  At (24.00, -99.00) nose-north it took
     * x 23.33..24.67 / z -100.60..-97.40 and the tool store takes
     * x 21.20..23.80 / z -101.10..-99.30, so 0.47 x 1.30 m of lorry was inside
     * the shed.  Turned to lie along x there is nowhere for it to go *between*
     * the shed and the crates -- that gap is 1.25 m against a 1.34 m body -- so
     * it stands north of both, which is also where a 軽トラ would be left if the
     * store's doors have to open. */
    { tag: 'uraKeiTruck', kind: 'keitruck', color: CAR.slate, load: 'crates', x: 24.00, z: -98.00, ry: P,
      note: 'the maintenance 軽トラ on the yard above the trail head, nose west toward the trail '
        + 'head -- the one vehicle in the district that is *on* the hill, and the reason the yard '
        + 'is gravelled and 5.6 m wide' },
    { tag: 'uraTurn', kind: 'kei', color: CAR.skyblue, x: 88.60, z: -63.40, ry: 0,
      note: 'in the turning head at the top of the school\'s outer road, nose to the hedge.  '
        + 'Somebody came up to the school and turned round; it is 25 m from the nearest '
        + 'other vehicle and nothing faces it' },

    /* --------------------------- ひばり湖 ---------------------------
     * **Seven, and not one of them on the carriageway.**
     *
     * The brief for the lake asks for K-cars, a minivan, a delivery van, a
     * management truck and a camp service vehicle, and then says "不要让湖区变成
     * 停车场" -- which is the same instruction this file already follows for the
     * whole world: kerbside vehicles are the expensive ones visually, one in a
     * frame is life and two is congestion.  So every one of these stands on
     * parking a module marked out: three in the cafe's bays, two in the
     * campsite's, one in the dam's management yard, one on the layby at the top
     * of the climb.  The 湖畔道路 itself is 4.0 m of mountain road with a 10 %
     * grade and blind bends, and a car parked on it would be the only thing in
     * the frame from the 見晴台.
     *
     * They are also the *reason* the district reads as inhabited on a Tuesday: a
     * cafe with three cars outside it is open, and a boat station with none is
     * shut, which is exactly right for April at four in the afternoon.
     */
    { tag: 'cafeK', kind: 'kei', color: CAR.white, x: 176.00, z: -153.00, ry: -P / 2,
      note: '喫茶 みなも, bay 1 -- nose-in to the head line off the shore road.  '
        + 'The bays run along x at 4.0 m centres, so a 1.48 m kei leaves 2.5 m to '
        + 'the next one and the walk between them is real' },
    { tag: 'cafeVan', kind: 'minivan', color: CAR.silver, x: 180.00, z: -153.00, ry: -P / 2, skew: 0.02,
      note: 'bay 2, the school-run car.  Silver and white are three quarters of any '
        + 'Japanese car park and this pair says so' },
    { tag: 'cafeDeliv', kind: 'van', color: CAR.cream, x: 184.00, z: -152.80, ry: -P / 2,
      note: 'bay 3 -- the delivery van, nosed in nearest the cafe\'s back door.  '
        + 'It is the only commercial vehicle at the lake and it is at the one '
        + 'building that takes a delivery' },
    { tag: 'campService', kind: 'keivan', color: CAR.tea, x: 207.00, z: -151.40, ry: 0,
      note: 'the campsite\'s own 軽バン on the gravel at the turning head, nose east.  '
        + 'A site with six pitches has one vehicle and it is a 軽バン' },
    { tag: 'campVisitor', kind: 'kei', color: CAR.skyblue, x: 211.00, z: -151.40, ry: 0,
      note: 'and one visitor beside it, 4 m along -- three tents are up, so somebody '
        + 'drove here' },
    { tag: 'damTruck', kind: 'keitruck', color: CAR.white, load: 'crates', x: 148.40, z: -29.60, ry: 0,
      note: 'ひばり湖 土地改良区\'s 軽トラ in the management yard below the embankment, '
        + 'nose east toward the gate.  The same body the canal\'s 土地改良区 truck has, '
        + 'because it is the same organisation four hundred metres upstream' },
    { tag: 'lakeLayby', kind: 'hatch', color: CAR.mint, x: 152.40, z: -32.40, ry: P / 2,
      note: 'the layby at the top of the climb, where the water first comes into view.  '
        + 'Nose north off the road, 6.5 m from the truck in the yard and facing away '
        + 'from it -- no two vehicles in this world face each other across a road' },
  ];
}

/* Scooters.  Not `parkVehicle` -- a 0.55 x 1.75 machine on its side stand is
 * something you walk round, not something you are stopped by, and giving each
 * one a collider would put thirty of them across footways two metres wide.
 * `streetprops.js` already parks four this way and none of them collides. */
function scooters() {
  return [
    { x: 13.8, z: 5.6, ry: 0, color: 0xc9d4dc, seed: 9601,
      note: 'the vending corner behind 青空商店' },
    { x: 24.75, z: 20.5, ry: P / 2, color: 0xb8c0c8, seed: 9602, lift: 0.13,
      note: 'against the east row\'s shutters on さくら坂, south of the wholesaler\'s van' },
    { x: 3.4, z: 46.9, ry: P / 2, color: 0x9fb0a4, seed: 9603,
      note: 'the corner triangle, by the phone box' },
    { x: -19.6, z: -56.5, ry: P / 2, color: 0xc4b49a, seed: 9604,
      note: 'outside ひばり輪業, which is where a scooter would be' },
    { x: -24.2, z: -35.8, ry: P / 2, color: 0xa8b4c0, seed: 9605,
      note: 'グリーンハイツ\'s frontage strip, clear of the block\'s meter cabinet' },
    { x: -11.2, z: 55.0, ry: P / 2, color: 0xcbbfa6, seed: 9606,
      note: '桜守裏町 -- the one machine that can get down a 2.3 m lane' },
    { x: 12.2, z: 68.2, ry: 0, color: 0xb0bec6, seed: 9607,
      note: 'the hall\'s forecourt, beside the porch' },
    { x: -4.0, z: 20.5, ry: -P / 2, color: 0xc2cdd4, seed: 9608, sink: 0.02,
      note: 'the west footway on the main road, at a front gate' },
    /* Two at the lake, and they are the right vehicle for it: a 4 m mountain road
     * with a 10 % grade is what a scooter is *for*, and one leaning outside a cafe
     * says somebody rode up here rather than drove. */
    { x: 172.4, z: -147.6, ry: 0, color: 0xbfc9b4, seed: 9617,
      note: '喫茶 みなも -- against the plinth at the west end of the terrace steps' },
    { x: 139.2, z: -68.4, ry: -P / 2, color: 0xc8bca8, seed: 9618,
      note: 'ひばり湖畔公園 -- on the plaza\'s gravel edge by the guide board' },
    { x: 62.55, z: 60.20, ry: P / 2, color: 0xbfc9ce, seed: 9609,
      note: '第二 さくら荘\'s forecourt, against its west gable and clear of the mailbox bank' },
    { x: 53.35, z: 62.30, ry: P / 2, color: 0xcbbfa6, seed: 9610,
      note: 'コーポ ひがし\'s west flank on 北の道 -- the one machine that lives on that lane' },
    { x: -48.40, z: 86.40, ry: P / 2, color: 0xb4bec4, seed: 9611,
      note: 'スーパー さかえ\'s apron at its quiet west end, beside the bike rack and well clear '
        + 'of the ramp mouth -- a supermarket always has two or three of these' },
    { x: -47.55, z: 86.75, ry: P / 2 - 0.14, color: 0xc9bfa2, seed: 9612,
      note: 'the second one beside it, a shade out of line' },
  ];
}

/* ------------------------------------------------------------------ *
 * The check that should have existed from the first line of this file.
 *
 * Every position in the table was probed against `world.colliders` before it
 * was written down, and that is worth exactly nothing for the vehicles in the
 * *same* table: none of them is a collider until the sweep runs, so a car can
 * be tested clear and still be parked inside its neighbour.  Two hatchbacks on
 * the east kerb below the school were 1.6 m apart with 4.05 m of body each and
 * survived a whole round of screenshots that way, because from every angle one
 * of them hides the join.
 *
 * Pairwise, in dev, on every load.  Eighteen entries is 153 comparisons.
 * ------------------------------------------------------------------ */
function auditOverlaps(list) {
  const bb = (v) => {
    const s = vehicleSize(v.kind);
    const ry = (v.ry ?? 0) + (v.skew ?? 0);
    const c = Math.abs(Math.cos(ry)), si = Math.abs(Math.sin(ry));
    const hw = (c * s.L + si * s.W) / 2, hd = (si * s.L + c * s.W) / 2;
    return { tag: v.tag, x0: v.x - hw, x1: v.x + hw, z0: v.z - hd, z1: v.z + hd };
  };
  const B = list.map(bb);
  for (let i = 0; i < B.length; i++) {
    for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (ox > 0 && oz > 0) {
        console.warn(`traffic.js: ${a.tag} and ${b.tag} overlap by `
          + `${ox.toFixed(2)} x ${oz.toFixed(2)} m`);
      }
    }
  }
}

/* ------------------------------------------------------------------ */

export function buildTraffic(ctx) {
  const petals = [];
  const marks = [];
  if (import.meta.env?.DEV) auditOverlaps(parked());

  /* ------------------------------ the vehicles ------------------------------ */
  parked().forEach((v, i) => {
    const y = v.y !== undefined ? v.y : ctx.groundAt(v.x, v.z);
    parkVehicle(ctx, { ...v, y });
    /* Two faint bands under each one, so a bay that has been used looks used.
     *
     * A vehicle at `ry` noses along `(cos ry, -sin ry)`, so the track pair is
     * offset along the perpendicular `(sin ry, cos ry)` -- and a `PlaneGeometry`
     * scaled in its own z needs `ry + PI/2` to lie *along* the vehicle rather
     * than across it.  Derived rather than guessed, for the same reason every
     * raked panel in `vehicles.js` is. */
    const a = (v.ry ?? 0) + (v.skew ?? 0);
    for (const s of [-1, 1]) {
      marks.push({
        x: v.x + s * 0.62 * Math.sin(a),
        z: v.z + s * 0.62 * Math.cos(a),
        y, ry: a + P / 2, w: 0.24, d: 3.2,
      });
    }
  });
  for (const s of scooters()) {
    ctx.add(makeScooter({ ...s, y: ctx.groundAt(s.x, s.z) + (s.lift ?? 0) - (s.sink ?? 0) }));
  }
  tyreMarks(ctx, marks, { opacity: 0.10 });

  /* --------------------------- 駐停車禁止 -- yellow lines ---------------------------
   * The one piece of road marking that had to go in with the cars, because it
   * is the answer to "why is nothing parked *there*".  Solid single yellow at
   * the kerb is 駐停車禁止 in Japan, and it goes exactly where this world needs
   * a car not to be: the two approaches to the level crossing, and the school
   * gate's own frontage.
   *
   * Drawn at the kerb face rather than on the line itself, and `centerX` is
   * constant over both stretches, so a straight box is the right primitive --
   * anything that had to follow the road's drift would want `makeStrip`. */
  {
    const yellow = flat({ color: PAL.lineYellow });
    /* The crossing: five metres either side, which is the actual rule.  The
     * north run is the full five; the south one stops at z = -5.6 because the
     * kei truck stands from -5.74, and a no-waiting line running down the
     * flank of a parked truck says the opposite of what it is for. */
    kerbLine(ctx, { axis: 'z', at: ROAD_HALF - 0.25, from: 3.4, to: 8.6, y: groundY(6.5) + 0.01, mat: yellow });
    kerbLine(ctx, { axis: 'z', at: -(ROAD_HALF - 0.25), from: -3.4, to: -5.6, y: groundY(-5) + 0.01, mat: yellow });
    // the school gate: 6.4 m of the east kerb, where the painted crossing is
    kerbLine(ctx, {
      axis: 'z', at: centerX(-49.5) + ROAD_HALF - 0.25, from: -52.4, to: -46.0,
      y: groundY(-49.5) + 0.01, mat: yellow,
    });
  }

  /* -------------------------------- 徐行 --------------------------------
   * Two of them on the school road, one facing each way, between the drop-off
   * bay and the gate.  `roadPaint` gained the marking with this round; it is
   * drawn transparent and out of the depth buffer like the 止まれ and the
   * crossing diamonds, or the ink pass speckles the letters. */
  for (const [z, ry] of [[-45.0, 0], [-55.5, P]]) {
    const g = new THREE.PlaneGeometry(1.25, 2.4);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, flat({
      color: 0xffffff, map: roadPaint('slow'), transparent: true, depthWrite: false, cache: false,
    }));
    m.position.set(centerX(z) + (ry ? -1.55 : 1.55), groundY(z) + 0.022, z);
    m.rotation.y = ry;
    m.userData.noOutline = true;
    m.renderOrder = 1;
    ctx.add(m);
  }

  /* ------------------------------ the bus stop ------------------------------
   * On the east footway at the minibus's front door.  The bus is 6.3 m long
   * and its doors are at local x 1.72, which after `ry = PI/2` puts the front
   * one at z = 37.78 -- so the post goes at 37.6 and not at the bus's centre.
   * A stop pole standing level with a bus's back axle is the kind of detail
   * that is wrong in a way nobody can name.
   *
   * **No collider**, and that is a decision rather than an oversight: the post
   * is 0.11 m across on a 1.55 m footway, and the player's radius on each side
   * of *any* collider is 0.68 m -- so a box round it leaves 0.44 m of pavement,
   * which is a wall.  `street.js`'s utility poles do exactly that and the
   * footway is sealed at each of them; this round is not going to add another
   * one for a post you would walk round. */
  {
    const z = 37.6;
    const x = centerX(z) + ROAD_HALF + 0.55;
    ctx.add(makeBusStop({ x, z, y: ctx.groundAt(x, z), ry: -P / 2, h: 2.45 }));
  }

  /* The school's own service bay went with the van that stood in it.  It was
   * the only marking in this file laid on ground that was not already marked
   * out, and a painted box inside the school wall with nothing in it is a
   * question rather than a detail. */

  /* --------------------------- delineators and cones ---------------------------
   * 視線誘導標: the plastic wands on the edge of a lane too narrow for two
   * things to pass.  **No collider on any of them** -- they are frangible, they
   * are 60 mm across, and thirty of them with the player's radius added would
   * be thirty 0.75 m obstructions on footways that are 2 m wide.  The cones by
   * the box lorry are `makeCone`, which is the same decision made two rounds
   * ago for the same reason. */
  for (const [x, z, lean] of [
    [34.15, 56.4, 0.05], [34.15, 63.6, -0.04],     // 三丁目's terrace apron, either end
    [47.55, 30.2, 0.03], [47.55, 31.8, -0.05],     // the mouth of 二丁目's 私道
    [4.35, 58.6, 0.04],                            // 四丁目's lane, at the T
  ]) {
    ctx.add(makeDelineator({ x, z, y: ctx.groundAt(x, z), lean }));
  }
  ctx.add(makeCone({ x: -3.0, z: -41.6, y: ctx.groundAt(-3.0, -41.6), ry: 0.3 }));
  ctx.add(makeCone({ x: -3.0, z: -46.8, y: ctx.groundAt(-3.0, -46.8), ry: -0.5, tilt: 0.05 }));

  /* ------------------------------ ground marking ------------------------------
   * A second white line at the 送迎 bay's mouth so it reads as a box a car
   * pulls *into* rather than as a patch of asphalt, now that there is a car in
   * it lying across the two wheel stops. */
  laneLine(ctx, { axis: 'x', at: -37.95, from: -7.7, to: -2.7, y: ctx.groundAt(-5.2, -37.95) + 0.02 });

  /* Fallen blossom collects against a kerb and under anything that has not
   * moved for a while, which is exactly what a parked car is. */
  petals.push({ x: 20.5, z: 22.0, w: 2.2, d: 4.2, y: ctx.groundAt(20.5, 22.0) + 0.02, n: 34 });
  petals.push({ x: 24.53, z: 49.2, w: 2.2, d: 4.4, y: ctx.groundAt(24.53, 49.2) + 0.02, n: 30 });
  petals.push({ x: 36.9, z: 60.4, w: 4.0, d: 2.4, y: ctx.groundAt(36.9, 60.4) + 0.02, n: 26 });
  petals.push({ x: west(50.6), z: 50.6, w: 2.2, d: 4.6, y: ctx.groundAt(west(50.6), 50.6) + 0.02, n: 30 });

  return { petals };
}
