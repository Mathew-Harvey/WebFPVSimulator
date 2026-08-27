import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  onsenFascia, onsenBlade, onsenNoren, houraiFuji, ashiyuPlate,
  tatamiRoom, onsenLanternTex, yunosakaBoard, poster, paperSheet,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { pad, steps, wallRun, railing, dapple, groundMats } from './ground.js';
import { addVending } from './vending.js';
import {
  makeBench, makeSignPost, makePlanter, makeUmbrellaStand, makeCrates,
  makeBucket, makeBroom, makeMilkCrate, makeVendBin, makeLoosePaper,
  makeDoormat, makeCatBox, makePotShelf, makeBins,
} from './props.js';

/* ------------------------------------------------------------------ *
 * 湯の坂 -- the onsen street.
 *
 * A terrace of hot-spring buildings on the shelf behind the shrine, one
 * flight above the precinct and two above the fields, reached through a back
 * gate in the shrine's north wall.  Everything about it is chosen against the
 * shopping street, because a town with two shopping streets has one shopping
 * street twice:
 *
 *  - **Materials, not colours.**  さくら坂 is enamel, plastic awnings and lit
 *    sign boxes.  This is dark timber, plaster, tile and painted board.  The
 *    two are the same palette family and forty years apart.
 *  - **Four and a half metres wide, and stone.**  Slabs laid across the run
 *    rather than asphalt, so the street reads as something you walk rather
 *    than something you drive.
 *  - **It is small.**  Five buildings and a footbath.  The brief that matters
 *    here is *neighbourhood* onsen -- the kind a town of this size actually
 *    has, three minutes behind the shrine -- and not a preserved district.
 *    Nothing is more than two storeys and nothing is a monument.
 *  - **The level change is the composition.**  You arrive at the east end
 *    through a gate and up eleven steps, so the street is revealed end-on and
 *    all of it at once; the channel crosses it in the middle; the viewing
 *    deck at the east end puts you back above it looking west into the sun.
 *
 * The one thing here that is *not* in the shopping street's vocabulary is the
 * water: an open channel of it down the middle of the town, a footbath off the
 * street, and a very small amount of steam.  Steam is the whole trap of this
 * kind of place -- volumetric fog would eat the frame and flatten the ink pass
 * -- so it is a handful of soft quads that drift and nothing else.
 *
 * As everywhere: nobody is here.  What says the street is running is a noren
 * out, a bucket by the footbath, wet stone round the trough, the day's towels
 * on the rail, and the lanterns coming on one at a time.
 * ------------------------------------------------------------------ */

/* ------------------------------- the shelf ------------------------------- */

const Y = 3.20;                                  // the street deck
const TER = { x0: -46.8, x1: -18.6, z0: 40.6, z1: 59.6 };
const ST = { z0: 46.4, z1: 51.2 };               // the street between the frontages
const GATE_X = -22.5;                            // the back gate through the shrine wall
const GATE_HALF = 1.3;

/* The channel.  It comes out of the hillside at the north end, runs down
 * between the two rows and goes under the street on the bridge, then into a
 * culvert through the terrace's south retaining wall. */
const CH = { x: -34.2, half: 0.72, z0: 41.0, z1: 58.6 };
const CH_W = Y - 0.62;                           // the water surface
const CH_BED = Y - 0.86;

const M = {};
function mats() {
  if (M.wood) return M;
  M.wood = cel({ color: PAL.onsenWood, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: PAL.onsenWoodDark, bands: 3, tint: 0x50466a });
  M.woodPale = cel({ color: PAL.onsenWoodPale, bands: 3, tint: 0x6f5680 });
  M.plaster = cel({ color: PAL.onsenPlaster, bands: 3, tint: 0x6f6790 });
  M.plasterAlt = cel({ color: PAL.onsenPlasterAlt, bands: 3, tint: 0x6f6790 });
  M.tile = cel({ color: PAL.onsenTile, bands: 3, tint: 0x494268 });
  M.tileEdge = cel({ color: PAL.onsenTileEdge, bands: 3, tint: 0x494268 });
  M.stone = cel({ color: PAL.stone, bands: 3, tint: 0x655d80 });
  M.stoneDark = cel({ color: PAL.stoneDark, bands: 3, tint: 0x605878 });
  M.stoneWarm = cel({ color: PAL.stoneWarm, bands: 3, tint: 0x655d80 });
  M.slab = cel({ color: PAL.onsenSlab, bands: 3, tint: 0x6a6288 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.indigo = cel({ color: PAL.onsenIndigo, bands: 3, tint: 0x4a4468 });
  M.glass = cel({ color: PAL.glass, bands: 2, transparent: true, opacity: 0.5, tint: 0x6f6790 });
  M.bamboo = cel({ color: PAL.bamboo, bands: 3, tint: 0x5b6f8c });
  M.bambooDeep = cel({ color: PAL.bambooDeep, bands: 3, tint: 0x5b6f8c });
  M.pine = cel({ color: PAL.cedar, bands: 3, tint: 0x4a5f7a });
  M.pineDeep = cel({ color: PAL.cedarDeep, bands: 3, tint: 0x4a5f7a });
  /* Hot water is paler and greener than the canal's -- mineral, not sky --
   * and a good deal more opaque, because you are meant to read steam off it
   * rather than depth through it. */
  M.water = flat({ color: PAL.onsenWater, transparent: true, opacity: 0.9, cache: false });
  M.waterDeep = flat({ color: PAL.onsenWaterDeep, cache: false });
  return M;
}

/* ================================================================== *
 * The unit generator.
 *
 * Not `makeShop`.  That one builds a glazed recess behind piers, which is
 * exactly right for a post-war shopping street and exactly wrong here: this
 * street's ground floor is a timber frame with 格子 infill and a cloth
 * doorway, and there is no glass in it at all below the fascia.  The two
 * generators share the convention that matters -- authored facing +Z, whole
 * group rotated by `face` -- and nothing else.
 * ================================================================== */

const FACE_RY = { 'z+': 0, 'z-': Math.PI, 'x+': Math.PI / 2, 'x-': -Math.PI / 2 };

/**
 * @param o.x,o.z    footprint centre
 * @param o.y        the deck it stands on
 * @param o.w,o.d    frontage width and depth
 * @param o.face     which way the frontage looks
 * @param o.kind     signage key (`onsenFascia` / `onsenBlade`)
 * @param o.floors   1 or 2
 * @param o.doorAt   doorway centre, as a fraction of w from the middle
 * @param o.noren    noren key, or false
 * @param o.blade    true for a vertical board on the east pier
 * @param o.balcony  true for a narrow first-floor balcony
 * @param o.rooms    warm interior plates behind the first-floor glass
 */
function makeOnsenUnit(ctx, o) {
  const m = mats();
  const rng = rngKit(o.seed ?? 41);
  const g = new THREE.Group();
  g.name = 'onsen_' + (o.kind ?? 'unit');
  const w = o.w ?? 5.0;
  const d = o.d ?? 5.0;
  const floors = o.floors ?? 2;
  const H1 = o.h1 ?? 3.0;
  const H2 = o.h2 ?? 2.6;
  const H = floors === 2 ? H1 + H2 : H1;
  const front = d / 2;
  const wallMat = o.wallAlt ? m.plasterAlt : m.plaster;

  const parts = { wall: [], wood: [], woodDark: [], tile: [], tileEdge: [], stone: [], metal: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
  const lit = [];                                  // interior plates, for the dusk ramp

  /* ------------------------------ the volume ------------------------------ *
   * A plinth of dressed stone, the timber ground floor on it, and the plaster
   * upper storey set back 0.12 so the first-floor line catches the sun. */
  /* `hollow` is how far the ground floor is cut back behind its frontage, for
   * the one building on the street with a real lobby in it.  Without it the
   * volume is solid to the frontage line, so anything the caller stands
   * "inside the door" is inside the render instead -- the bathhouse's shoe
   * lockers, its scale and its bench were all buried in a metre of plaster. */
  const HOL = o.hollow ?? 0;
  push('stone', new THREE.BoxGeometry(w + 0.2, 0.36, d + 0.2 - HOL), trs(0, 0.18, -HOL / 2));
  push('wall', new THREE.BoxGeometry(w, H1 - 0.36, d - HOL), trs(0, 0.36 + (H1 - 0.36) / 2, -HOL / 2));
  if (floors === 2) {
    push('wall', new THREE.BoxGeometry(w, H2, d - 0.24), trs(0, H1 + H2 / 2, -0.12));
    push('wood', new THREE.BoxGeometry(w + 0.18, 0.16, d + 0.06), trs(0, H1 + 0.02, 0));
  }

  /* ------------------------------- the roof -------------------------------
   * Dark tile, deep eaves, and a ridge that stands proud.  Hipped or gabled:
   * a street of five where every roof is the same shape reads as one builder
   * and one afternoon. */
  {
    const eave = o.eave ?? 0.62;
    const rw = w + eave * 2;
    const rd = (floors === 2 ? d - 0.24 : d) + eave * 2;
    const rh = o.roofH ?? (o.hip ? 1.05 : 1.3);
    const zc = floors === 2 ? -0.12 : 0;
    if (o.hip) {
      /* A hip is four slabs; at this size the two ends can be short slabs of
       * the same pitch and nobody counts the ridge length. */
      const slope = Math.atan2(rh, rd / 2);
      for (const s of [-1, 1]) {
        push('tile', new THREE.BoxGeometry(rw * 0.82, 0.16, Math.hypot(rd / 2, rh) + 0.1),
          trs(0, H + rh / 2, zc + s * (rd / 4), s * slope, 0, 0));
      }
      const sx = Math.atan2(rh, rw / 2);
      for (const s of [-1, 1]) {
        push('tile', new THREE.BoxGeometry(Math.hypot(rw / 2, rh) + 0.1, 0.16, rd * 0.5),
          trs(s * (rw / 4), H + rh / 2, zc, 0, 0, -s * sx));
      }
      push('tileEdge', new THREE.BoxGeometry(rw * 0.44, 0.22, 0.3), trs(0, H + rh + 0.03, zc));
    } else {
      const slope = Math.atan2(rh, rd / 2);
      for (const s of [-1, 1]) {
        push('tile', new THREE.BoxGeometry(rw, 0.16, Math.hypot(rd / 2, rh) + 0.1),
          trs(0, H + rh / 2, zc + s * (rd / 4), s * slope, 0, 0));
      }
      push('tileEdge', new THREE.BoxGeometry(rw + 0.08, 0.24, 0.32), trs(0, H + rh + 0.04, zc));
      // the gable end, closed with boarding
      const tri = new THREE.Shape();
      tri.moveTo(-w / 2, 0);
      tri.lineTo(w / 2, 0);
      tri.lineTo(0, rh * 0.86);
      tri.closePath();
      const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.14, bevelEnabled: false });
      tg.translate(0, 0, -0.07);
      for (const s of [-1, 1]) push('wood', tg, trs(0, H, zc + s * ((floors === 2 ? d - 0.24 : d) / 2 - 0.06)));
      tg.dispose();
    }
    // the barge board along each eave -- the line that gives a tile roof weight
    for (const s of [-1, 1]) {
      push('tileEdge', new THREE.BoxGeometry(rw + 0.06, 0.13, 0.16),
        trs(0, H - 0.04, zc + s * (rd / 2 - 0.02)));
    }
  }

  /* --------------------------- the timber frame ---------------------------
   * Posts at the quarter points, a head rail under the fascia and a sill over
   * the plinth.  Everything between them is either 格子 or the doorway. */
  const SILL = 0.42;                     // top of the plinth course
  const HEAD = H1 - 0.52;                // underside of the fascia band
  const POST = 0.16;
  const doorW = o.doorW ?? 1.5;
  const doorC = (o.doorAt ?? 0) * w;

  /* Everything in the frame stands *proud* of the wall face, in four layers.
   * It has to: the volume is a solid box and there is no carving a recess into
   * one, so a "recessed" panel written at `front - 0.14` is simply inside the
   * render and invisible -- which is exactly what happened to every 格子 panel
   * on the street the first time round.  Reading outward from the wall:
   *   +0.04  the dark backing board the battens are seen against
   *   +0.12  the battens themselves
   *   +0.08  the sill, head rail and corner posts, which are deeper than both
   *          and so frame the screen instead of fighting it */
  const Z_BACK = front + 0.04;
  const Z_BATT = front + 0.12;
  const Z_FRAME = front + 0.08;

  push('woodDark', new THREE.BoxGeometry(w, 0.18, 0.3), trs(0, SILL, Z_FRAME));
  push('wood', new THREE.BoxGeometry(w, 0.22, 0.3), trs(0, HEAD + 0.11, Z_FRAME));
  for (const px of [-w / 2 + POST / 2, w / 2 - POST / 2]) {
    push('woodDark', new THREE.BoxGeometry(POST, H1, 0.3), trs(px, H1 / 2, Z_FRAME));
  }

  /* The 格子 panels.  The backing matters: battens on a plaster wall are
   * stripes, battens over something dark are a screen, and the difference is
   * eighty millimetres of depth. */
  const lattice = (cx, lw) => {
    if (lw < 0.3) return;
    push('woodDark', new THREE.BoxGeometry(lw, HEAD - SILL, 0.08), trs(cx, (SILL + HEAD) / 2, Z_BACK));
    const n = Math.max(2, Math.round(lw / 0.135));
    for (let i = 0; i < n; i++) {
      push('wood', new THREE.BoxGeometry(0.05, HEAD - SILL - 0.06, 0.09),
        trs(cx - lw / 2 + (lw * (i + 0.5)) / n, (SILL + HEAD) / 2, Z_BATT));
    }
    push('wood', new THREE.BoxGeometry(lw, 0.06, 0.1), trs(cx, SILL + (HEAD - SILL) * 0.62, Z_BATT + 0.02));
  };
  const dL = doorC - doorW / 2, dR = doorC + doorW / 2;
  lattice((-w / 2 + POST + dL) / 2, dL - (-w / 2 + POST));
  lattice((dR + w / 2 - POST) / 2, (w / 2 - POST) - dR);

  /* With a hollow, the returns either side of the opening and the header over
   * it are what stop the lattice panels standing in front of nothing. */
  if (HOL) {
    const pL = dL - (-w / 2), pR = (w / 2) - dR;
    if (pL > 0.1) push('wall', new THREE.BoxGeometry(pL, H1 - 0.36, HOL), trs(-w / 2 + pL / 2, 0.36 + (H1 - 0.36) / 2, front - HOL / 2));
    if (pR > 0.1) push('wall', new THREE.BoxGeometry(pR, H1 - 0.36, HOL), trs(w / 2 - pR / 2, 0.36 + (H1 - 0.36) / 2, front - HOL / 2));
    push('wall', new THREE.BoxGeometry(doorW, H1 - HEAD + 0.18, HOL), trs(doorC, (H1 + HEAD - 0.18) / 2, front - HOL / 2));
  }

  /* the doorway: the dark of the inside, a stone step out of it, and a lintel */
  if (!HOL) {
    push('woodDark', new THREE.BoxGeometry(doorW, HEAD - 0.18, 0.06), trs(doorC, (HEAD - 0.18) / 2 + 0.09, front + 0.03));
  }
  /* Behind the noren, a room rather than a hole.  A 2 m doorway painted flat
   * black is the single loudest thing on a street of pale plaster, and the
   * brief for this district asks for exactly the opposite: the *outline* of a
   * tatami room and a lamp, glimpsed, and nothing built. */
  if (o.interior) {
    const iw = doorW - 0.14;
    const ih = HEAD - 0.5;
    const room = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih),
      flat({ color: 0xffffff, map: tatamiRoom((o.interior - 1) % 2), cache: false }));
    // +0.11, not +0.07: the dark of the doorway is a 0.06 box whose face lands
    // at +0.06, and two planes a centimetre apart is a coin toss every frame
    room.position.set(doorC, ih / 2 + 0.16, front + 0.11);
    room.userData.noOutline = true;
    g.add(room);
    lit.push(room.material);
  }
  push('stone', new THREE.BoxGeometry(doorW + 0.5, 0.16, 0.62), trs(doorC, 0.24, front + 0.36));
  push('wood', new THREE.BoxGeometry(doorW + 0.12, 0.16, 0.2), trs(doorC, HEAD - 0.02, front + 0.12));

  /* ------------------------------ the fascia ------------------------------ */
  {
    const fh = o.fasciaH ?? 0.52;
    const fw = w - 0.5;
    const art = onsenFascia(o.kind ?? 'yunoya');
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(fw, fh, 0.12),
      [flat({ color: PAL.onsenWoodDark }), flat({ color: PAL.onsenWoodDark }),
       flat({ color: PAL.onsenWoodDark }), flat({ color: PAL.onsenWoodDark }),
       flat({ color: 0xffffff, map: art, cache: false }), flat({ color: PAL.onsenWoodDark })]
    );
    board.position.set(0, HEAD + fh / 2 + 0.24, front + 0.14);
    board.castShadow = true;
    g.add(board);
    hullOutline(board, { thickness: 0.0032 });
  }

  /* --------------------------------- 庇 ---------------------------------
   * The little tiled canopy over the frontage.  Not fabric: on this street
   * the awning is a roof in miniature, which is what keeps the whole row
   * reading as one construction. */
  if (o.awning !== false) {
    const aw = w + 0.24;
    const out = o.awningOut ?? 0.9;
    const tilt = 0.26;
    push('tile', new THREE.BoxGeometry(aw, 0.1, out / Math.cos(tilt)),
      trs(0, HEAD + 0.94, front + out / 2, -tilt, 0, 0));
    push('tileEdge', new THREE.BoxGeometry(aw + 0.05, 0.12, 0.12),
      trs(0, HEAD + 0.94 - Math.sin(tilt) * out / 2 - 0.04, front + out));
    for (const s of [-1, 1]) {
      push('wood', new THREE.BoxGeometry(0.09, 0.09, out),
        trs(s * (aw / 2 - 0.14), HEAD + 0.9 + Math.sin(tilt) * out / 2, front + out / 2, -tilt, 0, 0));
      // the bracket back to the frame, so the canopy is carried rather than glued
      push('wood', new THREE.BoxGeometry(0.08, 0.5, 0.08),
        trs(s * (aw / 2 - 0.14), HEAD + 0.66, front + 0.16, -0.7, 0, 0));
    }
  }

  /* ------------------------- the first floor ------------------------- */
  if (floors === 2) {
    const wy = H1 + H2 * 0.52;
    const n = o.windows ?? 2;
    const spanW = w - 1.0;
    for (let i = 0; i < n; i++) {
      const cx = -spanW / 2 + (spanW * (i + 0.5)) / n;
      const ww = Math.min(1.5, spanW / n - 0.35);
      // reveal set into the wall, the room plate on the face of it, glass in
      // front of that, mullions in front of that -- in that order
      push('wall', new THREE.BoxGeometry(ww + 0.22, 1.32, 0.12), trs(cx, wy, front - 0.18));
      const room = new THREE.Mesh(new THREE.PlaneGeometry(ww, 1.18),
        flat({ color: 0xffffff, map: tatamiRoom(i % 2), cache: false }));
      room.position.set(cx, wy, front - 0.117);
      room.userData.noOutline = true;
      g.add(room);
      if (o.rooms !== false) lit.push(room.material);
      const pane = box(ww, 1.18, 0.04, m.glass, cx, wy, front - 0.09);
      g.add(pane);
      push('wood', new THREE.BoxGeometry(ww + 0.16, 0.09, 0.09), trs(cx, wy + 0.63, front - 0.07));
      push('wood', new THREE.BoxGeometry(ww + 0.16, 0.09, 0.09), trs(cx, wy - 0.63, front - 0.07));
      push('wood', new THREE.BoxGeometry(0.07, 1.28, 0.08), trs(cx, wy, front - 0.07));
      for (const s of [-1, 1]) push('wood', new THREE.BoxGeometry(0.09, 1.3, 0.09), trs(cx + s * (ww / 2 + 0.04), wy, front - 0.07));
    }
    /* The balcony.  Narrow -- 0.62 m, which is a drying balcony and not a
     * terrace -- with a timber rail and one thing left on it. */
    if (o.balcony) {
      const bw = w - 0.6;
      const bd = 0.62;
      push('wood', new THREE.BoxGeometry(bw, 0.1, bd), trs(0, H1 + 0.42, front + bd / 2 - 0.14));
      push('woodDark', new THREE.BoxGeometry(bw + 0.06, 0.12, 0.1), trs(0, H1 + 0.47, front + bd - 0.16));
      for (let i = 0; i <= 5; i++) {
        push('wood', new THREE.BoxGeometry(0.06, 0.86, 0.06),
          trs(-bw / 2 + (bw * i) / 5, H1 + 0.9, front + bd - 0.16));
      }
      for (const yy of [H1 + 1.3, H1 + 0.86]) {
        push('wood', new THREE.BoxGeometry(bw + 0.1, 0.07, 0.08), trs(0, yy, front + bd - 0.16));
      }
      for (const s of [-1, 1]) {
        push('wood', new THREE.BoxGeometry(0.07, 0.86, bd), trs(s * bw / 2, H1 + 0.9, front + bd / 2 - 0.14));
      }
    }
  }

  /* ------------------------------ the blade ------------------------------ */
  if (o.blade) {
    const bs = o.bladeSide ?? 1;
    const bh = o.bladeH ?? 1.9;
    const art = onsenBlade(o.kind ?? 'yunoya');
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, bh, 0.42),
      [flat({ color: 0xffffff, map: art, cache: false }), flat({ color: 0xffffff, map: art, cache: false }),
       flat({ color: PAL.onsenWoodDark }), flat({ color: PAL.onsenWoodDark }),
       flat({ color: PAL.onsenWoodDark }), flat({ color: PAL.onsenWoodDark })]
    );
    plate.position.set(bs * (w / 2 - 0.12), H1 * 0.5 + 0.5, front + 0.32);
    plate.castShadow = true;
    g.add(plate);
    hullOutline(plate, { thickness: 0.0032 });
    push('metal', new THREE.BoxGeometry(0.05, 0.05, 0.3), trs(bs * (w / 2 - 0.12), H1 * 0.5 + 1.36, front + 0.14));
    push('metal', new THREE.BoxGeometry(0.05, 0.05, 0.3), trs(bs * (w / 2 - 0.12), H1 * 0.5 - 0.36, front + 0.14));
  }

  /* ------------------------------ the noren ------------------------------ */
  if (o.noren) {
    const nw = doorW + 0.16;
    const nh = o.norenH ?? 0.62;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(nw, nh),
      flat({ color: 0xffffff, map: onsenNoren(o.noren), transparent: true,
        side: THREE.DoubleSide, cache: false }));
    cloth.position.set(doorC, HEAD - 0.1 - nh / 2, front + 0.26);
    cloth.userData.noOutline = true;
    g.add(cloth);
    push('wood', new THREE.BoxGeometry(nw + 0.14, 0.06, 0.06), trs(doorC, HEAD - 0.06, front + 0.26));
  }

  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mat = { wall: wallMat, wood: m.wood, woodDark: m.woodDark, tile: m.tile,
      tileEdge: m.tileEdge, stone: m.stoneWarm, metal: m.metalDark }[key];
    const mesh = new THREE.Mesh(bake(parts[key]), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'tile') hullOutline(mesh, { thickness: 0.0032 });
  }

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = FACE_RY[o.face ?? 'z+'];
  ctx.add(g);

  /* The collider is the volume only.  The 庇 and the blade overhang the
   * street by up to a metre and they are all above 2.2 m, so putting them in
   * would wall the pavement off under its own canopy. */
  const fx = o.face === 'x+' || o.face === 'x-';
  const hw = (fx ? d : w) / 2 + 0.1;
  const hd = (fx ? w : d) / 2 + 0.1;
  ctx.collide(o.x - hw, o.z - hd, o.x + hw, o.z + hd, (o.y ?? 0) + H + 1.4);
  return { group: g, lit };
}

/* ------------------------------- small parts ------------------------------- */

/** A 石灯籠: base, shaft, table, fire box with its two openings, and the cap. */
function makeStoneLantern(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const s = o.scale ?? 1;
  g.add(cyl(0.24 * s, 0.3 * s, 0.16 * s, 8, m.stoneDark, 0, 0.08 * s, 0));
  g.add(cyl(0.1 * s, 0.12 * s, 0.72 * s, 8, m.stone, 0, 0.52 * s, 0));
  g.add(cyl(0.26 * s, 0.2 * s, 0.1 * s, 8, m.stoneDark, 0, 0.93 * s, 0));
  const fire = new THREE.Mesh(new THREE.CylinderGeometry(0.21 * s, 0.23 * s, 0.3 * s, 6), m.stone);
  fire.position.y = 1.13 * s;
  fire.castShadow = true;
  g.add(fire);
  // the two lit openings, which are the only reason the shape reads at dusk
  for (const ry of [0, Math.PI / 2]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.15 * s, 0.17 * s),
      flat({ color: 0xf6dfae, side: THREE.DoubleSide, cache: false }));
    win.position.set(Math.sin(ry) * 0.2 * s, 1.13 * s, Math.cos(ry) * 0.2 * s);
    win.rotation.y = ry;
    win.userData.noOutline = true;
    g.add(win);
    g.userData.glow = win.material;
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.36 * s, 0.24 * s, 6), m.stoneDark);
  cap.position.y = 1.4 * s;
  cap.castShadow = true;
  g.add(cap);
  g.add(cyl(0.05 * s, 0.07 * s, 0.14 * s, 6, m.stoneDark, 0, 1.57 * s, 0));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** A clipped garden pine: a leaning trunk and three flat cushions of needle. */
function makePine(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const s = o.scale ?? 1;
  const lean = o.lean ?? 0.16;
  const trunk = cyl(0.05 * s, 0.09 * s, 1.0 * s, 6, cel({ color: PAL.trunkDark, bands: 3, tint: 0x5c5680 }), 0, 0.5 * s, 0);
  trunk.rotation.z = lean;
  trunk.castShadow = true;
  g.add(trunk);
  /* The tip of a member rotated about its own centre is centre + R*(0,h/2,0),
   * so the cushions have to be hung off that and not off `h * sin(lean)`. */
  const tip = new THREE.Vector3(0, 0.5 * s, 0).applyEuler(new THREE.Euler(0, 0, lean));
  const cushions = [
    [tip.x - 0.42 * s, tip.y * 0.62, 0.1 * s, 0.46 * s],
    [tip.x + 0.34 * s, tip.y * 1.02, -0.16 * s, 0.4 * s],
    [tip.x * 1.2, tip.y * 1.42, 0.06 * s, 0.34 * s],
  ];
  for (const [cx, cy, cz, cr] of cushions) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(cr, 7, 5), o.deep ? m.pineDeep : m.pine);
    blob.position.set(cx, cy, cz);
    blob.scale.y = 0.52;
    blob.castShadow = true;
    // no receiveShadow: a canopy self-shadows into isolated black blobs
    g.add(blob);
    g.add(cyl(0.022 * s, 0.03 * s, 0.3 * s, 5,
      cel({ color: PAL.trunkDark, bands: 3, tint: 0x5c5680 }), cx * 0.6, cy - 0.1 * s, cz * 0.6));
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** 竹垣 -- a bamboo screen fence: split canes on two rails, tied off. */
function makeBambooFence(ctx, o) {
  const m = mats();
  const axis = o.axis ?? 'x';
  const from = Math.min(o.from, o.to);
  const to = Math.max(o.from, o.to);
  const len = to - from;
  const h = o.h ?? 1.15;
  const y = o.y ?? 0;
  const canes = [];
  const rails = [];
  const n = Math.max(2, Math.round(len / 0.11));
  for (let i = 0; i < n; i++) {
    const c = from + (len * (i + 0.5)) / n;
    canes.push({
      geometry: new THREE.CylinderGeometry(0.042, 0.042, h, 5),
      matrix: axis === 'z' ? trs(o.at, h / 2, c) : trs(c, h / 2, o.at),
    });
  }
  for (const ry of [h * 0.24, h * 0.74]) {
    rails.push({
      geometry: new THREE.CylinderGeometry(0.05, 0.05, len, 6),
      matrix: axis === 'z' ? trs(o.at + 0.06, ry, (from + to) / 2, Math.PI / 2, 0, 0)
        : trs((from + to) / 2, ry, o.at + 0.06, 0, 0, Math.PI / 2),
    });
  }
  // the posts, which are what stop it reading as a hedge of sticks
  for (const c of [from, to]) {
    rails.push({
      geometry: new THREE.CylinderGeometry(0.07, 0.07, h + 0.16, 6),
      matrix: axis === 'z' ? trs(o.at, (h + 0.16) / 2, c) : trs(c, (h + 0.16) / 2, o.at),
    });
  }
  const g = new THREE.Group();
  const cm = new THREE.Mesh(bake(canes), m.bamboo);
  cm.castShadow = cm.receiveShadow = true;
  g.add(cm);
  const rm = new THREE.Mesh(bake(rails), m.bambooDeep);
  rm.castShadow = true;
  g.add(rm);
  g.position.y = y;
  ctx.add(g);
  if (o.collide !== false) {
    if (axis === 'z') ctx.collide(o.at - 0.12, from, o.at + 0.12, to, y + h);
    else ctx.collide(from, o.at - 0.12, to, o.at + 0.12, y + h);
  }
  return g;
}

/** A landscape rock: one low-poly lump, squashed and turned. */
function makeRock(o = {}) {
  const m = mats();
  const geo = new THREE.DodecahedronGeometry(o.r ?? 0.4, 0);
  const rock = new THREE.Mesh(geo, o.dark ? m.stoneDark : m.stone);
  rock.scale.set(1, o.flat ?? 0.62, o.long ?? 1.25);
  rock.rotation.set(o.tilt ?? 0.1, o.ry ?? 0, o.roll ?? 0.08);
  rock.position.set(o.x, (o.y ?? 0) + (o.r ?? 0.4) * (o.flat ?? 0.62) * 0.62, o.z);
  rock.castShadow = rock.receiveShadow = true;
  return rock;
}

/** The old platform scale in the bath's changing lobby. */
function makeScale(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  g.add(box(0.42, 0.1, 0.34, m.metalDark, 0, 0.05, 0));
  g.add(box(0.36, 0.04, 0.28, cel({ color: 0x8a6a44, bands: 3, tint: 0x5c5680 }), 0, 0.12, 0));
  g.add(cyl(0.022, 0.022, 1.0, 6, m.metal, 0, 0.6, -0.1));
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 14), m.metal);
  dial.rotation.x = Math.PI / 2 - 0.3;
  dial.position.set(0, 1.12, -0.08);
  dial.castShadow = true;
  g.add(dial);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.14, 14), flat({ color: 0xf4efe2 }));
  face.rotation.x = -0.3;
  face.position.set(0, 1.13, 0.0);
  face.userData.noOutline = true;
  g.add(face);
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** A rack of 下駄 outside a ryokan door: a slatted frame with pairs on it. */
function makeGetaRack(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 7);
  const g = new THREE.Group();
  const w = o.w ?? 1.2;
  g.add(box(w, 0.06, 0.42, m.woodPale, 0, 0.3, 0));
  g.add(box(w, 0.06, 0.42, m.woodPale, 0, 0.06, 0));
  for (const s of [-1, 1]) {
    g.add(box(0.07, 0.36, 0.07, m.woodDark, s * (w / 2 - 0.05), 0.18, -0.16));
    g.add(box(0.07, 0.36, 0.07, m.woodDark, s * (w / 2 - 0.05), 0.18, 0.16));
  }
  const geta = [];
  const n = o.n ?? 3;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + (w * (i + 0.5)) / n;
    for (const s of [-1, 1]) {
      geta.push({
        geometry: new THREE.BoxGeometry(0.1, 0.035, 0.24),
        matrix: trs(cx + s * 0.06, 0.355, rng.range(-0.05, 0.05), 0, rng.range(-0.14, 0.14), 0),
      });
      for (const t of [-0.07, 0.07]) {
        geta.push({
          geometry: new THREE.BoxGeometry(0.08, 0.05, 0.03),
          matrix: trs(cx + s * 0.06, 0.31, t),
        });
      }
    }
  }
  const gm = new THREE.Mesh(bake(geta), cel({ color: 0xb99a72, bands: 3, tint: 0x6f5680 }));
  gm.castShadow = true;
  g.add(gm);
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** A warm door lamp on a wall bracket: the one saturated light on the street. */
function makeDoorLamp(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const out = o.out ?? 0.34;
  g.add(box(0.08, 0.2, 0.06, m.metalDark, 0, 0, 0.03));
  g.add(box(0.05, 0.05, out, m.metalDark, 0, 0.06, out / 2));
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), m.woodDark);
  body.position.set(0, -0.06, out);
  body.castShadow = true;
  g.add(body);
  g.add(box(0.28, 0.05, 0.28, m.metalDark, 0, 0.09, out));
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16),
    flat({ color: 0xf6dfae, cache: false }));
  paper.position.set(0, -0.06, out);
  paper.userData.noOutline = true;
  g.add(paper);
  g.userData.glow = paper.material;
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* ================================================================== *
 * The district.
 * ================================================================== */

export function buildOnsen(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(9701);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const bamboo = [];
  const petals = [];

  /* Every warm light on the street goes through one of these two so it can be
   * brought up at dusk.  `along` is how far west it stands: the ramp travels
   * up the street from the gate, which is the way you walk in. */
  const warm = [];
  const glow = (mat, along) => warm.push({ mat, along, at: 0 });
  const lantern = (o, along) => {
    const g = makeOnsenLantern(o);
    glow(g.userData.glow, along);
    return g;
  };

  buildTerrace(ctx, gm);
  buildApproach(ctx, m, gm, glow, lantern);
  buildChannel(ctx, m, gm, rng);
  buildBridge(ctx, m, gm, lantern, petals);
  const ryokan = buildRyokan(ctx, m, gm, rng, sakura, shrubs, bamboo, glow, lantern);
  buildBath(ctx, m, gm, rng, glow, lantern);
  buildAshiyu(ctx, m, gm, rng, glow);
  buildShops(ctx, m, gm, rng, glow, lantern);
  buildDeck(ctx, m, gm, lantern, sakura);
  dressStreet(ctx, m, gm, rng, glow, lantern, sakura, shrubs, grove, petals);

  /* ------------------------ the lights coming on ------------------------ *
   * The same one-off the shopping street has, and deliberately the same
   * mechanism, because the two have to happen at the same time of day: a
   * stagger with a short fade, running west up the street from the gate.
   * Here the ramp carries the ryokan's tatami rooms and the stone lantern in
   * its garden as well as the paper, so what comes on is a *town* rather than
   * a row of bulbs. */
  {
    const OFF = new THREE.Color(0xb6afbe);
    const OFF_ROOM = new THREE.Color(0x9a94a6);
    const HOLD = 22;
    const SPREAD = 78;
    const FADE = 1.9;
    warm.sort((a, b) => a.along - b.along);
    const span = Math.max(1, warm.length - 1);
    warm.forEach((l, i) => {
      l.at = HOLD + (SPREAD * i) / span;
      l.on = l.mat.color.clone();
      l.off = l.mat.map ? OFF_ROOM : OFF;
      l.mat.color.copy(l.off);
    });
    let t = 0;
    let done = false;
    ctx.update((dt) => {
      if (done) return;
      t += dt;
      if (t >= HOLD + SPREAD + FADE) {
        for (const l of warm) l.mat.color.copy(l.on);
        done = true;
        return;
      }
      for (const l of warm) {
        const k = Math.min(1, Math.max(0, (t - l.at) / FADE));
        l.mat.color.lerpColors(l.off, l.on, k * k * (3 - 2 * k));
      }
    });
  }

  return { sakura, shrubs, grove, bamboo, petals, update: ryokan.update };
}

/** A paper lantern in the onsen street's own paper. */
function makeOnsenLantern(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const r = o.r ?? 0.17;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, r * 2.2, 12, 1, true),
    flat({ color: PAL.lanternLit, map: onsenLanternTex(o.variant ?? 0),
      side: THREE.DoubleSide, cache: false })
  );
  body.position.y = -r * 1.1;
  g.add(body);
  g.userData.glow = body.material;
  // the two hoops: the body hangs from 0 down to -r*2.2, so they cap its ends
  for (const yy of [0, -r * 2.2]) g.add(cyl(r * 0.42, r * 0.42, 0.045, 10, m.woodDark, 0, yy, 0));
  g.add(cyl(0.014, 0.014, o.drop ?? 0.28, 4, m.woodDark, 0, (o.drop ?? 0.28) / 2, 0));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* ------------------------------ the shelf ------------------------------ *
 * Three pads rather than one: the flight up from the shrine lands inside the
 * terrace footprint, and `heightAt` takes the max over platforms -- so a pad
 * laid across the stair would answer with the deck level over the whole
 * flight and the steps would be a wall. */
function buildTerrace(ctx, gm) {
  const m = mats();
  const notchL = GATE_X - GATE_HALF - 0.5;
  const notchR = GATE_X + GATE_HALF + 0.5;
  const STAIR_Z = 43.6;                    // where the flight tops out
  /* The channel and the landing steps down to it are holes in the slab, the
   * same as the gate stair is.  Laid as one pad the terrace roofed the channel
   * over at 3.19 -- the revetment, the coping and the railings were all there
   * and the water was under a lid, which is why the trough read as an empty
   * stone gutter from every angle. */
  const CL = CH.x - CH.half, CR = CH.x + CH.half;
  const blocks = [
    { x0: TER.x0, x1: CL, z0: TER.z0, z1: TER.z1 },
    { x0: CR, x1: notchL, z0: TER.z0, z1: 52.5 },
    { x0: CR, x1: notchL, z0: 54.3, z1: TER.z1 },
    { x0: -32.5, x1: notchL, z0: 52.5, z1: 54.3 },      // past the 湯汲み場 steps
    { x0: notchR, x1: TER.x1, z0: TER.z0, z1: TER.z1 },
    { x0: notchL, x1: notchR, z0: STAIR_Z, z1: TER.z1 },
    // and the two slivers that close the slab off at the channel's own ends
    { x0: CL, x1: CR, z0: TER.z0, z1: CH.z0 },
    { x0: CL, x1: CR, z0: CH.z1, z1: TER.z1 },
  ];
  for (const b of blocks) {
    pad(ctx, {
      x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, w: b.x1 - b.x0, d: b.z1 - b.z0,
      y: Y - 0.09, h: 0.09, mat: gm.stoneWarm, name: 'onsenTerrace',
    });
  }

  /* The retaining wall.  It stands 0.55 proud of the deck all the way round,
   * because a wall flush with a terrace is not a barrier -- `_resolve` skips
   * any collider whose top is within a step of the feet, and this one has a
   * 2.75 m drop behind it. */
  const H = Y + 0.55;
  const runs = [
    { axis: 'x', at: TER.z0, from: TER.x0, to: GATE_X - GATE_HALF },
    { axis: 'x', at: TER.z0, from: GATE_X + GATE_HALF, to: TER.x1 },
    { axis: 'z', at: TER.x0, from: TER.z0, to: TER.z1 },
    { axis: 'z', at: TER.x1, from: TER.z0, to: 47.6 },
    { axis: 'z', at: TER.x1, from: 50.2, to: TER.z1 },
    { axis: 'x', at: TER.z1, from: TER.x0, to: -27.0 },
    { axis: 'x', at: TER.z1, from: -19.6, to: TER.x1 },
  ];
  for (const r of runs) {
    wallRun(ctx, { ...r, y: 0, h: H, t: 0.4, panel: 3.8, mat: m.stoneDark, capMat: m.stoneWarm });
  }

  /* A pier at each opening, so the gaps read as gateways rather than as
   * concrete stopping in mid-air. */
  for (const [px, pz] of [
    [GATE_X - GATE_HALF - 0.2, TER.z0], [GATE_X + GATE_HALF + 0.2, TER.z0],
    [TER.x1, 47.4], [TER.x1, 50.4],
  ]) {
    const p = box(0.72, H + 0.34, 0.72, m.stoneDark, px, (H + 0.34) / 2 - 0.05, pz);
    p.castShadow = p.receiveShadow = true;
    ctx.add(p);
    ctx.add(box(0.9, 0.14, 0.9, m.stoneWarm, px, H + 0.36, pz));
    ctx.collide(px - 0.4, pz - 0.4, px + 0.4, pz + 0.4, H + 0.4);
  }

  /* -------------------------------- the street -------------------------------- *
   * Slabs laid *across* the run.  Baked into one mesh: at 0.9 m a pace this is
   * thirty-odd courses and they are the surface, not decoration on it. */
  {
    const slabs = [];
    const jointed = [];
    const x0 = TER.x0 + 0.6, x1 = TER.x1 - 0.6;
    const n = Math.round((x1 - x0) / 0.92);
    for (let i = 0; i < n; i++) {
      const cx = x0 + ((x1 - x0) * (i + 0.5)) / n;
      slabs.push({
        geometry: new THREE.BoxGeometry((x1 - x0) / n - 0.06, 0.05, ST.z1 - ST.z0 - 0.24),
        matrix: trs(cx, 0, (ST.z0 + ST.z1) / 2),
      });
      // the gutter course down each side, a size smaller and a shade darker
      for (const s of [-1, 1]) {
        jointed.push({
          geometry: new THREE.BoxGeometry((x1 - x0) / n - 0.06, 0.05, 0.34),
          matrix: trs(cx, 0, (ST.z0 + ST.z1) / 2 + s * ((ST.z1 - ST.z0) / 2 - 0.13)),
        });
      }
    }
    const sm = new THREE.Mesh(bake(slabs), m.slab);
    sm.position.y = Y + 0.025;
    sm.receiveShadow = true;
    sm.name = 'onsenSlabs';
    ctx.add(sm);
    const jm = new THREE.Mesh(bake(jointed), m.stoneDark);
    jm.position.y = Y + 0.022;
    jm.receiveShadow = true;
    jm.userData.noOutline = true;
    ctx.add(jm);
  }
}

/* --------------------- the way in, from the shrine --------------------- */
function buildApproach(ctx, m, gm, glow, lantern) {
  const RISE = 0.1855;
  const N = 6;
  const RUN = 0.5;
  const Z0 = 40.6;
  /* Eleven treads would be the shrine's flight again; six is right, because
   * the shelf is only a metre above the precinct.  The flight starts *inside*
   * the shrine's north wall so the gate reads as the threshold. */
  steps(ctx, {
    x: GATE_X, z: Z0, axis: 'z', dir: 1, n: N, rise: RISE, run: RUN,
    w: 2.4, y: 2.09, mat: m.stone, lipMat: m.stoneDark,
  });
  // cheeks, and the plinth that closes the void under the flight
  for (const s of [-1, 1]) {
    const parts = [];
    for (let i = 0; i < N; i++) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.3, RISE * (i + 1) + 0.24, RUN),
        matrix: trs(GATE_X + s * 1.35, 2.09 + (RISE * (i + 1) + 0.24) / 2, Z0 + RUN * (i + 0.5)),
      });
    }
    const cheek = new THREE.Mesh(bake(parts), m.stoneDark);
    cheek.castShadow = cheek.receiveShadow = true;
    ctx.add(cheek);
    ctx.collide(GATE_X + s * 1.35 - 0.2, Z0, GATE_X + s * 1.35 + 0.2, Z0 + RUN * N, Y + 0.3);
  }
  ctx.add(box(2.9, 2.2, RUN * N + 0.3, m.stoneDark, GATE_X, 1.0, Z0 + (RUN * N) / 2));

  /* ------------------------- the threshold landing ------------------------- *
   * **The one hole in this world you could walk into.**  `shrine.js`'s precinct
   * terrace ends at its own `TER.z1` = 40.0 and this flight's bottom tread starts
   * at Z0 = 40.6, so 0.6 m of the back gate's threshold had no platform under it
   * at all -- `heightAt` fell through to the natural grade at 0.30, which is
   * 1.79 m *below* the precinct.  Walking out of the shrine through its own gate
   * dropped the player under the terrace and left them there, because once down
   * the 2.09 slab is well outside `heightAt`'s 0.55 m reach.  Nothing was drawn
   * across it either: 0.45 m of bare terrain in the middle of the opening,
   * invisible only because the gate posts frame it and the wall is over it.
   *
   * The slab *butts* the precinct's own at 40.0 -- two coplanar tops that
   * overlap are a coin toss -- and the platform overlaps both neighbours by
   * 0.1 m, because two platforms that merely meet are the same hole again. */
  {
    const SHRINE_TOP = 2.09;                  // shrine.js's TOP, and its terrace
    const LZ0 = 40.0, LZ1 = Z0 - 0.13;        // 40.47: into the plinth's south face
    pad(ctx, {
      x: GATE_X, z: (LZ0 + LZ1) / 2, w: 2.4, d: LZ1 - LZ0,
      y: SHRINE_TOP - 0.07, h: 0.07, mat: m.stone, name: 'onsenGateLanding',
      platform: false,
    });
    ctx.platform({ x0: GATE_X - 1.2, x1: GATE_X + 1.2, z0: LZ0 - 0.1, z1: LZ1 + 0.23, top: SHRINE_TOP });
  }

  /* the gate itself: two posts, a plain lintel and a lamp on each */
  {
    const H = 2.9;
    for (const s of [-1, 1]) {
      const px = GATE_X + s * (GATE_HALF + 0.02);
      const post = box(0.26, H, 0.3, m.woodDark, px, 2.09 + H / 2, Z0 - 0.1);
      post.castShadow = true;
      ctx.add(post);
      ctx.add(box(0.4, 0.12, 0.44, m.tileEdge, px, 2.09 + H + 0.06, Z0 - 0.1));
    }
    const lintel = box(GATE_HALF * 2 + 0.6, 0.28, 0.24, m.woodDark, GATE_X, 2.09 + H - 0.3, Z0 - 0.1);
    lintel.castShadow = true;
    ctx.add(lintel);
    hullOutline(lintel, { thickness: 0.0032 });
    for (const s of [-1, 1]) {
      ctx.add(lantern({ x: GATE_X + s * (GATE_HALF - 0.24), y: 2.09 + H - 0.46, z: Z0 - 0.02, r: 0.15, drop: 0.2, variant: 1 }, -0.6));
    }
  }

  /* the guide board at the head of the flight, on the verge and not in it */
  {
    const bx = GATE_X + 1.95, bz = 44.4;
    for (const s of [-1, 1]) {
      ctx.add(box(0.09, 1.5, 0.09, m.woodDark, bx + s * 0.5, Y + 0.75, bz));
    }
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.28, 0.8, 0.09),
      [flat({ color: PAL.onsenWoodDark }), flat({ color: PAL.onsenWoodDark }),
       flat({ color: PAL.onsenWoodDark }), flat({ color: PAL.onsenWoodDark }),
       flat({ color: 0xffffff, map: yunosakaBoard(), cache: false }), flat({ color: PAL.onsenWoodDark })]
    );
    board.position.set(bx, Y + 1.4, bz - 0.02);
    board.rotation.y = Math.PI;
    board.castShadow = true;
    ctx.add(board);
    const hood = box(1.5, 0.09, 0.34, m.tileEdge, bx, Y + 1.86, bz - 0.06);
    hood.rotation.x = 0.2;
    hood.castShadow = true;
    ctx.add(hood);
    for (const s of [-1, 1]) {
      ctx.collide(bx + s * 0.5 - 0.06, bz - 0.06, bx + s * 0.5 + 0.06, bz + 0.06, Y + 1.5, Y, true);
    }
    ctx.collide(bx - 0.64, bz - 0.08, bx + 0.64, bz + 0.08, Y + 1.8, Y + 1.0, true);
    ctx.collide(bx - 0.75, bz - 0.22, bx + 0.75, bz + 0.12, Y + 1.95, Y + 1.78, true);
  }

  /* ---------------------- the long flight down the east end ---------------------- *
   * The second way in, and the only one that does not go through the shrine:
   * fifteen treads down the east face of the shelf onto the field path, so the
   * street is a route and not a pocket. */
  {
    const RISE2 = 0.1852;
    const N2 = 15;
    const base = 0.44;
    steps(ctx, {
      x: TER.x1 + 6.9, z: 48.9, axis: 'x', dir: -1, n: N2, rise: RISE2, run: 0.46,
      w: 2.3, y: base, mat: m.stone, lipMat: m.stoneDark,
    });
    for (const s of [-1, 1]) {
      const parts = [];
      for (let i = 0; i < N2; i++) {
        parts.push({
          geometry: new THREE.BoxGeometry(0.46, RISE2 * (i + 1) + 0.2, 0.3),
          matrix: trs(TER.x1 + 6.9 - 0.46 * (i + 0.5), base + (RISE2 * (i + 1) + 0.2) / 2, 48.9 + s * 1.3),
        });
      }
      const cheek = new THREE.Mesh(bake(parts), m.stoneDark);
      cheek.castShadow = cheek.receiveShadow = true;
      ctx.add(cheek);
      /* The cheek is a rising wall, not a 0.3 m stub. Short bands follow
       * the rake so the air above the lower blocks stays a gap. */
      const BAND = 2;
      for (let i = 0; i < N2; i += BAND) {
        const i1 = Math.min(N2, i + BAND);
        const xHi = TER.x1 + 6.9 - 0.46 * i;
        const xLo = TER.x1 + 6.9 - 0.46 * i1;
        const yHi = base + RISE2 * i1 + 0.2;
        ctx.collide(xLo, 48.9 + s * 1.3 - 0.2, xHi, 48.9 + s * 1.3 + 0.2, yHi, base);
      }
    }
    /* A pipe handrail up the north cheek, raked to the flight -- and **it stops
     * 0.6 m short of the head of it**.  `buildTerrace` stands a 0.72 m pier at
     * (TER.x1, 50.4) to end the retaining wall on this side of the opening, and
     * the rail runs at z = 50.2, which is inside that pier: at the flight's full
     * length its top post was buried in the pier and the rail crossed the cap
     * 30 mm under the top, so the pier read as a box with a pole driven through
     * it.  A rail that ends a stride short of a pier is what one does anyway. */
    {
      const L = 0.46 * N2, RH = RISE2 * N2;
      const CUT = 0.75;                       // the pier's *cap* overhangs to TER.x1 + 0.45
      const run = L - CUT, rise = RH * (run / L);
      const rail = cyl(0.032, 0.032, Math.hypot(run, rise) + 0.3, 7, m.metalDark,
        TER.x1 + 6.9 - run / 2, base + rise / 2 + 0.95, 50.2);
      rail.rotation.z = Math.PI / 2 - Math.atan2(rise, run);
      rail.castShadow = true;
      ctx.add(rail);
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        ctx.add(cyl(0.03, 0.03, 0.95, 6, m.metalDark, TER.x1 + 6.9 - run * t, base + rise * t + 0.47, 50.2));
      }
      for (let i = 0; i < N2; i++) {
        const xHi = TER.x1 + 6.9 - 0.46 * i;
        const xLo = TER.x1 + 6.9 - 0.46 * (i + 1);
        const yTread = base + RISE2 * (i + 1);
        ctx.collide(xLo, 50.1, xHi, 50.3, yTread + 0.95, yTread);
      }
    }
  }
}

/* ------------------------------- the channel ------------------------------- */
function buildChannel(ctx, m, gm, rng) {
  const { x, half, z0, z1 } = CH;
  const wall = [];
  const bed = [];
  /* Built, not excavated.  The shelf is a slab of made ground, so the channel
   * is a trough within it: two revetment walls, a bed between them and a
   * coping on top.  Nothing here touches the terrain grid, which is what the
   * canal has to do and what makes the canal expensive. */
  for (const s of [-1, 1]) {
    wall.push({
      geometry: new THREE.BoxGeometry(0.34, 1.0, z1 - z0),
      matrix: trs(x + s * (half + 0.17), Y - 0.5, (z0 + z1) / 2),
    });
    wall.push({
      geometry: new THREE.BoxGeometry(0.5, 0.12, z1 - z0),
      matrix: trs(x + s * (half + 0.19), Y + 0.03, (z0 + z1) / 2),
    });
  }
  bed.push({ geometry: new THREE.BoxGeometry(half * 2, 0.14, z1 - z0), matrix: trs(x, CH_BED - 0.07, (z0 + z1) / 2) });
  const wm = new THREE.Mesh(bake(wall), m.stoneDark);
  wm.castShadow = wm.receiveShadow = true;
  ctx.add(wm);
  hullOutline(wm, { thickness: 0.003 });
  ctx.add(new THREE.Mesh(bake(bed), m.stoneWarm));

  /* the water: one block-colour surface, and a paler streak down the middle
   * where it runs faster.  Flat, unlit and out of the depth buffer. */
  {
    const geo = new THREE.PlaneGeometry(half * 2 - 0.06, z1 - z0 - 0.1);
    geo.rotateX(-Math.PI / 2);
    const surf = new THREE.Mesh(geo, m.water);
    surf.position.set(x, CH_W, (z0 + z1) / 2);
    surf.userData.noOutline = true;
    surf.renderOrder = 1;
    ctx.add(surf);
    const streak = [];
    for (let i = 0; i < 22; i++) {
      const zc = z0 + 0.6 + ((z1 - z0 - 1.2) * i) / 21;
      streak.push({
        geometry: new THREE.BoxGeometry(rng.range(0.1, 0.34), 0.01, rng.range(0.3, 0.9)),
        matrix: trs(x + rng.range(-0.4, 0.4), 0, zc),
      });
    }
    const st = new THREE.Mesh(bake(streak), flat({
      color: 0xe8f2f0, transparent: true, opacity: 0.5, depthWrite: false, cache: false,
    }));
    st.position.y = CH_W + 0.012;
    st.userData.noOutline = true;
    st.renderOrder = 2;
    ctx.add(st);
  }
  ctx.platform({ x0: x - half, x1: x + half, z0, z1, top: CH_W });

  /* the source at the north end: a stone box, a bamboo spout and a wet patch */
  {
    const sz = z1 + 0.1;
    const head = box(1.5, 1.1, 0.7, m.stoneDark, x, Y + 0.05, sz + 0.3);
    head.castShadow = head.receiveShadow = true;
    ctx.add(head);
    ctx.add(box(1.7, 0.14, 0.86, m.stoneWarm, x, Y + 0.67, sz + 0.3));
    ctx.collide(x - 0.85, sz - 0.1, x + 0.85, sz + 0.75, Y + 0.7);
    const spout = cyl(0.06, 0.06, 0.6, 7, m.bamboo, x, Y + 0.3, sz - 0.12);
    spout.rotation.x = Math.PI / 2 - 0.22;
    ctx.add(spout);
    const fall = box(0.09, 0.42, 0.05, flat({
      color: 0xdcecea, transparent: true, opacity: 0.62, depthWrite: false, cache: false,
    }), x, Y + 0.06, sz - 0.34);
    fall.userData.noOutline = true;
    ctx.add(fall);
    ctx.add(makeSignPost({
      x: x + 1.5, z: sz + 0.2, y: Y, ry: -Math.PI / 2, h: 1.5, postMat: m.woodDark,
      plates: [{ map: paperSheet(), w: 0.34, h: 0.26, y: 1.22 }],
    }));
  }

  /* the culvert at the south end, through the retaining wall */
  {
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(half + 0.1, half + 0.1, 0.7, 12, 1, false, 0, Math.PI), m.stoneDark);
    arch.rotation.set(Math.PI / 2, 0, 0);
    arch.position.set(x, CH_W - 0.02, z0 - 0.15);
    ctx.add(arch);
    ctx.add(box(half * 2 + 0.9, 0.9, 0.3, m.stoneDark, x, Y - 0.42, z0 - 0.02));
  }

  /* the railing along both banks, broken for the bridge and for the one place
   * three steps go down to the water */
  const LAND_Z = 53.4;
  for (const s of [-1, 1]) {
    const rx = x + s * (half + 0.42);
    const spans = s < 0
      ? [[z0 + 0.4, ST.z0 - 0.5], [ST.z1 + 0.5, z1 - 0.3]]
      : [[z0 + 0.4, ST.z0 - 0.5], [ST.z1 + 0.5, LAND_Z - 1.0], [LAND_Z + 1.0, z1 - 0.3]];
    for (const [a, b] of spans) {
      if (b - a < 0.5) continue;
      railing(ctx, { axis: 'z', at: rx, from: a, to: b, y: Y, h: 0.92, spacing: 1.5, mat: m.metalDark });
    }
  }

  /* the 湯汲み場: three treads down to a landing at the water */
  {
    const lx = x + half + 0.5;
    steps(ctx, {
      x: lx + 0.9, z: LAND_Z, axis: 'x', dir: -1, n: 3, rise: 0.19, run: 0.36,
      w: 1.5, y: CH_W + 0.05, mat: m.stone, lipMat: m.stoneDark,
    });
    ctx.add(box(0.9, 0.1, 1.5, m.stone, lx - 0.35, CH_W + 0.05, LAND_Z));
    ctx.platform({ x0: lx - 0.8, x1: lx + 0.1, z0: LAND_Z - 0.75, z1: LAND_Z + 0.75, top: CH_W + 0.1 });
  }

  /* the steam.  Six soft quads over the water and nothing else -- the brief
   * for this street calls for restraint here and it is right: a volume would
   * flatten the ink pass and cost more than the town. */
  const puffs = [];
  {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = flat({
      color: PAL.onsenSteam, transparent: true, opacity: 0.17,
      side: THREE.DoubleSide, depthWrite: false, cache: false,
    });
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Mesh(geo, mat);
      const s = rng.range(1.0, 1.9);
      p.scale.set(s, s * rng.range(0.5, 0.8), 1);
      p.position.set(x + rng.range(-0.3, 0.3), CH_W + rng.range(0.35, 0.95), z0 + 1.5 + rng.range(0, z1 - z0 - 3));
      p.rotation.y = rng.range(0, Math.PI);
      p.userData.noOutline = true;
      p.renderOrder = 3;
      p.userData.planetRigid = true;
      p.userData.drift = { y0: p.position.y, ph: rng.range(0, 6.3), sp: rng.range(0.09, 0.2) };
      ctx.add(p);
      puffs.push(p);
    }
  }
  let t = 0;
  ctx.update((dt) => {
    t += dt;
    for (const p of puffs) {
      const d = p.userData.drift;
      p.position.y = d.y0 + Math.sin(t * d.sp + d.ph) * 0.16;
      p.material.opacity = 0.13 + 0.06 * (0.5 + 0.5 * Math.sin(t * d.sp * 1.7 + d.ph));
    }
  });
}

/* ------------------------------- the bridge ------------------------------- *
 * The one thing on this street that exists to be looked at rather than used:
 * you could step the channel anywhere.  So it is built like a small shrine
 * bridge -- a cambered timber deck, four newel posts with a lantern on the
 * two street-side ones, and the parapet lower than a handrail wants to be so
 * it does not cut the view down the water. */
function buildBridge(ctx, m, gm, lantern, petals) {
  const { x, half } = CH;
  const W = ST.z1 - ST.z0 + 0.4;
  const zc = (ST.z0 + ST.z1) / 2;
  const span = half * 2 + 1.9;

  const deck = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const camber = Math.sin(t * Math.PI) * 0.11;
    deck.push({
      geometry: new THREE.BoxGeometry(span / N + 0.01, 0.14, W),
      matrix: trs(x - span / 2 + span * t, Y + 0.06 + camber, zc),
    });
    ctx.platform({
      x0: x - span / 2 + (span * i) / N - 0.05, x1: x - span / 2 + (span * (i + 1)) / N + 0.05,
      z0: zc - W / 2, z1: zc + W / 2, top: Y + 0.13 + camber,
    });
  }
  const dm = new THREE.Mesh(bake(deck), m.wood);
  dm.castShadow = dm.receiveShadow = true;
  dm.name = 'onsenBridgeDeck';
  ctx.add(dm);
  hullOutline(dm, { thickness: 0.0032 });
  // the two beams under it, seen from the water
  for (const s of [-1, 1]) {
    ctx.add(box(span, 0.16, 0.18, m.woodDark, x, Y - 0.04, zc + s * (W / 2 - 0.3)));
  }

  /* newels and parapet */
  const rails = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = x + sx * (span / 2 - 0.16);
      const pz = zc + sz * (W / 2 - 0.12);
      const post = box(0.19, 1.06, 0.19, m.woodDark, px, Y + 0.62, pz);
      post.castShadow = true;
      ctx.add(post);
      ctx.add(cyl(0.11, 0.13, 0.14, 8, m.woodPale, px, Y + 1.2, pz));
    }
    const px = x + sx * (span / 2 - 0.16);
    for (const yy of [Y + 0.98, Y + 0.62]) {
      rails.push({ geometry: new THREE.CylinderGeometry(0.05, 0.05, W - 0.24, 7), matrix: trs(px, yy, zc, Math.PI / 2, 0, 0) });
    }
  }
  const rm = new THREE.Mesh(bake(rails), m.wood);
  rm.castShadow = true;
  ctx.add(rm);

  // a lantern over each street-side newel
  for (const sx of [-1, 1]) {
    ctx.add(lantern({
      x: x + sx * (span / 2 - 0.16), y: Y + 1.62, z: zc - W / 2 + 0.12, r: 0.16, drop: 0.24, variant: 0,
    }, -x + sx * 0.4));
  }
  petals.push({ x, z: zc, w: span, d: W, y: Y + 0.2, n: 34 });
}

/* ------------------------------- 湯乃屋 ------------------------------- *
 * The hero, at the west end of the street, set back behind its own court so
 * the approach to the door is a sequence and not a step off the paving.  Two
 * storeys and a hipped tile roof: the biggest volume here by a good margin,
 * and still a building somebody's family runs.
 */
function buildRyokan(ctx, m, gm, rng, sakura, shrubs, bamboo, glow, lantern) {
  const X0 = -46.0, X1 = -36.6;
  const cx = (X0 + X1) / 2;
  const COURT_Z = 51.2;                 // the street edge of the court
  const FRONT_Z = 54.4;                 // the frontage
  const d = 5.0;

  const unit = makeOnsenUnit(ctx, {
    x: cx, z: FRONT_Z + d / 2, y: Y, w: X1 - X0, d, face: 'z-',
    kind: 'yunoya', floors: 2, h1: 3.2, h2: 2.8, hip: true, roofH: 1.5, eave: 0.78,
    /* The door is off-centre east, on the porch axis.  It has to be *the same*
     * axis: with the door centred and the porch 1.4 m east of it, the canopy,
     * the steps, the mat, the geta rack and both lamps were all beside the
     * doorway rather than over it -- and one of the lamps hung in it.
     *
     * `doorAt` is in the unit's *own* frame, and this one is turned a half
     * circle, so east on the street is negative here. */
    doorW: 2.0, doorAt: -0.149, noren: 'yunoya', blade: true, bladeSide: -1, bladeH: 2.2,
    balcony: true, windows: 3, awningOut: 1.1, interior: 1, seed: 9711,
  });
  for (const mat of unit.lit) glow(mat, -cx + 2.0);

  /* the court: raked gravel, a stone path to the porch, and the bamboo screen
   * that separates it from the street without closing it */
  pad(ctx, {
    x: cx, z: (COURT_Z + FRONT_Z) / 2, w: X1 - X0, d: FRONT_Z - COURT_Z,
    y: Y, h: 0.05, mat: gm.gravel, name: 'ryokanCourt',
  });
  const GATE = cx + 1.4;
  makeBambooFence(ctx, { axis: 'x', at: COURT_Z + 0.1, from: X0 + 0.2, to: GATE - 0.85, y: Y + 0.05, h: 1.05 });
  makeBambooFence(ctx, { axis: 'x', at: COURT_Z + 0.1, from: GATE + 0.85, to: X1 - 0.2, y: Y + 0.05, h: 1.05 });

  /* the gate posts and their little tiled hood -- the ryokan's name is on the
   * post, which is where an inn's name actually is */
  for (const s of [-1, 1]) {
    const px = GATE + s * 0.85;
    const post = box(0.2, 2.2, 0.2, m.woodDark, px, Y + 1.15, COURT_Z + 0.1);
    post.castShadow = true;
    ctx.add(post);
    ctx.collide(px - 0.14, COURT_Z - 0.04, px + 0.14, COURT_Z + 0.24, Y + 2.2);
  }
  ctx.add(box(2.34, 0.16, 0.5, m.tileEdge, GATE, Y + 2.3, COURT_Z + 0.1));
  {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 1.0),
      flat({ color: 0xffffff, map: onsenBlade('yunoya'), cache: false }));
    plate.position.set(GATE - 0.85, Y + 1.4, COURT_Z - 0.02);
    plate.rotation.y = Math.PI;
    plate.userData.noOutline = true;
    ctx.add(plate);
  }

  /* the stepping stones from the gate to the porch */
  {
    const stones = [];
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      stones.push({
        geometry: new THREE.BoxGeometry(rng.range(0.44, 0.6), 0.07, rng.range(0.36, 0.5)),
        matrix: trs(GATE + Math.sin(t * 2.2) * 0.55, 0, COURT_Z + 0.45 + t * (FRONT_Z - COURT_Z - 1.1), 0, rng.range(-0.3, 0.3), 0),
      });
    }
    const sm = new THREE.Mesh(bake(stones), m.stoneWarm);
    sm.position.y = Y + 0.07;
    sm.receiveShadow = true;
    ctx.add(sm);
  }

  /* -------------------------------- the porch -------------------------------- */
  {
    const px = cx + 1.4;
    const W = 3.4, D = 1.5;
    // two slabs up to the threshold
    steps(ctx, {
      x: px, z: FRONT_Z - 0.9, axis: 'z', dir: 1, n: 2, rise: 0.14, run: 0.42,
      w: 2.6, y: Y, mat: m.stone, lipMat: m.stoneDark,
    });
    const posts = [];
    for (const s of [-1, 1]) {
      posts.push({ geometry: new THREE.BoxGeometry(0.17, 2.7, 0.17), matrix: trs(px + s * (W / 2 - 0.1), Y + 1.35, FRONT_Z - D + 0.1) });
    }
    const pm = new THREE.Mesh(bake(posts), m.woodDark);
    pm.name = 'openFrame';
    pm.castShadow = true;
    ctx.add(pm);
    for (const s of [-1, 1]) {
      const ppx = px + s * (W / 2 - 0.1);
      const ppz = FRONT_Z - D + 0.1;
      ctx.collide(ppx - 0.09, ppz - 0.09, ppx + 0.09, ppz + 0.09, Y + 2.7);
    }
    // the porch roof: a small hipped tile canopy of its own
    ctx.add(box(W + 0.7, 0.14, D + 0.5, m.tile, px, Y + 2.78, FRONT_Z - D / 2 - 0.1));
    ctx.add(box(W + 0.8, 0.16, 0.18, m.tileEdge, px, Y + 2.72, FRONT_Z - D - 0.34));
    ctx.add(box(W + 0.4, 0.1, D + 0.2, m.woodPale, px, Y + 2.66, FRONT_Z - D / 2 - 0.1));
    // the warm lamp each side of the door
    for (const s of [-1, 1]) {
      const lamp = makeDoorLamp({ x: px + s * (W / 2 - 0.14), y: Y + 2.3, z: FRONT_Z - 0.12, ry: Math.PI, out: 0.3 });
      glow(lamp.userData.glow, -cx + 1.0);
      ctx.add(lamp);
    }
    ctx.add(makeDoormat({ x: px, z: FRONT_Z - 0.55, y: Y + 0.28, w: 1.3, d: 0.66, color: 0x4a4050 }));
    ctx.add(makeUmbrellaStand({ x: px - 1.5, z: FRONT_Z - 0.5, y: Y + 0.28, n: 4, seed: 9712 }));
    ctx.add(makeGetaRack({ x: px + 1.45, z: FRONT_Z - 0.62, y: Y + 0.28, w: 1.1, n: 3, ry: -0.1, seed: 9713 }));
    ctx.add(makeBucket({ x: px - 2.4, z: FRONT_Z - 0.4, y: Y, ry: 0.5, water: true }));
  }

  /* ------------------------------- the garden ------------------------------- *
   * Small, and read from the street through the screen: a shallow pond with a
   * stone edge, one lantern, three rocks, a clipped pine and a cherry over
   * the whole thing. */
  const gx = X0 + 2.2;
  {
    const px = gx, pz = 52.6;
    // the pond: a sunk stone rim and a block of water in it
    const rim = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      rim.push({
        geometry: new THREE.BoxGeometry(0.42, 0.16, 0.3),
        matrix: trs(px + Math.cos(a) * 1.06, 0, pz + Math.sin(a) * 0.78, 0, -a, 0),
      });
    }
    const rm = new THREE.Mesh(bake(rim), m.stoneDark);
    rm.position.y = Y + 0.08;
    rm.castShadow = rm.receiveShadow = true;
    ctx.add(rm);
    const geo = new THREE.CircleGeometry(1.0, 14);
    geo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(geo, flat({
      color: PAL.onsenWaterDeep, transparent: true, opacity: 0.85, cache: false,
    }));
    water.scale.set(1, 1, 0.74);
    water.position.set(px, Y + 0.07, pz);
    water.userData.noOutline = true;
    ctx.add(water);
    // one pale crescent for the sky in it, which is all a still pond needs
    const sky = new THREE.Mesh(new THREE.CircleGeometry(0.34, 12),
      flat({ color: PAL.waterSky, transparent: true, opacity: 0.5, depthWrite: false, cache: false }));
    sky.rotation.x = -Math.PI / 2;
    sky.scale.set(1, 1, 0.5);
    sky.position.set(px - 0.3, Y + 0.08, pz + 0.16);
    sky.userData.noOutline = true;
    ctx.add(sky);
    ctx.collide(px - 1.3, pz - 1.0, px + 1.3, pz + 1.0, Y + 0.24);
  }
  {
    const lamp = makeStoneLantern({ x: gx + 1.5, z: 51.9, y: Y + 0.05, ry: 0.4, scale: 1.05 });
    glow(lamp.userData.glow, -cx + 0.4);
    ctx.add(lamp);
    ctx.collide(gx + 1.2, 51.6, gx + 1.8, 52.2, Y + 1.7);
  }
  ctx.add(makeRock({ x: gx - 1.5, z: 51.9, y: Y + 0.05, r: 0.46, ry: 0.6 }));
  ctx.add(makeRock({ x: gx - 0.9, z: 53.7, y: Y + 0.05, r: 0.3, ry: 2.1, dark: true }));
  ctx.add(makeRock({ x: gx + 1.7, z: 53.5, y: Y + 0.05, r: 0.36, ry: 4.0 }));
  ctx.add(makePine({ x: gx - 1.9, z: 53.2, y: Y + 0.05, scale: 1.5, lean: 0.2, ry: 0.7 }));
  ctx.add(makePine({ x: gx + 0.4, z: 51.75, y: Y + 0.05, scale: 1.05, lean: -0.14, ry: 2.4, deep: true }));
  sakura.push({ x: gx - 0.2, z: 54.0, y: Y + 0.05, scale: 1.06, seed: 9721, lean: 0.12, leanDir: 2.2 });
  shrubs.push({ x: gx + 2.4, z: 53.9, y: Y + 0.05, r: 0.4, count: 3, spread: 0.9, seed: 9722 });
  bamboo.push({ x: X0 + 0.7, z: 56.6, y: Y, n: 9, r: 1.3, seed: 9723 });
  dapple(ctx, { x: gx - 0.4, z: 53.4, y: Y + 0.05, r: 1.1, spread: 1.4, n: 6, rng });

  /* the inn's own clutter, on the court side of the screen */
  ctx.add(makePotShelf({ x: X1 - 0.9, z: 52.0, y: Y + 0.05, ry: Math.PI, w: 1.2, n: 5, seed: 9724 }));
  ctx.add(makeBroom({ x: X1 - 0.5, z: 53.6, y: Y + 0.05, tilt: 0.08, roll: -0.2, ry: 1.2 }));

  /* Steam off the inn's own bath, out of a vent in the north flank -- the one
   * clue that the hot water is the reason any of this is here. */
  const vent = [];
  {
    const vx = cx + 3.0, vz = FRONT_Z + d + 0.1;
    ctx.add(box(0.7, 0.5, 0.3, m.metalDark, vx, Y + 2.6, vz));
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = flat({
      color: PAL.onsenSteam, transparent: true, opacity: 0.15,
      side: THREE.DoubleSide, depthWrite: false, cache: false,
    });
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(geo, mat);
      const s = 1.1 + i * 0.5;
      p.scale.set(s, s * 0.7, 1);
      p.position.set(vx + rng.range(-0.2, 0.2), Y + 3.2 + i * 0.7, vz + 0.3);
      p.rotation.y = rng.range(0, 3);
      p.userData.noOutline = true;
      p.userData.planetRigid = true;
      p.renderOrder = 3;
      ctx.add(p);
      vent.push({ mesh: p, y0: p.position.y, ph: i * 2.1 });
    }
  }
  let t = 0;
  const update = (dt) => {
    t += dt;
    for (const v of vent) {
      v.mesh.position.y = v.y0 + Math.sin(t * 0.16 + v.ph) * 0.2;
      v.mesh.material.opacity = 0.11 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.24 + v.ph));
    }
  };
  return { update };
}

/* -------------------------------- 蓬莱湯 -------------------------------- */
function buildBath(ctx, m, gm, rng, glow, lantern) {
  const X0 = -46.0, X1 = -38.2;
  const cx = (X0 + X1) / 2;
  const d = 5.2;
  const zc = ST.z0 - d / 2;

  const unit = makeOnsenUnit(ctx, {
    x: cx, z: zc, y: Y, w: X1 - X0, d, face: 'z+',
    kind: 'hourai', floors: 1, h1: 4.3, roofH: 1.5, eave: 0.72,
    doorW: 2.9, doorAt: 0, noren: false, blade: false, awningOut: 1.2,
    wallAlt: true, hollow: 2.0, seed: 9731,
  });
  void unit;

  /* the 唐破風 over the entrance -- the one flourish a neighbourhood bath
   * allows itself, and the thing that says "bath" before any sign does */
  {
    const kw = 3.9;
    const pts = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const bx = (t - 0.5) * kw;
      const by = Math.cos((t - 0.5) * Math.PI) * 0.42 + Math.cos((t - 0.5) * Math.PI * 3) * 0.1;
      pts.push([bx, by]);
    }
    const parts = [];
    for (let i = 0; i < N; i++) {
      const [ax, ay] = pts[i];
      const [bx2, by2] = pts[i + 1];
      const len = Math.hypot(bx2 - ax, by2 - ay);
      parts.push({
        geometry: new THREE.BoxGeometry(len + 0.02, 0.14, 1.5),
        matrix: trs((ax + bx2) / 2, (ay + by2) / 2, 0, 0, 0, Math.atan2(by2 - ay, bx2 - ax)),
      });
    }
    const km = new THREE.Mesh(bake(parts), m.tile);
    km.position.set(cx, Y + 3.5, zc + d / 2 + 0.68);
    km.castShadow = true;
    ctx.add(km);
    hullOutline(km, { thickness: 0.0032 });
    for (const s of [-1, 1]) {
      ctx.add(box(0.14, 1.5, 0.14, m.woodDark, cx + s * (kw / 2 - 0.2), Y + 2.7, zc + d / 2 + 1.28));
    }
  }

  /* the mountain board, high on the frontage over the entrance */
  {
    const BW = 4.6, BH = 1.52;
    const art = houraiFuji();
    const frame = box(BW + 0.18, BH + 0.18, 0.1, m.woodDark, cx, Y + 3.05, ST.z0 + 0.03);
    frame.castShadow = true;
    ctx.add(frame);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(BW, BH, 0.1),
      [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: 0xffffff, map: art, cache: false }), flat({ color: PAL.wallGray })]
    );
    board.position.set(cx, Y + 3.05, ST.z0 + 0.09);
    board.castShadow = true;
    ctx.add(board);
    hullOutline(board, { thickness: 0.0032 });
    for (const s of [-1, 1]) {
      ctx.add(box(0.3, 0.09, 0.44, m.metalDark, cx + s * 1.5, Y + 3.95, ST.z0 + 0.24));
    }
  }

  /* The two noren, side by side under the karahafu.
   *
   * 0.24 in front of the frontage line, not 0.06.  The unit's own doorway is a
   * dark board whose face sits at exactly +0.06, so at +0.06 the cloth and the
   * board were coplanar and the board won the depth test about half the time:
   * the entrance of the one building on this street you cannot mistake came
   * out as a flat black rectangle with nothing hanging in it. */
  {
    for (const [s, kind] of [[-1, 'male'], [1, 'female']]) {
      const nx = cx + s * 0.78;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.68),
        flat({ color: 0xffffff, map: onsenNoren(kind), transparent: true, side: THREE.DoubleSide, cache: false }));
      cloth.position.set(nx, Y + 2.1, ST.z0 + 0.24);
      cloth.userData.noOutline = true;
      ctx.add(cloth);
      ctx.add(box(1.5, 0.07, 0.07, m.wood, nx, Y + 2.45, ST.z0 + 0.24));
    }
  }

  /* the chimney -- brick-red, tall, and set back so it reads against the sky
   * from the shrine below as well as from the street */
  {
    const chx = cx - 2.2, chz = zc - d / 2 + 0.9;
    const stack = cyl(0.44, 0.56, 10.5, 10, cel({ color: 0xa8756a, bands: 3, tint: 0x6f5680 }), chx, Y + 5.25, chz);
    stack.castShadow = stack.receiveShadow = true;
    ctx.add(stack);
    hullOutline(stack, { thickness: 0.0034 });
    ctx.add(cyl(0.66, 0.66, 0.32, 10, m.stoneDark, chx, Y + 10.6, chz));
    for (let i = 0; i < 4; i++) {
      ctx.add(cyl(0.58, 0.58, 0.15, 10, cel({ color: 0x8f625c, bands: 3, tint: 0x6f5680 }), chx, Y + 1.9 + i * 2.3, chz));
    }
    ctx.collide(chx - 0.6, chz - 0.6, chx + 0.6, chz + 0.6, Y + 10.8);
  }

  /* ------------------------- the changing lobby ------------------------- *
   * Hollow for two metres behind the noren, because that is the part of this
   * building the player stands a metre from: the shoe lockers, the step up out
   * of the street, the scale and the bench. */
  {
    const fz = ST.z0;
    const lockerMat = cel({ color: 0xb99a72, bands: 3, tint: 0x6f5680 });
    const step = box(3.6, 0.16, 0.44, cel({ color: 0xd8cdb8, bands: 3, tint: 0x6a6288 }), cx, Y + 0.08, fz - 0.68);
    step.receiveShadow = true;
    ctx.add(step);
    ctx.add(box(3.6, 0.2, 0.06, m.wood, cx, Y + 0.06, fz - 0.47));

    const bodies = [];
    const trim = [];
    for (let i = 0; i < 3; i++) {
      const lx = cx - 1.7 + i * 0.62;
      bodies.push({ geometry: new THREE.BoxGeometry(0.58, 1.6, 0.34), matrix: trs(lx, Y + 1.0, fz - 1.7) });
      for (let r = 0; r < 4; r++) {
        trim.push({ geometry: new THREE.BoxGeometry(0.52, 0.035, 0.04), matrix: trs(lx, Y + 0.42 + r * 0.39, fz - 1.52) });
        trim.push({ geometry: new THREE.BoxGeometry(0.05, 0.1, 0.03), matrix: trs(lx + 0.19, Y + 0.36 + r * 0.39, fz - 1.52) });
      }
    }
    const lm = new THREE.Mesh(bake(bodies), lockerMat);
    lm.castShadow = lm.receiveShadow = true;
    ctx.add(lm);
    ctx.add(new THREE.Mesh(bake(trim), cel({ color: 0x8a6f52, bands: 2, tint: 0x5c5680 })));
    ctx.add(makeScale({ x: cx + 1.6, z: fz - 1.5, y: Y + 0.16, ry: -0.3 }));
    ctx.add(makeBench({ x: cx + 0.65, z: fz - 0.55, y: Y + 0.24, ry: Math.PI, len: 1.5, back: false }));
    /* No back wall: the unit's own `hollow: 2.0` cuts the volume back to
     * exactly this plane, so one written here would be coplanar with it. */
  }

  /* the kit outside: a milk crate on the sill, the machine, a bin and a bench */
  ctx.add(makeMilkCrate({ x: X1 - 0.7, z: ST.z0 + 0.4, y: Y, n: 2, ry: Math.PI }));
  addVending(ctx, { x: X1 - 1.9, z: ST.z0 + 0.55, y: Y, ry: 0, variant: 1, seed: 9741 });
  ctx.add(makeVendBin({ x: X1 - 3.15, z: ST.z0 + 1.0, y: Y + 0.05, ry: 0 }));
  ctx.add(makeBench({ x: X0 + 1.5, z: ST.z0 + 0.6, y: Y, ry: 0, len: 1.3 }));
  ctx.add(makePlanter({ x: X0 + 0.5, z: ST.z0 + 0.5, y: Y, r: 0.26, flower: true, seed: 9742, n: 5 }));
  // the bracket lantern on the east pier, the last one the ramp reaches
  ctx.add(lantern({ x: X1 - 0.2, y: Y + 2.9, z: ST.z0 + 0.35, r: 0.19, drop: 0.3, variant: 2 }, -X0 + 1));
  ctx.add(box(0.5, 0.07, 0.07, m.metalDark, X1 - 0.42, Y + 3.18, ST.z0 + 0.2));
}

/* --------------------------------- 足湯 --------------------------------- *
 * Free, off the street, beside the bath and fed off the channel: a stone
 * trough with a bamboo spout over it, a roof you can stand under, a rail for
 * the towel you brought, and the board that says all of that. */
function buildAshiyu(ctx, m, gm, rng, glow) {
  const cx = -36.4, cz = ST.z0 - 1.5;
  const W = 3.0, D = 2.6;

  // the paving under it, a shade warmer than the street
  pad(ctx, { x: cx, z: cz, w: W + 0.6, d: D + 0.5, y: Y, h: 0.05, mat: gm.stoneWarm, name: 'ashiyuPad' });

  /* the trough: a stone box with water in it and a wet apron round it */
  {
    const T = { w: 2.4, d: 1.0, h: 0.46 };
    const ring = [];
    for (const [ox, oz, sw, sd] of [
      [0, -T.d / 2, T.w, 0.22], [0, T.d / 2, T.w, 0.22],
      [-T.w / 2, 0, 0.22, T.d + 0.22], [T.w / 2, 0, 0.22, T.d + 0.22],
    ]) {
      ring.push({ geometry: new THREE.BoxGeometry(sw, T.h, sd), matrix: trs(cx + ox, T.h / 2, cz - 0.3 + oz) });
    }
    const rm = new THREE.Mesh(bake(ring), m.stoneDark);
    rm.position.y = Y + 0.05;
    rm.castShadow = rm.receiveShadow = true;
    ctx.add(rm);
    hullOutline(rm, { thickness: 0.003 });
    ctx.add(box(T.w - 0.2, 0.1, T.d - 0.1, m.stoneWarm, cx, Y + 0.1, cz - 0.3));
    const geo = new THREE.PlaneGeometry(T.w - 0.24, T.d - 0.14);
    geo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(geo, flat({
      color: PAL.onsenWater, transparent: true, opacity: 0.9, cache: false,
    }));
    water.position.set(cx, Y + 0.4, cz - 0.3);
    water.userData.noOutline = true;
    ctx.add(water);
    ctx.collide(cx - T.w / 2 - 0.1, cz - 0.3 - T.d / 2 - 0.2, cx + T.w / 2 + 0.1, cz - 0.3 + T.d / 2 + 0.2, Y + 0.5);
    // the wet stone round it: darker, and only on the side you sit on
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(T.w + 0.5, 0.7),
      flat({ color: 0x9aa0a8, transparent: true, opacity: 0.3, depthWrite: false, cache: false }));
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(cx, Y + 0.055, cz + 0.55);
    wet.userData.noOutline = true;
    ctx.add(wet);
  }

  /* the spout: bamboo, off a small header fed from the channel side */
  {
    const sx = cx + 1.35;
    ctx.add(box(0.3, 0.8, 0.3, m.stoneDark, sx, Y + 0.45, cz - 0.3));
    const pipe = cyl(0.055, 0.055, 0.9, 7, m.bamboo, sx - 0.4, Y + 0.9, cz - 0.3);
    pipe.rotation.z = Math.PI / 2 - 0.2;
    ctx.add(pipe);
    ctx.add(cyl(0.06, 0.06, 0.55, 7, m.bambooDeep, sx, Y + 0.62, cz - 0.3));
    const fall = box(0.06, 0.42, 0.05, flat({
      color: 0xdcecea, transparent: true, opacity: 0.6, depthWrite: false, cache: false,
    }), sx - 0.78, Y + 0.6, cz - 0.3);
    fall.userData.noOutline = true;
    ctx.add(fall);
  }

  /* the shelter: four posts, a shallow tiled roof, and a lantern under it */
  {
    const H = 2.5;
    const posts = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        posts.push({
          geometry: new THREE.BoxGeometry(0.14, H, 0.14),
          matrix: trs(cx + sx * (W / 2 - 0.1), H / 2, cz + sz * (D / 2 - 0.1)),
        });
      }
    }
    for (const sz of [-1, 1]) {
      posts.push({
        geometry: new THREE.BoxGeometry(W, 0.14, 0.12),
        matrix: trs(cx, H - 0.08, cz + sz * (D / 2 - 0.1)),
      });
    }
    const pm = new THREE.Mesh(bake(posts), m.woodDark);
    pm.name = 'openFrame';
    pm.position.y = Y + 0.05;
    pm.castShadow = true;
    ctx.add(pm);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        ctx.collide(cx + sx * (W / 2 - 0.1) - 0.08, cz + sz * (D / 2 - 0.1) - 0.08,
          cx + sx * (W / 2 - 0.1) + 0.08, cz + sz * (D / 2 - 0.1) + 0.08, Y + H);
      }
    }
    const tilt = 0.2;
    const roof = box(W + 0.7, 0.12, (D + 0.8) / Math.cos(tilt), m.tile, cx, Y + H + 0.24, cz);
    roof.rotation.x = -tilt;
    roof.castShadow = true;
    ctx.add(roof);
    ctx.add(box(W + 0.8, 0.14, 0.14, m.tileEdge, cx, Y + H + 0.24 - Math.sin(tilt) * (D + 0.8) / 2 - 0.04, cz + (D + 0.8) / 2));
    ctx.collide(cx - (W + 0.7) / 2, cz - (D + 0.8) / 2, cx + (W + 0.7) / 2, cz + (D + 0.8) / 2,
      Y + H + 0.42, Y + H + 0.08, true);
    const lamp = makeDoorLamp({ x: cx - 0.9, y: Y + H - 0.05, z: cz - D / 2 + 0.14, ry: 0, out: 0.0 });
    glow(lamp.userData.glow, -cx);
    ctx.add(lamp);
  }

  /* the towel rail, the notice, and a pair of buckets under the bench */
  {
    const rx = cx - W / 2 + 0.1;
    for (const dz of [-0.7, 0.7]) ctx.add(cyl(0.035, 0.035, 1.0, 6, m.woodPale, rx - 0.24, Y + 0.55, cz + dz));
    const bar = cyl(0.035, 0.035, 1.5, 6, m.woodPale, rx - 0.24, Y + 1.02, cz);
    bar.rotation.x = Math.PI / 2;
    ctx.add(bar);
    const towels = [];
    for (const [dz, w0, h0] of [[-0.42, 0.34, 0.5], [0.1, 0.3, 0.44], [0.55, 0.32, 0.54]]) {
      towels.push({ geometry: new THREE.PlaneGeometry(w0, h0), matrix: trs(rx - 0.24, Y + 1.0 - h0 / 2, cz + dz) });
    }
    const tm = new THREE.Mesh(bake(towels), cel({
      color: 0xf2ece0, bands: 2, side: THREE.DoubleSide, tint: 0x6f6790,
    }));
    tm.rotation.y = Math.PI / 2;
    tm.castShadow = true;
    ctx.add(tm);
    ctx.add(makeBucket({ x: rx - 0.1, z: cz + 1.05, y: Y + 0.05, ry: -0.6, tilt: 0.1 }));
  }
  {
    const bx = cx + W / 2 + 0.35, bz = cz + 0.5;
    for (const s of [-1, 1]) ctx.add(box(0.08, 1.3, 0.08, m.woodDark, bx, Y + 0.65, bz + s * 0.28));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.82),
      flat({ color: 0xffffff, map: ashiyuPlate(), cache: false }));
    plate.position.set(bx - 0.05, Y + 1.28, bz);
    plate.rotation.y = -Math.PI / 2;
    plate.userData.noOutline = true;
    ctx.add(plate);
    ctx.add(box(0.1, 0.9, 0.72, m.woodPale, bx, Y + 1.28, bz));
    ctx.add(box(0.16, 0.08, 0.86, m.tileEdge, bx, Y + 1.76, bz));
    for (const s of [-1, 1]) {
      ctx.collide(bx - 0.06, bz + s * 0.28 - 0.06, bx + 0.06, bz + s * 0.28 + 0.06, Y + 1.3, Y, true);
    }
    ctx.collide(bx - 0.08, bz - 0.36, bx + 0.08, bz + 0.36, Y + 1.73, Y + 0.83, true);
    ctx.collide(bx - 0.10, bz - 0.43, bx + 0.10, bz + 0.43, Y + 1.80, Y + 1.72, true);
  }

  /* two very small puffs, and no more: this is 2 m from the player's face and
   * it is the one place where too much steam would read as fog */
  {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = flat({
      color: PAL.onsenSteam, transparent: true, opacity: 0.14,
      side: THREE.DoubleSide, depthWrite: false, cache: false,
    });
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Mesh(geo, mat);
      p.scale.set(1.3, 0.7, 1);
      p.position.set(cx + (i ? 0.6 : -0.5), Y + 0.85 + i * 0.2, cz - 0.3);
      p.rotation.y = i ? 0.6 : -0.4;
      p.userData.noOutline = true;
      p.userData.planetRigid = true;
      p.renderOrder = 3;
      ctx.add(p);
    }
  }
}

/* ------------------------ the three small tenants ------------------------ */
function buildShops(ctx, m, gm, rng, glow, lantern) {
  /* 甘味処 さくら庵 -- north side, east of the channel */
  {
    const X0 = -32.4, X1 = -27.8;
    const cx = (X0 + X1) / 2, d = 4.8;
    const u = makeOnsenUnit(ctx, {
      x: cx, z: ST.z1 + d / 2, y: Y, w: X1 - X0, d, face: 'z-',
      kind: 'sakuraan', floors: 2, h1: 2.9, h2: 2.3, roofH: 1.15, hip: false,
      doorW: 1.4, doorAt: -0.12, noren: 'kanmi', blade: true, bladeSide: 1,
      balcony: true, windows: 2, wallAlt: true, interior: 2, seed: 9751,
    });
    for (const mat of u.lit) glow(mat, -cx + 0.6);
    ctx.add(makeCrates({ x: X1 - 0.5, z: ST.z1 - 0.55, y: Y, n: 2, seed: 9752, ry: Math.PI + 0.2 }));
    ctx.add(makePlanter({ x: X0 + 0.45, z: ST.z1 - 0.5, y: Y, r: 0.24, flower: true, seed: 9753, n: 5 }));
    ctx.add(lantern({ x: X0 + 0.35, y: Y + 2.55, z: ST.z1 - 0.4, r: 0.15, drop: 0.24, variant: 0 }, -cx - 1));
    ctx.add(lantern({ x: X1 - 0.35, y: Y + 2.55, z: ST.z1 - 0.4, r: 0.15, drop: 0.24, variant: 0 }, -cx + 1));
    ctx.add(makeCatBox({ x: X1 + 0.3, z: ST.z1 - 0.7, y: Y, ry: -0.7, cat: 0xd8c9b4 }));
  }

  /* 純喫茶 ゆのか -- south side, east of the channel.  A window instead of a
   * lattice panel, because a kissaten's whole face is its window. */
  {
    const X0 = -33.0, X1 = -28.6;
    const cx = (X0 + X1) / 2, d = 4.6;
    const u = makeOnsenUnit(ctx, {
      x: cx, z: ST.z0 - d / 2, y: Y, w: X1 - X0, d, face: 'z+',
      kind: 'yunoka', floors: 2, h1: 2.9, h2: 2.2, roofH: 1.1,
      doorW: 1.2, doorAt: 0.24, noren: 'kissa', blade: true, bladeSide: -1,
      windows: 2, awningOut: 1.0, seed: 9761,
    });
    for (const mat of u.lit) glow(mat, -cx);
    /* the ground-floor window: a real hole with a warm plate behind it, set
     * into the lattice run rather than over it */
    {
      const wx = cx - 0.7, ww = 1.9, wh = 1.25, wy = Y + 1.5;
      ctx.add(box(ww + 0.2, wh + 0.2, 0.14, m.woodDark, wx, wy, ST.z0 - 0.1));
      const room = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh),
        flat({ color: 0xffffff, map: tatamiRoom(1), cache: false }));
      room.position.set(wx, wy, ST.z0 - 0.035);
      room.rotation.y = Math.PI;
      room.userData.noOutline = true;
      ctx.add(room);
      glow(room.material, -cx - 0.2);
      ctx.add(box(ww, wh, 0.04, m.glass, wx, wy, ST.z0 - 0.005));
      ctx.add(box(0.06, wh, 0.07, m.wood, wx, wy, ST.z0 + 0.02));
      ctx.add(box(ww + 0.14, 0.07, 0.08, m.wood, wx, wy + wh / 2, ST.z0 + 0.02));
      ctx.add(box(ww + 0.14, 0.07, 0.08, m.wood, wx, wy - wh / 2, ST.z0 + 0.02));
    }
    ctx.add(makeSignPost({
      x: X1 - 0.4, z: ST.z0 + 0.7, y: Y, ry: Math.PI, h: 1.3, postMat: m.woodDark,
      plates: [{ map: poster(2), w: 0.42, h: 0.56, y: 1.0 }],
    }));
    ctx.add(makePlanter({ x: X0 + 0.4, z: ST.z0 + 0.45, y: Y, r: 0.22, flower: false, seed: 9762, n: 4 }));
  }

  /* みやげ こけし堂 -- south side, at the gate end, so it is the first
   * frontage you meet coming up the steps */
  {
    const X0 = -28.2, X1 = -24.2;
    const cx = (X0 + X1) / 2, d = 4.4;
    const u = makeOnsenUnit(ctx, {
      x: cx, z: ST.z0 - d / 2, y: Y, w: X1 - X0, d, face: 'z+',
      kind: 'kokeshi', floors: 1, h1: 3.1, roofH: 1.1,
      doorW: 1.6, noren: false, blade: true, bladeSide: 1, awningOut: 1.15,
      wallAlt: true, seed: 9771,
    });
    void u;
    // the trestle of goods under the canopy, which is the shop's whole face
    {
      const tx = cx, tz = ST.z0 + 0.62;
      ctx.add(box(3.0, 0.09, 0.72, m.woodPale, tx, Y + 0.78, tz));
      for (const s of [-1, 1]) {
        ctx.add(box(0.09, 0.78, 0.09, m.woodDark, tx + s * 1.35, Y + 0.39, tz - 0.26));
        ctx.add(box(0.09, 0.78, 0.09, m.woodDark, tx + s * 1.35, Y + 0.39, tz + 0.26));
        ctx.collide(tx + s * 1.35 - 0.07, tz - 0.32, tx + s * 1.35 + 0.07, tz + 0.32, Y + 0.78, Y, true);
      }
      ctx.collide(tx - 1.55, tz - 0.40, tx + 1.55, tz + 0.40, Y + 0.84, Y + 0.72, true);
      const goods = [];
      const COL = [0xb5322f, 0xf4c033, 0x2c3a52, 0xefe2c8, 0x8a4a62, 0x4f8f6a];
      for (let i = 0; i < 11; i++) {
        const gx = tx - 1.24 + (i % 6) * 0.5;
        const gz = tz + (i < 6 ? -0.16 : 0.18);
        const hh = rng.range(0.18, 0.3);
        goods.push({
          geometry: new THREE.CylinderGeometry(0.055, 0.075, hh, 8),
          matrix: trs(gx, Y + 0.83 + hh / 2, gz),
          c: COL[i % COL.length],
        });
      }
      for (const g0 of goods) {
        const mesh = new THREE.Mesh(g0.geometry, cel({ color: g0.c, bands: 3, tint: 0x6f6790 }));
        mesh.applyMatrix4(g0.matrix);
        mesh.castShadow = true;
        ctx.add(mesh);
        // the head, which is what makes a こけし a こけし and not a peg
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.062, 7, 5), cel({ color: 0xf0e2cc, bands: 3, tint: 0x6f6790 }));
        head.position.setFromMatrixPosition(g0.matrix);
        head.position.y += 0.11;
        ctx.add(head);
      }
    }
    ctx.add(lantern({ x: X0 + 0.35, y: Y + 2.5, z: ST.z0 + 0.4, r: 0.15, drop: 0.24, variant: 1 }, -cx));
    /* The refuse point goes on the *north* side at the east end.  At X1 + 1.2
     * it stood squarely in the opening of the back gate, which is the one
     * sight line into this street that has to be clean: you come up eleven
     * steps and the first thing framed by the posts was three coloured bins. */
    ctx.add(makeBins({ x: -24.0, z: ST.z1 + 0.55, y: Y, ry: 0 }));
  }
}

/* ---------------------------- the viewing deck ---------------------------- *
 * Two short flights and a quarter turn onto a timber platform 4.2 m over the
 * street at its east end.  It looks *along* the street rather than across it,
 * which is the whole reason it is only four metres up: from here the two rows
 * of tile fall away west into the sun, the shrine roof is below you to the
 * south, and the tracks are 55 m out on the far side of it.
 */
function buildDeck(ctx, m, gm, lantern, sakura) {
  const DX = -21.6, DZ = 55.4;                 // the platform centre
  const DY = Y + 4.2;
  const W = 3.6, D = 3.0;

  /* the posts.  Four pairs, braced -- a deck this height on four single sticks
   * reads as scaffolding. */
  const posts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = DX + sx * (W / 2 - 0.22), pz = DZ + sz * (D / 2 - 0.22);
      posts.push({ geometry: new THREE.BoxGeometry(0.22, DY - Y, 0.22), matrix: trs(px, (DY - Y) / 2 + Y, pz) });
      ctx.collide(px - 0.12, pz - 0.12, px + 0.12, pz + 0.12, DY);
    }
    posts.push({
      geometry: new THREE.BoxGeometry(0.12, 0.12, D - 0.44),
      matrix: trs(DX + sx * (W / 2 - 0.22), Y + 1.9, DZ),
    });
  }
  for (const sz of [-1, 1]) {
    posts.push({
      geometry: new THREE.BoxGeometry(W - 0.44, 0.12, 0.12),
      matrix: trs(DX, Y + 1.9, DZ + sz * (D / 2 - 0.22)),
    });
    // the diagonal brace, which is the thing that makes it read as built
    posts.push({
      geometry: new THREE.BoxGeometry(Math.hypot(W - 0.44, 2.0), 0.1, 0.1),
      matrix: trs(DX, Y + 0.95, DZ + sz * (D / 2 - 0.22), 0, 0, Math.atan2(2.0, W - 0.44) * sz),
    });
  }
  const pm = new THREE.Mesh(bake(posts), m.woodDark);
  pm.name = 'openFrame';
  pm.castShadow = pm.receiveShadow = true;
  ctx.add(pm);

  /* the deck boards and the rail */
  {
    const boards = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      boards.push({
        geometry: new THREE.BoxGeometry(W / n - 0.03, 0.1, D),
        matrix: trs(DX - W / 2 + (W * (i + 0.5)) / n, 0, DZ),
      });
    }
    const bm = new THREE.Mesh(bake(boards), m.wood);
    bm.position.y = DY - 0.05;
    bm.castShadow = bm.receiveShadow = true;
    ctx.add(bm);
    hullOutline(bm, { thickness: 0.0032 });
    ctx.platform({ x0: DX - W / 2, x1: DX + W / 2, z0: DZ - D / 2, z1: DZ + D / 2, top: DY });

    const rails = [];
    // open to the south-west, railed on the other two and a half sides
    const sides = [
      { axis: 'x', at: DZ + D / 2 - 0.06, from: DX - W / 2, to: DX + W / 2 },
      { axis: 'z', at: DX + W / 2 - 0.06, from: DZ - D / 2, to: DZ + D / 2 },
      { axis: 'x', at: DZ - D / 2 + 0.06, from: DX + 0.4, to: DX + W / 2 },
      { axis: 'z', at: DX - W / 2 + 0.06, from: DZ - D / 2, to: DZ - 0.5 },
    ];
    for (const s of sides) {
      const len = s.to - s.from;
      const np = Math.max(2, Math.round(len / 0.7));
      for (let i = 0; i <= np; i++) {
        const c = s.from + (len * i) / np;
        rails.push({
          geometry: new THREE.BoxGeometry(0.06, 0.94, 0.06),
          matrix: s.axis === 'z' ? trs(s.at, 0.47, c) : trs(c, 0.47, s.at),
        });
        if (s.axis === 'z') ctx.collide(s.at - 0.05, c - 0.05, s.at + 0.05, c + 0.05, DY + 0.95, DY, true);
        else ctx.collide(c - 0.05, s.at - 0.05, c + 0.05, s.at + 0.05, DY + 0.95, DY, true);
      }
      for (const yy of [0.92, 0.5]) {
        rails.push({
          geometry: new THREE.BoxGeometry(s.axis === 'z' ? 0.08 : len, 0.07, s.axis === 'z' ? len : 0.08),
          matrix: s.axis === 'z' ? trs(s.at, yy, (s.from + s.to) / 2) : trs((s.from + s.to) / 2, yy, s.at),
        });
        if (s.axis === 'z') ctx.collide(s.at - 0.05, s.from, s.at + 0.05, s.to, DY + yy + 0.05, DY + yy - 0.05, true);
        else ctx.collide(s.from, s.at - 0.05, s.to, s.at + 0.05, DY + yy + 0.05, DY + yy - 0.05, true);
      }
    }
    const rm = new THREE.Mesh(bake(rails), m.woodPale);
    rm.name = 'openFrame';
    rm.position.y = DY;
    rm.castShadow = true;
    ctx.add(rm);
    // the top rail you lean on, and one lantern on the corner post
    ctx.add(lantern({ x: DX + W / 2 - 0.06, y: DY + 1.5, z: DZ - D / 2 + 0.06, r: 0.16, drop: 0.26, variant: 1 }, 40));
  }

  /* The two flights: up +z from the street, a landing, then a quarter turn west
   * **alongside** the deck.
   *
   * It used to turn *under* it.  Flight 2 ran along x at z 53.3..54.8 while the
   * platform above it is z 53.9..56.9, so nine of its ten treads climbed in the
   * dark below the deck boards and only the last one came out -- "half the stairs
   * are under the platform", and correctly so.  The turn has to land the second
   * flight against the deck's south edge instead of inside its footprint, and
   * once it does, three things follow and every one of them was got wrong first
   * time round, so they are worth writing down:
   *
   *  - **flight 2 leaves the landing's *west* edge, not its east one.**  Started at
   *    `F1X + 0.75` it climbed back *across* the landing: by the middle of it the
   *    treads were already three risers up, 0.63 m above the slab and outside
   *    `heightAt`'s 0.55 m reach, and the one tread you could have stepped onto was
   *    behind flight 1's own rail.  The flight was unclimbable from the street.
   *  - **the deck's west rail decides where you may arrive.**  Its collider is
   *    inflated to x -23.78..-22.90 by the player's radius, so the top tread has to
   *    stop east of that: 8 treads of 0.30 from -20.35 land at -22.75, inside the
   *    stretch of the deck's south edge that carries no rail (x -23.4..-21.2).
   *  - **flight 1 pays for it in run**, 12 treads instead of 7 -- so its going is
   *    0.26 rather than 0.30, which keeps its foot at z = 49.33 and out of the
   *    middle of a 4.8 m street. */
  const RISE = 0.21, RUN1 = 0.26, RUN2 = 0.30;
  const N1 = 12, N2 = 8;                       // 12 + 8 = 20 x 0.21 = the 4.2 m rise
  const MID = Y + N1 * RISE;                   // 5.72, the landing
  const F1X = -19.60;                          // flight 1's centreline, 1.5 m wide
  const F2Z = DZ - D / 2 - 0.70;               // 53.20, flight 2's -- also 1.5 m
  const LZ0 = F2Z - 0.75;                      // 52.45, the landing's south edge
  const F2X0 = F1X - 0.75;                     // -20.35, the landing's west edge
  steps(ctx, {
    x: F1X, z: LZ0 - N1 * RUN1, axis: 'z', dir: 1, n: N1, rise: RISE, run: RUN1,
    w: 1.5, y: Y, mat: m.wood, lipMat: m.woodDark,
  });
  ctx.platform({ x0: F2X0, x1: F1X + 0.75, z0: LZ0 - 0.1, z1: F2Z + 0.75, top: MID });
  ctx.add(box(1.5, 0.12, 1.5, m.wood, F1X, MID - 0.06, F2Z));
  steps(ctx, {
    x: F2X0, z: F2Z, axis: 'x', dir: -1, n: N2, rise: RISE, run: RUN2,
    w: 1.5, y: MID, mat: m.wood, lipMat: m.woodDark,
  });
  // and the bridge onto the boards, so the joint is an overlap and not a knife edge
  ctx.platform({
    x0: F2X0 - N2 * RUN2, x1: F2X0 - N2 * RUN2 + 1.0,
    z0: F2Z + 0.6, z1: DZ - D / 2 + 0.2, top: DY,
  });

  /* The stringers, the two handrails **and their balusters**.  Flight 1 carried a
   * single pipe rail with nothing under it -- 4 m of pale cylinder floating beside
   * the flight, which is what "the handrail does not reach the ground" is -- and
   * flight 2 had none at all.
   *
   * Flight 1 is railed on its **west** side only: its east flank runs against the
   * terrace's own retaining wall at x = -18.8, which guards it and already carries
   * a collider.  Flight 2 is railed on its south side, which is the side you fall
   * off, and it starts at the landing's west edge so nothing stands in the arrival. */
  {
    const RH = 0.95;
    const F1Z0 = LZ0 - N1 * RUN1;
    const legs = [];
    for (let i = 0; i <= N1; i += 2) {
      for (const s of [-1, 1]) {
        legs.push({
          geometry: new THREE.BoxGeometry(0.1, RISE * i + 0.4, 0.1),
          matrix: trs(F1X + s * 0.72, Y + (RISE * i + 0.4) / 2, F1Z0 + i * RUN1),
        });
      }
    }
    for (let i = 0; i <= N2; i += 2) {
      const h = MID + RISE * i;
      legs.push({
        geometry: new THREE.BoxGeometry(0.1, h - Y + 0.2, 0.1),
        matrix: trs(F2X0 - i * RUN2, (h + Y) / 2 + 0.1, F2Z - 0.72),
      });
    }
    const lm = new THREE.Mesh(bake(legs), m.woodDark);
    lm.castShadow = true;
    ctx.add(lm);

    /* Each baluster runs from the tread it stands on up to the rail, so its length
     * is the handrail height and its centre half that above the tread. */
    const rails = [];
    for (let i = 0; i <= N1; i++) {
      rails.push({
        geometry: new THREE.CylinderGeometry(0.028, 0.03, RH, 6),
        matrix: trs(F1X - 0.72, Y + RISE * i + RH / 2, F1Z0 + i * RUN1),
      });
    }
    {
      const run = N1 * RUN1, rise = N1 * RISE;
      rails.push({
        geometry: new THREE.CylinderGeometry(0.035, 0.035, Math.hypot(run, rise) + 0.3, 7),
        matrix: trs(F1X - 0.72, Y + rise / 2 + RH, F1Z0 + run / 2,
          Math.PI / 2 - Math.atan2(rise, run), 0, 0),
      });
    }
    for (let i = 0; i <= N2; i++) {
      rails.push({
        geometry: new THREE.CylinderGeometry(0.028, 0.03, RH, 6),
        matrix: trs(F2X0 - i * RUN2, MID + RISE * i + RH / 2, F2Z - 0.72),
      });
    }
    {
      const run = N2 * RUN2, rise = N2 * RISE;
      rails.push({
        geometry: new THREE.CylinderGeometry(0.035, 0.035, Math.hypot(run, rise) + 0.3, 7),
        /* **A cylinder's axis is +y, not +x, so the box rule is inverted here.**
         * `Rz(t)` sends (0,1,0) to (-sin t, cos t, 0), so `rz = PI/2 - tilt` points
         * the rail toward **-x and up** -- which is the way this flight climbs.
         * Writing it negative, as one would for a *box* whose long axis is +x,
         * rakes the rail the opposite way to its own treads.  Flight 1's `rx` a few
         * lines up is the same identity about X and was right. */
        matrix: trs(F2X0 - run / 2, MID + rise / 2 + RH, F2Z - 0.72,
          0, 0, Math.PI / 2 - Math.atan2(rise, run)),
      });
    }
    const rm = new THREE.Mesh(bake(rails), m.woodPale);
    rm.castShadow = true;
    ctx.add(rm);

    for (let i = 0; i < N1; i += 2) {
      const z0 = F1Z0 + i * RUN1;
      const z1 = F1Z0 + Math.min(i + 2, N1) * RUN1;
      ctx.collide(F1X - 0.82, z0, F1X - 0.62, z1, Y + RISE * i + 0.95);
    }
    // flight 2's outer edge, topped at its own low end so it is a barrier the
    // whole way up rather than a step you walk over at the bottom
    for (let i = 0; i < N2; i += 2) {
      const x1 = F2X0 - i * RUN2, x0 = F2X0 - Math.min(i + 2, N2) * RUN2;
      ctx.collide(x0, F2Z - 0.82, x1, F2Z - 0.62, MID + RISE * i + 0.95);
    }
  }

  /* The cherry stands well back and to the north.  At 3.4 m off the platform
   * it was not next to the deck, it was *round* it: a deck four metres up is
   * inside the canopy layer, and the whole view west was blossom.
   *
   * Pulled 2.2 m back south from z = DZ + 5.2 (60.6) with ひばり台七丁目, and
   * it was a **floating tree**: the terrace ends at TER.z1 = 59.6 and this one
   * was seated at the terrace height, `Y`, with the field 2.75 m below it.  It
   * never showed because there was nothing out there to see it against; the
   * supermarket's ramp now runs past it at eye level.  z = 58.4 puts it on the
   * slab it was always meant to be standing on, 2.3 m clear of 蓬莱湯's north
   * wall, and does not change the job it does for the deck. */
  sakura.push({ x: DX - 9.0, z: 58.4, y: Y, scale: 1.16, seed: 9781, lean: 0.12, leanDir: 5.1 });
}

/* ------------------------------ the dressing ------------------------------ */
function dressStreet(ctx, m, gm, rng, glow, lantern, sakura, shrubs, grove, petals) {
  /* The lantern run.  Not strung across the street the way さくら坂's is --
   * these hang off the eaves on their own brackets, which is what an onsen
   * street does and what keeps the sky over the middle of it clear. */
  for (const [lx, side] of [
    [-44.2, 1], [-40.6, 1], [-31.4, 1], [-28.4, 1], [-25.4, 1],
    [-44.6, -1], [-40.2, -1], [-31.2, -1], [-27.4, -1],
  ]) {
    const lz = side > 0 ? ST.z0 + 0.3 : ST.z1 - 0.3;
    ctx.add(lantern({ x: lx, y: Y + 3.0, z: lz, r: 0.16, drop: 0.26, variant: rng.int(0, 1) }, -lx));
    ctx.add(box(0.06, 0.06, 0.42, m.metalDark, lx, Y + 3.3, lz + side * 0.2));
  }

  /* ---------------------------- closing the west end ----------------------------
   * A street four and a half metres wide has one job in every frame: you see
   * the end of it.  With nothing at the head of the run the terrace's own
   * parapet is only 0.55 m proud, so the whole west end of the picture was
   * open sky at eye height -- a corridor draining out into nothing, which is
   * the same defect as a wall that stops in mid-air.
   *
   * So it gets what an onsen street's head actually has: a 常夜灯 on a plinth,
   * on the axis, with the wood standing up behind it. */
  {
    const lx = TER.x0 + 0.9, lz = (ST.z0 + ST.z1) / 2;
    const plinth = box(1.5, 1.1, 1.5, m.stoneDark, lx, Y + 0.55, lz);
    plinth.castShadow = plinth.receiveShadow = true;
    ctx.add(plinth);
    ctx.add(box(1.74, 0.16, 1.74, m.stoneWarm, lx, Y + 1.18, lz));
    const big = makeStoneLantern({ x: lx, z: lz, y: Y + 1.26, ry: 0.35, scale: 2.0 });
    glow(big.userData.glow, -lx);                // the last light the ramp reaches
    ctx.add(big);
    ctx.collide(lx - 0.85, lz - 0.85, lx + 0.85, lz + 0.85, Y + 4.4);
    // the two low posts either side, so the head of the street reads as a place
    for (const s of [-1, 1]) {
      ctx.add(box(0.22, 0.9, 0.22, m.woodDark, lx + 1.4, Y + 0.45, lz + s * 1.6));
      ctx.add(box(0.3, 0.1, 0.3, m.tileEdge, lx + 1.4, Y + 0.94, lz + s * 1.6));
    }
  }

  /* the street's own furniture, all of it against a frontage */
  /* **Both seats moved 2.6 m west, off the deck stair.**  The east one was on
   * x = -20.8 with 1.8 m of seat along the street, i.e. x -21.7..-19.9 -- and the
   * 展望デッキ's first flight comes down to the street between -20.55 and -19.05,
   * so the bench stood across the bottom two treads.  A seat in front of a stair
   * is the one piece of street furniture that has to be checked against a route
   * rather than against a frontage. */
  ctx.add(makeBench({ x: -25.6, z: ST.z1 - 0.75, y: Y, ry: Math.PI, len: 1.8 }));
  ctx.add(makeBench({ x: -23.4, z: ST.z1 - 0.75, y: Y, ry: Math.PI, len: 1.8 }));
  ctx.add(makePlanter({ x: -22.0, z: ST.z1 - 0.7, y: Y, r: 0.26, flower: true, seed: 9791, n: 5 }));
  ctx.add(makeSignPost({
    x: -19.9, z: 48.9, y: Y, ry: -Math.PI / 2, h: 1.8, postMat: m.woodDark,
    plates: [{ map: paperSheet(), w: 0.4, h: 0.3, y: 1.5, double: true }],
  }));
  makeLoosePaper(ctx, [
    { x: -29.6, z: ST.z0 + 0.7, y: Y + 0.06, ry: 0.8 },
    { x: -38.9, z: ST.z1 - 0.8, y: Y + 0.06, ry: -0.5 },
  ]);

  /* the drain down the middle, which is what says "this street is washed" */
  {
    const grates = [];
    for (let i = 0; i < 13; i++) {
      grates.push({
        geometry: new THREE.BoxGeometry(0.3, 0.04, 0.62),
        matrix: trs(TER.x0 + 2.4 + i * 2.0, 0, (ST.z0 + ST.z1) / 2),
      });
    }
    const gmesh = new THREE.Mesh(bake(grates), cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 }));
    gmesh.position.y = Y + 0.055;
    gmesh.receiveShadow = true;
    ctx.add(gmesh);
  }

  /* ------------------------------- planting ------------------------------- *
   * Blossom on the street and deep green outside the wall, so the shelf reads
   * as cut out of a wood.  Nothing tall in the middle of the run -- the whole
   * point of a street this narrow is that you see the end of it. */
  sakura.push({ x: -35.0, z: ST.z1 + 0.9, y: Y, scale: 1.1, seed: 9801, lean: 0.11, leanDir: 1.4 });
  /* This one used to stand at (-24.6, 52.6), which is four metres off the
   * viewing deck and dead on the axis it looks along: at four metres up you
   * are *in* the canopy layer, so one tree filled the entire west view with
   * blossom.  Moved to the gate court, where it frames the arrival instead. */
  sakura.push({ x: -24.0, z: 44.4, y: Y, scale: 1.18, seed: 9802, lean: 0.1, leanDir: 3.9 });
  for (let i = 0; i < 5; i++) {
    grove.push({
      x: TER.x0 - 2.6 - (i % 2) * 2.2, z: 43.0 + i * 3.6, y: 0.4,
      scale: 1.45 + (i % 3) * 0.15, seed: 9810 + i, spread: 1.15, lean: 0.06, leanDir: i * 1.3,
    });
  }
  /* **The six trees that used to stand north of the terrace are gone.**  They
   * were this street's back -- a green mass in the field so the shelf read as
   * cut out of a wood -- and they occupied (-44.0, 62.4) (-39.4, 64.4)
   * (-34.8, 66.4) (-30.2, 62.4) (-25.6, 64.4) and (-21.0, 66.4), which is the
   * middle of ひばり台七丁目.  スーパー さかえ's south flank and its ramp do
   * that job now, and do it better: a 21 m wall two metres from the retaining
   * wall closes the back of the street completely, and the trees would have
   * been standing in the shop.  The west screen (above) and the east screen
   * (below) both stay -- they are 湯の坂's two side walls and neither moves. */
  for (let i = 0; i < 4; i++) {
    grove.push({
      x: TER.x1 + 3.4 + (i % 2) * 2.4, z: 52.0 + i * 3.4, y: 0.45,
      scale: 1.35 + (i % 2) * 0.2, seed: 9830 + i, spread: 1.1,
    });
  }
  shrubs.push({ x: -19.6, z: 52.6, y: Y, r: 0.46, count: 3, spread: 1.1, seed: 9840 });
  shrubs.push({ x: -46.0, z: 44.4, y: Y, r: 0.5, count: 3, spread: 1.2, seed: 9841 });
  petals.push({ x: -35.0, z: (ST.z0 + ST.z1) / 2, w: 22.0, d: 4.4, y: Y + 0.06, n: 150 });
  petals.push({ x: -42.0, z: 52.8, w: 8.0, d: 3.0, y: Y + 0.06, n: 70 });
}
