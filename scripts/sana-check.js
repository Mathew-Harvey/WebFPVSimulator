/*
 * sana-check.js: Kirigaoka Sanatorium's lines, asked of the solids the
 * plant is given (src/maps/sana/plan.js sanaLayout), in plain Node.
 *
 *   1. Every named gap is flyable: a craft of the plant's radius can pass
 *      through every point of its window, a metre and a half each side of
 *      it along the heading it is flown, without touching a solid. A gap
 *      that fails this pays for a line nobody can fly.
 *   2. The long corridor is one line: from outside the east wing's open
 *      end to outside the chapel's west door, the corridor's middle at
 *      head height is clear the whole way.
 *   3. The hidden Konex sign stands on a solid face, a centimetre or two
 *      off it, with nothing in front of it for a metre and a half.
 *   4. The spawn has open ground ahead: thirty metres north of the pad at
 *      two metres up are clear.
 *   6. Every named gap PAYS when flown: the map's document placed as the
 *      map places it, its gaps through namedGaps, and each flown square
 *      through its middle at 10 m/s by the counter itself (src/game/gaps.js),
 *      one step a millisecond, which must hand back that gap's crossing.
 *   5. The roof hole over east ward 4 is a shaft: from the sun deck down to
 *      the ground floor its middle is clear.
 *
 * Usage: node scripts/sana-check.js. Exit 1 on any failure.
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

import { sanaLayout, sanaGaps, worldAt, SPAWN, KONEX_SPOT, DROP } from '../src/maps/sana/plan.js';
import { SEC, TH, FL, WINGS, CHAPEL } from '../src/maps/sana/wards.js';
import { sanaDocument } from '../src/maps/sana/yard.js';
import { normalize } from '../src/trackbuilder/model.js';
import { placeDocument } from '../src/maps/built/place.js';
import { namedGaps, NamedGapCounter } from '../src/game/gaps.js';

/* The craft's radius in the plant (src/game/collide.js CRAFT_WORLD_R). */
const R = 0.17;

const { parts } = sanaLayout();
const solids = parts.filter((p) => p.solid);

function hit(x, y, z, r = R) {
  for (const p of solids) {
    if (p.t === 'box') {
      const dx = Math.max(p.lo[0] - x, 0, x - p.hi[0]);
      const dy = Math.max(p.lo[1] - y, 0, y - p.hi[1]);
      const dz = Math.max(p.lo[2] - z, 0, z - p.hi[2]);
      if (dx * dx + dy * dy + dz * dz < r * r) {
        return p;
      }
    } else {
      const [ax, ay, az] = p.a;
      const bx = p.b[0] - ax;
      const by = p.b[1] - ay;
      const bz = p.b[2] - az;
      const len2 = bx * bx + by * by + bz * bz;
      let t = len2 > 0 ? ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + bx * t - x;
      const cy = ay + by * t - y;
      const cz = az + bz * t - z;
      const rr = p.r + r;
      if (cx * cx + cy * cy + cz * cz < rr * rr) {
        return p;
      }
    }
  }
  return null;
}

let fails = 0;
function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) {
    fails += 1;
  }
}

/* 1. The named gaps. Headings are whole degrees on the plan: 0 east, 90
 * north; in the world east is +x and north is -z. The trig here is the
 * check's, never the map's. */
const COS = { 0: 1, 90: 0, 180: -1, 270: 0 };
const SIN = { 0: 0, 90: 1, 180: 0, 270: -1 };
for (const g of sanaGaps()) {
  const [x0, , z0] = worldAt(g.px, g.py, 0);
  const nx = COS[g.deg];
  const nz = -SIN[g.deg];
  const ax = -nz;
  const az = nx;
  let bad = null;
  for (let u = -g.w / 2; u <= g.w / 2 + 1e-9 && !bad; u += g.w / 6) {
    for (let v = g.h0; v <= g.h1 + 1e-9 && !bad; v += (g.h1 - g.h0) / 5) {
      for (let t = -1.5; t <= 1.5 && !bad; t += 0.25) {
        const p = hit(x0 + ax * u + nx * t, v, z0 + az * u + nz * t);
        if (p) {
          bad = `${p.name} at u ${u.toFixed(2)} h ${v.toFixed(2)} t ${t.toFixed(2)}`;
        }
      }
    }
  }
  check(!bad, `gap ${g.name}${bad ? `: ${bad}` : ''}`);
}

/* 2. The long corridor, east end to the chapel's west wall. */
{
  const y = (SEC.c1 + SEC.n0) / 2;
  const h = TH + 1.6;
  let bad = null;
  for (let px = WINGS[1].x1 + 3; px >= CHAPEL.x0 - 3 && !bad; px -= 0.25) {
    const [x, , z] = worldAt(px, y, h);
    const p = hit(x, h, z);
    if (p) {
      bad = `${p.name} at px ${px.toFixed(2)}`;
    }
  }
  check(!bad, `the long corridor, 230 m${bad ? `: ${bad}` : ''}`);
}

/* 3. The hidden Konex sign. */
{
  const [x, y, z] = worldAt(KONEX_SPOT.px, KONEX_SPOT.py, KONEX_SPOT.h);
  const behind = hit(x, y, z - 0.06, 0.02);
  let front = null;
  for (let t = 0.25; t <= 1.5 && !front; t += 0.25) {
    front = hit(x, y, z + 0.02 + t, 0.1);
  }
  check(Boolean(behind) && !front, `Konex sign on ${behind ? behind.name : 'nothing'}, clear in front`);
}

/* 4. The spawn's first line. */
{
  let bad = null;
  for (let d = 2; d <= 30 && !bad; d += 0.5) {
    const [x, , z] = worldAt(SPAWN.px, SPAWN.py + d, 0);
    bad = hit(x, 2, z);
  }
  check(!bad, `30 m clear ahead of the pad${bad ? `: ${bad.name}` : ''}`);
}

/* 5. The drop, from above the sun deck to the ground floor. */
{
  const cx = (DROP.x0 + DROP.x1) / 2;
  const cy = (DROP.y0 + DROP.y1) / 2;
  let bad = null;
  for (let h = TH + 3 * FL + 2; h >= TH + 0.6 && !bad; h -= 0.2) {
    const [x, , z] = worldAt(cx, cy, h);
    const p = hit(x, h, z, 0.6);
    if (p) {
      bad = `${p.name} at h ${h.toFixed(2)}`;
    }
  }
  check(!bad, `the drop through east ward 4${bad ? `: ${bad}` : ''}`);
}

/* 6. Every named gap pays when flown through its middle. */
{
  const { doc } = normalize(sanaDocument());
  const rects = namedGaps(placeDocument(doc).zones);
  check(rects.length === sanaGaps().length, `${rects.length} gaps placed from the document`);
  for (const g of rects) {
    const c = new NamedGapCounter();
    c.setGaps(rects);
    const mx = g.x;
    const my = g.y + g.h / 2;
    const mz = g.z;
    let step = 0;
    const paid = [];
    for (let t = -1.5; t <= 1.5; t += 0.01) {
      c.step(step, mx + g.nx * t, my, mz + g.nz * t);
      step += 1;
    }
    for (let k = 0; k < 2000; k += 1) {
      c.step(step, mx + g.nx * 1.5, my, mz + g.nz * 1.5);
      step += 1;
      paid.push(...c.events.splice(0));
    }
    check(paid.some((e) => e.name === g.name), `flown: ${g.name}`);
  }
}

console.log(`${solids.length} solids; ${fails ? `${fails} failed` : 'all passed'}`);
process.exit(fails ? 1 : 0);
