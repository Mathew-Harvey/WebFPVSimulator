/*
 * infected.js (render): Infected drawn (src/game/infected.js). The bots
 * are the rooms' comic craft in the game's colours instead of a livery:
 * clean pilots white, infected pilots green, the last one gold. Round each
 * one, a ring that faces the eye in the same colour, so a pilot is read at
 * a glance down a hallway: the owner's "visually green hue around them,
 * easy to spot" and "a white hue around them".
 *
 * ONE DRAW CALL MORE THAN THE DOGFIGHT'S, the ring, which the owner said
 * yes to on every preset, Low included (2026-11-08 09:25Z). The rings are
 * one instanced unit ring, turned to the eye on the CPU, sixteen matrices
 * a frame; their colours change only when a pilot changes side. Depth
 * tested and drawn after the solids, so a wall hides a ring as it hides
 * the craft in it, and writing no depth, so the ink pass draws no line
 * round them.
 *
 * NAMES ONLY IN SIGHT. The rooms' name tags are drawn over the scenery,
 * which is right for finding a friend and wrong for hiding from one. Here
 * a tag shows only while nothing solid is between the eye and the pilot,
 * asked of the game's own grid (world.blocked), four pilots a frame in
 * turn, so a name never gives a hider away through a wall. The last one is
 * the exception the rules make: everybody sees them, through everything.
 *
 * Nothing here runs outside Infected, and nothing here allocates per
 * frame.
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
import { DogfightView } from './dogfight.js';
import { CAP } from '../game/infected.js';

/* The game's three colours. The green is well off the school's own
 * hallway sage (src/props/school.js says why). */
export const CLEAN_HEX = 0xf4f1ea;
export const INFECTED_HEX = 0x5fe06e;
export const GOLD_HEX = 0xffd45c;

/* How big the craft are drawn, life size times this: big enough to read
 * across a classroom, small enough that a tag at TAG_R looks like a
 * touch. */
const CRAFT_SCALE = 1.5;
/* The ring, in the world's metres a sim metre (k): outside the drawn
 * craft's props. */
const RING_R = 0.3;
const RING_W = 0.05;
/* Pilots whose sight line is asked again each frame. */
const SIGHT_PER_FRAME = 4;

export class InfectedView extends DogfightView {
  constructor({ whoop = true } = {}) {
    super({ whoop, capacity: CAP, scale: CRAFT_SCALE });
    this.group.name = 'infected';
    const ring = new THREE.RingGeometry(1 - RING_W / RING_R, 1, 28, 1);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    this.rings = new THREE.InstancedMesh(ring, this.ringMat, CAP);
    this.rings.name = 'infected-rings';
    this.rings.frustumCulled = false;
    this.rings.castShadow = false;
    this.rings.receiveShadow = false;
    this.rings.renderOrder = 3;
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.setColorAt(0, new THREE.Color(CLEAN_HEX));
    this.rings.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.rings.count = 0;
    this.group.add(this.rings);
    /* What each ring slot was last painted, so a colour is written only
     * when a pilot changes side. */
    this.ringHex = new Int32Array(CAP).fill(-1);
    this.seen = new Uint8Array(CAP);
    this.sightNext = 1;
    this.camera = null;
    this.camQ = new THREE.Quaternion();
  }

  attach(scene, renderer, camera, target) {
    this.camera = camera || null;
    /* The ring's program linked with the rest, while the map loads. */
    this.rings.count = 1;
    super.attach(scene, renderer, camera, target);
    this.rings.count = 0;
  }

  dispose() {
    super.dispose();
    this.rings.geometry.dispose();
    this.ringMat.dispose();
    this.rings.dispose();
  }

  /* A pilot's colour on this frame: gold for the last one, else their side. */
  hexOf(g, i) {
    if (g.gold === i) return GOLD_HEX;
    return g.inf && g.inf[i] ? INFECTED_HEX : CLEAN_HEX;
  }

  pilotOf(g, i) {
    const p = super.pilotOf(g, i);
    p.hex = this.hexOf(g, i);
    p.pin = g.gold === i;
    p.noTag = !p.pin && !this.seen[i];
    return p;
  }

  liveryOf(slot) {
    const g = this.g;
    return g ? this.hexOf(g, slot) : CLEAN_HEX;
  }

  /* The sight lines, a few a frame, from the eye to the pilots. */
  look(g, camPos) {
    const w = g.world;
    if (!w || !w.blocked) {
      this.seen.fill(1);
      return;
    }
    for (let n = 0; n < SIGHT_PER_FRAME; n += 1) {
      let i = this.sightNext;
      this.sightNext = i + 1 >= g.cap ? 1 : i + 1;
      if (!g.inFight[i]) {
        i = -1;
      }
      if (i > 0) {
        this.seen[i] = w.blocked(camPos.x, camPos.y, camPos.z, g.x[i], g.y[i], g.z[i]) < 0 ? 1 : 0;
      }
    }
  }

  event(e, g, nowMs) {
    this.g = g;
    const k = g.k;
    if (e.type === 'tag') {
      this.confetti(e.x, e.y, e.z, INFECTED_HEX, 30, k, nowMs, 2.2);
      this.puff(e.x, e.y, e.z, 0.35 * k, 450, nowMs, INFECTED_HEX);
    } else if (e.type === 'shave') {
      this.confetti(e.x, e.y, e.z, 0x8fe0ff, 8, k, nowMs, 1.4);
    } else if (e.type === 'last') {
      this.confetti(e.x, e.y, e.z, GOLD_HEX, 36, k, nowMs, 2.4);
    } else if (e.type === 'free') {
      this.puff(e.x, e.y, e.z, 0.5 * k, 700, nowMs, INFECTED_HEX);
    } else if (e.type === 'over' && e.by >= 0 && g.inFight[e.by]) {
      this.confetti(g.x[e.by], g.y[e.by], g.z[e.by], this.hexOf(g, e.by), 40, k, nowMs, 2.6);
    }
  }

  frame(g, t, camPos, dtMs, nowMs) {
    this.g = g;
    /* Confetti here falls a third as far as the dogfight's, at the
     * school's scale. */
    this.pieceScale = 0.5;
    this.look(g, camPos);
    super.frame(g, t, camPos, dtMs, nowMs);
    /* The rings, round every bot drawn, turned to the eye. */
    const k = g.k;
    if (this.camera) {
      this.camera.getWorldQuaternion(this.camQ);
    }
    const puppet = g.puppet;
    let n = 0;
    let painted = false;
    this.s.setScalar(RING_R * k);
    for (let i = 1; i < g.cap; i += 1) {
      if (!g.isBot[i] || (puppet && puppet[i]) || !g.alive[i]) {
        continue;
      }
      const pose = this.poseOf(g, i, t);
      this.a.set(pose.px, pose.py, pose.pz);
      this.m.compose(this.a, this.camQ, this.s);
      this.rings.setMatrixAt(n, this.m);
      const hex = this.hexOf(g, i);
      if (this.ringHex[n] !== hex) {
        this.ringHex[n] = hex;
        this.rings.setColorAt(n, this.col.setHex(hex));
        painted = true;
      }
      n += 1;
    }
    this.rings.count = n;
    if (n) {
      this.rings.instanceMatrix.needsUpdate = true;
    }
    if (painted) {
      this.rings.instanceColor.needsUpdate = true;
    }
  }
}
