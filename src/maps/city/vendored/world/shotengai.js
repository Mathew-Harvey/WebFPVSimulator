import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { shopFascia, warningPlate, sentoFuji, showaInterior } from '../core/textures.js';
import { dressShowa } from './showa.js';
import { box, cyl, bake, trs, sagCurve } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, lane, laneLine, groundMats } from './ground.js';
import {
  makeShop, makePaperLantern, makeMenuBoard, makeFreezer, makeGachapon,
  makeProduceStack, makeShopFlag,
} from './shops.js';
import { addVending } from './vending.js';
import {
  makeBikeRack, makeBench, makePlanter, makeCrates, makeBins, makeUmbrellaStand,
  makeVendBin, makeAircon, makeSignPost, makeMilkCrate, makeLoosePaper, makeCatBox,
  makeLaundryPole, makeBroom, makeBucket,
} from './props.js';

/* ------------------------------------------------------------------ *
 * さくら坂商店街 -- the shopping street.
 *
 * The street runs north from a 2.4 m alley off the main road, which is the
 * whole trick: you cannot see it from the crossing, and you arrive in it
 * rather than at it.  Six metres wide, shops hard up against both kerbs,
 * lanterns strung across overhead.
 *
 * Everything about the tenants is the same construction (see `shops.js`) --
 * a shopping street reads as a street because its units are built the same
 * and differ only in colour, sign, awning and clutter.  The variety is all
 * in what is on the pavement outside.
 *
 * Nobody is here.  What says the street is working is a half-lowered
 * shutter, a menu board still out, crates stacked and squared off, a
 * freezer running, lanterns already lit against an afternoon that is
 * getting on.
 * ------------------------------------------------------------------ */

/* the corridor */
const X0 = 19.2;               // west kerb line
const X1 = 25.2;               // east kerb line
const CX = (X0 + X1) / 2;
const Z_S = 16.3;              // south end, where the alley arrives
const Z_N = 42.6;              // north end
const ALLEY_Z = 15.1;

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.drain = cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 });
  M.red = cel({ color: PAL.red, bands: 3, tint: 0x7a4060 });
  return M;
}

export function buildShotengai(ctx) {
  const m = mats();
  const gm = groundMats();
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  /* Every lantern on the street goes through here so it can be switched on
   * later.  `along` is roughly how far up the walk it stands -- the alley
   * first, then the strung wires south to north, the bathhouse bracket last --
   * and it is what staggers the ramp at the bottom of this file. */
  const lanterns = [];
  const lantern = (o, along) => {
    const g = makePaperLantern({ ...o, lit: false, ctx });
    lanterns.push({ mat: g.userData.glow, along, at: 0 });
    return g;
  };

  /* --------------------------------- surfaces --------------------------------- */
  lane(ctx, {
    axis: 'z', at: CX, from: Z_S - 0.6, to: Z_N, w: X1 - X0,
    mat: gm.asphaltWorn, kerb: false, rise: 0.05, name: 'shotengaiRoad',
  });
  // pavement strips either side, a hand's width above the carriageway
  for (const s of [-1, 1]) {
    lane(ctx, {
      axis: 'z', at: CX + s * ((X1 - X0) / 2 - 0.55), from: Z_S - 0.6, to: Z_N, w: 1.1,
      mat: gm.concrete, kerb: false, rise: 0.13, name: 'shotengaiWalk',
    });
  }
  // the alley in from the main street
  pad(ctx, {
    x: (4.9 + X0) / 2, z: ALLEY_Z, w: X0 - 4.9, d: 2.4,
    y: groundY(ALLEY_Z), h: 0.1, mat: gm.concrete, name: 'shotengaiAlley',
  });
  // and the return lane to the main street at the north end
  const NORTH_Z = 45.2;
  pad(ctx, {
    x: (1.9 + 40.0) / 2, z: NORTH_Z, w: 38.1, d: 3.4,
    y: groundY(NORTH_Z), h: 0.09, mat: gm.asphaltWorn, name: 'shotengaiNorthLane',
  });
  laneLine(ctx, { axis: 'x', at: NORTH_Z, from: 4.0, to: 38.0, y: groundY(NORTH_Z) + 0.11, dash: 1.1 });
  pad(ctx, {
    x: CX, z: (Z_N + NORTH_Z) / 2, w: X1 - X0 + 1.4, d: NORTH_Z - Z_N + 1.8,
    y: groundY(Z_N), h: 0.08, mat: gm.asphaltWorn, name: 'shotengaiJunction',
  });

  /* ------------------------ central drainage channel ------------------------ *
   * A shopping street this narrow has no camber and no gutters: it has a
   * slotted channel down the middle, and that dark line is what stops six
   * metres of pale asphalt reading as a blank corridor. */
  {
    const parts = [];
    const n = Math.round((Z_N - Z_S) / 0.9);
    for (let i = 0; i < n; i++) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.34, 0.04, 0.72),
        matrix: trs(CX, groundY(Z_S + (i + 0.5) * ((Z_N - Z_S) / n)) + 0.055, Z_S + (i + 0.5) * ((Z_N - Z_S) / n)),
      });
    }
    const ch = new THREE.Mesh(bake(parts), m.drain);
    ch.receiveShadow = true;
    ctx.add(ch);
  }

  /* --------------------------------- the arch --------------------------------- *
   * A gate over the alley mouth, so the street announces itself from the main
   * road without being visible from it. */
  {
    const y = groundY(ALLEY_Z);
    const AW = 3.6, AH = 3.9;
    for (const s of [-1, 1]) {
      const p = cyl(0.13, 0.16, AH, 8, m.metal, 5.6, y + AH / 2, ALLEY_Z + s * (AW / 2));
      p.castShadow = true;
      ctx.add(p);
      ctx.add(cyl(0.22, 0.26, 0.2, 8, m.concreteMid, 5.6, y + 0.1, ALLEY_Z + s * (AW / 2)));
      ctx.collide(5.44, ALLEY_Z + s * (AW / 2) - 0.18, 5.76, ALLEY_Z + s * (AW / 2) + 0.18, y + AH);
    }
    const art = shopFascia('wagashi');
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.95, AW + 0.5),
      // the same map both ways; see the note on the 富士 board below
      [flat({ color: 0xffffff, map: art, cache: false }),
       flat({ color: 0xffffff, map: art, cache: false }),
       flat({ color: PAL.wallWhite }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallWhite }), flat({ color: PAL.wallWhite })]
    );
    board.position.set(5.6, y + AH - 0.3, ALLEY_Z);
    board.castShadow = true;
    ctx.add(board);
    hullOutline(board, { thickness: 0.0034 });
    ctx.add(box(0.3, 0.12, AW + 0.7, m.metalDark, 5.6, y + AH + 0.22, ALLEY_Z));
    // a lantern hung under the arch at each end
    for (const s of [-1, 1]) {
      ctx.add(lantern({ x: 5.6, y: y + AH - 0.95, z: ALLEY_Z + s * (AW / 2 - 0.5), variant: 1, r: 0.17, drop: 0.26 }, 0));
    }
  }

  /* ------------------------------ the alley walls ------------------------------ *
   * The alley's north side is the side wall of the house at (9.4, 20.4), whose
   * south face stands at z = 16.5; dressing it is what turns a gap between
   * buildings into a place.
   *
   * Both outdoor units are on that wall.  They used to be one on each side at
   * ALLEY_Z +/- 1.05, which is 0.75 m short of the render on the north and, on
   * the south, in mid-air: the alley is only enclosed to the north, and the
   * next wall southwards is the shop flank at z = 12.6, a metre and a third
   * away.  So one of them hung over the paving with nothing behind it and the
   * other stood 0.2 m proud of the wall it was supposed to be bolted to.  Two
   * units on one wall is what a house with two rooms has anyway. */
  {
    const y = groundY(ALLEY_Z);
    const NW = 16.5;                 // the render they hang on
    const AC_Z = NW - (0.15 + 0.09); // back face, minus the bracket standoff
    ctx.add(makeAircon({ x: 8.4, z: AC_Z, y: y + 1.6, ry: Math.PI, w: 0.8, h: 0.56, feet: false }));
    ctx.add(makeAircon({ x: 11.3, z: AC_Z, y: y + 2.05, ry: Math.PI, w: 0.74, h: 0.52, feet: false }));
    ctx.add(makePlanter({ x: 7.4, z: ALLEY_Z - 0.9, y, r: 0.24, flower: true, seed: 61, n: 5 }));
    ctx.add(makePlanter({ x: 8.1, z: ALLEY_Z - 0.95, y, r: 0.2, flower: false, seed: 62, n: 4 }));
    ctx.add(makeCrates({ x: 10.4, z: ALLEY_Z + 0.85, y, n: 3, seed: 63, ry: 0.15 }));
    ctx.add(makeCatBox({ x: 13.9, z: ALLEY_Z + 0.9, y, ry: -0.5 }));
    ctx.add(makeBins({ x: 16.4, z: ALLEY_Z - 0.85, y, ry: 0.1 }));
    makeLoosePaper(ctx, [
      { x: 11.6, z: ALLEY_Z - 0.6, y: y + 0.1, ry: 0.9 },
      { x: 15.1, z: ALLEY_Z + 0.5, y: y + 0.1, ry: -0.4 },
    ]);
    // a string of lanterns down the alley
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const x = 7.0 + i * 2.6;
      ctx.add(lantern({ x, y: y + 2.85, z: ALLEY_Z, variant: 0, r: 0.15, drop: 0.22 }, 0.5 + i * 0.4));
      runs.push(new THREE.Vector3(x, y + 3.1, ALLEY_Z));
    }
    const wire = new THREE.Mesh(
      new THREE.TubeGeometry(sagCurve(runs[0], runs[runs.length - 1], 0.35, 16), 18, 0.016, 4, false),
      cel({ color: 0x4c4658, bands: 2, tint: 0x413c58 })
    );
    ctx.add(wire);
  }

  /* ------------------------------------------------------------------ *
   * The tenants.
   * ------------------------------------------------------------------ */
  const WD = 4.6;                 // west row depth
  const ED = 5.6;                 // east row depth
  const wx = X0 - WD / 2;         // 16.9
  const ex = X1 + ED / 2;         // 28.0

  const WEST = [
    { kind: 'hana', z0: 16.6, z1: 22.2, wall: 3, roof: 3, awning: 0, floors: 2, interior: 2, blade: false, lit: true },
    { kind: 'kosho', z0: 22.4, z1: 27.2, wall: 1, roof: 2, awning: 3, floors: 2, interior: 2, blade: 'kosho', shutter: 0, signBox: true },
    { kind: 'cleaning', z0: 27.4, z1: 31.8, wall: 2, roof: 1, awning: 2, floors: 1, interior: 2, blade: false, shutter: 0.34, signBox: true },
    /* そうざい ひなた -- the 弁当 counter.  The street's only other food you can
     * carry away is the ramen, and the brief lists a convenience store among
     * the tenants; the one that exists is up on the 通学路, which is a
     * different errand.  Three metres of frontage, taken off the south end of
     * the coin parking, which is what a counter like this actually occupies. */
    { kind: 'sozai', z0: 32.0, z1: 35.0, wall: 4, roof: 0, awning: 3, floors: 1, interior: 0, blade: false, noren: false },
    /* The two Showa units, on the six metres the coin parking used to hold.
     *
     * Narrow -- 3.1 m of frontage each against 4.4-5.6 for everything else on
     * this street -- because that is what an owner-occupied shop from before the
     * war measures, and because two narrow units where there was one wide gap is
     * what makes the row read as having been built over decades.  Their fascias
     * are deliberately *not* lit boxes: a faded painted sign between そうざい's
     * teal and the junction is the whole point, and the light box each one does
     * get is the small vertical one at head height (`showa.js`). */
    { kind: 'denki', z0: 35.2, z1: 38.3, wall: 7, roof: 1, awning: false, floors: 2, interiorKind: 1, blade: 'denki', shutter: 0 },
    { kind: 'record', z0: 38.5, z1: 41.6, wall: 6, roof: 2, awning: 4, floors: 2, interiorKind: 0, blade: 'record', noren: 'record', posters: false },
  ];
  const EAST = [
    { kind: 'ramen', z0: 16.8, z1: 22.4, wall: 1, roof: 0, awning: 4, floors: 2, interior: 1, blade: 'ramen', noren: 'ramen', lit: true, posterLimit: 1 },
    { kind: 'wagashi', z0: 22.6, z1: 27.4, wall: 5, roof: 2, awning: 1, floors: 1, interior: 2, blade: false, noren: 'wagashi' },
    { kind: 'bunbo', z0: 30.2, z1: 34.8, wall: 0, roof: 3, awning: 1, floors: 2, interior: 2, blade: 'bunbo', lit: true, balcony: true, signBox: true },
  ];

  for (const u of WEST) {
    const zc = (u.z0 + u.z1) / 2;
    makeShop(ctx, {
      x: wx, z: zc, y: groundY(zc), w: u.z1 - u.z0, d: WD, face: 'x+',
      kind: u.kind, floors: u.floors, wall: u.wall, roof: u.roof,
      roofKind: u.floors === 2 ? 'flat' : 'gable', awning: u.awning, awningOut: 1.4,
      blade: u.blade, bladeSide: -1, noren: u.noren, shutter: u.shutter,
      interior: u.interior, lit: u.lit, balcony: u.balcony, signBox: u.signBox,
      posters: u.posters,
      interiorMap: u.interiorKind === undefined ? undefined : showaInterior(u.interiorKind),
      openW: (u.z1 - u.z0) - 1.4, seed: 100 + u.z0,
    });
  }
  for (const u of EAST) {
    const zc = (u.z0 + u.z1) / 2;
    makeShop(ctx, {
      x: ex, z: zc, y: groundY(zc), w: u.z1 - u.z0, d: ED, face: 'x-',
      kind: u.kind, floors: u.floors, wall: u.wall, roof: u.roof,
      roofKind: u.floors === 2 ? 'flat' : 'gable', awning: u.awning, awningOut: 1.5,
      blade: u.blade, bladeSide: 1, noren: u.noren, shutter: u.shutter,
      interior: u.interior, lit: u.lit, balcony: u.balcony, signBox: u.signBox,
      posterLimit: u.posterLimit,
      openW: (u.z1 - u.z0) - 1.4, seed: 200 + u.z0,
    });
  }

  /* -------------------------- the lane out to the park -------------------------- */
  pad(ctx, {
    x: (X1 + 31.8) / 2, z: 28.8, w: 31.8 - X1, d: 2.6,
    y: groundY(28.8), h: 0.1, mat: gm.concrete, name: 'parkLane',
  });

  /* ------------------------------------------------------------------ *
   * 松の湯 -- the bathhouse.  A gabled hall behind a shopfront, with the
   * chimney that makes it unmistakable from three streets away.
   * ------------------------------------------------------------------ */
  {
    const z0 = 35.4, z1 = 43.4;
    const zc = (z0 + z1) / 2;
    const d = 8.4;
    const bx = X1 + d / 2;
    const y = groundY(zc);
    makeShop(ctx, {
      x: bx, z: zc, y, w: z1 - z0, d, face: 'x-',
      kind: 'sento', floors: 1, h1: 4.4, wall: 0, roof: 0, roofKind: 'gable', roofH: 2.3,
      interior: 3, openW: 4.6, awning: false, blade: false, noren: 'sento', posters: false,
      seed: 301, recess: 1.1, fascia: false,
    });

    /* --------------------------- the 富士 board ---------------------------
     * The generic fascia sits 0.44 m above the storey head, and on a 4.4 m
     * storey under a gable that oversails the frontage by 0.42 m that puts it
     * inside the eave -- so 松の湯 carried no name at all on the street and
     * nothing said what the building was except the chimney.  It gets the
     * board a sento actually has instead, on the 1.9 m of blank wall between
     * the shopfront head and the eave, which is where the reference puts it.
     *
     * One map, both faces.  `BoxGeometry` reverses `udir` on the negative face
     * of each axis, so ±x both read correctly from the same texture -- the
     * `mirrored()` clone that used to sit on one of them is precisely what made
     * 松の湯 read backwards from one side. */
    {
      const BW = 4.9, BH = 1.6;
      const byf = y + 3.6;
      const art = sentoFuji();
      const frame = box(0.1, BH + 0.18, BW + 0.18, m.metalDark, X1 - 0.05, byf, zc);
      frame.castShadow = true;
      ctx.add(frame);
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, BH, BW),
        [flat({ color: 0xffffff, map: art, cache: false }),
         flat({ color: 0xffffff, map: art, cache: false }),
         flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
         flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
      );
      board.position.set(X1 - 0.11, byf, zc);
      board.castShadow = true;
      ctx.add(board);
      hullOutline(board, { thickness: 0.0032 });
      // and the two bracket lamps that light it after dark
      for (const s of [-1, 1]) {
        ctx.add(box(0.26, 0.09, 0.5, m.metalDark, X1 - 0.2, byf + BH / 2 + 0.2, zc + s * 1.5));
      }
    }

    /* ------------------------ the 下足箱 in the recess ------------------------
     * The recess is 1.1 m deep, which is enough to show the one thing every
     * sento entrance has: a bank of wooden shoe lockers, a step up out of the
     * street, and the curtained doorways past them.  The doorways are on the
     * interior plate (`shopInterior` variant 3); everything in front of it is
     * real, because at this depth a painted locker would read as wallpaper.
     *
     * The unit was authored facing +Z and rotated, so this all has to be laid
     * out in world axes: the frontage line is x = X1 and the recess runs east
     * from it, with the interior plate at x = X1 + 1.07. */
    {
      const fx = X1;                       // frontage
      const lockerMat = cel({ color: 0xb99a72, bands: 3, tint: 0x6f5680 });
      // the step, overlapping the recess floor rather than meeting it
      const step = box(0.44, 0.16, 4.4, cel({ color: 0xd8cdb8, bands: 3, tint: 0x6a6288 }),
        fx + 0.84, y + 0.14, zc);
      step.castShadow = step.receiveShadow = true;
      ctx.add(step);
      ctx.add(box(0.06, 0.2, 4.4, m.wood, fx + 0.63, y + 0.12, zc));

      const bodies = [];
      const trim = [];
      for (let i = 0; i < 3; i++) {
        const lz = zc - 1.85 + i * 0.62;
        bodies.push({ geometry: new THREE.BoxGeometry(0.34, 1.62, 0.58), matrix: trs(fx + 0.86, y + 1.03, lz) });
        for (let r = 0; r < 4; r++) {
          // the door lip of each tier, and the key tag hanging off it
          trim.push({ geometry: new THREE.BoxGeometry(0.04, 0.035, 0.52), matrix: trs(fx + 0.69, y + 0.46 + r * 0.39, lz) });
          trim.push({ geometry: new THREE.BoxGeometry(0.03, 0.1, 0.05), matrix: trs(fx + 0.69, y + 0.4 + r * 0.39, lz + 0.19) });
        }
      }
      const lm = new THREE.Mesh(bake(bodies), lockerMat);
      lm.castShadow = lm.receiveShadow = true;
      ctx.add(lm);
      ctx.add(new THREE.Mesh(bake(trim), cel({ color: 0x8a6f52, bands: 2, tint: 0x5c5680 })));

      // the mat inside the door, and one pair of sandals left out of line
      const mat0 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.5),
        cel({ color: 0x6e6a78, bands: 2, tint: 0x545070 }));
      mat0.rotation.set(-Math.PI / 2, 0, 0);
      mat0.position.set(fx + 0.34, y + 0.11, zc + 0.5);
      ctx.add(mat0);
      for (const [dz, rot] of [[0.0, 0.22], [0.17, -0.1]]) {
        const sole = box(0.24, 0.03, 0.1, cel({ color: 0x4f6f86, bands: 2, tint: 0x545070 }),
          fx + 0.4, y + 0.185, zc + 1.5 + dz);
        sole.rotation.y = rot;
        ctx.add(sole);
      }
      /* No collider: the shop's own footprint already starts 50 mm west of the
       * frontage line, so the recess is not somewhere the player can stand. */
    }

    // the chimney: brick-red, tall, with a cap
    const chx = bx + 2.6, chz = z0 + 1.6;
    const stack = cyl(0.42, 0.5, 9.0, 10, cel({ color: 0xb08272, bands: 3, tint: 0x6f5680 }), chx, y + 4.5, chz);
    stack.castShadow = stack.receiveShadow = true;
    ctx.add(stack);
    hullOutline(stack, { thickness: 0.0034 });
    ctx.add(cyl(0.6, 0.6, 0.3, 10, m.concreteMid, chx, y + 9.1, chz));
    for (let i = 0; i < 3; i++) {
      ctx.add(cyl(0.53, 0.53, 0.14, 10, cel({ color: 0x9c7268, bands: 3, tint: 0x6f5680 }), chx, y + 2.2 + i * 2.4, chz));
    }
    ctx.collide(chx - 0.55, chz - 0.55, chx + 0.55, chz + 0.55, y + 9.2);

    // shoe lockers and a milk box beside the entrance, and the bath's own kit
    ctx.add(makeMilkCrate({ x: X1 + 0.8, z: zc + 2.6, y, n: 2, ry: -Math.PI / 2 }));
    ctx.add(makeUmbrellaStand({ x: X1 + 0.7, z: zc - 2.5, y, n: 4, seed: 302 }));
    ctx.add(makeBench({ x: X1 + 0.9, z: zc + 3.4, y, ry: -Math.PI / 2, len: 1.4, back: false }));
    /* Out on the road and wholly clear of the raised east footway. The rack's
     * old centre at X1 - 1.15 straddled its 0.08 m kerb, while `groundAt` missed
     * this longitudinal lane surface and buried the tyres another 0.05 m. */
    ctx.add(makeBikeRack({
      x: X1 - 2.05, z: zc - 3.6, y: groundY(zc - 3.6) + 0.08,
      n: 4, spacing: 0.66, ry: 0, seed: 22,
    }));
    // a 「ゆ」 lantern on a bracket
    ctx.add(lantern({ x: X1 + 0.5, y: y + 3.1, z: zc + 0.1, variant: 2, r: 0.24, drop: 0.3 }, 30));
    ctx.add(box(0.7, 0.06, 0.06, m.metalDark, X1 + 0.85, y + 3.4, zc + 0.1));
  }

  /* ------------------------------------------------------------------ *
   * The two Showa units took the coin parking's six metres.
   *
   * ひばり駐車場 used to stand here -- z 35.2 to 41.4, three bays, put in
   * because "a gap in a shopping street needs a reason".  The reason is better
   * supplied by two forty-year-old shops than by a car park, and this was the
   * only spare frontage on either row; the parking is rebuilt at full size on
   * the north block, off the lane beside the library, which is a far more
   * sensible place for it than the middle of a shopping street.  See
   * `northblock.js` and `showa.js`.
   * ------------------------------------------------------------------ */
  dressShowa(ctx, {
    x: X0,
    denki: { z0: 35.2, z1: 38.3 },
    record: { z0: 38.5, z1: 41.6 },
  });

  /* ------------------------------------------------------------------ *
   * Overhead: lanterns strung across the street, and the cable clutter a
   * Japanese shopping street lives under.
   * ------------------------------------------------------------------ */
  {
    const wireMat = cel({ color: 0x4c4658, bands: 2, tint: 0x413c58 });
    /* Two lanterns per wire, seven wires.  Three per wire read as a ceiling
     * rather than a canopy, and the lanterns are the most saturated thing on
     * the street -- they have to stay an accent. */
    const geos = [];
    for (let i = 0; i < 7; i++) {
      const z = Z_S + 2.2 + i * 3.7;
      const y = groundY(z) + 4.4;
      const a = new THREE.Vector3(X0 - 0.2, y, z);
      const b = new THREE.Vector3(X1 + 0.2, y, z);
      geos.push(new THREE.TubeGeometry(sagCurve(a, b, 0.5, 10), 12, 0.015, 4, false));
      for (const t of [0.32, 0.68]) {
        const lx = X0 - 0.2 + (X1 - X0 + 0.4) * t;
        const ly = y - Math.sin(Math.PI * t) * 0.5 * Math.min(1.6, (X1 - X0) / 14);
        ctx.add(lantern({
          x: lx, y: ly, z, variant: i % 2, r: 0.155, drop: 0.3,
        }, 3 + i));
      }
    }
    // a longitudinal pair of cables, and drops into the shops
    for (const s of [-1, 1]) {
      const x = CX + s * ((X1 - X0) / 2 - 0.15);
      const pts = [];
      for (let z = Z_S; z <= Z_N; z += 4.0) pts.push(new THREE.Vector3(x, groundY(z) + 5.1, z));
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.02, 4, false));
    }
    const merged = bake(geos.map((geometry) => ({ geometry })));
    const mesh = new THREE.Mesh(merged, wireMat);
    mesh.name = 'shotengaiWires';
    ctx.add(mesh);
    geos.forEach((g) => g.dispose());
  }

  /* ------------------------------------------------------------------ *
   * The pavement.  This is where the street actually lives.
   * ------------------------------------------------------------------ */
  {
    const wEdge = X0 + 0.15;      // just off the west shopfronts
    const eEdge = X1 - 0.15;
    const g0 = (z) => groundY(z) + 0.13;

    // 花の店: buckets of cut flowers and a trestle of pots
    ctx.add(makeProduceStack({ x: wEdge + 0.5, z: 17.6, y: g0(17.6), ry: Math.PI / 2, seed: 401 }));
    for (let i = 0; i < 4; i++) {
      ctx.add(makePlanter({
        x: wEdge + 0.42, z: 19.2 + i * 0.62, y: g0(19.2), r: 0.24, flower: true, seed: 410 + i, n: 5,
      }));
    }
    ctx.add(makeShopFlag({ ctx, x: wEdge + 0.5, z: 21.6, y: g0(21.6), variant: 1, ry: -Math.PI / 2 }));

    // 古本: crates of books out front, and a bicycle against the shutter guide
    ctx.add(makeCrates({ x: wEdge + 0.5, z: 23.2, y: g0(23.2), n: 3, seed: 402, ry: -0.3 }));
    ctx.add(makeCrates({ x: wEdge + 0.5, z: 24.0, y: g0(24.0), n: 2, seed: 403, ry: 0.2 }));
    /* 1.05 off the shopfront, not 0.55: the bikes nose *in* to the shutter, so
     * what has to clear the render is half a wheelbase, not half a handlebar. */
    ctx.add(makeBikeRack({ x: wEdge + 1.05, z: 26.2, y: g0(26.2), n: 3, spacing: 0.64, ry: Math.PI, seed: 31 }));

    // クリーニング: the shutter is half down, so its kit is squared away
    ctx.add(makeBins({ x: wEdge + 0.5, z: 30.6, y: g0(30.6), ry: -Math.PI / 2 }));
    ctx.add(makeUmbrellaStand({ x: wEdge + 0.45, z: 28.2, y: g0(28.2), n: 3, seed: 404 }));

    /* The tools by the doors.
     *
     * Sweeping the frontage is the first thing done and the last, and a broom
     * stood against the pier says the shop is worked in more cheaply than any
     * amount of stock in the window.  Deliberately not three matching pairs:
     * the laundry gets the full kit, the ramen counter a broom on its own, the
     * wagashi door a bucket somebody has not brought back in.
     *
     * `roll` leans them into the wall, so it flips sign between the two rows:
     * a positive roll tips the handle toward -x, which is into the west row's
     * frontage and out of the east row's. */
    ctx.add(makeBroom({ x: wEdge + 0.3, z: 27.8, y: g0(27.8), tilt: 0.03, roll: 0.17, ry: 1.2 }));
    ctx.add(makeBucket({ x: wEdge + 0.34, z: 27.35, y: g0(27.35), ry: 0.5 }));
    ctx.add(makeBucket({ x: wEdge + 0.5, z: 27.1, y: g0(27.1), ry: -0.8, tilt: 0.1, roll: 0.06 }));
    ctx.add(makeBroom({ x: eEdge - 0.28, z: 22.2, y: g0(22.2), tilt: -0.04, roll: -0.17, ry: -1.4 }));
    ctx.add(makeBucket({ x: eEdge - 0.36, z: 24.95, y: g0(24.95), ry: 1.1, water: true }));

    /* The east row's frontage looks west, so everything stood outside it faces
     * -x.  Getting this backwards leaves a shopfront addressing its own wall,
     * and a gachapon bank showing the street three blank coloured panels. */
    ctx.add(makeMenuBoard({ x: eEdge - 0.55, z: 18.0, y: g0(18.0), ry: -Math.PI / 2 - 0.25 }));
    ctx.add(makeCrates({ x: eEdge - 0.5, z: 21.4, y: g0(21.4), n: 4, seed: 405, ry: 0.25 }));
    ctx.add(makeShopFlag({ ctx, x: eEdge - 0.5, z: 16.9, y: g0(16.9), variant: 3, ry: -Math.PI / 2 }));

    // 和菓子: a freezer and a bench, the two things that make a shop inviting
    ctx.add(makeFreezer({ x: eEdge - 0.6, z: 23.6, y: g0(23.6), ry: -Math.PI / 2 }));
    ctx.collide(eEdge - 1.0, 23.0, eEdge - 0.2, 24.2, g0(23.6) + 0.9);
    ctx.add(makeBench({ x: eEdge - 0.55, z: 26.2, y: g0(26.2), ry: -Math.PI / 2, len: 1.5, back: false }));

    // 文具とゲーム: three gachapon machines, the loudest thing on the street
    ctx.add(makeGachapon({ x: eEdge - 0.5, z: 31.4, y: g0(31.4), ry: -Math.PI / 2, n: 3 }));
    ctx.collide(eEdge - 0.85, 30.7, eEdge - 0.15, 32.1, g0(31.4) + 1.5);
    ctx.add(makeShopFlag({ ctx, x: eEdge - 0.5, z: 33.6, y: g0(33.6), variant: 2, ry: -Math.PI / 2 }));

    /* Machines on the *west* side, in front of the laundry.  They were on the
     * east side at z 28 and 29.3, which is exactly where the lane out to the
     * children's park leaves the street -- two vending machines parked across
     * the only way through. */
    addVending(ctx, { x: wEdge + 0.62, z: 29.2, y: g0(29.2), ry: Math.PI / 2, variant: 0, seed: 21 });
    addVending(ctx, { x: wEdge + 0.62, z: 30.5, y: g0(30.5), ry: Math.PI / 2, variant: 2, seed: 22 });
    ctx.add(makeVendBin({ x: wEdge + 0.6, z: 31.4, y: g0(31.4), ry: Math.PI / 2, color: PAL.bin }));

    // そうざい: a crate of empties and the flag that says what it sells
    ctx.add(makeShopFlag({ ctx, x: wEdge + 0.5, z: 32.7, y: g0(32.7), variant: 3, ry: -Math.PI / 2 }));
    ctx.add(makeCrates({ x: wEdge + 0.48, z: 34.4, y: g0(34.4), n: 3, seed: 407, ry: -0.18 }));

    // and the wind's work: paper against the kerbs
    makeLoosePaper(ctx, [
      { x: X0 + 0.7, z: 25.2, y: g0(25.2), ry: 0.5 },
      { x: X1 - 0.8, z: 34.2, y: g0(34.2), ry: -0.9 },
      { x: CX + 1.2, z: 37.0, y: groundY(37) + 0.06, ry: 1.3 },
    ]);
    // laundry over the flat-roofed unit above 文具
    ctx.add(makeLaundryPole({ ctx, x: 27.4, z: 34.2, y: groundY(34.2) + 3.3, ry: 0, len: 2.2, n: 3, seed: 406 }));
  }

  /* ------------------------ the wall that closes the street ------------------------
   * Looking south the street ends on the blank north gable of the house on
   * the corner, and a two-storey blank cream field is a hole in the picture.
   * It gets what such a wall always gets: an advertising panel, a downpipe,
   * a meter, a machine and somebody's bicycle. */
  {
    const zw = 14.05;      // the gable face
    const y = groundY(zw);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 2.6, 0.12),
      [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: 0xffffff, map: shopFascia('kosho'), cache: false }),
       flat({ color: PAL.wallGray })]
    );
    board.position.set(20.6, y + 3.3, zw + 0.06);
    board.castShadow = true;
    ctx.add(board);
    hullOutline(board, { thickness: 0.003 });
    ctx.add(box(0.06, 0.06, 0.4, m.metalDark, 20.6, y + 4.7, zw + 0.18));

    for (const dx of [19.6, 23.4]) {
      ctx.add(cyl(0.055, 0.055, 5.2, 6, m.metal, dx, y + 2.6, zw + 0.1));
      for (let i = 0; i < 4; i++) {
        ctx.add(box(0.11, 0.06, 0.11, m.metalDark, dx, y + 0.8 + i * 1.2, zw + 0.14));
      }
    }
    // back face on the gable at z = 13.9 (`zw` is the dressing plane 0.15 in
    // front of it), less the bracket standoff
    ctx.add(makeAircon({ x: 22.6, z: zw + 0.09, y: y + 2.2, ry: 0, w: 0.86, h: 0.6, feet: false }));
    // 0.95 rather than 0.7: a bike is 1.75 m long and stands across the row, so
    // at 0.7 the nearest one had its front wheel through the gable
    ctx.add(makeBikeRack({ x: 23.0, z: zw + 0.95, y, n: 3, spacing: 0.62, ry: 0, seed: 41 }));
    addVending(ctx, { x: 19.9, z: zw + 0.5, y, ry: 0, variant: 1, seed: 33 });
    ctx.add(makeVendBin({ x: 20.85, z: zw + 0.5, y, ry: 0 }));
  }

  /* ------------------------ the lanterns coming on ------------------------ *
   * Everything else in this world is either still or on a loop; this is the
   * one thing that happens once.  Nobody is here to throw the switch, so it
   * has to read as somebody doing it shop by shop -- which means the stagger,
   * not the fade, is the whole effect.  Sorted by how far up the walk each
   * one hangs, so it travels in from the alley and finishes on the bathhouse
   * bracket at the far end.
   *
   * A colour ramp is all that is needed because `flat()` is unlit: there is
   * no brightness to raise, only a warm tint to arrive at, and stepping it up
   * out of a cool dead grey is what reads as switching on.
   *
   * The end state is written once by a trailing snap rather than relied on to
   * fall out of the last frame -- the same reason `audio.js` does it, because
   * whatever drives `update` is not guaranteed to tick at the end. */
  {
    const OFF = new THREE.Color(0xb2abbb);
    const ON = new THREE.Color(PAL.lanternLit);
    const HOLD = 18;             // before the first one
    const SPREAD = 72;           // over which the rest follow
    const FADE = 1.7;            // one lantern coming up
    lanterns.sort((a, b) => a.along - b.along);
    const span = Math.max(1, lanterns.length - 1);
    lanterns.forEach((l, i) => {
      l.at = HOLD + (SPREAD * i) / span;
      l.mat.color.copy(OFF);
    });
    let t = 0;
    let done = false;
    ctx.update((dt) => {
      if (done) return;
      t += dt;
      if (t >= HOLD + SPREAD + FADE) {
        for (const l of lanterns) l.mat.color.copy(ON);
        done = true;
        return;
      }
      for (const l of lanterns) {
        const k = Math.min(1, Math.max(0, (t - l.at) / FADE));
        l.mat.color.lerpColors(OFF, ON, k * k * (3 - 2 * k));
      }
    });
  }

  /* ------------------------------ planting ------------------------------ */
  /* **`Z_N - 1.6` and not `Z_N + 1.4`.**  The junction pad reaches z = 46.1 and
   * the north lane's paving z = 46.9, so a trunk at 44.0 stood in the middle of
   * a 3.4 m carriageway with the lane's own centre line running under it.  Moved
   * to the corner *outside* the junction: its collider is z 40.71..41.29 against
   * paving that starts at 41.7, which is where a street tree on a corner is. */
  sakura.push({ x: CX - 1.4, z: Z_N - 1.6, y: groundY(Z_N - 1.6), scale: 1.24, seed: 901, lean: 0.12, leanDir: 3.4 });
  sakura.push({ x: 20.4, z: NORTH_Z + 3.2, y: groundY(NORTH_Z + 3.2), scale: 1.18, seed: 902, lean: 0.1, leanDir: 1.6 });
  sakura.push({ x: 31.4, z: NORTH_Z + 2.6, y: groundY(NORTH_Z + 2.6), scale: 1.28, seed: 903, lean: 0.09, leanDir: 4.9 });
  sakura.push({ x: 12.6, z: NORTH_Z + 2.8, y: groundY(NORTH_Z + 2.8), scale: 1.14, seed: 904, lean: 0.11, leanDir: 2.7 });
  /* Slid west from x = 15.2 out of the library's forecourt: at scale 1.8 this is
   * the biggest canopy on the north lane and it stood dead in front of the new
   * entrance bay.  It does more good where it is now, closing the gap between
   * the corner and the library's west flank. */
  grove.push({ x: 7.8, z: 51.4, y: groundY(51.4), scale: 1.8, seed: 906, spread: 1.2 });
  /* Slid north out of ひばり駐車場, from (26.0, 49.4).  At scale 1.65 it
   * collides over x 25.33..26.67 / z 48.73..50.07, which is the middle of the
   * car park's second bay -- it has been standing in it since the day the
   * parking was relocated here off the shopping street, and nobody noticed
   * because there was never a car in the bay to be blocked by it.  The two
   * metres between the park's back line (z = 52.0) and ひばり台コーポ (z = 54.0)
   * is where a coin park's planting strip actually is, so it shades the bays
   * instead of occupying one.  Moved with the motor vehicles. */
  grove.push({ x: 28.2, z: 53.1, y: groundY(53.1), scale: 1.65, seed: 907, spread: 1.15 });
  shrubs.push({ x: 14.2, z: 43.6, y: groundY(43.6), r: 0.5, count: 4, spread: 1.5, seed: 908 });
  shrubs.push({ x: 33.4, z: 41.0, y: groundY(41), r: 0.55, count: 4, spread: 1.6, seed: 909 });

  petals.push({ x: CX, z: 22.0, w: 5.6, d: 10.0, y: groundY(22), n: 110 });
  petals.push({ x: CX, z: 34.0, w: 5.6, d: 10.0, y: groundY(34), n: 100 });
  petals.push({ x: 12.0, z: ALLEY_Z, w: 12.0, d: 2.2, y: groundY(ALLEY_Z) + 0.1, n: 60 });

  return { sakura, shrubs, grove, petals, corridor: { x0: X0, x1: X1, z0: Z_S, z1: Z_N }, northZ: NORTH_Z };
}
