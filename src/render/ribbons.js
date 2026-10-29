/*
 * ribbons.js (render): ribbon cutting's world, src/game/ribbons.js drawn.
 * The bots, the confetti and the puffs are the dogfight's view, this class
 * is that view, and it adds the ribbons: every pilot's, and the pieces cut
 * off them falling away.
 *
 * COST. One mesh, one draw call, for every ribbon there is: a flat strip a
 * link a quad, turned each frame to face the eye so a ribbon seen edge on
 * is still a ribbon. Sixteen ribbons (the eight in the round and eight
 * pieces falling) of fifteen links is 960 vertices, written into one
 * buffer a frame and uploaded once. No texture, no light, no shadow: the
 * stripes are vertex colours, the ribbon's livery and cream link by link,
 * the way a streamer is printed.
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
import { liveryColour } from './roomcraft.js';
import { MAX_PILOTS, ME } from '../game/dogfight.js';
import { RIBBON_POINTS } from '../game/ribbons.js';

const LINKS = RIBBON_POINTS - 1;
const FALLING = 8;
const CREAM = 0xf3ead4;
/* How long a cut piece falls before it is gone, ms. */
const FALL_MS = 2600;
/* How wide a ribbon is drawn, in the aircraft's metres. Wider than a real
 * streamer, as the bots are drawn bigger than a real quad: a ribbon you
 * cannot see from across the field cannot be chased. */
const WIDTH = 0.14;
/* The pilot's own first links are not drawn: they start at the camera and
 * would fill the lens on a look down. */
const MINE_FROM = 2;

export class RibbonView extends DogfightView {
  /* opts.slots: how many ribbons there can be, the dogfight's eight, or a
   * room's pilots (src/game/ribbons.js RibbonRoom). The ribbons drawn are
   * packed to the front and only those are uploaded and drawn, so a room
   * built for 64 with three in it costs what three cost. */
  constructor(opts = {}) {
    super(opts);
    this.slots = opts.slots || MAX_PILOTS;
    const STRIPS = this.slots + FALLING;
    const VERTS = STRIPS * LINKS * 4;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(VERTS * 3);
    this.ribbonCol = new Float32Array(VERTS * 3);
    const idx = new Uint16Array(STRIPS * LINKS * 6);
    for (let q = 0; q < STRIPS * LINKS; q += 1) {
      const v = q * 4;
      idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6);
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.ribbonCol, 3);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    /* Drawn whole once, so the program links while the map loads. */
    geo.setDrawRange(0, 6);
    this.ribbonMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
    this.ribbons = new THREE.Mesh(geo, this.ribbonMat);
    this.ribbons.name = 'ribbons';
    this.ribbons.frustumCulled = false;
    this.ribbons.castShadow = false;
    this.ribbons.receiveShadow = false;
    this.group.add(this.ribbons);
    /* Each strip's colour, so a strip is repainted only when its owner
     * changes. */
    this.stripHex = new Int32Array(STRIPS).fill(-1);
    this.stripsDrawn = 0;
    /* Falling pieces: points, how many, whose, when cut, how they drift. */
    this.fall = new Float32Array(FALLING * RIBBON_POINTS * 3);
    this.fallN = new Int8Array(FALLING);
    this.fallOwner = new Int8Array(FALLING);
    this.fallBorn = new Float64Array(FALLING).fill(-1e9);
    this.fallDrift = new Float32Array(FALLING * 2);
    this.fallNext = 0;
    this.pts = new Float32Array(RIBBON_POINTS * 3);
    this.colour = new THREE.Color();
  }

  /* A room's pilots wear their own livery, and so do their ribbons. */
  liveryOf(slot) {
    const g = this.game;
    /* A room's bots wear the dogfight's bot colours on every page
     * (src/net/roombots.js). */
    if (g && g.room && (slot < 1 || slot >= MAX_PILOTS)) {
      return liveryColour(g.avatars[slot], slot === ME ? g.you : g.idOf[slot]);
    }
    return super.liveryOf(slot);
  }

  dispose() {
    super.dispose();
    this.ribbons.geometry.dispose();
    this.ribbonMat.dispose();
  }

  /* A cut: the piece that fell off, copied out of the game before anything
   * writes over it, and the dogfight's confetti for the pop. */
  event(e, g, nowMs) {
    this.game = g;
    if (e.type === 'cut' || e.type === 'out') {
      const k = g.k;
      const f = this.fallNext;
      this.fallNext = (f + 1) % FALLING;
      const base = e.to * RIBBON_POINTS;
      let n = 0;
      for (let s = e.at; s < e.end && n < RIBBON_POINTS; s += 1) {
        const j = base + s;
        const o = (f * RIBBON_POINTS + n) * 3;
        this.fall[o] = g.rx[j];
        this.fall[o + 1] = g.ry[j];
        this.fall[o + 2] = g.rz[j];
        n += 1;
      }
      this.fallN[f] = n;
      this.fallOwner[f] = e.to;
      this.fallBorn[f] = nowMs;
      const a = (f * 0.37 + e.to * 0.61) % 1;
      this.fallDrift[f * 2] = (a - 0.5) * 1.2 * k;
      this.fallDrift[f * 2 + 1] = (0.5 - ((a * 7) % 1)) * 1.2 * k;
      this.confetti(e.x, e.y, e.z, this.liveryOf(e.to), e.type === 'out' ? 36 : 12, k, nowMs, e.type === 'out' ? 6 : 3.5);
      if (e.type === 'out') {
        this.puff(g.x[e.to], g.y[e.to], g.z[e.to], 0.9 * k, 500, nowMs);
      }
      return;
    }
    super.event(e, g, nowMs);
  }

  /* One strip from `n` points in this.pts, into strip slot `strip`, in
   * `hex`, `w` wide, facing the eye. Returns the quads written. */
  strip(strip, n, from, hex, w, eye) {
    if (this.stripHex[strip] !== hex) {
      this.stripHex[strip] = hex;
      this.colour.setHex(hex);
      const r1 = this.colour.r; const g1 = this.colour.g; const b1 = this.colour.b;
      this.colour.setHex(CREAM);
      const r2 = this.colour.r; const g2 = this.colour.g; const b2 = this.colour.b;
      for (let l = 0; l < LINKS; l += 1) {
        const stripe = (l >> 1) % 2 === 0;
        for (let c = 0; c < 4; c += 1) {
          const o = ((strip * LINKS + l) * 4 + c) * 3;
          this.ribbonCol[o] = stripe ? r1 : r2;
          this.ribbonCol[o + 1] = stripe ? g1 : g2;
          this.ribbonCol[o + 2] = stripe ? b1 : b2;
        }
      }
      this.colAttr.needsUpdate = true;
      this.colDirty = true;
    }
    const p = this.pts;
    let quads = 0;
    for (let l = 0; l < LINKS; l += 1) {
      const o = ((strip * LINKS + l) * 4) * 3;
      if (l + 1 >= n || l < from) {
        /* Nothing here this frame: a quad of no size. */
        for (let c = 0; c < 12; c += 1) {
          this.pos[o + c] = 0;
        }
        continue;
      }
      const ax = p[l * 3]; const ay = p[l * 3 + 1]; const az = p[l * 3 + 2];
      const bx = p[l * 3 + 3]; const by = p[l * 3 + 4]; const bz = p[l * 3 + 5];
      /* Across the link and across the line to the eye. */
      const dx = bx - ax; const dy = by - ay; const dz = bz - az;
      const ex = (ax + bx) * 0.5 - eye.x;
      const ey = (ay + by) * 0.5 - eye.y;
      const ez = (az + bz) * 0.5 - eye.z;
      let sx = dy * ez - dz * ey;
      let sy = dz * ex - dx * ez;
      let sz = dx * ey - dy * ex;
      const m = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (m < 1e-9) {
        sx = w * 0.5; sy = 0; sz = 0;
      } else {
        const f = (w * 0.5) / m;
        sx *= f; sy *= f; sz *= f;
      }
      this.pos[o] = ax - sx; this.pos[o + 1] = ay - sy; this.pos[o + 2] = az - sz;
      this.pos[o + 3] = ax + sx; this.pos[o + 4] = ay + sy; this.pos[o + 5] = az + sz;
      this.pos[o + 6] = bx - sx; this.pos[o + 7] = by - sy; this.pos[o + 8] = bz - sz;
      this.pos[o + 9] = bx + sx; this.pos[o + 10] = by + sy; this.pos[o + 11] = bz + sz;
      quads += 1;
    }
    return quads;
  }

  frame(g, t, camPos, dtMs, nowMs) {
    this.game = g;
    super.frame(g, t, camPos, dtMs, nowMs);
    const k = g.k;
    const u = 1 - t;
    const w = WIDTH * k;
    const p = this.pts;
    const slots = Math.min(this.slots, g.cap || MAX_PILOTS);
    let strip = 0;
    /* The ribbons in the round, between the game's last two feeds. */
    for (let i = 0; i < slots; i += 1) {
      const n = g.rCount[i];
      if (n < 2 || (g.here && !g.here(i))) {
        continue;
      }
      const base = i * RIBBON_POINTS;
      for (let s = 0; s < n; s += 1) {
        const j = base + s;
        p[s * 3] = g.rxPrev[j] * u + g.rx[j] * t;
        p[s * 3 + 1] = g.ryPrev[j] * u + g.ry[j] * t;
        p[s * 3 + 2] = g.rzPrev[j] * u + g.rz[j] * t;
      }
      this.strip(strip, n, i === ME ? MINE_FROM : 0, this.liveryOf(i), w, camPos);
      strip += 1;
    }
    /* The pieces cut off, falling and drifting, narrowing as they go. */
    const dt = Math.min(dtMs, 50) / 1000;
    for (let f = 0; f < FALLING; f += 1) {
      const age = nowMs - this.fallBorn[f];
      const n = this.fallN[f];
      if (age > FALL_MS || n < 2) {
        this.fallN[f] = 0;
        continue;
      }
      const sink = 1.4 * k * dt;
      for (let s = 0; s < n; s += 1) {
        const o = (f * RIBBON_POINTS + s) * 3;
        /* The far end flutters down a little faster than the cut end. */
        this.fall[o] += this.fallDrift[f * 2] * dt;
        this.fall[o + 1] -= sink * (1 + s * 0.04);
        this.fall[o + 2] += this.fallDrift[f * 2 + 1] * dt;
        p[s * 3] = this.fall[o];
        p[s * 3 + 1] = this.fall[o + 1];
        p[s * 3 + 2] = this.fall[o + 2];
      }
      const shrink = age > FALL_MS * 0.6 ? 1 - (age - FALL_MS * 0.6) / (FALL_MS * 0.4) : 1;
      this.strip(strip, n, 0, this.liveryOf(this.fallOwner[f]), w * Math.max(0.05, shrink), camPos);
      strip += 1;
    }
    /* Only the strips drawn are uploaded, the colours only when one
     * changed hands. */
    const floats = strip * LINKS * 12;
    this.posAttr.clearUpdateRanges();
    this.posAttr.addUpdateRange(0, floats);
    this.posAttr.needsUpdate = floats > 0;
    if (this.colDirty) {
      this.colDirty = false;
      this.colAttr.clearUpdateRanges();
      this.colAttr.addUpdateRange(0, Math.max(floats, this.stripsDrawn * LINKS * 12));
    }
    this.stripsDrawn = strip;
    this.ribbons.geometry.setDrawRange(0, strip * LINKS * 6);
  }
}
