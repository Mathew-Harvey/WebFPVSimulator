/*
 * signs.js: every painted plate on Momiji Pass, drawn once into one canvas
 * and hung as one mesh, so the whole pass's lettering is one draw call and
 * one texture. The words are the pass's own, in Japanese as a Japanese
 * road's would be, and name nothing real: the tunnel and the pass are
 * named after the maples, the hairpins are numbered, and the tea house is
 * the pass's tea house. No brand is lettered anywhere.
 *
 * Painted in the town's sign hand: a heavy face, ink edges, flat colour.
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

const INK = '#2a2630';
const FACE = '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", "Meiryo", "Arial Black", sans-serif';

function font(g, px, weight = 900) {
  g.font = `${weight} ${px}px ${FACE}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
}

function text(g, s, x, y, px, colour, maxW) {
  font(g, px);
  g.fillStyle = colour;
  g.fillText(s, x, y, maxW);
}

function panel(g, w, h, fill, edge = INK, round = 10, lw = 6) {
  g.fillStyle = fill;
  g.strokeStyle = edge;
  g.lineWidth = lw;
  g.beginPath();
  g.roundRect(lw / 2, lw / 2, w - lw, h - lw, round);
  g.fill();
  g.stroke();
}

/* Each sign: its cell's size in pixels and how it is painted. */
const SIGNS = {
  tunnelPlate: {
    w: 512, h: 112, paint(g, w, h) {
      panel(g, w, h, '#e8e2d2', INK, 6, 8);
      text(g, '紅葉隧道', w * 0.36, h * 0.52, 66, INK, w * 0.6);
      text(g, 'MOMIJI TUNNEL', w * 0.8, h * 0.5, 22, INK, w * 0.3);
    },
  },
  teaSign: {
    w: 512, h: 100, paint(g, w, h) {
      panel(g, w, h, '#5e4436', '#2a2026', 4, 6);
      text(g, '峠の茶屋', w / 2, h * 0.53, 64, '#f6efd8', w * 0.9);
    },
  },
  noren: {
    w: 256, h: 108, paint(g, w, h) {
      g.fillStyle = '#2f3f6e';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#f6efd8';
      for (let k = 1; k < 4; k += 1) {
        g.fillRect((w * k) / 4 - 2, h * 0.35, 4, h * 0.65);
      }
      text(g, '茶', w / 2, h * 0.4, 58, '#f6efd8');
    },
  },
  passStone: {
    w: 220, h: 240, paint(g, w, h) {
      g.fillStyle = '#8a847c';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#4d4a5a';
      font(g, 64);
      for (const [k, c] of ['紅', '葉', '峠'].entries()) {
        g.fillText(c, w * 0.58, h * (0.2 + k * 0.28));
      }
      font(g, 22, 700);
      g.fillText('標高', w * 0.22, h * 0.3);
      g.fillText('八四六', w * 0.22, h * 0.48);
      g.fillText('米', w * 0.22, h * 0.64);
    },
  },
  ema: {
    w: 200, h: 100, paint(g, w, h) {
      panel(g, w, h, '#c9a676', '#5e4436', 4, 5);
      text(g, '奉納', w / 2, h / 2, 46, '#5e2a26');
    },
  },
  viewBoard: {
    w: 300, h: 120, paint(g, w, h) {
      panel(g, w, h, '#2f5a4a', '#f6efd8', 8, 6);
      text(g, '展望台', w / 2, h * 0.38, 46, '#f6efd8');
      g.strokeStyle = '#f6efd8';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(w * 0.12, h * 0.85);
      g.lineTo(w * 0.32, h * 0.62);
      g.lineTo(w * 0.46, h * 0.76);
      g.lineTo(w * 0.62, h * 0.56);
      g.lineTo(w * 0.88, h * 0.85);
      g.stroke();
    },
  },
  chevron: {
    w: 120, h: 80, paint(g, w, h) {
      g.fillStyle = '#f2c43a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = INK;
      for (const ox of [0.18, 0.52]) {
        g.beginPath();
        g.moveTo(w * ox, h * 0.15);
        g.lineTo(w * (ox + 0.2), h * 0.5);
        g.lineTo(w * ox, h * 0.85);
        g.lineTo(w * (ox + 0.12), h * 0.85);
        g.lineTo(w * (ox + 0.32), h * 0.5);
        g.lineTo(w * (ox + 0.12), h * 0.15);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = INK;
      g.lineWidth = 6;
      g.strokeRect(3, 3, w - 6, h - 6);
    },
  },
  speed40: {
    w: 128, h: 128, paint(g, w, h) {
      g.fillStyle = '#f6f4ee';
      g.strokeStyle = '#d8352c';
      g.lineWidth = 16;
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 10, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      text(g, '40', w / 2, h * 0.53, 62, '#2f3f8e');
    },
  },
  bendWarn: {
    w: 128, h: 128, paint(g, w, h) {
      g.fillStyle = '#f2c43a';
      g.strokeStyle = INK;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(w / 2, 6);
      g.lineTo(w - 6, h / 2);
      g.lineTo(w / 2, h - 6);
      g.lineTo(6, h / 2);
      g.closePath();
      g.fill();
      g.stroke();
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(w * 0.42, h * 0.78);
      g.lineTo(w * 0.42, h * 0.45);
      g.quadraticCurveTo(w * 0.42, h * 0.28, w * 0.6, h * 0.28);
      g.stroke();
    },
  },
  busStop: {
    w: 128, h: 128, paint(g, w, h) {
      g.fillStyle = '#f6f4ee';
      g.strokeStyle = '#2f3f8e';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 8, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      text(g, 'バス', w / 2, h * 0.4, 34, '#2f3f8e');
      text(g, '峠口', w / 2, h * 0.68, 30, INK);
    },
  },
};
/* The six hairpin plates, numbered as the road climbs and falls. */
for (let k = 1; k <= 6; k += 1) {
  SIGNS[`hairpin${k}`] = {
    w: 112, h: 144, paint(g, w, h) {
      panel(g, w, h, '#2f3f8e', '#f6f4ee', 10, 6);
      text(g, '第', w / 2, h * 0.16, 24, '#f6f4ee');
      text(g, String(k), w / 2, h * 0.47, 72, '#f6f4ee');
      text(g, 'カーブ', w / 2, h * 0.82, 26, '#f6f4ee', w * 0.86);
    },
  };
}

/* The atlas: every sign used, in rows. { canvas, cells, w, h }. */
export function paintSigns(keys) {
  const used = [...new Set(keys)].filter((k) => SIGNS[k]);
  const W = 1024;
  const cells = {};
  let x = 0;
  let y = 0;
  let row = 0;
  for (const k of used) {
    const s = SIGNS[k];
    if (x + s.w > W) {
      x = 0;
      y += row;
      row = 0;
    }
    cells[k] = { x, y, w: s.w, h: s.h };
    x += s.w;
    row = Math.max(row, s.h);
  }
  let H = 1;
  while (H < y + row) {
    H *= 2;
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  for (const k of used) {
    const cell = cells[k];
    g.save();
    g.translate(cell.x, cell.y);
    g.beginPath();
    g.rect(0, 0, cell.w, cell.h);
    g.clip();
    SIGNS[k].paint(g, cell.w, cell.h);
    g.restore();
  }
  return { canvas: c, cells, w: W, h: H };
}

/* The signs as one mesh: each a quad facing its plan direction. */
export function signMesh(THREE, signs, atlas, material, worldAt) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  for (const s of signs) {
    const cell = atlas.cells[s.key];
    if (!cell) {
      continue;
    }
    const u0 = (cell.x + 0.5) / atlas.w;
    const u1 = (cell.x + cell.w - 0.5) / atlas.w;
    const v0 = 1 - (cell.y + cell.h - 0.5) / atlas.h;
    const v1 = 1 - (cell.y + 0.5) / atlas.h;
    const nx = s.dir[0];
    const nz = -s.dir[1];
    /* right = up x n, with up = +y: (nz, 0, -nx). */
    const rx = nz;
    const rz = -nx;
    const [cx, cy, cz] = worldAt(s.x, s.y, s.h);
    const base = pos.length / 3;
    for (const [sx, sy, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      pos.push(cx + nx * s.lift + (rx * sx * s.w) / 2, cy + (sy * s.ht) / 2, cz + nz * s.lift + (rz * sx * s.w) / 2);
      nor.push(nx, 0, nz);
      uv.push(u0 + tu * (u1 - u0), v0 + tv * (v1 - v0));
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'touge signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
