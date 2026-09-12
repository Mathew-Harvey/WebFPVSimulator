/*
 * craft-check.js: the drawn aircraft against the hull that sweeps it, and
 * both against the real machine, for every airframe the shell offers.
 *
 * WHY THIS EXISTS SEPARATELY FROM CHECK 15.
 *
 * tests/verify.js check 15 has asserted since it was written that "the
 * collisions hug the graphics", and it does it well, for the five inch: it
 * finds the body's box and the prop discs' cylinders by their five inch
 * sizes, and it is pinned to a baseline measured at one window size with one
 * course seeded. None of that reaches the whoop, which is drawn by a
 * different builder out of ducts and a bumper hoop and has no cylinder over
 * 50 mm on it. So the second aircraft in the project has never had the one
 * check that would catch a scale error on it.
 *
 * WHAT IT MEASURES, and it is deliberately dumb: every VERTEX of every mesh
 * the model draws, transformed into the craft's own frame, minus the
 * outline hulls, which are back sided shells scaled 1.13 and are paint. A
 * bounding box would do for a slab and lies about a torus, whose box corner
 * is 1.41 of its radius; the vertices are the silhouette itself. Out of
 * them come three numbers: how far the machine reaches from its centre
 * across, how far it reaches up, and how far it reaches down.
 *
 * Those go against three things:
 *
 *   the COLLIDER, src/game/collide.js, which sweeps CRAFT_R across and
 *     [-CRAFT_V_DOWN, +CRAFT_V_UP] vertically and is what a gate, a pole and
 *     a wall are tested against;
 *   the PLANT, src/native/plant.c, whose contact hull rests the craft on the
 *     ground and whose numbers configs/airframes.js snapshots; and
 *   the REAL AIRCRAFT, whose published size is in the comments of the model
 *     and the airframe table: a 220 mm five inch, and a BetaFPV Air65 II
 *     with a 65 mm wheelbase across 82.6 mm of frame.
 *
 * Run it with `npm run check:craft`. It boots the shell once per aircraft,
 * so it costs about half a minute.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { AIRFRAMES, airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * The published size of each machine, from outside this repository, and the
 * tolerance each one is held to.
 *
 *   5inch     a 220 mm class quad: 110 mm arms, 5 inch blades, so the disc
 *             the aircraft sweeps is 173.5 mm and the body is 155 mm long.
 *   whoop65   BetaFPV Air65 II Champion: 65 mm motor to motor across the
 *             diagonal, 82.6 mm square over the ducts, 23.4 g.
 *
 * `spanMm` is the AXIS ALIGNED width, two ducts about two motors, which is
 * the figure a manufacturer prints; `sweepMm` is the diagonal reach, which
 * is what a collider sweeps. They are different numbers about one machine
 * and both are checked.
 */
const REAL = {
  '5inch': { spanMm: 282.6, sweepMm: 347.0, tolMm: 6 },
  whoop65: { spanMm: 82.6, sweepMm: 101.2, tolMm: 3 },
};

/* Measure the drawn model, in the craft's own frame, from its vertices. */
const MEASURE = `(() => {
  const THREE = window.__three;
  const scene = window.__mapScene();
  let g = null;
  scene.traverse((o) => { if (o.name === 'craft') { g = o; } });
  if (!g) { return { error: 'no craft in the scene' }; }
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  let up = -Infinity;
  let down = Infinity;
  let reach = 0;
  let across = 0;
  let verts = 0;
  let meshes = 0;
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.getAttribute) { return; }
    /* An outline hull is a back sided copy scaled 1.13. It is paint and it
     * is not the aircraft: measuring it reports a machine 13 percent big. */
    if (o.material && o.material.userData && o.material.userData.hullColor !== undefined) { return; }
    if (o.visible === false) { return; }
    /* And the antenna is wire, not aircraft. Both models name theirs: it
     * is the tallest thing on either machine, 16 mm over the whoop's
     * camera and 21 mm over the five inch's, and a rigid contact hull that
     * covered it would make a quad bounce off its own aerial. */
    if (o.name === 'antenna' || (o.parent && o.parent.name === 'antenna')) { return; }
    const pos = o.geometry.getAttribute('position');
    if (!pos) { return; }
    o.updateMatrixWorld(true);
    m.multiplyMatrices(inv, o.matrixWorld);
    meshes += 1;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      verts += 1;
      if (v.y > up) { up = v.y; }
      if (v.y < down) { down = v.y; }
      const r = Math.hypot(v.x, v.z);
      if (r > reach) { reach = r; }
      const a = Math.max(Math.abs(v.x), Math.abs(v.z));
      if (a > across) { across = a; }
    }
  });
  const th = window.__craftState().thresholds;
  return {
    up, down, reach, across, verts, meshes,
    worldScale: th.worldScale,
    craftRadius: th.craftRadius,
    craftRadiusTrue: th.craftRadiusTrue,
    craftUpTrue: th.craftUpTrue,
    craftDownTrue: th.craftDownTrue,
  };
})()`;

const rows = [];
let fails = 0;
function report(id, pass, measured, extra = '') {
  rows.push({ id, pass, measured, extra });
  if (!pass) {
    fails += 1;
  }
}
function near(id, got, want, tolMm, unit = 'mm') {
  const off = Math.abs(got - want);
  report(id, off <= tolMm,
    `${got.toFixed(1)} ${unit}`,
    `against ${want.toFixed(1)}, ${off.toFixed(1)} off, tolerance ${tolMm}`);
}

/*
 * A MISMATCH THAT IS KNOWN, MEASURED AND CANNOT BE FIXED FROM HERE.
 *
 * The five inch's contact hull reaches 45 mm below the CG and the lowest
 * thing the model draws is 30 mm below it, so a parked five inch floats
 * 15 mm: the plant rests the craft on a hull that is deeper than the
 * aircraft on screen. It is plant.c's `hull_hz_down`, which is compiled
 * into dist/sim.wasm, and configs/airframes.js snapshots it precisely so
 * that the collider and the plant agree about where the bottom of the quad
 * is. Changing it means changing the C and rebuilding the module, which
 * needs an Emscripten toolchain this container does not have, and it moves
 * the machine every threshold in tests/ was fitted against. So it is
 * recorded rather than adjusted, here and in PROGRESS.md.
 *
 * PINNED, not excused: the gap is allowed to be what it measured today and
 * no more, so the day somebody rebuilds the module, or the model grows a
 * battery that reaches further down, this says so.
 */
function pinned(id, got, want, pinMm, why) {
  const off = Math.abs(got - want);
  report(id, off <= pinMm + 0.5,
    `${got.toFixed(1)} mm`,
    `against ${want.toFixed(1)}, ${off.toFixed(1)} off, a known ${pinMm.toFixed(1)}: ${why}`);
}

async function measure(airframeId) {
  const seated = seatAirframe(
    { airframe: '5inch', rates: airframeById('5inch').rates },
    airframeId,
  );
  const page = await openPage({
    root,
    width: 960,
    height: 540,
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      Object.assign(s, ${JSON.stringify(seated)});
      s.airframeAsked = true;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* storage refused */ }`],
  });
  try {
    await page.until('!!window.__boot && window.__boot().frames > 2', 30000);
    /* The aircraft is swapped when the settings are applied, which happens
     * on the first frame; give the model a moment to be built. */
    await page.until("window.__craft().run === " + JSON.stringify(airframeId), 20000);
    await page.sleep(500);
    const got = await page.evaluate(MEASURE);
    return got;
  } finally {
    await page.close();
  }
}

async function main() {
  for (const af of AIRFRAMES) {
    const real = REAL[af.id];
    const r = await measure(af.id);
    if (!r || r.error) {
      report(`${af.id}: measured`, false, r ? String(r.error) : 'no answer');
      continue;
    }
    /* The drawn model is built at the world's scale; the aircraft's own
     * metres are what everything else here is in. */
    const s = r.worldScale;
    const drawnReach = (r.reach / s) * 1000;
    const drawnAcross = (r.across / s) * 1000 * 2;
    const drawnUp = (r.up / s) * 1000;
    const drawnDown = (-r.down / s) * 1000;
    const dims = af.dims;

    report(`${af.id}: model measured`, r.verts > 100,
      `${r.verts} vertices over ${r.meshes} meshes`, 'outline hulls excluded');

    /* 1. The drawn machine against the real one. */
    near(`${af.id}: drawn span`, drawnAcross, real.spanMm, real.tolMm);
    near(`${af.id}: drawn sweep`, drawnReach, real.sweepMm / 2, real.tolMm);

    /* 2. The collider against the drawn machine. This is the one that
     * matters in flight: the hull that meets a gate has to be the machine
     * the pilot can see, on every axis. */
    near(`${af.id}: swept radius vs drawn`, r.craftRadiusTrue * 1000, drawnReach, real.tolMm);
    near(`${af.id}: hull up vs drawn`, r.craftUpTrue * 1000, drawnUp, real.tolMm);
    if (af.id === '5inch') {
      pinned(`${af.id}: hull down vs drawn`, r.craftDownTrue * 1000, drawnDown, 15.0,
        'the plant parks it 15 mm under the model, see the note above');
    } else {
      near(`${af.id}: hull down vs drawn`, r.craftDownTrue * 1000, drawnDown, real.tolMm);
    }

    /* 3. And the collider against the plant, through the table both read.
     * A drift here is a craft that rests at one height and collides at
     * another. */
    near(`${af.id}: collider vs airframe table`,
      r.craftRadiusTrue * 1000, (dims.arm + dims.hullR) * 1000, 0.001);
    near(`${af.id}: table up`, r.craftUpTrue * 1000, dims.vHalfUp * 1000, 0.001);
    near(`${af.id}: table down`, r.craftDownTrue * 1000, dims.vHalfDown * 1000, 0.001);

    /* And the wheelbase a manufacturer prints, which is the arm doubled. */
    near(`${af.id}: wheelbase`, dims.arm * 2000,
      af.id === 'whoop65' ? 65 : 220, 0.5);
  }

  const w = Math.max(...rows.map((r) => r.id.length));
  console.log('\ncraft-check: the drawn aircraft, the hull that sweeps it, and the real machine\n');
  for (const r of rows) {
    console.log(`${r.pass ? ' ok  ' : 'FAIL '} ${r.id.padEnd(w)}  ${r.measured.padEnd(26)} ${r.extra}`);
  }
  console.log(`\n${rows.length - fails} of ${rows.length} checks pass\n`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
