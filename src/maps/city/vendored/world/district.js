import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  parkSign, apartmentPlate, namePlate, gomiPlate, litWindowTex, curtainTex,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { centerX, groundY, ROAD_HALF, WALK_W } from './street.js';
import { pad, railing, groundMats } from './ground.js';
import {
  makeBench, makeSignPost, makeBins, makePlanter, makeLaundryPole,
  makeAircon, makePostBox, makeUmbrellaStand, makePetBowl, makeBucket,
  makeCatBox, makeBicycle, makeFlowerBed,
} from './props.js';

/* ------------------------------------------------------------------ *
 * The rest of the neighbourhood.
 *
 * Three set pieces and one sweep.
 *
 *  - 児童公園: the second children's park, east of the shopping street.
 *    Swings, a slide, a sandpit and two spring riders, all empty.  An empty
 *    playground at four in the afternoon does more for the mood of a place
 *    than any amount of architecture.
 *  - ひばり荘: a three-storey walk-up with its access gallery and stair on
 *    the outside, which is the single most recognisable Japanese residential
 *    silhouette there is.
 *  - A traditional timber house below the shrine, tiled and low and dark,
 *    to break the run of pale render everywhere else.
 *  - Then a pass over every existing house, adding the things that say
 *    somebody lives there: washing, a post box, a name plate, a bicycle, a
 *    refuse point, a warm window.
 * ------------------------------------------------------------------ */

const M = {};
function mats() {
  if (M.wall) return M;
  M.wall = cel({ color: PAL.wallWhite, bands: 3, tint: 0x6f6790 });
  M.wallAlt = cel({ color: PAL.wallGray, bands: 3, tint: 0x6f6790 });
  M.wallCream = cel({ color: PAL.wallCream, bands: 3, tint: 0x6f6790 });
  M.roof = cel({ color: PAL.roofSlate, bands: 3, tint: 0x514b70 });
  M.roofBrown = cel({ color: PAL.roofBrown, bands: 3, tint: 0x514b70 });
  M.trim = cel({ color: PAL.trim, bands: 3, tint: 0x5c5680 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.glass = flat({ color: PAL.glassDark });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: 0x74563f, bands: 3, tint: 0x554e74 });
  M.tileRoof = cel({ color: 0x5a5f6e, bands: 3, tint: 0x4a4468 });
  M.sand = cel({ color: PAL.sand, bands: 3, tint: 0x7d74a0 });
  M.dirt = cel({ color: PAL.dirt, bands: 3, tint: 0x7a7396 });
  M.paint = [
    cel({ color: PAL.red, bands: 3, tint: 0x7a4060 }),
    cel({ color: PAL.blue, bands: 3, tint: 0x4a4a92 }),
    cel({ color: PAL.yellow, bands: 3, tint: 0x8f7050 }),
    cel({ color: PAL.teal, bands: 3, tint: 0x4a6a80 }),
  ];
  return M;
}

export function buildDistrict(ctx, opts = {}) {
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  buildChildrensPark(ctx, sakura, shrubs, petals);
  buildApartment(ctx);
  buildTimberHouse(ctx, shrubs);
  dressHousing(ctx, opts.houses ?? []);

  grove.push({ x: 44.4, z: 24.0, y: groundY(24), scale: 1.7, seed: 1201, spread: 1.15 });
  grove.push({ x: 45.6, z: 33.6, y: groundY(33.6), scale: 1.85, seed: 1202, spread: 1.2 });
  /* Slid south-east off the north lane, which now carries on east to the new
   * block: a grove tree at scale 1.75 collides with a 1.42 m box, so this one
   * stood squarely across a 3.4 m lane and the flood fill found the whole east
   * arm cut off behind it. */
  grove.push({ x: 45.8, z: 41.0, y: groundY(41), scale: 1.75, seed: 1203, spread: 1.15 });
  grove.push({ x: -15.4, z: 21.0, y: groundY(21), scale: 1.55, seed: 1204, spread: 1.1 });

  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * ひばり台第二児童公園.
 * ------------------------------------------------------------------ */

function buildChildrensPark(ctx, sakura, shrubs, petals) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(6101);
  const x0 = 31.8, x1 = 43.6, z0 = 17.4, z1 = 30.6;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const Y = groundY(cz);

  /* the surface: rolled dirt, with a paved apron at the gate */
  pad(ctx, { x: cx, z: cz, w: x1 - x0, d: z1 - z0, y: Y, h: 0.06, mat: m.dirt, name: 'parkGround' });
  pad(ctx, { x: x0 + 2.2, z: 28.8, w: 4.4, d: 2.4, y: Y, h: 0.08, mat: gm.concrete, name: 'parkApron' });

  /* A low pipe fence all the way round, with the entrance on the west -- and,
   * since ひばり台二丁目 went in, a second one on the east.
   *
   * The east railing used to be one unbroken run from z0 to z1, which was right
   * while there was nothing on that side: the park backed onto a field.  There
   * is a street down it now (`nichome.js`, the spine at x 49.2), and a park
   * fenced solid against the street that serves it is the kind of thing that
   * looks correct in every frame and is wrong the moment anybody walks it.  So
   * the run is split for a 1.6 m gate at z 23.4..25.0; `nichome.js` builds the
   * posts, the threshold and the paving that arrives at it. */
  const runs = [
    { axis: 'x', at: z0, from: x0, to: x1 },
    { axis: 'x', at: z1, from: x0, to: x1 },
    { axis: 'z', at: x1, from: z0, to: 23.4 },
    { axis: 'z', at: x1, from: 25.0, to: z1 },
    { axis: 'z', at: x0, from: z0, to: 27.5 },
    { axis: 'z', at: x0, from: 30.1, to: z1 },
  ];
  for (const r of runs) {
    railing(ctx, { ...r, y: Y + 0.06, h: 0.92, spacing: 2.1, mat: m.metal });
  }
  ctx.add(makeSignPost({
    x: x0 - 0.5, z: 30.6, y: Y, ry: -Math.PI / 2, h: 2.1,
    plates: [{ map: parkSign(), w: 0.92, h: 0.7, y: 1.6 }],
  }));

  /* ------------------------------- the swings ------------------------------- *
   * Two seats hanging dead still.  The chains are the whole detail: without
   * them a swing frame is just an A of pipes. */
  {
    const sx = x0 + 3.4, sz = z0 + 3.2;
    const H = 2.35, SPAN = 3.2;
    const LEG_LENGTH = H + 0.2;
    const LEG_ANGLE = 0.28;
    const LEG_OFFSET = Math.sin(LEG_ANGLE) * LEG_LENGTH / 2;
    const parts = [];
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        const leg = new THREE.CylinderGeometry(0.055, 0.06, LEG_LENGTH, 8);
        /* CylinderGeometry grows along local Y.  The old sign tilted each top
         * away from the crossbar, making an inverted A-frame.  Offset the
         * centre by the projected half-length and lean it back in, so both
         * upper ends meet at z = sz while the feet spread naturally. */
        parts.push({
          geometry: leg,
          matrix: trs(
            sx + s * (SPAN / 2), LEG_LENGTH / 2 - 0.1,
            sz + t * LEG_OFFSET, -t * LEG_ANGLE, 0, 0,
          ),
        });
      }
    }
    parts.push({ geometry: new THREE.CylinderGeometry(0.06, 0.06, SPAN + 0.4, 8), matrix: trs(sx, H, sz, 0, 0, Math.PI / 2) });
    const frame = new THREE.Mesh(bake(parts), m.paint[1]);
    frame.name = 'openFrame';
    frame.position.y = Y + 0.06;
    frame.castShadow = true;
    ctx.add(frame);
    hullOutline(frame, { thickness: 0.0032 });

    for (const s of [-1, 1]) {
      const seatX = sx + s * 0.72;
      for (const c of [-0.2, 0.2]) {
        const ch = cyl(0.014, 0.014, 1.55, 4, m.metalDark, seatX + c, Y + 0.06 + H - 0.78, sz);
        ctx.add(ch);
      }
      const seat = box(0.5, 0.055, 0.2, m.paint[2], seatX, Y + 0.06 + H - 1.56, sz);
      seat.castShadow = true;
      ctx.add(seat);
    }
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        const lx = sx + s * (SPAN / 2);
        const lz = sz + t * LEG_OFFSET;
        ctx.collide(lx - 0.07, lz - 0.07, lx + 0.07, lz + 0.07, Y + H, Y, true);
      }
    }
    ctx.collide(sx - SPAN / 2 - 0.1, sz - 0.08, sx + SPAN / 2 + 0.1, sz + 0.08, Y + H + 0.08, Y + H - 0.08, true);
  }

  /* -------------------------------- the slide -------------------------------- */
  {
    const px = x1 - 3.6, pz = z0 + 3.6;
    const PH = 1.6;
    const RAIL_LENGTH = 1.5;
    const RAIL_ANGLE = 0.7;
    const RAIL_HALF = RAIL_LENGTH / 2;
    const parts = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push({
          geometry: new THREE.CylinderGeometry(0.05, 0.055, PH, 7),
          matrix: trs(px + sx * 0.52, PH / 2, pz + sz * 0.52),
        });
      }
    }
    // ladder
    for (let i = 0; i < 5; i++) {
      parts.push({
        geometry: new THREE.BoxGeometry(1.0, 0.05, 0.09),
        matrix: trs(px, 0.28 + i * 0.3, pz + 0.52),
      });
    }
    for (const sx of [-1, 1]) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.04, 0.04, RAIL_LENGTH, 6),
        matrix: trs(px + sx * 0.52, PH + 0.5, pz + 0.52),
      });
      parts.push({
        geometry: new THREE.CylinderGeometry(0.04, 0.04, RAIL_LENGTH, 6),
        /* Join the rear upright exactly, then bring the lower end down to
         * the deck and the head of the chute instead of leaving both ends
         * suspended in air. */
        matrix: trs(
          px + sx * 0.52,
          PH + Math.cos(RAIL_ANGLE) * RAIL_HALF,
          pz + 0.52 - Math.sin(RAIL_ANGLE) * RAIL_HALF,
          RAIL_ANGLE, 0, 0,
        ),
      });
    }
    const frame = new THREE.Mesh(bake(parts), m.paint[3]);
    frame.name = 'openFrame';
    frame.position.y = Y + 0.06;
    frame.castShadow = true;
    ctx.add(frame);
    hullOutline(frame, { thickness: 0.0032 });

    const deck = box(1.15, 0.08, 1.15, m.paint[2], px, Y + 0.06 + PH, pz);
    deck.castShadow = deck.receiveShadow = true;
    ctx.add(deck);
    // the chute, with a raised lip either side
    const len = 3.1;
    const chute = box(0.86, 0.07, len, m.paint[0], px, Y + 0.06 + PH / 2, pz - 0.5 - len / 2 * 0.9);
    chute.rotation.x = -0.52;
    chute.castShadow = chute.receiveShadow = true;
    ctx.add(chute);
    hullOutline(chute, { thickness: 0.0032 });
    for (const sx of [-1, 1]) {
      const lip = box(0.08, 0.16, len, m.paint[2], px + sx * 0.45, Y + 0.06 + PH / 2 + 0.06, pz - 0.5 - len / 2 * 0.9);
      lip.rotation.x = -0.52;
      ctx.add(lip);
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        ctx.collide(px + sx * 0.52 - 0.07, pz + sz * 0.52 - 0.07,
          px + sx * 0.52 + 0.07, pz + sz * 0.52 + 0.07, Y + PH, Y, true);
      }
    }
    ctx.collide(px - 0.58, pz - 0.58, px + 0.58, pz + 0.58, Y + PH + 0.12, Y + PH - 0.04, true);
  }

  /* ------------------------------- the sandpit ------------------------------- */
  {
    const sx = x0 + 3.6, sz = z1 - 3.4;
    const w = 3.4, d = 2.8;
    const sand = box(w, 0.14, d, m.sand, sx, Y + 0.1, sz);
    sand.receiveShadow = true;
    ctx.add(sand);
    for (const s of [-1, 1]) {
      ctx.add(box(w + 0.3, 0.26, 0.15, m.wood, sx, Y + 0.13, sz + s * (d / 2 + 0.07)));
      ctx.add(box(0.15, 0.26, d + 0.3, m.wood, sx + s * (w / 2 + 0.07), Y + 0.13, sz));
    }
    // a bucket and a small mound left behind
    ctx.add(makeBucket({ x: sx + 0.7, z: sz - 0.5, y: Y + 0.17, ry: 0.4, color: PAL.yellow }));
    const mound = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.2, 8),
      cel({ color: 0xcfbc97, bands: 3, tint: 0x7d74a0 }));
    mound.position.set(sx - 0.5, Y + 0.24, sz + 0.4);
    mound.castShadow = true;
    ctx.add(mound);
  }

  /* --------------------------- animal spring riders --------------------------- */
  for (const [rx, rz, hue] of [[x1 - 3.2, z1 - 3.0, 0], [x1 - 4.9, z1 - 3.6, 3]]) {
    const g = new THREE.Group();
    g.add(cyl(0.11, 0.13, 0.1, 8, m.concreteMid, 0, 0.05, 0));
    // the spring, as three stacked rings
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.024, 4, 10), m.metalDark);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.14 + i * 0.09;
      g.add(ring);
    }
    // the animal: a rounded body, a head, two ears, a stub tail
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), m.paint[hue]);
    body.scale.set(0.85, 0.8, 1.3);
    body.position.y = 0.62;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), m.paint[hue]);
    head.position.set(0, 0.8, 0.24);
    head.castShadow = true;
    g.add(head);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m.paint[hue]);
      ear.position.set(s * 0.12, 0.93, 0.2);
      g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), cel({ color: PAL.black, bands: 2 }));
      eye.position.set(s * 0.07, 0.83, 0.38);
      g.add(eye);
      // handle
      g.add(cyl(0.02, 0.02, 0.3, 6, m.metal, s * 0.16, 0.78, 0.02).rotateZ(Math.PI / 2));
    }
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), cel({ color: 0xf2e0d0, bands: 2, tint: 0x8f86ad }));
    snout.position.set(0, 0.76, 0.38);
    g.add(snout);
    g.position.set(rx, Y + 0.06, rz);
    g.rotation.y = rng.range(-0.6, 0.6);
    ctx.add(g);
    ctx.collide(rx - 0.3, rz - 0.3, rx + 0.3, rz + 0.3, Y + 0.9);
  }

  /* ------------------------ benches, tap, bins, planting ------------------------ */
  ctx.add(makeBench({ x: x0 + 2.4, z: 25.2, y: Y + 0.06, ry: Math.PI / 2, len: 1.8 }));
  ctx.add(makeBench({ x: x0 + 2.4, z: 22.6, y: Y + 0.06, ry: Math.PI / 2, len: 1.8 }));
  ctx.add(makeBins({ x: x0 + 1.4, z: 27.2, y: Y + 0.06, ry: -Math.PI / 2 }));

  /* the drinking fountain: a concrete stand and a bright tap */
  {
    const fx = cx + 1.0, fz = z1 - 1.9;
    const stand = box(0.42, 0.82, 0.42, m.concrete, fx, Y + 0.47, fz);
    stand.castShadow = stand.receiveShadow = true;
    ctx.add(stand);
    hullOutline(stand, { thickness: 0.003 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.12, 12), m.concreteMid);
    basin.position.set(fx, Y + 0.94, fz);
    ctx.add(basin);
    ctx.add(cyl(0.24, 0.24, 0.02, 12, flat({ color: 0x8fb4c8 }), fx, Y + 0.97, fz));
    const spout = cyl(0.022, 0.022, 0.2, 6, m.metal, fx, Y + 1.08, fz - 0.12);
    spout.rotation.x = 0.5;
    ctx.add(spout);
    ctx.add(box(0.1, 0.06, 0.1, m.paint[0], fx, Y + 1.15, fz - 0.16));
    ctx.collide(fx - 0.3, fz - 0.3, fx + 0.3, fz + 0.3, Y + 1.1);
  }

  ctx.add(makeFlowerBed({ x: x1 - 1.3, z: 24.0, w: 1.2, d: 5.0, y: Y + 0.06, seed: 6110 }));
  ctx.add(makeCatBox({ x: x0 + 1.5, z: 20.2, y: Y + 0.06, ry: 0.6 }));
  ctx.add(makeBicycle({ x: x0 + 1.2, z: 29.6, y: Y + 0.08, ry: 0.2, lean: 0.07, color: 0xd8a03c }));

  for (const [tx, tz, sc, sd] of [
    [x0 + 1.6, z0 + 1.6, 1.2, 6120], [x1 - 1.5, z0 + 1.4, 1.14, 6121],
    [x1 - 1.6, z1 - 1.5, 1.22, 6122], [cx + 3.0, cz + 0.6, 1.1, 6123],
  ]) {
    sakura.push({ x: tx, z: tz, y: Y, scale: sc, seed: sd, lean: 0.1, leanDir: (sd % 6) });
  }
  for (let i = 0; i < 4; i++) {
    shrubs.push({ x: x0 + 1.2 + i * 3.4, z: z0 + 1.0, y: Y + 0.06, r: 0.48, count: 3, spread: 1.3, seed: 6130 + i });
  }
  petals.push({ x: cx, z: cz, w: x1 - x0 - 1, d: z1 - z0 - 1, y: Y + 0.07, n: 150 });
}

/* ------------------------------------------------------------------ *
 * ひばり荘 -- a three-storey walk-up.
 *
 * The access gallery and the open stair on the outside are what make this
 * building type instantly legible, so they get the front elevation and the
 * balconies go round the back.
 * ------------------------------------------------------------------ */

function buildApartment(ctx) {
  const m = mats();
  const rng = rngKit(6301);
  const g = new THREE.Group();
  g.name = 'walkup';
  ctx.add(g);

  const x0 = 34.4, x1 = 42.4, z0 = 36.0, z1 = 43.4;
  const W = x1 - x0, D = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const Y = groundY(cz);
  const FH = 2.7;
  const FLOORS = 3;
  const H = FH * FLOORS;
  const GAL = 1.3;                    // gallery depth, on the +z face

  const parts = { wall: [], trim: [], roof: [], metal: [], metalDark: [], concrete: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  push('concrete', new THREE.BoxGeometry(W + 0.4, 0.42, D + 0.4), trs(cx, Y + 0.21, cz));
  push('wall', new THREE.BoxGeometry(W, H, D - GAL), trs(cx, Y + H / 2, cz - GAL / 2));
  for (let k = 1; k <= FLOORS; k++) {
    push('trim', new THREE.BoxGeometry(W + 0.24, 0.2, D + 0.24), trs(cx, Y + k * FH, cz - GAL / 2));
  }
  push('roof', new THREE.BoxGeometry(W + 0.5, 0.22, D + 0.5), trs(cx, Y + H + 0.11, cz - GAL / 2 + 0.1));
  for (const s of [-1, 1]) {
    push('roof', new THREE.BoxGeometry(W + 0.5, 0.4, 0.16), trs(cx, Y + H + 0.4, cz - GAL / 2 + 0.1 + s * ((D + 0.5) / 2)));
    push('roof', new THREE.BoxGeometry(0.16, 0.4, D + 0.5), trs(cx + s * ((W + 0.5) / 2), Y + H + 0.4, cz - GAL / 2 + 0.1));
  }

  /* the gallery: a slab, a rail and four doors per floor */
  const litMat = flat({ color: 0xffffff, map: litWindowTex(0), cache: false });
  const litMat2 = flat({ color: 0xffffff, map: litWindowTex(1), cache: false });
  for (let k = 0; k < FLOORS; k++) {
    const y = Y + k * FH;
    push('concrete', new THREE.BoxGeometry(W, 0.22, GAL), trs(cx, y + 0.11, z1 - GAL / 2));
    push('metal', new THREE.BoxGeometry(W, 0.07, 0.07), trs(cx, y + 1.14, z1 - 0.08));
    push('metalDark', new THREE.BoxGeometry(W, 0.07, 0.07), trs(cx, y + 0.34, z1 - 0.08));
    const nb = Math.round(W / 0.22);
    for (let i = 0; i <= nb; i++) {
      push('metal', new THREE.BoxGeometry(0.04, 0.86, 0.04), trs(x0 + (W / nb) * i, y + 0.72, z1 - 0.08));
    }
    // doors, a meter box and a small window beside each
    for (let i = 0; i < 4; i++) {
      const dx = x0 + 0.85 + i * ((W - 1.7) / 3);
      push('trim', new THREE.BoxGeometry(0.94, 2.1, 0.14), trs(dx, y + 1.28, z1 - GAL + 0.07));
      push('metalDark', new THREE.BoxGeometry(0.82, 1.98, 0.06), trs(dx, y + 1.24, z1 - GAL + 0.14));
      push('metal', new THREE.BoxGeometry(0.05, 0.3, 0.05), trs(dx + 0.3, y + 1.2, z1 - GAL + 0.18));
      const lit = rng.chance(0.45);
      const paneMat = lit ? (i % 2 ? litMat2 : litMat) : m.glass;
      const win = box(0.5, 0.6, 0.05, paneMat, dx + 0.72, y + 1.7, z1 - GAL + 0.14);
      g.add(win);
      push('metal', new THREE.BoxGeometry(0.6, 0.7, 0.1), trs(dx + 0.72, y + 1.7, z1 - GAL + 0.09));
    }
  }

  /* the open stair at the west end */
  {
    const sx = x0 - 1.5;
    for (let k = 0; k < FLOORS; k++) {
      const y = Y + k * FH;
      push('concrete', new THREE.BoxGeometry(1.5, 0.2, GAL + 0.3), trs(sx + 0.75, y + 0.1, z1 - GAL / 2 + 0.15));
      // the flight itself, as a run of treads
      for (let i = 0; i < 9; i++) {
        push('concrete', new THREE.BoxGeometry(1.3, 0.13, 0.3),
          trs(sx + 0.75, y + 0.24 + i * FH / 9, z1 - GAL / 2 + 0.3 - i * 0.24));
      }
      push('metal', new THREE.BoxGeometry(0.06, 0.06, GAL + 0.3), trs(sx + 0.05, y + 1.14, z1 - GAL / 2 + 0.15));
      for (let i = 0; i <= 8; i++) {
        push('metal', new THREE.BoxGeometry(0.04, 0.9, 0.04),
          trs(sx + 0.05, y + 0.7 + i * FH / 9, z1 - GAL / 2 + 0.3 - i * 0.24));
      }
    }
    push('roof', new THREE.BoxGeometry(1.8, 0.16, GAL + 0.6), trs(sx + 0.75, Y + H + 0.08, z1 - GAL / 2 + 0.2));
  }

  /* balconies on the quiet side, with the washing */
  for (let k = 1; k < FLOORS; k++) {
    const y = Y + k * FH;
    push('concrete', new THREE.BoxGeometry(W - 0.6, 0.18, 0.9), trs(cx, y + 0.09, z0 - 0.45));
    push('metal', new THREE.BoxGeometry(W - 0.6, 0.06, 0.06), trs(cx, y + 1.06, z0 - 0.88));
    push('metalDark', new THREE.BoxGeometry(W - 0.6, 0.5, 0.05), trs(cx, y + 0.6, z0 - 0.88));
    const nb = Math.round((W - 0.6) / 0.24);
    for (let i = 0; i <= nb; i++) {
      push('metal', new THREE.BoxGeometry(0.04, 0.9, 0.04), trs(x0 + 0.3 + ((W - 0.6) / nb) * i, y + 0.64, z0 - 0.88));
    }
    for (let i = 0; i < 3; i++) {
      const dx = x0 + 1.4 + i * 2.6;
      push('trim', new THREE.BoxGeometry(1.5, 1.9, 0.14), trs(dx, y + 1.05, z0 + 0.07));
      const paneMat = rng.chance(0.5) ? litMat : m.glass;
      g.add(box(1.3, 1.7, 0.05, paneMat, dx, y + 1.05, z0 + 0.13));
      const cur = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.6),
        flat({ color: 0xe6dfd0, map: curtainTex(i % 2), cache: false }));
      cur.position.set(dx + (i % 2 ? 0.32 : -0.32), y + 1.05, z0 + 0.16);
      cur.rotation.y = Math.PI;
      cur.userData.noOutline = true;
      g.add(cur);
    }
    ctx.add(makeLaundryPole({ ctx,
      x: cx + (k === 1 ? -1.6 : 1.4), z: z0 - 0.7, y: y + 0.18, ry: Math.PI / 2,
      len: 2.2, n: 3, h: 1.5, seed: 6310 + k,
    }));
  }

  /* the name plate, the meter bank, and the ground-floor clutter */
  {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.44, 0.08),
      [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: 0xffffff, map: apartmentPlate(), cache: false }),
       flat({ color: PAL.wallGray })]
    );
    plate.position.set(x0 + 1.2, Y + H + 0.34, z1 + 0.05);
    plate.castShadow = true;
    g.add(plate);
    hullOutline(plate, { thickness: 0.003 });

    /* The umbrella stand stays tucked against the gallery.  **The bins and the
     * bicycles do not, because there is no verge on this side to tuck them
     * into**: the gallery's collider reaches z = 43.6 and the north lane's
     * paving starts at 43.5, so a four-bike rack at `z1 + 1.45` stood in the
     * dead centre of a 3.4 m carriageway and the refuse point half a metre off
     * its south edge.  Both go on the lane's *north* verge instead -- the 0.8 m
     * of ground between the paving's edge at 46.9 and 二階半の家's south wall at
     * 47.8, which is where a 集積所 serving this block actually is; a collection
     * point belongs to the block, not to one building.  One bicycle, and it is
     * parked *along* that wall standing off by half a handlebar, which is the
     * only way a 1.73 m machine fits in 0.8 m of verge. */
    const FY = groundY(45.2) + 0.09;          // the north lane's surface
    const VY = groundY(47.4);                 // the north verge: bare ground
    ctx.add(makeUmbrellaStand({ x: x0 + 0.4, z: z1 + 0.35, y: FY, n: 3, seed: 6320 }));
    ctx.add(makeBins({ x: 41.0, z: 47.35, y: VY, ry: Math.PI }));
    // z 47.40: the house's plinth is 0.1 m proud of its wall and reaches 47.702,
    // and 0.55 m of bicycle has 0.25 m of slack in a 0.8 m verge -- measured, not
    // assumed, because at 47.45 the handlebar end was 23 mm inside the render
    ctx.add(makeBicycle({ x: 38.2, z: 47.40, y: VY + 0.06, ry: 0, lean: 0.07, color: 0x4c6a86 }));
    for (const [ax, az] of [[x1 + 0.24, z0 + 1.6], [x1 + 0.24, z0 + 4.4]]) {
      ctx.add(makeAircon({ x: ax, z: az, y: Y + 0.42, ry: Math.PI / 2, w: 0.86, h: 0.6 }));
    }
  }

  const matFor = {
    wall: m.wallAlt, trim: m.trim, roof: m.roof, metal: m.metal,
    metalDark: m.metalDark, concrete: m.concrete,
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof') hullOutline(mesh, { thickness: 0.0032 });
  }
  ctx.collide(x0, z0, x1, z1 - GAL, Y + H + 0.4, undefined, true);
  for (let k = 0; k < FLOORS; k += 1) {
    const y = Y + k * FH;
    ctx.collide(x0, z1 - GAL, x1, z1, y + 0.22, y, true);
    ctx.collide(x0, z1 - 0.12, x1, z1 + 0.04, y + 1.18, y + 0.30, true);
    ctx.collide(x0 - 1.5, z1 - GAL - 0.15, x0, z1 + 0.2, y + 0.20, y, true);
  }
  for (let k = 1; k < FLOORS; k += 1) {
    const y = Y + k * FH;
    ctx.collide(x0 + 0.3, z0 - 0.90, x1 - 0.3, z0, y + 0.18, y, true);
    ctx.collide(x0 + 0.3, z0 - 0.92, x1 - 0.3, z0 - 0.84, y + 1.12, y + 0.18, true);
  }
  return g;
}

/* ------------------------------------------------------------------ *
 * A traditional timber house, below the shrine.
 *
 * Everything else residential here is pale render with a thin roof.  This
 * one is dark boarding under a heavy tiled roof with a deep eave, which is
 * what the street needs to stop reading as one material.
 * ------------------------------------------------------------------ */

function buildTimberHouse(ctx, shrubs) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'timberHouse';
  ctx.add(g);

  const x0 = -24.4, x1 = -17.2, z0 = 17.8, z1 = 25.2;
  const W = x1 - x0, D = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const Y = groundY(cz);
  const WH = 2.75;

  const parts = { wood: [], dark: [], roof: [], stone: [], metal: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* stone base, boarded walls, and the corner posts that break them up */
  push('stone', new THREE.BoxGeometry(W + 0.3, 0.44, D + 0.3), trs(cx, Y + 0.22, cz));
  push('wood', new THREE.BoxGeometry(W, WH, D), trs(cx, Y + 0.44 + WH / 2, cz));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      push('dark', new THREE.BoxGeometry(0.18, WH, 0.18), trs(cx + sx * (W / 2 - 0.05), Y + 0.44 + WH / 2, cz + sz * (D / 2 - 0.05)));
    }
  }
  /* horizontal boarding: a run of shallow ribs, which is what 下見板 is */
  {
    const ribs = [];
    const n = Math.round(WH / 0.26);
    for (let i = 0; i < n; i++) {
      const y = Y + 0.5 + i * 0.26;
      ribs.push({ geometry: new THREE.BoxGeometry(W + 0.05, 0.05, D + 0.05), matrix: trs(cx, y, cz) });
    }
    const rm = new THREE.Mesh(bake(ribs), m.woodDark);
    rm.castShadow = true;
    g.add(rm);
  }

  /* the roof: a heavy hip with a deep eave and a ridge tile */
  {
    const eave = 1.05;
    const rw = W + eave * 2;
    const rd = D + eave * 2;
    const rh = 1.7;
    const yr = Y + 0.44 + WH;
    push('dark', new THREE.BoxGeometry(W + 0.5, 0.2, D + 0.5), trs(cx, yr + 0.1, cz));
    const pyr = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    pyr.rotateY(Math.PI / 4);
    push('roof', pyr, trs(cx, yr + 0.2 + rh / 2, cz, 0, 0, 0, rw, rh, rd));
    push('roof', new THREE.BoxGeometry(rw, 0.24, rd), trs(cx, yr + 0.28, cz));
    pyr.dispose();
    // a short ridge and the end tiles
    push('roof', new THREE.BoxGeometry(2.2, 0.3, 0.4), trs(cx, yr + 0.2 + rh - 0.02, cz));
    // rafter ends showing under the eave
    const raf = [];
    const nr = Math.round(rw / 0.5);
    for (let i = 0; i < nr; i++) {
      raf.push({
        geometry: new THREE.BoxGeometry(0.1, 0.12, rd - 0.2),
        matrix: trs(cx - rw / 2 + 0.25 + i * (rw - 0.5) / (nr - 1), yr + 0.16, cz),
      });
    }
    const rm = new THREE.Mesh(bake(raf), m.woodDark);
    g.add(rm);
  }

  /* 縁側 -- the veranda along the west face, with paper screens behind it */
  {
    const vx = x0 - 0.85;
    const deck = box(1.7, 0.16, D - 1.0, m.wood, vx, Y + 0.5, cz);
    deck.castShadow = deck.receiveShadow = true;
    g.add(deck);
    for (const sz of [-1, 1]) {
      push('dark', new THREE.BoxGeometry(0.12, 0.5, 0.12), trs(vx - 0.7, Y + 0.25, cz + sz * (D / 2 - 0.7)));
    }
    // shoji: warm panels with a lattice over them
    const shoji = box(0.06, 1.9, D - 1.2, flat({ color: 0xf4ead6 }), x0 + 0.03, Y + 1.5, cz);
    g.add(shoji);
    const lat = [];
    const nv = Math.round((D - 1.2) / 0.34);
    for (let i = 0; i <= nv; i++) {
      lat.push({ geometry: new THREE.BoxGeometry(0.05, 1.9, 0.05), matrix: trs(x0 + 0.01, Y + 1.5, cz - (D - 1.2) / 2 + ((D - 1.2) / nv) * i) });
    }
    for (let i = 0; i < 5; i++) {
      lat.push({ geometry: new THREE.BoxGeometry(0.05, 0.05, D - 1.2), matrix: trs(x0 + 0.01, Y + 0.66 + i * 0.42, cz) });
    }
    const lm = new THREE.Mesh(bake(lat), m.woodDark);
    g.add(lm);
    push('dark', new THREE.BoxGeometry(0.16, 0.14, D - 1.0), trs(x0 + 0.02, Y + 0.62, cz));
    push('dark', new THREE.BoxGeometry(0.16, 0.14, D - 1.0), trs(x0 + 0.02, Y + 2.5, cz));
  }

  /* a small window on the street face, and the entrance */
  {
    push('dark', new THREE.BoxGeometry(1.4, 1.2, 0.16), trs(cx - 1.6, Y + 1.85, z0 + 0.02));
    g.add(box(1.2, 1.0, 0.06, flat({ color: 0xffffff, map: litWindowTex(2), cache: false }), cx - 1.6, Y + 1.85, z0 - 0.03));
    push('dark', new THREE.BoxGeometry(1.3, 2.1, 0.16), trs(cx + 1.5, Y + 1.5, z0 + 0.02));
    g.add(box(1.1, 1.9, 0.06, flat({ color: 0xe8dcc2 }), cx + 1.5, Y + 1.5, z0 - 0.03));
    push('metal', new THREE.BoxGeometry(1.7, 0.1, 0.5), trs(cx + 1.5, Y + 2.66, z0 - 0.2));
  }

  /* the garden: a bamboo fence, a stepping-stone path, a stone and a lantern */
  {
    const fz = z0 - 2.4;
    const fence = [];
    const n = Math.round(W / 0.16);
    for (let i = 0; i < n; i++) {
      fence.push({
        geometry: new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6),
        matrix: trs(x0 + 0.2 + i * ((W - 0.4) / (n - 1)), 0.75, fz),
      });
    }
    for (const y of [0.35, 1.3]) {
      fence.push({ geometry: new THREE.CylinderGeometry(0.05, 0.05, W - 0.2, 6), matrix: trs(cx, y, fz, 0, 0, Math.PI / 2) });
    }
    const fm = new THREE.Mesh(bake(fence), cel({ color: 0xb09468, bands: 3, tint: 0x6f6790 }));
    fm.position.y = Y;
    fm.castShadow = true;
    g.add(fm);
    ctx.collide(x0, fz - 0.12, x1, fz + 0.12, Y + 1.5);

    // stepping stones from the gate up to the veranda
    const stones = [];
    for (let i = 0; i < 5; i++) {
      const r = 0.24 + (i % 2) * 0.04;
      stones.push({
        geometry: new THREE.CylinderGeometry(r, r, 0.09, 7),
        matrix: trs(x0 + 1.6 - i * 0.55, 0.045, fz + 0.5 + i * 0.42),
      });
    }
    const sm = new THREE.Mesh(bake(stones), cel({ color: PAL.stone, bands: 3, tint: 0x655d80 }));
    sm.position.y = Y;
    sm.receiveShadow = true;
    g.add(sm);

    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), cel({ color: 0x9a94a2, bands: 3, tint: 0x605878 }));
    rock.scale.set(1, 0.72, 0.85);
    rock.position.set(x0 + 3.6, Y + 0.28, z0 - 1.2);
    rock.castShadow = true;
    g.add(rock);
    ctx.add(makePlanter({ x: x0 + 0.4, z: z0 - 1.5, y: Y, r: 0.28, flower: true, seed: 6401, n: 5 }));
    shrubs.push({ x: x0 + 2.2, z: z0 - 1.7, y: Y, r: 0.6, count: 4, spread: 1.3, seed: 6402 });
    shrubs.push({ x: x1 + 1.0, z: cz - 1.0, y: Y, r: 0.55, count: 4, spread: 1.4, seed: 6403 });
  }

  /* Gate, name plate and post box, in the *garden* fence.
   *
   * These first went three metres off the west corner, which put them in the
   * middle of the shrine alley -- one gatepost half a metre in front of the
   * camera as you walk up to the torii.  The lane belongs to the shrine; the
   * house's own frontage is its south fence. */
  {
    const gx = x0 + 1.75, gz = z0 - 2.4;
    for (const s of [-1, 1]) {
      const p = box(0.2, 1.7, 0.2, m.woodDark, gx + s * 0.75, Y + 0.85, gz);
      p.castShadow = true;
      g.add(p);
    }
    const nameP = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17),
      flat({ color: 0xffffff, map: namePlate(2), cache: false }));
    nameP.position.set(gx - 0.75, Y + 1.3, gz - 0.12);
    nameP.rotation.y = Math.PI;
    g.add(nameP);
    ctx.add(makePostBox({ x: gx + 1.4, z: gz - 0.35, y: Y, ry: 0.3 }));
  }

  const matFor = { wood: m.wood, dark: m.woodDark, roof: m.tileRoof, stone: m.concreteMid, metal: m.metal };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'roof' || key === 'wood') hullOutline(mesh, { thickness: 0.0034 });
  }
  ctx.collide(x0, z0 - 0.25, x1 + 0.15, z1 + 0.15, Y + 0.44 + WH);
  ctx.collide(x0 - 1.7, z0 + 0.5, x0, z1 - 0.5, Y + 0.58, Y + 0.42, true);
  for (const sz of [-1, 1]) {
    ctx.collide(x0 - 1.62, cz + sz * (D / 2 - 0.7) - 0.08, x0 - 0.08, cz + sz * (D / 2 - 0.7) + 0.08,
      Y + 0.50, Y, true);
  }
  return g;
}

/* ------------------------------------------------------------------ *
 * The sweep over the existing housing.
 *
 * The houses were always modular but never *inhabited*: same volume, same
 * render, nothing outside the front door.  This walks the same definitions
 * the house generator was given and puts washing, a post box, a name plate,
 * a bicycle, planters, a refuse point and the occasional lit window where
 * they belong -- in front of the frontage, at a lateral offset, and only
 * where there is actually room between the house and the kerb.
 * ------------------------------------------------------------------ */

const DIRS = { 'x-': [-1, 0], 'x+': [1, 0], 'z-': [0, -1], 'z+': [0, 1] };

function dressHousing(ctx, houses) {
  const m = mats();
  const rng = rngKit(8801);

  for (const h of houses) {
    const [fx, fz] = DIRS[h.face] ?? DIRS['x-'];
    const frontIsX = fx !== 0;
    const frontHalf = frontIsX ? h.w / 2 : h.d / 2;
    const sideHalf = frontIsX ? h.d / 2 : h.w / 2;
    const y = groundY(h.z);

    /* the point just outside the front door, and the two axes to work on */
    const px = h.x + fx * (frontHalf + 0.55);
    const pz = h.z + fz * (frontHalf + 0.55);
    // lateral unit vector along the frontage
    const lx = frontIsX ? 0 : 1;
    const lz = frontIsX ? 1 : 0;
    const at = (t, out = 0) => [px + lx * t + fx * out, pz + lz * t + fz * out];

    /* Skip anything that would land in the carriageway.  The frontage sits
     * anywhere from hard against the pavement to four metres back, so this
     * has to be checked rather than assumed. */
    const clear = (x, z) => Math.abs(x - centerX(z)) > ROAD_HALF + WALK_W - 0.35;
    const put = (obj, x, z) => { if (clear(x, z)) ctx.add(obj); };
    /* Anything standing on the ground is seated with `ctx.groundAt`, not with
     * `y`.  `y` is the street grade at the house's own centre, and half of
     * these plots front onto a 0.135 m footway or, on the canal's north bank,
     * onto made ground a third of a metre *below* the natural grade -- so a
     * prop placed at `y` is buried or in the air by that much. */
    const gy = (x, z) => ctx.groundAt(x, z);

    // name plate and post box beside the door
    {
      const t = Math.min(sideHalf - 0.5, 1.5);
      const nx = h.x + fx * (frontHalf + 0.045) + lx * t;
      const nz = h.z + fz * (frontHalf + 0.045) + lz * t;
      if (clear(nx, nz)) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.16),
          flat({ color: 0xffffff, map: namePlate(rng.int(0, 5)), cache: false }));
        plate.position.set(nx, y + 1.42, nz);
        plate.rotation.y = frontIsX ? fx * Math.PI / 2 : (fz > 0 ? 0 : Math.PI);
        ctx.add(plate);
      }
      const [bx, bz] = at(
        -Math.min(sideHalf - 0.6, 1.7) + (h.postBoxAlong ?? 0),
        h.postBoxOut ?? 0,
      );
      put(makePostBox({ x: bx, z: bz, y: gy(bx, bz) - (h.postBoxSink ?? 0), ry: rng.range(-0.4, 0.4) }), bx, bz);
    }

    /* Planters, bikes, laundry, aircon, umbrellas, bowls and gomi used to
     * dress every frontage. They closed the gaps a quad flies. Name plate
     * and post box stay: they sit on the wall. */

    /* A warm window on about a third of them.  Nothing behind the glass but
     * shelves and a lampshade -- there is nobody in this world. */
    if (rng.chance(0.34)) {
      const yy = y + (h.floors === 2 ? 2.72 + 1.5 : 1.42);
      const u = rng.range(-sideHalf * 0.5, sideHalf * 0.5);
      const wx = h.x + fx * (frontHalf + 0.06) + lx * u;
      const wz = h.z + fz * (frontHalf + 0.06) + lz * u;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1),
        flat({ color: 0xffffff, map: litWindowTex(rng.int(0, 2)), cache: false }));
      win.position.set(wx, yy, wz);
      win.rotation.y = frontIsX ? fx * Math.PI / 2 : (fz > 0 ? 0 : Math.PI);
      win.userData.noOutline = true;
      ctx.add(win);
    }
  }
}
