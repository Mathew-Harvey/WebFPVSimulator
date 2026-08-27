import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { roadSignTex, roadPaint, warningPlate } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { centerX, groundY, makeStrip, ROAD_HALF, WALK_W, WALK_H, Z_MIN } from './street.js';
import { pad, laneLine, railing, groundMats } from './ground.js';
import { makeShop, makeFreezer, makeShopFlag, makeProduceStack, makeMenuBoard } from './shops.js';
import { addVending } from './vending.js';
import {
  makePole, makeWires, makeGuardrail, makeSignPost, makeBikeRack, makeVendBin,
  makeCrates, makeBench, makeLoosePaper, makeAircon, makePlanter,
} from './props.js';

/* ------------------------------------------------------------------ *
 * 通学路 -- the school route.
 *
 * This is not a new road: it is the stretch of the main street that was
 * always there, climbing away from the crossing, now dressed as what it
 * obviously is.  Everything here is about making that reading unmistakable
 * from the crossing itself:
 *
 *  - A green edge treatment down both sides of the carriageway.  Japan
 *    paints school routes green, and it is the single cheapest signal in the
 *    whole project: one band of colour and the road has a destination.
 *  - A crossing painted across the road at the school gate.
 *  - Guardrail on the downhill side the whole way, because that is what a
 *    school route gets.
 *  - A convenience store and a bakery on the west side, which do the real
 *    compositional work: without them the left half of every frame looking
 *    up the hill is bare road running out over the horizon.
 * ------------------------------------------------------------------ */

const Z_TOP = Z_MIN + 1.0;      // the dead end at the top of the hill
const GATE_Z = -49.5;

export function buildApproach(ctx) {
  const gm = groundMats();
  const rng = rngKit(4813);
  const sakura = [];
  const shrubs = [];
  const grove = [];

  /* --------------------------- green belt marking --------------------------- *
   * Swept along the centreline so it follows the road's drift and its slope. */
  {
    /* The band sits between the asphalt (+0.012) and the existing white edge
     * line (+0.024).  Four millimetres was not enough separation for the two
     * to stop fighting after the planet bake bends them both. */
    const green = cel({ color: 0x7c9c80, bands: 3, tint: 0x5b6f8c });
    for (const s of [-1, 1]) {
      const a = (z) => ({ x: centerX(z) + s * (ROAD_HALF - 0.86), y: groundY(z) + 0.017 });
      const b = (z) => ({ x: centerX(z) + s * (ROAD_HALF - 0.05), y: groundY(z) + 0.017 });
      // ascending z: makeStrip's winding assumes it, and a descending sweep
      // comes out facing into the ground
      const g = new THREE.Mesh(makeStrip({ z0: Z_TOP, z1: -28, a, b, step: 1.4, flip: s < 0 }), green);
      g.receiveShadow = true;
      g.userData.noOutline = true;
      g.name = 'greenBelt';
      ctx.add(g);
    }
  }

  /* --------------------- pedestrian crossing at the gate --------------------- */
  {
    const parts = [];
    const cx = centerX(GATE_Z);
    for (let i = 0; i < 7; i++) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.46, 0.02, 3.6),
        matrix: trs(cx - ROAD_HALF + 0.42 + i * 0.82, 0, GATE_Z),
      });
    }
    const m = new THREE.Mesh(bake(parts), cel({ color: PAL.lineWhite, bands: 2, tint: 0x8e86ad }));
    m.position.y = groundY(GATE_Z) + 0.03;
    m.userData.noOutline = true;
    ctx.add(m);
    // and the diamond warning ahead of it, painted the Japanese way
    for (const [z, ry] of [[GATE_Z + 9.5, 0], [GATE_Z - 8.0, Math.PI]]) {
      const geo = new THREE.PlaneGeometry(1.35, 2.55);
      geo.rotateX(-Math.PI / 2);
      const p = new THREE.Mesh(geo, flat({
        color: 0xffffff, map: roadPaint('diamond'), transparent: true, depthWrite: false, cache: false,
      }));
      p.position.set(centerX(z) + (ry ? -1.5 : 1.5), groundY(z) + 0.024, z);
      p.rotation.y = ry;
      p.renderOrder = 1;
      p.userData.noOutline = true;
      ctx.add(p);
    }
  }

  /* -------------------------------- guardrail -------------------------------- *
   * Down the west kerb the whole way, broken only for the shop entrances. */
  {
    /* The run that used to reach -42.6 is gone, and the gap at -38.0 .. -42.6
     * is deliberate: that is where 通学路の家並み brings its lane out onto the
     * carriageway (`tsugakuro.js`).  A guardrail stops at a side road -- it does
     * not run across the mouth of one -- and the junction is guarded instead by
     * the bollards, the mirror and the 徐行 plate the block puts on its corner. */
    const runs = [[-30.5, -38.0], [-53.2, -54.6], [-61.0, Z_TOP + 0.5]];
    for (const [z0, z1] of runs) {
      const zc = (z0 + z1) / 2;
      ctx.add(makeGuardrail({ ctx,
        x: centerX(zc) - ROAD_HALF - 0.28, z: zc, y: groundY(zc),
        ry: Math.PI / 2, len: Math.abs(z1 - z0),
      }));
    }
    // and a short length on the school side, either side of the gate crossing
    for (const [z0, z1] of [[-40.0, -46.4], [-52.6, -60.0]]) {
      const zc = (z0 + z1) / 2;
      ctx.add(makeGuardrail({ ctx,
        x: centerX(zc) + ROAD_HALF + 0.28, z: zc, y: groundY(zc),
        ry: Math.PI / 2, len: Math.abs(z1 - z0),
      }));
    }
  }

  /* --------------------------- the end of the road ---------------------------
   * **It is not a dead end any more.**
   *
   * It was one because there was nothing past it: a railing right across the
   * carriageway, two yellow bollards, a 注意 plate and a thicket of six grove
   * trees behind to close the view.  ひばり山's 裾道 now leaves from here, runs
   * behind the school's new north wall and up its east side, so the railing comes
   * out -- a barrier across a road that goes somewhere is simply wrong -- and what
   * is left is what a 6.3 m carriageway narrowing to a 4.4 m lane actually has:
   * the two bollards marking the taper, and the 注意 plate, which now warns about
   * the narrowing rather than about the end.
   *
   * The thicket loses its two middle trees.  At (2.2, -72.8) and (5.8, -68.4)
   * they stand in the new carriageway; the other four are clear of it and stay,
   * because the view south still wants closing -- just at the *bend* now rather
   * than at a barrier. */
  {
    const zc = Z_TOP;
    const cx = centerX(zc);
    const y = groundY(zc);
    for (const s of [-1, 1]) {
      const b = cyl(0.09, 0.1, 0.9, 8, cel({ color: PAL.yellow, bands: 3, tint: 0x8f7050 }), cx + s * 2.6, y + 0.45, zc + 0.7);
      b.castShadow = true;
      ctx.add(b);
      ctx.add(cyl(0.1, 0.1, 0.16, 8, cel({ color: PAL.black, bands: 2, tint: 0x4b4560 }), cx + s * 2.6, y + 0.62, zc + 0.7));
    }
    ctx.add(makeSignPost({
      x: cx - ROAD_HALF - 1.1, z: zc + 1.2, y, ry: Math.PI, h: 2.2,
      plates: [{ map: roadSignTex('chui'), w: 0.66, h: 0.66, y: 1.85, double: true }],
    }));
    // the thicket, minus the two the road now goes through
    for (let i = 0; i < 6; i++) {
      if (i === 2 || i === 3) continue;
      grove.push({
        x: cx - 8.0 + i * 3.6, z: zc - 3.4 - (i % 3) * 2.2, y,
        scale: 1.3 + (i % 3) * 0.2, seed: 720 + i, spread: 1.1, lean: 0.05, leanDir: i * 1.1,
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * ひばりマート -- the convenience store, with the car park a Japanese
   * suburban konbini always has.  It is here because the west side of the
   * hill needs mass; the fact that it is also exactly what stands opposite
   * every school gate in the country is a bonus.
   * ------------------------------------------------------------------ */
  {
    const cxB = -11.6, czB = -48.0;
    makeShop(ctx, {
      x: cxB, z: czB, y: groundY(czB), w: 9.0, d: 7.2, face: 'x+',
      kind: 'conbini', floors: 1, h1: 3.5, wall: 0, roof: 0, roofKind: 'flat',
      interior: 0, openW: 6.6, seed: 41, awning: false, blade: false,
      posters: false,
    });

    // forecourt: paving out to the kerb, with three bays marked on it
    const apronX0 = -8.0;
    const apronX1 = centerX(czB) - ROAD_HALF - WALK_W - 0.1;
    pad(ctx, {
      x: (apronX0 + apronX1) / 2, z: czB, w: apronX1 - apronX0, d: 11.4,
      y: groundY(czB), mat: gm.asphaltWorn, name: 'konbiniApron',
    });
    for (let i = 0; i < 4; i++) {
      laneLine(ctx, {
        axis: 'x', at: czB - 4.2 + i * 2.6, from: apronX0 + 0.4, to: apronX0 + 4.6,
        y: groundY(czB) + 0.085,
      });
    }
    // wheel stops, a bollard, and the low planter that fences the pavement
    for (let i = 0; i < 3; i++) {
      ctx.add(box(1.5, 0.12, 0.16, gm.concreteMid, apronX0 + 1.4, groundY(czB) + 0.13, czB - 2.9 + i * 2.6));
    }
    for (const dz of [-5.2, 5.2]) {
      const b = cyl(0.07, 0.08, 0.8, 8, cel({ color: PAL.yellow, bands: 3, tint: 0x8f7050 }),
        apronX1 - 0.5, groundY(czB) + 0.4, czB + dz);
      b.castShadow = true;
      ctx.add(b);
    }

    /* The bright cluster by the door: freezer, flags, machines, bin, bikes.
     * A konbini frontage is the most saturated thing on this hill, which is
     * exactly why it is on the shady side of the road. */
    const fx = -7.5;
    ctx.add(makeFreezer({ x: fx, z: czB + 2.5, y: groundY(czB), ry: Math.PI / 2 }));
    ctx.collide(fx - 0.4, czB + 1.9, fx + 0.4, czB + 3.1, groundY(czB) + 0.9);
    ctx.add(makeShopFlag({ ctx, x: fx - 0.1, z: czB + 3.6, y: groundY(czB), variant: 2, ry: Math.PI / 2 }));
    ctx.add(makeShopFlag({ ctx, x: fx - 0.1, z: czB - 3.9, y: groundY(czB), variant: 3, ry: Math.PI / 2 }));
    ctx.add(makeProduceStack({ x: fx - 0.2, z: czB - 3.0, y: groundY(czB), ry: Math.PI / 2, seed: 44 }));
    addVending(ctx, { x: fx - 0.15, z: czB - 1.4, y: groundY(czB), ry: Math.PI / 2, variant: 1, seed: 11 });
    addVending(ctx, { x: fx - 0.15, z: czB - 0.15, y: groundY(czB), ry: Math.PI / 2, variant: 2, seed: 12 });
    ctx.add(makeVendBin({ x: fx - 0.2, z: czB + 0.95, y: groundY(czB), ry: Math.PI / 2 }));
    ctx.add(makeBikeRack({
      x: apronX0 + 3.4, z: czB + 4.9,
      y: ctx.groundAt(apronX0 + 3.4, czB + 4.9) + 0.04,
      n: 5, spacing: 0.66, ry: 0, seed: 8,
    }));
    // cxB - 3.85, not - 3.7: the flank is at cxB - 3.6, so the old x had the
    // back of the unit 50 mm inside the render
    ctx.add(makeAircon({ x: cxB - 3.85, z: czB - 2.4, y: groundY(czB) + 0.1, ry: -Math.PI / 2, w: 1.0, h: 0.7 }));
    ctx.add(makeCrates({ x: cxB - 3.4, z: czB + 2.6, y: groundY(czB), n: 4, seed: 45, ry: 0.3 }));
    // paper the wind took off the board across the road
    makeLoosePaper(ctx, [
      { x: apronX0 + 5.0, z: czB + 3.2, y: groundY(czB) + 0.07, ry: 0.7, tilt: 0 },
      { x: apronX0 + 5.6, z: czB + 3.9, y: groundY(czB) + 0.07, ry: -1.1, tilt: 0 },
    ]);
  }

  /* ------------------------------------------------------------------ *
   * パン工房 こむぎ -- the bakery further up, a small gabled unit that
   * breaks the konbini's flat parapet before the road dead-ends.
   * ------------------------------------------------------------------ */
  {
    const cxB = -8.2, czB = -57.8;
    makeShop(ctx, {
      x: cxB, z: czB, y: groundY(czB), w: 5.4, d: 6.4, face: 'x+',
      kind: 'bakery', floors: 2, h1: 3.0, h2: 2.5, wall: 1, roof: 2, roofKind: 'gable',
      interior: 2, openW: 4.0, seed: 47, awning: 3, awningOut: 1.5, blade: 'bakery',
      bladeSide: -1, lit: true, balcony: true,
    });
    pad(ctx, {
      x: -3.6, z: czB, w: 3.4, d: 7.6, y: groundY(czB), mat: gm.concrete, name: 'bakeryApron',
    });
    ctx.add(makeMenuBoard({ x: -4.4, z: czB + 2.0, y: groundY(czB), ry: Math.PI / 2 + 0.3 }));
    ctx.add(makePlanter({ x: -4.5, z: czB - 1.6, y: groundY(czB), r: 0.26, flower: true, seed: 48, n: 5 }));
    ctx.add(makePlanter({ x: -4.5, z: czB - 2.4, y: groundY(czB), r: 0.22, flower: true, seed: 49, n: 4 }));
    ctx.add(makeBench({ x: -4.3, z: czB + 3.3, y: groundY(czB), ry: Math.PI / 2, len: 1.5, back: false }));
    sakura.push({ x: -3.2, z: czB - 5.4, y: groundY(czB), scale: 1.16, seed: 731, lean: 0.11, leanDir: 4.8 });
  }

  /* ------------------------- poles and the cable run ------------------------- */
  {
    const defs = [
      { x: 7.4, z: -37.5, h: 9.0, seed: 331, armDir: -1, lamp: true },
      { x: 7.4, z: -53.5, h: 8.8, seed: 332, armDir: -1 },
      { x: 7.5, z: -63.0, h: 8.6, seed: 333, armDir: -1, lamp: true, transformer: false },
      { x: -2.5, z: -43.0, h: 9.0, seed: 334, armDir: 1, transformer: false },
      { x: -2.6, z: -60.5, h: 8.8, seed: 335, armDir: 1, lamp: true, transformer: false },
    ];
    const poles = defs.map((d) => {
      const y = groundY(d.z);
      ctx.add(makePole({ ...d, y }));
      ctx.collide(d.x - 0.22, d.z - 0.22, d.x + 0.22, d.z + 0.22, y + d.h);
      return { ...d, y, top: y + d.h };
    });
    const at = (i, dy = 0, dz = 0) => new THREE.Vector3(poles[i].x, poles[i].top - 0.6 + dy, poles[i].z + dz);
    const runs = [];
    /* Existing pole 6 stands at (8.4, -31.6); this chain carries on from it.
     * It moved north off the canal coping when the channel was taken round the
     * planet -- if these two ever disagree the cables leave the pole head. */
    const anchor = new THREE.Vector3(8.4, groundY(-31.6) + 8.8 - 0.6, -31.6);
    for (const [dy, dz] of [[0, -0.7], [-0.42, 0], [-0.86, 0.7]]) {
      runs.push({
        points: [
          anchor.clone().add(new THREE.Vector3(0, dy, dz)),
          at(0, dy, dz), at(1, dy, dz), at(2, dy, dz),
        ],
        sag: 0.55,
      });
    }
    for (const [dy, dz] of [[0, -0.6], [-0.5, 0.6]]) {
      runs.push({ points: [at(3, dy, dz), at(4, dy, dz)], sag: 0.5 });
    }
    // two cables striding across the road
    runs.push({ points: [at(0, -0.2, 0.3), at(3, -0.2, -0.3)], sag: 0.6 });
    runs.push({ points: [at(1, -1.1, 0.4), at(4, -1.1, -0.4)], sag: 0.6 });
    // service drops into the two shops
    runs.push({ points: [at(3, -1.9), new THREE.Vector3(-7.9, groundY(-48) + 3.2, -45.6)], sag: 0.25, r: 0.022 });
    runs.push({ points: [at(4, -1.9), new THREE.Vector3(-5.2, groundY(-57.8) + 4.6, -56.4)], sag: 0.25, r: 0.022 });
    makeWires(ctx, runs);
  }

  /* --------------------------- signs along the route --------------------------- */
  ctx.add(makeSignPost({
    x: centerX(-33) - ROAD_HALF - 1.0, z: -33.0, y: groundY(-33), ry: Math.PI / 2, h: 2.5,
    plates: [
      { map: roadSignTex('tsugakuro'), w: 0.6, h: 0.6, y: 2.1, double: true },
      { map: roadSignTex('chui'), w: 0.52, h: 0.52, y: 1.42, double: true },
    ],
  }));
  ctx.add(makeSignPost({
    x: centerX(-58) + ROAD_HALF + 1.0, z: -58.0, y: groundY(-58), ry: -Math.PI / 2, h: 2.3,
    plates: [{ map: roadSignTex('slow'), w: 0.58, h: 0.58, y: 1.95, double: true }],
  }));

  /* ------------------- lineside kit that says "railway town" ------------------- */
  {
    // an equipment cabinet and a warning plate where the wall starts, on the
    // stretch of pavement between the last house and the school
    const zc = -41.6;
    const x = centerX(zc) + ROAD_HALF + WALK_W - 0.5;
    const cab = box(0.7, 1.1, 0.44, cel({ color: PAL.cabinet, bands: 3, tint: 0x6f6890 }), x, groundY(zc) + WALK_H + 0.55, zc);
    cab.castShadow = cab.receiveShadow = true;
    ctx.add(cab);
    hullOutline(cab, { thickness: 0.003 });
    ctx.add(box(0.78, 0.07, 0.52, cel({ color: PAL.cabinetTop, bands: 3 }), x, groundY(zc) + WALK_H + 1.13, zc));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.56),
      flat({ color: 0xffffff, map: warningPlate(1), cache: false }));
    plate.position.set(x - 0.36, groundY(zc) + WALK_H + 0.68, zc);
    plate.rotation.y = -Math.PI / 2;
    ctx.add(plate);
    ctx.collide(x - 0.4, zc - 0.28, x + 0.4, zc + 0.28, groundY(zc) + WALK_H + 1.2);
  }

  /* ----------------------------- planting the hill ----------------------------- */
  for (let i = 0; i < 4; i++) {
    sakura.push({
      x: centerX(-31 - i * 3) - ROAD_HALF - 2.6, z: -31.0 - i * 7.2,
      y: groundY(-31 - i * 7.2), scale: 1.08 + (i % 2) * 0.12,
      seed: 740 + i, lean: 0.1, leanDir: 1.5 + i,
    });
  }
  for (let i = 0; i < 5; i++) {
    shrubs.push({
      x: centerX(-36 - i * 5) - ROAD_HALF - 2.2, z: -36.0 - i * 5.6,
      y: groundY(-36 - i * 5.6), r: 0.5, count: 3, spread: 1.4, seed: 750 + i,
    });
  }
  grove.push({ x: -18.0, z: -41.0, y: groundY(-41), scale: 1.4, seed: 761, spread: 1.15 });
  grove.push({ x: -19.4, z: -55.0, y: groundY(-55), scale: 1.32, seed: 762, spread: 1.1 });
  grove.push({ x: -15.0, z: -62.0, y: groundY(-62), scale: 1.5, seed: 763, spread: 1.2 });

  return { sakura, shrubs, grove };
}
