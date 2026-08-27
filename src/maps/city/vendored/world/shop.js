import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { shopSign, shopBanner, poster, shutterTex, warningPlate, meterBox } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit, shadowify } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { centerX, groundY, ROAD_HALF, WALK_W, WALK_H } from './street.js';
import { makeVendingMachine } from './vending.js';

/* ------------------------------------------------------------------ *
 * 青空商店 -- the corner shop by the crossing.
 *
 * Red-and-white striped awning, a half-closed shutter, a wall of posters,
 * stacked drink crates and two vending machines: the cluttered, colourful
 * anchor of the middle ground.  All the clutter lives on the pavement
 * strip so the frame stays organised rather than merely busy.
 * ------------------------------------------------------------------ */

export function buildShop(ctx) {
  const rng = rngKit(3311);
  const g = new THREE.Group();
  g.name = 'shop';
  ctx.add(g);

  const zNear = 4.55;
  const zFar = 12.6;
  const zMid = (zNear + zFar) / 2;
  const xFront = centerX(zMid) + ROAD_HALF + WALK_W + 0.12;
  const depth = 7.2;
  const y0 = groundY(zMid);

  const matWall = cel({ color: PAL.wallCream, bands: 3, tint: 0x6f6790 });
  const matWall2 = cel({ color: PAL.wallWhite, bands: 3, tint: 0x6f6790 });
  const matTile = cel({ color: 0xe9edf0, bands: 3, tint: 0x6f6790 });
  const matRoof = cel({ color: PAL.roofSlate, bands: 3, tint: 0x544e74 });
  const matRed = cel({ color: PAL.red, bands: 3, tint: 0x7a4060 });
  const matRedSoft = cel({ color: PAL.redSoft, bands: 3, tint: 0x7a4060 });
  const matMetal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  const matMetalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  const matDark = cel({ color: PAL.blackSoft, bands: 2, tint: 0x4b4560 });
  const matGlass = flat({ color: PAL.glass, transparent: true, opacity: 0.5, depthWrite: false, cache: false });

  const H1 = 3.15;   // ground floor height
  const H2 = 2.75;   // upper floor

  /* ------------------------------ main volume ------------------------------ */
  {
    const b = box(depth, H1, zFar - zNear, matWall, xFront + depth / 2, y0 + H1 / 2, zMid);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    hullOutline(b, { thickness: 0.0032 });

    // upper storey, set back a little from the shopfront
    const b2 = box(depth - 0.5, H2, zFar - zNear - 0.3, matWall2,
      xFront + 0.35 + (depth - 0.5) / 2, y0 + H1 + H2 / 2, zMid);
    b2.castShadow = b2.receiveShadow = true;
    g.add(b2);
    hullOutline(b2, { thickness: 0.0032 });

    // parapet + roof cap
    g.add(box(depth - 0.4, 0.22, zFar - zNear - 0.2, matRoof, xFront + 0.4 + (depth - 0.5) / 2, y0 + H1 + H2 + 0.11, zMid));
    // string course between floors
    g.add(box(depth + 0.06, 0.18, zFar - zNear + 0.06, matRoof, xFront + depth / 2, y0 + H1 + 0.05, zMid));

    const zc = zNear + 4.35;
    const bay = 1.5;
    const rec = 0.45;
    ctx.collide(xFront - 0.05, zNear, xFront + depth, zc - bay, y0 + H1 + H2);
    ctx.collide(xFront - 0.05, zc + bay, xFront + depth, zFar, y0 + H1 + H2);
    ctx.collide(xFront + rec, zc - bay, xFront + depth, zc + bay, y0 + H1 + H2);
    ctx.collide(xFront - 0.05, zc - bay, xFront + rec, zc + bay, y0 + H1 + H2, y0 + H1 - 0.55, true);
  }

  /* ------------------------- tiled base along the front ------------------------- */
  g.add(box(0.1, 0.55, zFar - zNear, matTile, xFront - 0.04, y0 + 0.27, zMid));

  /* -------------------------------- shutter -------------------------------- */
  const shutterGroup = new THREE.Group();
  let shutterState = null;
  {
    const zc = zNear + 4.35;
    const w = 3.0;
    const boxGuide = box(0.18, 0.34, w + 0.3, matMetalDark, xFront - 0.02, y0 + H1 - 0.22, zc);
    g.add(boxGuide);
    for (const s of [-1, 1]) {
      g.add(box(0.2, H1 - 0.4, 0.14, matMetalDark, xFront - 0.03, y0 + (H1 - 0.4) / 2, zc + s * (w / 2 + 0.07)));
    }
    // recessed doorway behind the shutter, kept readable rather than black
    g.add(box(0.5, H1 - 0.5, w, cel({ color: 0x9c95a6, bands: 2, tint: 0x6b6488 }), xFront + 0.3, y0 + (H1 - 0.5) / 2, zc));

    const tex = shutterTex(26);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const shutterMat = cel({ color: PAL.shutter, bands: 3, map: tex, tint: 0x4b4560, cache: false });
    const SH = H1 - 0.55;
    const SH_TOP = y0 + SH;
    const slat = box(0.07, SH, w, shutterMat, 0, 0, 0);
    slat.castShadow = slat.receiveShadow = true;
    shutterGroup.add(slat);
    shutterGroup.userData.planetRigid = true;   // animated: keep its own pivot
    shutterGroup.position.set(xFront - 0.055, y0 + SH / 2, zc);
    g.add(shutterGroup);
    hullOutline(slat, { thickness: 0.003 });

    // bottom rail travels with the lower edge but never squashes
    const rail = box(0.11, 0.11, w + 0.02, matMetalDark, xFront - 0.055, y0 + 0.05, zc);
    g.add(rail);
    shutterState = { group: shutterGroup, rail, SH, SH_TOP, w, zc };

    const hit = box(0.8, 2.2, w, flat({ color: 0xff0000, cache: false }), xFront - 0.4, y0 + 1.1, zc);
    hit.visible = false;
    g.add(hit);
    ctx.interact({
      hitbox: hit,
      label: 'シャッター  ·  open the shutter',
      action: () => shopState.toggleShutter(),
    });
  }

  /* ------------------------------ shopfront glass ------------------------------ */
  {
    const zc = zFar - 1.15;
    const w = 1.9;
    g.add(box(0.12, H1 - 0.9, w, matGlass, xFront - 0.05, y0 + 0.45 + (H1 - 0.9) / 2, zc));
    // mullions
    for (const dz of [-1.0, 0, 1.0]) {
      g.add(box(0.16, H1 - 0.85, 0.09, matMetal, xFront - 0.06, y0 + 0.45 + (H1 - 0.9) / 2, zc + dz));
    }
    g.add(box(0.2, 0.45, w + 0.1, matTile, xFront - 0.06, y0 + 0.22, zc));
    g.add(box(0.2, 0.16, w + 0.1, matMetal, xFront - 0.06, y0 + H1 - 0.5, zc));
    // warm interior glimpse
    g.add(box(0.5, H1 - 1.1, w - 0.3, flat({ color: 0xe8dfc8 }), xFront + 0.35, y0 + 0.5 + (H1 - 1.1) / 2, zc));
    // shelving silhouettes inside
    for (let i = 0; i < 3; i++) {
      g.add(box(0.3, 0.08, w - 0.5, cel({ color: 0xbdb3a0, bands: 2 }), xFront + 0.2, y0 + 0.8 + i * 0.55, zc));
    }
  }

  /* -------------------------------- awning -------------------------------- */
  {
    // The awning starts past the vending bay: run it all the way to the corner
    // and it shades the machines, which then stop working as bright accents.
    const zA = zNear + 2.95;
    const zB = zFar + 0.05;
    const len = zB - zA;
    const out = 1.85;
    const yA = y0 + H1 - 0.18;
    const drop = 0.42;

    // sloping canvas built from alternating stripes, so the red/white banding
    // is geometry rather than a texture -- crisper under cel shading
    const stripes = 18;
    const partsA = [];
    const partsB = [];
    const sw = len / stripes;
    for (let i = 0; i < stripes; i++) {
      const geo = new THREE.BoxGeometry(out, 0.07, sw);
      (i % 2 === 0 ? partsA : partsB).push({
        geometry: geo,
        matrix: trs(-out / 2, 0, zA + sw * (i + 0.5) - (zA + zB) / 2),
      });
    }
    const canvasGrp = new THREE.Group();
    canvasGrp.position.set(xFront, yA, (zA + zB) / 2);
    const mA = new THREE.Mesh(bake(partsA), matRed);
    const mB = new THREE.Mesh(bake(partsB), matRedSoft);
    mA.castShadow = mB.castShadow = true;
    mA.receiveShadow = mB.receiveShadow = true;
    canvasGrp.add(mA, mB);
    // positive Z rotation drops the outward (-X) edge
    const slope = Math.atan2(drop, out);
    canvasGrp.rotation.z = slope;
    g.add(canvasGrp);
    hullOutline(mA, { thickness: 0.003 });
    hullOutline(mB, { thickness: 0.003 });

    const edgeX = xFront - out * Math.cos(slope);
    const edgeY = yA - out * Math.sin(slope);

    // front fascia with a scalloped lower edge
    const fascia = box(0.08, 0.34, len, matRed, edgeX + 0.03, edgeY - 0.15, (zA + zB) / 2);
    fascia.castShadow = true;
    g.add(fascia);
    hullOutline(fascia, { thickness: 0.003 });
    const scallops = Math.round(len / 0.55);
    const scGeo = new THREE.CircleGeometry(0.16, 12);
    const scParts = [];
    for (let i = 0; i < scallops; i++) {
      scParts.push({
        geometry: scGeo,
        matrix: trs(0, 0, zA + (len / scallops) * (i + 0.5) - (zA + zB) / 2, 0, -Math.PI / 2, 0),
      });
    }
    const sc = new THREE.Mesh(bake(scParts), matRed);
    sc.position.set(edgeX - 0.012, edgeY - 0.32, (zA + zB) / 2);
    g.add(sc);

    // support arms
    for (const zc of [zA + 0.5, (zA + zB) / 2, zB - 0.5]) {
      const arm = box(out * 1.02, 0.07, 0.07, matMetalDark, 0, 0, 0);
      arm.position.set(xFront - out / 2 * Math.cos(slope), yA - (out / 2) * Math.sin(slope) - 0.08, zc);
      arm.rotation.z = slope;
      g.add(arm);
      const strut = box(0.06, 0.78, 0.06, matMetalDark, xFront - 0.14, yA - 0.4, zc);
      strut.rotation.z = -0.42;
      g.add(strut);
    }
  }

  /* ------------------------------- shop sign ------------------------------- */
  {
    const zc = zMid + 0.1;
    const len = 5.6;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.78, len),
      [flat({ color: 0xffffff, map: shopSign(), cache: false }),
       flat({ color: PAL.wallWhite }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallWhite }), flat({ color: PAL.wallWhite })]
    );
    board.position.set(xFront - 0.06, y0 + H1 + 0.62, zc);
    board.castShadow = true;
    g.add(board);
    hullOutline(board, { thickness: 0.0034 });
    g.add(box(0.2, 0.1, len + 0.1, matMetal, xFront - 0.06, y0 + H1 + 1.05, zc));
  }

  /* ------------------------------ upper storey ------------------------------ */
  {
    // the upper storey is set back, so its facade sits at xWall
    const xWall = xFront + 0.35;
    const yW = y0 + H1 + 1.38;
    for (const zc of [zNear + 2.0, zNear + 4.6, zFar - 1.1]) {
      g.add(box(0.16, 1.44, 1.66, matMetal, xWall + 0.05, yW, zc));                   // frame
      g.add(box(0.05, 1.26, 1.5, flat({ color: PAL.glassDark }), xWall - 0.035, yW, zc)); // glass
      g.add(box(0.05, 1.26, 0.07, matMetal, xWall - 0.07, yW, zc));                    // mullion
      g.add(box(0.2, 0.09, 1.74, matMetal, xWall, yW - 0.78, zc));                     // sill
      // a flat highlight across the glass
      const hi = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.7),
        flat({ color: 0xeaf3fb, transparent: true, opacity: 0.22, depthWrite: false, cache: false }));
      hi.position.set(xWall - 0.09, yW, zc - 0.28);
      hi.rotation.set(0, -Math.PI / 2, 0.4);
      hi.userData.noOutline = true;
      g.add(hi);
    }
    // balcony over the middle window, cantilevered out to the shopfront line
    const bz = zNear + 4.6;
    const bx = xFront + 0.02;
    g.add(box(0.42, 0.09, 2.2, matMetalDark, bx + 0.18, y0 + H1 + 0.62, bz));
    for (const y of [0.44, 0.9]) {
      g.add(box(0.06, 0.06, 2.2, matMetal, bx, y0 + H1 + 0.62 + y, bz));
    }
    for (let i = 0; i <= 9; i++) {
      g.add(box(0.04, 0.52, 0.04, matMetal, bx, y0 + H1 + 0.9, bz - 1.05 + i * 0.233));
    }
    // laundry hung out to dry
    g.add(box(0.04, 0.04, 1.9, matMetal, bx + 0.05, y0 + H1 + 1.62, bz));
    const towels = [[0.34, 0.6, PAL.wallBlue], [0.28, 0.48, PAL.blossom], [0.3, 0.54, PAL.wallWhite]];
    towels.forEach(([w, h, c], i) => {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        cel({ color: c, bands: 2, side: THREE.DoubleSide, tint: 0x6f6790 }));
      t.position.set(bx + 0.05, y0 + H1 + 1.6 - h / 2, bz - 0.62 + i * 0.62);
      t.rotation.y = Math.PI / 2;
      t.castShadow = true;
      g.add(t);
    });
  }

  /* ------------------------- wall clutter and services ------------------------- */
  {
    // air-conditioning unit
    const ac = box(0.62, 0.62, 0.95, cel({ color: 0xe4e2e6, bands: 3, tint: 0x6f6790 }),
      xFront + 0.3, y0 + H1 + 0.45, zFar - 0.75);
    ac.castShadow = true;
    g.add(ac);
    g.add(cyl(0.22, 0.22, 0.06, 12, matMetalDark, xFront - 0.02, y0 + H1 + 0.45, zFar - 0.75).rotateZ(Math.PI / 2));
    // pipes running down the wall
    for (const [zc, h] of [[zFar - 0.2, H1], [zNear + 0.35, H1 + 1.2]]) {
      const p = cyl(0.05, 0.05, h, 8, matMetal, xFront - 0.06, y0 + h / 2, zc);
      g.add(p);
      for (let i = 0; i < Math.floor(h / 1.1); i++) {
        g.add(box(0.1, 0.06, 0.1, matMetalDark, xFront - 0.04, y0 + 0.6 + i * 1.1, zc));
      }
    }
    // electricity meter box
    const meter = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.36),
      [flat({ color: 0xffffff, map: meterBox(), cache: false }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]);
    meter.position.set(xFront - 0.06, y0 + 1.75, zNear + 0.75);
    g.add(meter);

    // posters taped beside the door
    [0, 1, 2].forEach((v, i) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.58),
        flat({ color: 0xffffff, map: poster(v), cache: false }));
      p.position.set(xFront - 0.055, y0 + 1.92 - (i % 2) * 0.12, zNear + 2.55 + i * 0.48);
      p.rotation.y = -Math.PI / 2;
      p.rotation.z = rng.range(-0.03, 0.03);
      p.userData.noOutline = true;
      g.add(p);
    });

    // hanging vertical banner
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.7),
      flat({ color: 0xffffff, map: shopBanner(), side: THREE.DoubleSide, cache: false }));
    banner.position.set(xFront - 1.6, y0 + H1 - 1.35, zNear + 0.55);
    banner.rotation.y = -Math.PI / 2;
    banner.castShadow = true;
    g.add(banner);
    g.add(box(0.04, 0.04, 0.5, matMetalDark, xFront - 1.6, y0 + H1 - 0.5, zNear + 0.55));

    // security-camera plate high on the corner
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.6),
      flat({ color: 0xffffff, map: warningPlate(0), cache: false }));
    plate.position.set(xFront - 0.055, y0 + 2.55, zNear + 1.0);
    plate.rotation.y = -Math.PI / 2;
    g.add(plate);

    /* The north gable faces straight back down the street, so it reads as a
     * large blank field unless it is dressed: pipes, a meter, a window and a
     * ladder break it into legible bands. */
    const zN = zFar + 0.01;
    g.add(box(depth - 0.6, 0.16, 0.14, matRoof, xFront + 0.4 + depth / 2 - 0.3, y0 + 1.55, zN));
    for (const xo of [1.5, 4.9]) {
      const p = cyl(0.05, 0.05, H1 + 0.4, 8, matMetal, xFront + xo, y0 + (H1 + 0.4) / 2, zN + 0.04);
      g.add(p);
      for (let i = 0; i < 3; i++) {
        g.add(box(0.11, 0.06, 0.11, matMetalDark, xFront + xo, y0 + 0.7 + i * 1.1, zN + 0.08));
      }
    }
    // small frosted window, upper storey
    g.add(box(1.05, 0.95, 0.14, matMetal, xFront + 2.9, y0 + H1 + 1.5, zN - 0.02));
    g.add(box(0.9, 0.8, 0.06, flat({ color: 0xc4d2dc }), xFront + 2.9, y0 + H1 + 1.5, zN + 0.05));
    g.add(box(0.06, 0.8, 0.07, matMetal, xFront + 2.9, y0 + H1 + 1.5, zN + 0.08));
    // access ladder up to the roof
    for (const dz of [0, 0.42]) {
      g.add(box(0.05, H2 + 0.5, 0.05, matMetalDark, xFront + 5.6, y0 + H1 + (H2 + 0.5) / 2, zN + 0.12 + dz * 0));
      g.add(box(0.05, H2 + 0.5, 0.05, matMetalDark, xFront + 5.6 + 0.42, y0 + H1 + (H2 + 0.5) / 2, zN + 0.12));
    }
    for (let i = 0; i < 7; i++) {
      g.add(box(0.46, 0.035, 0.035, matMetalDark, xFront + 5.81, y0 + H1 + 0.25 + i * 0.42, zN + 0.12));
    }
    // a couple of posters on the gable
    [3, 1].forEach((v, i) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.6),
        flat({ color: 0xffffff, map: poster(v), cache: false }));
      p.position.set(xFront + 0.75 + i * 0.55, y0 + 1.05, zN + 0.05);
      p.rotation.z = rng.range(-0.02, 0.02);
      p.userData.noOutline = true;
      g.add(p);
    });
  }

  /* --------------------------- pavement clutter --------------------------- */
  const walkY = y0 + WALK_H;
  {
    // stacked drink crates
    const crateA = cel({ color: PAL.crate, bands: 3, tint: 0x4a4a92 });
    const crateB = cel({ color: PAL.crateAlt, bands: 3, tint: 0x7a4060 });
    const stack = new THREE.Group();
    const cw = 0.52, ch = 0.29, cd = 0.36;
    const layout = [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0.58, 0, 0.05], [0.58, 1, 0.05], [-0.05, 0, 0.42]];
    layout.forEach(([dx, ly, dz], i) => {
      const c = box(cw, ch, cd, i % 2 ? crateA : crateB, dx, ch / 2 + ly * ch, dz);
      c.castShadow = c.receiveShadow = true;
      stack.add(c);
      // hollow rim
      stack.add(box(cw - 0.06, 0.05, cd - 0.06, cel({ color: 0x2f3140, bands: 2 }), dx, ch - 0.01 + ly * ch, dz));
    });
    stack.position.set(xFront + 0.55, walkY, zFar - 0.85);
    g.add(stack);
    ctx.collide(xFront + 0.2, zFar - 1.4, xFront + 1.35, zFar - 0.3, walkY + 0.9);

    // produce baskets by the door
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.16, 10),
        cel({ color: i === 1 ? PAL.basket : PAL.crate, bands: 3, tint: 0x6f6790 }));
      // Table top is walkY + 0.305; add half the basket height so every
      // basket rests on it instead of intersecting it or hovering above it.
      b.position.set(xFront - 0.7 + i * 0.05, walkY + 0.385, zFar - 2.9 + i * 0.52);
      b.castShadow = true;
      g.add(b);
      // contents: a couple of bright rounded shapes
      for (let k = 0; k < 3; k++) {
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0),
          cel({ color: [0xf0a63c, 0x8fbf4a, 0xe0574a][k], bands: 2, tint: 0x6f6790 }));
        f.position.set(b.position.x + rng.range(-0.1, 0.1), b.position.y + 0.1, b.position.z + rng.range(-0.1, 0.1));
        g.add(f);
      }
    }
    // trestle table under the baskets
    g.add(box(0.6, 0.05, 1.7, cel({ color: PAL.metalWarm, bands: 3 }), xFront - 0.68, walkY + 0.28, zFar - 2.4));
    for (const dz of [-0.7, 0.7]) {
      g.add(box(0.05, 0.28, 0.05, matMetalDark, xFront - 0.68, walkY + 0.14, zFar - 2.4 + dz));
      ctx.collide(xFront - 0.74, zFar - 2.4 + dz - 0.04, xFront - 0.62, zFar - 2.4 + dz + 0.04,
        walkY + 0.30, walkY, true);
    }
    ctx.collide(xFront - 1.00, zFar - 3.3, xFront - 0.36, zFar - 1.5, walkY + 0.32, walkY + 0.24, true);

    // bin beside the shutter
    const binZ = zNear + 0.12;
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.21, 0.72, 12),
      cel({ color: PAL.bin, bands: 3, tint: 0x4a4a92 }));
    bin.position.set(xFront - 0.62, walkY + 0.36, binZ);
    bin.castShadow = true;
    g.add(bin);
    g.add(cyl(0.26, 0.26, 0.06, 12, matMetalDark, xFront - 0.62, walkY + 0.74, binZ));
  }

  /* ---------------------------- vending machines ---------------------------- */
  const vends = [];
  {
    const spots = [
      { variant: 0, z: zNear + 1.0, seed: 1 },
      { variant: 2, z: zNear + 2.25, seed: 2 },
    ];
    for (const s of spots) {
      const v = makeVendingMachine(s.variant, s.seed);
      v.position.set(xFront - 0.42, walkY, s.z);
      v.rotation.y = -Math.PI / 2;
      shadowify(v, true, true);
      g.add(v);
      vends.push(v);
      ctx.collide(xFront - 0.85, s.z - 0.6, xFront + 0.02, s.z + 0.6, walkY + 2.0);
      ctx.interact({
        hitbox: v.userData.hitbox,
        label: '自動販売機  ·  buy a drink',
        action: () => shopState.dispense(v),
      });
    }
  }

  /* ------------------------------ shop state ------------------------------ */
  const shopState = {
    shutterOpen: 0,
    shutterTarget: 0.0,
    _anims: [],
    toggleShutter() {
      this.shutterTarget = this.shutterTarget > 0.5 ? 0 : 1;
    },
    dispense(v) {
      const step = v.userData.dispense();
      this._anims.push(step);
    },
    update(dt) {
      const k = 1 - Math.exp(-dt * 2.6);
      this.shutterOpen += (this.shutterTarget - this.shutterOpen) * k;
      // the curtain rolls up into the drum: top edge pinned, height shrinks
      const s = shutterState;
      const sy = Math.max(0.08, 1 - this.shutterOpen * 0.92);
      s.group.scale.y = sy;
      s.group.position.y = s.SH_TOP - (s.SH * sy) / 2;
      s.rail.position.y = s.SH_TOP - s.SH * sy + 0.05;
      this._anims = this._anims.filter((fn) => !fn(dt));
    },
  };
  // start with the shutter mostly down: it reads better as a graphic block
  shopState.shutterTarget = 0.18;
  shopState.shutterOpen = 0.18;
  ctx.update((dt) => shopState.update(dt));

  return { group: g, xFront, zNear, zFar, walkY, shopState };
}
