/*
 * dogfight.js (render): the dogfight drawn. The bots, the gun's pellets,
 * the missiles and their smoke, and the confetti a popped quad leaves.
 *
 * SIX DRAW CALLS FOR THE WHOLE FIGHT, whatever is flying. The bots are the
 * rooms' own comic craft (src/render/roomcraft.js), three instanced calls
 * with name tags, so a bot reads as a pilot in a room does. The pellets and
 * the confetti are one instanced unit box with instance colours: a pellet
 * is the box stretched along its flight into a tracer, a scrap of confetti
 * is the box flattened. The missiles are one instanced call, and the smoke
 * puffs behind them and the blasts are one more: low poly cream balls that
 * grow and shrink, so they need no transparency and no sort.
 *
 * Nothing here runs outside a dogfight: the module is fetched the first
 * time one is flown, as the balloon chase's is, and its group leaves the
 * scene with the game. Nothing here allocates per frame.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildRoomCraft, LIVERIES } from './roomcraft.js';
import { warmPrograms } from './warm.js';
import {
  MAX_PILOTS, DOGFIGHT_EVERY, BOT_NAMES, GUN,
} from '../game/dogfight.js';

const PELLETS = 256;
const MISSILES = 24;
const CONFETTI = 360;
const PUFFS = 220;
const AMBER = 0xffd45c;
const CREAM = 0xf3ead4;
/* Each bot's livery, fixed by its slot, from the avatars' own list. */
export const BOT_LIVERY = [0, 2, 9, 1, 4, 7, 6, 5];

let seed = 7;
function rnd() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

function missileGeometry() {
  const body = new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6);
  body.rotateX(Math.PI / 2);
  const nose = new THREE.ConeGeometry(0.035, 0.1, 6);
  nose.rotateX(-Math.PI / 2);
  nose.translate(0, 0, -0.2);
  const fin = new THREE.BoxGeometry(0.16, 0.012, 0.06);
  fin.translate(0, 0, 0.12);
  const fin2 = new THREE.BoxGeometry(0.012, 0.16, 0.06);
  fin2.translate(0, 0, 0.12);
  const parts = [body, nose, fin, fin2].map((g) => g.toNonIndexed());
  const colours = [0xffd45c, 0xff7d96, 0xe8a8b8, 0xe8a8b8];
  parts.forEach((g, i) => {
    const c = new THREE.Color(colours[i]);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let k = 0; k < n; k += 1) {
      arr[k * 3] = c.r;
      arr[k * 3 + 1] = c.g;
      arr[k * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
  });
  return mergeGeometries(parts);
}

export class DogfightView {
  constructor({ whoop = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'dogfight';
    /* Twice life size, which is the size a pellet counts as a hit at
     * (HIT_R in src/game/dogfight.js): a five inch quad at fifty metres is
     * a few pixels, and a target nobody can see is no fun at eight. */
    this.craft = buildRoomCraft({ capacity: MAX_PILOTS, whoop, scale: 2 });
    this.group.add(this.craft.group);

    this.boxMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    this.boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.boxMat, PELLETS + CONFETTI);
    this.boxes.name = 'dogfight-pellets';
    this.missileMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    this.missiles = new THREE.InstancedMesh(missileGeometry(), this.missileMat, MISSILES);
    this.missiles.name = 'dogfight-missiles';
    this.puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    this.puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.puffMat, PUFFS);
    this.puffs.name = 'dogfight-puffs';
    for (const m of [this.boxes, this.missiles, this.puffs]) {
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      this.group.add(m);
    }
    const c = new THREE.Color(AMBER);
    for (let i = 0; i < PELLETS + CONFETTI; i += 1) {
      this.boxes.setColorAt(i, c);
      this.boxes.setMatrixAt(i, ZERO);
    }
    for (let i = 0; i < PUFFS; i += 1) {
      this.puffs.setMatrixAt(i, ZERO);
    }
    this.boxes.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const p = new THREE.Color(CREAM);
    for (let i = 0; i < PUFFS; i += 1) {
      this.puffs.setColorAt(i, p);
    }
    this.puffs.instanceColor.setUsage(THREE.DynamicDrawUsage);

    /* Confetti: position, velocity, spin, born. */
    this.cP = new Float32Array(CONFETTI * 3);
    this.cV = new Float32Array(CONFETTI * 3);
    this.cBorn = new Float64Array(CONFETTI).fill(-1e9);
    this.cHex = new Int32Array(CONFETTI);
    this.cNext = 0;
    /* Puffs: position, born, size, life. */
    this.fP = new Float32Array(PUFFS * 3);
    this.fBorn = new Float64Array(PUFFS).fill(-1e9);
    this.fSize = new Float32Array(PUFFS);
    this.fLife = new Float32Array(PUFFS);
    this.fHex = new Int32Array(PUFFS);
    this.fNext = 0;
    this.trailAt = new Float64Array(MISSILES);
    this.pelletsDrawn = 0;

    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.zAxis = new THREE.Vector3();
    this.yAxis = new THREE.Vector3();
    this.xAxis = new THREE.Vector3();
    this.basis = new THREE.Matrix4();
    this.col = new THREE.Color();
    this.pose = {
      px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false, spinning: true,
    };
    this.pilots = [];
    for (let i = 0; i < MAX_PILOTS; i += 1) {
      this.pilots.push({ id: i, handle: i ? BOT_NAMES[i - 1] : 'YOU', avatar: { livery: BOT_LIVERY[i] + 1 }, away: false });
    }
    this.scene = null;
  }

  /* Who slot i is for the craft's name tag and livery: a solo bot by its
   * slot, a room's seat by the name the room gave it. */
  pilotOf(g, i) {
    let p = this.pilots[i];
    if (!p) {
      p = { id: i, handle: 'BOT', avatar: { livery: (BOT_LIVERY[i % BOT_LIVERY.length] || 0) + 1 }, away: false };
      this.pilots[i] = p;
    }
    if (g.nameOf) {
      p.handle = g.nameOf(i);
    }
    return p;
  }

  attach(scene, renderer, camera, target) {
    this.detach();
    this.scene = scene;
    scene.add(this.group);
    if (renderer && camera) {
      /* Every program linked now, while the map loads, so the first shot
       * and the first blast cost nothing to compile. */
      for (const m of [this.boxes, this.missiles, this.puffs]) {
        m.count = 1;
      }
      warmPrograms(renderer, scene, camera, target || null).finally(() => {
        for (const m of [this.boxes, this.missiles, this.puffs]) {
          m.count = 0;
        }
      });
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
    this.craft.dispose();
    for (const m of [this.boxes, this.missiles, this.puffs]) {
      m.geometry.dispose();
      m.material.dispose();
      m.dispose();
    }
  }

  liveryOf(slot) {
    return LIVERIES[BOT_LIVERY[slot] % LIVERIES.length];
  }

  /* Confetti in a livery's colours, and a few in cream. k: the world's
   * scale for the aircraft. */
  confetti(x, y, z, hex, n, k, nowMs, speed = 5) {
    for (let i = 0; i < n; i += 1) {
      const c = this.cNext;
      this.cNext = (c + 1) % CONFETTI;
      this.cBorn[c] = nowMs;
      this.cHex[c] = i % 3 === 2 ? CREAM : hex;
      this.cP[c * 3] = x;
      this.cP[c * 3 + 1] = y;
      this.cP[c * 3 + 2] = z;
      let a = 0;
      let b = 0;
      let d = 0;
      let m = 0;
      for (let t = 0; t < 8; t += 1) {
        a = rnd() * 2 - 1;
        b = rnd() * 2 - 1;
        d = rnd() * 2 - 1;
        m = a * a + b * b + d * d;
        if (m > 0.05 && m <= 1) break;
      }
      const r = (speed * (0.6 + rnd() * 0.6) * k) / Math.sqrt(m || 1);
      this.cV[c * 3] = a * r;
      this.cV[c * 3 + 1] = b * r + 2 * k;
      this.cV[c * 3 + 2] = d * r;
      this.boxes.setColorAt(PELLETS + c, this.col.setHex(this.cHex[c]));
    }
    this.boxes.instanceColor.needsUpdate = true;
  }

  puff(x, y, z, size, lifeMs, nowMs, hex = CREAM) {
    const f = this.fNext;
    this.fNext = (f + 1) % PUFFS;
    this.fBorn[f] = nowMs;
    this.fP[f * 3] = x;
    this.fP[f * 3 + 1] = y;
    this.fP[f * 3 + 2] = z;
    this.fSize[f] = size;
    this.fLife[f] = lifeMs;
    if (this.fHex[f] !== hex) {
      this.fHex[f] = hex;
      this.puffs.setColorAt(f, this.col.setHex(hex));
      this.puffs.instanceColor.needsUpdate = true;
    }
  }

  /* One of the game's events, as the world shows it. */
  event(e, g, nowMs) {
    const k = g.k;
    if (e.type === 'pop') {
      this.confetti(e.x, e.y, e.z, this.liveryOf(e.to), 40, k, nowMs, 6);
      this.puff(e.x, e.y, e.z, 0.9 * k, 500, nowMs);
    } else if (e.type === 'boom') {
      this.puff(e.x, e.y, e.z, 1.6 * k, 650, nowMs);
      this.puff(e.x, e.y + 0.4 * k, e.z, 1.1 * k, 800, nowMs, AMBER);
      this.confetti(e.x, e.y, e.z, 0xff7d96, 14, k, nowMs, 7);
    } else if (e.type === 'spark') {
      this.confetti(e.x, e.y, e.z, AMBER, 3, k, nowMs, 2.5);
    } else if (e.type === 'hit') {
      this.confetti(e.x, e.y, e.z, e.big ? 0xff7d96 : AMBER, e.big ? 8 : 3, k, nowMs, 3);
    }
  }

  /* A pilot's pose from the game's forward and up, between its last two
   * feeds. */
  poseOf(g, i, t) {
    const u = 1 - t;
    this.pose.px = g.xPrev[i] * u + g.x[i] * t;
    this.pose.py = g.yPrev[i] * u + g.y[i] * t;
    this.pose.pz = g.zPrev[i] * u + g.z[i] * t;
    const fx = g.fxPrev[i] * u + g.fx[i] * t;
    const fy = g.fyPrev[i] * u + g.fy[i] * t;
    const fz = g.fzPrev[i] * u + g.fz[i] * t;
    this.yAxis.set(g.uxPrev[i] * u + g.ux[i] * t, g.uyPrev[i] * u + g.uy[i] * t, g.uzPrev[i] * u + g.uz[i] * t).normalize();
    /* The body's nose is the heading with its up share taken out; the
     * craft's own forward is minus Z. */
    this.zAxis.set(-fx, -fy, -fz);
    this.zAxis.addScaledVector(this.yAxis, -this.zAxis.dot(this.yAxis));
    if (this.zAxis.lengthSq() < 1e-8) {
      this.zAxis.set(0, 0, 1);
    }
    this.zAxis.normalize();
    this.xAxis.crossVectors(this.yAxis, this.zAxis).normalize();
    this.basis.makeBasis(this.xAxis, this.yAxis, this.zAxis);
    this.q.setFromRotationMatrix(this.basis);
    this.pose.qx = this.q.x;
    this.pose.qy = this.q.y;
    this.pose.qz = this.q.z;
    this.pose.qw = this.q.w;
    return this.pose;
  }

  /*
   * Once a drawn frame. t: where this frame is between the game's last two
   * feeds. camPos: where the eye is, for the tags' nearness. dtMs, nowMs:
   * wall time.
   */
  frame(g, t, camPos, dtMs, nowMs) {
    const k = g.k;
    const u = 1 - t;
    /* The bots. */
    this.craft.begin();
    /* The bots flown on this page: in a room, a bot the host flies is
     * drawn on the others' pages by the room, as a pilot is. */
    for (let i = 1; i < g.cap; i += 1) {
      if (!g.isBot[i] || g.puppet[i] || !g.alive[i]) {
        continue;
      }
      const pose = this.poseOf(g, i, t);
      const dx = pose.px - camPos.x;
      const dy = pose.py - camPos.y;
      const dz = pose.pz - camPos.z;
      this.craft.add(i, pose, this.pilotOf(g, i), dx * dx + dy * dy + dz * dz, false);
    }
    this.craft.end();

    /* Pellets: a tracer from where it was a little ago to where it is. */
    let n = 0;
    const len = GUN.speed * k * 0.014;
    const thick = 0.03 * k;
    for (let s = 0; s < g.pAlive.length; s += 1) {
      if (!g.pAlive[s]) {
        continue;
      }
      this.a.set(g.pxPrev[s] * u + g.px[s] * t, g.pyPrev[s] * u + g.py[s] * t, g.pzPrev[s] * u + g.pz[s] * t);
      this.v.set(g.pvx[s], g.pvy[s], g.pvz[s]).normalize();
      this.q.setFromUnitVectors(UNIT_Z, this.v);
      this.s.set(thick, thick, len);
      this.a.addScaledVector(this.v, -len * 0.5);
      this.m.compose(this.a, this.q, this.s);
      this.boxes.setMatrixAt(n, this.m);
      n += 1;
    }
    /* The slots last frame's pellets used and this frame's did not are
     * scaled to nothing, because the confetti live past PELLETS and the
     * count has to reach them. */
    for (let s = n; s < this.pelletsDrawn; s += 1) {
      this.boxes.setMatrixAt(s, ZERO);
    }
    this.pelletsDrawn = n;
    /* Confetti. */
    const dt = Math.min(dtMs, 50) / 1000;
    let top = n;
    const flat = 0.06 * k;
    for (let c = 0; c < CONFETTI; c += 1) {
      const age = nowMs - this.cBorn[c];
      const idx = PELLETS + c;
      if (age > 1400) {
        if (age < 1600) {
          this.boxes.setMatrixAt(idx, ZERO);
        }
        continue;
      }
      const j = c * 3;
      this.cV[j + 1] -= 9.81 * k * 0.5 * dt;
      this.cV[j] *= 0.97;
      this.cV[j + 1] *= 0.97;
      this.cV[j + 2] *= 0.97;
      this.cP[j] += this.cV[j] * dt;
      this.cP[j + 1] += this.cV[j + 1] * dt;
      this.cP[j + 2] += this.cV[j + 2] * dt;
      this.a.set(this.cP[j], this.cP[j + 1], this.cP[j + 2]);
      const spin = (age * 0.01 + c) % 6.283;
      this.q.setFromAxisAngle(SPIN_AXES[c % SPIN_AXES.length], spin);
      const fade = age > 1000 ? 1 - (age - 1000) / 400 : 1;
      this.s.set(flat * fade, flat * 0.15, flat * 0.7 * fade);
      this.m.compose(this.a, this.q, this.s);
      this.boxes.setMatrixAt(idx, this.m);
      if (idx + 1 > top) {
        top = idx + 1;
      }
    }
    this.boxes.count = top;
    if (top) {
      this.boxes.instanceMatrix.needsUpdate = true;
    }

    /* Missiles, and a puff behind each every 40 ms. */
    let mi = 0;
    for (let s = 0; s < g.mAlive.length; s += 1) {
      if (!g.mAlive[s]) {
        continue;
      }
      this.a.set(g.mxPrev[s] * u + g.mx[s] * t, g.myPrev[s] * u + g.my[s] * t, g.mzPrev[s] * u + g.mz[s] * t);
      this.v.set(-g.mdx[s], -g.mdy[s], -g.mdz[s]);
      this.q.setFromUnitVectors(UNIT_Z, this.v);
      this.s.setScalar(k * 1.6);
      this.m.compose(this.a, this.q, this.s);
      this.missiles.setMatrixAt(mi, this.m);
      mi += 1;
      if (nowMs - this.trailAt[s] >= 40) {
        this.trailAt[s] = nowMs;
        this.puff(this.a.x + g.mdx[s] * 0.3 * k, this.a.y + g.mdy[s] * 0.3 * k, this.a.z + g.mdz[s] * 0.3 * k, 0.22 * k, 900, nowMs);
      }
    }
    this.missiles.count = mi;
    if (mi) {
      this.missiles.instanceMatrix.needsUpdate = true;
    }

    /* Puffs: grow fast, shrink slow. */
    let pt = 0;
    for (let f = 0; f < PUFFS; f += 1) {
      const age = nowMs - this.fBorn[f];
      if (age > this.fLife[f]) {
        if (age < this.fLife[f] + 200) {
          this.puffs.setMatrixAt(f, ZERO);
        }
        continue;
      }
      const x = age / this.fLife[f];
      const r = this.fSize[f] * (x < 0.15 ? 0.4 + x * 4 : 1 - (x - 0.15) * 1.05);
      this.a.set(this.fP[f * 3], this.fP[f * 3 + 1] + age * 0.0004 * k, this.fP[f * 3 + 2]);
      this.q.identity();
      this.s.setScalar(Math.max(r, 0.0001));
      this.m.compose(this.a, this.q, this.s);
      this.puffs.setMatrixAt(f, this.m);
      if (f + 1 > pt) {
        pt = f + 1;
      }
    }
    this.puffs.count = pt;
    if (pt) {
      this.puffs.instanceMatrix.needsUpdate = true;
    }
    this.group.visible = true;
  }
}

const UNIT_Z = new THREE.Vector3(0, 0, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const SPIN_AXES = [
  new THREE.Vector3(1, 0.3, 0).normalize(),
  new THREE.Vector3(0.2, 1, 0.4).normalize(),
  new THREE.Vector3(0.5, 0.2, 1).normalize(),
];

/* How far between feeds a frame is, as the view wants it. */
export function feedFraction(aheadMs) {
  return Math.max(0, Math.min(1.5, aheadMs / DOGFIGHT_EVERY));
}
