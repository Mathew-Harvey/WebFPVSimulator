import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { bake, trs, rngKit } from '../core/util.js';

/* ------------------------------------------------------------------ *
 * Freestyle planting.
 *
 * The town used to plant for a walker: a cloud of blossom, a fat AABB
 * around the cloud, and a street full of trees. A quad flies the GAPS,
 * so the planting is thinner and the solid world is the leaves, not
 * the box they sit in.
 *
 * TREE_KEEP is the fraction of spots that survive. It is a hash of the
 * seed, not a stride, so a row thins evenly instead of going bald then
 * dense. A spot marked `keep: true` is a landmark (the two cherries that
 * frame the crossing) and always survives. 0.28 is a second cut after
 * the original half: fewer trunks in the corridors, fewer blobs to
 * draw and to collide, load and frame both cheaper.
 * ------------------------------------------------------------------ */

export const TREE_KEEP = 0.28;
export const SHRUB_KEEP = 0.18;
export const BAMBOO_KEEP = 0.28;

/**
 * Keep a fraction of planted spots, deterministically.
 *
 * Integer hash, same as bake.js thinFoliage, so Node and the browser
 * agree. `keep: true` is a landmark and is not rolled.
 */
export function thinSpots(spots, keep, salt = 1) {
  if (!spots || !spots.length) return spots || [];
  if (!(keep < 1)) return spots;
  const cut = Math.round(keep * 4294967295);
  const out = [];
  for (let i = 0; i < spots.length; i += 1) {
    const s = spots[i];
    if (s.keep === true) {
      out.push(s);
      continue;
    }
    const seed = ((s.seed ?? 1) + salt * 17 + i * 13) | 0;
    const h = (Math.imul(seed, 2654435761) ^ 0x9e3779b9) >>> 0;
    if (h <= cut) out.push(s);
  }
  if (out.length === 0 && spots.length) out.push(spots[0]);
  return out;
}

/*
 * One collider per leaf blob, not one AABB around the tree and not a
 * flood of occupancy cells.
 *
 * The old canopy box was the hull of every blob, empty corners included:
 * a 4 m cube of air a pilot met as an invisible trunk. Rasterising each
 * blob onto a 0.55 m grid then wrote hundreds of thousands of boxes and
 * a 25 s load, which an average machine cannot hold. The blob's own
 * box is the drawing: an icosahedron or a cone already has an AABB, and
 * that is the contact volume. skipFit so a 4 m 御神木 blob is not slab
 * cut against a neighbouring wall.
 */
function collideLeaves(ctx, parts) {
  if (!parts.length) return 0;
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    const rz = p.rz ?? p.rx;
    ctx.collide(
      p.x - p.rx, p.z - rz, p.x + p.rx, p.z + rz,
      p.y + p.ry, p.y - p.ry, true,
    );
  }
  return parts.length;
}

/* ------------------------------------------------------------------ *
 * Cherry trees.
 *
 * Trunks and branches are merged into a single mesh; the canopy is three
 * instanced meshes, one per blossom tone.  Clusters of faceted blobs read
 * as painted blossom mass far better than any leaf geometry would, and
 * three tones give the canopy internal shape without any texture.
 * ------------------------------------------------------------------ */

const BLOB_TONES = [PAL.blossomLight, PAL.blossom, PAL.blossomDeep];

/**
 * @param spots [{ x, z, y, scale, seed, lean, tone }]
 */
export function buildSakura(ctx, spots) {
  const woodParts = [];
  const blobs = [[], [], []];
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1.0, 1, 7, 1);
  const branchGeo = new THREE.CylinderGeometry(0.25, 0.55, 1, 5, 1);
  const twigGeo = new THREE.CylinderGeometry(0.12, 0.3, 1, 4, 1);

  for (const spot of spots) {
    const rng = rngKit(spot.seed ?? 1);
    const S = spot.scale ?? 1;
    const x = spot.x;
    const z = spot.z;
    const y = spot.y ?? 0;
    const lean = spot.lean ?? 0;
    const leanDir = spot.leanDir ?? rng.range(0, Math.PI * 2);

    const trunkH = 2.5 * S * rng.range(0.9, 1.12);
    const trunkR = 0.2 * S;
    woodParts.push({
      geometry: trunkGeo,
      matrix: trs(x, y + trunkH / 2, z, lean * Math.sin(leanDir), 0, -lean * Math.cos(leanDir),
        trunkR, trunkH, trunkR),
    });
    // root flare
    woodParts.push({
      geometry: trunkGeo,
      matrix: trs(x, y + 0.16 * S, z, 0, 0, 0, trunkR * 1.5, 0.34 * S, trunkR * 1.5),
    });

    /* Where the trunk actually ends.
     *
     * The trunk is a cylinder rotated about its own *centre* by the Euler
     * (lean·sin d, 0, -lean·cos d) above, so its tip is the centre plus that
     * rotation applied to (0, trunkH/2, 0) -- and the small-angle form of that
     * is (h·lean·cos d, h, h·lean·sin d), not (0.9·trunkH·lean·sin d, …,
     * -0.9·trunkH·lean·cos d).  The old expression had sin and cos swapped and
     * used 0.9·trunkH where the half-height belongs, so the limbs and the whole
     * blossom mass were planted about 0.4 m away from a trunk top 0.17 m
     * across, at ninety degrees to the lean.  Every tree in the world was
     * detached from its own canopy, in a different direction each time.
     *
     * Applied exactly rather than approximated, so it stays right if anything
     * ever leans hard. */
    const tip = new THREE.Vector3(0, trunkH / 2, 0)
      .applyEuler(new THREE.Euler(lean * Math.sin(leanDir), 0, -lean * Math.cos(leanDir)));
    const topX = x + tip.x;
    const topZ = z + tip.z;
    const topY = y + trunkH / 2 + tip.y;

    // main limbs
    const limbs = 3 + Math.floor(rng.next() * 2);
    const canopyCenters = [];
    for (let i = 0; i < limbs; i++) {
      const a = (i / limbs) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const len = 1.9 * S * rng.range(0.82, 1.2);
      const tilt = rng.range(0.5, 0.85);
      const ex = topX + Math.cos(a) * Math.sin(tilt) * len;
      const ez = topZ + Math.sin(a) * Math.sin(tilt) * len;
      const ey = topY + Math.cos(tilt) * len;
      const mid = new THREE.Vector3((topX + ex) / 2, (topY + ey) / 2, (topZ + ez) / 2);
      const dir = new THREE.Vector3(ex - topX, ey - topY, ez - topZ);
      const l = dir.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(0.13 * S, l, 0.13 * S));
      woodParts.push({ geometry: branchGeo, matrix: m });
      canopyCenters.push(new THREE.Vector3(ex, ey, ez));

      // one fork per limb
      if (rng.next() < 0.75) {
        const dir2 = dir.clone().normalize()
          .add(new THREE.Vector3(rng.range(-0.7, 0.7), rng.range(0.1, 0.6), rng.range(-0.7, 0.7)))
          .normalize();
        const l2 = len * rng.range(0.5, 0.8);
        const e2 = new THREE.Vector3(ex, ey, ez).addScaledVector(dir2, l2);
        const mid2 = new THREE.Vector3().addVectors(new THREE.Vector3(ex, ey, ez), e2).multiplyScalar(0.5);
        const q2 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir2);
        woodParts.push({
          geometry: twigGeo,
          matrix: new THREE.Matrix4().compose(mid2, q2, new THREE.Vector3(0.09 * S, l2, 0.09 * S)),
        });
        canopyCenters.push(e2);
      }
    }

    /* Blossom mass: many small blobs rather than a few big ones.  Large
     * spheres read as boulders; a dense cluster of small faceted lumps
     * reads as painted blossom.  Tone is biased by height so the top of
     * the canopy catches the light and the underside stays deeper. */
    const count = 16 + Math.floor(rng.next() * 6);
    let yMin = Infinity, yMax = -Infinity;
    for (const c of canopyCenters) {
      yMin = Math.min(yMin, c.y);
      yMax = Math.max(yMax, c.y);
    }
    const leaves = [];
    const grow = (px, py, pz, rx, ry, rz) => {
      leaves.push({ x: px, y: py, z: pz, rx, ry, rz: rz ?? rx });
    };
    for (let i = 0; i < count; i++) {
      const c = canopyCenters[Math.floor(rng.next() * canopyCenters.length)];
      const r = 0.56 * S * rng.range(0.68, 1.3);
      const px = c.x + rng.range(-1.15, 1.15) * S;
      const py = c.y + rng.range(-0.55, 0.95) * S;
      const pz = c.z + rng.range(-1.15, 1.15) * S;
      let tone;
      if (spot.tone !== undefined) tone = spot.tone;
      else {
        const hi = (py - yMin) / Math.max(0.5, yMax + 1.2 * S - yMin);
        tone = hi > 0.62 ? 0 : hi < 0.28 ? 2 : 1;
        if (rng.next() < 0.22) tone = (tone + 1) % 3;
      }
      const ry = r * rng.range(0.68, 0.88);
      grow(px, py, pz, r, ry, r);
      blobs[tone].push(trs(px, py, pz,
        rng.range(0, 3), rng.range(0, 3), rng.range(0, 3),
        r, ry, r));
    }

    // a small cluster crowning the silhouette
    for (let i = 0; i < 3; i++) {
      const r = 0.6 * S * rng.range(0.8, 1.15);
      const px = topX + rng.range(-0.7, 0.7) * S;
      const py = topY + (1.25 + rng.range(0, 0.5)) * S;
      const pz = topZ + rng.range(-0.7, 0.7) * S;
      const ry = r * 0.8;
      grow(px, py, pz, r, ry, r);
      blobs[0].push(trs(
        px, py, pz,
        rng.range(0, 3), rng.range(0, 3), rng.range(0, 3),
        r, ry, r
      ));
    }

    /* Trunk is the stem. Canopy is the blobs, one box per blob, so
     * the air in the corners of the old AABB is a gap again. */
    if (spot.collide !== false) {
      const mx = (x + topX) * 0.5;
      const mz = (z + topZ) * 0.5;
      const tw = trunkR * 1.05;
      ctx.collide(mx - tw, mz - tw, mx + tw, mz + tw, y + trunkH, y);
      ctx.collide(x - trunkR * 1.5, z - trunkR * 1.5, x + trunkR * 1.5, z + trunkR * 1.5, y + 0.34 * S, y);
      collideLeaves(ctx, leaves);
    }
  }

  const wood = new THREE.Mesh(bake(woodParts), cel({ color: PAL.trunk, bands: 3, tint: 0x8a7290 }));
  wood.castShadow = true;
  wood.receiveShadow = true;
  wood.name = 'sakuraWood';
  ctx.add(wood);

  const blobGeo = new THREE.IcosahedronGeometry(1, 0);
  const canopies = [];
  // Blossom keeps a pink cast even in shade: a violet tint turns it grey, and
  // a normal ramp makes the away-facing side of the canopy read as mauve rock,
  // so the canopy gets a deliberately high-key two-band ramp.
  const BLOB_TINT = [0xe2c3d2, 0xd8b2c6, 0xc99cba];
  blobs.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(
      blobGeo,
      cel({ color: BLOB_TONES[i], bands: 'soft', tint: BLOB_TINT[i] }),
      list.length
    );
    list.forEach((m, k) => inst.setMatrixAt(k, m));
    inst.castShadow = true;
    /* Blossom does not *receive* shadow.
     *
     * The high-key ramp keeps the away-facing side of the canopy light, but a
     * ramp only shapes *direct* light: once the shadow map zeroes the sun, the
     * blob falls back to ambient and comes out as a dark violet lump.  A big
     * cherry self-shadows heavily, so whole trees were going grey -- and an
     * isolated dark blob against the sky reads as a rendering fault, not as
     * shade.  Turning receive off makes the canopy behave the way blossom is
     * actually painted: a flat high-key mass whose form comes from its three
     * tones, lit the same wherever it stands.  It still casts, which is what
     * dapples the ground underneath. */
    inst.receiveShadow = false;
    inst.name = 'sakuraCanopy' + i;
    ctx.add(inst);
    canopies.push(inst);
  });

  [trunkGeo, branchGeo, twigGeo].forEach((g) => g.dispose());
  return { wood, canopies };
}

/* ------------------------------------------------------------------ *
 * The green canopy.
 *
 * Blossom cannot carry every tree in the world: the shrine wants deep shade
 * and a towering 御神木, the canal wants scruffy bank growth, and the school
 * wants something dark behind its pale walls.  Same construction as the
 * cherries -- merged wood, instanced blobs -- but taller, denser and in
 * three teal-leaning greens instead of three pinks.
 * ------------------------------------------------------------------ */

/**
 * The grove's three greens, plus a fourth that only the 柳 uses.
 *
 * `PAL.willow` is deliberately the palest, yellowest green in the world: a weeping
 * willow in spring is *lighter* than everything round it, and at a lake that is
 * the entire reason to have one.  Two of the three greens above are darker than
 * the hillside they stand on, so a willow drawn out of them is a dark lump beside
 * water instead of the one pale, moving thing on a shore.
 */
const GREEN_TONES = [0x8cb884, 0x5f9470, PAL.cedar, PAL.willow];

/**
 * @param spots [{ x, z, y, scale, seed, lean, leanDir, spread, tone }]
 */
export function buildGrove(ctx, spots) {
  if (!spots.length) return null;
  const woodParts = [];
  const blobs = [[], [], [], []];
  const trunkGeo = new THREE.CylinderGeometry(0.62, 1.0, 1, 7, 1);
  const branchGeo = new THREE.CylinderGeometry(0.28, 0.6, 1, 5, 1);

  for (const spot of spots) {
    const rng = rngKit(spot.seed ?? 1);
    const S = spot.scale ?? 1;
    const { x, z } = spot;
    const y = spot.y ?? 0;
    const lean = spot.lean ?? 0;
    const leanDir = spot.leanDir ?? rng.range(0, Math.PI * 2);
    const spread = spot.spread ?? 1;

    /**
     * 柳 -- the weeping willow, and it is the same generator with three numbers
     * changed rather than a fourth tree species.
     *
     * That is a deliberate limit.  `buildCedar` earned its own file's worth of
     * geometry because a 杉林 is a *mass* seen at fifty metres and needed a
     * different silhouette to be one.  A willow is only ever seen close, standing
     * alone on a bank, and what makes it a willow is three things a blob canopy
     * can already do: a taller thinner stem, limbs that go **out** rather than up,
     * and the canopy hanging *below* the limb ends instead of piled above them.
     *
     * The last one is the whole trick.  Every canopy in this world is placed at
     * `c.y + range(-0.7, 1.5)·S`, i.e. biased upward, because that is what a shade
     * tree does.  Inverting that bias and stretching each blob vertically gives a
     * curtain, and a pale curtain over water at four metres reads as a 柳 without
     * a single new vertex format.
     */
    const willow = spot.willow === true;
    const trunkH = (willow ? 4.3 : 3.6) * S * rng.range(0.9, 1.15);
    const trunkR = (willow ? 0.185 : 0.24) * S;
    woodParts.push({
      geometry: trunkGeo,
      matrix: trs(x, y + trunkH / 2, z, lean * Math.sin(leanDir), 0, -lean * Math.cos(leanDir),
        trunkR, trunkH, trunkR),
    });
    woodParts.push({
      geometry: trunkGeo,
      matrix: trs(x, y + 0.2 * S, z, 0, 0, 0, trunkR * 1.55, 0.42 * S, trunkR * 1.55),
    });

    /* Where the trunk actually ends.
     *
     * The trunk is a cylinder rotated about its own *centre* by the Euler
     * (lean·sin d, 0, -lean·cos d) above, so its tip is the centre plus that
     * rotation applied to (0, trunkH/2, 0) -- and the small-angle form of that
     * is (h·lean·cos d, h, h·lean·sin d), not (0.9·trunkH·lean·sin d, …,
     * -0.9·trunkH·lean·cos d).  The old expression had sin and cos swapped and
     * used 0.9·trunkH where the half-height belongs, so the limbs and the whole
     * blossom mass were planted about 0.4 m away from a trunk top 0.17 m
     * across, at ninety degrees to the lean.  Every tree in the world was
     * detached from its own canopy, in a different direction each time.
     *
     * Applied exactly rather than approximated, so it stays right if anything
     * ever leans hard. */
    const tip = new THREE.Vector3(0, trunkH / 2, 0)
      .applyEuler(new THREE.Euler(lean * Math.sin(leanDir), 0, -lean * Math.cos(leanDir)));
    const topX = x + tip.x;
    const topZ = z + tip.z;
    const topY = y + trunkH / 2 + tip.y;

    const limbs = (willow ? 5 : 3) + Math.floor(rng.next() * 3);
    const centers = [];
    for (let i = 0; i < limbs; i++) {
      const a = (i / limbs) * Math.PI * 2 + rng.range(-0.4, 0.4);
      /* **1.35, not 2.1.**  At 2.1·S the limbs reach 2.6 m out and the fronds hang
       * *inside* them, so what the frame showed was five bare dark poles radiating
       * from the trunk with foliage beyond -- spokes, not a willow.  A weeping
       * canopy's limbs are shorter than its curtain by definition; the reach comes
       * from the fronds. */
      const len = (willow ? 1.35 : 1.5) * S * rng.range(0.8, 1.25);
      // out, not up: a willow's limbs are near horizontal before they fall
      const tilt = willow ? rng.range(1.02, 1.42) : rng.range(0.35, 0.7);
      const ex = topX + Math.cos(a) * Math.sin(tilt) * len * spread;
      const ez = topZ + Math.sin(a) * Math.sin(tilt) * len * spread;
      const ey = topY + Math.cos(tilt) * len;
      const dir = new THREE.Vector3(ex - topX, ey - topY, ez - topZ);
      const l = dir.length();
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      woodParts.push({
        geometry: branchGeo,
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3((topX + ex) / 2, (topY + ey) / 2, (topZ + ez) / 2),
          q, new THREE.Vector3(0.15 * S, l, 0.15 * S)),
      });
      centers.push(new THREE.Vector3(ex, ey, ez));
    }

    /* Denser and rounder than blossom: a shade tree is a single mass with a
     * lit crown, not a cloud of separate puffs.
     *
     * A willow still uses small fronds. 40 blobs at 0.5 S read as pale
     * lozenges a metre across. 120 at 0.185 S was a curtain from the bank
     * and a thousand boxes a quad paid whether it flew the lake or not.
     * 48 keeps the small unit. The grove's 16 is the same cut: airier
     * canopy, same blob size, so the box still hugs the leaf. */
    const count = (willow ? 48 : 16) + Math.floor(rng.next() * (willow ? 8 : 6));
    let yMin = Infinity, yMax = -Infinity;
    for (const c of centers) {
      yMin = Math.min(yMin, c.y);
      yMax = Math.max(yMax, c.y);
    }
    const leaves = [];
    const grow = (px, py, pz, rx, ry, rz) => {
      leaves.push({ x: px, y: py, z: pz, rx, ry, rz: rz ?? rx });
    };
    for (let i = 0; i < count; i++) {
      const c = centers[Math.floor(rng.next() * centers.length)];
      if (willow) {
        /* The curtain: hung from a limb end, falling toward the ground and never
         * through it.  Each frond is a blob stretched to 1.7 : 1 vertically, which
         * at this blob count is what turns a cloud into hanging foliage.
         *
         * `Math.max(y + 0.5·S, …)` is the one guard that matters: a willow leans,
         * its limbs reach 2.6 m out, and unclamped the lowest fronds on the
         * downhill side end up *inside* the bank -- which on a shore means inside
         * the water, where they read as a green stain on the surface. */
        const r = 0.185 * S * rng.range(0.7, 1.25);
        const fall = rng.range(0.05, 1.0);
        const px = c.x + rng.range(-1.05, 1.05) * S * spread;
        const pz = c.z + rng.range(-1.05, 1.05) * S * spread;
        const py = Math.max(y + 0.55 * S, c.y + 0.42 * S - fall * (c.y - y) * 0.95);
        /* 62 / 38 rather than 74 / 26.  The pale tone is what makes it a willow and
         * the mid green is what stops it being a cloud of it; at three quarters pale
         * the whole tree read as one flat area of `PAL.willow`, which is the
         * brightest thing in the palette. */
        const tone = rng.next() < 0.62 ? 3 : 1;
        const ry = r * rng.range(1.7, 2.6);
        const rz = r * rng.range(0.85, 1.05);
        grow(px, py, pz, r, ry, rz);
        blobs[tone].push(trs(px, py, pz,
          0, rng.range(0, 3), rng.range(-0.25, 0.25),
          r, ry, rz));
        continue;
      }
      const r = 0.72 * S * rng.range(0.7, 1.25);
      const px = c.x + rng.range(-1.25, 1.25) * S * spread;
      const py = c.y + rng.range(-0.7, 1.5) * S;
      const pz = c.z + rng.range(-1.25, 1.25) * S * spread;
      let tone;
      if (spot.tone !== undefined) tone = spot.tone;
      else {
        const hi = (py - yMin) / Math.max(0.5, yMax + 1.6 * S - yMin);
        tone = hi > 0.66 ? 0 : hi < 0.3 ? 2 : 1;
        if (rng.next() < 0.2) tone = (tone + 1) % 3;
      }
      const ry = r * rng.range(0.7, 0.92);
      grow(px, py, pz, r, ry, r);
      blobs[tone].push(trs(px, py, pz,
        rng.range(0, 3), rng.range(0, 3), rng.range(0, 3),
        r, ry, r));
    }
    if (spot.collide !== false) {
      const mx = (x + topX) * 0.5;
      const mz = (z + topZ) * 0.5;
      const tw = trunkR * 1.05;
      ctx.collide(mx - tw, mz - tw, mx + tw, mz + tw, y + trunkH, y);
      ctx.collide(x - trunkR * 1.55, z - trunkR * 1.55, x + trunkR * 1.55, z + trunkR * 1.55, y + 0.42 * S, y);
      collideLeaves(ctx, leaves);
    }
  }

  const wood = new THREE.Mesh(bake(woodParts), cel({ color: PAL.trunkDark, bands: 3, tint: 0x6f5a80 }));
  wood.castShadow = wood.receiveShadow = true;
  wood.name = 'groveWood';
  ctx.add(wood);

  const blobGeo = new THREE.IcosahedronGeometry(1, 0);
  blobs.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(
      blobGeo, cel({ color: GREEN_TONES[i], bands: 3, tint: 0x5b6f8c }), list.length);
    list.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.castShadow = true;
    /* Green canopies do not receive shadow either -- and this is the one that
     * was actually causing the black circles in the sky.
     *
     * The note on the blossom canopy above explains the mechanism: a ramp only
     * shapes *direct* light, so once the shadow map zeroes the sun a blob falls
     * back to ambient.  On blossom that produced a dark violet lump, which is
     * why receive was turned off there.  On these it is far worse, because the
     * deepest green tone starts at #3f6b52 -- ambient on top of that with a
     * violet tint is very nearly black.  A big tree self-shadows heavily, so
     * what you got was a handful of *isolated* blobs on one canopy going black
     * while the rest of the tree looked fine: round dark circles hanging in the
     * sky, which is exactly how they were reported.  Worst against clear sky,
     * and the district has grove rings east of the bridge, behind the school
     * and along the canal that are all seen that way.
     *
     * The fix had been applied to the blossom and never to the green. */
    inst.receiveShadow = false;
    inst.name = 'groveCanopy' + i;
    ctx.add(inst);
  });

  [trunkGeo, branchGeo].forEach((g) => g.dispose());
  return wood;
}

/* ------------------------------------------------------------------ *
 * 杉 -- the cedar plantation.
 *
 * The second tree species on the hills, and it exists because of a measurement
 * rather than because a range wants variety.  Everything green on ひばり山 came
 * out of `buildGrove`, which has exactly **one** canopy form: a cloud of
 * icosahedral blobs round a short trunk, in three tones.  Vary the scale, the
 * spread and the lean of that as much as you like and every tree in the world is
 * still the same rounded lump, so a hundred and fifty metres of hillside is a
 * field of identical bubbles with a smooth green arc for a skyline.
 *
 * A Japanese 里山 is *read* as Japanese by its 杉林: tall, narrow, dark, conical,
 * clean-trunked, planted in blocks with a hard straight edge against the
 * broadleaf.  Adding it fixes three separate things at once and that is why it
 * is worth a second generator rather than another set of tones:
 *
 *   - **scale.**  A faceted hillside has nothing on it of known size (the same
 *     argument `buildOutcrops` is there for, one order up).  An 11 m tree with a
 *     3.4 m crown standing on a 14 m hill says how big the hill is; a 6 m blob
 *     does not, because a blob could be a bush two metres away.
 *   - **the skyline.**  The ridge lines were a smooth green arc, because the
 *     blob canopy's silhouette is a circle and a row of circles is a scallop.  A
 *     row of narrow cones is a saw, which is what a wooded ridge looks like
 *     against the sky and what the ink pass has been wanting something to draw.
 *   - **vertical.**  Nothing on the range stood up.  The cel ramp cannot shade a
 *     gentle slope here (see the note by `hillGrassSun` in the palette), so the
 *     only way a slope reads as a slope is for something on it to be *plumb* and
 *     for the eye to compare the two.  A cedar is the most plumb thing there is.
 *
 * **The construction is a stack of cones, and it must not be blobs.**  The whole
 * value of the species is that its silhouette differs; drawing it out of the same
 * `IcosahedronGeometry` in darker greens gives a dark bubble, which is worse than
 * nothing because it reads as the grove in shadow.  Seven overlapping 7-sided
 * cones of decreasing radius, each turned a random amount about its own axis, is
 * one instanced draw call per tone and comes out as a narrow ragged wedge.
 *
 * **The trunk carries the base of the tree on its own.**  A plantation is pruned,
 * so the bottom third to two fifths of the stem is bare -- and a stand of bare
 * vertical stems under a dark canopy is the single most recognisable thing about
 * a 杉林 from inside it.  So the crown starts at 0.30-0.42 of the height, not at
 * the ground, and the trunk is a redder wood than the broadleaf's.
 *
 * Two things are deliberate and easy to undo:
 *
 *   - **the lean is almost nothing** (0-0.045 against the grove's 0.02-0.14).
 *     Planted sugi are dead straight, and the straightness is the tell.  It is
 *     also arithmetic: the trunk here is placed by its **base** rather than by its
 *     centre, because at 11 m a lean of 0.06 applied about the centre walks the
 *     foot of the tree a third of a metre away from its own collider.
 *   - **no canopy receives shadow**, blossom or green or needle.  A ramp only
 *     shapes direct light, so a blob the shadow map has zeroed falls back to
 *     ambient -- and at `cedarDeep` (0x2f5540) ambient under a violet tint is
 *     very nearly black.  This is the failure that hung round dark circles in the
 *     sky off the grove canopies for several rounds; see the long note there.
 * ------------------------------------------------------------------ */

const CEDAR_TONES = [PAL.cedarLit, PAL.cedar, PAL.cedarDeep];

/**
 * @param spots [{ x, z, y, scale, seed, lean, leanDir, collide }]
 */
export function buildCedar(ctx, spots) {
  if (!spots.length) return null;
  const woodParts = [];
  const tiers = [[], [], []];
  /* A hard taper on the stem: a sugi is 0.27 m at breast height and a good deal
   * fatter at the butt, and that flare is most of what a bare trunk has to look
   * at.  Six sides, because a plantation is seen as a row of verticals and the
   * facet count only ever costs. */
  const trunkGeo = new THREE.CylinderGeometry(0.34, 1.0, 1, 6, 1);
  /* Base at the origin rather than centred, so a tier is placed by the height it
   * springs from -- which is the number the layout is written in. */
  const coneGeo = new THREE.ConeGeometry(1, 1, 7, 1);
  coneGeo.translate(0, 0.5, 0);

  for (const spot of spots) {
    const rng = rngKit(spot.seed ?? 3);
    const S = spot.scale ?? 1;
    const { x, z } = spot;
    const y = spot.y ?? 0;
    const lean = spot.lean ?? 0;
    const leanDir = spot.leanDir ?? rng.range(0, Math.PI * 2);

    const H = 10.6 * S * rng.range(0.82, 1.18);
    const trunkR = 0.125 * S * rng.range(0.86, 1.22);

    /* The stem's axis, and everything on the tree is placed **along it from the
     * foot**.  `trs` rotates a part about its own centre, so a trunk written the
     * usual way -- centre at `y + H/2`, Euler applied -- has its base at
     * `centre - axis·H/2`, which at 11 m and a lean of 0.05 is 0.28 m away from
     * where the tree is supposed to be standing.  On a 3 m canopy nobody sees it;
     * on a bare 4 m stem next to its own collider it is the whole silhouette. */
    const eul = new THREE.Euler(lean * Math.sin(leanDir), 0, -lean * Math.cos(leanDir));
    const axis = new THREE.Vector3(0, 1, 0).applyEuler(eul);
    const at = (h) => new THREE.Vector3(x, y, z).addScaledVector(axis, h);

    const c = at(H / 2);
    woodParts.push({
      geometry: trunkGeo,
      matrix: trs(c.x, c.y, c.z, eul.x, 0, eul.z, trunkR, H, trunkR),
    });
    const f = at(0.3 * S);
    woodParts.push({
      geometry: trunkGeo,
      matrix: trs(f.x, f.y, f.z, 0, 0, 0, trunkR * 1.9, 0.6 * S, trunkR * 1.9),
    });

    /* The crown.  `base` is the pruned height, `rMax` the half-width at the
     * bottom whorl -- 0.15 of the tree's height, so an 11 m cedar is 3.3 m across
     * and the wedge is three times as tall as it is wide.  The grove's blobs are
     * about as wide as they are tall, which is the difference the whole species
     * is here for. */
    const base = H * rng.range(0.30, 0.42);
    const crown = H - base;
    const n = 5 + rng.int(0, 1);
    const rMax = H * 0.150 * rng.range(0.86, 1.14);

    const leaves = [];
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const hk = base + crown * (u + rng.range(-0.03, 0.03));
      /* 2.15 whorl spacings tall, so each cone's skirt hangs well over the one
       * below and the outline is a serrated edge rather than a stack of discs. */
      const ck = (crown / n) * 2.15 * rng.range(0.86, 1.14);
      const rk = rMax * Math.pow(1 - u, 0.82) * rng.range(0.88, 1.1);
      const p = at(hk);
      const off = rng.range(0, 6.28);
      const wob = rk * 0.09;
      /* A whorl is not a lampshade.  Written as a cone of one radius sitting
       * square on the stem, the seven-sided rim reads as a *disc* and a tree is a
       * stack of them -- fine at forty metres, mechanical at five, and the glade
       * and the crest walk both put you at five.  A per-tier ellipse and a couple
       * of degrees of tilt cost nothing in the instance matrix and break every
       * rim out of the horizontal. */
      const ell = rng.range(0.84, 1.18);
      const tx = eul.x + rng.range(-0.07, 0.07);
      const tz = eul.z + rng.range(-0.07, 0.07);
      /* Lighter at the top, deepest underneath -- the same height bias the grove
       * uses, and for the same reason: it is the only internal form a canopy with
       * no texture on it can have. */
      let tone = u > 0.62 ? 0 : u < 0.26 ? 2 : 1;
      if (rng.chance(0.18)) tone = (tone + 1) % 3;
      const cx = p.x + Math.cos(off) * wob;
      const cz = p.z + Math.sin(off) * wob;
      tiers[tone].push(trs(
        cx, p.y, cz,
        tx, rng.range(0, 6.28), tz,
        rk, ck, rk * ell
      ));
      /* Two stacked boxes follow the cone: wide at the skirt, narrow at the
       * point. One cylinder around the whole crown was empty air a quad met
       * as a wall. */
      leaves.push({
        x: cx, y: p.y + ck * 0.28, z: cz,
        rx: rk * 0.78, ry: ck * 0.30, rz: rk * ell * 0.78,
      });
      leaves.push({
        x: cx, y: p.y + ck * 0.68, z: cz,
        rx: rk * 0.42, ry: ck * 0.28, rz: rk * ell * 0.42,
      });
    }
    // the leader: a slim cone finishing the point, so the top is a spike
    {
      const p = at(base + crown * 0.86);
      const ck = crown * 0.30 * rng.range(0.9, 1.25);
      const rk = rMax * 0.30;
      tiers[0].push(trs(p.x, p.y, p.z, eul.x, rng.range(0, 6.28), eul.z,
        rk, ck, rk));
      leaves.push({
        x: p.x, y: p.y + ck * 0.45, z: p.z,
        rx: rk * 0.7, ry: ck * 0.45, rz: rk * 0.7,
      });
    }
    // one sprig, so no two crowns have the same outline
    {
      const u = rng.range(0.15, 0.8);
      const p = at(base + crown * u);
      const rk = rMax * (1 - u) * rng.range(0.45, 0.8);
      const ck = rk * rng.range(1.3, 2.0);
      const a = rng.range(0, 6.28);
      const cx = p.x + Math.cos(a) * rk * 0.55;
      const cz = p.z + Math.sin(a) * rk * 0.55;
      tiers[rng.chance(0.5) ? 1 : 2].push(trs(
        cx, p.y, cz,
        eul.x, rng.range(0, 6.28), eul.z,
        rk, ck, rk
      ));
      leaves.push({
        x: cx, y: p.y + ck * 0.4, z: cz,
        rx: rk * 0.72, ry: ck * 0.4, rz: rk * 0.72,
      });
    }

    /* Thin stem to the pruned height. Crown is the cones, clustered so
     * the square around the wedge is not a wall. */
    if (spot.collide !== false) {
      const neck = at(base);
      const tw = trunkR * 1.08;
      ctx.collide(
        Math.min(x, neck.x) - tw, Math.min(z, neck.z) - tw,
        Math.max(x, neck.x) + tw, Math.max(z, neck.z) + tw,
        y + base, y);
      collideLeaves(ctx, leaves);
    }
  }

  const wood = new THREE.Mesh(bake(woodParts), cel({ color: PAL.cedarBark, bands: 3, tint: 0x6f5a80 }));
  wood.castShadow = wood.receiveShadow = true;
  wood.name = 'cedarWood';
  ctx.add(wood);

  tiers.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(
      coneGeo, cel({ color: CEDAR_TONES[i], bands: 3, tint: 0x59657f }), list.length);
    list.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.castShadow = true;
    // see the header: no canopy in this world receives shadow, and this is the
    // darkest one there is
    inst.receiveShadow = false;
    inst.name = 'cedarCanopy' + i;
    ctx.add(inst);
  });

  trunkGeo.dispose();
  return wood;
}

/**
 * Bamboo.  Thin vertical culms with a light spray of leaf near the top --
 * the one plant whose silhouette is all line and no mass, which is exactly
 * why a shrine wants it against all that blossom.
 */
export function buildBamboo(ctx, clumps) {
  if (!clumps.length) return null;
  const culmGeo = new THREE.CylinderGeometry(1, 1.16, 1, 5, 1);
  const nodeGeo = new THREE.CylinderGeometry(1.25, 1.25, 1, 5, 1);
  const culms = [[], []];
  const nodes = [];
  const leaves = [[], []];

  for (const c of clumps) {
    const rng = rngKit(c.seed ?? 5);
    const n = c.n ?? 9;
    for (let i = 0; i < n; i++) {
      const S = c.scale ?? 1;
      const h = (4.2 + rng.range(-1.0, 1.4)) * S;
      const r = 0.045 * S * rng.range(0.85, 1.2);
      const px = c.x + rng.range(-1, 1) * (c.spread ?? 1.2);
      const pz = c.z + rng.range(-1, 1) * (c.spread ?? 1.2);
      const lean = rng.range(-0.07, 0.07);
      const leanD = rng.range(0, 6.3);
      const tone = i % 2;
      culms[tone].push(trs(px, (c.y ?? 0) + h / 2, pz,
        lean * Math.sin(leanD), 0, -lean * Math.cos(leanD), r, h, r));
      for (let k = 1; k < 5; k++) {
        nodes.push(trs(px + lean * Math.sin(leanD) * (h * (k / 5) - h / 2),
          (c.y ?? 0) + h * (k / 5), pz - lean * Math.cos(leanD) * (h * (k / 5) - h / 2),
          0, 0, 0, r, 0.035 * S, r));
      }
      // leaf spray: a few flattened blobs high on the culm
      const leafParts = [];
      for (let k = 0; k < 3; k++) {
        const ly = (c.y ?? 0) + h * rng.range(0.66, 1.0);
        const rr = 0.34 * S * rng.range(0.7, 1.2);
        const lx = px + rng.range(-0.5, 0.5) * S;
        const lz = pz + rng.range(-0.5, 0.5) * S;
        leaves[k % 2].push(trs(
          lx, ly, lz,
          rng.range(0, 3), rng.range(0, 3), rng.range(0, 3),
          rr, rr * 0.42, rr * 1.25));
        leafParts.push({ x: lx, y: ly, z: lz, rx: rr, ry: rr * 0.42, rz: rr * 1.25 });
      }
      if (c.collide !== false) {
        const tw = Math.max(0.055, r * 1.4);
        const y0 = c.y ?? 0;
        ctx.collide(px - tw, pz - tw, px + tw, pz + tw, y0 + h, y0);
        collideLeaves(ctx, leafParts);
      }
    }
  }

  const culmTone = [PAL.bamboo, PAL.bambooDeep];
  culms.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(
      culmGeo, cel({ color: culmTone[i], bands: 3, tint: 0x5b6f8c }), list.length);
    list.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.castShadow = true;
    ctx.add(inst);
  });
  if (nodes.length) {
    const inst = new THREE.InstancedMesh(
      nodeGeo, cel({ color: 0xb8c88a, bands: 2, tint: 0x5b6f8c }), nodes.length);
    nodes.forEach((mx, k) => inst.setMatrixAt(k, mx));
    ctx.add(inst);
  }
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  leaves.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(
      leafGeo, cel({ color: i ? PAL.bambooDeep : 0xa6c078, bands: 3, tint: 0x5b6f8c }), list.length);
    list.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.castShadow = true;
    inst.name = 'bambooCanopy' + i;
    ctx.add(inst);
  });
  // culmGeo / nodeGeo / leafGeo belong to the instanced meshes; not disposable
  return true;
}

/** Rounded low-poly shrubs, in a slightly teal green. */
export function buildShrubs(ctx, spots) {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const tones = [PAL.leaf, PAL.leafDeep, PAL.leafPale];
  const lists = [[], [], []];
  const leaves = [];
  for (const s of spots) {
    const rng = rngKit(s.seed ?? 11);
    const n = s.count ?? 2;
    for (let i = 0; i < n; i++) {
      const r = (s.r ?? 0.55) * rng.range(0.75, 1.2);
      const px = s.x + rng.range(-0.5, 0.5) * (s.spread ?? 1);
      const py = (s.y ?? 0) + r * 0.72;
      const pz = s.z + rng.range(-0.5, 0.5) * (s.spread ?? 1);
      const ry = r * 0.8;
      lists[i % 3].push(trs(
        px, py, pz,
        rng.range(0, 3), rng.range(0, 3), rng.range(0, 3),
        r, ry, r
      ));
      if (s.collide !== false) {
        leaves.push({ x: px, y: py, z: pz, rx: r, ry, rz: r });
      }
    }
  }
  collideLeaves(ctx, leaves);
  lists.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(geo, cel({ color: tones[i], bands: 3, tint: 0x5b6f8c }), list.length);
    list.forEach((m, k) => inst.setMatrixAt(k, m));
    inst.castShadow = true;
    inst.receiveShadow = false;
    inst.name = 'shrubCanopy' + i;
    ctx.add(inst);
  });
}

/**
 * Distant tree line: flat billboarded silhouettes in the haze colour,
 * cheap depth for the far background.
 */
export function buildDistantTrees(ctx) {
  const rng = rngKit(6543);
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const lists = [[], []];
  for (let i = 0; i < 150; i++) {
    const side = rng.next() < 0.5 ? -1 : 1;
    // keep the street's vanishing point clear -- a lone blob there reads as a
    // rock sitting in the road
    let x = rng.range(-190, 190);
    if (Math.abs(x) < 30) x += x < 0 ? -30 : 30;
    const z = side > 0 ? rng.range(-160, -52) : rng.range(58, 150);
    const r = rng.range(3.0, 6.5);
    const t = Math.abs(z) > 100 ? 1 : 0;
    lists[t].push(trs(x, r * 0.55, z, rng.range(0, 3), rng.range(0, 3), rng.range(0, 3), r, r * 0.85, r));
  }
  const tones = [0xa8c0b4, PAL.hill];
  lists.forEach((list, i) => {
    const inst = new THREE.InstancedMesh(geo, i === 0
      ? cel({ color: tones[0], bands: 2, tint: 0x7a86a8 })
      : flat({ color: tones[1] }), list.length);
    list.forEach((m, k) => inst.setMatrixAt(k, m));
    ctx.add(inst);
  });
}
