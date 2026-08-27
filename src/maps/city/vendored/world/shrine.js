import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { shrineName, emaTex, omikujiTex, sanpaiNotice, alleyPlate } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, lane, steps, wallRun, dapple, groundMats } from './ground.js';
import { makeBroom, makeBucket, makeSignPost, makeBench, makePetBowl } from './props.js';

/* ------------------------------------------------------------------ *
 * 桜守神社 -- the community shrine.
 *
 * The brief for this place is tone, not size: it has to be quieter than the
 * street, and it has to be reached rather than arrived at.  Three things do
 * that work:
 *
 *  - You get in through a 2 m alley between two houses' side walls, off the
 *    lineside footpath.  You cannot see the shrine until you are in it.
 *  - The precinct is on a terrace 2.1 m up a flight of stone steps, so the
 *    street noise is literally below you and the retaining wall closes off
 *    every sight line back out.
 *  - The planting is deep green and bamboo rather than blossom, with dappled
 *    ground shade.  Blossom is the street's material; the shrine borrows only
 *    a drift of fallen petals on the stone.
 *
 * Deliberately not spooky and not a ruin: swept steps, fresh water in the
 * basin, a full ema rack, a broom left against the hall.  Somebody looks
 * after this.
 * ------------------------------------------------------------------ */

const LANE_X = -27.9;          // the alley between the two houses
const AXIS_X = -27.9;          // the precinct's north-south axis
const STEP_Z0 = 20.5;          // foot of the steps
const N_STEPS = 11;
const RISE = 0.19;
const RUN = 0.46;
const TOP = RISE * N_STEPS;    // 2.09 m above grade
/* The terrace must overlap the top tread, not merely meet it: the height
 * query takes the max over platform boxes, so a gap of even a few
 * centimetres between them is a hole the player falls through. */
const TER = { x0: -36.0, x1: -20.0, z0: 25.4, z1: 40.0 };

const M = {};
function mats() {
  if (M.torii) return M;
  M.torii = cel({ color: PAL.torii, bands: 3, tint: 0x7a4060 });
  M.toriiDeep = cel({ color: PAL.toriiDeep, bands: 3, tint: 0x7a4060 });
  M.wood = cel({ color: PAL.shrineWood, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: PAL.shrineWoodDark, bands: 3, tint: 0x554e74 });
  M.roof = cel({ color: PAL.shrineRoof, bands: 3, tint: 0x4a4468 });
  M.stone = cel({ color: PAL.stone, bands: 3, tint: 0x655d80 });
  M.stoneDark = cel({ color: PAL.stoneDark, bands: 3, tint: 0x605878 });
  M.stoneWarm = cel({ color: PAL.stoneWarm, bands: 3, tint: 0x655d80 });
  M.rope = cel({ color: PAL.rope, bands: 3, tint: 0x8a7f9c });
  M.paper = cel({ color: 0xfbf8f0, bands: 2, side: THREE.DoubleSide, tint: 0x8e86ad });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.bronze = cel({ color: 0x8f7448, bands: 3, tint: 0x6a5a80 });
  M.water = flat({ color: PAL.water, transparent: true, opacity: 0.78, cache: false });
  return M;
}

export function buildShrine(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(2903);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const bamboo = [];
  const petals = [];

  /* ------------------------------ the approach ------------------------------ *
   * A gravel alley up between two houses, then a small clearing.  It is
   * deliberately mean: 2.9 m of stone with walls on both sides. */
  lane(ctx, {
    axis: 'z', at: LANE_X, from: 4.0, to: 19.6, w: 2.9,
    mat: gm.stone, kerb: false, rise: 0.04, platform: false, name: 'shrineLane',
  });
  pad(ctx, { x: AXIS_X, z: 18.0, w: 6.4, d: 4.6, y: groundY(18), mat: gm.stone, name: 'shrineForecourt' });
  // low wall down the alley's east side, closing it off from the gardens
  wallRun(ctx, { axis: 'z', at: LANE_X + 1.75, from: 6.0, to: 17.0, y: 0, h: 1.15, t: 0.22, panel: 3.4 });
  wallRun(ctx, { axis: 'z', at: LANE_X - 1.75, from: 6.0, to: 14.0, y: 0, h: 1.05, t: 0.22, panel: 3.4 });

  // stone marker at the mouth of the alley, where it meets the lineside path
  {
    /* `alleyPlate` is a 512 x 128 街区表示板 -- a wide enamel street plate with
     * 「さくら通り」 running across it.  It was mapped onto a face of this post,
     * which is 0.24 m wide and 1.5 m tall, so a 4:1 landscape image was being
     * squeezed into a 1:6 portrait face: a 25-fold horizontal crush that came
     * out as an unreadable vertical smear.  Nothing showed it, because the
     * face it was on points up the alley, away from everybody who arrives.
     *
     * So the post goes back to being plain stone and the plate becomes what it
     * was drawn as: a small board bolted to it, at its own aspect, on the two
     * sides the approach actually sees -- east, because you come along the
     * lineside footpath from the crossing, and south, because that is the side
     * the footpath runs on. */
    const post = box(0.24, 1.5, 0.24, m.stone, 0, 0.75, 0);
    post.castShadow = post.receiveShadow = true;
    /* On the west jamb of the alley mouth, hard against the neighbouring
     * house's corner.  On the east jamb it sat on the inside of the turn you
     * make coming along the footpath, which is the one place an obstacle is
     * actually in the way. */
    post.position.set(LANE_X - 1.85, 0.75, 5.4);
    ctx.add(post);
    ctx.add(box(0.3, 0.07, 0.3, m.stoneWarm, LANE_X - 1.85, 1.53, 5.4));
    hullOutline(post, { thickness: 0.0032 });
    ctx.collide(LANE_X - 2.0, 5.2, LANE_X - 1.7, 5.6, 1.5);

    /* A plane facing +z carries its map the right way round, so rotating one
     * into place needs no mirrored clone -- unlike a box face, where opposite
     * sides share their UV winding. */
    for (const [ry, dx, dz] of [[Math.PI / 2, 0.13, 0], [Math.PI, 0, -0.13]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.115),
        flat({ color: 0xffffff, map: alleyPlate(), cache: false }));
      p.position.set(LANE_X - 1.85 + dx, 1.16, 5.4 + dz);
      p.rotation.y = ry;
      p.userData.noOutline = true;
      ctx.add(p);
    }
  }

  /* -------------------------------- the torii -------------------------------- */
  buildTorii(ctx, { x: AXIS_X, z: 19.9, y: groundY(19.9), w: 3.5, h: 3.4, seed: 1 });
  buildTorii(ctx, { x: AXIS_X, z: TER.z0 + 1.5, y: TOP, w: 2.7, h: 2.7, seed: 2, plain: true });

  /* -------------------------------- the steps -------------------------------- */
  {
    const st = steps(ctx, {
      x: AXIS_X, z: STEP_Z0, axis: 'z', dir: 1, n: N_STEPS,
      rise: RISE, run: RUN, w: 3.4, y: 0, mat: gm.stone, lipMat: gm.stoneDark,
    });
    // stone cheeks either side, and a pipe handrail up the west cheek
    for (const s of [-1, 1]) {
      const parts = [];
      for (let i = 0; i < N_STEPS; i++) {
        parts.push({
          geometry: new THREE.BoxGeometry(0.3, RISE * (i + 1) + 0.22, RUN),
          matrix: trs(AXIS_X + s * 1.85, (RISE * (i + 1) + 0.22) / 2, STEP_Z0 + RUN * (i + 0.5)),
        });
      }
      const cheek = new THREE.Mesh(bake(parts), gm.stoneDark);
      cheek.castShadow = cheek.receiveShadow = true;
      ctx.add(cheek);
      ctx.collide(AXIS_X + s * 1.85 - 0.2, STEP_Z0, AXIS_X + s * 1.85 + 0.2, STEP_Z0 + RUN * N_STEPS, TOP + (s < 0 ? 0.95 : 0.3));
    }
    {
      const L = RUN * N_STEPS;
      const rail = cyl(0.032, 0.032, Math.hypot(L, TOP) + 0.3, 7, m.metalDark,
        AXIS_X - 1.85, TOP / 2 + 0.95, STEP_Z0 + L / 2);
      rail.rotation.set(Math.PI / 2 - Math.atan2(TOP, L), 0, 0);
      rail.castShadow = true;
      ctx.add(rail);
      for (let i = 0; i <= 3; i++) {
        const t = i / 3;
        ctx.add(cyl(0.03, 0.03, 0.95, 6, m.metalDark, AXIS_X - 1.85, RISE * N_STEPS * t + 0.47, STEP_Z0 + L * t));
      }
    }
    st.group.name = 'shrineSteps';
  }

  /* ------------------------------ the terrace ------------------------------ */
  pad(ctx, {
    x: (TER.x0 + TER.x1) / 2, z: (TER.z0 + TER.z1) / 2,
    w: TER.x1 - TER.x0, d: TER.z1 - TER.z0, y: TOP - 0.07, h: 0.07,
    mat: gm.stoneWarm, name: 'shrineTerrace',
  });
  {
    /* Retaining wall with a low parapet.  The parapet matters mechanically:
     * a collider is skipped when its top is within a step of the player's
     * feet, so a wall flush with the terrace would let you stroll off a
     * two-metre drop. */
    const H = 2.9;
    const y = TOP + 0.5 - H;
    const runs = [
      { axis: 'x', at: TER.z0, from: TER.x0, to: AXIS_X - 2.1 },
      { axis: 'x', at: TER.z0, from: AXIS_X + 2.1, to: TER.x1 },
      { axis: 'z', at: TER.x0, from: TER.z0, to: TER.z1 },
      { axis: 'z', at: TER.x1, from: TER.z0, to: TER.z1 },
      /* The north wall is broken for the 裏参道 -- the back gate at x = -22.5
       * that the onsen street's steps come down to.  The precinct only ever
       * had one way in and out, and a shrine with a back gate onto the lane
       * behind it is the ordinary case, not the exception. */
      { axis: 'x', at: TER.z1, from: TER.x0, to: -23.8 },
      { axis: 'x', at: TER.z1, from: -21.2, to: TER.x1 },
    ];
    for (const r of runs) {
      wallRun(ctx, { ...r, y, h: H, t: 0.34, panel: 3.6, mat: gm.stoneDark, capMat: gm.stone });
    }
  }

  /* --------------------------------- 社殿 --------------------------------- */
  buildHaiden(ctx, { x: AXIS_X, z: 36.2, y: TOP });

  /* -------------------------------- 手水舎 -------------------------------- */
  buildTemizuya(ctx, { x: -33.2, z: 29.4, y: TOP });

  /* ---------------------------- lanterns and foxes ---------------------------- */
  for (const [zc, sc] of [[19.4, 1.0], [TER.z0 + 2.6, 0.95], [33.0, 1.05]]) {
    for (const s of [-1, 1]) {
      const yy = zc < STEP_Z0 ? groundY(zc) : TOP;
      stoneLantern(ctx, { x: AXIS_X + s * 2.55, z: zc, y: yy, scale: sc, seed: 30 + zc });
    }
  }
  /* The foxes stand 2.9 m out, not 2.0.
   *
   * At 2.0 they closed the hall's frontage: fox, offertory box, fox left two
   * thirteen-centimetre gaps, and the player was stopped three metres short of
   * the steps by a line they could not see. */
  for (const s of [-1, 1]) {
    foxStatue(ctx, { x: AXIS_X + s * 2.9, z: 33.6, y: TOP, ry: s > 0 ? -0.4 : 0.4 });
  }

  /* ------------------------------- 絵馬掛け ------------------------------- */
  emaRack(ctx, { x: -22.6, z: 31.6, y: TOP, ry: -Math.PI / 2, len: 3.2, seed: 7 });
  omikujiStand(ctx, { x: -23.2, z: 28.0, y: TOP, ry: -Math.PI / 2 + 0.2 });

  /* --------------------------- notices and small kit --------------------------- */
  ctx.add(makeSignPost({
    x: AXIS_X + 2.9, z: 19.0, y: groundY(19), ry: 0.5, h: 1.9, postMat: m.woodDark,
    plates: [{ map: sanpaiNotice(), w: 0.5, h: 0.66, y: 1.4 }],
  }));
  ctx.add(makeBroom({ x: -30.4, z: 34.6, y: TOP, ry: 0.6, tilt: 0.2, roll: 0.14 }));
  ctx.add(makeBucket({ x: -30.9, z: 35.1, y: TOP, water: true }));
  ctx.add(makeBucket({ x: -31.4, z: 34.5, y: TOP, ry: 0.7, color: 0xa8b0bc }));
  ctx.add(makeBench({ x: -34.4, z: 34.6, y: TOP, ry: Math.PI / 2, len: 1.6, wood: 0xb09272 }));
  ctx.add(makePetBowl({ x: -34.6, z: 32.4, y: TOP, ry: 0.4 }));

  /* --------------------------------- planting --------------------------------- *
   * Deep green and bamboo, not blossom: the shrine has to feel cooler and
   * darker than the street it is fifteen metres from. */
  /* Where the tall trees stand is a *lighting* decision, not a planting one.
   * The sun comes from -x/+z, so anything big on the terrace's south-west
   * side throws its shadow straight across the precinct -- the first pass put
   * the 御神木 there and dropped the whole shrine into permanent dusk.  The
   * big canopies now sit north and east of the hall and outside the wall,
   * where their shadows fall away from the terrace, and only the alley below
   * is deliberately kept in deep shade.
   *
   * 御神木 first: the tallest thing here by a long way, on the axis behind
   * the hall, with its own rope round the trunk further down. */
  const GOSHIN = { x: -20.8, z: 43.2 };
  grove.push({ ...GOSHIN, y: groundY(GOSHIN.z), scale: 2.5, seed: 801, spread: 1.35, lean: 0.05, leanDir: 2.0, keep: true });
  /* A backing wood behind the hall, every trunk *outside* the north wall.
   * A grove tree at this scale carries a canopy ten metres across, so one
   * standing on the terrace covers half of it -- which is how the precinct
   * ended up with no sunlight on it at all on the first pass. */
  grove.push({ x: -26.6, z: 45.8, y: groundY(45.8), scale: 1.9, seed: 802, spread: 1.2 });
  grove.push({ x: -31.4, z: 42.6, y: groundY(42.6), scale: 1.6, seed: 803, spread: 1.15 });
  grove.push({ x: -36.6, z: 42.0, y: groundY(42.0), scale: 1.45, seed: 804, spread: 1.1 });
  grove.push({ x: -39.6, z: 46.6, y: groundY(46.6), scale: 1.8, seed: 806, spread: 1.2 });
  // outside the east wall, screening the houses beyond
  grove.push({ x: -17.2, z: 34.8, y: groundY(34.8), scale: 1.7, seed: 807, spread: 1.15 });
  grove.push({ x: -16.8, z: 27.6, y: groundY(27.6), scale: 1.5, seed: 808, spread: 1.1 });
  // over the alley, where deep shade is exactly what is wanted
  grove.push({ x: -23.6, z: 21.2, y: groundY(21.2), scale: 1.6, seed: 809, spread: 1.15 });
  grove.push({ x: -32.6, z: 16.8, y: groundY(16.8), scale: 1.6, seed: 810, spread: 1.15 });
  grove.push({ x: -40.8, z: 22.4, y: groundY(22.4), scale: 1.8, seed: 811, spread: 1.2 });

  // bamboo casts almost nothing, so it can stand anywhere the composition wants
  bamboo.push({ x: -35.2, z: 32.6, y: TOP, n: 13, spread: 1.5, scale: 1.15, seed: 821 });
  bamboo.push({ x: -21.0, z: 35.4, y: TOP, n: 11, spread: 1.3, scale: 1.05, seed: 822 });
  bamboo.push({ x: -24.8, z: 24.4, y: groundY(24.4), n: 9, spread: 1.2, scale: 1.0, seed: 823 });
  bamboo.push({ x: -31.6, z: 21.0, y: groundY(21), n: 10, spread: 1.4, scale: 1.1, seed: 824 });
  bamboo.push({ x: -34.4, z: 27.4, y: TOP, n: 8, spread: 1.1, scale: 1.0, seed: 825 });

  // one cherry, leaning in over the terrace wall: the shrine's name earns it
  sakura.push({ x: -19.2, z: 30.0, y: groundY(30), scale: 1.5, seed: 815, lean: 0.16, leanDir: 4.7, keep: true });
  sakura.push({ x: -37.6, z: 19.6, y: groundY(19.6), scale: 1.25, seed: 816, lean: 0.12, leanDir: 1.8 });

  for (let i = 0; i < 6; i++) {
    shrubs.push({
      x: TER.x0 + 1.4 + (i % 2) * 13.2, z: 27.4 + Math.floor(i / 2) * 4.4, y: TOP,
      r: 0.55, count: 4, spread: 1.5, seed: 840 + i,
    });
  }
  shrubs.push({ x: LANE_X + 2.4, z: 15.6, y: 0, r: 0.5, count: 3, spread: 1.2, seed: 850 });
  shrubs.push({ x: LANE_X - 2.4, z: 16.6, y: 0, r: 0.5, count: 3, spread: 1.2, seed: 851 });

  /* The rope round the 御神木.  A tree only becomes a sacred tree when
   * somebody has tied a rope round it, so this one detail is what turns the
   * biggest trunk on the site into the reason the shrine is here. */
  {
    const tx = GOSHIN.x, tz = GOSHIN.z, ty = groundY(tz) + 1.7;
    const ring = new THREE.Group();
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.095, 6, 18), m.rope);
    rope.rotation.x = Math.PI / 2;
    rope.castShadow = true;
    ring.add(rope);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const strip = new THREE.Group();
      for (let k = 0; k < 5; k++) {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.075), m.paper);
        q.position.set((k % 2 ? 0.022 : -0.022), -0.04 - k * 0.062, 0);
        q.rotation.y = (k % 2 ? 0.6 : -0.6);
        strip.add(q);
      }
      strip.position.set(Math.cos(a) * 0.6, -0.1, Math.sin(a) * 0.6);
      strip.rotation.y = -a;
      ring.add(strip);
    }
    ring.position.set(tx, ty, tz);
    ctx.add(ring);
  }

  /* ------------------------- petals and dappled light ------------------------- */
  petals.push({ x: AXIS_X, z: 22.6, w: 3.6, d: 5.0, y: TOP * 0.5, n: 60 });
  petals.push({ x: (TER.x0 + TER.x1) / 2, z: 29.0, w: 15.0, d: 6.0, y: TOP, n: 150 });
  petals.push({ x: (TER.x0 + TER.x1) / 2, z: 36.0, w: 15.0, d: 6.0, y: TOP, n: 120 });
  petals.push({ x: AXIS_X, z: 17.0, w: 6.0, d: 4.0, y: 0, n: 60 });

  for (const [dx, dz, r] of [
    [-33.0, 33.0, 2.2], [-24.0, 34.4, 2.0], [-30.0, 27.6, 1.8],
    [-35.0, 37.0, 2.4], [-22.0, 29.0, 1.6],
  ]) {
    dapple(ctx, { x: dx, z: dz, y: TOP, r, spread: 2.4, n: 8, rng, opacity: 0.14 });
  }
  dapple(ctx, { x: AXIS_X, z: 16.4, y: 0, r: 1.9, spread: 2.6, n: 7, rng, opacity: 0.13 });

  return { sakura, shrubs, grove, bamboo, petals };
}

/* ------------------------------------------------------------------ *
 * 鳥居.
 *
 * The one silhouette that has to be exactly right, because it is the whole
 * signpost for the place.  The 笠木 -- the top lintel -- is the tell: it is
 * not a straight beam, it sweeps up at both ends.  Three segments at slight
 * angles read as that sweep and cost nothing.
 * ------------------------------------------------------------------ */

function buildTorii(ctx, o) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'torii';
  const W = o.w ?? 3.4;
  const H = o.h ?? 3.3;
  const pr = 0.15 * (W / 3.4);
  const red = o.plain ? m.toriiDeep : m.torii;
  const yBase = o.y ?? 0;
  /* Posts, nuki and lintel are separate meshes. Baked together, the red
   * parts become one AABB the size of the whole gate: a wall across the
   * opening. The cover pass then treats that AABB as solid fill. */
  const posts = { red: [], stone: [] };
  const nuki = [];
  const lintel = { red: [], deep: [] };
  const push = (bag, k, geo, mx) => bag[k].push({ geometry: geo, matrix: mx });

  // pillars, leaning very slightly inward the way a real torii does
  for (const s of [-1, 1]) {
    push(posts, 'red', new THREE.CylinderGeometry(pr * 0.9, pr, H, 10), trs(s * W / 2, H / 2, 0, 0, 0, s * 0.018));
    push(posts, 'stone', new THREE.CylinderGeometry(pr * 1.5, pr * 1.7, 0.24, 10), trs(s * W / 2, 0.12, 0));
  }
  // 貫 -- the lower tie beam, passing through the pillars
  nuki.push({ geometry: new THREE.BoxGeometry(W + 0.5, 0.15, pr * 1.5), matrix: trs(0, H * 0.72, 0) });
  // 島木 -- the flat beam under the sweeping lintel
  push(lintel, 'deep', new THREE.BoxGeometry(W + 1.0, 0.19, pr * 2.1), trs(0, H - 0.16, 0));
  // 笠木 -- three segments, the outer two tipped up
  push(lintel, 'red', new THREE.BoxGeometry(W * 0.6, 0.2, pr * 2.5), trs(0, H + 0.04, 0));
  for (const s of [-1, 1]) {
    const seg = (W + 1.15 - W * 0.6) / 2;
    push(lintel, 'red', new THREE.BoxGeometry(seg, 0.2, pr * 2.5),
      trs(s * (W * 0.3 + seg / 2), H + 0.04 + seg * 0.09, 0, 0, 0, -s * 0.19));
  }
  // 額束 -- the block between the two beams
  push(lintel, 'red', new THREE.BoxGeometry(0.28, H * 0.24, pr * 1.7), trs(0, H * 0.85, 0));

  const addBake = (parts, mat) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(bake(parts), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    hullOutline(mesh, { thickness: 0.0036 });
  };
  addBake(posts.red, red);
  addBake(posts.stone, m.stoneDark);
  addBake(nuki, m.toriiDeep);
  addBake(lintel.deep, m.toriiDeep);
  addBake(lintel.red, red);

  // 注連縄 with paper streamers, on the outer torii only
  if (!o.plain) {
    shimenawa(g, { y: H * 0.62, w: W - 0.3, z: pr * 1.6, thick: 0.09, n: 4 });
  }

  g.position.set(o.x, yBase, o.z);
  g.rotation.y = o.ry ?? 0;
  ctx.add(g);
  for (const s of [-1, 1]) {
    ctx.collide(o.x + s * W / 2 - pr * 1.5, o.z - pr * 1.5, o.x + s * W / 2 + pr * 1.5, o.z + pr * 1.5, yBase + H);
  }
  /* Nuki and lintel are the line: under the 貫, not through a wall.
   * skipFit so a 4 m beam is not grown to the baked envelope. */
  const nukiHalf = (W + 0.5) / 2;
  const nukiD = pr * 1.5 / 2;
  const nukiY = yBase + H * 0.72;
  ctx.collide(o.x - nukiHalf, o.z - nukiD, o.x + nukiHalf, o.z + nukiD, nukiY + 0.075, nukiY - 0.075, true);
  const lintelHalf = (W + 1.15) / 2;
  const lintelD = pr * 2.5 / 2;
  const lintelY0 = yBase + H - 0.16 - 0.095;
  const lintelY1 = yBase + H + 0.14;
  ctx.collide(o.x - lintelHalf, o.z - lintelD, o.x + lintelHalf, o.z + lintelD, lintelY1, lintelY0, true);
  return g;
}

/** Rice-straw rope with folded paper streamers. */
function shimenawa(parent, o) {
  const m = mats();
  const w = o.w;
  const t = o.thick ?? 0.1;
  // the rope: a slightly sagging tube, thicker in the middle
  const pts = [];
  const seg = 8;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    pts.push(new THREE.Vector3(-w / 2 + w * u, o.y - Math.sin(Math.PI * u) * 0.12, o.z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, t, 6, false), m.rope);
  rope.castShadow = true;
  parent.add(rope);
  // bound tufts
  for (let i = 0; i < 3; i++) {
    const u = 0.25 + i * 0.25;
    parent.add(cyl(t * 1.35, t * 1.35, t * 0.7, 8,
      cel({ color: 0xdfd2b4, bands: 2, tint: 0x8a7f9c }),
      -w / 2 + w * u, o.y - Math.sin(Math.PI * u) * 0.12, o.z).rotateZ(Math.PI / 2));
  }
  /* 紙垂 -- the folded paper streamers.  Narrow and closely stacked: wide
   * quads read as a column of grey postage stamps rather than a zigzag of
   * folded paper. */
  const n = o.n ?? 4;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const px = -w / 2 + w * u;
    const py = o.y - Math.sin(Math.PI * u) * 0.12 - t;
    const strip = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.075), m.paper);
      q.position.set((k % 2 ? 0.022 : -0.022), -0.04 - k * 0.062, 0);
      q.rotation.y = (k % 2 ? 0.6 : -0.6);
      strip.add(q);
    }
    strip.position.set(px, py, o.z);
    parent.add(strip);
  }
}

/* ------------------------------------------------------------------ *
 * 社殿 -- the hall.  Small: this is a neighbourhood shrine, not a
 * complex.  What makes it read is the roof: a deep, heavy, upswept mass
 * sitting on a thin band of dark timber.
 * ------------------------------------------------------------------ */

function buildHaiden(ctx, o) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'haiden';
  const W = 5.4, D = 4.4;
  const PH = 0.66;              // plinth
  const WH = 2.5;               // wall height
  const parts = { wood: [], woodDark: [], roof: [], stone: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* raised stone plinth, with three steps up to it on the approach side */
  push('stone', new THREE.BoxGeometry(W + 0.9, PH, D + 0.9), trs(0, PH / 2, 0));
  push('stone', new THREE.BoxGeometry(W + 1.1, 0.1, D + 1.1), trs(0, PH + 0.05, 0));
  for (let i = 0; i < 3; i++) {
    const h = PH * ((3 - i) / 3);
    push('stone', new THREE.BoxGeometry(2.6, h, 0.34), trs(0, h / 2, (D + 0.9) / 2 + 0.17 + i * 0.34));
  }

  /* timber frame: corner pillars and a boarded wall, open across the front */
  const yb = PH + 0.1;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      push('woodDark', new THREE.CylinderGeometry(0.15, 0.16, WH, 8), trs(sx * (W / 2 - 0.15), yb + WH / 2, sz * (D / 2 - 0.15)));
    }
    push('woodDark', new THREE.CylinderGeometry(0.13, 0.14, WH, 8), trs(sx * 0.95, yb + WH / 2, D / 2 - 0.15));
  }
  push('wood', new THREE.BoxGeometry(W - 0.2, WH, 0.16), trs(0, yb + WH / 2, -(D / 2 - 0.1)));
  for (const sx of [-1, 1]) {
    push('wood', new THREE.BoxGeometry(0.16, WH, D - 0.2), trs(sx * (W / 2 - 0.1), yb + WH / 2, 0));
  }
  // head and sill beams across the front, leaving the middle bay open
  push('woodDark', new THREE.BoxGeometry(W, 0.22, 0.2), trs(0, yb + WH - 0.11, D / 2 - 0.14));
  push('woodDark', new THREE.BoxGeometry(W, 0.16, 0.24), trs(0, yb + 0.08, D / 2 - 0.14));
  for (const sx of [-1, 1]) {
    // latticed side panels of the frontage
    push('wood', new THREE.BoxGeometry(1.3, WH - 0.4, 0.1), trs(sx * 1.85, yb + WH / 2, D / 2 - 0.14));
    for (let i = 0; i < 7; i++) {
      push('woodDark', new THREE.BoxGeometry(0.05, WH - 0.5, 0.05), trs(sx * 1.85 - 0.55 + i * 0.18, yb + WH / 2, D / 2 - 0.07));
    }
  }
  // the dark recess behind the open middle bay
  {
    const back = box(1.9, WH - 0.4, 0.08, cel({ color: 0x4c4656, bands: 2, tint: 0x453f5c }), 0, yb + WH / 2 - 0.1, D / 2 - 0.7);
    g.add(back);
    // a mirror on a stand, the only thing you can make out inside
    const mir = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 16),
      cel({ color: 0xb8b0a0, bands: 2, tint: 0x7d74a0 }));
    mir.rotation.x = Math.PI / 2;
    mir.position.set(0, yb + 1.35, D / 2 - 0.62);
    g.add(mir);
    g.add(box(0.1, 0.5, 0.1, m.woodDark, 0, yb + 0.95, D / 2 - 0.62));
  }

  /* the roof: two heavy slabs, upswept eaves, and the ridge ornaments */
  {
    const eave = 1.15;
    const rw = W + eave * 2;
    const rd = D + eave * 2;
    const rh = 1.55;
    const slope = Math.atan2(rh, rw / 2);
    const slab = Math.hypot(rw / 2, rh) + 0.1;
    const yr = yb + WH;
    // bracket band under the eaves -- what gives the roof its visual weight
    push('woodDark', new THREE.BoxGeometry(W + 0.7, 0.26, D + 0.7), trs(0, yr + 0.13, 0));
    const rafters = [];
    for (let i = 0; i < 13; i++) {
      rafters.push({
        geometry: new THREE.BoxGeometry(0.08, 0.14, rd - 0.4),
        matrix: trs(-rw / 2 + 0.4 + (i * (rw - 0.8)) / 12, yr + 0.34, 0),
      });
    }
    const rm = new THREE.Mesh(bake(rafters), m.woodDark);
    g.add(rm);

    for (const s of [-1, 1]) {
      push('roof', new THREE.BoxGeometry(slab, 0.3, rd), trs(s * (rw / 4), yr + 0.4 + rh / 2, 0, 0, 0, -s * slope));
      // upswept tip: a short second slab at a shallower pitch
      push('roof', new THREE.BoxGeometry(0.8, 0.26, rd),
        trs(s * (rw / 2 + 0.24), yr + 0.4 + 0.06, 0, 0, 0, -s * (slope - 0.34)));
    }
    push('roof', new THREE.BoxGeometry(0.5, 0.34, rd + 0.2), trs(0, yr + 0.4 + rh + 0.1, 0));
    // 鰹木 -- the billets along the ridge
    for (let i = 0; i < 4; i++) {
      push('woodDark', new THREE.CylinderGeometry(0.11, 0.11, 0.62, 8),
        trs(0, yr + 0.4 + rh + 0.34, -rd / 2 + 1.2 + i * ((rd - 2.4) / 3), 0, 0, Math.PI / 2));
    }
    // 千木 -- the crossed finials at each gable end
    for (const s of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const f = box(0.11, 1.5, 0.11, m.woodDark, sx * 0.34, yr + 0.4 + rh + 0.5, s * (rd / 2 - 0.3));
        f.rotation.z = sx * 0.28;
        f.castShadow = true;
        g.add(f);
      }
    }
    // gable infill
    const tri = new THREE.Shape();
    tri.moveTo(-rw / 2 + 0.3, 0);
    tri.lineTo(rw / 2 - 0.3, 0);
    tri.lineTo(0, rh * 0.88);
    tri.closePath();
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.14, bevelEnabled: false });
    triGeo.translate(0, 0, -0.07);
    for (const s of [-1, 1]) {
      push('wood', triGeo, trs(0, yr + 0.4, s * (rd / 2 - 0.07)));
    }
    triGeo.dispose();
  }

  /* 注連縄 across the open bay, the bell rope, and the offertory box */
  shimenawa(g, { y: yb + WH - 0.34, w: W - 1.0, z: D / 2 + 0.06, thick: 0.11, n: 5 });
  {
    // 鈴 -- the bell and its plaited cord
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 9), m.bronze);
    bell.position.set(0, yb + WH - 0.78, D / 2 + 0.04);
    bell.castShadow = true;
    g.add(bell);
    g.add(cyl(0.03, 0.03, 0.4, 5, m.metalDark, 0, yb + WH - 0.52, D / 2 + 0.04));
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6),
      cel({ color: 0xc8503c, bands: 3, tint: 0x7a4060 }));
    cord.position.set(0, yb + WH - 1.7, D / 2 + 0.04);
    cord.castShadow = true;
    g.add(cord);
    for (let i = 0; i < 3; i++) {
      g.add(cyl(0.07, 0.07, 0.05, 8, cel({ color: 0xe0e0e0, bands: 2, tint: 0x8a7f9c }), 0, yb + WH - 1.1 - i * 0.5, D / 2 + 0.04));
    }
  }
  {
    // 賽銭箱 -- slatted top, and the coin-dark slot behind it
    const bx = 0, bz = D / 2 + 1.15;
    const bw = 1.7, bd = 0.66, bh = 0.66;
    const body = box(bw, bh, bd, m.woodDark, bx, 0.33, bz);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    hullOutline(body, { thickness: 0.0034 });
    g.add(box(bw + 0.12, 0.07, bd + 0.12, m.wood, bx, bh + 0.03, bz));
    g.add(box(bw - 0.2, 0.06, bd - 0.2, cel({ color: 0x3c3746, bands: 2, tint: 0x453f5c }), bx, bh + 0.02, bz));
    const slats = [];
    const ns = Math.round((bw - 0.2) / 0.12);
    for (let i = 0; i < ns; i++) {
      slats.push({
        geometry: new THREE.BoxGeometry(0.05, 0.1, bd - 0.16),
        matrix: trs(bx - (bw - 0.25) / 2 + i * ((bw - 0.25) / (ns - 1)), bh + 0.04, bz),
      });
    }
    const sm = new THREE.Mesh(bake(slats), m.wood);
    sm.castShadow = true;
    g.add(sm);
    // the group is turned through pi below, so the box ends up at o.z - bz
    ctx.collide(o.x - bw / 2, o.z - bz - bd / 2, o.x + bw / 2, o.z - bz + bd / 2, (o.y ?? 0) + bh);
  }

  /* name board hung under the eaves */
  {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.9, 0.09),
      [m.wood, m.wood, m.wood, m.wood,
       flat({ color: 0xffffff, map: shrineName(), cache: false }), m.wood]
    );
    board.position.set(-2.05, yb + WH + 0.5, D / 2 + 0.3);
    board.castShadow = true;
    g.add(board);
    hullOutline(board, { thickness: 0.003 });
  }

  const matFor = { wood: m.wood, woodDark: m.woodDark, roof: m.roof, stone: m.stone };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'roof' || key === 'wood') hullOutline(mesh, { thickness: 0.0034 });
  }

  /* Authored facing +Z like every other building in the project, then turned
   * to face the steps.  The offertory box's collider is the only thing that
   * has to know: it sits out in front, so its z offset flips with the group. */
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = Math.PI;
  ctx.add(g);
  /* Plinth, boarded sides, back wall and the roof. The front middle bay
   * is the opening: a box round the hall is a wall across it. skipFit
   * on the plinth so the timber walls cannot roof-lift a solid through
   * the mouth. Local +Z is the front, then the group turns PI, so world
   * XZ is flipped. */
  const y0 = o.y ?? 0;
  const loc = (lx0, lz0, lx1, lz1, top, bot, skip) => {
    ctx.collide(o.x - lx1, o.z - lz1, o.x - lx0, o.z - lz0, top, bot, skip === true);
  };
  loc(-(W + 0.9) / 2, -(D + 0.9) / 2, (W + 0.9) / 2, (D + 0.9) / 2, y0 + PH, undefined, true);
  const wallT = 0.2;
  loc(-W / 2, -D / 2, W / 2, -D / 2 + wallT, y0 + yb + WH, y0 + yb, true);
  loc(-W / 2, -D / 2, -W / 2 + wallT, D / 2, y0 + yb + WH, y0 + yb, true);
  loc(W / 2 - wallT, -D / 2, W / 2, D / 2, y0 + yb + WH, y0 + yb, true);
  loc(-(W + 1.2) / 2, -(D + 1.2) / 2, (W + 1.2) / 2, (D + 1.2) / 2, y0 + yb + WH + 2.0, y0 + yb + WH - 0.06, true);
  return g;
}

/* ------------------------------------------------------------------ *
 * 手水舎 -- the ablution pavilion.  Four posts, a hipped roof, a stone
 * trough with water in it and three ladles on a rail.  The water is what
 * makes the shrine feel maintained rather than abandoned.
 * ------------------------------------------------------------------ */

function buildTemizuya(ctx, o) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'temizuya';
  const W = 2.7, D = 2.2, PH = 2.35;

  const parts = { wood: [], roof: [], stone: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  push('stone', new THREE.BoxGeometry(W + 0.6, 0.16, D + 0.6), trs(0, 0.08, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      push('wood', new THREE.CylinderGeometry(0.11, 0.12, PH, 8), trs(sx * (W / 2), 0.16 + PH / 2, sz * (D / 2)));
      push('stone', new THREE.CylinderGeometry(0.17, 0.19, 0.18, 8), trs(sx * (W / 2), 0.16 + 0.09, sz * (D / 2)));
    }
  }
  for (const sx of [-1, 1]) {
    push('wood', new THREE.BoxGeometry(0.13, 0.16, D + 0.2), trs(sx * (W / 2), 0.16 + PH - 0.08, 0));
  }
  push('wood', new THREE.BoxGeometry(W + 0.3, 0.15, 0.13), trs(0, 0.16 + PH - 0.08, 0));

  // hipped roof: an axis-aligned pyramid, plus a boxed eave band
  {
    const yr = 0.16 + PH;
    push('wood', new THREE.BoxGeometry(W + 0.9, 0.2, D + 0.9), trs(0, yr + 0.1, 0));
    const pyr = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    pyr.rotateY(Math.PI / 4);
    push('roof', pyr, trs(0, yr + 0.2 + 0.55, 0, 0, 0, 0, W + 1.3, 1.1, D + 1.3));
    push('roof', new THREE.BoxGeometry(W + 1.3, 0.18, D + 1.3), trs(0, yr + 0.24, 0));
    pyr.dispose();
    push('wood', new THREE.CylinderGeometry(0.09, 0.09, 0.34, 8), trs(0, yr + 1.42, 0));
  }

  // the trough, its water, the bamboo spout and the ladles
  {
    const tw = 1.6, td = 0.9, th = 0.62;
    push('stone', new THREE.BoxGeometry(tw, th, td), trs(0, 0.16 + th / 2, 0));
    push('stone', new THREE.BoxGeometry(tw + 0.14, 0.09, td + 0.14), trs(0, 0.16 + th, 0));
    const inner = box(tw - 0.26, 0.1, td - 0.26, cel({ color: 0x8f8a9c, bands: 2, tint: 0x605878 }), 0, 0.16 + th - 0.06, 0);
    g.add(inner);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(tw - 0.28, td - 0.28), m.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.16 + th - 0.02, 0);
    water.userData.noOutline = true;
    g.add(water);
    // one flat highlight on the surface
    const hi = new THREE.Mesh(new THREE.PlaneGeometry((tw - 0.28) * 0.4, (td - 0.28) * 0.3),
      flat({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, cache: false }));
    hi.rotation.x = -Math.PI / 2;
    hi.rotation.z = 0.4;
    hi.position.set(-0.24, 0.16 + th + 0.001, -0.1);
    hi.userData.noOutline = true;
    g.add(hi);

    // bamboo spout
    const spout = cyl(0.045, 0.045, 0.7, 7, cel({ color: PAL.bamboo, bands: 3, tint: 0x5b6f8c }), 0, 0.16 + th + 0.42, -0.34);
    spout.rotation.x = 1.3;
    g.add(spout);
    g.add(cyl(0.05, 0.05, 0.5, 7, cel({ color: PAL.bambooDeep, bands: 3, tint: 0x5b6f8c }), 0, 0.16 + th + 0.3, -0.5));

    /* Ladle rail with three ladles, bowl-down the way they are left -- **and the
     * rail stands on two uprights.**  It was a bare cylinder at 0.30 m above the
     * trough's coping with nothing under it, so the rail, all three handles and
     * all three bowls hung in mid-air over the water: the one thing in this world
     * a visitor asked about before the crows. */
    const bam = cel({ color: PAL.bamboo, bands: 3, tint: 0x5b6f8c });
    for (const s of [-1, 1]) {
      g.add(cyl(0.026, 0.028, 0.30, 6, bam, s * (tw / 2 - 0.14), 0.16 + th + 0.19, 0.06));
    }
    g.add(cyl(0.028, 0.028, tw - 0.1, 6, bam, 0, 0.16 + th + 0.3, 0.06).rotateZ(Math.PI / 2));
    for (let i = 0; i < 3; i++) {
      const lx = -0.48 + i * 0.48;
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        cel({ color: 0xb08f62, bands: 3, tint: 0x6f6790 }));
      bowl.position.set(lx, 0.16 + th + 0.28, -0.14);
      g.add(bowl);
      const handle = cyl(0.017, 0.017, 0.4, 5, cel({ color: PAL.bamboo, bands: 3, tint: 0x5b6f8c }), lx, 0.16 + th + 0.3, 0.1);
      handle.rotation.x = Math.PI / 2;
      g.add(handle);
    }
  }

  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]),
      { wood: m.wood, roof: m.roof, stone: m.stone }[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'roof') hullOutline(mesh, { thickness: 0.0034 });
  }

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  ctx.add(g);
  const y0 = o.y ?? 0;
  ctx.collide(o.x - (W + 0.6) / 2, o.z - (D + 0.6) / 2, o.x + (W + 0.6) / 2, o.z + (D + 0.6) / 2,
    y0 + 0.16, y0, true);
  ctx.collide(o.x - 0.85, o.z - 0.50, o.x + 0.85, o.z + 0.50, y0 + 0.87, y0 + 0.16, true);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = o.x + sx * (W / 2), pz = o.z + sz * (D / 2);
      ctx.collide(px - 0.12, pz - 0.12, px + 0.12, pz + 0.12, y0 + 0.16 + PH, y0 + 0.16, true);
    }
  }
  ctx.collide(o.x - (W + 1.0) / 2, o.z - (D + 1.0) / 2, o.x + (W + 1.0) / 2, o.z + (D + 1.0) / 2,
    y0 + 0.16 + PH + 1.3, y0 + 0.16 + PH, true);
  return g;
}

/* ------------------------------------------------------------------ *
 * 石灯籠 -- stone lantern.  Six parts and a hollow fire box; the dark
 * openings are what stop it reading as a stack of pale blocks.
 * ------------------------------------------------------------------ */

function stoneLantern(ctx, o) {
  const m = mats();
  const g = new THREE.Group();
  const S = o.scale ?? 1;
  const parts = [];
  const push = (geo, mx) => parts.push({ geometry: geo, matrix: mx });

  push(new THREE.CylinderGeometry(0.34 * S, 0.4 * S, 0.2 * S, 8), trs(0, 0.1 * S, 0));
  push(new THREE.CylinderGeometry(0.15 * S, 0.19 * S, 0.9 * S, 8), trs(0, 0.65 * S, 0));
  push(new THREE.CylinderGeometry(0.3 * S, 0.22 * S, 0.14 * S, 8), trs(0, 1.17 * S, 0));
  // fire box: four corner posts, so the light gets through it
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    push(new THREE.BoxGeometry(0.1 * S, 0.42 * S, 0.1 * S),
      trs(Math.cos(a) * 0.2 * S, 1.45 * S, Math.sin(a) * 0.2 * S, 0, -a, 0));
  }
  push(new THREE.CylinderGeometry(0.3 * S, 0.3 * S, 0.07 * S, 8), trs(0, 1.69 * S, 0));
  // roof: a squat eight-sided cone with a finial
  push(new THREE.ConeGeometry(0.42 * S, 0.34 * S, 8), trs(0, 1.89 * S, 0));
  push(new THREE.SphereGeometry(0.09 * S, 8, 6), trs(0, 2.1 * S, 0));

  const mesh = new THREE.Mesh(bake(parts), m.stone);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  hullOutline(mesh, { thickness: 0.0034 });
  // the dark interior of the fire box
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * S, 0.16 * S, 0.4 * S, 8),
    cel({ color: 0x4a4454, bands: 2, tint: 0x453f5c }));
  core.position.y = 1.45 * S;
  g.add(core);

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  ctx.add(g);
  ctx.collide(o.x - 0.38 * S, o.z - 0.38 * S, o.x + 0.38 * S, o.z + 0.38 * S, (o.y ?? 0) + 2.1 * S);
  return g;
}

/* ------------------------------------------------------------------ *
 * 狐 -- a seated stone fox.  Stylised hard: a wedge body, a pointed
 * muzzle, two triangular ears and a raised tail.  The red bib is what
 * makes it unmistakable at a distance.
 * ------------------------------------------------------------------ */

function foxStatue(ctx, o) {
  const m = mats();
  const g = new THREE.Group();
  const stone = m.stone;
  // plinth
  g.add(box(0.56, 0.62, 0.46, m.stoneDark, 0, 0.31, 0));
  g.add(box(0.64, 0.07, 0.54, m.stone, 0, 0.65, 0));

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, 0.5, 8), stone);
  body.position.set(0, 0.93, 0);
  body.castShadow = true;
  g.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 7), stone);
  chest.scale.set(1, 0.9, 1.1);
  chest.position.set(0, 0.86, 0.11);
  g.add(chest);
  // head and muzzle
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), stone);
  head.scale.set(1, 0.95, 1.05);
  head.position.set(0, 1.26, 0.03);
  head.castShadow = true;
  g.add(head);
  const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), stone);
  muzzle.rotation.x = Math.PI / 2 + 0.12;
  muzzle.position.set(0, 1.22, 0.17);
  g.add(muzzle);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 4), stone);
    ear.position.set(s * 0.07, 1.4, -0.01);
    ear.rotation.z = s * 0.16;
    g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 5), m.stoneDark);
    eye.position.set(s * 0.05, 1.28, 0.11);
    g.add(eye);
    // front legs
    g.add(cyl(0.035, 0.042, 0.34, 6, stone, s * 0.075, 0.86, 0.15));
  }
  // raised, curled tail
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 5, 12, Math.PI * 1.1), stone);
  tail.rotation.set(Math.PI / 2, 0, -0.5);
  tail.position.set(0, 1.06, -0.2);
  tail.castShadow = true;
  g.add(tail);
  // red bib
  const bib = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.2),
    cel({ color: PAL.shrineBib, bands: 2, side: THREE.DoubleSide, tint: 0x7a4060 }));
  bib.position.set(0, 1.06, 0.15);
  bib.rotation.x = 0.2;
  g.add(bib);
  g.add(box(0.2, 0.03, 0.03, cel({ color: PAL.redDeep, bands: 2, tint: 0x7a4060 }), 0, 1.16, 0.1));

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  ctx.add(g);
  ctx.collide(o.x - 0.34, o.z - 0.3, o.x + 0.34, o.z + 0.3, (o.y ?? 0) + 1.4);
  return g;
}

/* ------------------------------------------------------------------ *
 * 絵馬掛け -- the ema rack.  Rows of small wooden plaques, instanced.
 * The wishes are the only writing in the shrine that is about a person,
 * and they are still only writing.
 * ------------------------------------------------------------------ */

function emaRack(ctx, o) {
  const m = mats();
  const rng = rngKit(o.seed ?? 9);
  const g = new THREE.Group();
  g.name = 'openFrame';
  const len = o.len ?? 3.0;
  const H = 1.85;

  const frame = [];
  for (const s of [-1, 1]) {
    frame.push({ geometry: new THREE.BoxGeometry(0.13, H, 0.13), matrix: trs((s * len) / 2, H / 2, 0) });
    frame.push({ geometry: new THREE.BoxGeometry(0.2, 0.16, 0.5), matrix: trs((s * len) / 2, 0.08, 0) });
  }
  for (const y of [H - 0.08, H * 0.55]) {
    frame.push({ geometry: new THREE.BoxGeometry(len + 0.3, 0.1, 0.12), matrix: trs(0, y, 0) });
  }
  // a shallow rain hood over the top rail
  frame.push({ geometry: new THREE.BoxGeometry(len + 0.5, 0.08, 0.6), matrix: trs(0, H + 0.12, 0.06) });
  const fm = new THREE.Mesh(bake(frame), m.woodDark);
  fm.castShadow = fm.receiveShadow = true;
  g.add(fm);
  hullOutline(fm, { thickness: 0.0032 });

  /* the plaques: five variants of wish text, hung in two rows */
  const plaqueGeo = bake([
    { geometry: new THREE.BoxGeometry(0.2, 0.15, 0.02), matrix: trs(0, 0, 0) },
    { geometry: new THREE.ConeGeometry(0.115, 0.07, 3), matrix: trs(0, 0.105, 0, 0, Math.PI / 6, 0) },
  ]);
  for (let v = 0; v < 5; v++) {
    const list = [];
    const d = new THREE.Object3D();
    const n = Math.floor((len - 0.4) / 0.24);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < n; i++) {
        if (i % 5 !== v) continue;
        if (rng.chance(0.12)) continue;      // a few gaps, so it is not a grid
        d.position.set(
          -(len - 0.4) / 2 + i * 0.24 + rng.range(-0.015, 0.015),
          (row ? H - 0.24 : H * 0.55 - 0.24) + rng.range(-0.01, 0.01),
          0.06
        );
        d.rotation.set(0, rng.range(-0.14, 0.14), rng.range(-0.06, 0.06));
        d.updateMatrix();
        list.push(d.matrix.clone());
      }
    }
    if (!list.length) continue;
    const inst = new THREE.InstancedMesh(
      plaqueGeo,
      cel({ color: 0xffffff, bands: 2, map: emaTex(v), tint: 0x8a7f9c, cache: false }),
      list.length
    );
    list.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.castShadow = true;
    g.add(inst);
  }

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  ctx.add(g);
  const y = o.y ?? 0;
  const ry = o.ry ?? 0;
  const ca = Math.cos(ry);
  const sa = Math.sin(ry);
  const put = (lx, lz, hw, hd, top, bot) => {
    const px = o.x + ca * lx - sa * lz;
    const pz = o.z + sa * lx + ca * lz;
    const hx = Math.abs(ca) * hw + Math.abs(sa) * hd;
    const hz = Math.abs(sa) * hw + Math.abs(ca) * hd;
    ctx.collide(px - hx, pz - hz, px + hx, pz + hz, y + top, y + bot, true);
  };
  for (const s of [-1, 1]) {
    put((s * len) / 2, 0, 0.08, 0.08, H, 0.16);
    put((s * len) / 2, 0, 0.12, 0.26, 0.16, 0);
  }
  /* Two height-only screens: each rail plus the plaques that hang from it.
   * The bay under the lower row and the gap between rows stay air. skipFit
   * so the hood cannot grow a wall through that mouth. */
  put(0, 0.06, len / 2 + 0.15, 0.05, H - 0.02, H - 0.32);
  put(0, 0.06, len / 2 + 0.15, 0.05, H * 0.55 + 0.06, H * 0.55 - 0.32);
  put(0, 0.06, len / 2 + 0.25, 0.32, H + 0.16, H + 0.08);
  return g;
}

/** おみくじ -- the fortune drawer, and the wire the drawn slips get tied to. */
function omikujiStand(ctx, o) {
  const m = mats();
  const rng = rngKit(15);
  const g = new THREE.Group();
  g.name = 'openFrame';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.72, 0.42),
    [m.wood, m.wood, m.wood, m.wood,
     flat({ color: 0xffffff, map: omikujiTex(), cache: false }), m.wood]
  );
  body.position.set(0, 1.0, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  hullOutline(body, { thickness: 0.0032 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.07, 0.64, 0.07, m.woodDark, sx * 0.24, 0.32, sz * 0.16));
    }
  }
  g.add(box(0.62, 0.06, 0.48, m.woodDark, 0, 1.39, 0));
  // the hexagonal draw box on top
  const draw = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.3, 6),
    cel({ color: 0xb5322f, bands: 3, tint: 0x7a4060 }));
  draw.position.set(0, 1.57, 0);
  draw.castShadow = true;
  g.add(draw);

  // the wire rack, and the tied paper slips on it
  const rack = new THREE.Group();
  for (const s of [-1, 1]) {
    rack.add(cyl(0.03, 0.03, 1.4, 6, m.metalDark, s * 0.9, 0.7, 0));
  }
  rack.add(cyl(0.02, 0.02, 1.85, 5, m.metal, 0, 1.34, 0).rotateZ(Math.PI / 2));
  rack.add(cyl(0.02, 0.02, 1.85, 5, m.metal, 0, 0.98, 0).rotateZ(Math.PI / 2));
  const slip = new THREE.PlaneGeometry(0.035, 0.2);
  const list = [];
  const d = new THREE.Object3D();
  for (let i = 0; i < 34; i++) {
    d.position.set(-0.84 + (i % 17) * 0.1, (i < 17 ? 1.24 : 0.88), rng.range(-0.01, 0.01));
    d.rotation.set(0, rng.range(-0.3, 0.3), rng.range(-0.12, 0.12));
    d.updateMatrix();
    list.push(d.matrix.clone());
  }
  const inst = new THREE.InstancedMesh(slip,
    flat({ color: 0xfbf8f0, side: THREE.DoubleSide, cache: false }), list.length);
  list.forEach((mx, k) => inst.setMatrixAt(k, mx));
  inst.userData.noOutline = true;
  rack.add(inst);
  rack.position.set(0, 0, 0.85);
  g.add(rack);

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  ctx.add(g);
  ctx.collide(o.x - 0.4, o.z - 0.4, o.x + 0.4, o.z + 0.4, (o.y ?? 0) + 1.6, o.y ?? 0, true);
  return g;
}
