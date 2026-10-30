/*
 * quadball.js: how Quad Ball is drawn (src/game/quadball.js). The
 * dogfight's view (src/render/dogfight.js) for the bots, the confetti and
 * the puffs, with the team's colour on every quad, and the ball: one
 * low poly sphere in panels, rolling as it travels, and a flat shadow under
 * it so a ball in the air reads against the pitch.
 *
 * COST. Two draw calls over the dogfight's: the ball (320 triangles, one
 * material, vertex colours) and its shadow disc. The ball is posed from the
 * game's last two feeds and nothing is allocated a frame. The goal's
 * fireworks and the ball's trail are the dogfight's confetti and puffs,
 * which are one instanced draw each already, so they add no call: a goal
 * spends seven bursts of them over two seconds, and a fast ball one puff
 * every few frames.
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
import { BALL } from '../game/quadball.js';
import { LIVERIES } from './roomcraft.js';

const PINK = 0xf2a6bd;
const MINT = 0x8fe0b8;
const CREAM = 0xf3ead4;
const INKC = 0x23283c;
/* The avatars' livery numbers (1 based) for the two teams. */
const TEAM_LIVERY = [1, 9];
const TEAM_HEX = [PINK, MINT];
const GOLD = 0xffd45c;
/* A goal's fireworks: how many bursts, over how long, how many pieces each. */
const BURSTS = 7;
const BURST_SPAN_MS = 2000;
const BURST_PIECES = 30;
/* A ball faster than this, aircraft metres a second, leaves a trail. */
const TRAIL_SPEED = 20;
const TRAIL_EVERY_MS = 55;

function ballGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 2).toNonIndexed();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  /* A face of the icosahedron is 16 small triangles: 48 vertices. Panels
   * alternate cream, pink and mint by their place round the ball, with a
   * dark seam colour on every fifth so it reads as stitched. */
  for (let v = 0; v < n; v += 3) {
    const face = Math.floor(v / 3 / 16);
    const sub = (v / 3) % 16;
    let hex = CREAM;
    if (face % 5 === 0) {
      hex = PINK;
    } else if (face % 5 === 2) {
      hex = MINT;
    }
    if (sub === 0 || sub === 3 || sub === 12 || sub === 15) {
      hex = face % 2 ? INKC : hex;
    }
    c.setHex(hex);
    for (let i = 0; i < 3; i += 1) {
      col[(v + i) * 3] = c.r;
      col[(v + i) * 3 + 1] = c.g;
      col[(v + i) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

export class BallView extends DogfightView {
  constructor(opts = {}) {
    super(opts);
    this.ballMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    this.ball = new THREE.Mesh(ballGeometry(), this.ballMat);
    this.ball.name = 'quadball-ball';
    this.ball.frustumCulled = false;
    this.ball.castShadow = false;
    this.ball.receiveShadow = false;
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x1b2230, transparent: true, opacity: 0.38, depthWrite: false, fog: true,
    });
    const disc = new THREE.CircleGeometry(1, 20);
    disc.rotateX(-Math.PI / 2);
    this.shade = new THREE.Mesh(disc, this.shadowMat);
    this.shade.name = 'quadball-shadow';
    this.shade.frustumCulled = false;
    this.shade.renderOrder = 2;
    this.group.add(this.ball, this.shade);
    this.spin = new THREE.Quaternion();
    this.turn = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.vel = new THREE.Vector3();
    this.lastMs = 0;
    this.fwAt = new Float64Array(BURSTS).fill(-1);
    this.fwX = new Float64Array(BURSTS);
    this.fwY = new Float64Array(BURSTS);
    this.fwZ = new Float64Array(BURSTS);
    this.fwHex = new Int32Array(BURSTS);
    this.trailAt = 0;
    this.seed = 12345;
    /* A piece of confetti is a hand's width in the dogfight; over an arena it
     * has to be the size of a person to be seen from across the pitch. */
    this.pieceScale = 12;
  }

  /* A small integer random for the fireworks' places. */
  rand() {
    this.seed = (Math.imul(this.seed, 1103515245) + 12345) >>> 0;
    return this.seed / 4294967296;
  }

  /* The team's colour on every quad: the pilot's own livery is theirs to
   * show in a room, but a match has two sides. */
  pilotOf(g, i) {
    const p = super.pilotOf(g, i);
    p.avatar = { ...(p.avatar || {}), livery: TEAM_LIVERY[g.team[i] || 0] };
    return p;
  }

  liveryOf(slot) {
    const g = this.game;
    return g ? LIVERIES[TEAM_LIVERY[g.team[slot] || 0] - 1] : super.liveryOf(slot);
  }

  dispose() {
    super.dispose();
    this.ball.geometry.dispose();
    this.ballMat.dispose();
    this.shade.geometry.dispose();
    this.shadowMat.dispose();
  }

  event(e, g, nowMs) {
    this.game = g;
    const k = g.k;
    if (e.type === 'goal') {
      const hex = TEAM_HEX[e.to] || PINK;
      this.confetti(e.x, e.y, e.z, hex, 90, k, nowMs, 12);
      this.confetti(e.x, e.y + 2 * k, e.z, CREAM, 40, k, nowMs, 9);
      this.puff(e.x, e.y, e.z, 4 * k, 900, nowMs, hex);
      /* Fireworks over the end the goal was scored at, a few at a time. */
      const A = g.arena || { hx: 55, hz: 26 };
      const dir = e.to === 0 ? 1 : -1;
      const mix = [hex, CREAM, GOLD, hex, 0xffffff, GOLD, hex];
      for (let i = 0; i < BURSTS; i += 1) {
        this.fwAt[i] = nowMs + 150 + (i * BURST_SPAN_MS) / BURSTS + this.rand() * 120;
        this.fwX[i] = dir * (A.hx * (0.35 + this.rand() * 0.6));
        this.fwY[i] = (26 + this.rand() * 16) * k;
        this.fwZ[i] = (this.rand() * 2 - 1) * A.hz * 0.85;
        this.fwHex[i] = mix[i % mix.length];
      }
      return;
    }
    if (e.type === 'touch') {
      this.confetti(e.x, e.y, e.z, e.big ? 0xffd45c : CREAM, e.big ? 7 : 2, k, nowMs, 3);
      if (e.big) {
        this.puff(e.x, e.y, e.z, 0.9 * k, 350, nowMs);
      }
      return;
    }
    if (e.type === 'bounce') {
      if (e.big) {
        this.puff(e.x, Math.max(e.y - 1.2 * k, 0.2), e.z, 0.8 * k, 300, nowMs);
      }
      return;
    }
    super.event(e, g, nowMs);
  }

  frame(g, t, camPos, dtMs, nowMs) {
    this.game = g;
    super.frame(g, t, camPos, dtMs, nowMs);
    const k = g.k;
    const R = BALL.radius * k;
    const u = 1 - t;
    const p = g.ballPrev;
    const b = g.ball;
    const x = p.x * u + b.x * t;
    const y = p.y * u + b.y * t;
    const z = p.z * u + b.z * t;
    this.ball.position.set(x, y, z);
    this.ball.scale.setScalar(R);
    /* Spin: the physics' own, so a ball rolls when it rolls, skids when it
     * skids and turns in the air as it was hit. A guest's ball is spun by
     * its own copy of the arena, not the host's, so a hit made on another
     * page shows a plain ball until it touches something. */
    const dt = Math.min(dtMs, 50) / 1000;
    this.vel.set(b.vx, b.vy, b.vz);
    const sp = this.vel.length();
    this.axis.set(b.wx || 0, b.wy || 0, b.wz || 0);
    const w = this.axis.length();
    if (w > 0.02 && dt > 0) {
      this.axis.multiplyScalar(1 / w);
      this.turn.setFromAxisAngle(this.axis, w * dt);
      this.spin.premultiply(this.turn);
      this.ball.quaternion.copy(this.spin);
    }
    /* The shadow on the floor, smaller and fainter the higher it is. */
    const floor = (g.arena && g.arena.floor) || 0;
    const h = Math.max(0, y - R - floor);
    const s = R * Math.max(0.35, 1 - h / (14 * k));
    this.shade.position.set(x, floor + 0.07, z);
    this.shade.scale.set(s, 1, s);
    this.shadowMat.opacity = 0.38 * Math.max(0.25, 1 - h / (20 * k));
    /* A trail behind a fast ball, in the colour of the team that last hit it. */
    if (sp > TRAIL_SPEED * k && nowMs - this.trailAt > TRAIL_EVERY_MS && g.lastTouchTeam >= 0) {
      this.trailAt = nowMs;
      this.puff(x, y, z, R * 0.7, 320, nowMs, TEAM_HEX[g.lastTouchTeam]);
    }
    /* The fireworks of the last goal, due bursts fired. */
    for (let i = 0; i < BURSTS; i += 1) {
      if (this.fwAt[i] >= 0 && nowMs >= this.fwAt[i]) {
        this.fwAt[i] = -1;
        this.confetti(this.fwX[i], this.fwY[i], this.fwZ[i], this.fwHex[i], BURST_PIECES, k, nowMs, 11);
        this.puff(this.fwX[i], this.fwY[i], this.fwZ[i], 2.2 * k, 500, nowMs, this.fwHex[i]);
      }
    }
    this.group.visible = true;
  }
}
