/*
 * road.js: 工場道, the works road, and it is the reason the other two files
 * are an extension of this town rather than two models parked beside it.
 *
 * WHERE IT COMES FROM, AND WHY THERE.
 *
 * ひばり台四丁目 lays a lane up the last block of the town and takes an arm
 * off it eastward at z = 70, which stops at x = 28. Its own source says what
 * that end is for, in as many words: "The east arm is closed with planting and
 * not with a wall. A 2 m concrete end wall would read as a card standing on
 * the paving at this tonal range, and the arm's whole job is to look like it
 * carries on into somebody else's back land."
 *
 * This is somebody else's back land. The arm carries on.
 *
 * So the works road picks up at the cones, widens into a turning apron where a
 * lorry had to get round, runs north across the field and then east along the
 * frontage of both places, and stops at a barrier where the hills start. It is
 * narrower than the lane that feeds it and it has no footway, because it is a
 * road two sites share rather than a street anybody lives on, and that
 * difference is what tells a pilot which side of the town they are on.
 *
 * It is built out of the town's own `lane`, `pad` and `laneLine` from
 * ./vendored/world/ground.js and its poles come from `poleRun` in
 * ./vendored/world/plots.js, so the asphalt, the kerb profile, the paint and
 * the lamp standard out here are the same objects as the ones on the lane it
 * leaves. A new road built out of new parts is the fastest way to make an
 * extension look bolted on.
 *
 * NOTHING IN THE EXISTING TOWN IS TOUCHED. The apron starts at x = 28.0,
 * which is exactly where 四丁目's arm ends, and the nearest collider anything
 * here has to miss is the carport at x 26.97..29.83, z 72.22..76.98: the
 * apron stops at z = 73.0 and the north leg runs at x 30.5..33.7, so the two
 * never meet. Every clearance in this file was read off the built town rather
 * than off the source, with a probe over the collider list.
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

import { rngKit } from '../vendored/core/util.js';
import { warningPlate } from '../vendored/core/textures.js';
import { pad, lane, laneLine, groundMats } from '../vendored/world/ground.js';
import { poleRun, laneSign } from '../vendored/world/plots.js';
import { makeMirror, makeBarrier, makeCone, makeSignPost } from '../vendored/world/props.js';
import { GROUND, mats, slab, decal, patch, post } from './kit.js';

/* The apron at 四丁目's arm end. x0 is the arm's own last metre of asphalt. */
const APRON = { x0: 28.0, x1: 33.9, z0: 68.9, z1: 73.0 };
/* The north leg, across the field. */
const NORTH = { at: 32.1, w: 3.2, z0: 71.0, z1: 79.4 };
/* And the frontage road, which both places open onto. It stops at x = 88:
 * the hills' own trees start at x = 95.7 and there is nothing east of that a
 * road could be going to. */
const EAST = { at: 78.8, w: 3.4, x0: 30.5, x1: 88.0 };

export function buildWorksRoad(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(9601);
  const out = { sakura: [], shrubs: [], grove: [], petals: [] };

  /*
   * The apron. `h: 0.08` and not the lane's 0.05, for the same reason
   * 四丁目's own junction pad uses 0.08: laid at the lane's height it leaves
   * a lip across the mouth of the junction.
   */
  pad(ctx, {
    x: (APRON.x0 + APRON.x1) / 2, z: (APRON.z0 + APRON.z1) / 2,
    w: APRON.x1 - APRON.x0, d: APRON.z1 - APRON.z0,
    y: GROUND, h: 0.08, mat: gm.asphaltWorn, name: 'worksApronPad',
  });

  /*
   * The north leg. `axis: 'z'` sweeps the strip along the street profile,
   * which out here is flat, and it is the branch of `lane` that does NOT
   * register a platform, so the platform is registered here. Without it the
   * height query answers with the bare grade and the 60 mm of asphalt is a
   * step a landing gear finds.
   */
  lane(ctx, {
    axis: 'z', at: NORTH.at, from: NORTH.z0, to: NORTH.z1, w: NORTH.w,
    mat: gm.asphaltWorn, kerb: false, rise: 0.05, name: 'worksRoadNorth',
  });
  ctx.platform({
    x0: NORTH.at - NORTH.w / 2, x1: NORTH.at + NORTH.w / 2,
    z0: NORTH.z0, z1: NORTH.z1, top: GROUND + 0.11,
  });

  /* The frontage road. Kerbed, because this stretch is the one both gates
   * open onto and a kerb is what says a road is maintained. */
  lane(ctx, {
    axis: 'x', at: EAST.at, from: EAST.x0, to: EAST.x1, w: EAST.w, y: GROUND,
    mat: gm.asphalt, kerb: true, rise: 0.05, name: 'worksRoad',
  });
  laneLine(ctx, { axis: 'x', at: EAST.at - 1.30, from: EAST.x0 + 2.0, to: EAST.x1 - 1.0, y: GROUND + 0.12 });
  laneLine(ctx, { axis: 'x', at: EAST.at + 1.30, from: EAST.x0 + 2.0, to: EAST.x1 - 1.0, y: GROUND + 0.12 });
  /* A dashed centre line only where the two gates are, which is what a
   * highways department actually paints: the rest of it is unmarked. */
  laneLine(ctx, { axis: 'x', at: EAST.at, from: 34.0, to: 62.0, y: GROUND + 0.12, dash: 1.6 });

  /* Two patches where the road has been dug up and made good, so a 57 m
   * straight is not one flat tone. */
  patch(ctx, 0x8b8694, { x: 44.0, y: GROUND + 0.13, z: 78.4, w: 3.2, d: 2.2, opacity: 0.5, name: 'roadPatch' });
  patch(ctx, 0x8b8694, { x: 69.5, y: GROUND + 0.13, z: 79.4, w: 2.4, d: 1.8, opacity: 0.45, name: 'roadPatch' });

  /*
   * Three lamps, on the field side of the road so their arms reach out over
   * it, and the drop into the works gate. `poleRun` is the town's own, so
   * these are the same standard as the three on 四丁目's lane, and the wires
   * carry on from where that run stopped.
   */
  poleRun(ctx, {
    defs: [
      { x: 30.6, z: 76.2, y: GROUND, h: 8.2, seed: 9611, armDir: 1, lamp: true },
      { x: 47.4, z: 76.9, y: GROUND, h: 8.4, seed: 9612, armDir: 1, ry: Math.PI / 2, lamp: true },
      { x: 71.8, z: 76.9, y: GROUND, h: 8.2, seed: 9613, armDir: 1, ry: Math.PI / 2, lamp: true },
    ],
    chains: [[0, 1], [1, 2]],
    drops: [[1, [50.0, GROUND + 4.6, 83.6]]],
    offsets: [[0, -0.4], [-0.38, 0.3]],
  });

  /* The convex mirror at the turn, which is what a blind junction gets, and
   * the road name plate on the corner so the road has a name on it. */
  /* On the OUTSIDE of the turn, at x 29.6, and not at 34.6 where it was: a
   * 0.42 m disc on a 2.5 m post six metres south of the works gate stands
   * squarely in the middle of it from the road, which is the one view a pilot
   * arrives at that gate from. Outside the turn is also where a mirror
   * belongs, since what it is for is seeing round the corner. */
  ctx.add(makeMirror({ x: 29.6, z: 76.6, y: GROUND, ry: -0.9, h: 2.5, r: 0.42 }));
  laneSign(ctx, {
    x: 30.2, z: 73.6, y: ctx.groundAt(30.2, 73.6), variant: 1, h: 2.1, ry: Math.PI / 2,
  });

  /*
   * The end of the road: a barrier and a plate, with the land beyond left as
   * land. Same closure 四丁目's own road head uses, for the same reason: a
   * road that stops has to look like it stopped rather than like it ran out
   * of model.
   */
  ctx.add(makeBarrier({ ctx, x: EAST.x1 + 0.3, z: EAST.at, y: GROUND, ry: Math.PI / 2, len: 3.6 }));
  /* `keep: true`, or `skipClutter` hands back an empty group: the town's
   * clutter strip is opt in and this cone is one of the two objects that
   * says the road stops here. */
  ctx.add(makeCone({ keep: true, x: EAST.x1 - 0.6, z: EAST.at - 1.1, y: GROUND, ry: 0.4 }));
  ctx.add(makeSignPost({
    x: EAST.x1 + 0.9, z: EAST.at - 2.1, y: GROUND, ry: -Math.PI / 2, h: 1.8, postMat: m.metal,
    plates: [{ map: warningPlate(1), w: 0.42, h: 0.56, y: 1.36, double: true }],
  }));

  /*
   * The verge. Everything either side of this road that is not one of the two
   * compounds is field, and a field with nothing in it reads as a hole in the
   * world. Three self seeded stands and a scatter of rough grass is the whole
   * of the treatment, and the two cherries at the far end are what carries
   * the town's own tree line out to the barrier.
   */
  const stands = [[36.4, 74.4, 1.05], [55.0, 75.6, 1.15], [79.2, 75.4, 0.95], [86.0, 74.2, 0.85]];
  stands.forEach(([x, z, scale], i) => {
    out.grove.push({ x, z, y: GROUND, scale, seed: 9620 + i, spread: 1.1 });
  });
  out.sakura.push({ x: 41.6, z: 75.2, y: GROUND, scale: 1.0, seed: 9631, keep: true });
  out.sakura.push({ x: 64.2, z: 75.4, y: GROUND, scale: 1.1, seed: 9632, keep: true, lean: 0.09 });
  out.petals.push({ x: 41.6, z: 76.6, w: 3.6, d: 2.4, y: GROUND, n: 60 });
  out.petals.push({ x: 64.2, z: 76.8, w: 3.6, d: 2.4, y: GROUND, n: 60 });
  for (let i = 0; i < 14; i += 1) {
    out.shrubs.push({
      x: 30.0 + rng.range(0, 58.0), z: 74.0 + rng.range(0, 2.4), y: GROUND,
      r: rng.range(0.24, 0.44), count: 2, spread: 0.8, seed: 9640 + i,
    });
  }

  /*
   * The one piece of drainage, and it is here because a road across a field
   * that has no ditch is a road nobody built. A concrete channel down the
   * north side with a grating over the gate crossings.
   */
  const chZ = EAST.at + 2.10;
  decal(ctx, m.drain, EAST.x0 + 1.0, GROUND - 0.14, chZ - 0.24, EAST.x1 - 1.0, GROUND + 0.02, chZ + 0.24,
    { name: 'roadChannel', noOutline: false });
  for (const x of [35.5, 59.0, 76.0]) {
    slab(ctx, m.metalDark, x - 0.55, GROUND - 0.02, chZ - 0.28, x + 0.55, GROUND + 0.04, chZ + 0.28,
      { name: 'roadGrate' });
  }
  /* Two bollards where the channel is open beside the works gate, so the
   * edge of the road is a line rather than a fade. */
  for (const x of [42.0, 51.0]) {
    post(ctx, m.white, x, chZ + 0.55, GROUND, GROUND + 0.86, 0.07, { name: 'roadBollard' });
  }

  return out;
}

export const ROAD_EAST = EAST;
