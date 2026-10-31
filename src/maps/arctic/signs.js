/*
 * signs.js: every painted sign on Hyoura Island on one picture, and the one
 * mesh that shows them, as Sunnyfield's are (../sunny/signs.js): a hundred
 * signs would still be one draw call and one texture. There are only a few
 * here, and each is the kind a Shiretoko harbour has: the fishing
 * cooperative's name, the round bus stop plate, the yellow diamond that
 * says bears are about, and the board at the lookout over the falls.
 *
 * Every word is the island's own. The cooperative is the Hyoura one; no
 * sign names a real business or a real place.
 *
 * The painting is the browser's: a canvas, its 2D context and its fonts.
 * It is a picture and reaches no physics, so a font that differs a little
 * between machines changes nothing a pilot hits.
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

const INK = '#1d1b26';
const JP = '"Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", "WenQuanYi Zen Hei", sans-serif';

/* Words centred at (x, y), shrunk until they fit maxW. */
function words(g, text, x, y, maxW, px, colour, weight = '900') {
  let size = px;
  g.font = `${weight} ${size}px ${JP}`;
  while (size > 6 && g.measureText(text).width > maxW) {
    size -= 1;
    g.font = `${weight} ${size}px ${JP}`;
  }
  g.fillStyle = colour;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/* Each sign: its cell's size in pixels and how it is painted. */
const SIGNS = {
  coop: {
    w: 512,
    h: 72,
    paint(g, w, h) {
      g.fillStyle = '#f7f4ec';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#3f62a0';
      g.fillRect(0, h - 10, w, 10);
      words(g, '氷浦漁業協同組合', w / 2, h * 0.44, w - 40, 52, '#24345e');
    },
  },
  bus: {
    w: 96,
    h: 96,
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#f2f0ea';
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = '#2f5aa8';
      g.stroke();
      words(g, 'バス', w / 2, h * 0.36, w - 30, 26, '#2f5aa8');
      words(g, '漁港前', w / 2, h * 0.66, w - 26, 18, INK);
    },
  },
  bear: {
    w: 128,
    h: 128,
    paint(g, w, h) {
      g.clearRect(0, 0, w, h);
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#f2c43c';
      g.fillRect(-w * 0.34, -h * 0.34, w * 0.68, h * 0.68);
      g.lineWidth = 5;
      g.strokeStyle = INK;
      g.strokeRect(-w * 0.31, -h * 0.31, w * 0.62, h * 0.62);
      g.restore();
      /* A bear, in silhouette: body, head, ears, legs. */
      g.fillStyle = INK;
      g.beginPath();
      g.ellipse(w * 0.5, h * 0.47, w * 0.17, h * 0.09, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(w * 0.66, h * 0.42, w * 0.06, 0, Math.PI * 2);
      g.fill();
      g.fillRect(w * 0.36, h * 0.5, w * 0.05, h * 0.1);
      g.fillRect(w * 0.58, h * 0.5, w * 0.05, h * 0.1);
      words(g, '熊出没注意', w / 2, h * 0.7, w * 0.42, 15, INK);
    },
  },
  falls: {
    w: 192,
    h: 96,
    paint(g, w, h) {
      g.fillStyle = '#6b4a36';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#efe6d2';
      g.fillRect(6, 6, w - 12, h - 12);
      words(g, '氷浦の滝', w / 2, h * 0.4, w - 30, 40, INK);
      words(g, '展望台', w / 2, h * 0.76, w - 60, 20, '#6b4a36', '700');
    },
  },
  board: {
    w: 256,
    h: 128,
    paint(g, w, h) {
      g.fillStyle = '#efe6d2';
      g.fillRect(0, 0, w, h);
      words(g, '冬の漁港', w / 2, h * 0.42, w - 40, 54, INK);
      words(g, '流氷に注意', w / 2, h * 0.78, w - 60, 24, '#a83a32', '700');
    },
  },
};

/* The cells: each key once, packed in rows on a power of two picture. */
const ATLAS_W = 512;
const PAD = 3;
function packSigns(signs) {
  const keys = [...new Set(signs.map((s) => s.key))].filter((k) => SIGNS[k]);
  const cells = {};
  let x = 0;
  let y = 0;
  let row = 0;
  for (const key of keys) {
    const s = SIGNS[key];
    if (x + s.w > ATLAS_W) {
      x = 0;
      y += row + PAD;
      row = 0;
    }
    cells[key] = { x, y, w: s.w, h: s.h };
    x += s.w + PAD;
    row = Math.max(row, s.h);
  }
  const used = y + row;
  let h = 64;
  while (h < used) {
    h *= 2;
  }
  return { cells, w: ATLAS_W, h };
}

export function paintSigns(signs) {
  const { cells, w, h } = packSigns(signs);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  for (const [key, cell] of Object.entries(cells)) {
    g.save();
    g.translate(cell.x, cell.y);
    g.beginPath();
    g.rect(0, 0, cell.w, cell.h);
    g.clip();
    SIGNS[key].paint(g, cell.w, cell.h);
    g.restore();
  }
  return { canvas: c, cells, w, h };
}

const NORMAL = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };

/* Every sign as a quad on its cell, one mesh, 2 cm off its face. */
export function signMesh(THREE, signs, atlas, material) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const n = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const s of signs) {
    const cell = atlas.cells[s.key];
    if (!cell) {
      continue;
    }
    const u0 = (cell.x + 0.5) / atlas.w;
    const u1 = (cell.x + cell.w - 0.5) / atlas.w;
    const v0 = 1 - (cell.y + cell.h - 0.5) / atlas.h;
    const v1 = 1 - (cell.y + 0.5) / atlas.h;
    n.fromArray(NORMAL[s.face]);
    right.crossVectors(up, n).normalize();
    const base = pos.length / 3;
    for (const [sx, sy, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      c.set(s.x, s.y, s.z).addScaledVector(n, 0.02).addScaledVector(right, (sx * s.w) / 2).addScaledVector(up, (sy * s.h) / 2);
      pos.push(c.x, c.y, c.z);
      nor.push(n.x, n.y, n.z);
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
  mesh.name = 'arctic signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
