import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  clubPoster, poster, norenTex, flagTex, curtainTex, warningPlate,
} from '../core/textures.js';
import { box } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import {
  makeNoticeBoard, makeCrow, makeLoosePaper, makeUmbrellaStand,
  makeCrates, makeSignPost,
} from './props.js';

/* ------------------------------------------------------------------ *
 * Environmental storytelling.
 *
 * Nobody appears anywhere in this world, so everything the place has to say
 * about itself has to be said by what has been left out, pinned up, parked,
 * knocked over or forgotten.  This is the last pass, and it is deliberately
 * *small*: a handful of legible objects, each in a spot the eye already goes
 * to, beats a hundred scattered ones.
 *
 * The one moving part is the cloth.  A noren, a shop banner and a towel that
 * breathe on a slow cycle are the difference between a still and a place
 * where it is quarter past four and there is a bit of wind.
 * ------------------------------------------------------------------ */

const M = {};
function mats() {
  if (M.metal) return M;
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.cabinet = cel({ color: PAL.cabinet, bands: 3, tint: 0x6f6890 });
  M.cabinetTop = cel({ color: PAL.cabinetTop, bands: 3, tint: 0x6a6288 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  return M;
}

export function buildDetails(ctx) {
  const m = mats();
  const cloths = [];

  /* ------------------------------------------------------------------ *
   * The station.
   *
   * A board full of club recruitment on an unstaffed platform is the single
   * most economical way to say that a school exists up the hill and that
   * term is running.
   * ------------------------------------------------------------------ */
  {
    const H = 0.98;                 // platform deck height, from railway.js
    const zb = -5.62;               // back edge of the deck
    ctx.add(makeNoticeBoard({ ctx,
      x: 22.4, z: zb + 0.42, y: H, ry: 0, w: 2.4, h: 1.28, y0: 0.75,
      sheets: [
        { map: clubPoster(0), x: -0.78, y: 0.05, w: 0.46, h: 0.62, tilt: 0.02 },
        { map: clubPoster(1), x: -0.26, y: -0.03, w: 0.46, h: 0.62, tilt: -0.015 },
        { map: clubPoster(3), x: 0.26, y: 0.04, w: 0.46, h: 0.62, tilt: 0.01 },
        { map: poster(1), x: 0.78, y: -0.02, w: 0.42, h: 0.56, tilt: -0.02 },
      ],
    }));

    // somebody's umbrella, left against the fence after the rain
    ctx.add(makeUmbrellaStand({ x: 30.4, z: zb + 0.5, y: H, n: 2, seed: 9901 }));
    // and a crate of returns waiting to go somewhere
    ctx.add(makeCrates({ x: 34.6, z: zb + 0.7, y: H, n: 3, seed: 9902, ry: 0.2 }));
    makeLoosePaper(ctx, [
      { x: 26.8, z: -3.4, y: H, ry: 0.7 },
      { x: 27.5, z: -3.0, y: H, ry: -1.2 },
    ]);
  }

  /* ------------------------------------------------------------------ *
   * Crows on the wires.
   *
   * The wires over the crossing are the emptiest part of the frame and the
   * one nothing else can occupy.  Three crows, unevenly spaced, because two
   * reads as a pair and four as a flock.
   * ------------------------------------------------------------------ */
  {
    // heights sampled off the cable runs in index.js and approach.js
    ctx.add(makeCrow({ x: -2.1, y: groundY(9.4) + 8.28, z: 9.4, ry: 0.4 }));
    ctx.add(makeCrow({ x: -1.4, y: groundY(9.4) + 8.24, z: 9.7, ry: -0.9 }));
    ctx.add(makeCrow({ x: 5.6, y: groundY(-19.0) + 7.9, z: -19.0, ry: 2.6 }));
    ctx.add(makeCrow({ x: 21.8, y: groundY(29.0) + 4.86, z: 29.0, ry: -0.5 }));
  }

  /* ------------------------------------------------------------------ *
   * Lineside kit.
   *
   * Relay cabinets and warning plates along the fence: the railway is the
   * reason this town exists, and it should look maintained by somebody.
   * ------------------------------------------------------------------ */
  /* Set back off the near-side footpath, not on it.  That path is 1.15 m wide
   * and it is the only way west to the shrine; a cabinet in the middle of it
   * plus a tree trunk was enough to close the route. */
  for (const [x, z, ry] of [[-16.4, 5.8, Math.PI / 2], [17.0, 5.4, -Math.PI / 2], [-24.0, -3.9, Math.PI]]) {
    const y = groundY(z);
    const cab = box(0.62, 0.98, 0.4, m.cabinet, x, y + 0.49, z);
    cab.castShadow = cab.receiveShadow = true;
    ctx.add(cab);
    hullOutline(cab, { thickness: 0.003 });
    ctx.add(box(0.7, 0.07, 0.48, m.cabinetTop, x, y + 1.01, z));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.48),
      flat({ color: 0xffffff, map: warningPlate(1), cache: false }));
    plate.position.set(x + Math.sin(ry) * 0.32, y + 0.6, z + Math.cos(ry) * 0.32);
    plate.rotation.y = ry;
    ctx.add(plate);
    ctx.collide(x - 0.36, z - 0.26, x + 0.36, z + 0.26, y + 1.05);
  }

  /* ------------------------------------------------------------------ *
   * Cloth in the wind.
   *
   * Eight pieces, each hung on a real bracket, all driven by one updater.
   * They lift and settle on slightly different periods so the street never
   * looks metronomic.
   * ------------------------------------------------------------------ */
  {
    /* Two nested groups, and the nesting is the whole point.
     *
     * The pivot is the rail, so a small rotation about it reads as a lift --
     * which means the placement has to survive the planet bake with its own
     * transform intact, exactly like the gate booms and the shop shutter.
     * But a re-seated rig carries its orientation as a *quaternion*, and for
     * a hang turned a quarter turn to face across the street that quaternion
     * decomposes to an Euler X of very nearly -90 degrees.  Driving
     * `rotation.x` on that group therefore does not add a lift: it discards
     * the -90 and rolls the cloth ninety degrees about its own normal, so
     * every noren on the shopping street hung as a tall vertical banner with
     * its lettering on its side.  Nothing threw, and the two hangs that face
     * along +z looked perfect, which is why it survived this long.
     *
     * So the outer group owns the placement and is the only thing the bake
     * touches; the inner pivot is skipped (it sits under a rigid group),
     * stays the identity, and is what the wind actually turns.  The rail
     * itself stays on the outer group, because a rail does not move. */
    const hang = (o) => {
      const g = new THREE.Group();
      const piv = new THREE.Group();
      g.add(piv);
      const cloth = new THREE.Mesh(
        new THREE.PlaneGeometry(o.w, o.h),
        flat({ color: 0xffffff, map: o.map, side: THREE.DoubleSide, cache: false })
      );
      cloth.position.y = -o.h / 2;
      cloth.castShadow = true;
      piv.add(cloth);
      if (o.rail !== false) {
        g.add(box(o.w + 0.16, 0.05, 0.05, m.metalDark, 0, 0.02, 0));
      }
      g.position.set(o.x, o.y, o.z);
      g.rotation.y = o.ry ?? 0;
      g.userData.planetRigid = true;
      ctx.add(g);
      /* Thin slab on the hanging cloth. A plane has no thickness, so the
       * cover pass never sees it, and a doorway curtain you can split is
       * the whole point of hanging it. */
      {
        const hw = o.w * 0.5;
        const t = 0.05;
        const ry = o.ry ?? 0;
        const c = Math.cos(ry);
        const s = Math.sin(ry);
        const wx = Math.abs(c) * hw + Math.abs(s) * t;
        const wz = Math.abs(s) * hw + Math.abs(c) * t;
        ctx.collide(o.x - wx, o.z - wz, o.x + wx, o.z + wz, o.y, o.y - o.h);
      }
      cloths.push({ obj: piv, base: 0, amp: o.amp ?? 0.09, rate: o.rate ?? 0.7, phase: o.phase ?? 0 });
      return g;
    };

    // the ramen shop's doorway curtain, on the shopping street
    hang({ x: 24.9, y: groundY(19.6) + 2.5, z: 19.6, ry: -Math.PI / 2, w: 2.2, h: 0.74, map: norenTex('ramen'), amp: 0.1, rate: 0.62, phase: 0.0 });
    // a soba banner further up the same side
    hang({ x: 24.9, y: groundY(24.8) + 2.4, z: 24.8, ry: -Math.PI / 2, w: 1.6, h: 0.66, map: norenTex('soba'), amp: 0.11, rate: 0.78, phase: 1.7 });
    // two promotional flags outside the stationery shop
    hang({ x: 24.7, y: groundY(32.6) + 2.2, z: 32.6, ry: -Math.PI / 2, w: 0.44, h: 1.0, map: flagTex(2), amp: 0.16, rate: 1.1, phase: 0.6 });
    hang({ x: 19.5, y: groundY(21.2) + 2.2, z: 21.2, ry: Math.PI / 2, w: 0.44, h: 1.0, map: flagTex(1), amp: 0.15, rate: 1.24, phase: 2.4 });
    // washing over the corner shop's balcony, and on a house up the street
    hang({ x: 4.9, y: groundY(9.2) + 4.5, z: 9.2, ry: -Math.PI / 2, w: 0.46, h: 0.68, map: curtainTex(0), amp: 0.13, rate: 0.9, phase: 3.1 });
    hang({ x: -5.6, y: groundY(23.2) + 4.4, z: 22.4, ry: Math.PI / 2, w: 0.5, h: 0.7, map: curtainTex(1), amp: 0.12, rate: 0.82, phase: 1.1 });
    // the bathhouse curtain
    hang({ x: 25.0, y: groundY(39.4) + 2.6, z: 39.4, ry: -Math.PI / 2, w: 2.6, h: 0.8, map: norenTex('sento'), amp: 0.07, rate: 0.5, phase: 2.0 });
    // and one at the mouth of the alley, so the turn has something moving in it
    hang({ x: 13.4, y: groundY(15.1) + 2.5, z: 16.2, ry: 0, w: 1.3, h: 0.6, map: norenTex('wagashi'), amp: 0.12, rate: 0.94, phase: 0.3 });

    let t = 0;
    ctx.update((dt) => {
      t += dt;
      for (const c of cloths) {
        // a slow lift with a small flutter riding on it
        const s = Math.sin(t * c.rate + c.phase) * 0.75 + Math.sin(t * c.rate * 3.3 + c.phase) * 0.25;
        c.obj.rotation.x = c.base + s * c.amp;
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Odds and ends, each in a place the eye already goes.
   * ------------------------------------------------------------------ */
  {
    /* Odds and ends that used to sit in the street: paper, a cat in a box,
     * a bucket, a dumped bike. They closed the gaps. The 徐行 plate stays. */
    ctx.add(makeSignPost({
      x: -9.8, z: 5.5, y: 0, ry: Math.PI, h: 1.7, postMat: m.metal,
      plates: [{ map: warningPlate(0), w: 0.3, h: 0.6, y: 1.35 }],
    }));
  }

  return { cloths: cloths.length };
}
