/*
 * plan.mjs: draw a plan view of a Velocidrone .trk, and of the track
 * document the converter makes from it, side by side.
 *
 * A review tool. Columns of coordinates do not tell you whether a course is
 * the right shape, whether the flying order is sane, or whether the whole
 * thing came out mirrored. A picture does, immediately.
 *
 * Usage, from the simulator root:
 *   node tracks/plan.mjs "2023 GQ Scale.trk"
 *   node tracks/plan.mjs --doc tracks/json/trk-0870b164.json
 *
 * PNGs land in tracks/_review, which is not committed.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Surface } from './png.mjs';
import { parseTrk, metres, eulerFromRot, PREFAB_NAMES } from './trk.mjs';
import { deserialize, kindOf, aperturesOf, elementById, startPadsOf } from '../src/trackbuilder/model.js';
import { KIND } from '../src/trackbuilder/elements.js';
import { buildPath } from '../src/trackbuilder/path.js';
import { apertureFrame } from '../src/trackbuilder/geometry.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '_review');

const INK = [30, 34, 40];
const GREY = [168, 175, 185];
const LINE = [216, 78, 62];
const GATE = [36, 92, 190];
const CHECK = [140, 90, 200];
const FLAGC = [214, 152, 24];
const CONEC = [232, 108, 40];
const WAYPT = [120, 170, 130];
const GRID = [232, 235, 240];

const MARGIN = 74;

function frame(points, w, h) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(4, maxX - minX);
  const spanY = Math.max(4, maxY - minY);
  const s = Math.min((w - MARGIN * 2) / spanX, (h - MARGIN * 2) / spanY);
  const offX = (w - spanX * s) / 2;
  const offY = (h - spanY * s) / 2;
  return {
    s,
    /* North is up, so the world's +Y runs up the image. */
    to: (x, y) => ({ x: offX + (x - minX) * s, y: h - offY - (y - minY) * s }),
    minX,
    minY,
    maxX,
    maxY,
  };
}

function grid(img, f, step) {
  for (let x = Math.ceil(f.minX / step) * step; x <= f.maxX; x += step) {
    const a = f.to(x, f.minY);
    const b = f.to(x, f.maxY);
    img.line(a.x, a.y, b.x, b.y, GRID);
  }
  for (let y = Math.ceil(f.minY / step) * step; y <= f.maxY; y += step) {
    const a = f.to(f.minX, y);
    const b = f.to(f.maxX, y);
    img.line(a.x, a.y, b.x, b.y, GRID);
  }
}

/* A bar drawn across the opening, which is the only way an orientation
 * mistake shows up: a gate square to the line looks right, a gate turned
 * ninety degrees to it does not. */
function bar(img, f, p, ux, uy, halfW, rgb, thick = 3) {
  const a = f.to(p.x - ux * halfW, p.y - uy * halfW);
  const b = f.to(p.x + ux * halfW, p.y + uy * halfW);
  img.line(a.x, a.y, b.x, b.y, rgb, thick);
}

function arrow(img, f, p, nx, ny, len, rgb) {
  const a = f.to(p.x, p.y);
  const b = f.to(p.x + nx * len, p.y + ny * len);
  img.line(a.x, a.y, b.x, b.y, rgb, 1);
  img.dot(b.x, b.y, 2, rgb);
}

/* ------------------------------------------------------------------ */
/* The raw file                                                        */
/* ------------------------------------------------------------------ */

function drawTrk(parsed, title, w = 1500, h = 1080, byFileOrder = false) {
  const v = parsed.value;
  const gates = byFileOrder
    ? [...(v.gates || [])]
    : [...(v.gates || [])].sort((a, b) => (a.gate ?? 0) - (b.gate ?? 0));
  const barriers = v.barriers || [];

  /* Framed on the course, not on the scenery. One stray prop parked half a
   * kilometre away will otherwise shrink the track to a smudge. */
  const pts = gates.map((g) => {
    const p = metres(g.trans.pos);
    return { x: p.x, y: p.z };
  });
  const img = new Surface(w, h, [255, 255, 255]);
  const f = frame(pts, w, h);
  grid(img, f, 10);

  for (const b of barriers) {
    const p = metres(b.trans.pos);
    const name = PREFAB_NAMES[Number(b.prefab)];
    const at = f.to(p.x, p.z);
    if (name === 'flag') {
      img.dot(at.x, at.y, 4, FLAGC);
    } else if (name === 'cone') {
      img.dot(at.x, at.y, 3, CONEC);
    } else if (name === 'start grid') {
      img.ring(at.x, at.y, 7, INK, 2);
      img.label(at.x + 9, at.y - 4, 'grid', INK);
    } else {
      img.dot(at.x, at.y, 2, GREY);
    }
  }

  /* The order runs green to red, so which way round the lap goes is
   * readable without following numbers. */
  for (let i = 0; i < gates.length; i += 1) {
    const a = metres(gates[i].trans.pos);
    const b = metres(gates[(i + 1) % gates.length].trans.pos);
    const p = f.to(a.x, a.z);
    const q = f.to(b.x, b.z);
    const t = i / Math.max(1, gates.length - 1);
    const rgb = [Math.round(20 + 200 * t), Math.round(150 - 110 * t), Math.round(90 - 40 * t)];
    img.line(p.x, p.y, q.x, q.y, rgb, 2, 0.9);
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const ux = (q.x - p.x) / len;
    const uy = (q.y - p.y) / len;
    img.line(mx, my, mx - ux * 7 + uy * 4, my - uy * 7 - ux * 4, rgb, 2);
    img.line(mx, my, mx - ux * 7 - uy * 4, my - uy * 7 + ux * 4, rgb, 2);
  }

  for (const g of gates) {
    const p = metres(g.trans.pos);
    const e = eulerFromRot(g.trans.rot);
    const name = PREFAB_NAMES[Number(g.prefab)] || `p${g.prefab}`;
    /* Unity forward after yaw t is (sin t, cos t). The opening lies across
     * it, so the bar runs along (cos t, -sin t) in the plan's x,z. */
    const ux = Math.cos(e.yaw);
    const uy = -Math.sin(e.yaw);
    const at = f.to(p.x, p.z);
    const colour = name === 'checkpoint' ? CHECK : (name === 'flag' ? FLAGC : GATE);
    if (name === 'flag' || name === 'cone') {
      img.dot(at.x, at.y, 5, colour);
      img.ring(at.x, at.y, 7, colour, 1);
    } else {
      bar(img, { ...f, to: (x, y) => f.to(x, y) }, { x: p.x, y: p.z }, ux, uy, 1.6, colour, 3);
      arrow(img, { ...f, to: (x, y) => f.to(x, y) }, { x: p.x, y: p.z }, Math.sin(e.yaw), Math.cos(e.yaw), 2.2, colour);
    }
    img.label(at.x + 8, at.y - 12, String(g.gate), g.start ? [200, 20, 20] : INK, 2);
  }

  img.text(16, 14, title, INK, 2);
  img.text(16, 34, `${gates.length} checkpoints, ${barriers.length} barriers, scene ${parsed.sceneId}, order by ${byFileOrder ? 'file position' : 'the gate field'}`, INK, 1);
  img.text(16, 48, 'blue bar gate   purple bar checkpoint   amber flag   line runs green to red along the lap', INK, 1);
  return img;
}

/* ------------------------------------------------------------------ */
/* The converted document                                              */
/* ------------------------------------------------------------------ */

function drawDoc(doc, title, w = 1500, h = 1080) {
  const pts = doc.elements.map((e) => ({ x: e.position.x, y: e.position.y }));
  pts.push({ x: 0, y: 0 }, { x: doc.field.width, y: doc.field.depth });
  const img = new Surface(w, h, [255, 255, 255]);
  const f = frame(pts, w, h);
  grid(img, f, 10);

  const c0 = f.to(0, 0);
  const c1 = f.to(doc.field.width, doc.field.depth);
  img.rect(c0.x, c0.y, c1.x, c1.y, GREY);

  let path = null;
  try {
    path = buildPath(doc);
  } catch {
    path = null;
  }
  if (path?.samples?.length) {
    for (let i = 1; i < path.samples.length; i += 1) {
      const a = f.to(path.samples[i - 1].pos.x, path.samples[i - 1].pos.y);
      const b = f.to(path.samples[i].pos.x, path.samples[i].pos.y);
      img.line(a.x, a.y, b.x, b.y, LINE, 2, 0.85);
    }
  }

  const numbers = new Map();
  doc.sequence.forEach((s, i) => {
    const list = numbers.get(s.elementId) || [];
    list.push(i + 1);
    numbers.set(s.elementId, list);
  });

  for (const el of doc.elements) {
    const at = f.to(el.position.x, el.position.y);
    const kind = kindOf(el);
    if (kind === KIND.APERTURE) {
      const fr = apertureFrame(el.yaw, el.pitch || 0);
      const aps = aperturesOf(el);
      const halfW = (aps[0]?.clearW || 1.5) / 2;
      const colour = aps.length > 1 ? [12, 130, 120] : GATE;
      bar(img, f, el.position, fr.widthAxis.x, fr.widthAxis.y, halfW, colour, 3);
      arrow(img, f, el.position, fr.normal.x, fr.normal.y, 2.2, colour);
    } else if (el.type === 'waypoint') {
      /* Hollow, because nothing is standing there. */
      img.ring(at.x, at.y, 6, WAYPT, 1);
      img.dot(at.x, at.y, 1, WAYPT);
    } else if (el.type === 'flag') {
      img.dot(at.x, at.y, 5, FLAGC);
      img.ring(at.x, at.y, 7, FLAGC, 1);
    } else if (el.type === 'cone') {
      img.dot(at.x, at.y, 4, CONEC);
    } else if (kind === KIND.START) {
      img.ring(at.x, at.y, 7, INK, 2);
      arrow(img, f, el.position, Math.cos(el.yaw), Math.sin(el.yaw), 3, INK);
      img.label(at.x + 9, at.y - 4, 'grid', INK);
    } else {
      img.dot(at.x, at.y, 3, GREY);
    }
    const ns = numbers.get(el.id);
    if (ns) {
      img.label(at.x + 8, at.y - 12, ns.join('/'), INK, 2);
    }
    if (el.name) {
      img.label(at.x + 8, at.y + 6, el.name, GREY, 1);
    }
  }

  img.text(16, 14, title, INK, 2);
  img.text(16, 34, `${doc.elements.length} elements, ${doc.sequence.length} in the order, field ${doc.field.width}x${doc.field.depth} m, lap ${path ? path.length.toFixed(0) : '?'} m`, INK, 1);
  img.text(16, 48, 'label is the position in the flying order, small text is the checkpoint number in the .trk', INK, 1);
  img.text(16, 62, 'blue bar gate   teal bar stack   green ring waypoint, nothing there   amber flag   orange cone', INK, 1);
  return img;
}

const args = process.argv.slice(2);
await mkdir(OUT, { recursive: true });

if (args[0] === '--doc') {
  for (const p of args.slice(1)) {
    const { doc } = deserialize(await readFile(p, 'utf8'));
    const img = drawDoc(doc, doc.name);
    const out = join(OUT, `${basename(p, '.json')}-doc.png`);
    await writeFile(out, img.toPng());
    console.log(out);
  }
} else {
  const byFile = args.includes('--file-order');
  for (const file of args.filter((a) => !a.startsWith('--'))) {
    const parsed = parseTrk(await readFile(join(here, file), 'utf8'));
    const img = drawTrk(parsed, parsed.name, 1500, 1080, byFile);
    const out = join(OUT, `${basename(file, '.trk')}-trk${byFile ? '-fileorder' : ''}.png`);
    await writeFile(out, img.toPng());
    console.log(out);
  }
}
