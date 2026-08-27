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
    side: THREE.FrontSide,
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

  const fascia = paint(1024, 256, (c, w, h) => {
    c.fillStyle = navy;
    c.fillRect(0, 0, w, h);
    c.fillStyle = orange;
    c.fillRect(0, 0, w, 18);
    c.fillRect(0, h - 22, w, 22);
    c.fillStyle = white;
    c.font = 'bold 92px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.letterSpacing = '8px';
    c.fillText('CIVIC BATHS', w * 0.5, 128);
    c.letterSpacing = '0px';
    c.font = 'bold 44px Arial, sans-serif';
    c.fillStyle = tile;
    c.fillText('EST. 1974    50 m', w * 0.5, 186);
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
    c.fillStyle = navy;
    c.fillRect(0, 0, w, h);
    c.fillStyle = white;
    c.font = 'bold 64px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('NO DIVING', w * 0.5, 108);
    c.font = 'bold 36px Arial, sans-serif';
    c.fillText('SHALLOW  1.4 m', w * 0.5, 178);
  });

  const depth = (label) => paint(256, 128, (c, w, h) => {
    c.fillStyle = navy;
    c.fillRect(0, 0, w, h);
    c.fillStyle = white;
    c.font = 'bold 56px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText(label, w * 0.5, 86);
  });

  const numeral = (label) => paint(256, 256, (c, w, h) => {
    c.fillStyle = navy;
    c.beginPath();
    c.arc(w * 0.5, h * 0.5, 118, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = orange;
    c.font = 'bold 140px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, w * 0.5, h * 0.52);
  });

  const mural = paint(1024, 384, (c, w, h) => {
    c.fillStyle = cream;
    c.fillRect(0, 0, w, h);
    c.fillStyle = orange;
    c.fillRect(0, 0, w, 16);
    c.fillRect(0, h - 16, w, 16);
    c.fillStyle = tile;
    c.fillRect(48, 210, w - 96, 110);
    c.fillStyle = cream;
    for (let i = 1; i < 6; i += 1) {
      const x = 48 + ((w - 96) * i) / 6;
      c.fillRect(x - 3, 214, 6, 102);
    }
    c.fillStyle = navy;
    c.beginPath();
    c.ellipse(320, 160, 70, 22, -0.4, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(390, 148, 16, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = white;
    c.font = 'bold 84px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('1974', 700, 150);
    c.fillStyle = ink;
    c.font = 'bold 28px Arial, sans-serif';
    c.fillText('MUNICIPAL  SWIMMING  HALL', w * 0.5, 360);
  });

  const ring = paint(256, 256, (c) => {
    c.strokeStyle = orange;
    c.lineWidth = 28;
    c.beginPath();
    c.arc(128, 128, 96, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = white;
    c.lineWidth = 12;
    c.beginPath();
    c.arc(128, 128, 96, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = navy;
    c.font = 'bold 28px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('CIVIC', 128, 138);
  });

  const banner = paint(256, 1024, (c, w, h) => {
    c.fillStyle = navy;
    c.fillRect(0, 0, w, h);
    c.fillStyle = orange;
    c.fillRect(0, h - 48, w, 48);
    c.save();
    c.translate(w * 0.5, h * 0.48);
    c.rotate(-Math.PI * 0.5);
    c.fillStyle = white;
    c.font = 'bold 72px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('CIVIC', 0, 24);
    c.restore();
  });

  const plaza = paint(1024, 256, (c, w, h) => {
    c.fillStyle = orange;
    c.font = 'bold 140px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('CIVIC', w * 0.5, 180);
  });

  const closed = paint(512, 160, (c, w, h) => {
    c.fillStyle = navy;
    c.fillRect(0, 0, w, h);
    c.fillStyle = orange;
    c.fillRect(0, 0, w, 10);
    c.fillRect(0, h - 10, w, 10);
    c.fillStyle = cream;
    c.font = 'bold 42px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText('CLOSED  FOR  FLYING', w * 0.5, 96);
    drips(c, 40, 118, 420, 36, orange, 5);
  });

  const laneNo = (n) => paint(128, 128, (c) => {
    c.fillStyle = navy;
    c.beginPath();
    c.arc(64, 64, 54, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = white;
    c.font = 'bold 72px Impact, Arial Black, sans-serif';
    c.textAlign = 'center';
    c.fillText(String(n), 64, 88);
  });

  return {
    fascia, crest, noDive, mural, ring, banner, plaza, closed,
    d14: depth('1.4 m'),
    d22: depth('2.2 m'),
    d50: depth('5.0 m'),
    n3: numeral('3'),
    n5: numeral('5'),
    n75: numeral('7.5'),
    n10: numeral('10'),
    lanes: [1, 2, 3, 4, 5, 6].map(laneNo),
  };
}
