/*
 * gate-branding-check.js: a sponsor's mark is printed on the face of a five inch
 * gate that a pilot sees while flying through it, and on no other.
 *
 * Before 2026-11-15 a gate's header board and sleeves were printed on both faces with
 * the same artwork, so the logo showed on the back of every gate as well as the front.
 * The reverse now wears the same racing dress without the mark. A gate flown in both
 * directions keeps the mark on both faces, because both are an approach face.
 *
 * Loads a shipped five inch track in the builder's 3D view with one logo, walks the
 * scene, and for every printed header plane asks which side of the gate it is on and
 * whether its material is the marked one or the plain back.
 *
 * Usage: node scripts/gate-branding-check.js [--root=DIR]
 * `--root=DIR` runs it against another checkout, which is how it is shown to fail on
 * the code as it stood before the fix (there is no back material there, so every header
 * plane reports the marked material and the check fails).
 * Exit code is the number of failed checks.
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

import { openPage } from '../tests/lib/page.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const root = rootArg ? resolve(rootArg.slice('--root='.length)) : HERE;
const failures = [];

function check(name, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failures.push(name);
  }
}

/* A 1 pixel PNG: the check is about which plane wears which print, not about the picture. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const page = await openPage({ root, width: 1280, height: 720, url: '/src/trackbuilder/index.html?class=full' });
try {
  await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
  const result = await page.evaluate(`(async () => {
    const { FIVE_INCH_PRESETS } = await import('/src/trackbuilder/presets5.js');
    const tb = window.trackBuilder;
    const doc = JSON.parse(JSON.stringify(FIVE_INCH_PRESETS[0]));
    doc.branding = { logos: [{ id: 'logo1', image: ${JSON.stringify(PNG)}, name: 'Test' }] };
    tb.loadDocument(doc, '');
    tb.setMode('3d');
    for (let i = 0; i < 600 && !(tb.view3d.renderer && !tb.view3d.dirty); i += 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const v = tb.view3d;
    const kit = v.bannerKit();
    const dress = kit.dress[0];
    const out = { gates: 0, single: 0, ok: 0, bad: [], hasBack: !!dress.headerBack && dress.headerBack !== dress.header };
    const entries = new Map();
    for (const q of tb.doc.sequence) {
      if (q.entry === 1 || q.entry === -1) {
        const s = entries.get(q.elementId) || new Set();
        s.add(q.entry);
        entries.set(q.elementId, s);
      }
    }
    const { apertureFrame } = await import('/src/trackbuilder/geometry.js');
    for (const el of tb.doc.elements) {
      const g = v.groups.get(el.id);
      const set = entries.get(el.id);
      if (!g || !set) {
        continue;
      }
      const list = g.children.filter((o) => o.isMesh && (o.material === dress.header || o.material === dress.headerBack));
      if (list.length !== 2) {
        continue;
      }
      out.gates += 1;
      if (set.size !== 1) {
        /* Flown both ways: both faces are approach faces, so both keep the mark. */
        out.both = (out.both || 0) + 1;
        if (list.every((p) => p.material === dress.header)) {
          out.bothOk = (out.bothOk || 0) + 1;
        }
        continue;
      }
      out.single += 1;
      const entry = [...set][0];
      const n = apertureFrame(el.yaw, el.pitch).normal;
      const side = (p) => p.position.x * n.x + p.position.y * n.y + p.position.z * n.z;
      const approach = list.find((p) => Math.sign(side(p) - side(list[0] === p ? list[1] : list[0])) === -entry);
      const away = list.find((p) => p !== approach);
      if (approach && away && approach.material === dress.header && away.material === dress.headerBack) {
        out.ok += 1;
      } else {
        out.bad.push(el.id);
      }
    }
    return out;
  })()`);
  console.log(JSON.stringify(result));
  check('a back print exists apart from the marked one', result.hasBack === true);
  check('the course has gates to look at', result.single > 0, `${result.single} single direction gates of ${result.gates}`);
  check('every single direction gate wears the mark on its approach face only', result.single > 0 && result.ok === result.single, `${result.ok} of ${result.single}${result.bad.length ? `, wrong: ${result.bad.join(',')}` : ''}`);
} finally {
  await page.close();
}
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length);
