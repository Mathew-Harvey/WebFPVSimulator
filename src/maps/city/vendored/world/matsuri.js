import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  matsuriBanner, matsuriBoard, matsuriFlag, stallSign, setupPlate,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit, sagCurve } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, laneLine, steps, groundMats } from './ground.js';
import { makePaperLantern } from './shops.js';
import {
  makeBench, makeCrates, makeCone, makeSignPost, makeLoosePaper, makeBucket,
  makeRecycleBox, makePlanter, makeBroom,
} from './props.js';

/* ------------------------------------------------------------------ *
 * 夏まつり準備中 -- the festival ground, two days out.
 *
 * The open ground west of the shrine forecourt, which until now was flat pad
 * nobody had a reason to walk onto.  It is the one place in the world that is
 * *about to happen*, and getting that across without a single person in it is
 * the whole exercise.  Four rules came out of trying:
 *
 *  - **Nothing is trading.**  Every stall is up and empty: no goods on the
 *    counters, no water in the tank, the prize rack bare, two canopies still
 *    rolled.  A stall with stock on it reads as a stall somebody just stepped
 *    away from, which is a person; a stall that is *not finished* reads as work
 *    in progress, which is a whole afternoon of story.
 *  - **The temporary things are the story.**  Cable snaking across the ground to
 *    a distribution box, a rope on stakes, cones, chalked-out pitch lines, a
 *    programme board with times on it.  Those say "somebody organised this" far
 *    more loudly than decoration does.
 *  - **The lanterns and flags are hung but the lanterns are not lit.**  They are
 *    the daytime decoration and the dusk lighting at once, which is exactly the
 *    double duty the brief asks for -- and unlit paper against a warm sky is
 *    already beautiful without a single neon surface.
 *  - **The trees were here first.**  Three of the shrine's outer wood stand in
 *    this clearing -- a cherry in the middle and two green canopies on the
 *    south-west and north-east corners -- and the layout goes round them rather
 *    than clearing them.  Half the lantern runs hang off them, which is what a
 *    real ground does.
 * ------------------------------------------------------------------ */

/* the clearing */
const X0 = -45.0;
const X1 = -31.4;
const Z0 = 13.8;
const Z1 = 25.0;
const CX = (X0 + X1) / 2;
const CZ = (Z0 + Z1) / 2;

/* the three trees already standing in it (`shrine.js`) -- keep clear of these */
const TREES = [{ x: -40.8, z: 22.4 }, { x: -37.6, z: 19.6 }, { x: -32.6, z: 16.8 }];

const M = {};
function mats() {
  if (M.metal) return M;
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.dark = cel({ color: PAL.blackSoft, bands: 2, tint: 0x4b4560 });
  M.wood = cel({ color: 0xb09a76, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: 0x8a6f52, bands: 3, tint: 0x554e74 });
  M.cream = cel({ color: 0xefe6d2, bands: 3, tint: 0x6f6790 });
  M.red = cel({ color: PAL.redDeep, bands: 3, tint: 0x7a4060 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.tarp = cel({ color: 0xdcd4c0, bands: 3, side: THREE.DoubleSide, tint: 0x6f6790 });
  return M;
}

export function buildMatsuri(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(9401);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];
  const Y = groundY(CZ);            // flat, and 0 across this whole clearing

  /* --------------------------------- the ground --------------------------------- *
   * Rolled dirt with a gravel apron at the entrance, and the pitch lines chalked
   * on it.  The lines are what make it read as a *ground* rather than as a field:
   * somebody came out with a tape measure and marked where the stalls go. */
  pad(ctx, { x: CX, z: CZ, w: X1 - X0, d: Z1 - Z0, y: Y, h: 0.06, mat: gm.dirt, name: 'matsuriGround' });
  pad(ctx, { x: X1 - 1.6, z: 18.0, w: 3.2, d: 4.6, y: Y + 0.005, h: 0.06, mat: gm.gravel, name: 'matsuriApron' });
  for (const z of [15.9, 23.1]) {
    laneLine(ctx, { axis: 'x', at: z, from: X0 + 1.4, to: X1 - 2.4, y: Y + 0.07, dash: 0.9 });
  }
  laneLine(ctx, { axis: 'z', at: X0 + 1.2, from: Z0 + 1.4, to: Z1 - 1.4, y: Y + 0.07, dash: 0.9 });

  buildEntrance(ctx, Y, rng);
  buildStalls(ctx, Y, rng);
  const stage = buildStage(ctx, Y);
  buildLighting(ctx, Y, stage, rng);
  buildTemporaries(ctx, Y, rng);

  /* --------------------------------- planting --------------------------------- *
   * One more green mass on the west boundary so the clearing has a back to it,
   * and a low hedge along the south where the ground runs into the shrine wood.
   * No cherry: the one in the middle of the ground is the shrine's, it was here
   * first, and a second would close the clearing in. */
  grove.push({ x: X0 - 2.6, z: 17.2, y: Y, scale: 1.75, seed: 9410, spread: 1.2 });
  grove.push({ x: X0 - 1.8, z: 24.2, y: Y, scale: 1.5, seed: 9411, spread: 1.1 });
  for (let i = 0; i < 5; i++) {
    shrubs.push({ x: X0 + 1.0 + i * 3.1, z: Z1 + 0.8, y: Y, r: 0.5, count: 3, spread: 1.3, seed: 9420 + i });
  }
  for (let i = 0; i < 3; i++) {
    shrubs.push({ x: X0 + 2.2 + i * 4.4, z: Z0 - 0.9, y: Y, r: 0.46, count: 3, spread: 1.2, seed: 9430 + i });
  }
  petals.push({ x: CX, z: CZ, w: X1 - X0 - 2, d: Z1 - Z0 - 2, y: Y + 0.07, n: 160 });
  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * The way in: the banner, and the programme board under it.
 * ------------------------------------------------------------------ */

function buildEntrance(ctx, Y, rng) {
  const m = mats();
  const bx = X1 - 0.2;
  const z0 = 15.7, z1 = 20.4;

  /* two scaffold poles and the banner between them.  It hangs from a top rail
   * rather than being nailed to the poles, and it sags -- a taut banner reads as
   * a printed panel, a slack one reads as cloth. */
  for (const z of [z0, z1]) {
    const p = cyl(0.07, 0.08, 4.0, 8, m.metal, bx, Y + 2.0, z);
    p.castShadow = true;
    ctx.add(p);
    hullOutline(p, { thickness: 0.0032 });
    ctx.add(cyl(0.2, 0.24, 0.16, 8, m.concreteMid, bx, Y + 0.08, z));
    ctx.collide(bx - 0.2, z - 0.2, bx + 0.2, z + 0.2, Y + 4.0);
    // the guy wire back to a stake, which is how a temporary pole stands up
    const st = new THREE.Vector3(bx + 1.5, Y + 0.05, z + (z === z0 ? -1.1 : 1.1));
    const geo = new THREE.TubeGeometry(
      sagCurve(new THREE.Vector3(bx, Y + 3.6, z), st, 0.06, 8), 8, 0.012, 4, false);
    ctx.add(new THREE.Mesh(geo, m.metalDark));
    ctx.add(cyl(0.02, 0.02, 0.3, 5, m.metalDark, st.x, Y + 0.12, st.z));
  }
  ctx.add(box(0.09, 0.09, z1 - z0 + 0.4, m.metal, bx, Y + 3.72, (z0 + z1) / 2));
  {
    const art = matsuriBanner();
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0 - 0.1, 0.72, 6, 1),
      flat({ color: 0xffffff, map: art, side: THREE.DoubleSide, cache: false }));
    // sag the middle of the cloth by hand: six segments, a cosine drop
    const p = cloth.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / (z1 - z0 - 0.1);
      p.setY(i, p.getY(i) - Math.cos(u * Math.PI) * 0.0 - (1 - Math.abs(u * 2)) * 0.09);
    }
    p.needsUpdate = true;
    cloth.geometry.computeVertexNormals();
    cloth.position.set(bx - 0.02, Y + 3.28, (z0 + z1) / 2);
    cloth.rotation.y = -Math.PI / 2;
    cloth.castShadow = true;
    ctx.add(cloth);
  }

  /* the programme board, on a timber A-frame beside the entrance */
  {
    const px = X1 - 1.3, pz = 21.9;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.4, 1.02),
      [flat({ color: 0xffffff, map: matsuriBoard(), cache: false }),
       flat({ color: 0xffffff, map: matsuriBoard(), cache: false }),
       m.woodDark, m.woodDark, m.woodDark, m.woodDark]
    );
    board.position.set(px, Y + 1.35, pz);
    board.rotation.y = -0.22;
    board.castShadow = true;
    board.name = 'openFrame';
    ctx.add(board);
    hullOutline(board, { thickness: 0.003 });
    for (const s of [-1, 1]) {
      const leg = box(0.1, 1.7, 0.1, m.woodDark, px + 0.12, Y + 0.85, pz + s * 0.44);
      leg.castShadow = true;
      ctx.add(leg);
      const brace = box(0.08, 1.1, 0.08, m.woodDark, px + 0.42, Y + 0.55, pz + s * 0.44);
      brace.rotation.z = 0.5;
      ctx.add(brace);
      ctx.collide(px + 0.08, pz + s * 0.44 - 0.08, px + 0.16, pz + s * 0.44 + 0.08, Y + 1.7, Y, true);
    }
    ctx.add(box(0.1, 0.1, 1.1, m.woodDark, px + 0.12, Y + 1.98, pz));
    ctx.collide(px - 0.12, pz - 0.55, px + 0.12, pz + 0.55, Y + 2.05, Y + 0.65, true);
  }
}

/* ------------------------------------------------------------------ *
 * The stalls.
 * ------------------------------------------------------------------ */

function buildStalls(ctx, Y, rng) {
  /* Five, on the two chalked lines, all facing into the ground.  Two of the five
   * still have their canopies rolled, one has no side sheets yet, and every
   * counter is empty -- which is the difference between "before" and "during". */
  const SET = [
    { x: -43.4, z: 23.4, ry: Math.PI, sign: 0, rolled: false, sides: true, extra: 'takoyaki' },
    { x: -39.0, z: 23.4, ry: Math.PI, sign: 1, rolled: true, sides: true, extra: 'kakigori' },
    { x: -34.6, z: 23.4, ry: Math.PI, sign: 3, rolled: false, sides: false, extra: 'prize' },
    { x: -42.0, z: 15.4, ry: 0, sign: 2, rolled: false, sides: true, extra: 'tank' },
    { x: -35.8, z: 15.4, ry: 0, sign: 4, rolled: true, sides: false, extra: 'none' },
  ];
  for (const s of SET) {
    ctx.add(makeStall({ ...s, y: Y, ctx }));
    const W = 2.6, D = 1.1, CH = 0.9;
    const ca = Math.cos(s.ry), sa = Math.sin(s.ry);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lx = sx * (W / 2 - 0.08);
        const lz = sz * (D / 2 - 0.06);
        const px = s.x + ca * lx - sa * lz;
        const pz = s.z + sa * lx + ca * lz;
        ctx.collide(px - 0.05, pz - 0.05, px + 0.05, pz + 0.05, Y + 2.15, Y, true);
      }
    }
    const hw = (Math.abs(ca) * W + Math.abs(sa) * D) / 2;
    const hd = (Math.abs(sa) * W + Math.abs(ca) * D) / 2;
    ctx.collide(s.x - hw, s.z - hd, s.x + hw, s.z + hd, Y + CH + 0.08, Y + CH - 0.04, true);
    const fz = s.z + (s.ry ? -1 : 1) * 1.1;      // just in front of the counter
    if (s.extra === 'takoyaki') buildGriddle(ctx, s.x + 0.6, s.z, Y, s.ry);
    if (s.extra === 'kakigori') buildShaver(ctx, s.x - 0.5, s.z, Y, s.ry);
    if (s.extra === 'prize') ctx.add(makePrizeRack({ x: s.x, z: s.z + 0.9, y: Y, ry: s.ry }));
    if (s.extra === 'tank') ctx.add(makeScoopTank({ x: s.x - 0.2, z: fz + 0.5, y: Y, ry: s.ry, seed: 9441 }));
    // the crates every stall keeps under and behind its counter
    ctx.add(makeCrates({
      x: s.x + (rng.chance(0.5) ? 1.6 : -1.6), z: s.z + (s.ry ? 0.9 : -0.9), y: Y,
      n: rng.int(2, 3), seed: 9450 + Math.round(s.x), ry: rng.range(-0.3, 0.3),
    }));
  }
}

/**
 * One folding stall.
 *
 * A 屋台 hired from the town association is a steel scaffold frame, a plywood
 * counter, a striped canopy and a paper sign wired to the front rail.  What
 * makes it read as *folding* rather than as a building is that you can see the
 * frame through it: the counter stops short of the ground, the side sheets are
 * cloth and there is nothing behind it at all.
 */
function makeStall(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'openFrame';
  const W = o.w ?? 2.6;
  const D = o.d ?? 1.1;
  const H = 2.15;
  const CH = 0.9;                       // counter height
  const parts = { metal: [], wood: [], dark: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* the frame: four legs, two counter rails, two head rails, and the diagonal
   * brace that a scaffold frame always has at one end */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      push('metal', new THREE.CylinderGeometry(0.032, 0.036, H, 7),
        trs(sx * (W / 2 - 0.08), H / 2, sz * (D / 2 - 0.06)));
      push('dark', new THREE.BoxGeometry(0.11, 0.03, 0.11), trs(sx * (W / 2 - 0.08), 0.015, sz * (D / 2 - 0.06)));
    }
    push('metal', new THREE.CylinderGeometry(0.028, 0.028, D, 6),
      trs(sx * (W / 2 - 0.08), CH, 0, Math.PI / 2, 0, 0));
  }
  for (const y of [CH, H - 0.06]) {
    for (const sz of [-1, 1]) {
      push('metal', new THREE.CylinderGeometry(0.028, 0.028, W - 0.16, 6),
        trs(0, y, sz * (D / 2 - 0.06), 0, 0, Math.PI / 2));
    }
  }
  push('metal', new THREE.CylinderGeometry(0.024, 0.024, Math.hypot(W - 0.16, H - CH), 6),
    trs(0, (CH + H) / 2, -(D / 2 - 0.06), 0, 0, Math.PI / 2 - Math.atan2(H - CH, W - 0.16)));

  /* the counter: a plywood top with a fascia, and the shelf under it */
  push('wood', new THREE.BoxGeometry(W, 0.05, D + 0.14), trs(0, CH + 0.025, 0));
  push('wood', new THREE.BoxGeometry(W + 0.04, 0.3, 0.04), trs(0, CH - 0.15, D / 2 + 0.06));
  push('wood', new THREE.BoxGeometry(W - 0.2, 0.04, D - 0.2), trs(0, 0.38, 0));

  /* the canopy: either out over the counter, or rolled up on its rail */
  if (o.rolled) {
    const roll = cyl(0.14, 0.14, W - 0.1, 10, m.tarp, 0, H + 0.06, D / 2 - 0.02);
    roll.rotation.z = Math.PI / 2;
    roll.castShadow = true;
    g.add(roll);
    for (const sx of [-1, 1]) {
      g.add(box(0.05, 0.06, 0.2, m.metalDark, sx * (W / 2 - 0.2), H + 0.06, D / 2 - 0.02));
    }
    // and the two ties hanging off it
    for (const sx of [-0.5, 0.4]) {
      g.add(box(0.03, 0.34, 0.02, cel({ color: PAL.redDeep, bands: 2, tint: 0x7a4060 }),
        sx, H - 0.11, D / 2 + 0.04));
    }
  } else {
    const out = 1.0;
    const drop = 0.3;
    const stripes = Math.max(6, Math.round(W / 0.4));
    const A = [], B = [];
    const sw = W / stripes;
    for (let i = 0; i < stripes; i++) {
      (i % 2 === 0 ? A : B).push({
        geometry: new THREE.BoxGeometry(sw, 0.05, out),
        matrix: trs(-W / 2 + sw * (i + 0.5), 0, out / 2),
      });
    }
    const grp = new THREE.Group();
    grp.position.set(0, H + 0.02, D / 2);
    grp.rotation.x = Math.atan2(drop, out);
    const mA = new THREE.Mesh(bake(A), m.red);
    const mB = new THREE.Mesh(bake(B), m.cream);
    mA.castShadow = mB.castShadow = true;
    grp.add(mA, mB);
    g.add(grp);
    hullOutline(mA, { thickness: 0.003 });
    // the roof back over the counter, and the two front stays
    push('metal', new THREE.CylinderGeometry(0.026, 0.026, W - 0.1, 6),
      trs(0, H + 0.02, -D / 2 + 0.08, 0, 0, Math.PI / 2));
    for (const sx of [-1, 1]) {
      const st = box(0.05, 0.05, out, m.metalDark, sx * (W / 2 - 0.14), H - 0.12, D / 2 + out / 2);
      st.rotation.x = Math.atan2(drop, out);
      g.add(st);
    }
  }

  /* the paper sign on the front rail, and the two clips holding it */
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, 0.34),
      flat({ color: 0xffffff, map: stallSign(o.sign ?? 0), side: THREE.DoubleSide, cache: false }));
    sign.position.set(0, H - 0.3, D / 2 + 0.07);
    sign.castShadow = true;
    g.add(sign);
    for (const sx of [-1, 1]) {
      g.add(box(0.05, 0.04, 0.03, m.metalDark, sx * (W / 2 - 0.26), H - 0.13, D / 2 + 0.06));
    }
  }

  /* the side sheets, if this one has been sheeted yet */
  if (o.sides) {
    for (const sx of [-1, 1]) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(D + 0.1, H - CH - 0.12),
        cel({ color: 0xe6dcc4, bands: 2, side: THREE.DoubleSide, tint: 0x6f6790 }));
      sheet.position.set(sx * (W / 2 - 0.07), (CH + H) / 2 - 0.02, 0);
      sheet.rotation.y = Math.PI / 2;
      sheet.castShadow = true;
      g.add(sheet);
    }
  }

  const matFor = { metal: m.metal, wood: m.wood, dark: m.dark };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** The empty たこ焼き griddle: a plate, its burner box and the pick jar. */
function buildGriddle(ctx, x, z, Y, ry) {
  const m = mats();
  const g = new THREE.Group();
  g.add(box(0.62, 0.16, 0.44, m.metalDark, 0, 0.08, 0));
  const plate = box(0.56, 0.05, 0.4, cel({ color: 0x4a4552, bands: 2, tint: 0x413c58 }), 0, 0.18, 0);
  g.add(plate);
  // the dimples, as a grid of shallow dark discs -- empty, which is the point
  const holes = [];
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 3; k++) {
      holes.push({
        geometry: new THREE.CylinderGeometry(0.035, 0.035, 0.02, 8),
        matrix: trs(-0.21 + i * 0.14, 0.2, -0.11 + k * 0.11),
      });
    }
  }
  g.add(new THREE.Mesh(bake(holes), cel({ color: 0x33303c, bands: 2, tint: 0x413c58 })));
  g.add(cyl(0.05, 0.05, 0.14, 8, m.metal, 0.36, 0.28, 0.1));
  for (let i = 0; i < 4; i++) {
    g.add(cyl(0.006, 0.006, 0.2, 4, m.wood, 0.34 + (i % 2) * 0.03, 0.42, 0.08 + ((i / 2) | 0) * 0.03));
  }
  g.traverse((n) => { if (n.isMesh) n.castShadow = true; });
  g.position.set(x, Y + 0.95, z);
  g.rotation.y = ry;
  ctx.add(g);
}

/** The かき氷 shaver: a column, a bowl clamp and a hand crank, and no ice. */
function buildShaver(ctx, x, z, Y, ry) {
  const m = mats();
  const g = new THREE.Group();
  g.add(cyl(0.15, 0.17, 0.05, 12, m.metalDark, 0, 0.025, 0));
  const col = box(0.16, 0.52, 0.16, cel({ color: 0xd8d2c0, bands: 3, tint: 0x6a6288 }), 0, 0.31, -0.04);
  col.castShadow = true;
  g.add(col);
  g.add(cyl(0.12, 0.12, 0.1, 12, m.metal, 0, 0.62, -0.04));
  g.add(cyl(0.02, 0.02, 0.22, 6, m.metal, 0.14, 0.66, -0.04).rotateZ(Math.PI / 2));
  g.add(cyl(0.025, 0.025, 0.06, 8, m.wood, 0.26, 0.66, -0.04));
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.06, 12),
    cel({ color: 0xe8e2ee, bands: 2, tint: 0x6f6790 }));
  bowl.position.set(0, 0.09, 0.1);
  g.add(bowl);
  // the two syrup bottles beside it, still capped
  for (const [dx, c] of [[0.24, 0xe0453f], [0.34, 0x5aa578]]) {
    g.add(cyl(0.032, 0.036, 0.2, 8, cel({ color: c, bands: 2, tint: 0x6f6790 }), dx, 0.1, 0.14));
    g.add(cyl(0.02, 0.02, 0.04, 8, m.cream, dx, 0.22, 0.14));
  }
  g.traverse((n) => { if (n.isMesh) n.castShadow = true; });
  g.position.set(x, Y + 0.95, z);
  g.rotation.y = ry;
  ctx.add(g);
}

/** The prize rack, three tiers and nothing on it yet. */
function makePrizeRack(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const W = 1.2, D = 0.36;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.018, 0.02, 1.28, 6, m.metal, sx * (W / 2 - 0.04), 0.64, sz * (D / 2 - 0.04)));
    }
  }
  for (const y of [0.34, 0.76, 1.18]) {
    g.add(box(W, 0.03, D, cel({ color: 0xd8cdb4, bands: 3, tint: 0x6f6790 }), 0, y, 0));
    for (const sz of [-1, 1]) {
      g.add(box(W, 0.03, 0.025, m.metal, 0, y + 0.05, sz * (D / 2 - 0.03)));
    }
  }
  // one empty cardboard box on the bottom shelf, flaps open
  g.add(box(0.4, 0.2, 0.28, cel({ color: 0xc9a878, bands: 3, tint: 0x6f6790 }), -0.3, 0.46, 0));
  const flap = box(0.4, 0.02, 0.16, cel({ color: 0xb08f62, bands: 3, tint: 0x6a6288 }), -0.3, 0.56, 0.2);
  flap.rotation.x = -0.8;
  g.add(flap);
  g.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** The 金魚すくい tank: up, levelled, and dry. */
function makeScoopTank(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 51);
  const g = new THREE.Group();
  const W = 1.7, D = 1.1, H = 0.34;
  // the trestles under it
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.07, 0.42, 0.07, m.wood, sx * (W / 2 - 0.16), 0.21, sz * (D / 2 - 0.14)));
    }
    g.add(box(0.05, 0.05, D - 0.24, m.wood, sx * (W / 2 - 0.16), 0.36, 0));
  }
  // the tank: a shallow blue box, its rim, and the dry floor with one puddle
  const shell = cel({ color: 0x4a7fae, bands: 3, tint: 0x4a4a92 });
  for (const sz of [-1, 1]) {
    g.add(box(W, H, 0.05, shell, 0, 0.42 + H / 2, sz * (D / 2 - 0.025)));
  }
  for (const sx of [-1, 1]) {
    g.add(box(0.05, H, D, shell, sx * (W / 2 - 0.025), 0.42 + H / 2, 0));
  }
  g.add(box(W, 0.05, D, cel({ color: 0x3f6f9c, bands: 3, tint: 0x4a4a92 }), 0, 0.44, 0));
  for (const sz of [-1, 1]) {
    g.add(box(W + 0.06, 0.04, 0.09, m.metal, 0, 0.42 + H, sz * (D / 2 - 0.02)));
  }
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3),
    flat({ color: 0x8fb4c8, transparent: true, opacity: 0.5, depthWrite: false, cache: false }));
  wet.rotation.x = -Math.PI / 2;
  wet.position.set(0.2, 0.47, -0.1);
  wet.userData.noOutline = true;
  g.add(wet);
  // the scoops, still bundled, and the bowl stack beside them
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Group();
    s.add(cyl(0.008, 0.008, 0.24, 4, m.wood, 0, 0.12, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 4, 10), m.metal);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.26;
    s.add(ring);
    s.position.set(-W / 2 + 0.22 + (i % 3) * 0.04, 0.47, 0.22 + ((i / 3) | 0) * 0.06);
    s.rotation.set(rng.range(0.9, 1.15), rng.range(0, 3), 0);
    g.add(s);
  }
  for (let i = 0; i < 4; i++) {
    g.add(cyl(0.09, 0.07, 0.045, 12, cel({ color: 0xe8e2ee, bands: 2, tint: 0x6f6790 }),
      W / 2 - 0.3, 0.5 + i * 0.04, -0.2));
  }
  g.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* ------------------------------------------------------------------ *
 * The 太鼓台.
 * ------------------------------------------------------------------ */

function buildStage(ctx, Y) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'matsuriStage';
  ctx.add(g);

  const cx = -42.4, cz = 19.4;
  const W = 3.6, H = 0.82;

  /* the deck: a boarded platform on a frame, and it is *walkable* -- the only
   * thing on this ground the player can get up onto, which is what makes it the
   * ground's centre rather than just its biggest prop */
  {
    const legs = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        legs.push({
          geometry: new THREE.BoxGeometry(0.14, H, 0.14),
          matrix: trs(cx + sx * (W / 2 - 0.14), Y + H / 2, cz + sz * (W / 2 - 0.14)),
        });
      }
    }
    for (const sz of [-1, 1]) {
      legs.push({
        geometry: new THREE.BoxGeometry(W - 0.2, 0.12, 0.12),
        matrix: trs(cx, Y + H - 0.14, cz + sz * (W / 2 - 0.14)),
      });
    }
    const lm = new THREE.Mesh(bake(legs), m.woodDark);
    lm.castShadow = lm.receiveShadow = true;
    g.add(lm);

    const boards = [];
    const n = Math.round(W / 0.3);
    for (let i = 0; i < n; i++) {
      boards.push({
        geometry: new THREE.BoxGeometry(W, 0.07, W / n - 0.02),
        matrix: trs(cx, Y + H + 0.035, cz - W / 2 + (W / n) * (i + 0.5)),
      });
    }
    const bm = new THREE.Mesh(bake(boards), m.wood);
    bm.castShadow = bm.receiveShadow = true;
    g.add(bm);
    hullOutline(bm, { thickness: 0.0032 });
    ctx.platform({ x0: cx - W / 2, x1: cx + W / 2, z0: cz - W / 2, z1: cz + W / 2, top: Y + H + 0.07 });
  }

  /* the steps up the east side, and the rail round the other three */
  steps(ctx, {
    x: cx + W / 2 + 0.55, z: cz, axis: 'x', dir: -1, n: 3, rise: (H + 0.07) / 3,
    run: 0.34, w: 1.2, y: Y, mat: m.woodDark, lipMat: m.wood,
  });
  {
    const rails = [];
    const RH = 0.9;
    const posts = [
      [cx - W / 2 + 0.1, cz - W / 2 + 0.1], [cx + W / 2 - 0.1, cz - W / 2 + 0.1],
      [cx - W / 2 + 0.1, cz + W / 2 - 0.1], [cx + W / 2 - 0.1, cz + W / 2 - 0.1],
      [cx - W / 2 + 0.1, cz], [cx, cz - W / 2 + 0.1], [cx, cz + W / 2 - 0.1],
    ];
    for (const [px, pz] of posts) {
      rails.push({
        geometry: new THREE.BoxGeometry(0.1, RH + 1.7, 0.1),
        matrix: trs(px, Y + H + 0.07 + (RH + 1.7) / 2, pz),
      });
    }
    // the top rail on three sides, and the frame the lanterns hang from
    for (const [ax, az, len, ry] of [
      [cx - W / 2 + 0.1, cz, W - 0.2, 0], [cx, cz - W / 2 + 0.1, W - 0.2, Math.PI / 2],
      [cx, cz + W / 2 - 0.1, W - 0.2, Math.PI / 2],
    ]) {
      for (const y of [Y + H + 0.07 + RH, Y + H + 0.07 + 0.44]) {
        rails.push({
          geometry: new THREE.BoxGeometry(0.08, 0.08, len),
          matrix: trs(ax, y, az, 0, ry, 0),
        });
      }
      rails.push({
        geometry: new THREE.BoxGeometry(0.1, 0.1, len),
        matrix: trs(ax, Y + H + 0.07 + RH + 1.7, az, 0, ry, 0),
      });
    }
    rails.push({
      geometry: new THREE.BoxGeometry(0.1, 0.1, W - 0.2),
      matrix: trs(cx, Y + H + 0.07 + RH + 1.7, cz + W / 2 - 0.1, 0, 0, Math.PI / 2),
    });
    const rm = new THREE.Mesh(bake(rails), m.woodDark);
    rm.castShadow = true;
    g.add(rm);
    for (const [px, pz] of posts) {
      ctx.collide(px - 0.1, pz - 0.1, px + 0.1, pz + 0.1, Y + H + 0.07 + RH + 1.8);
    }
  }
  /* the 紅白 cloth wrapped round the deck fascia -- the one saturated thing on
   * the ground, and the reason the stage reads from the far side of it */
  {
    const parts = [[], []];
    const n = 12;
    for (const [sz, ry] of [[-1, 0], [1, 0]]) {
      for (let i = 0; i < n; i++) {
        parts[i % 2].push({
          geometry: new THREE.BoxGeometry(W / n, 0.34, 0.05),
          matrix: trs(cx - W / 2 + (W / n) * (i + 0.5), Y + H - 0.14, cz + sz * (W / 2 + 0.02)),
        });
      }
    }
    for (let i = 0; i < n; i++) {
      parts[i % 2].push({
        geometry: new THREE.BoxGeometry(0.05, 0.34, W / n),
        matrix: trs(cx - W / 2 - 0.02, Y + H - 0.14, cz - W / 2 + (W / n) * (i + 0.5)),
      });
    }
    g.add(new THREE.Mesh(bake(parts[0]), m.red));
    g.add(new THREE.Mesh(bake(parts[1]), m.cream));
  }

  /* the drum, on its stand, centre deck */
  {
    const dy = Y + H + 0.07;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 16),
      cel({ color: 0x9c5a3c, bands: 3, tint: 0x6f5680 }));
    body.rotation.z = Math.PI / 2;
    body.position.set(cx, dy + 0.72, cz);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    hullOutline(body, { thickness: 0.0034 });
    for (const sx of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.03, 16),
        cel({ color: 0xe8dcc0, bands: 2, tint: 0x8a7f9c }));
      head.rotation.z = Math.PI / 2;
      head.position.set(cx + sx * 0.26, dy + 0.72, cz);
      g.add(head);
      // the tack ring round each head
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.014, 4, 18), m.metalDark);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(cx + sx * 0.275, dy + 0.72, cz);
      g.add(ring);
    }
    // the X stand, and the two sticks laid across the deck
    for (const s of [-1, 1]) {
      const leg = box(0.07, 0.9, 0.07, m.woodDark, cx + s * 0.3, dy + 0.34, cz);
      leg.rotation.z = s * 0.42;
      leg.castShadow = true;
      g.add(leg);
    }
    g.add(box(0.72, 0.06, 0.06, m.woodDark, cx, dy + 0.5, cz));
    for (const dz of [-0.16, -0.24]) {
      const st = cyl(0.019, 0.021, 0.42, 6, m.wood, cx + 0.5, dy + 0.03, cz + dz);
      st.rotation.z = Math.PI / 2;
      st.rotation.y = 0.2;
      g.add(st);
    }
  }
  return { x: cx, z: cz, top: Y + 0.82 + 0.07 + 0.9 + 1.7 };
}

/* ------------------------------------------------------------------ *
 * The lanterns and the flags.
 * ------------------------------------------------------------------ */

function buildLighting(ctx, Y, stage, rng) {
  const m = mats();
  const lanterns = [];
  const wires = [];

  /* Four posts round the ground, and the lantern runs strung between them, the
   * stage frame and the cherry in the middle.  Two lanterns per run at 2.6 m
   * spacing: three read as a ceiling, which is what the shopping street's own
   * note says, and a festival ground wants a *canopy*. */
  const POSTS = [
    { x: X0 + 1.2, z: Z0 + 1.4, h: 4.2 },
    { x: X0 + 1.2, z: Z1 - 1.4, h: 4.2 },
    { x: X1 - 2.6, z: Z0 + 1.4, h: 4.0 },
    { x: X1 - 2.6, z: Z1 - 1.4, h: 4.0 },
  ];
  for (const p of POSTS) {
    const post = cyl(0.065, 0.08, p.h, 8, m.wood, p.x, Y + p.h / 2, p.z);
    post.castShadow = true;
    ctx.add(post);
    hullOutline(post, { thickness: 0.0032 });
    ctx.add(cyl(0.18, 0.22, 0.14, 8, m.concreteMid, p.x, Y + 0.07, p.z));
    ctx.collide(p.x - 0.18, p.z - 0.18, p.x + 0.18, p.z + 0.18, Y + p.h);
    // the two guys and their stakes
    for (const s of [-1, 1]) {
      const st = new THREE.Vector3(p.x + s * 1.2, Y + 0.05, p.z + s * 0.5);
      const geo = new THREE.TubeGeometry(
        sagCurve(new THREE.Vector3(p.x, Y + p.h - 0.4, p.z), st, 0.05, 8), 8, 0.011, 4, false);
      ctx.add(new THREE.Mesh(geo, m.metalDark));
      ctx.add(cyl(0.018, 0.018, 0.28, 5, m.metalDark, st.x, Y + 0.11, st.z));
    }
  }

  const at = (p) => new THREE.Vector3(p.x, Y + (p.h ?? 4.0) - 0.45, p.z);
  const SF = { x: stage.x, z: stage.z, h: stage.top - Y + 0.1 };
  const TREE = { x: TREES[1].x, z: TREES[1].z, h: 4.6 };
  const RUNS = [
    [POSTS[0], SF], [POSTS[1], SF], [POSTS[2], TREE], [POSTS[3], TREE],
    [SF, TREE], [POSTS[0], POSTS[1]], [POSTS[2], POSTS[3]],
  ];
  for (const [a, b] of RUNS) {
    const pa = at(a);
    const pb = at(b);
    const dist = pa.distanceTo(pb);
    const sag = Math.min(0.55, dist * 0.045);
    const curve = sagCurve(pa, pb, sag, 12);
    wires.push(new THREE.TubeGeometry(curve, 14, 0.015, 4, false));
    const n = Math.max(2, Math.round(dist / 2.6));
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const p = curve.getPoint(t);
      lanterns.push({ p, variant: (i + Math.round(a.x)) % 2 ? 3 : 4 });
    }
  }
  const wm = new THREE.Mesh(bake(wires.map((geometry) => ({ geometry }))),
    cel({ color: 0x4c4658, bands: 2, tint: 0x413c58 }));
  ctx.add(wm);
  wires.forEach((g) => g.dispose());
  for (const l of lanterns) {
    ctx.add(makePaperLantern({
      x: l.p.x, y: l.p.y - 0.16, z: l.p.z, variant: l.variant, r: 0.17, drop: 0.26, lit: false, ctx,
    }));
  }

  /* the flags, on a line along the north edge -- goldfish, a firework and 祭,
   * repeating, which is the rhythm the brief asks for */
  {
    const z = Z0 + 0.5;
    const a = new THREE.Vector3(X0 + 1.2, Y + 2.9, z);
    const b = new THREE.Vector3(X1 - 2.6, Y + 2.9, z);
    const curve = sagCurve(a, b, 0.3, 12);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.013, 4, false),
      cel({ color: 0x4c4658, bands: 2, tint: 0x413c58 }));
    ctx.add(tube);
    const n = 11;
    for (let i = 1; i <= n; i++) {
      const p = curve.getPoint(i / (n + 1));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.42),
        flat({ color: 0xffffff, map: matsuriFlag(i % 3), side: THREE.DoubleSide, cache: false }));
      flag.position.set(p.x, p.y - 0.24, p.z);
      flag.rotation.y = rng.range(-0.24, 0.24);
      flag.rotation.z = rng.range(-0.06, 0.06);
      flag.castShadow = true;
      ctx.add(flag);
    }
  }
}

/* ------------------------------------------------------------------ *
 * The temporary works: cable, box, rope, cones, tables, benches.
 * ------------------------------------------------------------------ */

function buildTemporaries(ctx, Y, rng) {
  const m = mats();

  /* the distribution box, on a pallet, with the plate that tells you not to
   * touch it -- the single most "this is being set up" object on the ground */
  {
    const bx = X1 - 3.4, bz = Z1 - 1.6;
    ctx.add(box(1.0, 0.09, 0.8, m.woodDark, bx, Y + 0.045, bz));
    const body = box(0.5, 0.7, 0.34, cel({ color: 0xc8ccd4, bands: 3, tint: 0x6a6288 }), bx, Y + 0.44, bz);
    body.castShadow = body.receiveShadow = true;
    ctx.add(body);
    hullOutline(body, { thickness: 0.0032 });
    ctx.add(box(0.56, 0.05, 0.4, m.metalDark, bx, Y + 0.81, bz));
    ctx.add(box(0.3, 0.24, 0.03, cel({ color: 0x3a3744, bands: 2 }), bx, Y + 0.52, bz - 0.18));
    for (let i = 0; i < 3; i++) {
      ctx.add(cyl(0.028, 0.028, 0.06, 8, m.metalDark, bx - 0.14 + i * 0.14, Y + 0.24, bz - 0.18).rotateX(Math.PI / 2));
    }
    ctx.collide(bx - 0.35, bz - 0.3, bx + 0.35, bz + 0.3, Y + 0.85);
    ctx.add(makeSignPost({
      x: bx + 0.9, z: bz - 0.3, y: Y, ry: -0.5, h: 1.5, postMat: m.metal,
      plates: [{ map: setupPlate(1), w: 0.4, h: 0.3, y: 1.24 }],
    }));

    /* the cable, snaking from the box out to the stalls.  Laid on the ground and
     * taped at two crossings, which is what an electrician actually does. */
    const path = [
      new THREE.Vector3(bx - 0.3, Y + 0.09, bz),
      new THREE.Vector3(bx - 2.2, Y + 0.05, bz - 0.6),
      new THREE.Vector3(-38.6, Y + 0.05, Z1 - 2.2),
      new THREE.Vector3(-39.0, Y + 0.05, 23.0),
      new THREE.Vector3(-43.2, Y + 0.05, 22.9),
    ];
    const curve = new THREE.CatmullRomCurve3(path);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.026, 5, false),
      cel({ color: 0x3f3a48, bands: 2, tint: 0x413c58 }));
    tube.castShadow = true;
    ctx.add(tube);
    for (const t of [0.34, 0.72]) {
      const p = curve.getPoint(t);
      const tape = box(0.34, 0.01, 0.24, cel({ color: PAL.yellow, bands: 2, tint: 0x8f7050 }), p.x, Y + 0.065, p.z);
      tape.userData.noOutline = true;
      ctx.add(tape);
    }
    // a second coil, not yet run out
    {
      const cs = [];
      for (let i = 0; i < 4; i++) {
        cs.push({
          geometry: new THREE.TorusGeometry(0.3 - i * 0.03, 0.026, 4, 14),
          matrix: trs(bx + 1.5, 0.03 + i * 0.055, bz + 0.9, Math.PI / 2, 0, 0),
        });
      }
      const coil = new THREE.Mesh(bake(cs), cel({ color: 0x3f3a48, bands: 2, tint: 0x413c58 }));
      coil.position.y = Y;
      coil.castShadow = true;
      ctx.add(coil);
    }
  }

  /* the rope on stakes across the entrance apron, and the cones by it */
  {
    const z = 21.0;
    const posts = [];
    for (let i = 0; i <= 3; i++) {
      const px = X1 - 1.0 - i * 1.5;
      posts.push(new THREE.Vector3(px, Y + 0.9, z));
      const p = cyl(0.03, 0.034, 0.95, 6, m.metal, px, Y + 0.475, z);
      p.castShadow = true;
      ctx.add(p);
      ctx.add(cyl(0.13, 0.15, 0.06, 8, m.concreteMid, px, Y + 0.03, z));
    }
    const geos = [];
    for (let i = 0; i < posts.length - 1; i++) {
      geos.push(new THREE.TubeGeometry(sagCurve(posts[i], posts[i + 1], 0.09, 8), 8, 0.014, 4, false));
    }
    ctx.add(new THREE.Mesh(bake(geos.map((geometry) => ({ geometry }))),
      cel({ color: 0xefe6d2, bands: 2, tint: 0x8a7f9c })));
    geos.forEach((g) => g.dispose());
    // the 紅白 tags tied along it
    for (let i = 0; i < 6; i++) {
      const t = box(0.03, 0.2, 0.02,
        i % 2 ? m.red : m.cream, X1 - 1.4 - i * 0.75, Y + 0.78, z);
      t.rotation.z = rng.range(-0.15, 0.15);
      ctx.add(t);
    }
    ctx.add(makeCone({ x: X1 - 1.2, z: z + 0.5, y: Y, ry: 0.3 }));
    ctx.add(makeCone({ x: X1 - 5.6, z: z + 0.4, y: Y, ry: -0.5, tilt: 0.05 }));
    ctx.add(makeSignPost({
      x: X1 - 3.2, z: z + 0.55, y: Y, ry: Math.PI, h: 1.4, postMat: m.metal,
      plates: [{ map: setupPlate(0), w: 0.42, h: 0.32, y: 1.16, double: true }],
    }));
  }

  /* the folding tables: one up, two folded and leaning against the stage */
  {
    ctx.add(makeFoldingTable({ x: -36.4, z: 20.6, y: Y, ry: 0.16 }));
    ctx.add(makeFoldingTable({ x: -40.2, z: 17.0, y: Y, ry: -0.4, folded: true }));
    ctx.add(makeFoldingTable({ x: -40.0, z: 17.5, y: Y, ry: -0.32, folded: true }));
  }

  /* benches waiting to be put out, crates of drinks, a broom and a bucket */
  ctx.add(makeBench({ x: -34.2, z: 19.6, y: Y, ry: -1.5, len: 1.8, back: false }));
  ctx.add(makeBench({ x: -34.2, z: 17.6, y: Y, ry: -1.5, len: 1.8, back: false }));
  ctx.add(makeCrates({ x: -37.0, z: 21.4, y: Y, n: 4, seed: 9461, ry: 0.2 }));
  ctx.add(makeCrates({ x: -36.2, z: 21.6, y: Y, n: 3, seed: 9462, ry: -0.3 }));
  ctx.add(makeRecycleBox({ x: -33.4, z: 22.4, y: Y, ry: -0.6, color: 0x6f8f6a }));
  ctx.add(makeBroom({ x: -32.6, z: 20.6, y: Y, tilt: 0.2, roll: 0.12, ry: 1.1 }));
  ctx.add(makeBucket({ x: -33.1, z: 20.2, y: Y, ry: 0.4, water: true }));
  ctx.add(makePlanter({ x: X1 - 0.9, z: 16.4, y: Y, r: 0.26, flower: true, seed: 9463, n: 5 }));
  makeLoosePaper(ctx, [
    { x: -35.2, z: 18.4, y: Y + 0.07, ry: 0.8 },
    { x: -41.6, z: 15.9, y: Y + 0.07, ry: -0.5 },
    { x: -38.2, z: 24.2, y: Y + 0.07, ry: 1.2 },
  ]);
}

/** A trestle table: either set up, or folded flat and leaning. */
function makeFoldingTable(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const W = 1.8, D = 0.6, H = 0.7;
  if (o.folded) {
    /* Folded, its legs shut against the underside, leaning on its long edge.
     * The whole read is the *angle* -- a flat panel on the ground is a panel, a
     * panel at seventy degrees is a table somebody has not put out yet. */
    const inner = new THREE.Group();
    const top = box(W, 0.05, D, m.cream, 0, 0, 0);
    top.castShadow = top.receiveShadow = true;
    inner.add(top);
    for (const sx of [-1, 1]) {
      inner.add(box(0.05, 0.05, D - 0.14, m.metal, sx * (W / 2 - 0.2), -0.05, 0));
      inner.add(box(W - 0.5, 0.04, 0.04, m.metal, 0, -0.05, sx * (D / 2 - 0.12)));
    }
    inner.rotation.x = Math.PI / 2 - 0.28;
    inner.position.y = D / 2 * Math.cos(0.28) + 0.03;
    g.add(inner);
  } else {
    const top = box(W, 0.05, D, m.cream, 0, H, 0);
    top.castShadow = top.receiveShadow = true;
    g.add(top);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(cyl(0.02, 0.024, H, 6, m.metal, sx * (W / 2 - 0.16), H / 2, sz * (D / 2 - 0.1)));
      }
      g.add(box(0.04, 0.04, D - 0.2, m.metal, sx * (W / 2 - 0.16), H * 0.35, 0));
    }
    g.add(box(W - 0.32, 0.04, 0.04, m.metal, 0, H - 0.08, 0));
    g.traverse((n) => { if (n.isMesh) n.castShadow = true; });
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}
