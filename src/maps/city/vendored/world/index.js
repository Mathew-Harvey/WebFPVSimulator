import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { rngKit, box } from '../core/util.js';
import {
  buildStreet, centerX, groundY, streetHeight,
  ROAD_HALF, WALK_W, WALK_H, GATE_Z, Z_MIN, Z_MAX,
} from './street.js';
import { buildRailway } from './railway.js';
import { buildTrain } from './train.js';
import { buildShop } from './shop.js';
import { makeHouse, makeWall, makeTimberFence, makeBlockFence } from './buildings.js';
import { buildSakura, buildShrubs, buildGrove, buildBamboo, buildCedar, thinSpots, TREE_KEEP, SHRUB_KEEP, BAMBOO_KEEP } from './trees.js';
import { buildPlanet, bakeToPlanet, wrapX, reliefAt, CIRCUMFERENCE } from './planet.js';
/* The hills are a *third* ground surface, over both the graded terrain grid and
 * the planet sphere, and they are added to the height queries here rather than
 * folded into `reliefAt` -- `buildPlanet` samples that one, and the sphere has to
 * stay flat.  See the long note at the top of `hills.js`. */
import { hillAt, buildHills } from './hills.js';
import { buildTunnel } from './tunnel.js';
import { buildUrayama } from './urayama.js';
/* ひばり湖.  Three modules for one district, split the same way the hills are:
 * `lake.js` is the water (a surface generated from the depth field), `lakeroad.js`
 * is the civil engineering that makes it reachable, and `kohan.js` is the eight
 * places on its shores.  The *shape* of the basin lives in `lakeform.js` and is
 * read by `hills.js` while it builds its lattice, so it is not a district at all. */
import { buildLake } from './lake.js';
import { buildLakeRoad } from './lakeroad.js';
import { buildKohan } from './kohan.js';
import { buildSchool } from './school.js';
import { buildApproach } from './approach.js';
import { buildShrine } from './shrine.js';
import { buildShotengai } from './shotengai.js';
import { buildCanal } from './canal.js';
import { buildDistrict } from './district.js';
import { buildOverbridge } from './overbridge.js';
import { buildRestCorner } from './restcorner.js';
import { buildLibrary } from './library.js';
import { buildNorthBlock } from './northblock.js';
import { buildAlleys } from './alleys.js';
import { buildMatsuri } from './matsuri.js';
import { buildOnsen } from './onsen.js';
/* The six residential blocks.  These are not set pieces -- they are the land
 * *between* the set pieces, and their whole job is to make the district read as
 * somewhere people live rather than as a row of places to look at. */
import { buildIchome } from './ichome.js';
import { buildNichome } from './nichome.js';
import { buildYonchome } from './yonchome.js';
import { buildKoenmae } from './koenmae.js';
import { buildTsugakuro } from './tsugakuro.js';
import { buildUramachi } from './uramachi.js';
import { buildGakkomae } from './gakkomae.js';
import { buildKawabata } from './kawabata.js';
import { buildRokuchome } from './rokuchome.js';
import { buildNanachome } from './nanachome.js';
import { buildTraffic } from './traffic.js';
import { buildDetails } from './details.js';
/* Falling blossom, and the drifts it leaves.  Back after a round with it
 * switched off: `quality.js` now decides whether the live field runs, so the
 * town builds it and Low hides it. */
import { buildPetals, buildFallenPatches } from './petals.js';
import {
  makePole, makeWires, makeKeiTruck, makeMirror, makePostBox,
  makeShrine, makeBarrier, makeGuardrail, makeBins,
} from './props.js';

/* ------------------------------------------------------------------ *
 * World assembly.
 *
 * Placement here is composition work, not simulation: every object is
 * positioned for what it does in the opening frame -- the canopy that
 * closes the top corners, the pole that carries the eye up out of frame,
 * the truck that anchors the bottom right, the crossing that sits just
 * left of centre with the shop stacked against it.
 * ------------------------------------------------------------------ */

export function buildWorld(scene, { bake = true } = {}) {
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);

  const colliders = [];
  const interactables = [];
  const updaters = [];
  const platforms = [];
  /* Boxes that pull the ground *down*, which platforms cannot do: `heightAt`
   * takes the max over platforms, so nothing in the world was able to express
   * an excavation.  The canal's made ground is 0.34 m below the natural grade
   * on its north bank, and without a cut the player walks that service path
   * floating over it -- true since the channel went in.  See `canal.js`. */
  const cuts = [];

  const ctx = {
    scene,
    root,
    colliders,
    interactables,
    add: (obj) => { root.add(obj); return obj; },
    /* `bottom` is optional and was unreachable until 七丁目 needed it: the
     * player's `_resolve` has always honoured it (a collider is skipped by
     * anybody whose feet are more than 1.9 m below it) but nothing could set it,
     * so every barrier in the world blocks at *every* height -- which is right
     * for a wall and wrong for something 6 m in the air.  スーパー さかえ's roof
     * parapet is the case: it has to stop a walker on the deck and must not be a
     * wall across the shop doorway five metres below it.  Leave it undefined and
     * the behaviour is exactly what it always was. */
    collide: (x0, z0, x1, z1, top, bottom, skipFit) => {
      colliders.push({
        x0: Math.min(x0, x1), x1: Math.max(x0, x1),
        z0: Math.min(z0, z1), z1: Math.max(z0, z1),
        top, bottom,
        skipFit: skipFit === true,
      });
    },
    platform: (p) => platforms.push(p),
    cut: (c) => cuts.push(c),
    /* The height a prop actually stands on -- cuts and platforms included, the
     * same answer `world.heightAt` gives without a `fromY`.
     *
     * Builders that seat clutter from `groundY(z)` alone are right only where
     * nothing else has touched the surface, and by now plenty has: a 0.135 m
     * footway, a 0.09 m lane, a forecourt slab, the canal's bank cut 0.34 m
     * below the natural grade.  Wherever one of those is under a prop, the prop
     * is buried or floating by exactly its thickness -- which is what had the
     * bicycles outside two of the houses sunk to their axles in the pavement,
     * and the one in front of the house on the canal's north bank a third of a
     * metre in the air.  Only meaningful once whatever laid that surface has
     * run, which is why the housing sweep is last but one. */
    groundAt: (x, z) => {
      let h = streetHeight(x, z) + reliefAt(x, z) + hillAt(x, z);
      for (const c of cuts) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) h = Math.min(h, c.top);
      for (const p of platforms) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) h = Math.max(h, p.top);
      return h;
    },
    interact: (i) => interactables.push(i),
    update: (fn) => updaters.push(fn),
  };

  /* ------------------------------ base layers ------------------------------ */
  const planet = buildPlanet(scene);
  buildStreet(ctx);
  const crossing = buildRailway(ctx);
  const train = buildTrain(ctx);
  const shop = buildShop(ctx);

  /* -------------------------------- houses -------------------------------- */
  const houseDefs = [
    // Near side, left of the street.  These are held back deliberately: any
    // frontage closer than this walls off the sight line along the railway,
    // and the receding track is what gives the shot its depth.
    { x: -13.6, z: 12.6, w: 7.0, d: 7.0, face: 'x+', floors: 2, seed: 21, wall: 0, roof: 1, roofKind: 'gable' },
    {
      x: -9.4, z: 23.2, w: 7.0, d: 8.0, face: 'x+', floors: 2, seed: 22,
      wall: 2, roof: 0, roofKind: 'hip', postBoxOut: 0.55,
      postBoxSink: 0.02, gomiSink: 0.02,
    },
    {
      x: -10.6, z: 33.5, w: 6.4, d: 7.2, face: 'x+', floors: 1, seed: 23,
      wall: 1, roof: 2, roofKind: 'gable',
      planterAlong: -1.6, planterOut: 0.17, planterSpacing: 0.52,
      planterSink: 0.025, umbrellaSink: 0.02,
    },
    { x: -13.5, z: 43.0, w: 7.4, d: 7.4, face: 'x+', floors: 2, seed: 24, wall: 4, roof: 1, roofKind: 'flat' },
    /* near side, right of the street beyond the shop.
     *
     * Narrowed 7.2 -> 5.6 and slid 0.8 m west, which moves its back wall from
     * x = 13.8 to 12.2 and opens the 2.1 m back alley that now runs the whole
     * length of the shopping street's west row (`alleys.js`).  Its frontage stays
     * at x = 6.6 and its front-door clutter with it, so nothing about the street
     * elevation changes -- the whole move happens behind the house. */
    { x: 9.4, z: 20.4, w: 5.6, d: 7.8, face: 'x-', floors: 2, seed: 25, wall: 3, roof: 0, roofKind: 'gable', postBoxAlong: -0.6, gomiOut: -0.2, gomiSignAlong: -1.6 },
    { x: 8.9, z: 29.6, w: 6.6, d: 7.4, face: 'x-', floors: 2, seed: 26, wall: 5, roof: 3, roofKind: 'hip', bikeOut: 0.85, postBoxAlong: -0.2 },
    /* `planterAlong: 1.2` because `dressHousing` has no slot allocator.  The
     * planters' offset along the frontage is random and the umbrella stand's is
     * fixed at `min(sideHalf - 0.9, 1.2)`, and nothing checks the two against
     * each other: on this house the RNG landed the first pot at t = 1.21 against
     * the stand's 1.20, so the pot came out through the side of the stand.  The
     * pair moves 1.2 m north, clear of both the stand and the bicycle. */
    { x: 7.4, z: 38.5, w: 6.8, d: 7.0, face: 'x-', floors: 1, seed: 27, wall: 0, roof: 2, roofKind: 'gable', planterAlong: 1.2 },
    // Far side of the crossing.  These sit hard up against the lineside so the
    // view down the street is closed off instead of opening into pale haze.
    { x: -8.7, z: -7.6, w: 6.8, d: 6.2, face: 'x+', floors: 2, seed: 28, wall: 1, roof: 0, roofKind: 'gable', postBoxAlong: -0.15 },
    /* **The two planters move out and south**, and it takes both because at
     * their old place on this frontage there is no legal position at all.
     *
     * This house's frontage line, its own garden wall *and* the road's
     * retaining wall all live in the same 0.7 m of ground: the retaining run's
     * body face is at x = -4.493 and the default `planterOut` of -0.15 put the
     * pots at -4.50, so pot, soil and foliage were entirely inside the
     * concrete.  Moving them straight out does not work either -- `dressHousing`
     * culls anything closer than 0.35 m to the footway's road edge, and at the
     * pots' original z (-14.0 and -14.65) that limit is x < -4.23 while the
     * wall needs the foliage at x > -4.11.  The two constraints cross.
     *
     * They stop crossing further south, because the road is drifting east: at
     * z = -17 the cull limit is -3.91 and the band is a quarter of a metre
     * wide.  `planterAlong: -2.8` puts the pair at z -17.45 and -16.80, clear
     * of the post box at -18.1, and `planterOut: 0.30` stands them on the back
     * of the footway with their leaves just under the wall's coping -- which is
     * where a house with no front garden actually keeps them. */
    { x: -8.2, z: -16.4, w: 6.6, d: 7.0, face: 'x+', floors: 2, seed: 29, wall: 4, roof: 1, roofKind: 'hip', postBoxOut: 0.35, planterAlong: -2.8, planterOut: 0.30 },
    /* The two plots at z ~ -26 are gone: the drainage channel runs the whole
     * way round the planet now, and at z = -24 that puts twelve metres of made
     * ground straight through both of them.  The gap they leave in each column
     * is not a hole in the composition -- it is the canal, which is a far
     * better reason for a break in a frontage than a coincidence.  One of them
     * is rebuilt below, turned to face the water; the other's density went into
     * the new north block.  (Was: x -6.4 z -27.4, and x 12.4 z -26.0.) */
    { x: -15.2, z: -34.6, w: 7.4, d: 7.0, face: 'z+', floors: 2, seed: 30, wall: 2, roof: 2, roofKind: 'gable' },
    // this one turns to face back up the street, closing off the far view
    { x: -5.4, z: -33.5, w: 8.0, d: 7.4, face: 'z+', floors: 2, seed: 44, wall: 0, roof: 1, roofKind: 'gable', bikeLift: 0.03 },
    // far side of the crossing, right
    { x: 8.5, z: -7.4, w: 6.6, d: 6.0, face: 'x-', floors: 1, seed: 31, wall: 0, roof: 3, roofKind: 'gable' },
    { x: 10.0, z: -16.2, w: 6.8, d: 7.2, face: 'x-', floors: 2, seed: 32, wall: 3, roof: 1, roofKind: 'hip' },
    { x: 14.4, z: -35.5, w: 7.0, d: 7.4, face: 'x-', floors: 1, seed: 45, wall: 1, roof: 3, roofKind: 'hip', skipBike: true },
    // background rows across the tracks, seen over the fence
    { x: -18.0, z: -13.0, w: 8.0, d: 8.0, face: 'z+', floors: 2, seed: 34, wall: 1, roof: 1, roofKind: 'gable' },
    { x: -27.5, z: -12.0, w: 7.6, d: 7.6, face: 'z+', floors: 1, seed: 35, wall: 4, roof: 0, roofKind: 'hip' },
    { x: -37.0, z: -14.5, w: 8.4, d: 8.0, face: 'z+', floors: 2, seed: 36, wall: 0, roof: 2, roofKind: 'gable' },
    { x: 21.0, z: -14.0, w: 8.2, d: 8.0, face: 'z+', floors: 2, seed: 37, wall: 2, roof: 0, roofKind: 'hip' },
    { x: 31.0, z: -13.0, w: 7.8, d: 7.6, face: 'z+', floors: 1, seed: 38, wall: 5, roof: 1, roofKind: 'gable' },
    { x: 41.5, z: -15.0, w: 8.6, d: 8.2, face: 'z+', floors: 2, seed: 39, wall: 3, roof: 2, roofKind: 'flat' },
    // a row facing the railway on the near side, further along
    { x: -22.0, z: 9.5, w: 8.0, d: 7.6, face: 'z-', floors: 2, seed: 40, wall: 0, roof: 1, roofKind: 'gable' },
    // nudged 1.6 m west of its original x = -32 to open the alley up to the
    // shrine: the gap between these two side walls is the only way in
    { x: -33.6, z: 10.5, w: 7.6, d: 7.4, face: 'z-', floors: 1, seed: 41, wall: 4, roof: 3, roofKind: 'hip' },
    /* Narrowed 8.2 -> 5.8 and shifted 1.2 m east, which opens the pocket at
     * x 12-18 behind the corner shop for the vending rest corner.  Its north
     * gable stays at z = 13.9 (the shotengai's closing wall is dressed onto
     * that face at x 19.6-23.4) and its frontage still closes the view north
     * from the railway, which is the only job it had. */
    { x: 21.2, z: 10.0, w: 5.8, d: 7.8, face: 'z-', floors: 2, seed: 42, wall: 1, roof: 0, roofKind: 'gable' },
    { x: 30.5, z: 11.0, w: 7.8, d: 7.4, face: 'z-', floors: 2, seed: 43, wall: 5, roof: 2, roofKind: 'hip' },
  ];
  for (const d of houseDefs) {
    const y = groundY(d.z);
    const h = makeHouse({ ...d, y });
    ctx.add(h);
    ctx.collide(d.x - d.w / 2, d.z - d.d / 2, d.x + d.w / 2, d.z + d.d / 2,
      y + (h.userData.top ?? 2.72 * d.floors));
  }

  /* ---------------------------- outlying districts ----------------------------
   * Each of these builds its own ground, buildings and clutter, and hands
   * back the trees, shrubs and fallen blossom it wants rather than planting
   * them: the sakura builder merges every tree in the world into one mesh
   * plus three instanced canopies, so it has to run once, at the end.
   *
   * `buildDistrict` is last because it also dresses the housing above, and it
   * needs the same definitions the house generator was given. */
  const districts = [
    /* 裏山 first, because it is *ground*: the only module other than `street.js`
     * that produces a walkable surface rather than things standing on one.  The
     * height field itself is a pure function and needs no ordering at all -- it
     * is available to every builder from module load, which is what lets the
     * back-hill district and the tunnel measure the slope they are building on --
     * so what this position actually buys is that the file reads in the order the
     * world is made in.  Its planting is handed back like every other
     * district's. */
    buildHills(ctx),
    /* The tunnel builds the mountain over the railway, which is the one piece of
     * ground `hills.js` deliberately cut out of itself -- so it runs immediately
     * after it, and it reads `hillAt` along the notch's two lattice edges to meet
     * the hillside exactly. */
    buildTunnel(ctx),
    buildSchool(ctx),
    /* 裏山 runs after the school and before everything else it touches: its
     * hill-foot road comes off the 通学路's old dead end (`approach.js` opens it),
     * runs behind the school's new north wall and up its new east side, so both
     * of those have to exist before it measures anything off them. */
    buildUrayama(ctx),
    /* ひばり湖 runs immediately after 裏山, and the order is load-bearing in one
     * direction: `lakeroad.js`'s road leaves the *top of the school's outer road*,
     * so `urayama.js` has to have laid that surface before this measures the
     * junction off `ctx.groundAt`.  Nothing downstream depends on the lake, which
     * is why it can sit this early -- everything else in the district is on the
     * far side of a hill from the rest of the world.
     *
     * The water goes in before the shores because `kohan.js` reads
     * `SHORE_GAPS` from it: four places the shore barrier is broken, each of which
     * has to have something to step onto.  A gap with nothing at it is a hole. */
    buildLake(ctx),
    buildLakeRoad(ctx),
    buildKohan(ctx),
    buildApproach(ctx),
    buildShrine(ctx),
    buildShotengai(ctx),
    buildCanal(ctx, train),
    buildOverbridge(ctx),
    buildRestCorner(ctx),
    buildLibrary(ctx),
    buildNorthBlock(ctx),
    buildMatsuri(ctx),
    buildOnsen(ctx),
    buildAlleys(ctx),
    /* The residential blocks run after every district whose surfaces they sit
     * against -- 一丁目 wants the canal's verge pad to derive its step rises
     * from, 四丁目 arrives off the library's corner pad, 公園前 measures itself
     * off the overbridge -- and before `buildDistrict`, so the housing sweep
     * seats its clutter on the lanes these lay rather than on the bare grade. */
    buildIchome(ctx),
    buildNichome(ctx),
    buildYonchome(ctx),
    buildKoenmae(ctx),
    buildTsugakuro(ctx),
    buildUramachi(ctx),
    buildGakkomae(ctx),
    buildKawabata(ctx),
    /* ひばり台六丁目 runs after 二丁目 and 三丁目 and it has to: every surface
     * in it is paved to the height of the north T those two lay between them,
     * and it reads that height off `ctx.groundAt` rather than assuming it. */
    buildRokuchome(ctx),
    /* ひばり台七丁目 runs after 湯の坂 (it builds against the terrace's north
     * retaining wall and puts a flight through the gap in it) and after
     * 桜守裏町 (its footpath east lands on that block's arm), and before
     * `buildDistrict` like every other block. */
    buildNanachome(ctx),
    buildDistrict(ctx, { houses: houseDefs }),
    /* The motor vehicles run after every surface in the world is laid, because
     * a car is seated with `ctx.groundAt` and half of them stand on a lane, an
     * apron or a bay that a district module put down -- and it runs after the
     * housing sweep for the same reason `buildDistrict` runs last but one: it
     * has to see the clutter it is parking between.  `traffic.js` is one file
     * on purpose; what has to be right about it is the distribution over the
     * whole map, and a distribution cannot be reviewed thirty lines at a time
     * in twenty-two modules. */
    buildTraffic(ctx),
    buildDetails(ctx),
  ];
  for (const d of districts) if (d.update) ctx.update(d.update);
  const extraSakura = districts.flatMap((d) => d.sakura ?? []);
  const extraShrubs = districts.flatMap((d) => d.shrubs ?? []);
  const groveAll = districts.flatMap((d) => d.grove ?? []);
  const cedarAll = districts.flatMap((d) => d.cedar ?? []);
  const bambooAll = districts.flatMap((d) => d.bamboo ?? []);
  const planting = {
    groveBefore: groveAll.length,
    cedarBefore: cedarAll.length,
    bambooBefore: bambooAll.length,
    shrubsBefore: extraShrubs.length,
  };
  const groveKept = thinSpots(groveAll, TREE_KEEP, 11);
  const cedarKept = thinSpots(cedarAll, TREE_KEEP, 13);
  const bambooKept = thinSpots(bambooAll, BAMBOO_KEEP, 17);
  planting.groveAfter = groveKept.length;
  planting.cedarAfter = cedarKept.length;
  planting.bambooAfter = bambooKept.length;
  buildGrove(ctx, groveKept);
  /* The 杉林 merges the same way the grove does -- one baked stem mesh and three
   * instanced crowns for every plantation in the world -- so it has to run here
   * and not inside `hills.js`, which is also where its spots come from. */
  buildCedar(ctx, cedarKept);
  buildBamboo(ctx, bambooKept);
  /* Fallen blossom, over every patch the districts asked for.  Each tone is
   * one instanced mesh over the whole world, so a couple of dozen scattered
   * drifts is three draw calls however many patches feed it.
   *
   * TWO SHAPES GO INTO THAT ONE ARRAY, and only one of them is the shape
   * `buildFallenPatches` documents.  The blocks and the lanes push rectangles,
   * `{ x, z, w, d, y, n }`, which is what it reads; `hills.js`, `kohan.js`,
   * `lakeroad.js` and `urayama.js` push circles, `{ x, z, y, r, seed }`, with
   * no `w` and no `d` at all.  Fed straight in, every one of those became
   * `p.x + edge * undefined`, so a third of the world's drifts -- 1947, 2043
   * and 1950 instances across the three tones, measured -- were placed at NaN
   * and took their instanced mesh's bounding sphere with them.  A circle is
   * turned into the square that contains it here, at the join, rather than by
   * changing either side of it. */
  buildFallenPatches(ctx, districts.flatMap((d) => d.petals ?? []).map((p) => (
    p.w !== undefined ? p : {
      x: p.x, z: p.z, y: p.y, w: (p.r ?? 1) * 2, d: (p.r ?? 1) * 2,
      n: p.n ?? Math.max(20, Math.round(28 * (p.r ?? 1))),
    }
  )));

  /* The distant town, hills and far tree line are gone: on a 160 m planet
   * anything that used to sit 60-330 m away is now over the horizon or on
   * the far side of the world. The curvature does that job instead.       */

  /* ------------------------- garden walls and fences -------------------------
   * Three types, scattered rather than alternated.  Every house here already
   * varies its roof, wall tone and window layout, but they all had the same
   * concrete-and-mesh boundary, and a repeated fence flattens all that other
   * variety back into one estate built in one go.  The two new types
   * (`buildings.js`) report their own overall height, so the collider does not
   * have to know which one it got. */
  const FENCE_KIND = { timber: makeTimberFence, block: makeBlockFence };
  const walls = [
    { x: -9.9, z: 12.6, len: 7.2, axis: 'z', h: 0.72, kind: 'block' },
    { x: -5.1, z: 15.2, len: 5.0, axis: 'z', h: 0.5, fence: true },
    { x: -5.3, z: 23.2, len: 8.2, axis: 'z', h: 0.4, kind: 'timber' },
    { x: 6.4, z: 20.4, len: 8.0, axis: 'z', h: 0.66, kind: 'block' },
    { x: 5.3, z: 29.6, len: 7.6, axis: 'z', h: 0.4, kind: 'timber' },
    { x: -4.9, z: -16.4, len: 7.2, axis: 'z', h: 0.7, fence: false },
    { x: 5.4, z: -7.4, len: 6.2, axis: 'z', h: 0.5, fence: true },
  ];
  for (const w of walls) {
    const g = (FENCE_KIND[w.kind] ?? makeWall)({ ...w, y: groundY(w.z) });
    ctx.add(g);
    const half = w.len / 2;
    const top = w.kind === 'block'
      ? groundY(w.z) + (w.h ?? 0.72)
      : groundY(w.z) + g.userData.top;
    ctx.collide(w.x - 0.2, w.z - half, w.x + 0.2, w.z + half, top);
  }

  /* ----- retaining wall on the left where the road climbs past the crossing ----- *
   * Two runs instead of three short panels.  The northern pair used to reach
   * z = -30.3, which is now the middle of the canal's made ground and the
   * middle of こばと橋: a retaining wall standing on a bridge deck.  The
   * bridge's own fill retains the embankment from z = -17 to -30, so the wall
   * only has to cover the stretch south of it.
   *
   * The gap at z -12.9 .. -10.7 is the point.  Those two metres are the passage
   * between the houses at (-8.7, -7.6) and (-8.2, -16.4), and it is the only way
   * from the back land onto the street on this side.  The three 3.2 m panels
   * ran straight across it and left 0.2 m of daylight between two of them --
   * wide enough to read as an opening from the alley, a fifth of what a body
   * needs to get through it, and the whole passage was a dead end because of
   * it.  Each run ends in a pier at the opening, because 3 m of concrete
   * stopping in mid-air reads as a card standing on the paving.
   *
   * There is no grade to retain across the opening: the ground west of the wall
   * is level with the carriageway from z = -9 to -13, so the way through is
   * simply a gap, not a flight of steps. */
  {
    const mat = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
    const capMat = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
    const GAP = [-12.9, -10.7];
    for (const [z0, z1] of [[-19.0, GAP[0]], [GAP[1], -9.0]]) {
      const zc = (z0 + z1) / 2;
      const len = z1 - z0;
      const h = 1.1;
      const x = centerX(zc) - (ROAD_HALF + WALK_W + 0.3);
      const m = box(0.4, h, len, mat, x, groundY(zc) + h / 2 - 0.2, zc);
      m.castShadow = m.receiveShadow = true;
      ctx.add(m);
      ctx.add(box(0.56, 0.12, len, capMat, x, groundY(zc) + h - 0.14, zc));
      ctx.collide(x - 0.3, z0, x + 0.3, z1, groundY(zc) + h);
      // the pier on the end that faces the opening
      const pz = z1 === GAP[0] ? z1 - 0.24 : z0 + 0.24;
      const p = box(0.62, h + 0.24, 0.48, mat, x, groundY(pz) + (h + 0.24) / 2 - 0.2, pz);
      p.castShadow = p.receiveShadow = true;
      ctx.add(p);
      ctx.add(box(0.74, 0.1, 0.6, capMat, x, groundY(pz) + h + 0.02, pz));
      ctx.collide(x - 0.36, pz - 0.28, x + 0.36, pz + 0.28, groundY(pz) + h + 0.14);
    }
  }

  /* ------------------------- lineside strip, near side -------------------------
   * With the frontage held back there is an open corridor between the street
   * and the railway fence.  It gets a footpath, an allotment and a shed --
   * everything low enough to keep the sight line down the track clear.      */
  {
    const pathMat = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
    const path = box(26.0, 0.07, 1.15, pathMat, -17.5, 0.035, 4.35);
    path.receiveShadow = true;
    ctx.add(path);
    for (let i = 0; i < 9; i++) {
      ctx.add(box(0.06, 0.09, 1.15, cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 }),
        -5.0 - i * 3.0, 0.04, 4.35));
    }
    // tool shed against the fence
    const shed = new THREE.Group();
    const shedWall = cel({ color: 0xd9d3c4, bands: 3, tint: 0x6f6790 });
    const shedRoof = cel({ color: PAL.roofTeal, bands: 3, tint: 0x514b70 });
    shed.add(box(2.6, 2.05, 2.0, shedWall, 0, 1.02, 0));
    shed.add(box(2.9, 0.12, 2.3, shedRoof, 0, 2.12, 0));
    shed.add(box(0.06, 1.55, 0.9, cel({ color: 0x8a6f5c, bands: 3, tint: 0x5c5680 }), 1.31, 0.8, 0.3));
    shed.add(box(2.62, 0.09, 0.09, cel({ color: PAL.metal, bands: 3 }), 0, 2.02, 1.02));
    /* The shed used to sit at z = 5.35, which put its footprint straight over
     * the footpath -- fine when the path went nowhere, fatal now that it is the
     * only route west to the shrine.  Moved back against the fence line. */
    shed.position.set(-11.9, 0, 7.0);
    shed.rotation.y = -0.06;
    shed.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    ctx.add(shed);
    ctx.collide(-13.3, 5.95, -10.5, 8.05, 2.1);
  }

  /* ------------------------------ cherry trees ------------------------------ */
  const sakuraSpots = [
    // The trees that frame the opening shot.  The third one stands just behind
    // the camera: it never appears in frame, but its cast shadow rakes across
    // the foreground asphalt, which is what stops the road reading as flat.
    // 0.7 m further back than it was: at z = 5.1 its trunk left only 0.66 m
    // between itself and the lineside fence, and that gap is the whole route
    // west to the shrine.  At 9 m from the opening camera the move is invisible.
    { x: -7.1, z: 5.8, scale: 1.22, seed: 101, lean: 0.13, leanDir: 1.9, keep: true },
    { x: 6.3, z: 2.5, scale: 1.06, seed: 102, lean: 0.1, leanDir: 4.4, keep: true },
    { x: -5.9, z: 17.9, scale: 1.16, seed: 128, lean: 0.14, leanDir: 1.6, keep: true },
    { x: -5.6, z: 25.4, scale: 1.04, seed: 129, lean: 0.1, leanDir: 2.1 },
    // lineside, near side -- the train comes out from behind these
    { x: -12.5, z: 3.9, scale: 1.0, seed: 103, lean: 0.08 },
    { x: -19.0, z: 3.9, scale: 1.12, seed: 104, lean: 0.1 },
    { x: -26.5, z: 4.0, scale: 0.95, seed: 105, lean: 0.06 },
    { x: -34.0, z: 3.9, scale: 1.08, seed: 106, lean: 0.09 },
    { x: 13.5, z: 3.9, scale: 1.05, seed: 107, lean: 0.07 },
    { x: 20.5, z: 4.0, scale: 0.98, seed: 108, lean: 0.1 },
    { x: 28.0, z: 3.9, scale: 1.14, seed: 109, lean: 0.05 },
    /* Slid 3.5 m west along the row.  At 36 it stood five metres off the end of
     * the overbridge deck, and a deck 7.2 m up is *inside* the canopy line, so
     * one tree there closed the whole view west down the track -- the platform,
     * the crossing and the train with it.  Same reason the school forecourt
     * skips the gate axis: a continuous row of blossom is wonderful until you
     * need to see past it. */
    { x: 32.5, z: 4.0, scale: 1.0, seed: 110, lean: 0.09 },
    // lineside, far side
    { x: -11.0, z: -4.6, scale: 1.04, seed: 111, lean: 0.08 },
    { x: -18.5, z: -4.6, scale: 0.96, seed: 112, lean: 0.1 },
    { x: 11.5, z: -4.7, scale: 1.1, seed: 113, lean: 0.07 },
    { x: 18.5, z: -7.4, scale: 1.02, seed: 114, lean: 0.06 },
    { x: 26.5, z: -7.8, scale: 1.16, seed: 115, lean: 0.09 },
    // moved off the deck's sight line, and out of the far stair's footprint
    { x: 30.0, z: -6.9, scale: 0.98, seed: 116, lean: 0.05 },
    // gardens
    { x: -13.5, z: 15.5, scale: 1.1, seed: 117, lean: 0.11 },
    /* Moved out from (12.5, 23.0), which was *inside* the house at (10.2, 20.4)
     * and had been since the day both went in -- invisible, and the only reason
     * it surfaced is that narrowing that house for the back alley left the trunk
     * standing in the middle of the new passage.  On the street verge in the gap
     * between two front gardens, where it does some work. */
    { x: 5.9, z: 25.0, scale: 1.05, seed: 118, lean: 0.08 },
    { x: -14.0, z: 30.0, scale: 1.0, seed: 119, lean: 0.07 },
    { x: -12.0, z: -14.5, scale: 1.08, seed: 120, lean: 0.1 },
    { x: 15.0, z: -20.0, scale: 1.03, seed: 121, lean: 0.06 },
    // distance
    { x: -44.0, z: 4.5, scale: 1.2, seed: 122, lean: 0.08 },
    { x: 46.0, z: 4.2, scale: 1.15, seed: 123, lean: 0.06 },
    /* Slid 1.6 m north, onto the lineside verge.  ひばり台一丁目 runs its back
     * lane along z = -7.4 (spans -8.9 to -5.9) and this trunk stood in the
     * middle of the carriageway -- a cherry growing out of the asphalt, and a
     * collider across the only route west.  From every view of it, which is
     * from the crossing forty metres away, the move is invisible. */
    { x: -42.0, z: -4.9, scale: 1.1, seed: 124, lean: 0.09 },
    // moved out from x = 44 to clear the overbridge's far stair, which runs
    // east along z = -6.6 from the head landing
    { x: 51.0, z: -9.0, scale: 1.18, seed: 125, lean: 0.07 },
    { x: -52.0, z: 6.0, scale: 1.25, seed: 126, lean: 0.05 },
    { x: 54.0, z: 5.5, scale: 1.22, seed: 127, lean: 0.08 },
  ]
    .map((s) => ({ ...s, y: groundY(s.z) }))
    .concat(extraSakura);
  planting.sakuraBefore = sakuraSpots.length;
  const sakuraKept = thinSpots(sakuraSpots, TREE_KEEP, 7);
  planting.sakuraAfter = sakuraKept.length;
  buildSakura(ctx, sakuraKept);

  /* -------------------------------- shrubbery -------------------------------- */
  const shrubSpots = [
    { x: -6.4, z: 6.6, r: 0.5, count: 4, spread: 1.2, seed: 201, y: groundY(6.6) },
    { x: -5.7, z: 12.4, r: 0.45, count: 3, spread: 1.0, seed: 202, y: groundY(12.4) },
    { x: -15.5, z: 4.6, r: 0.5, count: 4, spread: 1.6, seed: 211, y: 0 },
    { x: -21.5, z: 4.5, r: 0.5, count: 4, spread: 1.6, seed: 212, y: 0 },
    { x: 5.6, z: 15.6, r: 0.5, count: 4, spread: 1.4, seed: 203, y: groundY(15.6) },
    { x: 5.4, z: 31.5, r: 0.48, count: 3, spread: 1.2, seed: 204, y: groundY(31.5) },
    { x: -5.4, z: -13.4, r: 0.55, count: 5, spread: 1.6, seed: 205, y: groundY(-13.4) },
    { x: 6.6, z: -6.0, r: 0.5, count: 4, spread: 1.4, seed: 206, y: groundY(-6.0) },
    { x: 16.5, z: -9.5, r: 0.6, count: 5, spread: 2.0, seed: 207, y: 0 },
    { x: 30.0, z: -9.0, r: 0.6, count: 5, spread: 2.2, seed: 208, y: 0 },
    { x: -16.0, z: 6.0, r: 0.55, count: 4, spread: 1.8, seed: 209, y: 0 },
    { x: 24.0, z: 6.5, r: 0.55, count: 4, spread: 1.8, seed: 210, y: 0 },
  ].concat(extraShrubs);
  planting.shrubsBefore = shrubSpots.length;
  const shrubKept = thinSpots(shrubSpots, SHRUB_KEEP, 19);
  planting.shrubsAfter = shrubKept.length;
  buildShrubs(ctx, shrubKept);

  /* ------------------------------ utility poles ------------------------------ */
  const poleDefs = [
    { x: -3.86, z: 4.55, h: 9.4, seed: 301, lamp: true, armDir: 1 },
    { x: -4.35, z: 14.2, h: 9.0, seed: 302, armDir: 1, baseSink: 0.02 },
    { x: -4.85, z: 24.6, h: 9.2, seed: 303, lamp: true, armDir: 1 },
    { x: -6.6, z: 35.0, h: 8.8, seed: 304, armDir: 1, baseSink: 0.04 },
    { x: 3.98, z: -6.6, h: 9.2, seed: 305, lamp: true, armDir: -1 },
    { x: 6.35, z: -16.5, h: 9.0, seed: 306, armDir: -1 },
    /* Moved north over the canal from (8.1, -26.5), where it stood on the
     * channel coping -- fine while the channel stopped at x = -12, absurd once
     * it runs past the street.  `approach.js` anchors its own cable chain to
     * this pole by hand, so the two have to be changed together. */
    { x: 8.4, z: -31.6, h: 8.8, seed: 307, lamp: true, armDir: -1 },
    { x: 4.35, z: 20.8, h: 9.0, seed: 308, armDir: -1 },
    { x: 4.5, z: 34.0, h: 8.6, seed: 309, lamp: true, armDir: -1 },
    { x: 12.5, z: 3.7, h: 8.4, seed: 310, armDir: -1, transformer: false },
    { x: -16.5, z: -4.4, h: 8.6, seed: 311, armDir: 1, transformer: false },
  ];
  const poles = poleDefs.map((d) => {
    const y = groundY(d.z)
      + (Math.abs(d.x - centerX(d.z)) < ROAD_HALF + WALK_W ? WALK_H : 0)
      - (d.baseSink ?? 0);
    const p = makePole({ ...d, y });
    ctx.add(p);
    ctx.collide(d.x - 0.22, d.z - 0.22, d.x + 0.22, d.z + 0.22, y + d.h);
    return { ...d, y, top: y + d.h };
  });
  const P = {};
  poles.forEach((p, i) => { P[i] = p; });

  /* ---------------------------- overhead cabling ---------------------------- */
  {
    const at = (i, dy = 0, dz = 0) => new THREE.Vector3(poles[i].x, poles[i].top - 0.6 + dy, poles[i].z + dz);
    const runs = [];
    const chain = (idx, offsets) => {
      for (const [dy, dz] of offsets) {
        runs.push({ points: idx.map((i) => at(i, dy, dz)), sag: 0.55 });
      }
    };
    // left-hand street chain, three cables at slightly different heights
    chain([0, 1, 2, 3], [[0, -0.7], [-0.42, 0], [-0.86, 0.7]]);
    // right-hand chain beyond the crossing
    chain([4, 5, 6], [[0, -0.7], [-0.42, 0], [-0.86, 0.7]]);
    // near-side right chain
    chain([7, 8], [[0, -0.6], [-0.45, 0.6]]);
    // cables striding over the railway and across the road
    chain([0, 4], [[-0.15, 0.2], [-0.62, -0.3]]);
    chain([1, 7], [[-0.2, 0.3], [-0.7, -0.4]]);
    chain([2, 7], [[-1.3, 0.9]]);
    chain([9, 4], [[-1.0, 0.2]]);
    chain([10, 1], [[-1.1, 0.4]]);

    // service drops into the buildings
    const drops = [
      [0, new THREE.Vector3(-11.0, 2.35, 5.3)],
      [1, new THREE.Vector3(-6.0, groundY(23.2) + 5.4, 21.0)],
      [7, new THREE.Vector3(5.9, groundY(18.4) + 5.0, 17.0)],
      [4, new THREE.Vector3(5.6, groundY(-10.5) + 5.2, -9.0)],
      [2, new THREE.Vector3(-6.6, groundY(33.5) + 3.4, 32.0)],
    ];
    for (const [i, target] of drops) {
      runs.push({ points: [at(i, -1.9), target], sag: 0.25, r: 0.022 });
    }
    makeWires(ctx, runs);
  }

  /* ------------------------- the crossing corner cluster ------------------------- */
  const walkY = (z) => groundY(z) + WALK_H;

  // convex mirror watching the crossing
  ctx.add(makeMirror({ x: -3.62, z: 3.72, y: walkY(3.72), ry: 2.5 }));

  // shrine tucked under the big tree
  ctx.add(makeShrine({ ctx, x: -5.45, z: 6.7, y: walkY(6.7), ry: 1.15 }));

  // post box on the shop side
  ctx.add(makePostBox({ x: 3.62, z: 4.55, y: walkY(4.55), ry: -1.4 }));
  ctx.collide(3.3, 4.25, 3.95, 4.85, walkY(4.55) + 1.3);

  // cones and a barrier where the kerb is broken up
  ctx.add(makeBarrier({ ctx, x: 2.62, z: 6.2, y: groundY(6.2), ry: 0.06, len: 1.7 }));

  // The kei truck parks beyond the crossing, on the left-hand kerb.  Close to
  // the camera it masked the railway; from there it instead fills the far side
  // of the tracks with a warm accent and gives the street scale.
  const truck = makeKeiTruck({ x: -2.02, z: -7.4, y: groundY(-7.4), ry: Math.PI / 2 });
  ctx.add(truck);
  ctx.collide(-3.0, -9.2, -1.05, -5.6, groundY(-7.4) + 1.9, groundY(-7.4) + 0.16, true);

  /* Bicycles, planters, crates and the cat used to dress the kerb. They
   * closed the gaps a quad flies. The wall stays: it is a line. */
  ctx.add(makeWall({ x: -5.05, z: 8.9, len: 3.4, axis: 'z', h: 0.62, fence: false, y: groundY(8.9) }));
  ctx.collide(-5.3, 7.2, -4.8, 10.6, groundY(8.9) + 0.7);

  // a rubbish net against the kerb: a real volume, not an ornament
  ctx.add(makeBins({ x: -4.65, z: 15.0, y: walkY(15.0) - 0.02, ry: -Math.PI / 2 }));

  // guardrails
  ctx.add(makeGuardrail({ ctx, x: 4.5, z: 15.4, y: walkY(15.4), ry: Math.PI / 2, len: 4.2 }));
  /* The run at z = -25 is gone: that is こばと橋 now, and a bridge's parapet is
   * its guardrail.  Two of them side by side on a nine-metre deck read as a
   * fenced-off carriageway rather than as a crossing. */
  ctx.add(makeGuardrail({ ctx, x: centerX(-16.4) - ROAD_HALF - 0.25, z: -16.4, y: groundY(-16.4), ry: Math.PI / 2, len: 6.2 }));

  /* The cat, the planters and the kerb bikes are gone. The wall is the line. */

  /* --------------------------------- petals ---------------------------------
   * 980 cards drifting down the street corridor, three instanced draws, and a
   * sideways shove every time the train goes past.  `world.update` drives it
   * from the fixed step count (see src/maps/city/animation.js), not from frame
   * time, and nothing in it is solid.  The graphics preset decides whether it
   * is shown; see src/maps/city/index.js. */
  const petals = buildPetals(ctx);

  /* No outer boundary any more -- the world has no edge to fall off. */

  /* ------------------------------------------------------------------ *
   * Crossing sequence.
   *
   * The train never stops now -- it circles the planet forever -- so the
   * gates are driven by where it actually is on the ring rather than by a
   * timer. One lap is one crossing cycle, for free.
   * ------------------------------------------------------------------ */
  const APPROACH = 165;   // metres of track before the crossing that trips the bells
  const CLEAR = 62;       // metres past it before the booms lift again
  const seq = { blink: 0, armT: 0 };

  // the relay box now fetches the train instead of scheduling one
  crossing.request = () => { train.x = wrapX(-(APPROACH - 12) * train.dir); };

  /* Two colliders that only exist while the booms are down, so the player is
   * held back at the barrier instead of standing inside a passing train. */
  const boomBlocks = [1, -1].map((sz) => {
    const c = {
      x0: centerX(0) - ROAD_HALF - 0.6, x1: centerX(0) + ROAD_HALF + 0.6,
      z0: sz * GATE_Z - 0.16, z1: sz * GATE_Z + 0.16, top: -1,
    };
    colliders.push(c);
    return c;
  });

  function updateSequence(dt) {
    seq.blink = (seq.blink + dt * 1.6) % 1;

    // how much track is still between the train and the crossing
    const ahead = -train.offset * train.dir;
    const closing = ahead < APPROACH && ahead > -CLEAR;

    const rate = dt / (closing ? 3.4 : 3.0);
    seq.armT = Math.max(0, Math.min(1, seq.armT + (closing ? rate : -rate)));
    crossing.setArms(seq.armT);
    crossing.setLamps(closing || seq.armT > 0.02, seq.blink);

    const down = seq.armT > 0.55 ? 1.25 : -1;
    boomBlocks[0].top = down;
    boomBlocks[1].top = down;
  }

  /* ------------------------- project onto the planet -------------------------
   * Runs last, once every builder has finished. Everything above this line is
   * still authored on a flat plane and has no idea the planet exists.       */
  const bakeStats = bake ? bakeToPlanet(root, { maxEdge: 4.0 }) : null;
  if (bake) train.planetize();

  /* ------------------------------- world api ------------------------------- */
  const world = {
    root,
    colliders,
    /* Exposed so the hills' safety check can see the *paved* half of "built
     * ground": a collider list is only the things standing up, and a pad, a lane
     * or an apron has no collider at all. */
    platforms,
    cuts,
    interactables,
    train,
    crossing,
    shop,
    petals,
    planting,
    planet,
    bakeStats,
    // the world wraps in x, so only latitude is bounded (short of the poles)
    bounds: { z0: -CIRCUMFERENCE * 0.24, z1: CIRCUMFERENCE * 0.24 },
    /**
     * Ground height at a flat point.
     *
     * `fromY` is the height the query is being made *from* -- the player's
     * current feet -- and it is what makes it possible to walk underneath
     * something you can also walk on top of.  Without it this returns the max
     * over every platform covering the point, so an overbridge deck 7 m up
     * teleports anybody who walks beneath it straight onto the deck, and the
     * only way to stop that is to wall the undercroft off. With it, a platform
     * is only eligible if it is within a step of where you already are, so the
     * bridge is climbable one tread at a time and walk-through underneath.
     *
     * Omit `fromY` and you get the old max-over-everything answer, which is
     * what the builders want when they are seating props on the ground.
     */
    heightAt(x, z, fromY) {
      /* Relief is suppressed across the district and the rail corridor, so
       * adding it here is a no-op where the built geometry is -- and `RELIEF` is
       * 0, so it is a no-op everywhere.  `hillAt` is the live one: it is exactly
       * zero over every square metre of built ground (checked by `hillSafety`)
       * and it is what makes the back hills walkable without a single platform,
       * which is the only way a slope can be walkable at all here. */
      let h = streetHeight(x, z) + reliefAt(x, z) + hillAt(x, z);
      /* Cuts first, then platforms: the excavated bank is lowered to the made
       * level and the path slab laid on it then raises it the 60 mm it is
       * actually thick. */
      for (const c of cuts) {
        if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) h = Math.min(h, c.top);
      }
      const reach = fromY === undefined ? Infinity : fromY + 0.55;
      for (const p of platforms) {
        if (p.top > reach) continue;
        if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) h = Math.max(h, p.top);
      }
      return h;
    },
    get sequenceState() { return seq.state; },
    update(dt) {
      updateSequence(dt);
      train.update(dt);
      for (const fn of updaters) fn(dt);
      petals.update(dt, train.gust, train.dir);
    },
  };
  return world;
}
