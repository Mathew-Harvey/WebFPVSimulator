import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  poster, gomiPlate, warningPlate, meterBox, paperSheet,
  corkBoard as corkBoardArt,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { groundY } from './street.js';
import { pad, lane, wallRun, groundMats } from './ground.js';
import { makeBikeShelter } from './housing.js';
import {
  makeBicycle, makeCrates, makeBins, makeAircon, makeSignPost,
  makePlanter, makeLaundryPole, makeBucket, makeCatBox, makeLoosePaper, makeBroom,
  makeUmbrellaStand, makeTapPost, makeStorageShed, makePotShelf, makeIvy,
  makeDoormat, makeDeliveryBox, makePetBowl, makeRecycleBox,
} from './props.js';

/* ------------------------------------------------------------------ *
 * The back streets.
 *
 * Every district in this world has been a *front*: a frontage, a forecourt, a
 * pavement, something to look at.  What it has never had is the other half of a
 * Japanese suburb -- the 1.8 to 3 metre gaps behind the frontages where the
 * extract fans, the shared tap, the tin store, the drying pole and somebody's
 * dead bicycle actually live.  Those spaces are half the pleasure of walking a
 * real Japanese neighbourhood and none of them had been built.
 *
 * Two of them, deliberately different widths, because a district where every
 * alley is the same width has one alley repeated:
 *
 *   さくら坂裏路地   2.1 m for eighteen metres behind the shopping street's west
 *                    row, widening to 3.4 m at the north end where it passes the
 *                    back of the shops.  Enclosed on both sides the whole way:
 *                    house backs to the west, shop backs to the east.  You can
 *                    get a bicycle down it and not much else.
 *   駅裏の小径       2.6 m on the far side of the tracks, from the canal's south
 *                    bank straight to the station platform steps.  This one
 *                    exists for a *reason* beyond atmosphere: the steps could
 *                    only be reached by a forty-metre dogleg behind the houses,
 *                    which is exactly what `NEXT.md` had flagged.
 *
 * The one rule both obey: nothing stands in the middle.  Everything is against
 * a wall, because an alley this narrow with a prop in the middle of it is not an
 * alley, it is a corridor with an obstacle -- and at eye height in a 2 m
 * passage it has to be checked from *both* directions.
 * ------------------------------------------------------------------ */

/* さくら坂裏路地 */
const A1 = { x: 13.5, w: 2.1, z0: 15.9, z1: 33.8 };      // the narrow stretch
const A2 = { x: 12.7, w: 3.4, z0: 33.4, z1: 43.9 };      // the widening
const SHOP_BACK = 14.6;                                  // the west shop row's rear wall

/* 駅裏の小径 */
const B = { x: 15.1, w: 2.6, z0: -19.5, z1: -5.8 };

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.drain = cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  return M;
}

export function buildAlleys(ctx) {
  const shrubs = [];
  const petals = [];
  buildShopBackAlley(ctx, shrubs, petals);
  buildStationAlley(ctx, shrubs, petals);
  return { shrubs, petals };
}

/* ------------------------------------------------------------------ *
 * さくら坂裏路地.
 * ------------------------------------------------------------------ */

function buildShopBackAlley(ctx, shrubs, petals) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(8801);

  /* --------------------------------- surfaces --------------------------------- *
   * Two runs, because the alley is not one width: 2.1 m where it squeezes between
   * the housing and the shop backs, 3.4 m at the north end where the plots run
   * out.  `lane` sweeps with the street's own slope, which matters here -- the
   * ground climbs 0.36 m over the twenty-eight metres and a flat slab would
   * stand a hand's width proud of it at the top. */
  lane(ctx, {
    axis: 'z', at: A1.x, from: A1.z0, to: A1.z1, w: A1.w,
    mat: gm.concrete, kerb: false, rise: 0.05, name: 'backAlley',
  });
  lane(ctx, {
    axis: 'z', at: A2.x, from: A2.z0, to: A2.z1, w: A2.w,
    mat: gm.concrete, kerb: false, rise: 0.05, name: 'backAlleyWide',
  });
  /* Both `lane(axis:'z')` runs skip the platform registration, so the height
   * query answers with the street's own graded surface -- which is what the
   * 50 mm slab is laid on and therefore already right. */

  /* the slotted channel down the west side, the covers, and the patches */
  {
    const parts = [];
    for (let z = A1.z0 + 0.5; z < A2.z1; z += 0.9) {
      const wide = z > A2.z0;
      const cx = (wide ? A2.x - A2.w / 2 : A1.x - A1.w / 2) + 0.22;
      parts.push({
        geometry: new THREE.BoxGeometry(0.28, 0.04, 0.7),
        matrix: trs(cx, groundY(z) + 0.055, z),
      });
    }
    const ch = new THREE.Mesh(bake(parts), m.drain);
    ch.receiveShadow = true;
    ctx.add(ch);
    for (const z of [19.4, 28.6, 38.2]) {
      const wide = z > A2.z0;
      const cx = wide ? A2.x + 0.6 : A1.x + 0.4;
      const mh = cyl(0.28, 0.28, 0.04, 12, cel({ color: PAL.metalDark, bands: 3 }), cx, groundY(z) + 0.065, z);
      mh.receiveShadow = true;
      ctx.add(mh);
    }
    for (const [pz, pw, pd] of [[22.6, 1.2, 1.5], [31.4, 1.0, 1.2], [40.8, 1.6, 1.8]]) {
      const wide = pz > A2.z0;
      const p = box(pw, 0.02, pd, gm.asphaltWorn, (wide ? A2.x : A1.x) + 0.15, groundY(pz) + 0.062, pz);
      p.receiveShadow = true;
      p.userData.noOutline = true;
      ctx.add(p);
    }
  }

  /* ----------------------------- the shop backs ----------------------------- *
   * The east wall of the alley is the rear of five shopfronts, and a shop's back
   * is nothing like its front: a service door, a gas meter, a pipe stack, an
   * extract fan, a spot lamp and whatever will not fit inside.  This is the
   * single biggest thing that makes the alley read as *behind* somewhere. */
  {
    const xw = SHOP_BACK - 0.02;
    const parts = { metal: [], metalDark: [], dark: [], wood: [] };
    const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
    for (const [zc, kind] of [[19.0, 'door'], [24.6, 'fan'], [29.4, 'door'], [34.6, 'fan'], [39.8, 'door']]) {
      const y = groundY(zc);
      if (kind === 'door') {
        push('wood', new THREE.BoxGeometry(0.08, 1.98, 0.86), trs(xw, y + 1.0, zc));
        push('metal', new THREE.BoxGeometry(0.12, 2.12, 1.0), trs(xw + 0.05, y + 1.02, zc));
        push('metalDark', new THREE.BoxGeometry(0.06, 0.06, 0.24), trs(xw - 0.06, y + 1.0, zc - 0.32));
        // the concrete step out of it, and a light over it
        push('metal', new THREE.BoxGeometry(0.36, 0.06, 0.6), trs(xw - 0.2, y + 2.28, zc));
        push('dark', new THREE.BoxGeometry(0.18, 0.14, 0.18), trs(xw - 0.16, y + 2.18, zc));
      } else {
        push('metal', new THREE.CylinderGeometry(0.19, 0.19, 0.14, 12), trs(xw - 0.06, y + 2.3, zc, 0, 0, Math.PI / 2));
        push('dark', new THREE.CylinderGeometry(0.15, 0.15, 0.06, 12), trs(xw - 0.14, y + 2.3, zc, 0, 0, Math.PI / 2));
        push('metal', new THREE.BoxGeometry(0.1, 0.44, 0.34), trs(xw, y + 1.5, zc));
      }
      // the pipe stack and its branches, on every bay
      push('metal', new THREE.CylinderGeometry(0.055, 0.055, 3.2, 6), trs(xw - 0.08, y + 1.6, zc + 1.6));
      for (let i = 0; i < 3; i++) {
        push('metalDark', new THREE.BoxGeometry(0.1, 0.05, 0.1), trs(xw - 0.08, y + 0.7 + i * 1.0, zc + 1.6));
      }
    }
    // the gas meters, in a run at the height they always are
    for (const zc of [21.4, 27.2, 32.8, 37.6]) {
      const y = groundY(zc);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.3),
        flat({ color: 0xffffff, map: meterBox(), cache: false }));
      plate.position.set(xw - 0.05, y + 1.62, zc);
      ctx.add(plate);
      push('metal', new THREE.BoxGeometry(0.2, 0.36, 0.26), trs(xw - 0.08, y + 0.78, zc + 0.5));
      push('metalDark', new THREE.BoxGeometry(0.24, 0.05, 0.3), trs(xw - 0.08, y + 0.98, zc + 0.5));
    }
    const matFor = {
      metal: m.metal, metalDark: m.metalDark, wood: m.wood,
      dark: cel({ color: PAL.blackSoft, bands: 2, tint: 0x4b4560 }),
    };
    for (const key of Object.keys(parts)) {
      if (!parts[key].length) continue;
      const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
      mesh.castShadow = mesh.receiveShadow = true;
      ctx.add(mesh);
    }
    // two posters nobody took down, at the height they get pasted
    for (const [zc, v] of [[23.2, 0], [36.4, 2]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.52),
        flat({ color: 0xffffff, map: poster(v), cache: false }));
      p.position.set(xw - 0.06, groundY(zc) + 1.66, zc);
      p.rotation.y = -Math.PI / 2;
      p.rotation.z = rng.range(-0.03, 0.03);
      p.userData.noOutline = true;
      ctx.add(p);
    }
    // the outdoor units, on brackets off the wall
    for (const [zc, w0] of [[20.2, 0.86], [26.0, 0.78], [31.8, 0.9], [41.0, 0.82]]) {
      ctx.add(makeAircon({
        x: xw - 0.24, z: zc, y: groundY(zc) + (zc > 30 ? 0.34 : 1.5),
        ry: -Math.PI / 2, w: w0, h: 0.58, feet: zc > 30,
      }));
    }
  }

  /* ------------------------------- the west side ------------------------------- *
   * The backs of three houses, so the boundary is a low block wall with a
   * service gate in it -- and where the plots run out at the north end, the
   * wall gives way to a tin store and the drying ground behind the last house. */
  {
    const wx = A1.x - A1.w / 2 - 0.02;
    wallRun(ctx, {
      axis: 'z', at: wx, from: A1.z0 + 0.6, to: 24.0, y: groundY(19), h: 1.55, t: 0.2, panel: 2.4,
      mat: m.concreteMid,
    });
    wallRun(ctx, {
      axis: 'z', at: wx, from: 25.4, to: 33.2, y: groundY(29), h: 1.55, t: 0.2, panel: 2.4,
      mat: m.concreteMid,
    });
    // the gate in the gap, and the ivy over the run beside it
    for (const s of [-1, 1]) {
      const p = box(0.16, 1.7, 0.16, m.concreteMid, wx, groundY(24.7) + 0.85, 24.7 + s * 0.7);
      p.castShadow = true;
      ctx.add(p);
    }
    ctx.add(box(0.06, 1.36, 1.3, m.metal, wx + 0.02, groundY(24.7) + 0.72, 24.7));
    ctx.add(makeIvy({ x: wx, z: 21.0, y: groundY(21), ry: Math.PI / 2, len: 3.6, top: 1.66, drop: 0.9, seed: 8811, face: 1 }));
    ctx.add(makeIvy({ x: wx, z: 30.4, y: groundY(30), ry: Math.PI / 2, len: 3.0, top: 1.66, drop: 0.8, seed: 8812, face: 1 }));
  }

  /* ------------------------- what the alley is actually for -------------------------
   * All of it against one wall or the other.  Read the list as a walk from the
   * shopping street's alley mouth northwards. */
  {
    const wx = A1.x - A1.w / 2 + 0.35;      // just off the west wall
    const ex = SHOP_BACK - 0.45;            // just off the shop backs
    const y = (z) => groundY(z) + 0.05;

    /* The 掲示板, bolted flat to the west wall rather than standing on posts.
     *
     * A freestanding board went in here first, at the mouth, and its collider was
     * 1.4 m wide in a 2.1 m alley -- so with the player's own radius it sealed
     * the only way in and the flood fill found the whole alley unreachable.  A
     * board on a wall is what a passage this narrow actually gets, it needs no
     * collider at all because the wall already has one, and it cannot be walked
     * into.  Exactly the trap the warning plate on the canal link fell into. */
    {
      const bw = A1.x - A1.w / 2 - 0.01;
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.8, 1.5),
        [flat({ color: 0xffffff, map: corkBoardArt(), cache: false }),
         flat({ color: 0x7d6348 }), flat({ color: 0x8a6f52 }), flat({ color: 0x7d6348 }),
         flat({ color: 0x7d6348 }), flat({ color: 0x7d6348 })]
      );
      /* Centred at 1.05 rather than 1.3: the wall behind it is 1.55 m to the top
       * of its cap, and at 1.3 the board's head and its rain hood both stood
       * proud of the wall and read as a plank balanced on top of it. */
      board.position.set(bw + 0.04, y(17.4) + 1.05, 17.4);
      board.castShadow = true;
      ctx.add(board);
      const hood = box(0.3, 0.05, 1.66, m.wood, bw + 0.14, y(17.4) + 1.5, 17.4);
      hood.rotation.z = -0.16;
      hood.castShadow = true;
      ctx.add(hood);
      for (const [dz, art, h0] of [[-0.44, poster(1), 0.5], [0.06, paperSheet(), 0.42], [0.52, poster(3), 0.46]]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(h0 * 0.72, h0),
          flat({ color: 0xffffff, map: art, cache: false }));
        p.position.set(bw + 0.08, y(17.4) + 1.05 + (dz === 0.06 ? 0.04 : 0), 17.4 + dz);
        p.rotation.y = Math.PI / 2;
        p.rotation.z = rng.range(-0.03, 0.03);
        p.userData.noOutline = true;
        ctx.add(p);
      }
    }

    // the shared tap and its bucket, on the west wall
    ctx.add(makeTapPost({ x: wx, z: 18.6, y: y(18.6), ry: Math.PI / 2 }));
    ctx.add(makeBucket({ x: wx + 0.1, z: 19.2, y: y(19.2), ry: 0.4 }));
    ctx.add(makeBucket({ x: wx + 0.02, z: 19.6, y: y(19.6), ry: -0.9, tilt: 0.12, roll: 0.08 }));

    /* Somebody's bicycle, left long enough to have a flat tyre.
     *
     * Both of these lie *along* the alley.  They were at ry ~ 0 and ry ~ PI,
     * which points the wheelbase straight across a 2.1 m passage: at 0.16 m off
     * the render, 0.86 m of bicycle was inside the wall it was leaning on and
     * the rest of it blocked the alley.  A bike propped against a wall is
     * parallel to it, standing off by half a handlebar, leaning into it -- so
     * the lean is negative on both sides, because `lean` tips the top toward
     * the bike's own +z and that is the alley for one of them and the wall for
     * the other only if the yaws disagree. */
    ctx.add(makeBicycle({ x: wx + 0.15, z: 21.8, y: y(21.8), ry: Math.PI / 2 + 0.06, lean: -0.16, color: 0x8f6fb5 }));
    ctx.add(makeBicycle({ x: ex + 0.1, z: 25.4, y: y(25.4), ry: -Math.PI / 2 + 0.1, lean: -0.14, color: 0x6a7f6a }));

    // the crates the shops stack out here, and the recycling
    ctx.add(makeCrates({ x: ex, z: 23.6, y: y(23.6), n: 4, seed: 8821, ry: -1.5 }));
    ctx.add(makeCrates({ x: ex + 0.1, z: 28.2, y: y(28.2), n: 3, seed: 8822, ry: -1.6 }));
    ctx.add(makeRecycleBox({ x: ex - 0.1, z: 30.4, y: y(30.4), ry: -Math.PI / 2, color: 0x6f8f6a }));
    // `ex` is already the wall-side centreline; subtracting another 0.7 m
    // left the refuse row in the alley instead of tucked against the shops.
    ctx.add(makeBins({ x: ex, z: 33.0, y: y(33.0), ry: -Math.PI / 2 }));
    ctx.add(makeSignPost({
      x: ex - 0.2, z: 34.4, y: y(34.4), ry: -Math.PI / 2, h: 1.5, postMat: m.metal,
      plates: [{ map: gomiPlate(), w: 0.42, h: 0.32, y: 1.24 }],
    }));

    // the pot shelf and the plants that always end up in an alley
    ctx.add(makePotShelf({ x: wx + 0.05, z: 27.4, y: y(27.4), ry: Math.PI / 2, w: 1.2, n: 6, seed: 8823 }));
    ctx.add(makePlanter({ x: wx, z: 29.0, y: y(29.0), r: 0.25, flower: true, seed: 8824, n: 5 }));
    ctx.add(makePlanter({ x: wx - 0.05, z: 29.6, y: y(29.6), r: 0.2, flower: false, seed: 8825, n: 4 }));
    ctx.add(makePetBowl({ x: wx + 0.1, z: 31.4, y: y(31.4), ry: 0.5 }));
    ctx.add(makeCatBox({ x: wx + 0.2, z: 32.4, y: y(32.4), ry: 1.2 }));

    // and a bit of paper the wind put against the wall
    makeLoosePaper(ctx, [
      { x: wx + 0.2, z: 24.2, y: y(24.2) + 0.01, ry: 0.7 },
      { x: ex - 0.4, z: 31.0, y: y(31.0) + 0.01, ry: -1.1 },
      { x: A2.x, z: 37.4, y: y(37.4) + 0.01, ry: 0.3 },
    ]);
  }

  /* ---------------------- the widening: the drying ground ---------------------- *
   * Where the plots run out the alley opens to 3.4 m, and what fills it is the
   * one thing a Japanese back street always has and this world did not: a place
   * to hang washing, with a tin store beside it and a bicycle shelter over the
   * end.  It is also the alley's *destination* -- a 2 m passage needs somewhere
   * to arrive. */
  {
    const cx = A2.x;
    const y = groundY(38.5);
    pad(ctx, {
      x: cx - 0.2, z: 38.4, w: A2.w - 0.2, d: 3.4, y: y - 0.02, h: 0.06,
      mat: groundMats().gravel, name: 'alleyYard', platform: false,
    });
    ctx.add(makeLaundryPole({ ctx, x: cx - 0.5, z: 37.4, y, ry: 0, len: 2.4, n: 4, seed: 8831 }));
    ctx.add(makeLaundryPole({ ctx, x: cx - 0.5, z: 39.4, y, ry: 0, len: 2.4, n: 3, seed: 8832 }));
    ctx.add(makeStorageShed({ x: cx - 1.0, z: 41.2, y, ry: 0, w: 1.3, d: 0.72, h: 1.62 }));
    ctx.collide(cx - 1.7, 40.8, cx - 0.3, 41.7, y + 1.75);
    ctx.add(makeStorageShed({ x: cx + 0.6, z: 41.3, y, ry: 0.06, w: 1.0, d: 0.66, h: 1.42, color: 0xc4c8c0 }));
    ctx.collide(cx + 0.05, 40.9, cx + 1.15, 41.7, y + 1.55);
    ctx.add(makeBikeShelter({ ctx, x: cx + 0.1, z: 35.6, y, ry: 0, w: 3.0, d: 1.7, h: 2.0 }));
    /* Two bikes under the shelter, side by side down its 3 m width -- not nose
     * to nose along it.  At ry ~ 0 both wheelbases ran along x and the two of
     * them were 0.8 m apart, which is inside each other for most of a metre. */
    ctx.add(makeBicycle({ x: cx - 0.6, z: 35.6, y, ry: Math.PI / 2 + 0.1, lean: 0.05, color: 0xd8a03c }));
    ctx.add(makeBicycle({ x: cx + 0.5, z: 35.6, y, ry: Math.PI / 2 - 0.08, lean: -0.06, color: 0x3f6f9c }));
    ctx.add(makeUmbrellaStand({ x: cx + 1.3, z: 39.8, y, n: 3, seed: 8833 }));
    ctx.add(makeBroom({ x: cx + 1.45, z: 40.6, y, tilt: 0.06, roll: -0.18, ry: 0.4 }));
    ctx.add(makeDoormat({ x: cx - 1.0, z: 40.3, y, ry: 0, w: 0.7, d: 0.4, color: 0x7a7060 }));
    ctx.add(makeDeliveryBox({ x: cx + 1.3, z: 42.6, y, ry: 0.2 }));
    shrubs.push({ x: cx + 1.4, z: 37.6, y, r: 0.42, count: 3, spread: 1.0, seed: 8834 });
    petals.push({ x: cx, z: 39.0, w: 3.0, d: 5.0, y: y + 0.05, n: 70 });
  }
  petals.push({ x: A1.x, z: 24.0, w: 1.9, d: 14.0, y: groundY(24) + 0.06, n: 80 });
}

/* ------------------------------------------------------------------ *
 * 駅裏の小径 -- the station back path.
 * ------------------------------------------------------------------ */

function buildStationAlley(ctx, shrubs, petals) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(8901);

  lane(ctx, {
    axis: 'z', at: B.x, from: B.z0, to: B.z1, w: B.w,
    mat: gm.concrete, kerb: false, rise: 0.05, name: 'stationAlley',
  });

  /* Block walls both sides, which is what actually makes it a path rather than a
   * gap: the houses either side are 0.2 m and 1.3 m away and their flanks are
   * blank, so without a boundary this is two buildings with a strip of concrete
   * between them. */
  for (const s of [-1, 1]) {
    const at = B.x + s * (B.w / 2 + 0.1);
    wallRun(ctx, {
      axis: 'z', at, from: B.z0 + 0.4, to: -12.6, y: groundY(-16), h: 1.5, t: 0.19, panel: 2.4,
      mat: m.concreteMid,
    });
    wallRun(ctx, {
      axis: 'z', at, from: -11.6, to: B.z1 - 0.6, y: groundY(-9), h: 1.5, t: 0.19, panel: 2.4,
      mat: m.concreteMid,
    });
  }
  ctx.add(makeIvy({ x: B.x - B.w / 2 - 0.1, z: -15.4, y: groundY(-15.4), ry: Math.PI / 2, len: 4.0, top: 1.6, drop: 0.9, seed: 8911, face: 1 }));
  ctx.add(makeIvy({ x: B.x + B.w / 2 + 0.1, z: -8.6, y: groundY(-8.6), ry: -Math.PI / 2, len: 3.2, top: 1.6, drop: 0.8, seed: 8912, face: 1 }));

  /* the channel, the covers and one patch, same grammar as the other alley */
  {
    const parts = [];
    for (let z = B.z0 + 0.5; z < B.z1; z += 0.9) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.28, 0.04, 0.7),
        matrix: trs(B.x + B.w / 2 - 0.24, groundY(z) + 0.055, z),
      });
    }
    const ch = new THREE.Mesh(bake(parts), m.drain);
    ch.receiveShadow = true;
    ctx.add(ch);
    for (const z of [-17.0, -10.2]) {
      const mh = cyl(0.28, 0.28, 0.04, 12, cel({ color: PAL.metalDark, bands: 3 }), B.x - 0.5, groundY(z) + 0.065, z);
      mh.receiveShadow = true;
      ctx.add(mh);
    }
    const p = box(1.4, 0.02, 1.7, gm.asphaltWorn, B.x + 0.2, groundY(-13.4) + 0.062, -13.4);
    p.receiveShadow = true;
    p.userData.noOutline = true;
    ctx.add(p);
  }

  /* ------------------------------ the dressing ------------------------------ *
   * Sparser than the shopping street's alley on purpose: this one is a *route*,
   * and its job is to get somebody to the platform steps without anything at eye
   * height in the way.  So the only things in it are against a wall, and the
   * middle third is deliberately empty -- which is also what makes the tunnel of
   * it read. */
  {
    const wx = B.x - B.w / 2 + 0.4;
    const ex = B.x + B.w / 2 - 0.4;
    const y = (z) => groundY(z) + 0.05;

    // the canal end: a plate telling you where the path goes, and a bollard pair
    ctx.add(makeSignPost({
      x: ex + 0.1, z: B.z0 + 0.9, y: y(B.z0 + 0.9), ry: -Math.PI / 2, h: 1.9, postMat: m.metal,
      plates: [{ map: warningPlate(0), w: 0.34, h: 0.66, y: 1.5, double: true }],
    }));
    for (const s of [-1, 1]) {
      const bx = B.x + s * 0.7;
      const b = cyl(0.05, 0.06, 0.72, 8, m.metal, bx, groundY(B.z0 + 0.2) + 0.41, B.z0 + 0.2);
      b.castShadow = true;
      ctx.add(b);
      ctx.add(cyl(0.055, 0.055, 0.1, 8, cel({ color: PAL.red, bands: 3, tint: 0x7a4060 }),
        bx, groundY(B.z0 + 0.2) + 0.7, B.z0 + 0.2));
    }

    // the back gate of the house on the west, with its refuse point beside it
    ctx.add(makeBins({ x: wx - 0.05, z: -17.8, y: y(-17.8), ry: Math.PI / 2 }));
    ctx.add(makeSignPost({
      x: wx - 0.1, z: -16.6, y: y(-16.6), ry: Math.PI / 2, h: 1.45, postMat: m.metal,
      plates: [{ map: gomiPlate(), w: 0.4, h: 0.31, y: 1.2 }],
    }));
    ctx.add(makeTapPost({ x: ex, z: -16.0, y: y(-16.0), ry: -Math.PI / 2, h: 0.8 }));
    ctx.add(makeCrates({ x: ex + 0.05, z: -18.6, y: y(-18.6), n: 3, seed: 8921, ry: 1.5 }));

    // one bicycle, one pot, and a store against the far wall -- then nothing.
    // Along the path, for the same reason as the two in the other alley.
    ctx.add(makeBicycle({ x: wx, z: -14.4, y: y(-14.4), ry: Math.PI / 2 + 0.04, lean: -0.13, color: 0x9c5a4a }));
    ctx.add(makePlanter({ x: ex + 0.05, z: -12.4, y: y(-12.4), r: 0.24, flower: true, seed: 8922, n: 5 }));
    ctx.add(makeStorageShed({ x: wx + 0.2, z: -8.4, y: y(-8.4), ry: Math.PI / 2, w: 1.1, d: 0.62, h: 1.45, color: 0xc9cec6 }));
    ctx.collide(wx - 0.2, -9.0, wx + 0.6, -7.8, y(-8.4) + 1.6);
    // the render this hangs on is the house flank at x = 16.9, not the path edge
    ctx.add(makeAircon({ x: 16.9 - 0.24, z: -10.6, y: y(-10.6) + 1.3, ry: -Math.PI / 2, w: 0.8, h: 0.56, feet: false }));
    makeLoosePaper(ctx, [
      { x: wx + 0.3, z: -11.4, y: y(-11.4) + 0.01, ry: 0.9 },
      { x: ex - 0.3, z: -7.2, y: y(-7.2) + 0.01, ry: -0.4 },
    ]);

    /* the station end: the path opens out at the foot of the platform steps, so
     * it gets the one thing that says "this is the way to the trains" -- a rack,
     * because everybody rides here and walks up */
    const py = groundY(-6.6) + 0.05;
    pad(ctx, {
      x: B.x - 0.1, z: -6.6, w: B.w + 0.9, d: 1.9, y: groundY(-6.6) - 0.01, h: 0.06,
      mat: gm.concrete, name: 'stationAlleyApron', platform: false,
    });
    ctx.add(makeSignPost({
      x: B.x - B.w / 2 - 0.5, z: -6.9, y: py, ry: Math.PI / 2, h: 2.0, postMat: m.metal,
      plates: [{ map: warningPlate(1), w: 0.32, h: 0.62, y: 1.55, double: true }],
    }));
  }
  /* The west flank of this passage is the two-storey side wall of the house at
   * (10, -16.2), 0.2 m away and completely blank above the boundary wall -- five
   * and a half metres of pale render filling half of every frame looking up the
   * path.  It gets what a flank like that always has: a stack, a branch at each
   * floor, and an outdoor unit high up on brackets. */
  {
    const hx = B.x - B.w / 2 - 0.26;
    const parts = [];
    /* Both stacks and both units are inside z -19.8 .. -12.6, which is where
     * that flank actually is.  The northern pair were at -11.2 and -9.4, two
     * and three metres past the end of the house, hanging on nothing. */
    for (const zc of [-18.4, -13.4]) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.055, 0.055, 5.2, 6),
        matrix: trs(hx, groundY(zc) + 2.6, zc),
      });
      for (let i = 0; i < 3; i++) {
        parts.push({
          geometry: new THREE.BoxGeometry(0.12, 0.05, 0.12),
          matrix: trs(hx, groundY(zc) + 0.9 + i * 1.7, zc),
        });
      }
    }
    const pm = new THREE.Mesh(bake(parts), m.metal);
    pm.castShadow = true;
    ctx.add(pm);
    /* The wall is at x = 13.4 and its outward normal is +x, so these face +PI/2
     * and their backs go on the render.  At -PI/2 and hx + 0.24 they were turned
     * round -- fan into the wall -- and hanging half a metre out over the path. */
    ctx.add(makeAircon({
      x: hx + 0.10, z: -14.6, y: groundY(-14.6) + 2.75, ry: Math.PI / 2,
      w: 0.86, h: 0.6, feet: false,
    }));
    ctx.add(makeAircon({
      x: hx + 0.10, z: -17.4, y: groundY(-17.4) + 2.6, ry: Math.PI / 2,
      w: 0.78, h: 0.56, feet: false,
    }));
  }
  // clear of the path itself: at x = 16.4 this clump stood a metre inside it
  shrubs.push({ x: 13.0, z: -6.5, y: groundY(-6.5), r: 0.45, count: 3, spread: 1.0, seed: 8931 });
  petals.push({ x: B.x, z: -13.0, w: 2.4, d: 12.0, y: groundY(-13) + 0.06, n: 80 });
}
