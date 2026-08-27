import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  shopFascia, shopBlade, norenTex, menuBoard, lanternTex, flagTex, gachaTex,
  shopInterior, shutterTex, poster, meterBox, litWindowTex, curtainTex, mirrored,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { skipClutter, strippedGroup } from './props.js';

/* ------------------------------------------------------------------ *
 * One shop generator, nine tenants.
 *
 * Every small business in the district -- the convenience store on the
 * 通学路, the ramen counter and the flower shop on the shopping street, the
 * bathhouse -- comes out of `makeShop`.  That is deliberate: a shopping
 * street reads as a street because its units share a construction and differ
 * only in colour, signage and clutter.
 *
 * The unit is authored facing +Z (frontage along X, depth along Z) and the
 * whole group is rotated by `face`, which is far less error-prone than
 * branching on an axis inside every measurement.
 *
 * The shopfront is a real recess: the solid volume stops 0.9 m short of the
 * frontage line and piers plus a header frame the hole.  A recess is what
 * gives the glass something to be in front of -- a glazed decal on a solid
 * box reads as a sticker, every time.
 * ------------------------------------------------------------------ */

const WALLS = [PAL.wallWhite, PAL.wallCream, PAL.wallBlue, PAL.wallBeige, PAL.wallGray, PAL.wallPink];
const ROOFS = [PAL.roofSlate, PAL.roofBlue, PAL.roofBrown, PAL.roofTeal];
const AWNINGS = [PAL.awningGreen, PAL.awningOrange, PAL.awningBlue, PAL.awningCream, PAL.red];

const M = {};
function mats() {
  if (M.walls) return M;
  M.walls = WALLS.map((c) => cel({ color: c, bands: 3, tint: 0x6f6790 }));
  M.roofs = ROOFS.map((c) => cel({ color: c, bands: 3, tint: 0x514b70 }));
  M.awnings = AWNINGS.map((c) => cel({ color: c, bands: 3, tint: 0x6f5680 }));
  M.trim = cel({ color: PAL.trim, bands: 3, tint: 0x5c5680 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.tile = cel({ color: 0xe9edf0, bands: 3, tint: 0x6f6790 });
  M.dark = cel({ color: PAL.blackSoft, bands: 2, tint: 0x4b4560 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  return M;
}

const FACE_RY = { 'z+': 0, 'z-': Math.PI, 'x+': Math.PI / 2, 'x-': -Math.PI / 2 };

/**
 * @param o.x,o.z      footprint centre
 * @param o.y          ground height
 * @param o.w,o.d      frontage width and depth
 * @param o.face       'z+' | 'z-' | 'x+' | 'x-'
 * @param o.kind       tenant key for the fascia / blade / noren art
 * @param o.floors     1 or 2
 * @param o.awning     false, or an index into AWNINGS
 * @param o.shutter    0 (open) .. 1 (shut); ~0.35 reads as "back in ten minutes"
 */
export function makeShop(ctx, o) {
  const m = mats();
  const rng = rngKit(o.seed ?? 13);
  const g = new THREE.Group();
  g.name = 'shop_' + (o.kind ?? 'unit');

  const w = o.w ?? 6.0;
  const d = o.d ?? 6.5;
  const floors = o.floors ?? 2;
  const H1 = o.h1 ?? 3.2;
  const H2 = o.h2 ?? 2.7;
  const H = floors === 2 ? H1 + H2 : H1;
  const REC = o.recess ?? 0.9;                    // depth of the shopfront recess
  const front = d / 2;
  const wallMat = m.walls[o.wall ?? rng.int(0, WALLS.length - 1)];
  const roofMat = m.roofs[o.roof ?? rng.int(0, ROOFS.length - 1)];

  const parts = { wall: [], trim: [], roof: [], metal: [], metalDark: [], tile: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* ------------------------------ main volume ------------------------------ */
  push('wall', new THREE.BoxGeometry(w, H1, d - REC), trs(0, H1 / 2, -REC / 2));
  push('trim', new THREE.BoxGeometry(w + 0.16, 0.4, d + 0.16), trs(0, 0.2, 0));
  if (floors === 2) {
    // upper storey, set back so the fascia and awning have somewhere to sit
    push('wall', new THREE.BoxGeometry(w, H2, d - 0.4), trs(0, H1 + H2 / 2, -0.2));
    push('trim', new THREE.BoxGeometry(w + 0.12, 0.16, d - 0.3), trs(0, H1, -0.2));
  }

  /* --------------------------------- roof --------------------------------- */
  if (o.roofKind === 'gable') {
    const eave = 0.42;
    const rw = w + eave * 2;
    const rd = d + eave * 2;
    const rh = o.roofH ?? 1.25;
    const slope = Math.atan2(rh, rw / 2);
    const slab = Math.hypot(rw / 2, rh) + 0.08;
    for (const s of [-1, 1]) {
      push('roof', new THREE.BoxGeometry(slab, 0.15, rd), trs(s * (rw / 4), H + rh / 2, -0.2, 0, 0, -s * slope));
    }
    push('roof', new THREE.BoxGeometry(0.24, 0.18, rd), trs(0, H + rh + 0.04, -0.2));
    const tri = new THREE.Shape();
    tri.moveTo(-w / 2, 0);
    tri.lineTo(w / 2, 0);
    tri.lineTo(0, rh * (1 - (eave * 2) / rw));
    tri.closePath();
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.16, bevelEnabled: false });
    triGeo.translate(0, 0, -0.08);
    for (const s of [-1, 1]) {
      push('wall', triGeo, trs(0, H, -0.2 + s * ((d - 0.4) / 2 - 0.08)));
    }
    triGeo.dispose();
  } else {
    push('roof', new THREE.BoxGeometry(w + 0.3, 0.2, (floors === 2 ? d - 0.4 : d) + 0.3), trs(0, H + 0.1, -0.2));
    // parapet, so a flat roof still has an edge to ink
    for (const s of [-1, 1]) {
      push('roof', new THREE.BoxGeometry(w + 0.3, 0.34, 0.14), trs(0, H + 0.37, -0.2 + s * ((floors === 2 ? d - 0.4 : d) / 2 + 0.14)));
      push('roof', new THREE.BoxGeometry(0.14, 0.34, (floors === 2 ? d - 0.4 : d) + 0.3), trs(s * (w / 2 + 0.14), H + 0.37, -0.2));
    }
  }

  /* --------------------------- the shopfront recess --------------------------- */
  const openW = Math.min(w - 1.0, o.openW ?? (w - 1.0));
  {
    // piers either side and a header over the opening
    const pierW = (w - openW) / 2;
    for (const s of [-1, 1]) {
      push('wall', new THREE.BoxGeometry(pierW, H1, REC), trs(s * (w - pierW) / 2, H1 / 2, front - REC / 2));
      push('tile', new THREE.BoxGeometry(pierW + 0.04, 0.62, 0.06), trs(s * (w - pierW) / 2, 0.31, front + 0.02));
    }
    push('wall', new THREE.BoxGeometry(openW, H1 - 2.55, REC), trs(0, H1 - (H1 - 2.55) / 2, front - REC / 2));
    // soffit and floor of the recess
    push('trim', new THREE.BoxGeometry(openW, 0.1, REC), trs(0, 2.5, front - REC / 2));
    push('tile', new THREE.BoxGeometry(openW, 0.1, REC + 0.1), trs(0, 0.05, front - REC / 2 + 0.05));

    /* The interior sits on the face of the solid volume, knocked well back
     * toward violet.  A shop interior has to be *darker* than the sunlit
     * frontage or the glass stops reading as glass. */
    const inner = new THREE.Mesh(
      new THREE.PlaneGeometry(openW - 0.1, 2.2),
      // `interiorMap` lets a tenant supply its own: the two Showa units on the
      // shopping street need shelves stacked to the ceiling, which is the one
      // thing `shopInterior` deliberately does not draw
      flat({ color: 0x8b8598, map: o.interiorMap ?? shopInterior(o.interior ?? 0), cache: false })
    );
    inner.position.set(0, 1.35, front - REC + 0.03);
    inner.userData.noOutline = true;
    g.add(inner);

    // glass across the front of the recess, plus mullions
    const glassW = openW;
    const pane = box(glassW, 2.3, 0.04,
      flat({ color: PAL.glass, transparent: true, opacity: 0.22, depthWrite: false, cache: false }),
      0, 1.35, front - 0.07);
    pane.userData.noOutline = true;
    pane.userData.noShadow = true;
    g.add(pane);
    const nm = Math.max(2, Math.round(glassW / 1.3));
    for (let i = 0; i <= nm; i++) {
      push('metal', new THREE.BoxGeometry(0.08, 2.35, 0.1), trs(-glassW / 2 + (glassW / nm) * i, 1.35, front - 0.07));
    }
    push('metal', new THREE.BoxGeometry(glassW + 0.1, 0.1, 0.14), trs(0, 2.5, front - 0.07));
    push('metal', new THREE.BoxGeometry(glassW + 0.1, 0.14, 0.16), trs(0, 0.2, front - 0.07));
    // one angled highlight, the way glass is painted
    const hi = new THREE.Mesh(
      new THREE.PlaneGeometry(glassW * 0.24, 2.5),
      flat({ color: 0xf2f8ff, transparent: true, opacity: 0.18, depthWrite: false, cache: false })
    );
    hi.position.set(-glassW * 0.22, 1.4, front - 0.04);
    hi.rotation.z = 0.3;
    hi.userData.noOutline = true;
    g.add(hi);
  }

  /* ---------------------------- shutter, if any ----------------------------
   * Half down is the useful state: it says the shop exists and is between
   * shifts, without needing anybody to be standing in the doorway. */
  if (o.shutter) {
    const tex = shutterTex(22);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const SH = 2.55 * o.shutter;
    const sl = box(openW - 0.1, SH, 0.06,
      cel({ color: PAL.shutter, bands: 3, map: tex, tint: 0x4b4560, cache: false }),
      0, 2.55 - SH / 2, front - 0.16);
    sl.castShadow = sl.receiveShadow = true;
    g.add(sl);
    push('metalDark', new THREE.BoxGeometry(openW + 0.14, 0.28, 0.2), trs(0, 2.66, front - 0.16));
    push('metalDark', new THREE.BoxGeometry(openW, 0.1, 0.1), trs(0, 2.55 - SH, front - 0.16));
  }

  /* ------------------------------ fascia sign ------------------------------
   * `fascia: false` for a unit that carries its name some other way.  The
   * bathhouse is the one: a 4.4 m storey under a gable whose eave projects
   * past the frontage puts this board inside the overhang, where it cannot be
   * seen from the street at any angle. */
  if (o.kind && o.fascia !== false) {
    /* `signBox: true` swaps the painted fascia for the shallow internally-lit
     * box a lot of these actually have: a deeper volume standing further
     * proud, the face warmed a couple of steps and set in a dark case rather
     * than sitting flush in the render.  The whole effect is the *case* --
     * `flat()` is already unlit, so a lit box cannot be made brighter, only
     * darker around the edges.  Worth having on two or three units per street:
     * it is the one warm accent up at fascia height that is not a lantern. */
    const lit = o.signBox === true;
    const dep = lit ? 0.26 : 0.12;
    const out = lit ? 0.11 : 0.02;
    const side = lit ? flat({ color: 0x3c3947 }) : flat({ color: PAL.wallGray });
    const top = lit ? flat({ color: 0x4a4653 }) : flat({ color: PAL.wallWhite });
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.2, 0.72, dep),
      [side, side, top, side,
       flat({ color: lit ? 0xfff0d2 : 0xffffff, map: shopFascia(o.kind), cache: false }),
       top]
    );
    board.position.set(0, H1 + 0.44, front + out);
    board.castShadow = true;
    g.add(board);
    hullOutline(board, { thickness: 0.0032 });
    if (lit) {
      // the case, a little larger all round and set back so it reads as a rim
      push('metalDark', new THREE.BoxGeometry(w - 0.04, 0.92, dep - 0.06), trs(0, H1 + 0.44, front + out - 0.05));
    }
    push('metal', new THREE.BoxGeometry(w - 0.14, 0.1, 0.2), trs(0, H1 + 0.86, front + out));
  }

  /* -------------------------------- awning -------------------------------- *
   * Stripes as geometry, not texture: under cel shading a painted stripe
   * flattens out and a modelled one keeps its edge. */
  if (o.awning !== undefined && o.awning !== false) {
    const out = o.awningOut ?? 1.5;
    const yA = H1 - 0.16;
    const drop = 0.4;
    const stripes = Math.max(6, Math.round(w / 0.42));
    const A = [], B = [];
    const sw = w / stripes;
    for (let i = 0; i < stripes; i++) {
      (i % 2 === 0 ? A : B).push({
        geometry: new THREE.BoxGeometry(sw, 0.07, out),
        matrix: trs(-w / 2 + sw * (i + 0.5), 0, out / 2),
      });
    }
    const grp = new THREE.Group();
    grp.position.set(0, yA, front);
    const cA = m.awnings[o.awning % AWNINGS.length];
    const cB = cel({ color: 0xf6f1e6, bands: 3, tint: 0x6f5680 });
    const mA = new THREE.Mesh(bake(A), cA);
    const mB = new THREE.Mesh(bake(B), cB);
    mA.castShadow = mB.castShadow = true;
    mA.receiveShadow = mB.receiveShadow = true;
    grp.add(mA, mB);
    grp.rotation.x = Math.atan2(drop, out);
    g.add(grp);
    hullOutline(mA, { thickness: 0.003 });

    const edgeZ = front + out * Math.cos(grp.rotation.x);
    const edgeY = yA - out * Math.sin(grp.rotation.x);
    const fascia = box(w, 0.3, 0.07, cA, 0, edgeY - 0.13, edgeZ - 0.03);
    fascia.castShadow = true;
    g.add(fascia);
    // scalloped lower edge
    const scGeo = new THREE.CircleGeometry(0.14, 10);
    const sc = [];
    const n = Math.round(w / 0.5);
    for (let i = 0; i < n; i++) sc.push({ geometry: scGeo, matrix: trs(-w / 2 + (w / n) * (i + 0.5), 0, 0) });
    const scm = new THREE.Mesh(bake(sc), cA);
    scm.position.set(0, edgeY - 0.28, edgeZ - 0.01);
    g.add(scm);
    for (const sx of [-1, 1]) {
      const arm = box(0.06, 0.06, out, m.metalDark, sx * (w / 2 - 0.3), 0, 0);
      arm.position.set(sx * (w / 2 - 0.3), yA - 0.05 - drop / 2, front + out / 2);
      arm.rotation.x = grp.rotation.x;
      g.add(arm);
    }
  }

  /* --------------------------- projecting blade sign --------------------------- */
  if (o.blade) {
    const bw = 0.52, bh = 1.9;
    const side = o.bladeSide ?? 1;
    const bx = side * (w / 2 - 0.18);
    const art = shopBlade(o.blade);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, bh, bw),
      // one map on both faces: BoxGeometry already reverses udir on the -x
      // face, so a mirrored clone there is what makes the reverse read backwards
      [flat({ color: 0xffffff, map: art, cache: false }),
       flat({ color: 0xffffff, map: art, cache: false }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
    );
    board.position.set(bx + side * 0.5, H1 + 1.5, front + 0.1);
    board.castShadow = true;
    g.add(board);
    hullOutline(board, { thickness: 0.003 });
    push('metal', new THREE.BoxGeometry(side * 0.62, 0.08, 0.08), trs(bx + side * 0.28, H1 + 2.32, front + 0.1));
    push('metal', new THREE.BoxGeometry(side * 0.62, 0.08, 0.08), trs(bx + side * 0.28, H1 + 0.7, front + 0.1));
  }

  /* -------------------------------- noren -------------------------------- */
  if (o.noren) {
    const nw = Math.min(2.4, openW * 0.7);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(nw, 0.72),
      flat({ color: 0xffffff, map: norenTex(o.noren), side: THREE.DoubleSide, cache: false })
    );
    cloth.position.set(o.norenX ?? 0, 2.06, front - 0.22);
    // a slight lift on one side: the doorway curtain is always caught by air
    cloth.rotation.z = 0.025;
    cloth.castShadow = true;
    g.add(cloth);
    push('metalDark', new THREE.BoxGeometry(nw + 0.2, 0.05, 0.05), trs(o.norenX ?? 0, 2.44, front - 0.22));
  }

  /* ---------------------------- upper storey windows ---------------------------- */
  if (floors === 2) {
    const cols = Math.max(1, Math.floor((w - 0.8) / 1.9));
    for (let i = 0; i < cols; i++) {
      const px = -w / 2 + (w * (i + 1)) / (cols + 1);
      const lit = o.lit && rng.chance(0.55);
      push('metal', new THREE.BoxGeometry(1.5, 1.3, 0.16), trs(px, H1 + 1.4, front - 0.2 + 0.08));
      const paneMat = lit
        ? flat({ color: 0xffffff, map: litWindowTex(i % 3), cache: false })
        : flat({ color: PAL.glassDark });
      g.add(box(1.34, 1.14, 0.06, paneMat, px, H1 + 1.4, front - 0.14));
      push('metal', new THREE.BoxGeometry(0.07, 1.14, 0.07), trs(px, H1 + 1.4, front - 0.12));
      push('trim', new THREE.BoxGeometry(1.7, 0.09, 0.22), trs(px, H1 + 0.72, front - 0.16));
      if (rng.chance(0.5)) {
        const cur = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.06),
          flat({ color: 0xe8e0d2, map: curtainTex(i % 2), cache: false }));
        cur.position.set(px + rng.sign() * 0.34, H1 + 1.4, front - 0.11);
        cur.userData.noOutline = true;
        g.add(cur);
      }
    }
    // a balcony rail on some units, and the laundry pole that goes with it
    if (o.balcony) {
      push('trim', new THREE.BoxGeometry(w - 0.6, 0.1, 0.8), trs(0, H1 + 0.5, front + 0.2));
      push('metal', new THREE.BoxGeometry(w - 0.6, 0.06, 0.06), trs(0, H1 + 1.42, front + 0.58));
      push('metalDark', new THREE.BoxGeometry(w - 0.6, 0.06, 0.06), trs(0, H1 + 0.62, front + 0.58));
      const nb = Math.round((w - 0.6) / 0.24);
      for (let i = 0; i <= nb; i++) {
        push('metal', new THREE.BoxGeometry(0.04, 0.9, 0.04), trs(-(w - 0.6) / 2 + ((w - 0.6) / nb) * i, H1 + 0.98, front + 0.58));
      }
    }
  }

  /* --------------------------- services and paper --------------------------- */
  {
    // downpipe on one corner, meter box, a couple of taped-up posters
    const s = rng.sign();
    push('metal', new THREE.CylinderGeometry(0.055, 0.055, H, 6), trs(s * (w / 2 - 0.1), H / 2, -(d - REC) / 2 - 0.1 + 0.02));
    const meter = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.44, 0.1),
      flat({ color: 0xffffff, map: meterBox(), cache: false }));
    meter.position.set(-s * (w / 2 - 0.42), 1.8, front - REC + 0.06);
    g.add(meter);
    if (o.posters !== false) {
      const n = Math.min(rng.int(1, 2), o.posterLimit ?? 2);
      for (let i = 0; i < n; i++) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.52),
          flat({ color: 0xffffff, map: poster(rng.int(0, 3)), cache: false }));
        p.position.set(rng.range(-w / 2 + 0.6, w / 2 - 0.6), 1.72 + rng.range(-0.1, 0.1), front + 0.03);
        p.rotation.z = rng.range(-0.03, 0.03);
        p.userData.noOutline = true;
        g.add(p);
      }
    }
  }

  const matFor = {
    wall: wallMat, trim: m.trim, roof: roofMat, metal: m.metal,
    metalDark: m.metalDark, tile: m.tile,
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof') hullOutline(mesh, { thickness: 0.0032 });
  }

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = FACE_RY[o.face ?? 'z+'];
  ctx.add(g);

  /* Collider in world axes. The unit was authored facing +Z. The solid
   * volume stops REC short of the frontage; piers and a header keep the
   * mouth, and the recess itself is air so a knife-edge line can use it. */
  const swap = o.face === 'x+' || o.face === 'x-';
  const hw = (swap ? d : w) / 2;
  const hd = (swap ? w : d) / 2;
  const roofAdd = o.roofKind === 'gable' ? (o.roofH ?? 1.25) + 0.22 : 0.4;
  const yBase = o.y ?? 0;
  const yTop = yBase + H + roofAdd;
  const pierW = (w - openW) / 2;
  const face = o.face ?? 'z+';
  if (face === 'z+' || face === 'z-') {
    const s = face === 'z+' ? 1 : -1;
    const back = o.z - s * hd;
    const mouth = o.z + s * (hd - REC);
    const front = o.z + s * hd;
    ctx.collide(o.x - hw - 0.05, Math.min(back, mouth) - 0.05,
      o.x + hw + 0.05, Math.max(back, mouth) + 0.05, yTop);
    ctx.collide(o.x - hw - 0.05, Math.min(mouth, front),
      o.x - hw + pierW, Math.max(mouth, front), yBase + H1);
    ctx.collide(o.x + hw - pierW, Math.min(mouth, front),
      o.x + hw + 0.05, Math.max(mouth, front), yBase + H1);
    ctx.collide(o.x - openW / 2, Math.min(mouth, front),
      o.x + openW / 2, Math.max(mouth, front), yBase + H1, yBase + 2.50, true);
  } else {
    const s = face === 'x+' ? 1 : -1;
    const back = o.x - s * hw;
    const mouth = o.x + s * (hw - REC);
    const front = o.x + s * hw;
    ctx.collide(Math.min(back, mouth) - 0.05, o.z - hd - 0.05,
      Math.max(back, mouth) + 0.05, o.z + hd + 0.05, yTop);
    ctx.collide(Math.min(mouth, front), o.z - hd - 0.05,
      Math.max(mouth, front), o.z - hd + pierW, yBase + H1);
    ctx.collide(Math.min(mouth, front), o.z + hd - pierW,
      Math.max(mouth, front), o.z + hd + 0.05, yBase + H1);
    ctx.collide(Math.min(mouth, front), o.z - openW / 2,
      Math.max(mouth, front), o.z + openW / 2, yBase + H1, yBase + 2.50, true);
  }

  /* Doorway curtain, a thin slab in world axes. The shop rectangle is the
   * whole unit; slab fit opens the recess, and this is the cloth in it. */
  if (o.noren) {
    const nw = Math.min(2.4, openW * 0.7);
    const nx = o.norenX ?? 0;
    const lz = front - 0.22;
    const y0 = (o.y ?? 0) + 1.70;
    const y1 = (o.y ?? 0) + 2.42;
    const t = 0.05;
    const face = o.face ?? 'z+';
    if (face === 'z+' || face === 'z-') {
      const s = face === 'z+' ? 1 : -1;
      const cx = o.x + s * nx;
      const cz = o.z + s * lz;
      ctx.collide(cx - nw / 2, cz - t, cx + nw / 2, cz + t, y1, y0);
    } else {
      const s = face === 'x+' ? 1 : -1;
      const cx = o.x + s * lz;
      const cz = o.z - s * nx;
      ctx.collide(cx - t, cz - nw / 2, cx + t, cz + nw / 2, y1, y0);
    }
  }

  g.userData.front = front;
  return g;
}

/* ------------------------------------------------------------------ *
 * Shop clutter.  The pavement outside is where a small shop actually
 * lives, so these get used far more than the buildings do.
 * ------------------------------------------------------------------ */

/** Paper lantern on a bracket or a wire. */
export function makePaperLantern(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const r = o.r ?? 0.16;
  const drop = o.drop ?? 0.3;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, r * 2.1, 12, 1, true),
    flat({ color: o.lit ? PAL.lanternLit : 0xffffff, map: lanternTex(o.variant ?? 0), side: THREE.DoubleSide, cache: false })
  );
  body.position.y = -r * 1.05;
  g.add(body);
  /* The paper is the only part that changes when one is switched on, and the
   * material is its own instance (a mapped `flat()` is never cached), so the
   * shopping street can hand these to an updater and ramp them. */
  g.userData.glow = body.material;
  for (const s of [-1, 1]) {
    g.add(cyl(r * 0.45, r * 0.45, 0.04, 10, m.metalDark, 0, s * r * 2.1, 0));
  }
  g.add(cyl(0.012, 0.012, drop, 4, m.metalDark, 0, drop / 2, 0));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  /* Hung lanterns sit more than a metre off the ground, so the cover
   * pass never sees them. The paper body is the hit. */
  if (o.ctx) {
    const y1 = o.y ?? 0;
    o.ctx.collide(o.x - r, o.z - r, o.x + r, o.z + r, y1, y1 - r * 2.2);
  }
  return g;
}

/** Chalked menu board, leaned against the frontage. */
export function makeMenuBoard(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.82, 0.05),
    [m.wood, m.wood, m.wood, m.wood,
     flat({ color: 0xffffff, map: menuBoard(), cache: false }), m.wood]
  );
  board.position.set(0, 0.62, 0);
  board.rotation.x = -0.2;
  board.castShadow = true;
  g.add(board);
  hullOutline(board, { thickness: 0.003 });
  for (const s of [-1, 1]) {
    const leg = box(0.06, 0.86, 0.06, m.wood, s * 0.24, 0.42, -0.16);
    leg.rotation.x = 0.24;
    g.add(leg);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** Ice-cream freezer chest, the reliable bright accent by a shop door. */
export function makeFreezer(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const body = box(1.15, 0.86, 0.66, cel({ color: PAL.freezer, bands: 3, tint: 0x6a6288 }), 0, 0.43, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  hullOutline(body, { thickness: 0.0034 });
  /* **The top is a rim, not a slab.**  It was a solid 1.19 x 0.06 x 0.7 box at
   * y = 0.88 with the 1.0 x 0.04 x 0.54 glass lid at 0.87 -- entirely *inside*
   * it, sharing its underside at 0.85 exactly, which is a coin toss the render
   * loses: the lid read as a doubled edge across the chest's top and the nine
   * coloured wrappers at 0.80 were behind opaque metal, the same mistake the
   * vending machines' stock made. */
  for (const s of [-1, 1]) {
    g.add(box(1.19, 0.06, 0.08, m.metal, 0, 0.88, s * 0.31));
    g.add(box(0.09, 0.06, 0.7, m.metal, s * 0.55, 0.88, 0));
  }
  // sliding glass lids, and the coloured wrappers under them
  const lid = box(1.0, 0.03, 0.54,
    flat({ color: 0xdff0f8, transparent: true, opacity: 0.4, depthWrite: false, cache: false }),
    0, 0.885, 0);
  lid.userData.noOutline = true;
  g.add(lid);
  const cols = [0xe0453f, 0x3d6ec4, 0xf4c033, 0x2f9c9a, 0xe86f9c, 0xef8a3c];
  for (let i = 0; i < 9; i++) {
    g.add(box(0.11, 0.05, 0.16, cel({ color: cols[i % cols.length], bands: 2, tint: 0x6f6790 }),
      -0.44 + (i % 5) * 0.22, 0.8, -0.14 + ((i / 5) | 0) * 0.22));
  }
  // the red band and the price strip every one of these has
  g.add(box(1.17, 0.2, 0.68, cel({ color: PAL.red, bands: 3, tint: 0x7a4060 }), 0, 0.6, 0));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.62),
    flat({ color: 0xffffff, map: flagTex(0), cache: false }));
  sign.position.set(0.34, 0.42, 0.34);
  g.add(sign);
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** A bank of capsule-toy machines outside the stationery shop. */
export function makeGachapon(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const n = o.n ?? 3;
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) * 0.42) / 2 + i * 0.42;
    const body = box(0.4, 1.42, 0.44, cel({ color: [0xe0453f, 0xf4c033, 0x3d6ec4][i % 3], bands: 3, tint: 0x6f6790 }), x, 0.71, 0);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 12, 8),
      flat({ color: 0xffffff, map: gachaTex(), cache: false })
    );
    dome.position.set(x, 1.14, 0.06);
    g.add(dome);
    g.add(box(0.36, 0.24, 0.06, m.dark, x, 0.62, 0.23));
    g.add(cyl(0.05, 0.05, 0.06, 8, m.metal, x, 0.78, 0.24).rotateX(Math.PI / 2));
    g.add(box(0.3, 0.16, 0.04, flat({ color: 0xf6f2e8 }), x, 0.38, 0.23));
  }
  g.add(box(n * 0.42 + 0.06, 0.06, 0.5, m.metalDark, 0, 0.03, 0));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** Stack of plastic crates and produce baskets outside a greengrocer. */
export function makeProduceStack(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const rng = rngKit(o.seed ?? 21);
  const g = new THREE.Group();
  const crateA = cel({ color: PAL.crate, bands: 3, tint: 0x4a4a92 });
  const crateB = cel({ color: PAL.crateAlt, bands: 3, tint: 0x7a4060 });
  const crateC = cel({ color: 0x4f9d6a, bands: 3, tint: 0x4a4a92 });
  const layout = [[0, 0], [0, 1], [0.6, 0], [0.6, 1], [0.6, 2], [1.2, 0]];
  layout.forEach(([dx, ly], i) => {
    const c = box(0.54, 0.28, 0.38, [crateA, crateB, crateC][i % 3], dx, 0.14 + ly * 0.28, rng.range(-0.04, 0.04));
    c.castShadow = c.receiveShadow = true;
    g.add(c);
    g.add(box(0.48, 0.05, 0.32, cel({ color: 0x2f3140, bands: 2 }), dx, 0.27 + ly * 0.28, 0));
  });
  // the top crate has something in it
  const blob = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(blob, cel({
      color: rng.pick([0xf0a63c, 0x8fbf4a, 0xe0574a, 0xefe0b0]), bands: 2, tint: 0x6f6790,
    }));
    const r = rng.range(0.06, 0.09);
    f.position.set(0.6 + rng.range(-0.18, 0.18), 0.86 + r, rng.range(-0.13, 0.13));
    f.scale.setScalar(r);
    f.castShadow = true;
    g.add(f);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** Promotional flag on a short pole, clipped to a shopfront. */
export function makeShopFlag(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const pole = cyl(0.022, 0.022, 1.9, 5, m.metal, 0, 0.95, 0);
  pole.castShadow = true;
  g.add(pole);
  g.add(cyl(0.13, 0.15, 0.1, 10, m.concrete, 0, 0.05, 0));
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 1.0),
    flat({ color: 0xffffff, map: flagTex(o.variant ?? 0), side: THREE.DoubleSide, cache: false })
  );
  cloth.position.set(0.2, 1.28, 0.02);
  cloth.rotation.y = 0.12;
  cloth.castShadow = true;
  g.add(cloth);
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  /* Pole plus a plane fails the cover fill test, so a kerbside flag
   * you can split has to be authored. Tight column on the pole and
   * the cloth, not the air beside it. */
  if (o.ctx) {
    const y = o.y ?? 0;
    const ry = o.ry ?? 0;
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    o.ctx.collide(o.x - 0.04, o.z - 0.04, o.x + 0.04, o.z + 0.04, y + 1.9, y);
    const cx = o.x + c * 0.2 - s * 0.02;
    const cz = o.z + s * 0.2 + c * 0.02;
    const wx = Math.abs(c) * 0.22 + Math.abs(s) * 0.04;
    const wz = Math.abs(s) * 0.22 + Math.abs(c) * 0.04;
    o.ctx.collide(cx - wx, cz - wz, cx + wx, cz + wz, y + 1.78, y + 0.78);
  }
  return g;
}
