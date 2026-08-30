import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { flat } from '../core/toon.js';
import { petalTex } from '../core/textures.js';
import { rngKit } from '../core/util.js';
import { centerX, groundY } from './street.js';

/* ------------------------------------------------------------------ *
 * Falling blossom.
 *
 * Petals drift down in slow overlapping waves, tumbling on their own
 * axis.  Density is deliberately restrained -- enough to catch the light
 * across the road and the tracks, never enough to obscure the frame.  The
 * whole field takes a sideways shove when the train goes past.
 * ------------------------------------------------------------------ */

const COUNT = 980;
const TOP = 6.8;
const Z0 = -30;
const Z1 = 34;
const HALF = 9.5;

export function buildPetals(ctx) {
  const rng = rngKit(8123);
  const tex = petalTex();

  const geo = new THREE.PlaneGeometry(0.185, 0.135);
  const groups = [
    { color: PAL.petal, n: Math.round(COUNT * 0.55) },
    { color: PAL.blossomLight, n: Math.round(COUNT * 0.28) },
    { color: PAL.petalDeep, n: COUNT - Math.round(COUNT * 0.55) - Math.round(COUNT * 0.28) },
  ];

  const meshes = [];
  const P = [];
  for (const grp of groups) {
    const mat = flat({
      color: grp.color, map: tex, transparent: true, opacity: 0.95,
      depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.32, cache: false,
    });
    const inst = new THREE.InstancedMesh(geo, mat, grp.n);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.frustumCulled = false;
    inst.renderOrder = 4;
    inst.name = 'petalField';
    inst.userData.noOutline = true;
    ctx.add(inst);
    meshes.push(inst);
    for (let i = 0; i < grp.n; i++) {
      P.push({
        mesh: inst,
        idx: i,
        x: rng.range(-HALF, HALF),
        y: rng.range(0.2, TOP),
        z: rng.range(Z0, Z1),
        fall: rng.range(0.42, 0.86),
        swayAmp: rng.range(0.25, 0.75),
        swayFreq: rng.range(0.5, 1.35),
        phase: rng.range(0, 10),
        spin: new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize(),
        spinRate: rng.range(0.5, 2.4),
        angle: rng.range(0, 6.28),
        scale: rng.range(0.78, 1.25),
        drift: rng.range(-0.16, 0.16),
      });
    }
  }

  const dummy = new THREE.Object3D();
  const q = new THREE.Quaternion();
  const scaleV = new THREE.Vector3();
  let t = 0;

  function respawn(p) {
    p.x = rng.range(-HALF, HALF);
    p.z = rng.range(Z0, Z1);
    p.y = TOP + rng.range(0, 1.4);
    p.phase = rng.range(0, 10);
  }

  function update(dt, gust, gustDir) {
    t += dt;
    const wind = gust * 5.4 * gustDir;
    const lift = gust * 1.5;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      // large slow wave + small fast flutter: reads as air, not noise
      const s = Math.sin(t * p.swayFreq + p.phase);
      const s2 = Math.sin(t * p.swayFreq * 2.7 + p.phase * 1.7);
      p.y -= (p.fall + gust * 0.4) * dt;
      p.x += (p.swayAmp * s * 0.55 + p.drift + wind * 0.24) * dt;
      p.z += (p.swayAmp * s2 * 0.32 + wind * 0.05) * dt;
      p.y += lift * Math.max(0, 1 - Math.abs(p.z) / 8) * dt;
      p.angle += p.spinRate * dt * (1 + gust);

      const cx = centerX(p.z);
      if (p.x < cx - HALF) p.x = cx + HALF;
      if (p.x > cx + HALF) p.x = cx - HALF;
      if (p.z < Z0) p.z = Z1;
      if (p.z > Z1) p.z = Z0;
      if (p.y < groundY(p.z) + 0.04) respawn(p);

      q.setFromAxisAngle(p.spin, p.angle);
      dummy.position.set(p.x, p.y, p.z);
      dummy.quaternion.copy(q);
      scaleV.setScalar(p.scale);
      dummy.scale.copy(scaleV);
      dummy.updateMatrix();
      p.mesh.setMatrixAt(p.idx, dummy.matrix);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }

  // settle the field so the very first frame already has petals mid-air
  for (let i = 0; i < 40; i++) update(0.1, 0, 1);

  buildFallenPetals(ctx, tex);
  return { update, meshes };
}

/**
 * Fallen blossom over arbitrary patches, for the districts away from the
 * street.
 *
 * Called once with every patch in the world: each tone is one instanced mesh,
 * so a dozen scattered drifts still cost three draw calls.  Petals stay out of
 * the depth buffer -- the ink pass would otherwise outline every one of them
 * into speckle.
 */
export function buildFallenPatches(ctx, patches) {
  if (!patches || !patches.length) return null;
  const rng = rngKit(6619);
  const tex = petalTex();
  const geo = new THREE.PlaneGeometry(0.17, 0.125);
  geo.rotateX(-Math.PI / 2);
  const tones = [PAL.petal, PAL.blossomLight, PAL.petalDeep];
  const lists = [[], [], []];
  const dummy = new THREE.Object3D();

  for (const p of patches) {
    const n = p.n ?? 90;
    for (let i = 0; i < n; i++) {
      // biased to the edges: wind pushes petals against kerbs and walls
      const u = rng.next();
      const edge = u < 0.45 ? rng.sign() * rng.range(0.34, 0.5) : rng.range(-0.34, 0.34);
      const other = rng.range(-0.48, 0.48);
      const alongX = rng.chance(0.5);
      dummy.position.set(
        p.x + (alongX ? other : edge) * p.w,
        (p.y ?? 0) + 0.021,
        p.z + (alongX ? edge : other) * p.d
      );
      dummy.rotation.set(0, rng.range(0, 6.28), 0);
      const s = rng.range(0.8, 1.3);
      dummy.scale.set(s, 1, s);
      dummy.updateMatrix();
      lists[rng.int(0, 2)].push(dummy.matrix.clone());
    }
  }

  lists.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(
      geo,
      flat({
        color: tones[i], map: tex, transparent: true, opacity: 0.9,
        depthWrite: false, alphaTest: 0.32, cache: false,
      }),
      list.length
    );
    list.forEach((m, k) => inst.setMatrixAt(k, m));
    inst.renderOrder = 2;
    inst.name = 'fallenPetal';
    inst.userData.noOutline = true;
    ctx.add(inst);
  });
  return true;
}

/**
 * Petals that have already landed.  They drift into the gutters, along the
 * kerb line and across the crossing deck, which is both true to life and the
 * cheapest way to stop a wide stretch of asphalt reading as a dead field.
 */
function buildFallenPetals(ctx, tex) {
  const rng = rngKit(4471);
  const geo = new THREE.PlaneGeometry(0.17, 0.125);
  geo.rotateX(-Math.PI / 2);

  const tones = [PAL.petal, PAL.blossomLight, PAL.petalDeep];
  const lists = [[], [], []];
  const dummy = new THREE.Object3D();

  const place = (x, z, y) => {
    dummy.position.set(x, y + 0.019, z);
    dummy.rotation.set(0, rng.range(0, 6.28), 0);
    const s = rng.range(0.8, 1.25);
    dummy.scale.set(s, 1, s);
    dummy.updateMatrix();
    lists[rng.int(0, 2)].push(dummy.matrix.clone());
  };

  for (let i = 0; i < 620; i++) {
    const z = rng.range(-26, 32);
    const cx = centerX(z);
    const y = groundY(z);
    const r = rng.next();
    if (r < 0.42) {
      // hugging the gutters, where wind and rain push them
      const s = rng.sign();
      place(cx + s * rng.range(2.35, 3.12), z, y);
    } else if (r < 0.62) {
      // on the pavement, against the tactile line
      const s = rng.sign();
      place(cx + s * rng.range(3.2, 4.6), z, y + 0.135);
    } else if (r < 0.78) {
      // caught along the crossing deck
      const dz = rng.range(-2.4, 2.4);
      place(cx + rng.range(-3.1, 3.1), dz, 0.32);
    } else {
      // a thin scatter over the open road
      place(cx + rng.range(-3.0, 3.0), z, y);
    }
  }

  lists.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(
      geo,
      flat({
        color: tones[i], map: tex, transparent: true, opacity: 0.9,
        depthWrite: false, alphaTest: 0.32, cache: false,
      }),
      list.length
    );
    list.forEach((m, k) => inst.setMatrixAt(k, m));
    inst.renderOrder = 2;
    inst.name = 'fallenPetal';
    inst.userData.noOutline = true;
    ctx.add(inst);
  });
}
