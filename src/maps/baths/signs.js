/*
 * signs.js: canvas paint for the baths. Logos, depth marks, the crest.
 *
 * Ink outlines mesh edges, so stall-scale type is a texture, not a box.
 * Nothing here is a collider.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { PAL } from './palette.js';
import { flat } from './cel/toon.js';

export function hex(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function paint(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function sticker(root, tex, x, y, z, w, h, yaw, pitch) {
  const mat = flat({
    map: tex,
    transparent: true,
    alphaTest: 0.12,
    side: THREE.DoubleSide,
    fog: true,
    cache: false,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  if (pitch) {
    mesh.rotation.x = pitch;
  }
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noMerge = true;
  mesh.userData.noShadow = true;
  root.add(mesh);
  return mesh;
}

function drips(ctx, x, y, w, h, color, n) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i += 1) {
    const dx = x + (w * (i + 0.35)) / n;
    const drop = h * (0.35 + ((i * 17) % 5) * 0.12);
    const tw = 3 + (i % 3);
    ctx.fillRect(dx, y, tw, drop);
    ctx.beginPath();
    ctx.arc(dx + tw * 0.5, y + drop, tw * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function makeSigns() {
  const orange = hex(PAL.orange);
  const navy = hex(PAL.navy);
  const cream = hex(PAL.creamSun);
  const ink = hex(PAL.ink);
  const white = hex(PAL.bandWhite);
  const tile = hex(PAL.tile);
  const safety = hex(PAL.safety);
  const red = hex(PAL.bandRed);

  const fascia = paint(1024, 256, (c, w, h) => {
    c.fillStyle = navy;
    c.fillRect(0, 0, w, h);
    c.fillStyle = orange;
    c.fillRect(0, h - 28, w, 28);
    c.fillStyle = white;
    c.font = 'bold 92px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('CIVIC BATHS', w * 0.5, 118);
    c.font = 'bold 36px Arial, sans-serif';
    c.fillStyle = tile;
    c.fillText('EST. 1974   50 m   6 LANE', w * 0.5, 178);
  });

  const crest = paint(512, 512, (c, w, h) => {
    c.fillStyle = navy;
    c.beginPath();
    c.arc(w * 0.5, h * 0.5, 220, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = orange;
    c.lineWidth = 18;
    c.stroke();
    c.fillStyle = tile;
    c.beginPath();
    c.ellipse(w * 0.5, h * 0.52, 140, 70, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = white;
    c.font = 'bold 48px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('CIVIC', w * 0.5, 200);
    c.font = 'bold 36px Impact, Arial Black, sans-serif';
    c.fillText('BATHS', w * 0.5, 380);
  });

  const noDive = paint(512, 256, (c, w, h) => {
    c.fillStyle = safety;
    c.fillRect(0, 0, w, h);
    c.fillStyle = ink;
    c.font = 'bold 72px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('NO DIVING', w * 0.5, 110);
    c.font = 'bold 40px Arial, sans-serif';
    c.fillText('SHALLOW  1.4 m', w * 0.5, 180);
  });

  const depth = (label) => paint(256, 128, (c, w, h) => {
    c.fillStyle = navy;
    c.fillRect(0, 0, w, h);
    c.fillStyle = white;
    c.font = 'bold 56px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText(label, w * 0.5, 86);
  });

  const clock = paint(256, 256, (c, w, h) => {
    c.fillStyle = cream;
    c.beginPath();
    c.arc(128, 128, 118, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = navy;
    c.lineWidth = 10;
    c.stroke();
    c.strokeStyle = ink;
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(128, 128);
    c.lineTo(128, 48);
    c.moveTo(128, 128);
    c.lineTo(188, 128);
    c.stroke();
    c.fillStyle = orange;
    c.beginPath();
    c.arc(128, 128, 10, 0, Math.PI * 2);
    c.fill();
  });

  const board = paint(768, 256, (c, w, h) => {
    c.fillStyle = navy;
    c.fillRect(0, 0, w, h);
    c.fillStyle = orange;
    c.fillRect(16, 16, w - 32, 8);
    c.fillStyle = tile;
    c.font = 'bold 48px Impact, Arial Black, sans-serif';
    c.textAlign = 'left';
    c.fillText('LANE', 40, 90);
    c.fillText('TIME', 400, 90);
    c.fillStyle = white;
    c.font = 'bold 40px Consolas, monospace';
    c.fillText('1   28.41', 40, 150);
    c.fillText('2   28.66', 40, 200);
    c.fillText('3   29.02', 400, 150);
    c.fillText('4   29.18', 400, 200);
  });

  const gallery = paint(512, 128, (c, w, h) => {
    c.fillStyle = orange;
    c.fillRect(0, 0, w, h);
    c.fillStyle = white;
    c.font = 'bold 64px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('GALLERY', w * 0.5, 88);
  });

  const changing = paint(512, 128, (c, w, h) => {
    c.fillStyle = navy;
    c.fillRect(0, 0, w, h);
    c.fillStyle = white;
    c.font = 'bold 52px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('CHANGING', w * 0.5, 88);
  });

  const plant = paint(384, 128, (c, w, h) => {
    c.fillStyle = ink;
    c.fillRect(0, 0, w, h);
    c.fillStyle = safety;
    c.font = 'bold 48px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('PLANT', w * 0.5, 86);
  });

  const exit = paint(256, 128, (c, w, h) => {
    c.fillStyle = red;
    c.fillRect(0, 0, w, h);
    c.fillStyle = white;
    c.font = 'bold 64px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('EXIT', w * 0.5, 90);
  });

  const laneNo = (n) => paint(128, 128, (c, w, h) => {
    c.fillStyle = white;
    c.beginPath();
    c.arc(64, 64, 54, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = navy;
    c.font = 'bold 72px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText(String(n), 64, 88);
  });

  const roof = paint(1024, 256, (c, w, h) => {
    c.fillStyle = orange;
    c.font = 'bold 160px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('BATHS', w * 0.5, 190);
  });

  const fpv = paint(384, 256, (c) => {
    c.fillStyle = tile;
    c.beginPath();
    c.moveTo(40, 150);
    c.quadraticCurveTo(30, 40, 120, 50);
    c.quadraticCurveTo(200, 20, 280, 60);
    c.quadraticCurveTo(360, 90, 340, 170);
    c.quadraticCurveTo(300, 230, 180, 220);
    c.quadraticCurveTo(70, 230, 40, 150);
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 10;
    c.stroke();
    c.fillStyle = ink;
    c.font = 'bold 96px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('FPV', 190, 165);
  });

  const wet = paint(256, 256, (c) => {
    c.fillStyle = safety;
    c.beginPath();
    c.moveTo(128, 18);
    c.lineTo(238, 228);
    c.lineTo(18, 228);
    c.closePath();
    c.fill();
    c.fillStyle = ink;
    c.font = 'bold 28px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('WET', 128, 150);
    c.fillText('FLOOR', 128, 184);
  });

  const closed = paint(512, 160, (c, w, h) => {
    c.fillStyle = cream;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = orange;
    c.lineWidth = 10;
    c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = ink;
    c.font = 'bold 48px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('CLOSED  FOR  FLYING', w * 0.5, 100);
    drips(c, 40, 118, 420, 36, orange, 5);
  });

  return {
    fascia, crest, noDive, clock, board, gallery, changing, plant, exit, roof, fpv, wet, closed,
    d14: depth('1.4 m'),
    d22: depth('2.2 m'),
    d50: depth('5.0 m'),
    lanes: [1, 2, 3, 4, 5, 6].map(laneNo),
  };
}