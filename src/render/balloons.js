/*
 * balloons.js (render): Balloon chase on the screen. The plane, its
 * propeller, and every balloon and pop shard, drawn from the pure game in
 * src/game/balloons.js.
 *
 * THREE DRAW CALLS, and only while the game is on. The plane is one merged
 * mesh with its colours in the vertices, the propeller is a second so it
 * can spin, and every balloon and every shard of every pop is an instance of
 * one sphere in one InstancedMesh, coloured per instance. With the game off
 * nothing here exists and nothing is added to the scene. Nothing is
 * allocated on a frame.
 *
 * The materials are celMaterial's, so the plane and the balloons are lit,
 * fogged and inked with the map they fly over. Their programs are warmed
 * when the game is switched on (see attach), which happens on a menu or at
 * a map's load, never in flight.
 *
 * Render may read frame time: the pop shards and the propeller animate on
 * it. Nothing here reaches the game's state.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { celMaterial } from './celmat.js';
import { warmPrograms } from './warm.js';
import {
  BALLOON_MAX, BALLOON_R, BALLOON_LIFE_MS, BALLOON_EVERY,
} from '../game/balloons.js';

const BURSTS = 8;
const SHARDS = 8;
const INSTANCES = BALLOON_MAX + BURSTS * SHARDS;
const BURST_MS = 520;
const GROW_MS = 260;
const FADE_MS = 600;

/* The palette's party colours: sakura, mint, sky, amber, coral, lilac. */
const HUES = [0xff7aa8, 0x6fe3b4, 0x6cb8ff, 0xffb547, 0xff6f5e, 0xb79bff];
const GOLD = 0xffd23a;

const CREAM = 0xf4ecda;
const CORAL = 0xff6f7e;
const SLATE = 0x2c3644;
const GLASS = 0x5f88b0;

/* One box into the vertex lists: centre, size, colour. */
function box(pos, nor, col, cx, cy, cz, sx, sy, sz, hex) {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  g.translate(cx, cy, cz);
  const c = new THREE.Color(hex);
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  for (let i = 0; i < p.count; i += 1) {
    pos.push(p.getX(i), p.getY(i), p.getZ(i));
    nor.push(n.getX(i), n.getY(i), n.getZ(i));
    col.push(c.r, c.g, c.b);
  }
  g.dispose();
}

/*
 * The plane, nose along local +Z, up +Y, local +X its left wing. About a
 * seven metre span: a light plane, drawn a touch chunky so it reads from a
 * hundred metres away on a phone.
 */
function planeGeometry() {
  const pos = [];
  const nor = [];
  const col = [];
  /* Fuselage, in three steps toward the tail. */
  box(pos, nor, col, 0, 0, 0.6, 0.95, 0.95, 2.6, CREAM);
  box(pos, nor, col, 0, 0.05, -1.2, 0.7, 0.7, 1.4, CREAM);
  box(pos, nor, col, 0, 0.12, -2.35, 0.42, 0.42, 1.1, CREAM);
  /* Nose and spinner. */
  box(pos, nor, col, 0, -0.02, 2.1, 0.78, 0.78, 0.5, CORAL);
  box(pos, nor, col, 0, -0.02, 2.42, 0.26, 0.26, 0.2, SLATE);
  /* Cabin glass, and a stripe down each side. */
  box(pos, nor, col, 0, 0.5, 0.75, 0.82, 0.18, 1.1, GLASS);
  box(pos, nor, col, 0, -0.05, -0.2, 0.97, 0.16, 3.4, CORAL);
  /* High wing, with coral tips. */
  box(pos, nor, col, 0, 0.5, 0.45, 5.6, 0.12, 1.25, CREAM);
  box(pos, nor, col, 3.15, 0.5, 0.45, 0.7, 0.13, 1.25, CORAL);
  box(pos, nor, col, -3.15, 0.5, 0.45, 0.7, 0.13, 1.25, CORAL);
  /* Struts. */
  box(pos, nor, col, 0.9, 0.0, 0.5, 0.06, 0.95, 0.06, SLATE);
  box(pos, nor, col, -0.9, 0.0, 0.5, 0.06, 0.95, 0.06, SLATE);
  /* Tailplane and fin. */
  box(pos, nor, col, 0, 0.14, -2.75, 2.5, 0.08, 0.7, CREAM);
  box(pos, nor, col, 0, 0.62, -2.8, 0.08, 1.0, 0.8, CORAL);
  /* Wheels. */
  box(pos, nor, col, 0.55, -0.62, 1.0, 0.16, 0.38, 0.38, SLATE);
  box(pos, nor, col, -0.55, -0.62, 1.0, 0.16, 0.38, 0.38, SLATE);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

function propGeometry() {
  const g = new THREE.BoxGeometry(0.14, 1.9, 0.05);
  return g;
}

/* A tiny LCG for the shards' spread: render only, so it needs no more. */
let shardSeed = 1;
function rnd() {
  shardSeed = (Math.imul(shardSeed, 1664525) + 1013904223) >>> 0;
  return shardSeed / 4294967296;
}

export class BalloonView {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'balloonChase';

    this.planeMat = celMaterial({ color: 0xffffff, spec: 0.25, specWidth: 0.02 });
    this.planeMat.vertexColors = true;
    this.plane = new THREE.Mesh(planeGeometry(), this.planeMat);
    this.plane.matrixAutoUpdate = false;
    this.plane.castShadow = false;
    this.propMat = celMaterial({ color: SLATE });
    this.prop = new THREE.Mesh(propGeometry(), this.propMat);
    this.prop.matrixAutoUpdate = false;
    this.group.add(this.plane, this.prop);

    this.balloonMat = celMaterial({ color: 0xffffff, spec: 0.6, specWidth: 0.04, rim: 0.4 });
    this.balloons = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), this.balloonMat, INSTANCES);
    this.balloons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.balloons.frustumCulled = false;
    this.balloons.castShadow = false;
    const c = new THREE.Color();
    for (let i = 0; i < INSTANCES; i += 1) {
      this.balloons.setColorAt(i, c.setHex(HUES[i % HUES.length]));
    }
    this.balloons.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.balloons);

    /* Bursts: a ring of BURSTS, each SHARDS shards. */
    this.burstAt = new Float64Array(BURSTS).fill(-1e9);
    this.burstNext = 0;
    this.shardP = new Float32Array(BURSTS * SHARDS * 3);
    this.shardV = new Float32Array(BURSTS * SHARDS * 3);
    this.colorSet = new Uint8Array(INSTANCES).fill(255);

    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.fwd = new THREE.Vector3();
    this.left = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.tmpC = new THREE.Color();
    this.propAngle = 0;
    this.scene = null;
  }

  /* Into a map's scene, with the programs linked before anything flies. */
  attach(scene, renderer, camera, target) {
    this.detach();
    this.scene = scene;
    scene.add(this.group);
    if (renderer && camera) {
      warmPrograms(renderer, scene, camera, target || null);
    }
  }

  detach() {
    if (this.scene) {
      this.scene.remove(this.group);
      this.scene = null;
    }
  }

  dispose() {
    this.detach();
    this.plane.geometry.dispose();
    this.prop.geometry.dispose();
    this.balloons.geometry.dispose();
    this.balloons.dispose();
    this.planeMat.dispose();
    this.propMat.dispose();
    this.balloonMat.dispose();
  }

  /* A pop at (x, y, z), from the game's pop list. nowMs is wall time. */
  pop(p, nowMs) {
    const b = this.burstNext;
    this.burstNext = (b + 1) % BURSTS;
    this.burstAt[b] = nowMs;
    const hex = p.gold ? GOLD : HUES[p.hue % HUES.length];
    for (let k = 0; k < SHARDS; k += 1) {
      const j = (b * SHARDS + k) * 3;
      this.shardP[j] = p.x;
      this.shardP[j + 1] = p.y;
      this.shardP[j + 2] = p.z;
      /* A point in the unit ball, pushed out to the shell. */
      let x = 0;
      let y = 0;
      let z = 0;
      let m = 0;
      for (let t = 0; t < 8; t += 1) {
        x = rnd() * 2 - 1;
        y = rnd() * 2 - 1;
        z = rnd() * 2 - 1;
        m = x * x + y * y + z * z;
        if (m > 0.05 && m <= 1) {
          break;
        }
      }
      const r = (3.5 + rnd() * 2.5) / Math.sqrt(m || 1);
      this.shardV[j] = x * r;
      this.shardV[j + 1] = y * r + 1.5;
      this.shardV[j + 2] = z * r;
      const idx = BALLOON_MAX + b * SHARDS + k;
      this.balloons.setColorAt(idx, this.tmpC.setHex(hex));
    }
    this.balloons.instanceColor.needsUpdate = true;
  }

  /*
   * Once a drawn frame. t: where this frame is between the game's last two
   * feeds, 0 to 1 and a little past. dtMs and nowMs: wall time.
   */
  frame(game, t, dtMs, nowMs) {
    const u = t < 0 ? 0 : (t > 2 ? 2 : t);
    /* The plane. */
    const px = game.pPrev[0] + (game.p[0] - game.pPrev[0]) * u;
    const py = game.pPrev[1] + (game.p[1] - game.pPrev[1]) * u;
    const pz = game.pPrev[2] + (game.p[2] - game.pPrev[2]) * u;
    let hx = game.hxPrev + (game.hx - game.hxPrev) * u;
    let hz = game.hzPrev + (game.hz - game.hzPrev) * u;
    const hm = Math.hypot(hx, hz) || 1;
    hx /= hm;
    hz /= hm;
    const pitch = game.vy / Math.max(game.v, 1);
    this.fwd.set(hx, pitch, hz).normalize();
    /* Right is fwd x worldUp; the plane banks its up toward the side it
     * turns to, positive bankTan being a turn to the right. */
    const rx = -hz;
    const rz = hx;
    const bank = Math.atan(game.bankPrev + (game.bankTan - game.bankPrev) * u);
    const cb = Math.cos(bank);
    const sb = Math.sin(bank);
    /* Up before the bank, square to the nose: right x fwd. */
    const ux0 = -this.fwd.y * rz;
    const uy0 = rz * this.fwd.x - rx * this.fwd.z;
    const uz0 = rx * this.fwd.y;
    this.up.set(ux0 * cb + rx * sb, uy0 * cb, uz0 * cb + rz * sb).normalize();
    this.left.crossVectors(this.up, this.fwd).normalize();
    this.m.makeBasis(this.left, this.up, this.fwd);
    this.m.setPosition(px, py, pz);
    this.plane.matrix.copy(this.m);
    this.plane.matrixWorldNeedsUpdate = true;
    /* The prop, on the spinner, turning about the nose. */
    this.propAngle += dtMs * 0.06;
    if (this.propAngle > 1e4) {
      this.propAngle -= 1e4;
    }
    /* The blade's long axis is local Y: spin it about local Z, then into
     * the plane's own basis. */
    this.m.makeBasis(this.left, this.up, this.fwd);
    this.q.setFromAxisAngle(this.s.set(0, 0, 1), this.propAngle);
    this.prop.matrix.makeRotationFromQuaternion(this.q).premultiply(this.m);
    this.prop.matrix.setPosition(
      px + this.fwd.x * 2.55,
      py + this.fwd.y * 2.55,
      pz + this.fwd.z * 2.55,
    );
    this.prop.matrixWorldNeedsUpdate = true;

    /* The balloons. */
    const inst = this.balloons;
    let colours = false;
    this.q.identity();
    for (let i = 0; i < BALLOON_MAX; i += 1) {
      const born = game.born[i];
      if (born < 0) {
        this.s.set(0, 0, 0);
      } else {
        const age = game.clockMs - BALLOON_EVERY + BALLOON_EVERY * u - born;
        let k = age < GROW_MS ? 0.25 + 0.75 * (age / GROW_MS) : 1;
        const left = BALLOON_LIFE_MS - age;
        if (left < FADE_MS) {
          k *= left > 0 ? left / FADE_MS : 0;
        }
        const r = BALLOON_R * k * (game.gold[i] ? 1.12 : 1);
        this.s.set(r, r * 1.18, r);
        this.v.set(
          game.bxPrev[i] + (game.bx[i] - game.bxPrev[i]) * u,
          game.byPrev[i] + (game.by[i] - game.byPrev[i]) * u,
          game.bzPrev[i] + (game.bz[i] - game.bzPrev[i]) * u,
        );
        const want = game.gold[i] ? 6 : game.hue[i];
        if (this.colorSet[i] !== want) {
          this.colorSet[i] = want;
          inst.setColorAt(i, this.tmpC.setHex(want === 6 ? GOLD : HUES[want]));
          colours = true;
        }
      }
      this.m.compose(this.v, this.q, this.s);
      inst.setMatrixAt(i, this.m);
    }
    /* The shards: out, slowing, falling, shrinking. */
    const dt = dtMs / 1000;
    const drag = Math.exp(-dt * 3.2);
    for (let b = 0; b < BURSTS; b += 1) {
      const age = nowMs - this.burstAt[b];
      const live = age >= 0 && age < BURST_MS;
      const k = live ? 1 - age / BURST_MS : 0;
      for (let s = 0; s < SHARDS; s += 1) {
        const j = (b * SHARDS + s) * 3;
        if (live) {
          this.shardV[j] *= drag;
          this.shardV[j + 1] = this.shardV[j + 1] * drag - 9.81 * dt * 0.6;
          this.shardV[j + 2] *= drag;
          this.shardP[j] += this.shardV[j] * dt;
          this.shardP[j + 1] += this.shardV[j + 1] * dt;
          this.shardP[j + 2] += this.shardV[j + 2] * dt;
        }
        const r = 0.13 * k;
        this.s.set(r, r * 0.6, r);
        this.v.set(this.shardP[j], this.shardP[j + 1], this.shardP[j + 2]);
        this.m.compose(this.v, this.q, this.s);
        inst.setMatrixAt(BALLOON_MAX + b * SHARDS + s, this.m);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (colours) {
      inst.instanceColor.needsUpdate = true;
    }
  }
}
