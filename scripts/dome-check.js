/*
 * dome-check.js: Bakuon Dome's checks (src/maps/dome/).
 *
 *   node scripts/dome-check.js            the pure checks, Node only, seconds
 *   node scripts/dome-check.js --browser  and the map in headless Chromium:
 *                                         it loads, the trucks run, no page
 *                                         errors, and each named view's draw
 *                                         calls and triangles
 *   --shots=DIR                           the views' pictures, into DIR
 *   --graphics=low|medium|high            the preset, pinned (default high):
 *                                         headless Chromium is a CPU
 *                                         rasteriser, and boot lowers a
 *                                         detected preset to Low on one
 *
 * The pure half: every named gap is wider and taller than a five inch
 * needs, the spawn stands on the floor with the line ahead of it clear,
 * the trucks are four movers the size of the real thing, the hidden sign
 * is on the big screen's roof, and no dash a CLAUDE.md forbids is in the
 * map's files. The browser half's numbers are a proxy for the latency
 * rule, since the headless page has no GPU.
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

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  domeLayout, domeGaps, SPAWN, FLOOR, KONEX, SCREEN, TRUCK, PARKED,
} from '../src/maps/dome/stadium.js';
import { domeTraffic } from '../src/maps/dome/course.js';
import { domeDocument } from '../src/maps/dome/yard.js';
import { GAP_MIN } from '../src/props/parts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER = process.argv.includes('--browser');
const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const SHOTS = shotsArg ? shotsArg.slice(8) : '';
const gfxArg = process.argv.find((a) => a.startsWith('--graphics='));
const GRAPHICS = gfxArg ? gfxArg.slice(11) : 'high';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

/* A solid part's box, capsules by their swept bounds. */
function boundsOf(p) {
  if (p.t === 'box') {
    return { lo: p.lo, hi: p.hi };
  }
  const r = p.r;
  return {
    lo: [Math.min(p.a[0], p.b[0]) - r, Math.min(p.a[1], p.b[1]) - r, Math.min(p.a[2], p.b[2]) - r],
    hi: [Math.max(p.a[0], p.b[0]) + r, Math.max(p.a[1], p.b[1]) + r, Math.max(p.a[2], p.b[2]) + r],
  };
}

function pure() {
  console.log('dome: pure');
  const L = domeLayout();
  const solid = L.parts.filter((p) => p.solid !== false);
  check('the layout has solids', solid.length > 1500, `${L.parts.length} parts, ${solid.length} solid`);
  const finite = L.parts.every((p) => [...(p.lo || []), ...(p.hi || []), ...(p.a || []), ...(p.b || [])].every(Number.isFinite));
  check('every part is somewhere real', finite);

  const gaps = domeGaps();
  const names = new Set(gaps.map((g) => g.name));
  check('the named gaps have a name each', names.size === gaps.length, `${gaps.length} gaps`);
  const thin = gaps.filter((g) => !(g.w >= GAP_MIN && g.h >= GAP_MIN));
  check(`every gap is at least ${GAP_MIN} m each way`, thin.length === 0, thin.map((g) => `${g.name} ${g.w.toFixed(2)} x ${g.h.toFixed(2)}`).join(', '));
  /* A gap's window must be clear of every solid: a box swept a quad's
   * radius in from the frame, through 0.3 m of depth. */
  const blocked = [];
  for (const g of gaps) {
    const nx = Math.cos(g.yaw);
    const nz = -Math.sin(g.yaw);
    const ax = -nz;
    const az = nx;
    for (let t = -0.15; t <= 0.15; t += 0.15) {
      for (let a = -g.w / 2 + 0.25; a <= g.w / 2 - 0.25; a += 0.25) {
        for (let h = 0.25; h <= g.h - 0.25; h += 0.25) {
          const x = g.x + nx * t + ax * a;
          const z = g.z + nz * t + az * a;
          const y = g.y + h;
          const hit = solid.find((p) => {
            const b = boundsOf(p);
            if (p.t === 'box') {
              return x > b.lo[0] && x < b.hi[0] && y > b.lo[1] && y < b.hi[1] && z > b.lo[2] && z < b.hi[2];
            }
            const dx = p.b[0] - p.a[0];
            const dy = p.b[1] - p.a[1];
            const dz = p.b[2] - p.a[2];
            const l2 = dx * dx + dy * dy + dz * dz;
            const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - p.a[0]) * dx + (y - p.a[1]) * dy + (z - p.a[2]) * dz) / l2)) : 0;
            const ex = p.a[0] + dx * u - x;
            const ey = p.a[1] + dy * u - y;
            const ez = p.a[2] + dz * u - z;
            return ex * ex + ey * ey + ez * ez < p.r * p.r;
          });
          if (hit) {
            blocked.push(`${g.name} by ${hit.name || hit.m} at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
            break;
          }
        }
        if (blocked.length && blocked[blocked.length - 1].startsWith(g.name)) {
          break;
        }
      }
      if (blocked.length && blocked[blocked.length - 1].startsWith(g.name)) {
        break;
      }
    }
  }
  check('every gap is open, nothing solid in its window', blocked.length === 0, blocked.slice(0, 4).join('; '));

  /* The spawn: on the dirt, and 20 m east of it clear from knee height
   * to 4 m, two metres either side. */
  const inFloor = Math.abs(SPAWN.x) < FLOOR.hx - 2 && Math.abs(SPAWN.z) < FLOOR.hz - 2;
  check('the spawn is on the dirt floor', inFloor, `(${SPAWN.x}, ${SPAWN.z})`);
  const ahead = solid.filter((p) => {
    const b = boundsOf(p);
    return b.hi[0] > SPAWN.x - 1 && b.lo[0] < SPAWN.x + 20 && b.hi[2] > SPAWN.z - 2 && b.lo[2] < SPAWN.z + 2 && b.hi[1] > 0.4 && b.lo[1] < 4;
  });
  check('the first line ahead of the spawn is clear', ahead.length === 0, ahead.slice(0, 3).map((p) => p.name).join(', '));
  /* And no truck's lane comes within 6 m of it. */
  const dome = domeTraffic();
  const line = dome.line;
  let near = Infinity;
  for (const p of line.points) {
    const x = p.x - 210;
    const z = 165 - p.y;
    near = Math.min(near, Math.hypot(x - SPAWN.x, z - SPAWN.z));
  }
  check('the trucks never run over the spawn', near > 6, `${near.toFixed(1)} m to the course's centre`);

  check('four trucks', dome.traffic.vehicles.length === 4);
  const v = dome.traffic.vehicles[0];
  check('a truck is a monster truck\'s size', v.height === TRUCK.roof && v.length === TRUCK.length && v.width === TRUCK.width, `${v.length} x ${v.width} x ${v.height} m`);
  check('the tyres are 66 inch', Math.abs(TRUCK.wheelR * 2 - 66 * 0.0254) < 0.03, `${(TRUCK.wheelR * 2).toFixed(2)} m`);
  check('two parked', PARKED.length === 2);

  check('the Konex sign sits on the big screen\'s roof', KONEX.p[1] > SCREEN.y1 && KONEX.p[1] < SCREEN.y1 + 0.1 && KONEX.n[1] === 1, `y ${KONEX.p[1]}`);

  const doc = domeDocument();
  const docGaps = doc.elements.filter((e) => e.type === 'gap');
  check('the document carries every named gap', docGaps.length === gaps.length && docGaps.every((e) => e.name && e.points > 0));
  check('the document starts on one pad', doc.elements.filter((e) => e.type === 'startPads').length === 1);
  const words = JSON.stringify(doc);
  check('the document names no sponsor or board', !/webfpv|patreon|board|sponsor|konex/i.test(words));

  const dir = join(ROOT, 'src/maps/dome');
  const files = readdirSync(dir).map((f) => join(dir, f)).concat([fileURLToPath(import.meta.url)]);
  const dashes = files.filter((f) => /[\u2013\u2014]/.test(readFileSync(f, 'utf8')));
  check('no em or en dash in the map\'s files', dashes.length === 0, dashes.join(', '));
  const art = readFileSync(join(dir, 'art.js'), 'utf8') + readFileSync(join(dir, 'draw.js'), 'utf8');
  check('no sponsor, board or site name painted in the hall', !/webfpv|patreon|'board|sponsor/i.test(art.replace(/\/\*[\s\S]*?\*\//g, '')));
}

const sleep = (ms) => new Promise((r) => {
  setTimeout(r, ms);
});

/* The views: where the camera is and what it looks at. */
const VIEWS = [
  ['spawn', [-55, 1.6, 0], [0, 2, 0]],
  ['crush', [-24, 3, -24], [-8, 2, -16]],
  ['bus-bridge', [-16, 2.5, 6], [0, 2, 0]],
  ['stands', [-20, 4, 26], [10, 8, 48]],
  ['roof', [-40, 30, -10], [0, 44, 10]],
  ['screen', [16, 34, 18], [0, 33, 0]],
  ['concourse', [-30, 2.2, 58], [10, 2.5, 61]],
  ['outside', [-160, 40, -130], [0, 20, 0]],
];

async function browser() {
  console.log('dome: browser');
  const { answerQuadPicker, openPage } = await import('../tests/lib/page.js');
  const { SETTINGS_KEY } = await import('../src/ui/ui.js');
  const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = ${JSON.stringify(GRAPHICS)};
    s.graphicsAuto = false;
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused: whatever preset boot picks */ }`];
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
  }
  const page = await openPage({
    root: ROOT, width: 960, height: 540, url: '/index.html?map=dome&craft=5inch&fly=1', seed,
  });
  const ev = async (body) => {
    const r = await page.cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true,
    }, page.sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };
  const until = async (body, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await ev(body)) {
        return true;
      }
      await sleep(250);
    }
    return false;
  };
  const shot = async (name) => {
    if (!SHOTS) {
      return;
    }
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const report = {};
  try {
    check('the shell comes up', await until('return !!window.__shellReady', 120000));
    check('the dome is ready', await until("const m = window.__map ? window.__map() : null; return Boolean(m && m.ready && m.id === 'dome');", 180000));
    const gfx = await ev('return window.__map().graphics;');
    check(`flown at ${GRAPHICS}`, String(gfx).toLowerCase().startsWith(GRAPHICS), String(gfx));
    await answerQuadPicker(page, 60000).catch(() => {});
    await until("return window.__ui.screen === 'flight'", 20000);
    const stand = await ev('const q = window.__ground(); return { y: q.y, surf: q.surf, rest: q.rest };');
    check('the spawn stands on the dirt, 6 cm up', Math.abs(stand.surf - FLOOR.dirt) < 0.01, JSON.stringify(stand));
    await shot('first-person');
    report.stats = await ev('return JSON.parse(JSON.stringify(window.__map()));');
    const at = 'return (window.__map().trucks || {}).at || [];';
    const before = await ev(at);
    await sleep(4000);
    const after = await ev(at);
    const moved = after.filter((p, i) => p && before[i] && Math.hypot(p[0] - before[i][0], p[1] - before[i][1]) > 1).length;
    check('the trucks are out and moving', moved >= 3, `${moved} of ${after.length} moved: ${JSON.stringify(after)}`);
    report.views = {};
    for (const [name, eye, at] of VIEWS) {
      await ev(`window.__setCam(${eye.join(',')}, ${at.join(',')}); return 1;`);
      await sleep(1800);
      const rs = await ev('return window.__renderStats();');
      report.views[name] = rs;
      console.log(`  info  ${name}: ${rs.calls} draw calls, ${rs.triangles} triangles`);
      await shot(name);
    }
    if (SHOTS) {
      /* The picker card's picture: the page's furniture hidden, a truck
       * over the cars, 960 by 540 for assets/thumbs/dome.jpg. */
      await ev("window.__ui.root.style.visibility = 'hidden'; return 1;");
      await ev('window.__setCam(-30, 9, -36, -4, 6, -8); return 1;');
      await sleep(2500);
      await shot('card');
      await ev("window.__ui.root.style.visibility = ''; return 1;");
    }
    await ev('window.__setCam(); return 1;');
    const errs = page.errors.filter((e) => !/api\/|ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
  if (SHOTS) {
    writeFileSync(join(SHOTS, 'report.json'), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report.stats && { dome: report.stats.dome, trucks: report.stats.trucks }, null, 1));
}

pure();
if (BROWSER) {
  await browser();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
