/*
 * quadball.js: how Quad Ball is drawn (src/game/quadball.js). The
 * dogfight's view (src/render/dogfight.js) for the bots, the confetti and
 * the puffs, with the team's colour on every quad, and the ball: one
 * low poly sphere in panels, rolling as it travels, and a flat shadow under
 * it so a ball in the air reads against the pitch.
 *
 * COST. Two draw calls over the dogfight's: the ball (320 triangles, one
 * material, vertex colours) and its shadow disc. The ball is posed from the
 * game's last two feeds and nothing is allocated a frame.
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
      return;
    }
    if (e.type === 'touch') {
      this.confetti(e.x, e.y, e.z, e.big ? 0xffd45c : CREAM, e.big ? 7 : 2, k, nowMs, 3);
      if (e.big) {
        this.puff(e.x, e.y, e.z, 0.9 * k, 350, nowMs);
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
    /* Roll: turn about up x velocity at the speed a rolling ball would. */
    const dt = Math.min(dtMs, 50) / 1000;
    this.vel.set(b.vx, b.vy, b.vz);
    const sp = this.vel.length();
    if (sp > 0.05 && dt > 0) {
      this.axis.crossVectors(this.up, this.vel).normalize();
      if (this.axis.lengthSq() > 0.5) {
        this.turn.setFromAxisAngle(this.axis, (sp / R) * dt);
        this.spin.premultiply(this.turn);
        this.ball.quaternion.copy(this.spin);
      }
    }
    /* The shadow on the floor, smaller and fainter the higher it is. */
    const floor = (g.arena && g.arena.floor) || 0;
    const h = Math.max(0, y - R - floor);
    const s = R * Math.max(0.35, 1 - h / (14 * k));
    this.shade.position.set(x, floor + 0.07, z);
    this.shade.scale.set(s, 1, s);
    this.shadowMat.opacity = 0.38 * Math.max(0.25, 1 - h / (20 * k));
    this.group.visible = true;
  }
}
