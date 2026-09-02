/*
 * quality-check.js: the graphics presets, against the machines they name.
 *
 * WHY THIS EXISTS.
 *
 * quality.js is a table of numbers with a comment above it saying which
 * machine each row is for, and nothing checked that the numbers still meant
 * what the comment said. Three defects lived in there at once and all three
 * were found by reading, not by a check:
 *
 *   - The race field had no pixel budget at all, so a 1440 by 900 laptop
 *     with a 2x panel rendered 5.2 Mpx through three full resolution passes,
 *     about twice the project's own render target ceiling.
 *   - Detection returned High for every machine that was not a Steam Deck,
 *     a phone or an iPad, including the integrated laptop chips the Medium
 *     row explicitly names.
 *   - The Settings notes promised "thinned planting" on a map that has no
 *     planting lever.
 *
 * These are not opinions about how the world should look. They are
 * arithmetic on the table, so they are checkable, and this checks them on
 * every run rather than on the next time somebody reads the file.
 *
 * WHAT IT DOES NOT DO. It does not measure a frame, because a frame needs a
 * GPU and this has to run on a laptop with no browser open. Everything here
 * is the table's own numbers and the functions that read them.
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

import { GRAPHICS_IDS, qualityFor, pixelRatioFor, internalScale } from '../src/render/quality.js';
import { isIntegratedGpu } from '../src/render/gpuinfo.js';

const rows = [];
let failed = 0;

function check(name, ok, detail) {
  rows.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) {
    failed += 1;
  }
}

/*
 * The screens this product actually meets, with the pixel ratio the browser
 * reports on each. Every one of them is a real configuration: the 1440 by
 * 900 at 2x is the MacBook Air, the 1366 by 768 is still the commonest
 * laptop panel in the world, and the 430 by 932 at 3x is an iPhone.
 */
const SCREENS = [
  { name: 'MacBook Air 1440x900', w: 1440, h: 900, dpr: 2 },
  { name: 'laptop 1366x768', w: 1366, h: 768, dpr: 1 },
  { name: 'desktop 1920x1080', w: 1920, h: 1080, dpr: 1 },
  { name: 'desktop 2560x1440', w: 2560, h: 1440, dpr: 1 },
  { name: 'desktop 3840x2160', w: 3840, h: 2160, dpr: 1 },
  { name: 'Steam Deck 1280x800', w: 1280, h: 800, dpr: 1 },
  { name: 'iPhone 430x932', w: 430, h: 932, dpr: 3 },
];

/*
 * The ceiling this project sets itself for resolution dependent render
 * targets, from tests/thresholds.json's own P5 budget. The field's chain at
 * 1600 by 900 measured 90.2 MB of which 33.6 MB is the fixed shadow map, so
 * 56.6 MB is carried by 1.44 Mpx: 39 bytes a pixel across two RGBA16F
 * composer targets, the normal target and the bloom ladder. That ratio is
 * what turns a pixel count into megabytes here.
 */
const TARGET_BYTES_PER_PIXEL = 56.6e6 / 1.44e6;
const TARGET_BUDGET_MB = 120;

/* The shadow map is fixed size and does not scale with the window, so it is
 * added separately. Eight bytes a texel, which is what makes the measured
 * 2048 map 33.6 MB. */
const SHADOW_BYTES_PER_TEXEL = 8;

/* Every preset has a field pixel budget, and it is a number. */
for (const id of GRAPHICS_IDS) {
  const q = qualityFor(id);
  const b = q.field && q.field.pixelBudget;
  check(
    `${id}: field has a pixel budget`,
    Number.isFinite(b) && b > 0,
    Number.isFinite(b) ? `${(b / 1e6).toFixed(2)} Mpx` : 'MISSING, so a dense panel renders unbounded',
  );
}

/*
 * No screen renders more than the project's own render target budget.
 *
 * This is the check that would have caught the 5.2 Mpx MacBook: at 39 bytes
 * a pixel it is 237 MB of targets against a 120 MB ceiling.
 */
for (const id of GRAPHICS_IDS) {
  for (const s of SCREENS) {
    global.window = { devicePixelRatio: s.dpr, innerWidth: s.w, innerHeight: s.h };
    const pr = pixelRatioFor(id, 1);
    const mpx = (s.w * s.h * pr * pr) / 1e6;
    const shadowMb = ((q0(id).field.shadowMap ** 2) * SHADOW_BYTES_PER_TEXEL) / 1e6;
    const mb = (mpx * 1e6 * TARGET_BYTES_PER_PIXEL) / 1e6 + shadowMb;
    check(
      `${id}: ${s.name}`,
      mb <= TARGET_BUDGET_MB,
      `ratio ${pr.toFixed(2)}, ${mpx.toFixed(2)} Mpx, about ${mb.toFixed(0)} MB of targets${mb > TARGET_BUDGET_MB ? `  <-- over the ${TARGET_BUDGET_MB} MB budget` : ''}`,
    );
  }
}

function q0(id) {
  return qualityFor(id);
}

/*
 * NOTHING AT OR BELOW 1080p IS TOUCHED.
 *
 * The budgets are the 1080p pixel count the render target ceiling was
 * measured at, so every screen at or under it renders exactly what the table
 * authors. This is the check that says the fix for the dense panels did not
 * quietly change the frame everything else was measured on.
 */
for (const id of GRAPHICS_IDS) {
  const q = qualityFor(id);
  for (const s of SCREENS.filter((x) => x.dpr === 1 && x.w * x.h <= 2.074e6)) {
    global.window = { devicePixelRatio: 1, innerWidth: s.w, innerHeight: s.h };
    const pr = pixelRatioFor(id, 1);
    /* Low authors its own 0.85 downscale, which is a choice in the table
     * rather than a budget clamping a screen. */
    const authored = Math.min(1, q.pixelRatioCap) * q.resolutionScale;
    check(
      `${id}: ${s.name} keeps its authored ratio`,
      Math.abs(pr - authored) < 0.001,
      `${pr.toFixed(3)} against the table's ${authored.toFixed(3)}`,
    );
  }
}

/* The Render scale slider still multiplies through, at every preset. */
for (const id of GRAPHICS_IDS) {
  global.window = { devicePixelRatio: 1, innerWidth: 1920, innerHeight: 1080 };
  const full = pixelRatioFor(id, 1);
  const half = pixelRatioFor(id, 0.5);
  check(
    `${id}: Render scale still scales`,
    half < full,
    `100 percent gives ${full.toFixed(3)}, 50 percent gives ${half.toFixed(3)}`,
  );
}

/*
 * The Settings notes describe what the preset does. A note that names a
 * lever the preset does not pull is worse than no note: it sends a pilot
 * looking for a change that will not come.
 *
 * The field reads shadowMap and shadowHalf and nothing else, so only the
 * city may be described as thinning anything.
 */
for (const id of GRAPHICS_IDS) {
  const q = qualityFor(id);
  const note = String(q.note || '');
  const plantingWords = /plant|foliage|tree|grass/i.test(note);
  const namesTheTown = /town|city/i.test(note);
  check(
    `${id}: note does not promise a lever the field lacks`,
    !plantingWords || namesTheTown,
    plantingWords
      ? (namesTheTown ? 'planting named, and attributed to the town' : 'promises planting without saying it is the town, and the field has no planting lever')
      : 'no planting claim',
  );
}

/*
 * Detection, by GPU name.
 *
 * The strings are real ones, as a browser reports them. The discrete parts
 * are here because the patterns share words with the integrated ones and a
 * careless pattern matches both: "Radeon Graphics" is an APU and "Radeon RX
 * 7900" is not, "Iris Xe" is integrated and "Arc A770" is not.
 */
const INTEGRATED = [
  'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) HD Graphics 520, D3D11)',
  'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (AMD, AMD Radeon RX Vega 8 Graphics, D3D11)',
  'Mali-G78',
  'Adreno (TM) 650',
  'PowerVR Rogue GE8320',
];
const NOT_INTEGRATED = [
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650, D3D11)',
  'ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics, D3D11)',
  'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)',
  'Apple GPU',
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)',
];
for (const raw of INTEGRATED) {
  check(`integrated: ${raw.slice(0, 54)}`, isIntegratedGpu(raw), 'recognised, so a detected High comes down to Medium');
}
for (const raw of NOT_INTEGRATED) {
  check(`discrete:   ${raw.slice(0, 54)}`, !isIntegratedGpu(raw), 'left alone, so it keeps the authored look');
}

/*
 * The city's internal scale still answers with the map's own numbers. This
 * is the function the pipeline and the harness both read, and they disagreed
 * once: the formula said 1.0 where the pipeline rendered 1.34.
 */
{
  const cityHigh = qualityFor('high').city;
  const s = internalScale(1600, 900, cityHigh, null, 1);
  const px = 1600 * 900 * s * s;
  check(
    'city: High at 1600x900 stays inside its own budget',
    px <= cityHigh.pixelBudget * 1.001,
    `scale ${s.toFixed(4)}, ${(px / 1e6).toFixed(2)} Mpx against a ${(cityHigh.pixelBudget / 1e6).toFixed(2)} Mpx budget`,
  );
  const half = internalScale(1600, 900, cityHigh, null, 0.5);
  check(
    'city: the Render scale slider reaches the internal buffer',
    half < s,
    `100 percent gives ${s.toFixed(3)}, 50 percent gives ${half.toFixed(3)}`,
  );
}

const w = Math.max(...rows.map((r) => r[0].length));
console.log('quality-check: the presets, against the machines they name\n');
for (const [name, status, detail] of rows) {
  console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} checks clean`);
process.exit(failed === 0 ? 0 : 1);
