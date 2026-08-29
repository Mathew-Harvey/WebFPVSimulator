/*
 * Prove F1 without a GPU: High internal pixels vs pixelBudget at the
 * three contract sizes. Writes .loop/bando-perf/rN/scale.json when
 * BANDO_PERF_ROUND is set, else prints.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { internalScale, qualityFor } from '../../../src/render/quality.js';

const here = dirname(fileURLToPath(import.meta.url));
const q = qualityFor('high').bando;
const sizes = [
  [1600, 900],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

function row(w, h) {
  const ceil = internalScale(w, h, q, null, 1);
  const floor = internalScale(w, h, q, 0, 1);
  const rw = Math.floor(w * ceil);
  const rh = Math.floor(h * ceil);
  const pixels = rw * rh;
  return {
    w,
    h,
    ceil,
    floor,
    rw,
    rh,
    pixels,
    budget: q.pixelBudget,
    overBudget: pixels > q.pixelBudget + 1,
  };
}

const rows = sizes.map(([w, h]) => row(w, h));
const out = {
  graphics: 'high',
  map: 'bando',
  minScale: q.minScale,
  preferScale: q.preferScale,
  pixelBudget: q.pixelBudget,
  rows,
};

const round = process.env.BANDO_PERF_ROUND;
if (round) {
  const dir = join(here, `r${round}`);
  await writeFile(join(dir, 'scale.json'), `${JSON.stringify(out, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
for (const r of rows) {
  const mark = r.overBudget ? 'FAIL' : 'pass';
  process.stdout.write(
    `${r.w}x${r.h} scale ${r.ceil.toFixed(3)} -> ${r.rw}x${r.rh} ${r.pixels} px ${mark}\n`,
  );
}
