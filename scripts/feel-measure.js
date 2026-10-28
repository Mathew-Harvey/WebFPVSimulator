/*
 * feel-measure.js: the numbers that make a quad feel like itself, measured
 * through the real shell on the module's own 1 ms clock, for any map and
 * aircraft, so a change can be measured before and after and the two
 * compared.
 *
 * WHY THIS EXISTS. The owner, 2026-10-28, on the quad picker: "be defensive
 * and cautious fly everything and ensure the characteristics are not
 * different. measure first, then change then re measure, pick measurable
 * attributes that define the flight feel and test change test always".
 * The picker seats either aircraft on any map, which means a five inch in a
 * house built three and a half times life size and a whoop in a town built
 * at life size. Both are flown by scaling the aircraft into the world at the
 * one seam built for it (WORLD_SCALE in src/render/frame.js), so in its own
 * metres a quad must do exactly what it does on the map it was tuned on.
 * This is how that is shown rather than claimed.
 *
 * WHAT IS MEASURED, every number in the aircraft's own (sim) metres:
 *   hover       the throttle that holds height, from two held throttles
 *   punch       full throttle from a standstill: height and climb at 0.5 s
 *   cut         throttle to zero from a standstill: time to fall 10 m
 *   roll        full roll stick: rate at 50, 100 and 300 ms, time to 360
 *   yaw         full yaw stick: rate at 300 ms
 *   cruise      angle mode, full pitch, 0.8 throttle: speed at 2.5 s
 *   drop        dropped from 1 m onto the map's ground: speed at the hit,
 *               highest rebound, contacts, where it ends up and whether the
 *               shell called it landed
 *   dive        angle mode, full pitch at 0.4 throttle from 2 m: the slide
 *               after it meets the ground, the bounce, where it stops
 *
 * Each test seats the stick first, then places the craft, so every step of
 * the measured flight is flown on that stick. The state is read after every
 * 1 ms step by wrapping the module's step (window.__simModule), so no number
 * depends on the headless browser's frame rate. Betaflight's own state
 * carries across tests, which is why each test is flown REPEATS times and
 * the spread is printed beside the mean: a difference smaller than the
 * spread is not a difference.
 *
 * Usage, from the simulator root:
 *   node scripts/feel-measure.js --map=city --craft=5inch [--json=PATH]
 *     [--repeats=3] [--scale=WS] [--only=hover,roll]
 *   node scripts/feel-measure.js --compare=A.json,B.json
 * --scale forces the world scale for a probe of the seam itself (a harness
 * hook, only where the shell offers it).
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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (k, d = '') => {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};

/* The tests. `h` is metres above the surface in the aircraft's own metres,
 * `stick` is roll, pitch, yaw, throttle, `ms` how long to record. */
const TESTS = [
  { name: 'hover30', h: 150, stick: [0, 0, 0, 0.30], ms: 1000 },
  { name: 'hover40', h: 150, stick: [0, 0, 0, 0.40], ms: 1000 },
  { name: 'punch', h: 150, stick: [0, 0, 0, 1.0], ms: 500 },
  { name: 'cut', h: 150, stick: [0, 0, 0, 0], ms: 2000 },
  { name: 'roll', h: 150, stick: [1, 0, 0, 0.35], ms: 700 },
  { name: 'yaw', h: 150, stick: [0, 0, 1, 0.35], ms: 500 },
  { name: 'cruise', h: 150, stick: [0, 1, 0, 0.8], ms: 2500, angle: true },
  { name: 'drop', h: 1.0, stick: [0, 0, 0, 0], ms: 2500, ground: true },
  { name: 'dive', h: 2.0, stick: [0, 1, 0, 0.4], ms: 3000, angle: true, ground: true },
  /* A wall met square on: angle mode, half pitch, a little over hover, from
   * `d` aircraft metres in front of a tall face. And a drop onto the top of
   * something solid (a roof, a table, a ledge), not the map's ground. */
  { name: 'wall', h: 1.5, d: 6, stick: [0, 0.5, 0, 0.36], ms: 2500, angle: true, at: 'wall' },
  { name: 'ledge', h: 1.0, stick: [0, 0, 0, 0], ms: 2500, ground: true, at: 'ledge' },
];

/* In the page: find an open column near the spawn, then fly one test. */
const PAGE = `
window.__fm = window.__fm || {};
const fm = window.__fm;
const raf = () => new Promise((r) => requestAnimationFrame(r));
if (!fm.wrapped) {
  const S = window.__simModule();
  const step = S.step.bind(S);
  fm.rec = null;
  S.step = (n) => {
    const code = step(n);
    if (fm.rec) {
      const { state } = S.readState();
      if (state) fm.rec.push(Array.from(state));
    }
    return code;
  };
  fm.S = S;
  fm.wrapped = true;
}
fm.ws = () => window.__craftState().thresholds.worldScale;
fm.column = () => {
  const m = window.__map();
  const sp = m.spawn;
  const ws = fm.ws();
  /* Rings outward from the spawn: the first spot with nothing solid from
   * 0.3 m over the surface to 160 aircraft metres up, and a level surface. */
  for (let r = 0; r <= 120; r += 4) {
    const n = r === 0 ? 1 : Math.max(8, Math.round(r));
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const x = sp.x + r * Math.cos(a);
      const z = sp.z + r * Math.sin(a);
      window.__placeCraft(x, sp.y + 400, z);
      const g = window.__ground();
      if (!Number.isFinite(g.surf)) continue;
      const top = g.surf + 160 / ws;
      const hit = window.__hit(x, g.surf + 0.3 / ws + 0.05, z, x, top, z);
      if (hit.kind) continue;
      /* Level: the same surface a metre each way. */
      let level = true;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        window.__placeCraft(x + dx / ws, sp.y + 400, z + dz / ws);
        const g2 = window.__ground();
        if (!Number.isFinite(g2.surf) || Math.abs(g2.surf - g.surf) > 0.002) level = false;
      }
      if (!level) continue;
      return { x, z, surf: g.surf, r };
    }
  }
  return null;
};
/* The way positive pitch stick flies at the identity pose, in the world:
 * the plant's -x (the cruise test's travel, measured), which is Three.js
 * +z turned by the spawn's yaw. */
fm.fwd = () => {
  const yaw = window.__map().spawn.yaw;
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
};
/* A tall face square across the nose, with open air between: rings out from
 * the spawn, and the start put exactly d aircraft metres from where the
 * hull first touches it. */
fm.wallSpot = (h, d) => {
  const m = window.__map();
  const sp = m.spawn;
  const ws = fm.ws();
  const f = fm.fwd();
  const reach = (d + 8) / ws;
  for (let r = 0; r <= 160; r += 3) {
    const n = r === 0 ? 1 : Math.max(8, Math.round(r));
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const x = sp.x + r * Math.cos(a);
      const z = sp.z + r * Math.sin(a);
      window.__placeCraft(x, sp.y + 400, z);
      const g = window.__ground();
      if (!Number.isFinite(g.surf)) continue;
      const hits = [];
      for (const dh of [-0.6, 0, 1.5, 3.0]) {
        const y = g.surf + (h + dh) / ws;
        const k = window.__hit(x, y, z, x + f.x * reach, y, z + f.z * reach);
        if (!k.kind) break;
        const dot = k.nx * f.x + k.nz * f.z;
        if (dot > -0.9) break;
        hits.push(k.t * reach);
      }
      if (hits.length !== 4) continue;
      if (Math.max(...hits) - Math.min(...hits) > 0.05 / ws) continue;
      const D = Math.min(...hits);
      if (D * ws < d + 1) continue;
      const sx = x + f.x * (D - d / ws);
      const sz = z + f.z * (D - d / ws);
      window.__placeCraft(sx, sp.y + 400, sz);
      const g2 = window.__ground();
      if (!Number.isFinite(g2.surf) || Math.abs(g2.surf - g.surf) > 0.002) continue;
      const up = window.__hit(sx, g.surf + 0.3 / ws + 0.05, sz, sx, g.surf + 4 / ws, sz);
      if (up.kind) continue;
      return { x: sx, z: sz, surf: g.surf, r, wall: D * ws - (D - d / ws) * ws, kind: hits.length };
    }
  }
  return null;
};
/* The flat top of something solid, at least half a metre over the ground,
 * wide enough that a drop from h lands on it and not off its edge. */
fm.ledgeSpot = (h) => {
  const m = window.__map();
  const sp = m.spawn;
  const ws = fm.ws();
  for (let r = 0; r <= 160; r += 2) {
    const n = r === 0 ? 1 : Math.max(8, Math.round(r));
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const x = sp.x + r * Math.cos(a);
      const z = sp.z + r * Math.sin(a);
      window.__placeCraft(x, sp.y + 400, z);
      const g = window.__ground();
      if (!Number.isFinite(g.surf)) continue;
      const top = g.surf + 60 / ws;
      const tops = [];
      for (const [dx, dz] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
        const px = x + dx / ws;
        const pz = z + dz / ws;
        const k = window.__hit(px, top, pz, px, g.surf - 0.01, pz);
        if (!k.kind || k.ny < 0.98) break;
        tops.push(top + k.t * (g.surf - 0.01 - top));
      }
      if (tops.length !== 5) continue;
      if (Math.max(...tops) - Math.min(...tops) > 0.003) continue;
      /* A collider's top, not the map's ground: the ground is not a
       * collider, so a hit at all says it. */
      /* Clear air over it to the drop height and well past it. */
      const over = window.__hit(x, tops[0] + 0.02, z, x, tops[0] + (h + 3) / ws, z);
      if (over.kind) continue;
      return { x, z, surf: tops[0], r, ground: g.surf };
    }
  }
  return null;
};
fm.fly = async (T, spot) => {
  const ws = fm.ws();
  const S = fm.S;
  window.__stick(...T.stick);
  if (T.angle) S.setAngleMode(true);
  for (let i = 0; i < 4; i += 1) await raf();
  fm.rec = [];
  const placed = window.__placeCraft(spot.x, spot.surf + T.h / ws, spot.z);
  fm.rec = [];
  const base = Array.from(S.readState().state);
  const t0 = base[0];
  let frames = 0;
  let still = 0;
  let seen = 0;
  while ((fm.rec.length === 0 || fm.rec[fm.rec.length - 1][0] - t0 < T.ms / 1000) && frames < 20000) {
    await raf();
    frames += 1;
    if (!fm.rec.length && frames > 400) break;
    /* A craft that has come to rest on the ground is parked by the shell,
     * which stops stepping the plant until the throttle lifts it, so the
     * record ends there. Waiting for the rest of the window used to wait
     * out all 20000 frames, minutes a ground test. */
    still = fm.rec.length === seen ? still + 1 : 0;
    seen = fm.rec.length;
    if (still > 120 && window.__craftState().landed) break;
  }
  const rec = fm.rec;
  fm.rec = null;
  const cs = window.__craftState();
  if (T.angle) S.setAngleMode(false);
  window.__stick(0, 0, 0, 0);
  return { base, rec, ws, placed: Boolean(placed), landed: cs.landed, bounces: cs.bounceCount, hitKind: cs.lastHitKind, frames };
};
return 1;
`;

/* The numbers, off one recorded flight. Rows are the module's state block:
 * [0] t, [1..3] position, [4..6] velocity, [7..10] attitude, [11..13] rates. */
function metrics(T, r) {
  const rows = r.rec;
  if (!rows.length) {
    return { error: 'no steps recorded' };
  }
  const t0 = r.base[0];
  const at = (ms) => rows[Math.min(rows.length - 1, Math.max(0, Math.round(ms) - 1))];
  const z0 = r.base[3];
  const out = {};
  if (T.name.startsWith('hover')) {
    out.vzEnd = at(T.ms)[6];
    out.az = (at(1000)[6] - at(500)[6]) / 0.5;
  } else if (T.name === 'punch') {
    out.dz = at(500)[3] - z0;
    out.vz = at(500)[6];
  } else if (T.name === 'cut') {
    const k = rows.findIndex((s) => z0 - s[3] >= 10);
    out.fall10ms = k < 0 ? null : Math.round((rows[k][0] - t0) * 1000);
    out.vz1s = at(1000)[6];
  } else if (T.name === 'roll') {
    out.p50 = at(50)[11];
    out.p100 = at(100)[11];
    out.p300 = at(300)[11];
    let ang = 0;
    let t360 = null;
    for (const s of rows) {
      ang += s[11] * 0.001;
      if (t360 == null && ang >= Math.PI * 2) {
        t360 = Math.round((s[0] - t0) * 1000);
      }
    }
    out.t360ms = t360;
  } else if (T.name === 'yaw') {
    out.r300 = at(300)[13];
  } else if (T.name === 'cruise') {
    const s = at(T.ms);
    out.speed = Math.hypot(s[4], s[5], s[6]);
    out.vh = Math.hypot(s[4], s[5]);
    out.dz = s[3] - z0;
  } else if (T.name === 'wall') {
    /* Pitch flies -x: the wall closes along it. The hit is the first step
     * that loses more than half a metre a second of it. */
    const vx = (s) => -s[4];
    let k = -1;
    for (let i = 1; i < rows.length; i += 1) {
      if (vx(rows[i]) < vx(rows[i - 1]) - 0.5 && vx(rows[i - 1]) > 0.5) {
        k = i;
        break;
      }
    }
    out.hitMs = k < 0 ? null : Math.round((rows[k][0] - t0) * 1000);
    out.hitSpeed = k < 0 ? null : vx(rows[k - 1]);
    out.hitDz = k < 0 ? null : rows[k - 1][3] - z0;
    let back = 0;
    if (k >= 0) {
      for (let i = k; i < Math.min(rows.length, k + 400); i += 1) {
        back = Math.min(back, vx(rows[i]));
      }
    }
    out.rebound = k < 0 ? null : -back;
    const last = rows[rows.length - 1];
    out.endX = -(last[1] - r.base[1]);
    out.endDz = last[3] - z0;
    out.endSpeed = Math.hypot(last[4], last[5], last[6]);
    out.bounces = r.bounces;
  } else {
    /* Ground tests: the surface is h under the start in the aircraft's own
     * metres. */
    const zg = z0 - T.h;
    let kHit = -1;
    for (let i = 1; i < rows.length; i += 1) {
      if (rows[i][6] > rows[i - 1][6] + 0.5 && rows[i - 1][6] < 0) {
        kHit = i;
        break;
      }
    }
    out.hitSpeed = kHit < 0 ? null : -rows[kHit - 1][6];
    let peak = -Infinity;
    if (kHit >= 0) {
      for (let i = kHit; i < rows.length; i += 1) {
        peak = Math.max(peak, rows[i][3] - zg);
      }
    }
    out.rebound = kHit < 0 ? null : peak;
    const last = rows[rows.length - 1];
    out.endHeight = last[3] - zg;
    out.endSpeed = Math.hypot(last[4], last[5], last[6]);
    out.travel = Math.hypot(last[1] - r.base[1], last[2] - r.base[2]);
    if (kHit >= 0) {
      out.slide = Math.hypot(last[1] - rows[kHit][1], last[2] - rows[kHit][2]);
    }
    out.steps = rows.length;
    out.landed = r.landed;
  }
  return out;
}

function summarise(runs) {
  const keys = new Set();
  for (const m of runs) {
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === 'number') {
        keys.add(k);
      }
    }
  }
  const s = {};
  for (const k of keys) {
    const v = runs.map((m) => m[k]).filter((x) => typeof x === 'number');
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    s[k] = { mean, min: Math.min(...v), max: Math.max(...v), n: v.length };
  }
  for (const m of runs) {
    for (const [k, v] of Object.entries(m)) {
      if (typeof v !== 'number') {
        s[k] = s[k] || { values: [] };
        if (s[k].values) {
          s[k].values.push(v);
        }
      }
    }
  }
  return s;
}

function hoverOf(res) {
  const a = res.hover30?.az?.mean;
  const b = res.hover40?.az?.mean;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
    return null;
  }
  return 0.30 + (0 - a) * (0.10 / (b - a));
}

const f3 = (x) => (x == null ? 'none' : (Math.abs(x) >= 100 ? x.toFixed(1) : x.toFixed(4)));

function compare(aPath, bPath) {
  const A = JSON.parse(readFileSync(aPath, 'utf8'));
  const B = JSON.parse(readFileSync(bPath, 'utf8'));
  console.log(`feel-measure: ${A.label} against ${B.label}`);
  let worst = 0;
  for (const [t, ma] of Object.entries(A.results)) {
    const mb = B.results[t];
    if (!mb) {
      continue;
    }
    for (const [k, va] of Object.entries(ma)) {
      const vb = mb[k];
      if (!vb || va.mean == null || vb.mean == null) {
        continue;
      }
      const spread = Math.max(va.max - va.min, vb.max - vb.min);
      const d = vb.mean - va.mean;
      const rel = Math.abs(va.mean) > 1e-9 ? d / Math.abs(va.mean) : 0;
      const flag = Math.abs(d) <= spread + 1e-9 ? '' : (Math.abs(rel) > 0.02 ? '  <-- differs' : '  (small)');
      if (flag.includes('differs')) {
        worst += 1;
      }
      console.log(`  ${t.padEnd(8)} ${k.padEnd(10)} ${f3(va.mean).padStart(10)} ${f3(vb.mean).padStart(10)}  diff ${(rel * 100).toFixed(2)}%  spread ${f3(spread)}${flag}`);
    }
  }
  console.log(`  hover throttle        ${f3(A.hover)} ${f3(B.hover)}`);
  console.log(`feel-measure: ${worst} number${worst === 1 ? '' : 's'} differ by more than the spread and 2 percent`);
  return worst;
}

async function main() {
  const cmp = arg('compare');
  if (cmp) {
    const [a, b] = cmp.split(',');
    process.exit(compare(a, b) ? 1 : 0);
  }
  const map = arg('map', 'city');
  const craft = arg('craft', '5inch');
  const repeats = Number(arg('repeats', '3'));
  const only = arg('only') ? arg('only').split(',') : null;
  const scale = arg('scale');
  const jsonOut = arg('json');
  /* The quad picker asks at every map a ?fly=1 link names (2026-10-28) and
   * opens on the pilot's own pick or the map's, never the link's. The rig
   * measures the craft it was told to, so it ticks Always for this map, as
   * a pilot would, and the picker stays down with that craft seated. */
  const quadSeed = `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.quadAlways = ${JSON.stringify(`${map}:${craft}`)};
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* Storage refused: the picker comes up and the map never reports ready to fly. */ }`;
  const page = await openPage({ root: ROOT, width: 480, height: 270, url: `/index.html?map=${map}&craft=${craft}&fly=1`, seed: [quadSeed] });
  const { cdp, sessionId } = page;
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true,
    }, sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };
  const report = { label: `${map}/${craft}${scale ? `@${scale}` : ''}`, at: new Date().toISOString(), results: {} };
  try {
    for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady')); i += 1) {
      await sleep(500);
    }
    let ready = false;
    for (let i = 0; i < 300; i += 1) {
      const m = await ev('return window.__map ? window.__map() : null');
      if (m && m.ready && m.id === map) {
        ready = true;
        break;
      }
      await sleep(500);
    }
    if (!ready) {
      throw new Error(`${map} never became ready`);
    }
    await sleep(4000);
    await ev('window.__drawOff(true); return 1;');
    if (scale) {
      const got = await ev(`return window.__forceWorldScale ? window.__forceWorldScale(${Number(scale)}) : null`);
      if (got == null) {
        throw new Error('this shell has no world scale hook');
      }
    }
    await ev(PAGE);
    const seated = await ev('return { craft: window.__ui.settings.airframe, ws: window.__fm.ws() }');
    report.craft = seated.craft;
    report.worldScale = seated.ws;
    const spot = await ev('return window.__fm.column()');
    if (!spot) {
      throw new Error('no open level column near the spawn');
    }
    report.spot = spot;
    console.log(`feel-measure: ${report.label}, seated ${seated.craft}, world scale ${seated.ws}, column ${spot.r} m from the spawn`);
    /* One throwaway flight, so the first measured one is not a cold plant. */
    await ev(`await window.__fm.fly(${JSON.stringify(TESTS[0])}, ${JSON.stringify(spot)}); return 1;`);
    for (const T of TESTS) {
      if (only && !only.some((o) => T.name.startsWith(o))) {
        continue;
      }
      let here = spot;
      if (T.at === 'wall') {
        here = await ev(`return window.__fm.wallSpot(${T.h}, ${T.d})`);
      } else if (T.at === 'ledge') {
        here = await ev(`return window.__fm.ledgeSpot(${T.h})`);
      }
      if (!here) {
        console.log(`  ${T.name.padEnd(8)} no place for it on this map`);
        continue;
      }
      if (T.at) {
        report[`${T.name}Spot`] = here;
      }
      const runs = [];
      for (let k = 0; k < repeats; k += 1) {
        /* eslint-disable-next-line no-await-in-loop */
        const r = await ev(`return await window.__fm.fly(${JSON.stringify(T)}, ${JSON.stringify(here)});`);
        runs.push(metrics(T, r));
      }
      report.results[T.name] = summarise(runs);
      const line = Object.entries(report.results[T.name])
        .map(([k, v]) => (v.mean != null ? `${k} ${f3(v.mean)}${v.max - v.min > 1e-9 ? ` (+-${f3((v.max - v.min) / 2)})` : ''}` : `${k} ${v.values.join('/')}`))
        .join(', ');
      console.log(`  ${T.name.padEnd(8)} ${line}`);
    }
    report.hover = hoverOf(report.results);
    console.log(`  hover throttle ${f3(report.hover)}`);
  } finally {
    await page.close?.();
  }
  if (jsonOut) {
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 1)}\n`);
    console.log(`feel-measure: wrote ${jsonOut}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
