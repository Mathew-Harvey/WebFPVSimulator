/*
 * places-lines.js: every named flight line in 工場道, 旧ひばり製作所 and
 * ひばり台市民プール, flown as a swept collision against the built town.
 *
 * Paste into the eval step of scripts/shots.js after the city is ready, with
 * the craft placed somewhere in the two compounds so the cull grid is on:
 *
 *   node scripts/shots.js --out=.loop/scratch --graphics=high \
 *     'until:!!window.__boot && window.__boot().frames > 2' \
 *     'eval:window.__setMap("city")' \
 *     'until:window.__map().id === "city" && window.__map().ready' \
 *     'eval:(window.__placeCraft(40, 6, 92), 1)' 'wait:500' \
 *     "eval:$(cat .loop/evidence/places-lines.js)"
 *
 * `window.__hit` is the game's own query: the craft's tilt aware half extent
 * and its world quaternion, against the same collider set the frame loop
 * uses. A line is walked in 0.5 m steps and is clear only if every step is.
 *
 * WHAT IT FOUND, on 2026-08-30, and none of it was visible in a screenshot:
 *   - the breach in the works' frontage wall ended 1.25 m later on the
 *     office's south wall. The wall moved back to z 82.6.
 *   - the corridor through the pool's changing block ended 1.25 m short of
 *     the hall's blind west gable. The block's north end moved to z 96.0.
 *   - a cherry planted at x 27.6 stood in front of the office's third bay,
 *     so the line through it met leaf collision two metres out. Moved.
 * After those three: 32 of 32 clear.
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
(() => {
  /* Every named flight line in the two new places, flown as a swept segment
   * with the craft's own half extent, in 0.5 m steps. A line is clear only if
   * every step of it is clear. */
  const LINES = [
    ['works 1  shed, south door to north hole', [32.2, 2.20, 91.0], [32.2, 2.20, 113.0]],
    ['works 1r shed, north hole to south door', [32.2, 2.20, 113.0], [32.2, 2.20, 91.0]],
    ['works 2  shed, east gap to west gap', [44.0, 2.00, 100.6], [21.0, 2.00, 100.6]],
    ['works 2r shed, west gap to east gap', [21.0, 2.00, 100.6], [44.0, 2.00, 100.6]],
    ['works 3  over tooth 1, in at the clerestory', [27.6, 9.40, 95.0], [27.6, 7.30, 100.4]],
    ['works 4  down through the roof hole', [35.6, 11.0, 107.0], [35.6, 2.0, 107.0]],
    ['works 5a office, first floor bay 0', [22.8, 5.05, 83.6], [22.8, 5.05, 92.2]],
    ['works 5b office, first floor bay 1', [25.4, 5.05, 83.6], [25.4, 5.05, 92.2]],
    ['works 5c office, first floor bay 2', [28.0, 5.05, 83.6], [28.0, 5.05, 92.2]],
    ['works 5d office, ground floor doorway', [22.8, 1.30, 83.6], [22.8, 1.30, 92.2]],
    ['works 6a under the stair landing', [30.6, 1.80, 84.2], [30.6, 1.80, 89.0]],
    ['works 6b under the flue duct', [38.5, 1.30, 84.2], [38.5, 1.30, 91.0]],
    ['works 6c under the water tower', [46.2, 3.20, 92.0], [46.2, 3.20, 101.0]],
    ['works 6d0 the alley behind the last house', [31.0, 1.20, 81.0], [23.8, 1.20, 81.0]],
    ['works 6d through the fallen wall', [23.8, 0.95, 80.6], [23.8, 0.95, 84.8]],
    ['works 6e in at the gate', [35.5, 1.50, 80.6], [35.5, 1.50, 87.0]],
    ['pool 1a  the bowl, shallow to deep', [62.0, 1.30, 92.0], [66.0, -0.20, 92.0]],
    ['pool 1a2 the bowl, over the shallow shelf', [66.0, -0.20, 92.0], [73.0, -0.25, 92.0]],
    ['pool 1a3 the bowl, over the step', [73.0, -0.25, 92.0], [79.0, -1.70, 92.0]],
    ['pool 1a4 the bowl, along the deep end', [79.0, -1.70, 92.0], [84.0, -1.70, 92.0]],
    ['pool 1a5 the bowl, the pull out', [84.0, -1.70, 92.0], [88.3, 1.30, 92.0]],
    ['pool 1a6 the bowl, clear of the blocks', [88.3, 1.30, 92.0], [92.0, 1.60, 92.0]],
    ['pool 1b  the bowl, in over the deep end', [92.0, 2.20, 91.2], [88.0, 1.00, 91.2]],
    ['pool 1b2 the bowl, down the deep end', [88.0, 1.00, 91.2], [84.0, -1.60, 91.2]],
    ['pool 2   the hall, west door to east', [55.0, 2.20, 105.7], [89.0, 2.20, 105.7]],
    ['pool 2r  the hall, east door to west', [89.0, 2.20, 105.7], [55.0, 2.20, 105.7]],
    ['pool 3a  the clerestory, south to north', [70.0, 5.50, 97.0], [70.0, 5.50, 115.0]],
    ['pool 3b  the clerestory, north to south', [78.0, 5.50, 115.0], [78.0, 5.50, 97.0]],
    ['pool 4   the entrance corridor', [58.1, 1.50, 84.0], [58.1, 1.50, 98.5]],
    ['pool 5a  under the gallery', [62.0, 2.00, 101.1], [84.0, 2.00, 101.1]],
    ['pool 5b  in at the gate', [59.0, 1.60, 80.5], [59.0, 1.60, 86.0]],
    ['road 1   the works road, west to east', [31.0, 1.60, 78.8], [86.0, 1.60, 78.8]],
    ['road 2   the arm to the apron', [28.0, 1.60, 70.5], [32.0, 1.60, 73.5]],

    /* ---- ひばり台ドローン練習場, the training field ---- */
    ['field 0  the works gap to the track', [32.0, 1.40, 110.0], [32.0, 1.40, 122.0]],
    ['field 1  the track, south to north', [32.0, 1.60, 120.0], [32.0, 1.60, 186.0]],
    ['field 2  the spine, west to east', [10.0, 1.60, 132.0], [114.0, 1.60, 132.0]],
    ['loop 1   through both arches, east', [14.0, 2.50, 139.0], [50.0, 2.50, 139.0]],
    ['loop 1r  through both arches, west', [50.0, 2.50, 139.0], [14.0, 2.50, 139.0]],
    ['loop 2   over the top of both', [14.0, 10.50, 139.0], [50.0, 10.50, 139.0]],
    ['loop 3   the second half, arch 1 back', [40.0, 2.50, 139.0], [24.0, 2.50, 139.0]],
    ['wall 1   the run at the target', [56.0, 3.20, 128.0], [56.0, 3.20, 151.6]],
    ['wall 2   over the top of it', [56.0, 9.00, 140.0], [56.0, 9.00, 164.0]],
    ['splits 1 east over the bar', [10.0, 14.00, 168.0], [40.0, 14.00, 168.0]],
    ['splits 2 west back through the gate', [40.0, 1.40, 168.0], [10.0, 1.40, 168.0]],
    ['splits 3 under the bar, over the gate', [10.0, 7.00, 168.0], [40.0, 7.00, 168.0]],
    ['orbit 1  the 10 m ring, first quarter', [106.0, 8.00, 160.0], [96.0, 8.00, 170.0]],
    ['orbit 2  the 10 m ring, second', [96.0, 8.00, 170.0], [86.0, 8.00, 160.0]],
    ['orbit 3  the 10 m ring, third', [86.0, 8.00, 160.0], [96.0, 8.00, 150.0]],
    ['orbit 4  the 10 m ring, fourth', [96.0, 8.00, 150.0], [106.0, 8.00, 160.0]],
    ['orbit 5  in under the low deck', [112.0, 8.00, 160.0], [98.2, 8.00, 160.0]],
    ['orbit 6  between the two decks', [112.0, 18.00, 160.0], [80.0, 18.00, 160.0]],
    ['orbit 7  over the head of the mast', [78.0, 39.00, 160.0], [114.0, 39.00, 160.0]],
    ['practice 1 the box, corner to corner', [34.0, 2.00, 176.0], [78.0, 2.00, 186.0]],
    ['practice 2 the box, the other way', [78.0, 2.00, 176.0], [34.0, 2.00, 186.0]],
  ];
  /*
   * NEGATIVE CONTROLS, and the probe is worth much less without them.
   *
   * Every line above asserts that something is CLEAR, and a world in which
   * nothing at all was solid would pass all of them. These five say the
   * opposite: each one is aimed squarely at a thing that has to stop a quad,
   * and the run fails if any of them comes back clear. They are the reason
   * the other fifty four mean anything.
   */
  const SOLID = [
    ['the wall tap face', [56.0, 3.20, 148.0], [56.0, 3.20, 156.0]],
    ['an arch leg', [24.0, 3.00, 132.0], [24.0, 3.00, 146.0]],
    ['a mast leg', [94.5, 8.00, 152.0], [94.5, 8.00, 168.0]],
    ['the paddy water', [56.0, 0.50, 122.0], [72.0, 0.50, 122.0]],
    ['the split-S bar', [24.0, 12.10, 160.0], [24.0, 12.10, 176.0]],
  ];

  const out = [];
  for (const [name, a, b] of LINES) {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.5));
    let bad = null;
    let px = a[0]; let py = a[1]; let pz = a[2];
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      const qx = a[0] + (b[0] - a[0]) * t;
      const qy = a[1] + (b[1] - a[1]) * t;
      const qz = a[2] + (b[2] - a[2]) * t;
      const h = window.__hit(px, py, pz, qx, qy, qz);
      if (h.kind) {
        bad = { kind: h.kind, at: [+qx.toFixed(1), +qy.toFixed(1), +qz.toFixed(1)] };
        break;
      }
      px = qx; py = qy; pz = qz;
    }
    out.push([name, bad]);
  }
  /* And the controls, reported as a failure when they are NOT hit. */
  for (const [name, a, b] of SOLID) {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.5));
    let hit = null;
    let px = a[0]; let py = a[1]; let pz = a[2];
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      const qx = a[0] + (b[0] - a[0]) * t;
      const qy = a[1] + (b[1] - a[1]) * t;
      const qz = a[2] + (b[2] - a[2]) * t;
      const h = window.__hit(px, py, pz, qx, qy, qz);
      if (h.kind) {
        hit = { kind: h.kind, at: [+qx.toFixed(1), +qy.toFixed(1), +qz.toFixed(1)] };
        break;
      }
      px = qx; py = qy; pz = qz;
    }
    out.push([`CONTROL  ${name}`, hit ? null : { kind: 'NOTHING THERE', at: b }]);
  }
  return JSON.stringify(out);
})()
