/*
 * collider-overlay.js: draw the city's solid boxes over the city's picture.
 *
 * scripts/collider-audit.js answers "how much solid has nothing drawn in it"
 * in cubic metres, and a number is the right way to compare two rounds. It is
 * the wrong way to answer the question the owner actually asks, which is a
 * question about a picture: does the barrier stand off the wall it belongs
 * to, is the gap under the verandah open, does the box follow the roof down
 * to the eaves. Those are seen, not counted. So this parks the camera at a
 * few places in the town, draws every collider within a radius as a green
 * wireframe over the rendered frame, and writes the pair of images.
 *
 * Usage:
 *   node scripts/collider-overlay.js [--out=DIR]
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

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith('--out='));
const out = outArg ? outArg.slice(6) : join(root, 'dist/collider-overlay');

/*
 * Where to look, and every one of them is a place the complaint was about:
 * a street with shopfronts hard against both footways, the level crossing,
 * a shrine approach with a torii over it, the school frontage, and a roofline
 * seen from just above it, which is where a wedge over a pitched roof shows.
 */
const VIEWS = [
  /* North up the carriageway from the spawn, which is the town's own
   * establishing shot: shopfronts hard against both footways, the level
   * crossing ahead, and the densest thing in the map to fly at. */
  { name: 'street', eye: [0, 2.6, 22], at: [0, 2.4, -6], r: 40 },
  /* The same street from above the eaves, where a wedge over a pitched roof
   * shows as a box standing off the tiles. */
  { name: 'roofline', eye: [0, 9.5, 26], at: [0, 5.5, -4], r: 45 },
  /* Across the level crossing, whose booms are the two colliders the town
   * animates and the one place the fit must not touch. */
  { name: 'crossing', eye: [-12, 2.2, 4], at: [10, 2.2, 2], r: 35 },
  /* Under the shopping street's arcade, all awnings, signboards and
   * stallfronts, which is where a standoff is most obvious. */
  { name: 'arcade', eye: [-34, 2.2, 20], at: [-16, 2.2, 26], r: 32 },
  /* And a plot with a garden in it, where the box used to cover the whole
   * rectangle and should now stop at the house. */
  { name: 'housing', eye: [40, 4.5, 44], at: [58, 3.0, 30], r: 40 },
];


const overlay = `(() => {
  const THREE = window.__three;
  const scene = window.__mapScene();
  let g = scene.getObjectByName('__colliderOverlay');
  if (g) { scene.remove(g); }
  g = new THREE.Group();
  g.name = '__colliderOverlay';
  const boxes = window.__colliderBoxes(CX, CZ, RR);
  /* One BufferGeometry of line segments for the lot, so an overlay of ten
   * thousand boxes is one draw call and does not itself move the budget. */
  const pos = new Float32Array(boxes.length * 24 * 3);
  let p = 0;
  const edge = (ax, ay, az, bx, by, bz) => {
    pos[p] = ax; pos[p + 1] = ay; pos[p + 2] = az;
    pos[p + 3] = bx; pos[p + 4] = by; pos[p + 5] = bz;
    p += 6;
  };
  for (const b of boxes) {
    const [x0, y0, z0, x1, y1, z1] = b;
    edge(x0, y0, z0, x1, y0, z0); edge(x1, y0, z0, x1, y0, z1);
    edge(x1, y0, z1, x0, y0, z1); edge(x0, y0, z1, x0, y0, z0);
    edge(x0, y1, z0, x1, y1, z0); edge(x1, y1, z0, x1, y1, z1);
    edge(x1, y1, z1, x0, y1, z1); edge(x0, y1, z1, x0, y1, z0);
    edge(x0, y0, z0, x0, y1, z0); edge(x1, y0, z0, x1, y1, z0);
    edge(x1, y0, z1, x1, y1, z1); edge(x0, y0, z1, x0, y1, z1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, p), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x00ff66, depthTest: true, transparent: true, opacity: 0.85 });
  g.add(new THREE.LineSegments(geo, mat));
  scene.add(g);
  return { boxes: boxes.length };
})()`;

const steps = [
  `--out=${out}`,
  '--w=1280',
  '--h=720',
  '--graphics=high',
  'until:!!window.__boot && window.__boot().frames > 2',
  'eval:JSON.stringify({ tag: "swap", started: (window.__setMap("city"), true) })',
  'until:window.__map().id === "city" && window.__map().ready',
  /* Into the flight screen, because the title menu covers half the frame and
   * the whole point of these images is to look at the other half. Fly is the
   * selected row on entry, so one Enter does it. The camera is overridden
   * immediately afterwards, so where the craft goes does not matter. */
  'tap:Enter',
  'until:window.__screen !== "title"',
];
for (const v of VIEWS) {
  steps.push(
    `eval:JSON.stringify((() => { window.__setCam(${v.eye[0]}, ${v.eye[1]}, ${v.eye[2]}, ${v.at[0]}, ${v.at[1]}, ${v.at[2]}); window.__f = window.__boot().frames; return { tag: "cam" }; })())`,
    'until:window.__boot().frames > window.__f + 3',
    `shot:${v.name}-plain`,
    `eval:JSON.stringify(${overlay.replace(/CX/g, String(v.at[0])).replace(/CZ/g, String(v.at[2])).replace(/RR/g, String(v.r))})`,
    'until:window.__boot().frames > window.__f + 8',
    `shot:${v.name}-boxes`,
  );
}
steps.push('eval:JSON.stringify((() => { const s = window.__mapScene(); const g = s.getObjectByName("__colliderOverlay"); if (g) { s.remove(g); } window.__setCam(null); return { tag: "done" }; })())');

const run = spawnSync('node', [join(root, 'scripts/shots.js'), ...steps], {
  cwd: root,
  encoding: 'utf8',
  timeout: 900000,
  maxBuffer: 64 * 1024 * 1024,
});
process.stdout.write(`${run.stdout ?? ''}${run.stderr ?? ''}`);
