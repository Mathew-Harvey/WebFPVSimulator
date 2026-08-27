import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  lakePlate, lakeSign, lakeNotice, lakeMap, boatNumber, birdChart,
  cafeFascia, cafeMenu, cafeInterior, gaugeBoard, warningPlate, parkSign,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit, shadowify } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, steps, railing, wallRun, groundMats, dapple } from './ground.js';
import { addVending } from './vending.js';
import {
  makeBench, makeSignPost, makeNoticeBoard, makeGuideBoard, makeVendBin, makeCone,
  makeStorageShed, makeFlowerBed, makeTapPost, makePlanter, makeCrates, makeBucket,
  makeMilkCrate, makeBroom, makeLoosePaper, makeRecycleBox, makeUmbrellaStand,
  makeAircon, makeBikeRack, makeBicycle, makeDoormat, makeIvy,
} from './props.js';
import { makeMenuBoard, makeShopFlag } from './shops.js';
import { makeChalkMarks } from './streetprops.js';
import { ROUTES, SITES, hillMeshY, hillMats, hillPath, trailSegs, lakeDepthAt } from './hills.js';
import { LEVEL, lakeNear } from './lakeform.js';
import { waterY, SHORE_GAPS } from './lake.js';
import { groundRail, finger, hillLine, logSteps } from './lakeroad.js';

/* ------------------------------------------------------------------ *
 * ひばり湖畔 -- the places round the lake.
 *
 * The twenty-sixth district.  `lakeform.js` shapes the basin, `hills.js` builds
 * the ground, `lake.js` is the water and `lakeroad.js` is the road, the dam and
 * the way over the hill.  This is the eight rooms.
 *
 * ------------------------------------------------------------------ *
 * WHAT DECIDED WHERE EVERYTHING WENT
 *
 * **The sun.**  It is at (-52, 62, 56), so a face whose normal has -x or +z in it
 * is lit and one with +x or -z is in shade, every hour of the day.  That single
 * fact placed four of the eight:
 *
 *   - 喫茶 みなも is on the **south** shore facing north over the water, because a
 *     cafe terrace is the one thing here that must be lit *and* looking at the
 *     lake, and north is the only bearing that is both.
 *   - 貸ボート ひばり is on the **west** shore, so its frontage and its boats are
 *     seen from the cafe's terrace across thirty metres of water -- which is the
 *     one shot the brief asks for by name.
 *   - the 野鳥観察小屋 looks **north-west** over the reed flat, so the birds are
 *     between you and the light and the reeds are rim-lit.
 *   - and the far shore -- the north and the east -- gets **nothing built on it at
 *     all**, because it is the backdrop in every frame taken from the other three
 *     and a building over there would be in all of them.
 *
 * **The curvature.**  From a 1.7 m eye the water surface is visible for 23 m and
 * no further, so every viewpoint here has something of known size inside that
 * radius: the 桟橋's own piles, the boat house's hulls, the reed bed, the
 * peninsula.  A viewpoint whose nearest object is the far shore is a viewpoint of
 * haze.
 *
 * **And the shelf.**  `lakeform.js` gives the west shore a 15 m graded bank at
 * 0.20 and the reed flat a 26 m one at 0.10; everything else is the hillside's own
 * toe.  So the park is on the west shore because that is the only stretch of
 * ground flat enough to put a lawn on, and the campsite is on terraced platforms
 * because the shelf it stands on is 1-in-4 and no amount of wishing changes that.
 * ------------------------------------------------------------------ */

const M = {};
function mats() {
  if (M.timber) return M;
  M.timber = cel({ color: 0x9a7f5e, bands: 3, tint: 0x5c5680 });
  M.timberPale = cel({ color: PAL.onsenWoodPale, bands: 3, tint: 0x5c5680 });
  M.timberDark = cel({ color: 0x6f5943, bands: 3, tint: 0x554d72 });
  M.log = cel({ color: 0x8a7050, bands: 3, tint: 0x5c5680 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.stone = cel({ color: PAL.stone, bands: 3, tint: 0x655d80 });
  M.stoneDark = cel({ color: PAL.stoneDark, bands: 3, tint: 0x605878 });
  M.stoneWarm = cel({ color: PAL.stoneWarm, bands: 3, tint: 0x655d80 });
  M.brick = cel({ color: 0xc4a894, bands: 3, tint: 0x7a7396 });
  M.wallCream = cel({ color: PAL.wallCream, bands: 3, tint: 0x6f6790 });
  M.wallWhite = cel({ color: PAL.wallWhite, bands: 3, tint: 0x6f6790 });
  M.roof = cel({ color: PAL.roofSlate, bands: 3, tint: 0x514b70 });
  M.roofBlue = cel({ color: PAL.roofBlue, bands: 3, tint: 0x514b70 });
  M.glass = flat({ color: PAL.glass, transparent: true, opacity: 0.42 });
  M.rope = cel({ color: PAL.rope, bands: 3, tint: 0x8a83a8 });
  M.torii = cel({ color: PAL.torii, bands: 3, tint: 0x7a4a60 });
  M.rock = cel({ color: PAL.hillRock, bands: 3, tint: 0x6f6790 });
  M.moss = cel({ color: PAL.hillMoss, bands: 3, tint: 0x5b6f8c });
  M.orange = cel({ color: PAL.orange, bands: 3, tint: 0x8f6050 });
  M.red = cel({ color: PAL.red, bands: 3, tint: 0x7a4a60 });
  M.white = cel({ color: PAL.lineWhite, bands: 2, tint: 0x8e86ad });
  return M;
}

/* ------------------------------------------------------------------ *
 * Timber over water: the one construction four of the eight rooms share.
 * ------------------------------------------------------------------ */

/**
 * A plank deck on piles.
 *
 * Used by the 桟橋, the boat station's 浮桟橋, the reed-bay boardwalk, the cafe's
 * terrace and the campsite's tent platforms -- five things that are the same
 * object at different sizes, so they are one function.
 *
 * Three things it gets right that a box would not:
 *
 *   - **the piles reach the ground they are actually standing on.**  Each one is
 *     drawn from the deck down to `hillMeshY` at its own foot, which under water
 *     is the bed.  A deck on piles of one length is a deck floating over a bed
 *     that slopes, and the ink pass draws every one of them.
 *   - **the boards run across.**  A deck's planks are perpendicular to the way you
 *     walk, always, and at this tonal range the row of shadow gaps between them is
 *     most of what says "timber" rather than "grey slab".
 *   - **it registers a platform**, which is what actually carries the player;
 *     `heightAt` takes the max over platforms and knows nothing about geometry.
 *
 * `ry` turns the whole thing about its centre.  `w` is across, `d` along.
 */
export function timberDeck(ctx, o) {
  const m = mats();
  const g = new THREE.Group();
  /* COVER_SOFT. Every pile in a bay is one bake; the union AABB is
   * the deck in plan and the bed-to-plank height, which cover would
   * fill as a wall across the water. Authored pile boxes stay. */
  g.name = 'openFrame';
  const { x, z, w, d, y } = o;
  const ry = o.ry ?? 0;
  const c = Math.cos(ry), s = Math.sin(ry);
  const loc = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  const piles = [];
  const beams = [];
  const boards = [];

  const nu = Math.max(2, Math.round(w / (o.pileU ?? 2.2)));
  const nv = Math.max(2, Math.round(d / (o.pileV ?? 2.4)));
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const [px, pz] = loc(-w / 2 + 0.28 + (i * (w - 0.56)) / nu, -d / 2 + 0.28 + (j * (d - 0.56)) / nv);
      const fy = (o.yAt ?? hillMeshY)(px, pz);
      const H = Math.max(0.35, y - fy + 0.12);
      piles.push({
        geometry: o.round === false
          ? new THREE.BoxGeometry(0.16, H, 0.16)
          : new THREE.CylinderGeometry(0.1, 0.12, H, 7),
        matrix: trs(px, y - H / 2 + 0.06, pz),
      });
      const phw = o.round === false ? 0.09 : 0.13;
      ctx.collide(px - phw, pz - phw, px + phw, pz + phw, y + 0.06, fy, true);
    }
  }
  for (let i = 0; i <= nu; i++) {
    const u = -w / 2 + 0.28 + (i * (w - 0.56)) / nu;
    const [ax, az] = loc(u, -d / 2);
    const [bx, bz] = loc(u, d / 2);
    beams.push({
      geometry: new THREE.BoxGeometry(0.14, 0.19, d),
      matrix: trs((ax + bx) / 2, y - 0.12, (az + bz) / 2, 0, ry, 0),
    });
  }
  const nb = Math.max(2, Math.round(d / 0.2));
  for (let k = 0; k < nb; k++) {
    const v = -d / 2 + 0.08 + (k * (d - 0.16)) / (nb - 1);
    const [bx, bz] = loc(0, v);
    boards.push({
      geometry: new THREE.BoxGeometry(w, 0.055, 0.168),
      matrix: trs(bx, y + 0.03, bz, 0, ry, 0),
    });
  }
  const pm = new THREE.Mesh(bake(piles), o.pileMat ?? m.timberDark);
  pm.castShadow = pm.receiveShadow = true;
  g.add(pm);
  const bm = new THREE.Mesh(bake(beams), m.timberDark);
  bm.castShadow = bm.receiveShadow = true;
  g.add(bm);
  const dm = new THREE.Mesh(bake(boards), o.mat ?? m.timber);
  dm.castShadow = dm.receiveShadow = true;
  g.add(dm);
  hullOutline(dm, { thickness: 0.003 });
  ctx.add(g);

  /* The platform is the AABB of the rotated rectangle.  For a deck at `ry = 0`
   * that is exact; for a turned one it is generous, which on a deck standing over
   * water is the safe direction -- the alternative is a walkable surface with a
   * hole in the corner. */
  const hw = (Math.abs(c) * w + Math.abs(s) * d) / 2;
  const hd = (Math.abs(s) * w + Math.abs(c) * d) / 2;
  if (o.platform !== false) {
    ctx.platform({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, top: y + 0.06 });
  }
  return { group: g, top: y + 0.06, hw, hd };
}

/**
 * A boardwalk swept along a polyline -- the reed-bay crossing and the two boggy
 * stretches of the shore walk.
 *
 * Each bay is a `timberDeck` of its own, so the piles follow the bed and the
 * height follows the water rather than the ground.  Over the reeds the deck sits
 * at a *constant* height above the surface, which is the whole reason it is a
 * boardwalk: the ground under it is 0.4 m of water and there is nothing to grade.
 */
function boardwalk(ctx, pts, o = {}) {
  const w = o.w ?? 1.6;
  const yOf = o.yOf ?? ((x, z) => Math.max(hillMeshY(x, z) + 0.22, waterY(z) + 0.42));
  let n = 0;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const bays = Math.max(1, Math.round(len / 2.6));
    for (let k = 0; k < bays; k++) {
      const t0 = k / bays, t1 = (k + 1) / bays;
      const cx = ax + (bx - ax) * (t0 + t1) / 2;
      const cz = az + (bz - az) * (t0 + t1) / 2;
      timberDeck(ctx, {
        x: cx, z: cz, w, d: len / bays + 0.05,
        y: yOf(cx, cz), ry: Math.atan2(bx - ax, bz - az),
        pileU: 1.4, pileV: 1.4, mat: o.mat,
      });
      n++;
    }
  }
  /* the rail: one side only, on the open water side, because a boardwalk with a
   * rail on both sides is a bridge and this is a path across a marsh */
  if (o.rail !== false) {
    groundRail(ctx, pts, {
      h: 0.92, spacing: 1.5, mat: mats().timber, collide: false,
      yAt: (x, z) => yOf(x, z) + 0.06, name: 'boardwalkRail',
    });
  }
  return n;
}

/**
 * A hire boat: a 2.9 m clinker rowing boat.
 *
 * Built from **joints rather than part positions**, which is the rule this project
 * arrived at after both copies of `makeBicycle` put the fork 0.3 m short of the
 * hub: the hull is four raked panels drawn between the stem, the two beam
 * stations and the transom, so a shared corner is shared by construction.  The
 * thwarts sit *on* the gunwale line and the oars rest in the rowlocks, so nothing
 * floats.
 *
 * The colour matters more than the geometry.  Four hulls: white, pale blue, pale
 * yellow and one red -- and the red one is deliberate.  A row of white boats
 * across thirty metres of water is a row of pale blobs; one saturated hull in it
 * is what the eye lands on, and it is what a park boat station actually looks
 * like.
 */
function makeBoat(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const L = o.len ?? 2.9;
  const W = o.wid ?? 1.12;
  const hull = [];
  const deck = [];
  const dark = [];
  const panel = (ax, az, bx, bz, hgt, yc) => {
    const len = Math.hypot(bx - ax, bz - az);
    hull.push({
      geometry: new THREE.BoxGeometry(len, hgt, 0.06),
      matrix: trs((ax + bx) / 2, yc, (az + bz) / 2, 0, Math.atan2(-(bz - az), bx - ax), 0),
    });
  };
  const HB = 0.42;
  // the four stations: stem, fore beam, aft beam, transom
  const st = [
    [L / 2, 0], [L * 0.16, W / 2], [-L * 0.3, W / 2], [-L / 2, W * 0.34],
  ];
  for (const s of [1, -1]) {
    for (let k = 0; k < st.length - 1; k++) {
      panel(st[k][0], st[k][1] * s, st[k + 1][0], st[k + 1][1] * s, HB, HB / 2);
    }
  }
  // the transom and the bottom
  panel(-L / 2, W * 0.34, -L / 2, -W * 0.34, HB, HB / 2);
  hull.push({
    geometry: new THREE.BoxGeometry(L * 0.92, 0.07, W * 0.82),
    matrix: trs(-L * 0.02, 0.05, 0),
  });
  // the gunwale, all the way round
  for (const s of [1, -1]) {
    for (let k = 0; k < st.length - 1; k++) {
      const ax = st[k][0], az = st[k][1] * s;
      const bx = st[k + 1][0], bz = st[k + 1][1] * s;
      deck.push({
        geometry: new THREE.BoxGeometry(Math.hypot(bx - ax, bz - az), 0.05, 0.1),
        matrix: trs((ax + bx) / 2, HB + 0.01, (az + bz) / 2, 0, Math.atan2(-(bz - az), bx - ax), 0),
      });
    }
  }
  // two thwarts, on the gunwale line
  for (const tx of [L * 0.1, -L * 0.22]) {
    deck.push({ geometry: new THREE.BoxGeometry(0.3, 0.05, W * 0.86), matrix: trs(tx, HB - 0.06, 0) });
  }
  // the inside, dark, so the boat is not a solid lump
  dark.push({ geometry: new THREE.BoxGeometry(L * 0.78, 0.02, W * 0.66), matrix: trs(-L * 0.04, HB - 0.13, 0) });
  // the rowlocks and, in two of the four, a pair of oars shipped fore-and-aft
  for (const s of [1, -1]) {
    dark.push({
      geometry: new THREE.CylinderGeometry(0.022, 0.022, 0.13, 6),
      matrix: trs(L * 0.02, HB + 0.07, s * (W / 2 - 0.03)),
    });
  }
  const bodyMat = cel({ color: o.color ?? PAL.boatWhite, bands: 3, tint: 0x6a6288 });
  const hm = new THREE.Mesh(bake(hull), bodyMat);
  hm.castShadow = hm.receiveShadow = true;
  g.add(hm);
  const dk = new THREE.Mesh(bake(deck), cel({ color: PAL.boatDeck, bands: 3, tint: 0x5c5680 }));
  dk.castShadow = dk.receiveShadow = true;
  g.add(dk);
  g.add(new THREE.Mesh(bake(dark), cel({ color: 0x54493c, bands: 3, tint: 0x554d72 })));
  hullOutline(hm, { thickness: 0.0032 });

  if (o.oars !== false) {
    for (const s of [1, -1]) {
      const oar = new THREE.Group();
      oar.add(cyl(0.028, 0.032, 2.1, 6, m.timberPale, 0, 0, 0));
      const blade = box(0.5, 0.02, 0.13, m.timberPale, -1.15, 0, 0);
      blade.rotation.z = Math.PI / 2;
      oar.add(blade);
      oar.rotation.set(0, 0, Math.PI / 2);
      oar.position.set(-L * 0.06, HB - 0.03, s * (W / 2 - 0.14));
      oar.rotation.y = s * 0.03;
      g.add(oar);
    }
  }
  if (o.number) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.03), [
      m.white, m.white, m.white, m.white,
      m.white, flat({ color: 0xffffff, map: boatNumber(o.number), cache: false }),
    ]);
    plate.position.set(-L / 2 - 0.02, HB - 0.13, 0);
    plate.rotation.y = Math.PI / 2;
    g.add(plate);
  }
  g.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  g.rotation.y = o.ry ?? 0;
  g.rotation.z = o.heel ?? 0;
  return g;
}

/** A 救命浮環 on a post -- the one saturated object on the whole shore walk. */
function lifeRing(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const H = o.h ?? 1.15;
  g.add(cyl(0.05, 0.055, H, 7, m.metalDark, 0, H / 2, 0));
  g.add(box(0.2, 0.06, 0.2, m.concreteMid, 0, 0.03, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.065, 5, 14), m.red);
  ring.position.set(0, H - 0.06, 0.09);
  ring.castShadow = true;
  g.add(ring);
  // the four white bands every ring has, which is what makes it read at distance
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const seg = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.068, 5, 4, 0.7), mats().white);
    seg.rotation.z = a;
    seg.position.set(0, H - 0.06, 0.09);
    g.add(seg);
  }
  g.add(box(0.14, 0.34, 0.03, mats().white, 0, H - 0.42, 0.06));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** 水深注意 -- a depth warning board, the brief's 水深警示牌. */
function depthBoard(ctx, x, z, ry) {
  const m = mats();
  const y = hillMeshY(x, z);
  ctx.add(makeSignPost({
    x, z, y, ry, h: 1.55, postMat: m.metalDark,
    plates: [{ map: warningPlate(1), w: 0.34, h: 0.68, y: 1.02, double: false }],
  }));
  ctx.collide(x - 0.13, z - 0.13, x + 0.13, z + 0.13, y + 1.55);
}

/* ------------------------------------------------------------------ *
 * 湖畔遊歩道 -- the shore walk.
 * ------------------------------------------------------------------ */

/**
 * The walk, and it is **deliberately not a ring**.
 *
 * It runs clockwise from the embankment round the developed half -- the park's
 * frontage, the 桟橋's head, the boat station, under the cafe's terrace, the
 * campsite's shore edge, the reed bay and the 野鳥観察小屋 -- and then carries on
 * as a much narrower dirt trace up the east shore to the 水神様 and stops.
 * Everything north of that is林岸: no path, no way in, and it is the far shore in
 * every frame taken from the park.
 *
 * **The surface changes five times**, and each change is a boundary between two
 * kinds of place rather than decoration: pale concrete along the park, stone slab
 * across the plaza, compacted earth round the south shore, timber over the reed
 * flat, and a bare trace on the east side where the maintained path gives up.
 */
function buildWalk(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();
  const P = ROUTES.shoreWalk.pts;
  const hm = hillMats();

  /* Split the polyline into the five surfaces at the vertices the character
   * changes at.  `hillPath` sweeps each one; nothing registers a platform,
   * because on a hill `hillAt` *is* the ground. */
  const legs = [
    { from: 0, to: 3, w: 1.9, mat: m.concrete, edge: m.concreteMid, name: 'walkDam' },
    { from: 3, to: 8, w: 2.4, mat: m.concrete, edge: m.concreteMid, name: 'walkPark' },
    { from: 8, to: 13, w: 1.9, mat: hm.path, edge: hm.pathEdge, name: 'walkSouthWest' },
    { from: 13, to: 17, w: 1.8, mat: hm.path, edge: hm.pathEdge, name: 'walkCafe' },
    { from: 17, to: 21, w: 1.6, mat: hm.path, edge: hm.pathEdge, name: 'walkReed' },
    { from: 21, to: P.length - 1, w: 1.15, mat: hm.path, edge: hm.pathEdge, name: 'walkEast' },
  ];
  for (const l of legs) {
    hillPath(ctx, {
      pts: P.slice(l.from, l.to + 1), w: l.w, lift: 0.045, drop: 0.3, step: 1.0,
      mat: l.mat, edgeMat: l.edge, name: l.name,
    });
  }
  /* the two spurs: onto the 桟橋's root and down to the 水神様's steps */
  for (const k of ['pierSpur', 'suijinSpur']) {
    hillPath(ctx, {
      pts: ROUTES[k].pts, w: 1.5, lift: 0.045, drop: 0.28, step: 0.8,
      mat: hm.path, edgeMat: hm.pathEdge, name: 'walkSpur',
    });
  }

  /* --- the railing.  On the *water* side, and only where the bank is steep enough
   * to matter: in front of the park (a 0.20 revetment is a step, not a drop) it is
   * a low timber post-and-rail, and on the two stretches where the walk runs a
   * metre above 2.5 m of water it is a proper 1.05 m steel one. --- */
  groundRail(ctx, P.slice(3, 9), { h: 0.62, spacing: 2.1, mat: m.timber, collide: false, name: 'walkRailPark' });
  groundRail(ctx, P.slice(0, 4), { h: 1.05, spacing: 2.0, mat: m.white, name: 'walkRailDam' });
  groundRail(ctx, P.slice(22, 26), { h: 0.95, spacing: 2.0, mat: m.timber, collide: false, name: 'walkRailEast' });

  /* --- furniture.  Everything the brief lists, and every one of them placed on
   * the *landward* verge: a board or a bin standing in a 1.9 m path is a hole in
   * the picture, which is the note `CLAUDE.md` makes about the canal link. --- */
  const side = (i, off) => {
    const a = P[i], b = P[Math.min(P.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    // away from the water
    if (lakeDepthAt(a[0] + nx * 3, a[1] + nz * 3) > lakeDepthAt(a[0] - nx * 3, a[1] - nz * 3)) {
      nx = -nx; nz = -nz;
    }
    return [a[0] + nx * off, a[1] + nz * off, Math.atan2(-nx, -nz)];
  };

  // benches facing the water, at seven places along the walk
  for (const i of [4, 7, 10, 14, 18, 20, 24]) {
    const [bx, bz, ry] = side(i, 1.9);
    const by = ctx.groundAt(bx, bz);
    ctx.add(makeBench({ ctx, x: bx, z: bz, y: by, ry: ry + Math.PI, len: 1.8 }));
  }
  // lamps: low, sparse, and only on the developed half
  for (const i of [3, 6, 9, 12, 15, 19]) {
    const [px, pz] = side(i, 1.6);
    const py = ctx.groundAt(px, pz);
    const g = new THREE.Group();
    g.add(cyl(0.06, 0.075, 2.6, 8, m.metalDark, 0, 1.3, 0));
    g.add(box(0.26, 0.09, 0.26, m.concreteMid, 0, 0.045, 0));
    const head = box(0.3, 0.16, 0.3, m.metal, 0, 2.66, 0);
    g.add(head);
    const lens = box(0.24, 0.06, 0.24, flat({ color: PAL.lanternLit }), 0, 2.56, 0);
    lens.userData.noOutline = true;
    g.add(lens);
    g.position.set(px, py, pz);
    shadowify(g, true, false);
    ctx.add(g);
    ctx.collide(px - 0.14, pz - 0.14, px + 0.14, pz + 0.14, py + 2.7);
  }
  // life rings and depth boards, paired, at the four deepest frontages
  for (const [i, off] of [[5, 1.5], [9, 1.5], [16, 1.4], [24, 1.3]]) {
    const [rx, rz, ry] = side(i, off);
    ctx.add(lifeRing({ x: rx, z: rz, y: ctx.groundAt(rx, rz), ry: ry + Math.PI }));
    ctx.collide(rx - 0.16, rz - 0.16, rx + 0.16, rz + 0.16, ctx.groundAt(rx, rz) + 1.2);
  }
  for (const i of [4, 11, 19, 23]) {
    const [dx, dz, ry] = side(i, 1.5);
    depthBoard(ctx, dx, dz, ry + Math.PI);
  }
  // bins, a drinking point and a machine, at the two busiest points
  for (const i of [6, 17]) {
    const [bx, bz, ry] = side(i, 2.0);
    ctx.add(makeVendBin({ x: bx, z: bz, y: ctx.groundAt(bx, bz), ry: ry + Math.PI }));
  }
  {
    const [tx, tz, ry] = side(8, 2.2);
    ctx.add(makeTapPost({ x: tx, z: tz, y: ctx.groundAt(tx, tz), ry: ry + Math.PI }));
  }
  /* Fingerposts at the junctions, with real distances.  Ten variants of
   * `lakeSign` and each one names somewhere you can actually walk to -- a
   * fingerpost that promises a place with no path to it is worse than none. */
  finger(ctx, ...side(3, 2.4).slice(0, 2).concat([side(3, 2.4)[2] + Math.PI]), [1, 3]);
  finger(ctx, ...side(11, 2.2).slice(0, 2).concat([side(11, 2.2)[2] + Math.PI]), [3, 5]);
  finger(ctx, ...side(20, 2.0).slice(0, 2).concat([side(20, 2.0)[2] + Math.PI]), [5, 6]);
  finger(ctx, ...side(25, 1.8).slice(0, 2).concat([side(25, 1.8)[2] + Math.PI]), [9]);

  /* --- the brick rest area: a small paved pocket where the walk turns the
   * peninsula's bay, with two benches and a bed.  The brief asks for a 局部砖铺
   * 休息区 and this is the one place on the walk with a view *along* the shore in
   * both directions. --- */
  {
    const rx = 176.2, rz = -139.4;
    const ry0 = ctx.groundAt(rx, rz);
    pad(ctx, { x: rx, z: rz, w: 5.6, d: 4.4, y: ry0 - 0.07, h: 0.07, mat: m.brick, name: 'walkRest' });
    ctx.add(makeBench({ x: rx - 1.4, z: rz - 1.3, y: ry0, ry: 0.2, len: 1.7 }));
    ctx.add(makeBench({ x: rx + 1.5, z: rz - 1.2, y: ry0, ry: -0.2, len: 1.7 }));
    ctx.add(makeFlowerBed({ x: rx, z: rz - 1.9, y: ry0, w: 2.4, d: 0.9, seed: 9511 }));
    ctx.add(makeGuideBoard({ ctx, x: rx + 2.0, z: rz + 1.5, y: ry0, ry: 0.35, w: 1.8, h: 1.2, map: lakeMap(), post: m.timber }));
    dapple(ctx, { x: rx, z: rz, y: ry0, r: 1.6, spread: 2.8, n: 6, rng });
    out.sakura.push({ x: rx - 3.4, z: rz + 1.6, y: ctx.groundAt(rx - 3.4, rz + 1.6), scale: 1.2, seed: 9521, lean: 0.13, leanDir: 0.6 });
    out.petals.push({ x: rx - 2.4, z: rz + 0.4, y: ry0, r: 2.0, seed: 9531 });
  }

  /* --- and the falling-rock sign where the east trace runs under the rim's own
   * cut face, which is the only stretch of the walk with a bank above it. --- */
  {
    const [sx, sz, ry] = side(22, 1.5);
    const sy = hillMeshY(sx, sz);
    ctx.add(makeSignPost({
      x: sx, z: sz, y: sy, ry: ry + Math.PI, h: 1.9, postMat: m.metalDark,
      plates: [{ map: warningPlate(2), w: 0.44, h: 0.86, y: 1.3, double: false }],
    }));
  }
  return legs.length;
}

/* ------------------------------------------------------------------ *
 * ひばり湖畔公園.
 * ------------------------------------------------------------------ */

/**
 * The park, on the west shore's 15 m graded shelf.
 *
 * It is the district's front door: the road arrives behind it, the 桟橋 goes out
 * from it, and it is the only place at the lake with more than four metres of
 * level ground.  Which is also its constraint -- the shelf falls 1 in 5 to the
 * water, so this is a *sloping* park, and everything on it is either terraced
 * (the plaza, the pavilion) or happy on a slope (the lawn, the trees, the beds).
 *
 * **The lawn is not paved and not a mesh.**  It is the hill surface, which
 * `faceTone` has already coloured `hillSun` here because it is a mown south-west
 * facing slope, plus `dapple` under the trees.  Laying a green pad over it would
 * be a flat card 30 m across on ground that is not flat, which is the failure the
 * hill's own tone ladder exists to avoid.
 */
function buildPark(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();
  const V = SITES.lakePark;

  /* --- the plaza: a terraced slab where the road, the walk and the 桟橋 meet.
   * Two levels with three steps between them, because one slab 12 m across on a
   * 1-in-5 slope stands 1.2 m out of the ground at its lower edge. --- */
  const upper = { x: 133.4, z: -76.0, w: 9.0, d: 12.0 };
  const lower = { x: 140.0, z: -78.4, w: 5.0, d: 9.0 };
  const uy = ctx.groundAt(upper.x, upper.z);
  const ly = ctx.groundAt(lower.x + 1, lower.z);
  pad(ctx, { ...upper, y: uy - 0.08, h: 0.08, mat: gm.sidewalk, name: 'parkPlazaUpper' });
  pad(ctx, { ...lower, y: ly - 0.08, h: 0.08, mat: m.stoneWarm, name: 'parkPlazaLower' });
  steps(ctx, {
    x: upper.x + upper.w / 2 + 0.2, z: -76.0, n: Math.max(2, Math.round((uy - ly) / 0.17)),
    rise: 0.17, run: 0.42, w: 4.2, y: ly, dir: -1, axis: 'x', mat: m.stone,
  });
  /* a ramp beside the steps, because a park entrance with only steps in it is one
   * nobody with a pram uses -- and it is eight platform boxes the walker feels
   * plus one raked solid the eye sees, per the convention note */
  {
    const rx0 = upper.x + upper.w / 2 + 0.2, rx1 = lower.x - lower.w / 2 - 0.1;
    const run = rx1 - rx0;
    const n = 8;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      ctx.platform({
        x0: rx0 + run * t0 - 0.04, x1: rx0 + run * t1 + 0.04,
        z0: -72.4, z1: -70.0, top: uy + (ly - uy) * ((t0 + t1) / 2),
      });
    }
    const slab = box(Math.hypot(run, uy - ly) + 0.2, 0.16, 2.4, m.concrete,
      (rx0 + rx1) / 2, (uy + ly) / 2 - 0.04, -71.2);
    slab.rotation.z = -Math.atan2(ly - uy, run);
    slab.receiveShadow = true;
    ctx.add(slab);
    railing(ctx, { axis: 'x', at: -69.9, from: rx0, to: rx1, y: ly + 0.3, h: 0.9, mat: m.metal });
  }

  /* --- the 東屋: a four-post pavilion on the upper terrace, hipped, with a bench
   * round three sides and a real gutter.  Precise but not fussy: eight members and
   * a roof, which is what one of these is. --- */
  {
    const px = 132.0, pz = -70.6;
    const py = ctx.groundAt(px, pz);
    const g = new THREE.Group();
    g.name = 'openFrame';
    const W = 4.0, D = 3.4, H = 2.35;
    pad(ctx, { x: px, z: pz, w: W + 0.5, d: D + 0.5, y: py - 0.09, h: 0.09, mat: m.stone, name: 'azumayaPad' });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(box(0.16, H, 0.16, m.timberDark, sx * (W / 2 - 0.2), H / 2, sz * (D / 2 - 0.2)));
        g.add(box(0.32, 0.2, 0.32, m.stoneDark, sx * (W / 2 - 0.2), 0.1, sz * (D / 2 - 0.2)));
      }
    }
    // the plate and the two beams
    for (const sz of [-1, 1]) {
      g.add(box(W - 0.24, 0.18, 0.13, m.timberDark, 0, H - 0.09, sz * (D / 2 - 0.2)));
    }
    g.add(box(0.13, 0.16, D - 0.24, m.timberDark, 0, H - 0.26, 0));
    // the hipped roof: four raked panels off a short ridge
    const RH = 0.85;
    for (const sz of [-1, 1]) {
      const p = box(W + 0.9, 0.1, D / 2 + 0.6, m.roofBlue, 0, H + RH / 2, sz * (D / 4 + 0.16));
      p.rotation.x = sz * -Math.atan2(RH, D / 2 + 0.5);
      g.add(p);
    }
    g.add(box(W * 0.42, 0.14, 0.3, m.roofBlue, 0, H + RH + 0.02, 0));
    // benches on three sides
    for (const [bx, bz, ry] of [[0, -(D / 2 - 0.55), 0], [-(W / 2 - 0.5), 0, Math.PI / 2], [W / 2 - 0.5, 0, -Math.PI / 2]]) {
      g.add(box(ry ? 0.42 : W - 1.2, 0.07, ry ? D - 1.2 : 0.42, m.timber, bx, 0.44, bz));
      for (const s of [-1, 1]) {
        g.add(box(0.1, 0.42, 0.1, m.timberDark,
          bx + (ry ? 0 : s * (W / 2 - 0.85)), 0.21, bz + (ry ? s * (D / 2 - 0.85) : 0)));
      }
    }
    g.position.set(px, py, pz);
    g.rotation.y = 0.06;
    shadowify(g, true, true);
    ctx.add(g);
    hullOutline(g.children[g.children.length - 1], { thickness: 0.003 });
    /* Colliders on the **posts and the roof**, not a box round the bay.
     * A box round an open pavilion is a pavilion you cannot stand in -- the
     * 六丁目 bus shelter found that, and the flood fill read its waiting
     * island as unreachable. */
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = px + sx * (W / 2 - 0.2), cz = pz + sz * (D / 2 - 0.2);
        ctx.collide(cx - 0.09, cz - 0.09, cx + 0.09, cz + 0.09, py + H);
      }
    }
    ctx.collide(px - (W + 0.9) / 2, pz - (D + 0.9) / 2, px + (W + 0.9) / 2, pz + (D + 0.9) / 2,
      py + H + RH + 0.12, py + H - 0.04, true);
  }

  /* --- the lawn's furniture: picnic tables, tree pits, beds, a drinking point and
   * the two machines.  All of it on the *upper* half, so the slope down to the
   * water stays clear -- which is what makes the water read from the plaza. --- */
  for (const [tx, tz, ry] of [[135.6, -83.4, 0.3], [136.8, -87.6, -0.2]]) {
    const ty = ctx.groundAt(tx, tz);
    const g = new THREE.Group();
    g.name = 'openFrame';
    g.add(box(1.9, 0.08, 0.86, m.timber, 0, 0.72, 0));
    for (const s of [-1, 1]) {
      g.add(box(1.9, 0.07, 0.32, m.timber, 0, 0.44, s * 0.72));
      g.add(box(0.1, 0.72, 1.7, m.timberDark, s * 0.78, 0.36, 0));
    }
    g.position.set(tx, ty, tz);
    g.rotation.y = ry;
    shadowify(g, true, true);
    ctx.add(g);
    const ca = Math.cos(ry), sa = Math.sin(ry);
    const slab = (lx, lz, alongX, alongZ, top, bot) => {
      const px = tx + ca * lx - sa * lz;
      const pz = tz + sa * lx + ca * lz;
      const hw = Math.abs(ca) * alongX + Math.abs(sa) * alongZ;
      const hd = Math.abs(sa) * alongX + Math.abs(ca) * alongZ;
      ctx.collide(px - hw, pz - hd, px + hw, pz + hd, ty + top, ty + bot, true);
    };
    slab(0, 0, 0.95, 0.43, 0.76, 0.68);
    for (const s of [-1, 1]) {
      slab(s * 0.78, 0, 0.08, 0.85, 0.72, 0);
      slab(0, s * 0.72, 0.95, 0.16, 0.48, 0.40);
    }
  }
  ctx.add(makeTapPost({ x: 134.0, z: -80.4, y: ctx.groundAt(134.0, -80.4), ry: -1.5 }));
  ctx.add(makeFlowerBed({ x: 131.6, z: -80.8, y: ctx.groundAt(131.6, -80.8), w: 3.2, d: 1.1, seed: 9601 }));
  ctx.add(makeFlowerBed({ x: 137.4, z: -71.6, y: ctx.groundAt(137.4, -71.6), w: 2.6, d: 1.0, seed: 9602 }));
  for (const [px, pz, r] of [[136.4, -75.2, 0.24], [137.2, -74.4, 0.2], [131.0, -73.4, 0.22]]) {
    ctx.add(makePlanter({ x: px, z: pz, y: ctx.groundAt(px, pz), r, flower: true, seed: 9611 + r * 10, n: 5 }));
  }
  ctx.add(makeRecycleBox({ x: 130.4, z: -78.0, y: ctx.groundAt(130.4, -78.0), ry: -Math.PI / 2 }));
  ctx.add(makeVendBin({ x: 134.8, z: -73.0, y: ctx.groundAt(134.8, -73.0), ry: 0.2 }));

  /* the machines, in the pocket between the plaza and the toilet block: the one
   * pair of saturated objects in the park, and they belong where people wait */
  addVending(ctx, {
    x: 130.8, z: -85.4, y: ctx.groundAt(130.8, -85.4), ry: -Math.PI / 2,
    variants: [0, 2], seed: 9621, label: '湖畔公園  ·  じはんき',
  });

  /* --- the toilet block.  **Exterior only**, which is the brief's own word for it:
   * a 4.6 x 3.0 block-and-render building with two doors, a louvre, a downpipe, a
   * hose bib and a 男/女 plate.  Nothing behind the doors, because nothing needs
   * to be -- and it is set *back* from the water behind the trees, which is where
   * a park puts one. --- */
  {
    const tx = 129.6, tz = -89.0;
    const ty = ctx.groundAt(tx, tz);
    const g = new THREE.Group();
    g.add(box(4.6, 2.6, 3.0, m.wallWhite, 0, 1.3, 0));
    g.add(box(5.0, 0.18, 3.4, m.roof, 0, 2.68, 0));
    g.add(box(4.7, 0.28, 3.1, m.concreteMid, 0, 0.14, 0));
    for (const [dx, mat] of [[-1.05, PAL.blueDeep], [1.05, PAL.redDeep]]) {
      g.add(box(0.9, 1.95, 0.08, cel({ color: mat, bands: 3, tint: 0x5c5680 }), dx, 1.0, 1.53));
      const dark = box(0.78, 1.8, 0.04, flat({ color: 0x2e2b38 }), dx, 0.98, 1.5);
      dark.userData.noOutline = true;
      g.add(dark);
    }
    // the louvre strip and the downpipe
    g.add(box(3.4, 0.3, 0.06, m.metal, 0, 2.28, 1.52));
    g.add(cyl(0.055, 0.055, 2.5, 7, m.metal, 2.24, 1.25, 1.4));
    g.position.set(tx, ty, tz);
    g.rotation.y = 0.1;
    shadowify(g, true, true);
    ctx.add(g);
    ctx.collide(tx - 2.5, tz - 1.7, tx + 2.5, tz + 1.7, ty + 2.7);
    ctx.add(makeSignPost({
      x: tx + 2.9, z: tz + 1.4, y: ty, ry: Math.PI, h: 1.8, postMat: m.metalDark,
      plates: [{ map: parkSign(), w: 0.76, h: 0.5, y: 1.3, double: false }],
    }));
    ctx.add(makeBucket({ x: tx - 2.7, z: tz + 1.2, y: ty, ry: 0.3 }));
    ctx.add(makeBroom({ x: tx - 2.5, z: tz + 0.4, y: ty, ry: 1.2, lean: 0.16 }));
  }

  /* --- the guide board and the name plate at the plaza's head, where the road
   * arrives.  Bolted where they are read from: the board faces the car, the plate
   * faces the walk. --- */
  ctx.add(makeGuideBoard({ ctx,
    x: 130.2, z: -70.4, y: ctx.groundAt(130.2, -70.4), ry: -1.4, w: 2.2, h: 1.4,
    map: lakeMap(), post: m.metalDark,
  }));
  finger(ctx, 131.4, -67.6, -1.2, [lakePlate(1), lakeSign(1)], { h: 2.5, yAt: ctx.groundAt });
  ctx.add(makeNoticeBoard({ ctx,
    x: 136.0, z: -69.4, y: ctx.groundAt(136.0, -69.4), ry: Math.PI, w: 2.2, h: 1.4, y0: 0.95,
    wood: 0x8a6f52,
    sheets: [
      { map: lakeNotice(0), x: -0.52, y: 0, w: 0.82, h: 0.62, tilt: 0 },
      { map: lakeNotice(1), x: 0.56, y: 0.02, w: 0.66, h: 0.5, tilt: -0.02 },
    ],
  }));

  /* --- the ground's own marks: dapple under the trees, chalk on the plaza,
   * fallen blossom.  The last two are what stop a new slab reading as new. --- */
  for (const [dx, dz] of [[133.0, -84.0], [136.0, -79.0], [131.0, -75.0], [138.4, -86.0]]) {
    dapple(ctx, { x: dx, z: dz, y: ctx.groundAt(dx, dz), r: 1.9, spread: 3.4, n: 7, rng });
  }
  makeChalkMarks(ctx, [{ x: 133.8, z: -77.4, y: ctx.groundAt(133.8, -77.4) + 0.02, seed: 9631 }]);
  makeLoosePaper(ctx, [{ x: 135.2, z: -81.0, y: ctx.groundAt(135.2, -81.0) + 0.01, seed: 9641 }]);

  /* --- planting.  A row of cherry along the water, two maples and three
   * evergreens behind, and the row **skips the axis of the 桟橋**: a deck out over
   * the water with a cherry five metres off its root has the whole view in
   * blossom, which is the note the overbridge and the school gate both carry. --- */
  /* **The row skips the plaza's own frontage**, z -70 to -84, and that is the
   * whole point of it.  The first pass put two cherries at (141.0, -68.4) and
   * (140.4, -72.6) -- eight metres in front of the plaza, on the axis it exists
   * for -- and the establishing shot of the park came back as a wall of blossom
   * with the water showing between two trunks.  Same note the overbridge deck and
   * the school gate both carry: a continuous row of blossom is wonderful until you
   * need to see past it. */
  for (const [sx, sz, sc, ln] of [
    [141.6, -63.6, 1.24, 1.9], [140.6, -67.2, 1.18, 2.2],
    [140.2, -86.4, 1.26, 4.1], [141.4, -90.4, 1.2, 4.4], [142.4, -94.4, 1.16, 4.6],
    [136.2, -62.6, 1.3, 1.2],
  ]) {
    out.sakura.push({ x: sx, z: sz, y: ctx.groundAt(sx, sz), scale: sc, seed: 9700 + sx, lean: 0.13, leanDir: ln });
  }
  for (const [gx, gz, sc] of [
    [128.4, -82.6, 1.5], [127.8, -74.2, 1.44], [128.8, -91.6, 1.55],
    [133.2, -92.8, 1.38], [138.0, -63.4, 1.42],
  ]) {
    out.grove.push({ x: gx, z: gz, y: ctx.groundAt(gx, gz), scale: sc, seed: 9750 + gx, spread: 1.12, lean: 0.05, leanDir: gx % 6 });
  }
  for (const [bx, bz] of [[130.0, -87.4], [139.0, -65.2], [134.2, -91.0]]) {
    out.shrubs.push({ x: bx, z: bz, y: ctx.groundAt(bx, bz), r: 0.5, count: 4, spread: 1.6, seed: 9800 + bx });
  }
  out.petals.push(
    { x: 140.4, z: -70.4, y: ctx.groundAt(140.4, -70.4), r: 2.6, seed: 9811 },
    { x: 141.0, z: -88.4, y: ctx.groundAt(141.0, -88.4), r: 3.0, seed: 9812 },
    { x: 134.4, z: -76.6, y: ctx.groundAt(134.4, -76.6), r: 2.2, seed: 9813 }
  );
}

/* ------------------------------------------------------------------ *
 * 見晴らし桟橋.
 * ------------------------------------------------------------------ */

/**
 * The trestle, and it is the district's主构图点.
 *
 * 26 m out from the park's shore at z = -80, 2.4 m wide, on twelve pairs of piles,
 * with a 5.6 x 4.8 platform at the end.  Three numbers in it are decisions:
 *
 *   **26 m**, because the water surface is visible for 23 m from a 1.7 m eye -- so
 *   from the platform the whole of the *near* basin is inside the horizon and the
 *   peninsula's tip, 22 m further on, sits exactly on it.  A shorter pier and you
 *   are looking at haze; a longer one and the shore behind you is over the curve.
 *
 *   **0.55 m above the water**, which is derived from `ctx.groundAt` at the root
 *   rather than chosen: the shore there is `LEVEL + 0.20·s`, so a deck any higher
 *   needs a step at its root, and a step at the root of a pier is where everybody
 *   trips.  As built it is 0.23 m up from the path, inside the 0.38 m the player
 *   steps for free.
 *
 *   **2.4 m**, which is wide enough for the railing not to be the whole object and
 *   narrow enough that the piles read as a line rather than as a raft.
 */
function buildPier(ctx, rng, out) {
  const m = mats();
  const gap = SHORE_GAPS[0];
  const rootX = gap.x - 1.4, endX = SITES.pierHead.x + 1.4;
  const Z = -80.0;
  const shoreY = ctx.groundAt(rootX - 1.6, Z);
  const DY = Math.max(waterY(Z) + 0.5, shoreY + 0.1);
  const W = 2.4;

  /* the walk out, in five bays -- so the piles follow the bed, which falls from
   * 0.2 m of water at the root to 2.4 m at the head */
  const bays = 6;
  for (let k = 0; k < bays; k++) {
    const x0 = rootX + ((endX - 3.2 - rootX) * k) / bays;
    const x1 = rootX + ((endX - 3.2 - rootX) * (k + 1)) / bays;
    timberDeck(ctx, {
      x: (x0 + x1) / 2, z: Z, w: x1 - x0 + 0.04, d: W, y: DY,
      ry: Math.PI / 2, pileU: 2.0, pileV: 1.9,
    });
  }
  /* the head platform */
  const HX = endX - 1.4;
  timberDeck(ctx, { x: HX, z: Z, w: 5.6, d: 4.8, y: DY, pileU: 2.2, pileV: 2.2 });

  /* --- the railing.  Both sides of the walk, three sides of the head, and the
   * fourth side left open where the walk arrives.  1.05 m, and the collider clears
   * the feet by all of it: a rail at deck level over 2.4 m of water is decoration.
   * --- */
  const rail = (ax, az, bx, bz) => {
    const parts = [];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / 1.35));
    const ry = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      parts.push({
        geometry: new THREE.BoxGeometry(0.1, 1.05, 0.1),
        matrix: trs(px, DY + 0.55, pz),
      });
      ctx.collide(px - 0.06, pz - 0.06, px + 0.06, pz + 0.06, DY + 1.05, DY, true);
    }
    for (const hy of [1.0, 0.52]) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.07, 0.07, len),
        matrix: trs((ax + bx) / 2, DY + hy, (az + bz) / 2, 0, ry, 0),
      });
      ctx.collide(Math.min(ax, bx) - 0.06, Math.min(az, bz) - 0.06,
        Math.max(ax, bx) + 0.06, Math.max(az, bz) + 0.06,
        DY + hy + 0.05, DY + hy - 0.05, true);
    }
    const mesh = new THREE.Mesh(bake(parts), m.timber);
    mesh.name = 'openFrame';
    mesh.castShadow = true;
    ctx.add(mesh);
  };
  for (const s of [-1, 1]) rail(rootX, Z + s * (W / 2), endX - 3.6, Z + s * (W / 2));
  rail(HX - 2.8, Z - 2.4, HX + 2.8, Z - 2.4);
  rail(HX - 2.8, Z + 2.4, HX + 2.8, Z + 2.4);
  rail(HX + 2.8, Z - 2.4, HX + 2.8, Z + 2.4);
  rail(HX - 2.8, Z - 2.4, HX - 2.8, Z - 1.3);
  rail(HX - 2.8, Z + 1.3, HX - 2.8, Z + 2.4);

  /* --- what makes it a viewpoint rather than a jetty --- */
  // two benches facing out, one each side of the head
  ctx.add(makeBench({ x: HX + 1.4, z: Z - 1.5, y: DY + 0.06, ry: -Math.PI / 2, len: 1.7 }));
  ctx.add(makeBench({ x: HX + 1.4, z: Z + 1.5, y: DY + 0.06, ry: -Math.PI / 2, len: 1.7 }));
  // mooring bollards -- four, because a boat ties up here even if nobody lets you
  for (const [bx, bz] of [[HX - 2.2, Z - 2.1], [HX + 2.2, Z - 2.1], [HX - 2.2, Z + 2.1], [HX + 2.2, Z + 2.1]]) {
    const b = cyl(0.09, 0.11, 0.44, 8, m.timberDark, bx, DY + 0.25, bz);
    b.castShadow = true;
    ctx.add(b);
    ctx.add(cyl(0.13, 0.13, 0.06, 8, m.timberDark, bx, DY + 0.48, bz));
  }
  // a coil of rope on one of them
  {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 4, 12), m.rope);
    r.rotation.x = Math.PI / 2;
    r.position.set(HX - 2.2, DY + 0.1, Z + 2.1);
    ctx.add(r);
  }
  // the life ring and the rules board, at the head where they are needed
  ctx.add(lifeRing({ x: HX - 2.5, z: Z + 1.9, y: DY + 0.06, ry: -1.4, h: 1.1 }));
  ctx.add(makeNoticeBoard({ ctx,
    x: HX - 1.0, z: Z + 2.15, y: DY + 0.06, ry: 0, w: 1.5, h: 1.0, y0: 0.9, wood: 0x8a6f52,
    sheets: [{ map: lakeNotice(0), x: 0, y: 0, w: 0.7, h: 0.54, tilt: 0 }],
  }));
  // the 量水標 staff on the head's outer pile, and a small lamp on each side
  {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.09), [
      m.metal, m.metal, m.metal, m.metal,
      flat({ color: 0xffffff, map: gaugeBoard(), cache: false }), m.metal,
    ]);
    st.position.set(HX + 2.95, waterY(Z) + 0.62, Z + 0.6);
    st.castShadow = true;
    ctx.add(st);
  }
  for (const s of [-1, 1]) {
    const lx = HX - 2.6, lz = Z + s * 2.1;
    const g = new THREE.Group();
    g.add(cyl(0.055, 0.065, 1.5, 7, m.metalDark, 0, 0.75, 0));
    g.add(box(0.22, 0.14, 0.22, m.metal, 0, 1.56, 0));
    const lens = box(0.17, 0.07, 0.17, flat({ color: PAL.lanternLit }), 0, 1.47, 0);
    lens.userData.noOutline = true;
    g.add(lens);
    g.position.set(lx, DY + 0.06, lz);
    shadowify(g, true, false);
    ctx.add(g);
  }
  // the name plate at the root, and the three treads up onto the deck
  finger(ctx, rootX - 2.0, Z + 1.9, 3.05, [lakePlate(2)], { h: 2.2, yAt: ctx.groundAt });
  steps(ctx, {
    x: rootX - 0.5, z: Z, n: 2, rise: (DY - shoreY) / 2, run: 0.4, w: 2.2,
    y: shoreY, dir: 1, axis: 'x', mat: m.stone,
  });
  return { deckY: DY, headX: HX };
}

/* ------------------------------------------------------------------ *
 * 貸ボート ひばり -- the boat station.
 * ------------------------------------------------------------------ */

/**
 * A **park boat station**, not a marina, and the difference is the whole brief for
 * it: one timber shed with an opening you can see the hulls through, a floating
 * dock, five boats and a hand-lettered price board.  Nothing mechanical, nothing
 * covered, no pontoon walkway, no fuel.
 *
 * It is on the **west** shore because that is what the cafe's terrace looks at
 * across thirty metres of water -- the one shot the brief names -- and because its
 * frontage then faces east, so the hulls are lit from behind and read as a row of
 * pale shapes against the shadow inside the shed.
 */
function buildBoatStation(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();
  const V = SITES.boatHouse;
  const gap = SHORE_GAPS[1];
  const WY = waterY(-101);
  const g = new THREE.Group();
  g.name = 'lakeBoatHouse';
  ctx.add(g);

  /* --- the apron: a gravel pad between the shore walk and the water, which is
   * where the boats are pulled out in winter and where the queue stands --- */
  const ay = ctx.groundAt(V.x - 1.0, V.z);
  pad(ctx, { x: V.x - 1.2, z: V.z, w: 9.0, d: 10.0, y: ay - 0.07, h: 0.07, mat: gm.gravel, name: 'boatApron' });

  /* --- the shed.  6.6 x 4.8, gable to the water, the whole east gable open.  Its
   * floor is the apron, so nothing is registered: you walk in. --- */
  {
    const sx = V.x - 3.6, sz = V.z + 0.4;
    const sh = new THREE.Group();
    const W = 4.8, D = 6.6, H = 2.5, RH = 1.0;
    // three walls: north, south, west.  The east gable is the opening.
    sh.add(box(D, H, 0.14, m.timber, 0, H / 2, -W / 2));
    sh.add(box(D, H, 0.14, m.timber, 0, H / 2, W / 2));
    sh.add(box(0.14, H, W, m.timber, -D / 2, H / 2, 0));
    // the boarding, as a run of battens on the two long walls
    for (const s of [-1, 1]) {
      for (let k = 0; k < 9; k++) {
        sh.add(box(0.1, H - 0.2, 0.05, m.timberDark, -D / 2 + 0.4 + k * 0.76, H / 2, s * (W / 2 + 0.08)));
      }
    }
    // the roof: two raked panels off a ridge, gable to the water
    for (const s of [-1, 1]) {
      const p = box(D + 0.7, 0.11, W / 2 + 0.5, m.roof, 0, H + RH / 2, s * (W / 4 + 0.14));
      p.rotation.x = s * -Math.atan2(RH, W / 2 + 0.4);
      sh.add(p);
    }
    sh.add(box(D + 0.8, 0.13, 0.26, m.roof, 0, H + RH + 0.02, 0));
    // the gable board over the opening, and the dark inside
    sh.add(box(0.16, 0.4, W + 0.5, m.timberDark, D / 2 - 0.02, H + 0.06, 0));
    const dark = box(0.06, H - 0.2, W - 0.4, flat({ color: 0x2b2833 }), D / 2 - 0.2, (H - 0.2) / 2, 0);
    dark.userData.noOutline = true;
    sh.add(dark);
    // the fascia, on the gable over the opening -- read from the water and the walk
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 3.4), [
      flat({ color: 0xffffff, map: lakePlate(3), cache: false }),
      flat({ color: PAL.wallCream }), flat({ color: PAL.wallCream }),
      flat({ color: PAL.wallCream }), flat({ color: PAL.wallCream }), flat({ color: PAL.wallCream }),
    ]);
    fascia.position.set(D / 2 + 0.06, H + 0.5, 0);
    sh.add(fascia);
    // the ticket window on the north wall: a real opening with a shelf and a dark
    sh.add(box(1.4, 0.9, 0.1, m.timberDark, 1.2, 1.35, -W / 2 - 0.05));
    const wdark = box(1.2, 0.72, 0.05, flat({ color: 0x3a3630 }), 1.2, 1.35, -W / 2 - 0.1);
    wdark.userData.noOutline = true;
    sh.add(wdark);
    sh.add(box(1.6, 0.07, 0.34, m.timberPale, 1.2, 0.88, -W / 2 - 0.18));
    sh.position.set(sx, ay, sz);
    sh.rotation.y = 0.04;
    shadowify(sh, true, true);
    g.add(sh);
    hullOutline(sh.children[0], { thickness: 0.003 });
    /* Three colliders, not one: the opening has to stay open, which is the note
     * the library's entrance recess and the supermarket's doors both carry. */
    ctx.collide(sx - D / 2 - 0.2, sz - W / 2 - 0.2, sx - D / 2 + 0.3, sz + W / 2 + 0.2, ay + H);
    for (const s of [-1, 1]) {
      ctx.collide(sx - D / 2, sz + s * (W / 2 - 0.2), sx + D / 2, sz + s * (W / 2 + 0.25), ay + H);
    }
    // the price board and the rules board on the north wall, where the queue is
    ctx.add(makeMenuBoard({ x: sx + 1.2, z: sz - W / 2 - 0.45, y: ay, ry: Math.PI, w: 0.72, h: 1.0 }));
    ctx.add(makeNoticeBoard({ ctx,
      x: sx - 1.4, z: sz - W / 2 - 0.5, y: ay, ry: Math.PI, w: 1.6, h: 1.05, y0: 0.9, wood: 0x8a6f52,
      sheets: [{ map: lakeNotice(2), x: 0, y: 0, w: 0.74, h: 0.56, tilt: 0 }],
    }));
  }

  /* --- the store shed and the racks: oars up on the wall, life jackets on a rail,
   * a tool box on a crate.  All of it against the north wall, which is the working
   * side -- the water side is for the boats. --- */
  {
    const rx = V.x - 6.4, rz = V.z - 3.6;
    ctx.add(makeStorageShed({ x: rx, z: rz, y: ctx.groundAt(rx, rz), ry: 0.3, w: 2.2, d: 1.6, h: 2.0 }));
    ctx.collide(rx - 1.3, rz - 1.0, rx + 1.3, rz + 1.0, ctx.groundAt(rx, rz) + 2.1);
    // the oar rack: two uprights and a rail, with six oars leaning on it
    const ox = V.x - 6.0, oz = V.z - 1.2;
    const oy = ctx.groundAt(ox, oz);
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push({ geometry: new THREE.BoxGeometry(0.1, 1.7, 0.1), matrix: trs(ox, 0.85, oz + s * 1.1) });
    }
    parts.push({ geometry: new THREE.BoxGeometry(0.09, 0.09, 2.3), matrix: trs(ox, 1.5, oz) });
    parts.push({ geometry: new THREE.BoxGeometry(0.09, 0.09, 2.3), matrix: trs(ox, 0.5, oz) });
    const rk = new THREE.Mesh(bake(parts), m.timberDark);
    rk.position.set(0, oy, 0);
    rk.castShadow = true;
    g.add(rk);
    const oars = [];
    for (let k = 0; k < 6; k++) {
      const dz = -0.9 + k * 0.36;
      oars.push({
        geometry: new THREE.CylinderGeometry(0.028, 0.032, 2.1, 6),
        matrix: trs(ox + 0.12, oy + 1.05, oz + dz, 0, 0, 0.14 + (k % 2) * 0.05),
      });
      oars.push({
        geometry: new THREE.BoxGeometry(0.02, 0.5, 0.13),
        matrix: trs(ox + 0.28, oy + 0.16, oz + dz),
      });
    }
    const om = new THREE.Mesh(bake(oars), m.timberPale);
    om.castShadow = true;
    g.add(om);
    for (const s of [-1, 1]) {
      ctx.collide(ox - 0.06, oz + s * 1.1 - 0.06, ox + 0.06, oz + s * 1.1 + 0.06, oy + 1.7, oy, true);
    }
    ctx.collide(ox - 0.06, oz - 1.15, ox + 0.06, oz + 1.15, oy + 1.55, oy + 1.45, true);
    ctx.collide(ox - 0.06, oz - 1.15, ox + 0.06, oz + 1.15, oy + 0.55, oy + 0.45, true);
    // the life-jacket rail
    const jx = V.x - 6.0, jz = V.z + 2.2;
    const jy = ctx.groundAt(jx, jz);
    g.add(cyl(0.04, 0.04, 2.0, 6, m.metalDark, jx, jy + 1.5, jz).rotateZ ? cyl(0.04, 0.04, 2.0, 6, m.metalDark, jx, jy + 1.5, jz) : null);
    for (const s of [-1, 1]) {
      g.add(cyl(0.045, 0.05, 1.55, 7, m.metalDark, jx, jy + 0.78, jz + s * 0.95));
    }
    const bar = cyl(0.035, 0.035, 2.0, 6, m.metalDark, jx, jy + 1.5, jz);
    bar.rotation.x = Math.PI / 2;
    g.add(bar);
    const jackets = [];
    for (let k = 0; k < 5; k++) {
      jackets.push({
        geometry: new THREE.BoxGeometry(0.1, 0.52, 0.28),
        matrix: trs(jx, jy + 1.18, jz - 0.8 + k * 0.4, 0, 0, 0.03),
      });
    }
    const jm = new THREE.Mesh(bake(jackets), m.orange);
    jm.castShadow = true;
    g.add(jm);
    ctx.collide(jx - 0.06, jz - 0.95 - 0.06, jx + 0.06, jz - 0.95 + 0.06, jy + 1.55, jy, true);
    ctx.collide(jx - 0.06, jz + 0.95 - 0.06, jx + 0.06, jz + 0.95 + 0.06, jy + 1.55, jy, true);
    ctx.collide(jx - 0.05, jz - 1.0, jx + 0.05, jz + 1.0, jy + 1.54, jy + 1.46, true);
    ctx.add(makeMilkCrate({ x: V.x - 5.2, z: V.z + 3.4, y: ctx.groundAt(V.x - 5.2, V.z + 3.4), ry: 0.4, n: 2 }));
    ctx.add(makeBucket({ x: V.x - 4.4, z: V.z + 3.8, y: ctx.groundAt(V.x - 4.4, V.z + 3.8), ry: -0.3 }));
  }

  /* --- 浮桟橋: the floating dock, and the three treads down onto it.  It sits
   * 0.3 m over the water, which is what a float does, and the bank behind it is
   * 1.2 m up -- so the steps are not optional. --- */
  const dockY = WY + 0.3;
  {
    const dx = gap.x + 3.4, dz = V.z;
    timberDeck(ctx, {
      x: dx, z: dz, w: 7.2, d: 2.4, y: dockY, ry: Math.PI / 2,
      pileU: 1.8, pileV: 1.6, mat: m.timberPale,
    });
    // the two mooring posts at its outer corners, and the ropes to them
    for (const s of [-1, 1]) {
      const px = dx + 3.4, pz = dz + s * 1.0;
      const p = cyl(0.085, 0.1, 0.5, 8, m.timberDark, px, dockY + 0.28, pz);
      p.castShadow = true;
      ctx.add(p);
    }
    const bankY = ctx.groundAt(gap.x - 1.4, dz);
    steps(ctx, {
      x: gap.x - 0.9, z: dz, n: Math.max(2, Math.round((bankY - dockY) / 0.19)),
      rise: 0.19, run: 0.4, w: 2.2, y: dockY, dir: 1, axis: 'x', mat: m.stone,
    });
    railing(ctx, { axis: 'x', at: dz + 1.35, from: dx - 3.4, to: dx + 3.4, y: dockY, h: 0.85, mat: m.timber, spacing: 1.6 });
  }

  /* --- the fleet.  Four rowing boats and one pedal boat: three moored bow-on to
   * the dock, one drawn up on the apron for a repair with its bottom board out,
   * and the pedal boat on the far side.  The red hull is number three, in the
   * middle, because that is where the eye lands. --- */
  const fleet = [
    [gap.x + 5.6, V.z - 3.2, -1.35, PAL.boatWhite, 1],
    [gap.x + 5.6, V.z - 1.5, -1.4, PAL.boatBlue, 2],
    [gap.x + 5.6, V.z + 1.6, -1.5, PAL.boatRed, 3],
    [gap.x + 5.6, V.z + 3.3, -1.44, PAL.boatYellow, 4],
  ];
  for (const [bx, bz, ry, col, num] of fleet) {
    ctx.add(makeBoat({ x: bx, z: bz, y: WY - 0.12, ry, color: col, number: num, heel: rng.range(-0.03, 0.03) }));
  }
  // the one out of the water, on trestles, with its number showing
  {
    const bx = V.x - 0.6, bz = V.z + 4.2;
    const by = ctx.groundAt(bx, bz);
    for (const s of [-1, 1]) {
      ctx.add(box(0.9, 0.42, 0.12, m.timberDark, bx + s * 0.9, by + 0.21, bz));
      ctx.collide(bx + s * 0.9 - 0.48, bz - 0.10, bx + s * 0.9 + 0.48, bz + 0.10, by + 0.42, by, true);
    }
    ctx.add(makeBoat({ x: bx, z: bz, y: by + 0.42, ry: 0.15, color: PAL.boatTeal, number: 5, oars: false }));
    ctx.collide(bx - 1.2, bz - 0.55, bx + 1.2, bz + 0.55, by + 0.72, by + 0.40, true);
    ctx.add(makeBucket({ x: bx + 2.1, z: bz - 0.7, y: by, ry: 0.6 }));
    ctx.add(makeBroom({ x: bx - 2.2, z: bz + 0.6, y: by, ry: 1.1, lean: 0.2 }));
  }
  /* the pedal boat, moored on the dock's north side.  One is enough: it is a
   * different silhouette (a tub with a canopy) and two of them is a fairground. */
  {
    const px = gap.x + 5.4, pz = V.z - 5.4;
    const p = makeBoat({ x: px, z: pz, y: WY - 0.1, ry: -1.2, color: PAL.boatWhite, oars: false, len: 2.2, wid: 1.4 });
    ctx.add(p);
    const canopy = box(1.5, 0.08, 1.2, m.orange, px, WY + 1.05, pz);
    canopy.rotation.y = -1.2;
    canopy.castShadow = true;
    ctx.add(canopy);
    for (const s of [-1, 1]) {
      ctx.add(cyl(0.035, 0.035, 0.7, 6, m.metalDark, px + Math.cos(-1.2) * s * 0.5, WY + 0.68, pz - Math.sin(-1.2) * s * 0.5));
    }
  }
  finger(ctx, V.x + 1.4, V.z - 5.6, 1.9, [lakePlate(3), lakeSign(3)], { h: 2.4, yAt: ctx.groundAt });
  depthBoard(ctx, gap.x - 0.4, V.z + 3.4, -1.5);

  out.sakura.push(
    { x: V.x - 4.0, z: V.z - 6.6, y: ctx.groundAt(V.x - 4.0, V.z - 6.6), scale: 1.24, seed: 9911, lean: 0.13, leanDir: 4.6 },
    { x: V.x - 2.4, z: V.z + 7.4, y: ctx.groundAt(V.x - 2.4, V.z + 7.4), scale: 1.2, seed: 9912, lean: 0.12, leanDir: 4.2 }
  );
  out.grove.push({ x: V.x - 8.0, z: V.z + 5.0, y: ctx.groundAt(V.x - 8.0, V.z + 5.0), scale: 1.5, seed: 9921, spread: 1.12 });
  out.petals.push({ x: V.x - 2.6, z: V.z + 5.6, y: ctx.groundAt(V.x - 2.6, V.z + 5.6), r: 2.4, seed: 9931 });
  dapple(ctx, { x: V.x - 3.0, z: V.z + 4.0, y: ay, r: 1.7, spread: 3.0, n: 6, rng });
  shadowify(g, true, true);
}

/* ------------------------------------------------------------------ *
 * 喫茶 みなも.
 * ------------------------------------------------------------------ */

/**
 * The lakeside cafe, on the **south** shore facing north over the water.
 *
 * North is the only bearing that is both lit and looking at the lake: the sun is
 * at (-52, 62, 56), so a +z normal is lit every hour of the day, and the water is
 * north of here.  Put it anywhere else on this shore and you get a terrace in
 * permanent shade, which is the note `CLAUDE.md` makes about 六丁目's 弁当屋.
 *
 * It is deliberately small -- 9.2 x 6.4, one and a half storeys -- and it is the
 * only building in the district with glass in it.  Everything else here is timber
 * with an opening; this is the one place somebody is *inside*, which is what the
 * three interiors and the warm pendant behind the north windows are for.
 */
function buildCafe(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();
  const V = SITES.cafe;
  const g = new THREE.Group();
  g.name = 'lakeCafe';
  ctx.add(g);

  const FY = ctx.groundAt(V.x, V.z - 1.0) + 0.12;
  const W = 9.2, D = 6.4, H = 3.1;

  /* --- the pad the whole thing stands on: the shore's bank is 1 in 4 here, so the
   * building needs a level plinth and the terrace steps down from it. --- */
  pad(ctx, { x: V.x, z: V.z, w: W + 2.2, d: D + 1.6, y: FY - 0.12, h: 0.12, mat: m.concreteMid, name: 'cafePlinth' });

  /* --- the mass.  Cream render, a blue-grey hipped roof with a deep eave over the
   * north side, and a half storey in the roof with one dormer -- which is what
   * makes it 1.5 rather than 1: the roof is the building. --- */
  {
    const b = new THREE.Group();
    b.add(box(W, H, D, m.wallCream, 0, H / 2, 0));
    // the sill band and the corner boards, which is most of what says "timber"
    b.add(box(W + 0.14, 0.22, D + 0.14, m.timber, 0, 0.11, 0));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.add(box(0.16, H, 0.16, m.timber, sx * (W / 2 - 0.08), H / 2, sz * (D / 2 - 0.08)));
      }
    }
    const RH = 1.5;
    for (const sz of [-1, 1]) {
      const p = box(W + 1.6, 0.13, D / 2 + 0.9, m.roofBlue, 0, H + RH / 2, sz * (D / 4 + 0.22));
      p.rotation.x = sz * -Math.atan2(RH, D / 2 + 0.8);
      b.add(p);
    }
    for (const sx of [-1, 1]) {
      const p = box(0.13, RH * 0.9, D + 1.6, m.roofBlue, sx * (W / 2 + 0.3), H + RH / 2, 0);
      p.rotation.z = sx * Math.atan2(RH * 0.8, 1.4);
      b.add(p);
    }
    b.add(box(W * 0.5, 0.16, 0.32, m.roofBlue, 0, H + RH + 0.03, 0));
    // the dormer, on the water side
    b.add(box(2.2, 1.0, 1.2, m.wallCream, -1.4, H + 0.55, D / 2 - 0.1));
    b.add(box(2.5, 0.11, 1.5, m.roofBlue, -1.4, H + 1.12, D / 2 - 0.05));
    b.add(box(1.6, 0.66, 0.06, m.glass, -1.4, H + 0.55, D / 2 + 0.52));

    /* --- the north elevation: three tall windows with the interiors behind them.
     * Order matters and it is the library's lesson: reveal set *into* the wall,
     * the painted interior on the face of it, the glass in front of that, the
     * mullions in front of the glass.  Put the interior behind the reveal and every
     * window is a flat grey panel. --- */
    const glassMat = flat({ color: PAL.glass, transparent: true, opacity: 0.34 });
    for (let k = 0; k < 3; k++) {
      const wx = -2.9 + k * 2.9;
      b.add(box(2.3, 2.0, 0.16, cel({ color: PAL.trim, bands: 3, tint: 0x6f6790 }), wx, 1.72, D / 2 - 0.02));
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(2.16, 1.88),
        flat({ color: 0xffffff, map: cafeInterior(k), cache: false }));
      inner.position.set(wx, 1.72, D / 2 + 0.055);
      inner.userData.noOutline = true;
      b.add(inner);
      b.add(box(2.24, 1.94, 0.05, glassMat, wx, 1.72, D / 2 + 0.085));
      for (const mx of [-0.75, 0, 0.75]) {
        b.add(box(0.07, 1.94, 0.06, m.timber, wx + mx, 1.72, D / 2 + 0.12));
      }
      b.add(box(2.36, 0.09, 0.26, m.timber, wx, 0.72, D / 2 + 0.09));
    }
    // the door, at the east end of the north face, with its mat
    b.add(box(1.15, 2.1, 0.1, m.timberDark, 3.6, 1.05, D / 2 + 0.02));
    const ddark = box(1.0, 1.95, 0.05, flat({ color: 0x3a3630 }), 3.6, 1.02, D / 2 + 0.06);
    ddark.userData.noOutline = true;
    b.add(ddark);
    // the fascia over the windows, and a blade sign on the west corner
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.62, 0.12), [
      flat({ color: PAL.wallCream }), flat({ color: PAL.wallCream }),
      flat({ color: PAL.wallCream }), flat({ color: PAL.wallCream }),
      flat({ color: 0xffffff, map: cafeFascia(), cache: false }), flat({ color: PAL.wallCream }),
    ]);
    fascia.position.set(-0.9, 2.98, D / 2 + 0.1);
    b.add(fascia);
    // the awning: warm canvas over the three windows, on two stays
    const aw = box(7.6, 0.09, 1.5, m.orange, -0.9, 2.66, D / 2 + 0.78);
    aw.rotation.x = -0.16;
    aw.castShadow = true;
    b.add(aw);
    for (const sx of [-4.2, 2.4]) {
      const st = cyl(0.032, 0.032, 1.6, 5, m.metalDark, sx, 2.9, D / 2 + 0.5);
      st.rotation.x = 1.05;
      b.add(st);
    }
    b.position.set(V.x, FY, V.z);
    shadowify(b, true, true);
    g.add(b);
    hullOutline(b.children[0], { thickness: 0.003 });
    ctx.collide(V.x - W / 2 - 0.1, V.z - D / 2 - 0.1, V.x + W / 2 + 0.1, V.z + D / 2 + 0.1, FY + H);
  }

  /* --- the terrace: 8.4 x 3.6 of timber deck on the water side, one step down from
   * the floor, with four tables.  It is the reason the building is here. --- */
  const TY = FY - 0.19;
  timberDeck(ctx, {
    x: V.x - 0.4, z: V.z + D / 2 + 2.0, w: 8.4, d: 3.6, y: TY,
    pileU: 2.6, pileV: 1.8, mat: m.timberPale, yAt: ctx.groundAt,
  });
  groundRail(ctx, [
    [V.x - 4.6, V.z + D / 2 + 3.8], [V.x + 3.8, V.z + D / 2 + 3.8],
  ], { h: 0.92, spacing: 1.5, mat: m.timber, yAt: () => TY + 0.06, name: 'cafeTerraceRail' });
  for (const [tx, tz] of [[V.x - 3.2, V.z + 8.6], [V.x - 0.4, V.z + 8.6], [V.x + 2.4, V.z + 8.6]]) {
    const tg = new THREE.Group();
    tg.name = 'openFrame';
    tg.add(cyl(0.42, 0.42, 0.06, 10, m.timberPale, 0, 0.72, 0));
    tg.add(cyl(0.06, 0.09, 0.72, 7, m.metalDark, 0, 0.36, 0));
    tg.add(box(0.5, 0.05, 0.5, m.metalDark, 0, 0.02, 0));
    for (const a of [0.6, 2.7, 4.2]) {
      const ch = new THREE.Group();
      ch.add(box(0.4, 0.05, 0.4, m.timber, 0, 0.44, 0));
      ch.add(box(0.4, 0.42, 0.05, m.timber, 0, 0.66, -0.18));
      for (const s of [-1, 1]) {
        ch.add(box(0.05, 0.44, 0.05, m.metalDark, s * 0.16, 0.22, 0.16));
        ch.add(box(0.05, 0.44, 0.05, m.metalDark, s * 0.16, 0.22, -0.16));
      }
      ch.position.set(Math.cos(a) * 0.82, 0, Math.sin(a) * 0.82);
      ch.rotation.y = -a + Math.PI / 2;
      tg.add(ch);
    }
    tg.position.set(tx, TY + 0.06, tz);
    tg.rotation.y = rng.range(-0.2, 0.2);
    shadowify(tg, true, true);
    ctx.add(tg);
    ctx.collide(tx - 0.08, tz - 0.08, tx + 0.08, tz + 0.08, TY + 0.72, TY, true);
    ctx.collide(tx - 0.42, tz - 0.42, tx + 0.42, tz + 0.42, TY + 0.75, TY + 0.69, true);
  }

  /* --- the street furniture, and every piece of it faces the way it is used: the
   * menu at the terrace steps, the light box beside the door, the machine and the
   * bins on the *back* corner where the delivery comes in. --- */
  ctx.add(makeMenuBoard({ x: V.x + 3.8, z: V.z + D / 2 + 4.2, y: TY, ry: 0.3, w: 0.78, h: 1.1 }));
  {
    const lx = V.x + 4.6, lz = V.z + D / 2 + 0.3;
    const ly = ctx.groundAt(lx, lz);
    const lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.15, 0.22), [
      flat({ color: PAL.lanternLit }), flat({ color: PAL.lanternLit }),
      flat({ color: PAL.wallWhite }), flat({ color: PAL.wallWhite }),
      flat({ color: 0xffffff, map: cafeMenu(), cache: false }),
      flat({ color: 0xffffff, map: cafeMenu(), cache: false }),
    ]);
    lb.position.set(lx, ly + 1.1, lz);
    lb.rotation.y = -0.3;
    lb.userData.noOutline = true;
    ctx.add(lb);
    ctx.add(cyl(0.05, 0.06, 0.6, 7, m.metalDark, lx, ly + 0.3, lz));
    ctx.collide(lx - 0.2, lz - 0.2, lx + 0.2, lz + 0.2, ly + 1.7);
  }
  ctx.add(makeShopFlag({ ctx, x: V.x - 5.2, z: V.z + 2.6, y: FY, ry: -0.2, variant: 1 }));
  ctx.add(makeUmbrellaStand({ x: V.x + 4.3, z: V.z + D / 2 + 1.2, y: FY, ry: Math.PI }));
  for (const [px, pz, r] of [[V.x - 5.1, V.z + 4.0, 0.26], [V.x - 5.3, V.z + 3.1, 0.22]]) {
    ctx.add(makePlanter({ x: px, z: pz, y: ctx.groundAt(px, pz), r, flower: true, seed: 9951 + r * 10, n: 5 }));
  }
  addVending(ctx, {
    x: V.x + 5.4, z: V.z - 1.4, y: ctx.groundAt(V.x + 5.4, V.z - 1.4), ry: Math.PI / 2,
    variants: [1], seed: 9961, label: '喫茶 みなも  ·  じはんき',
  });
  ctx.add(makeAircon({
    x: V.x + W / 2 + 0.28, z: V.z - 2.2, y: ctx.groundAt(V.x + W / 2 + 0.28, V.z - 2.2) + 0.4,
    ry: Math.PI / 2, feet: false,
  }));
  ctx.add(makeVendBin({ x: V.x + 5.2, z: V.z - 3.4, y: ctx.groundAt(V.x + 5.2, V.z - 3.4), ry: Math.PI / 2 }));
  ctx.add(makeRecycleBox({ x: V.x + 4.4, z: V.z - 4.2, y: ctx.groundAt(V.x + 4.4, V.z - 4.2), ry: 0 }));
  // the delivery door on the south (back) face, with its crates
  ctx.add(makeDoormat({ x: V.x - 2.0, z: V.z - D / 2 - 0.5, y: ctx.groundAt(V.x - 2.0, V.z - D / 2 - 0.5), ry: Math.PI }));
  ctx.add(makeCrates({ x: V.x - 3.4, z: V.z - D / 2 - 1.0, y: ctx.groundAt(V.x - 3.4, V.z - D / 2 - 1.0), n: 3, seed: 9971, ry: -0.2 }));
  ctx.add(makeIvy({ x: V.x - W / 2 - 0.06, z: V.z - 1.6, y: ctx.groundAt(V.x - W / 2, V.z - 1.6), ry: -Math.PI / 2, w: 2.4, h: 2.2, seed: 9981 }));

  /* --- the car park: three bays off the shore road, with wheel stops and a plate.
   * `traffic.js` puts the vehicles in it, because a distribution cannot be reviewed
   * thirty lines at a time in twenty-six modules. --- */
  {
    const cx = V.x + 1.0, cz = V.z - 7.8;
    const cy = ctx.groundAt(cx, cz);
    pad(ctx, { x: cx, z: cz, w: 12.0, d: 5.6, y: cy - 0.07, h: 0.07, mat: gm.asphaltWorn, name: 'cafePark' });
    for (let k = 0; k < 4; k++) {
      const lx = cx - 6.0 + k * 4.0;
      ctx.add(box(0.11, 0.02, 5.2, m.white, lx, cy + 0.02, cz));
    }
    for (let k = 0; k < 3; k++) {
      ctx.add(box(1.5, 0.14, 0.16, cel({ color: PAL.concreteDark, bands: 3, tint: 0x655d84 }),
        cx - 4.0 + k * 4.0, cy + 0.07, cz - 2.1));
    }
    finger(ctx, cx - 6.8, cz + 2.6, 0.4, [lakePlate(1)], { h: 2.0, yAt: ctx.groundAt });
  }

  /* **Both cherries are 11 m out, not 7.**  At 7 m the west one stood six metres
   * from the terrace's north-west corner and filled the top third of the frame with
   * one blossom mass -- framing is a corner of the picture, not a wall across it.
   * Same distance the crossing's own framing trees keep. */
  out.sakura.push(
    { x: V.x - 10.6, z: V.z + 8.4, y: ctx.groundAt(V.x - 10.6, V.z + 8.4), scale: 1.26, seed: 9991, lean: 0.13, leanDir: 0.4 },
    { x: V.x + 11.0, z: V.z + 6.6, y: ctx.groundAt(V.x + 11.0, V.z + 6.6), scale: 1.2, seed: 9992, lean: 0.12, leanDir: 0.8 }
  );
  out.grove.push(
    { x: V.x - 8.6, z: V.z - 3.6, y: ctx.groundAt(V.x - 8.6, V.z - 3.6), scale: 1.52, seed: 10001, spread: 1.14 },
    { x: V.x + 9.0, z: V.z - 5.6, y: ctx.groundAt(V.x + 9.0, V.z - 5.6), scale: 1.46, seed: 10002, spread: 1.1 }
  );
  out.shrubs.push({ x: V.x - 5.8, z: V.z - 5.0, y: ctx.groundAt(V.x - 5.8, V.z - 5.0), r: 0.52, count: 4, spread: 1.6, seed: 10011 });
  out.petals.push({ x: V.x - 4.4, z: V.z + 6.0, y: TY, r: 2.4, seed: 10021 });
  dapple(ctx, { x: V.x - 6.0, z: V.z + 5.2, y: ctx.groundAt(V.x - 6.0, V.z + 5.2), r: 1.8, spread: 3.2, n: 7, rng });
  shadowify(g, true, true);
}

/* ------------------------------------------------------------------ *
 * ひばり湖 キャンプ場.
 * ------------------------------------------------------------------ */

/** A ridge tent: two raked panels, two gables, guys and pegs. */
function makeTent(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const W = o.w ?? 2.3, D = o.d ?? 2.7, H = o.h ?? 1.55;
  const mat = cel({ color: o.color ?? PAL.tentCream, bands: 'soft3', tint: 0x8a83a8 });
  for (const s of [-1, 1]) {
    const p = box(D + 0.16, 0.05, Math.hypot(W / 2, H) + 0.1, mat, 0, H / 2, s * (W / 4));
    p.rotation.x = s * -Math.atan2(H, W / 2);
    g.add(p);
  }
  // the two gable triangles
  for (const s of [-1, 1]) {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(W / 2 * 1.02, H, 3, 1), mat);
    tri.rotation.set(Math.PI / 2, 0, 0);
    tri.rotation.y = Math.PI / 2;
    tri.scale.set(1, 0.05, 1);
    tri.position.set(s * D / 2, H / 2, 0);
    g.add(tri);
  }
  // the ridge pole and the two uprights
  g.add(cyl(0.026, 0.026, D + 0.3, 5, m.metalDark, 0, H, 0).rotateZ ? (() => {
    const r = cyl(0.026, 0.026, D + 0.3, 5, m.metalDark, 0, H, 0);
    r.rotation.z = Math.PI / 2;
    return r;
  })() : null);
  // the guys: four, each drawn between the ridge end and its peg
  const guys = [];
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      const ax = s * (D / 2 + 0.1), ay = H, az = 0;
      const bx = s * (D / 2 + 1.0), by = 0.02, bz = t * 0.5;
      const L = Math.hypot(bx - ax, by - ay, bz - az);
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, by - ay, bz - az).normalize());
      guys.push({
        geometry: new THREE.CylinderGeometry(0.011, 0.011, L, 4),
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, new THREE.Vector3(1, 1, 1)),
      });
    }
  }
  const gm2 = new THREE.Mesh(bake(guys), m.rope);
  g.add(gm2);
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  shadowify(g, true, false);
  return g;
}

/**
 * The campsite, on the shelf above the reed bay.
 *
 * Six pitches, three tents, one hut and the four pieces of plumbing a Japanese
 * キャンプ場 has: a 炊事棚, a 洗い場, a 薪小屋 and a 灰おき場.  Small on purpose --
 * the brief says so, and so does the ground: the shelf is 1 in 4, so each pitch is
 * a **terraced timber platform** rather than a patch of grass, which is what these
 * actually are on a slope and is the only way to get a level tent out of it.
 *
 * The tents are low-saturation canvas.  Four bright nylon domes is a festival;
 * three cream-and-sage ridge tents under trees is a Tuesday in April.
 */
function buildCamp(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();
  const V = SITES.camp;
  const g = new THREE.Group();
  g.name = 'lakeCamp';
  ctx.add(g);

  /* --- the six pitches.  Two rows of three, terraced down the slope, each a
   * 3.4 m square deck with its number stake. --- */
  const pitches = [];
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 3; k++) {
      const px = V.x - 8.0 + k * 7.2 + r * 2.4;
      const pz = V.z + 5.2 - r * 8.4;
      const py = ctx.groundAt(px, pz) + 0.24;
      timberDeck(ctx, {
        x: px, z: pz, w: 3.4, d: 3.4, y: py, pileU: 1.6, pileV: 1.6,
        round: false, mat: m.timber, yAt: ctx.groundAt,
      });
      pitches.push([px, pz, py]);
      // the number stake, on the path side
      const sx = px - 2.2, sz = pz + 1.4;
      const sy = ctx.groundAt(sx, sz);
      ctx.add(box(0.1, 0.7, 0.1, m.timberDark, sx, sy + 0.35, sz));
      ctx.add(box(0.28, 0.22, 0.05, m.timberPale, sx, sy + 0.62, sz + 0.07));
      // a fire ring beside every second one
      if ((r * 3 + k) % 2 === 0) {
        const fx = px + 2.4, fz = pz - 1.0;
        const fy = ctx.groundAt(fx, fz);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.1, 5, 12), m.stoneDark);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(fx, fy + 0.09, fz);
        ring.castShadow = true;
        g.add(ring);
        ctx.add(box(0.9, 0.03, 0.9, cel({ color: 0x6a6258, bands: 3, tint: 0x655d84 }), fx, fy + 0.02, fz));
      }
    }
  }
  /* three tents, on three of the six.  Not all six: a campsite with every pitch
   * taken is a campsite in August, and this world is in April. */
  const tentCols = [PAL.tentCream, PAL.tentGreen, PAL.tentBlue];
  [0, 2, 4].forEach((i, k) => {
    const [px, pz, py] = pitches[i];
    ctx.add(makeTent({ x: px, z: pz, y: py + 0.06, ry: rng.range(-0.3, 0.3), color: tentCols[k] }));
    ctx.collide(px - 1.5, pz - 1.3, px + 1.5, pz + 1.3, py + 1.6);
  });

  /* --- 管理棟: a 3.8 x 3.0 timber hut with a counter hatch and a board, at the
   * mouth of the site where the road arrives.  Everything administrative in the
   * district is one of these; the difference between them is what is on the wall.
   * --- */
  {
    const hx = V.x - 12.0, hz = V.z - 1.0;
    const hy = ctx.groundAt(hx, hz);
    const h = new THREE.Group();
    h.add(box(3.8, 2.5, 3.0, m.timber, 0, 1.25, 0));
    h.add(box(4.3, 0.14, 3.5, m.roof, 0, 2.62, 0));
    for (let k = 0; k < 7; k++) h.add(box(0.1, 2.3, 0.05, m.timberDark, -1.6 + k * 0.55, 1.25, 1.53));
    h.add(box(1.5, 0.9, 0.1, m.timberDark, 0.5, 1.4, 1.55));
    const dk = box(1.32, 0.74, 0.05, flat({ color: 0x3a3630 }), 0.5, 1.4, 1.6);
    dk.userData.noOutline = true;
    h.add(dk);
    h.add(box(1.7, 0.07, 0.34, m.timberPale, 0.5, 0.92, 1.68));
    h.position.set(hx, hy, hz);
    h.rotation.y = 0.08;
    shadowify(h, true, true);
    g.add(h);
    ctx.collide(hx - 2.1, hz - 1.7, hx + 2.1, hz + 1.7, hy + 2.6);
    ctx.add(makeNoticeBoard({ ctx,
      x: hx - 2.0, z: hz + 2.2, y: hy, ry: Math.PI, w: 2.0, h: 1.3, y0: 0.95, wood: 0x8a6f52,
      sheets: [{ map: lakeNotice(3), x: 0, y: 0, w: 0.82, h: 0.62, tilt: 0 }],
    }));
    finger(ctx, hx - 3.6, hz - 1.6, -1.3, [lakePlate(4), lakeSign(4)], { h: 2.4, yAt: ctx.groundAt });
  }

  /* --- 炊事棚: an open cook shelter -- four posts, a mono-pitch roof, a concrete
   * bench with two hobs cut into it, and a shelf.  Colliders on the posts only,
   * because a box round it is a shelter you cannot cook in. --- */
  {
    const kx = V.x - 4.6, kz = V.z - 4.6;
    const ky = ctx.groundAt(kx, kz);
    const W = 4.6, D = 2.8, H = 2.3;
    pad(ctx, { x: kx, z: kz, w: W + 0.6, d: D + 0.6, y: ky - 0.08, h: 0.08, mat: m.concrete, name: 'campKitchenPad' });
    const k = new THREE.Group();
    k.name = 'openFrame';
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.add(box(0.14, H + (sz > 0 ? 0.35 : 0), 0.14, m.timberDark,
          sx * (W / 2 - 0.2), (H + (sz > 0 ? 0.35 : 0)) / 2, sz * (D / 2 - 0.2)));
      }
    }
    const roof = box(W + 0.8, 0.11, D + 0.9, m.roof, 0, H + 0.3, 0.1);
    roof.rotation.x = -Math.atan2(0.35, D);
    k.add(roof);
    k.add(box(W - 0.5, 0.86, 0.72, m.concreteMid, 0, 0.43, -D / 2 + 0.55));
    for (const hx of [-1.1, 1.1]) {
      const hob = box(0.44, 0.06, 0.44, cel({ color: 0x4a4550, bands: 3, tint: 0x5c5680 }), hx, 0.87, -D / 2 + 0.55);
      k.add(hob);
    }
    k.add(box(W - 0.6, 0.06, 0.34, m.timber, 0, 1.5, -D / 2 + 0.28));
    k.position.set(kx, ky, kz);
    shadowify(k, true, true);
    g.add(k);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = kx + sx * (W / 2 - 0.2), cz = kz + sz * (D / 2 - 0.2);
        ctx.collide(cx - 0.08, cz - 0.08, cx + 0.08, cz + 0.08, ky + H);
      }
    }
    ctx.collide(kx - W / 2, kz - D / 2 + 0.2, kx + W / 2, kz - D / 2 + 0.95, ky + 0.9);
    ctx.collide(kx - (W + 0.8) / 2, kz - (D + 0.9) / 2, kx + (W + 0.8) / 2, kz + (D + 0.9) / 2,
      ky + H + 0.5, ky + H, true);
    ctx.add(makeBucket({ x: kx + 2.6, z: kz + 0.8, y: ky, ry: 0.5 }));
    ctx.add(makeCrates({ x: kx - 2.9, z: kz - 0.4, y: ky, n: 2, seed: 10101, ry: 0.3 }));
  }

  /* --- 洗い場: a concrete trough with three taps, which is the piece of a
   * campsite everybody uses and nobody models --- */
  {
    const wx = V.x + 1.4, wz = V.z - 5.0;
    const wy = ctx.groundAt(wx, wz);
    pad(ctx, { x: wx, z: wz, w: 3.6, d: 2.0, y: wy - 0.08, h: 0.08, mat: m.concrete, name: 'campWashPad' });
    const w = new THREE.Group();
    w.add(box(2.8, 0.72, 0.9, m.concreteMid, 0, 0.36, 0));
    w.add(box(2.6, 0.1, 0.7, cel({ color: 0x8f9aa4, bands: 3, tint: 0x666090 }), 0, 0.7, 0));
    const dark = box(2.4, 0.06, 0.54, flat({ color: 0x4a4d56 }), 0, 0.72, 0);
    dark.userData.noOutline = true;
    w.add(dark);
    w.add(box(2.9, 0.34, 0.12, m.concrete, 0, 0.9, -0.5));
    for (const tx of [-0.9, 0, 0.9]) {
      w.add(cyl(0.028, 0.028, 0.3, 6, m.metal, tx, 1.16, -0.48));
      const sp = cyl(0.024, 0.024, 0.22, 6, m.metal, tx, 1.28, -0.38);
      sp.rotation.x = 1.1;
      w.add(sp);
    }
    w.position.set(wx, wy, wz);
    shadowify(w, true, true);
    g.add(w);
    ctx.collide(wx - 1.5, wz - 0.6, wx + 1.5, wz + 0.5, wy + 0.95);
  }

  /* --- 薪小屋 and the locker bank, and the refuse point.  A wood store is three
   * sides and a roof with the cut ends of the logs showing, which is the whole
   * object: a shed with no logs in it is a shed. --- */
  {
    const sx = V.x + 6.4, sz = V.z - 3.2;
    const sy = ctx.groundAt(sx, sz);
    const s = new THREE.Group();
    s.name = 'openFrame';
    s.add(box(2.8, 1.9, 0.12, m.timber, 0, 0.95, -0.8));
    for (const t of [-1, 1]) s.add(box(0.12, 1.9, 1.6, m.timber, t * 1.34, 0.95, 0));
    const roof = box(3.2, 0.1, 2.0, m.roof, 0, 2.05, 0.1);
    roof.rotation.x = -0.2;
    s.add(roof);
    // the stacked logs: cut ends out, three courses
    const logs = [];
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 8; k++) {
        logs.push({
          geometry: new THREE.CylinderGeometry(0.11, 0.11, 1.3, 7),
          matrix: trs(-1.05 + k * 0.3, 0.2 + r * 0.24, 0, Math.PI / 2, 0, 0),
        });
      }
    }
    s.add(new THREE.Mesh(bake(logs), m.log));
    s.position.set(sx, sy, sz);
    s.rotation.y = -0.1;
    shadowify(s, true, true);
    g.add(s);
    ctx.collide(sx - 1.5, sz - 1.0, sx + 1.5, sz - 0.55, sy + 1.95, sy, true);
    ctx.collide(sx - 1.55, sz - 0.9, sx - 1.15, sz + 0.85, sy + 1.95, sy, true);
    ctx.collide(sx + 1.15, sz - 0.9, sx + 1.55, sz + 0.85, sy + 1.95, sy, true);
    ctx.collide(sx - 1.4, sz - 0.8, sx + 1.4, sz + 0.75, sy + 0.95, sy, true);
    ctx.collide(sx - 1.7, sz - 1.15, sx + 1.7, sz + 1.05, sy + 2.20, sy + 1.85, true);
  }
  ctx.add(makeRecycleBox({ x: V.x + 9.0, z: V.z + 1.0, y: ctx.groundAt(V.x + 9.0, V.z + 1.0), ry: -0.5 }));
  ctx.add(makeVendBin({ x: V.x + 8.2, z: V.z + 2.2, y: ctx.groundAt(V.x + 8.2, V.z + 2.2), ry: -0.5 }));

  /* --- low bollard lamps down the site's own track, and the timber posts and rope
   * that mark the pitches off from it --- */
  for (let k = 0; k < 5; k++) {
    const lx = V.x - 10.0 + k * 5.0, lz = V.z + 1.6;
    const ly = ctx.groundAt(lx, lz);
    const l = new THREE.Group();
    l.add(box(0.16, 0.9, 0.16, m.timberDark, 0, 0.45, 0));
    const lens = box(0.2, 0.12, 0.2, flat({ color: PAL.lanternLit }), 0, 0.84, 0);
    lens.userData.noOutline = true;
    l.add(lens);
    l.add(box(0.24, 0.06, 0.24, m.timberDark, 0, 0.93, 0));
    l.position.set(lx, ly, lz);
    shadowify(l, true, false);
    ctx.add(l);
  }
  {
    const posts = [];
    for (let k = 0; k <= 9; k++) {
      const px = V.x - 11.0 + k * 2.4, pz = V.z + 3.0;
      const py = ctx.groundAt(px, pz);
      posts.push({ geometry: new THREE.CylinderGeometry(0.07, 0.08, 0.7, 6), matrix: trs(px, py + 0.3, pz) });
    }
    g.add(new THREE.Mesh(bake(posts), m.timberDark));
  }

  /* --- the car park: two bays at the turning head, which is the road's end --- */
  {
    const cx = V.x + 3.0, cz = V.z - 1.4;
    const cy = ctx.groundAt(cx, cz);
    pad(ctx, { x: cx, z: cz, w: 9.0, d: 5.4, y: cy - 0.07, h: 0.07, mat: gm.gravel, name: 'campPark' });
    for (const s of [-1, 1]) {
      ctx.add(box(1.5, 0.14, 0.16, cel({ color: PAL.concreteDark, bands: 3, tint: 0x655d84 }),
        cx + s * 2.0, cy + 0.07, cz - 2.0));
    }
  }

  out.grove.push(
    { x: V.x - 14.0, z: V.z + 4.6, y: ctx.groundAt(V.x - 14.0, V.z + 4.6), scale: 1.56, seed: 10201, spread: 1.15 },
    { x: V.x - 2.0, z: V.z + 8.4, y: ctx.groundAt(V.x - 2.0, V.z + 8.4), scale: 1.5, seed: 10202, spread: 1.12 },
    { x: V.x + 11.0, z: V.z - 2.0, y: ctx.groundAt(V.x + 11.0, V.z - 2.0), scale: 1.6, seed: 10203, spread: 1.16 },
    { x: V.x + 3.0, z: V.z - 9.0, y: ctx.groundAt(V.x + 3.0, V.z - 9.0), scale: 1.48, seed: 10204, spread: 1.1 }
  );
  out.sakura.push({ x: V.x - 6.0, z: V.z + 8.0, y: ctx.groundAt(V.x - 6.0, V.z + 8.0), scale: 1.22, seed: 10211, lean: 0.12, leanDir: 1.4 });
  out.bamboo.push({ x: V.x + 13.0, z: V.z + 4.0, y: ctx.groundAt(V.x + 13.0, V.z + 4.0), n: 10, spread: 2.0, scale: 0.98, seed: 10221 });
  for (const [bx, bz] of [[V.x - 9.0, V.z - 6.0], [V.x + 7.0, V.z + 6.0]]) {
    out.shrubs.push({ x: bx, z: bz, y: ctx.groundAt(bx, bz), r: 0.5, count: 4, spread: 1.7, seed: 10231 + bx });
  }
  for (const [dx, dz] of [[V.x - 5.0, V.z + 2.0], [V.x + 5.0, V.z - 1.0]]) {
    dapple(ctx, { x: dx, z: dz, y: ctx.groundAt(dx, dz), r: 1.9, spread: 3.4, n: 7, rng });
  }
  shadowify(g, true, true);
}

/* ------------------------------------------------------------------ *
 * 野鳥観察小屋 かいつぶり.
 * ------------------------------------------------------------------ */

/**
 * The hide, standing on piles **in** the reed flat at the end of a boardwalk.
 *
 * That is the whole design decision.  A hide on the bank looks over the reeds; a
 * hide in the water looks *through* them, and the reeds are then between you and
 * the birds, which is what a hide is for.  It costs a 22 m boardwalk and it is the
 * quietest place in the district.
 *
 * Its open side faces **north-west** across the flat, so the birds are between you
 * and the light and the reed heads are rim-lit.  Three horizontal slots rather than
 * windows -- a hide has no glass, and the slot is the object.
 */
function buildHide(ctx, rng, out) {
  const m = mats();
  const V = SITES.hide;
  const gap = SHORE_GAPS[2];
  const g = new THREE.Group();
  g.name = 'lakeHide';
  ctx.add(g);

  /* the boardwalk out from the shore walk, over the gap in the barrier */
  const walk = [[216.8, -143.4], [gap.x, gap.z], [V.x + 1.0, V.z - 1.4]];
  const DY = waterY(V.z) + 0.62;
  boardwalk(ctx, walk, { w: 1.6, yOf: () => DY, mat: m.timber });

  /* the hide's own platform, and the hut on it */
  timberDeck(ctx, { x: V.x, z: V.z, w: 4.8, d: 3.4, y: DY, pileU: 1.7, pileV: 1.7 });
  {
    const W = 4.6, D = 3.2, H = 2.15;
    const h = new THREE.Group();
    // three walls and a roof; the north-west side is the screen with the slots
    h.add(box(W, H, 0.12, m.timber, 0, H / 2, -D / 2));
    h.add(box(0.12, H, D, m.timber, -W / 2, H / 2, 0));
    h.add(box(0.12, H, D, m.timber, W / 2, H / 2, 0));
    // the screen wall: full height with three 0.28 m slots cut as gaps
    for (const [y0, y1] of [[0, 1.02], [1.30, 1.62], [1.90, H]]) {
      h.add(box(W, y1 - y0, 0.12, m.timber, 0, (y0 + y1) / 2, D / 2));
    }
    for (let k = 0; k < 8; k++) h.add(box(0.1, H - 0.1, 0.05, m.timberDark, -W / 2 + 0.35 + k * 0.61, H / 2, D / 2 + 0.08));
    const RH = 0.62;
    for (const s of [-1, 1]) {
      const p = box(W + 0.7, 0.1, D / 2 + 0.5, m.roof, 0, H + RH / 2, s * (D / 4 + 0.14));
      p.rotation.x = s * -Math.atan2(RH, D / 2 + 0.4);
      h.add(p);
    }
    h.add(box(W + 0.8, 0.12, 0.24, m.roof, 0, H + RH + 0.02, 0));
    // the shelf under the middle slot, which is what you rest your elbows on
    h.add(box(W - 0.4, 0.07, 0.3, m.timberPale, 0, 1.06, D / 2 - 0.2));
    // the bench along the back wall
    h.add(box(W - 0.6, 0.07, 0.36, m.timber, 0, 0.46, -D / 2 + 0.34));
    for (const s of [-1, 1]) h.add(box(0.09, 0.44, 0.09, m.timberDark, s * (W / 2 - 0.7), 0.22, -D / 2 + 0.34));
    h.name = 'openFrame';
    h.position.set(V.x, DY + 0.06, V.z);
    h.rotation.y = -0.5;              // the slots look north-west
    shadowify(h, true, true);
    g.add(h);
    hullOutline(h.children[0], { thickness: 0.003 });
    /* Three colliders on the three solid walls, and **nothing across the way in**:
     * the entrance is the east end, and a box round the hut is a hide nobody can
     * get into -- the 六丁目 shelter's mistake exactly. */
    const c = Math.cos(-0.5), s2 = Math.sin(-0.5);
    const at = (u, v) => [V.x + u * c + v * s2, V.z - u * s2 + v * c];
    const [bx, bz] = at(0, -D / 2);
    ctx.collide(bx - 2.3, bz - 0.5, bx + 2.3, bz + 0.5, DY + H);
    const [fx, fz] = at(0, D / 2);
    for (const [y0, y1] of [[0, 1.02], [1.30, 1.62], [1.90, H]]) {
      ctx.collide(fx - 2.3, fz - 0.5, fx + 2.3, fz + 0.5, DY + y1, DY + y0, true);
    }
    const [wx2, wz2] = at(-W / 2, 0);
    ctx.collide(wx2 - 0.5, wz2 - 1.6, wx2 + 0.5, wz2 + 1.6, DY + H);
    const [wxE, wzE] = at(W / 2, 0);
    ctx.collide(wxE - 0.5, wzE - 1.6, wxE + 0.5, wzE + 1.6, DY + H);
  }
  /* the two boards, on the inside of the back wall where you read them */
  ctx.add(makeNoticeBoard({ ctx,
    x: V.x - 0.9, z: V.z - 1.2, y: DY + 0.06, ry: -0.5, w: 1.4, h: 0.95, y0: 0.95, wood: 0x8a6f52,
    sheets: [{ map: birdChart(0), x: 0, y: 0, w: 0.66, h: 0.5, tilt: 0 }],
  }));
  ctx.add(makeNoticeBoard({ ctx,
    x: V.x + 0.9, z: V.z - 1.6, y: DY + 0.06, ry: -0.5, w: 1.3, h: 0.9, y0: 0.95, wood: 0x8a6f52,
    sheets: [{ map: birdChart(1), x: 0, y: 0, w: 0.6, h: 0.46, tilt: 0 }],
  }));
  /* a telescope mount at the middle slot: a post, a head and a yoke, no optics --
   * a 望遠鏡台 on a lake is usually empty, and an empty mount is a better object
   * than a fake instrument */
  {
    const tx = V.x + 1.5, tz = V.z + 0.9;
    ctx.add(cyl(0.055, 0.07, 1.05, 8, m.metalDark, tx, DY + 0.58, tz));
    ctx.add(box(0.26, 0.1, 0.26, m.metal, tx, DY + 1.13, tz));
    for (const s of [-1, 1]) ctx.add(box(0.06, 0.24, 0.06, m.metal, tx + s * 0.1, DY + 1.28, tz));
  }
  finger(ctx, 217.6, -144.6, 2.2, [lakePlate(5), lakeSign(6)], { h: 2.3, yAt: ctx.groundAt });
  ctx.add(makeNoticeBoard({ ctx,
    x: 218.6, z: -145.6, y: ctx.groundAt(218.6, -145.6), ry: 2.3, w: 1.8, h: 1.2, y0: 0.95, wood: 0x8a6f52,
    sheets: [{ map: lakeNotice(4), x: 0, y: 0, w: 0.78, h: 0.6, tilt: 0 }],
  }));

  out.bamboo.push({ x: 221.0, z: -147.4, y: ctx.groundAt(221.0, -147.4), n: 11, spread: 2.1, scale: 1.0, seed: 10301 });
  out.grove.push({ x: 224.0, z: -144.0, y: ctx.groundAt(224.0, -144.0), scale: 1.5, seed: 10311, spread: 1.14 });
  out.shrubs.push({ x: 219.4, z: -142.4, y: ctx.groundAt(219.4, -142.4), r: 0.5, count: 4, spread: 1.6, seed: 10321 });
  shadowify(g, true, true);
}

/* ------------------------------------------------------------------ *
 * 水神様.
 * ------------------------------------------------------------------ */

/**
 * The water god's shrine, on the far shore under the trees.
 *
 * Fifteen square metres, and that is the point -- 桜守神社 is the shrine in this
 * world, 山ノ神 is what the mountain has, and this is what a reservoir has: a
 * stone box the size of a letterbox, a stone 鳥居 you duck under, one lantern, an
 * offering shelf with a cup on it, and four treads down to the water so somebody
 * can reach it.
 *
 * It is at the end of the shore walk's *unmaintained* half -- the path narrows to
 * 1.15 m and turns to bare earth two hundred metres before you get here -- so it
 * is found rather than shown, which is the whole reason it works.
 */
function buildSuijin(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();
  const V = SITES.suijin;
  const gap = SHORE_GAPS[3];
  const g = new THREE.Group();
  g.name = 'lakeSuijin';
  ctx.add(g);

  const py = ctx.groundAt(V.x, V.z);
  pad(ctx, { x: V.x, z: V.z, w: 3.2, d: 3.6, y: py - 0.08, h: 0.08, mat: gm.gravel, name: 'suijinPad' });
  {
    const kerb = [];
    for (const s of [-1, 1]) {
      kerb.push({ geometry: new THREE.BoxGeometry(0.18, 0.22, 3.6), matrix: trs(V.x + s * 1.6, 0.11, V.z) });
    }
    kerb.push({ geometry: new THREE.BoxGeometry(3.2, 0.22, 0.18), matrix: trs(V.x, 0.11, V.z - 1.8) });
    const km = new THREE.Mesh(bake(kerb), m.stoneDark);
    km.position.y = py - 0.08;
    km.castShadow = km.receiveShadow = true;
    g.add(km);
  }

  /* --- the 鳥居: **stone**, not timber, and 1.7 m so you duck.  A water god's
   * shrine at a reservoir is 石造 because it stands in the weather. --- */
  {
    const tx = V.x, tz = V.z + 1.35, TW = 1.25, TH = 1.7;
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.075, 0.095, TH, 8),
        matrix: trs(s * TW / 2, TH / 2, 0),
      });
    }
    parts.push({ geometry: new THREE.BoxGeometry(TW + 0.5, 0.11, 0.14), matrix: trs(0, TH - 0.3, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(TW + 0.72, 0.12, 0.19), matrix: trs(0, TH + 0.01, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(TW + 0.78, 0.08, 0.22), matrix: trs(0, TH + 0.1, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(0.14, 0.22, 0.11), matrix: trs(0, TH - 0.18, 0) });
    const tm = new THREE.Mesh(bake(parts), m.stone);
    tm.name = 'torii';
    tm.position.set(tx, py, tz);
    tm.castShadow = tm.receiveShadow = true;
    g.add(tm);
    hullOutline(tm, { thickness: 0.0032 });
    for (const s of [-1, 1]) {
      ctx.collide(tx + s * TW / 2 - 0.13, tz - 0.13, tx + s * TW / 2 + 0.13, tz + 0.13, py + TH, py, true);
    }
    ctx.collide(tx - (TW + 0.78) / 2, tz - 0.14, tx + (TW + 0.78) / 2, tz + 0.14,
      py + TH + 0.16, py + TH - 0.36, true);
  }

  /* --- the 祠 itself, its plinth, its niche and its roof --- */
  {
    const hx = V.x, hz = V.z - 1.1;
    g.add(box(1.1, 0.4, 0.95, m.stoneDark, hx, py + 0.2, hz));
    const body = box(0.64, 0.7, 0.56, m.stone, hx, py + 0.75, hz);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    hullOutline(body, { thickness: 0.0032 });
    const niche = box(0.28, 0.42, 0.16, flat({ color: 0x2e2b38 }), hx, py + 0.73, hz + 0.26);
    niche.userData.noOutline = true;
    g.add(niche);
    g.add(box(0.36, 0.48, 0.07, m.stoneDark, hx, py + 0.73, hz + 0.33));
    g.add(box(0.82, 0.1, 0.74, m.stone, hx, py + 1.15, hz));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), m.stoneDark);
    cap.rotation.y = Math.PI / 4;
    cap.scale.set(0.74, 0.32, 0.66);
    cap.position.set(hx, py + 1.34, hz);
    cap.castShadow = true;
    g.add(cap);
    ctx.collide(hx - 0.6, hz - 0.55, hx + 0.6, hz + 0.55, py + 1.45);
    // the offering shelf, with a cup and a small dish
    g.add(box(0.6, 0.11, 0.36, m.stone, hx + 0.78, py + 0.38, hz + 0.1));
    g.add(box(0.11, 0.26, 0.11, m.stoneDark, hx + 0.78, py + 0.2, hz + 0.1));
    g.add(cyl(0.043, 0.038, 0.07, 9, cel({ color: 0xf2eee4, bands: 'soft', tint: 0x9c93b8 }), hx + 0.74, py + 0.47, hz + 0.02));
    g.add(cyl(0.06, 0.056, 0.028, 10, cel({ color: 0xe4dccc, bands: 3, tint: 0x8a83a8 }), hx + 0.82, py + 0.45, hz + 0.2));
  }

  /* --- one 石灯籠, on the shore side, and the rope on the tree beside it --- */
  {
    const lx = V.x - 1.15, lz = V.z + 0.5;
    const parts = [];
    parts.push({ geometry: new THREE.BoxGeometry(0.38, 0.15, 0.38), matrix: trs(0, 0.075, 0) });
    parts.push({ geometry: new THREE.CylinderGeometry(0.08, 0.1, 0.5, 8), matrix: trs(0, 0.4, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(0.33, 0.08, 0.33), matrix: trs(0, 0.69, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(0.27, 0.26, 0.27), matrix: trs(0, 0.86, 0) });
    const lm = new THREE.Mesh(bake(parts), m.stone);
    lm.position.set(lx, py, lz);
    lm.castShadow = lm.receiveShadow = true;
    g.add(lm);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), m.stoneDark);
    cap.rotation.y = Math.PI / 4;
    cap.scale.set(0.46, 0.22, 0.46);
    cap.position.set(lx, py + 1.08, lz);
    cap.castShadow = true;
    g.add(cap);
    const dk = box(0.14, 0.15, 0.14, flat({ color: 0x2e2b38 }), lx, py + 0.86, lz);
    dk.userData.noOutline = true;
    g.add(dk);
    ctx.collide(lx - 0.22, lz - 0.22, lx + 0.22, lz + 0.22, py + 1.1);
  }
  {
    const tx = V.x + 2.4, tz = V.z + 1.4;
    const ty = ctx.groundAt(tx, tz);
    out.grove.push({ x: tx, z: tz, y: ty, scale: 1.7, seed: 10401, spread: 1.2, lean: 0.05, leanDir: 1.6 });
    const r = 0.24 * 1.7 * 1.1;
    const rope = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 5, 12), m.rope);
    rope.rotation.x = Math.PI / 2;
    rope.position.set(tx, ty + 1.3, tz);
    rope.castShadow = true;
    g.add(rope);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.24),
        flat({ color: 0xfaf8f2, side: THREE.DoubleSide }));
      sh.position.set(tx + Math.cos(a) * r, ty + 1.16, tz + Math.sin(a) * r);
      sh.rotation.y = -a;
      sh.userData.noOutline = true;
      g.add(sh);
    }
  }

  /* --- the four treads down to the water, through the gap in the barrier.  This is
   * the one place on the natural shore you can reach the surface, and it is why the
   * gap is there. --- */
  {
    const sy = waterY(gap.z);
    steps(ctx, {
      x: gap.x + 0.6, z: gap.z, n: Math.max(2, Math.round((py - sy - 0.1) / 0.2)),
      rise: 0.2, run: 0.42, w: 1.5, y: sy + 0.1, dir: 1, axis: 'x', mat: m.stone,
    });
    // a mossy sill at the bottom, half in the water
    const sill = box(1.8, 0.16, 0.7, m.moss, gap.x - 0.5, sy + 0.06, gap.z);
    sill.receiveShadow = true;
    g.add(sill);
  }

  /* --- the notice board, moss, leaves and blossom.  A shrine nobody sweeps is a
   * shrine nobody visits, so the leaves are *in the corners* and the pad is
   * clear. --- */
  ctx.add(makeNoticeBoard({ ctx,
    x: V.x + 1.5, z: V.z - 1.4, y: py, ry: -1.9, w: 1.2, h: 0.85, y0: 0.85, wood: 0x8a6f52,
    sheets: [{ map: lakeNotice(1), x: 0, y: 0, w: 0.56, h: 0.44, tilt: 0 }],
  }));
  out.bamboo.push({ x: V.x - 2.8, z: V.z - 2.2, y: ctx.groundAt(V.x - 2.8, V.z - 2.2), n: 9, spread: 1.8, scale: 0.95, seed: 10411 });
  out.grove.push({ x: V.x - 3.2, z: V.z + 3.0, y: ctx.groundAt(V.x - 3.2, V.z + 3.0), scale: 1.6, seed: 10421, spread: 1.16 });
  out.sakura.push({ x: V.x + 3.4, z: V.z - 3.0, y: ctx.groundAt(V.x + 3.4, V.z - 3.0), scale: 1.18, seed: 10431, lean: 0.13, leanDir: 3.4 });
  out.shrubs.push({ x: V.x + 1.9, z: V.z + 2.6, y: ctx.groundAt(V.x + 1.9, V.z + 2.6), r: 0.44, count: 3, spread: 1.1, seed: 10441 });
  out.petals.push({ x: V.x, z: V.z + 0.4, y: py, r: 1.7, seed: 10451 });
  dapple(ctx, { x: V.x, z: V.z, y: py, r: 1.4, spread: 2.2, n: 6, rng });
  makeLoosePaper(ctx, [{ x: V.x - 1.3, z: V.z - 1.6, y: py + 0.01, seed: 10461 }]);
  shadowify(g, true, true);
}

/* ------------------------------------------------------------------ *
 * Builder.
 * ------------------------------------------------------------------ */

export function buildKohan(ctx) {
  const rng = rngKit(91733);
  const out = { sakura: [], grove: [], shrubs: [], bamboo: [], petals: [] };
  buildWalk(ctx, rng, out);
  buildPark(ctx, rng, out);
  const pier = buildPier(ctx, rng, out);
  buildBoatStation(ctx, rng, out);
  buildCafe(ctx, rng, out);
  buildCamp(ctx, rng, out);
  buildHide(ctx, rng, out);
  buildSuijin(ctx, rng, out);
  out.stats = { pierDeckY: +pier.deckY.toFixed(2) };
  return out;
}
