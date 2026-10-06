/*
 * town-patron-check.js: are the town's patron spots on real walls?
 *
 * WHY IT IS A BROWSER CHECK. A spot in PATRON_SPOTS (src/maps/city/places/
 * index.js) is a place on a wall, and what a wall is in this town is not in
 * the source. The first version of the spots was measured off the constants in
 * works.js and pool.js, and those are centrelines: the office gable is 0.24 m
 * thick about the x the code names, so the paint it asked for was inside the
 * wall, and the checks written against the same constants passed. So this
 * loads the real city in headless Chromium and asks the world itself, with the
 * queries the plant and the find use.
 *
 * WHAT IT ASKS, of every spot, on the finished town:
 *
 *   geometry  Over the whole panel and MARGIN beyond it, on a grid of GRID
 *             metres and not just at the corners, the paint's plane has solid
 *             BEHIND metres behind it and open air FRONT metres in front of
 *             it, by window.__nearSolid, which is the freestyle recogniser's
 *             own gap query. The 0.3 and the 0.1 are the numbers the first
 *             version of this file wrote, and they are kept.
 *   drawn     The same panel against what is DRAWN, which a solid cannot say:
 *             every triangle in the scene that the panel could be seen
 *             through, and the nearest one under each sample must stand
 *             within DRAWN_TOL of the collider face. A band or a board that
 *             stands proud of the wall covers the paint, and a wall drawn
 *             behind its collider leaves the paint in the air. The paint
 *             itself, a mark the town has already painted on the face, is not
 *             counted: it stands proud by design.
 *   seen      From a fan of eye positions in front of the sign, those in open
 *             air (EYE_FREE clear of every solid, and above the ground) from
 *             which the real seesMark answers yes number at least MIN_EYES.
 *   apart     At least PARTNER_SEP from the STF mark, from every partner's
 *             mark on the live map, and from every other patron's.
 *   findable  Every mark the town builds says findable: false, and
 *             shouldFindMark agrees; a partner's mark still says true.
 *   fit       A patron of any shape lands inside the panel: signs of aspect
 *             1.2 to 8 are as wide as the panel or as tall as it, never over.
 *   count     There is a spot for every patron a map is allowed to show.
 *   shape     Every spot is three finite numbers and a way the wall looks.
 *   built     The town paints a mark for each patron it has a spot for, which
 *             is what stops the three checks on marks passing on none.
 *
 * It builds the marks with the town's own buildPatronMarks, handed a roster of
 * its own because the real one is empty until a supporter says yes.
 *
 * --selftest plants one fault at a time, each the thing one of these exists to
 * catch, and fails unless the check it is aimed at fails and the baseline was
 * clean first. A detector that has never been seen to fail is a comment.
 *
 * Usage: node scripts/town-patron-check.js [--selftest]
 *   Set NODE_USE_ENV_PROXY=1 behind an outbound proxy, so the page's one CDN
 *   fetch (Three.js, cached after the first) can reach out.
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

import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const selftest = process.argv.includes('--selftest');

/* Solid behind the paint and air in front of it, in metres from the paint's
 * plane. Both are the first version's. Never loosen them to make a spot pass:
 * move the spot. */
const BEHIND = 0.3;
const FRONT = 0.1;
/* How far past the panel the same must hold, so a sign is on the face with
 * room to spare and not on its edge, and the grid it is asked on. */
const MARGIN = 0.1;
const GRID = 0.1;
/* The drawn surface is asked on a coarser grid, and may stand this far off the
 * collider face either way. The paint itself stands `off` (1.5 cm) in front of
 * the face, so a centimetre is as proud as the drawing may be and still leave
 * the paint half a centimetre clear. The pool hall's bands are 2 cm proud, and
 * cover it. */
const DRAWN_GRID = 0.2;
const DRAWN_TOL = 0.01;
/* The eyes: how far each is from every solid, how far over the ground, and how
 * many of the fan must see the sign. One lucky pinhole is not visible. */
const EYE_FREE = 0.5;
const EYE_ABOVE = 0.3;
const MIN_EYES = 3;
const FAN = { dist: [2, 3, 4, 5, 6, 7, 8], lateral: [-3, -1.5, 0, 1.5, 3], height: [-0.5, 0, 1.0] };
/* Sign aspects the fit is asked at: a squarish badge to a thin banner. */
const ASPECTS = [1.2, 1.5, 2, 2.4, 3, 4.5, 6, 8];

/* A roster of three text only patrons, so no artwork is fetched. */
const TEST_PATRONS = [
  { slug: 'check-one', name: 'Check Patron One', short: 'ONE', mark: { field: '#19171e' } },
  { slug: 'check-two', name: 'Check Patron Two', short: 'PATRON TWO', mark: { field: '#f3ead4' } },
  { slug: 'check-three', name: 'Check Patron Three', short: 'A LONGER NAME HERE', mark: { field: '#3a4a5c' } },
];

let page = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (body) => page.evaluate(`(async()=>{${body}})()`);

/*
 * The queries that have to run in the page, as one function so they are code
 * and not a string. It is stringified and evaluated there, so it may touch
 * nothing outside itself. Each takes plain numbers and answers plain numbers,
 * and a call carries a whole panel's points, because a round trip over the
 * DevTools socket costs more than the question.
 */
function toolbox() {
  const T = window.__three;
  const scene = window.__mapScene();

  /* Is each point inside a solid? gapAt with no reach answers 0 for a point in
   * one and Infinity for anything else. */
  function inside(points) {
    return points.map(([x, y, z]) => window.__nearSolid(x, y, z, 0) === 0);
  }

  /*
   * How far the DRAWN surface stands off the collider face at each sample, in
   * metres along the way the wall looks: 0 where the drawing and the solid
   * agree, positive where something is drawn in front of the face, negative
   * where the wall is drawn behind it, null where nothing is drawn at all. The
   * wall looks along z, as PATRON_SPOTS says. The samples are straight along
   * the wall's normal, which is the view that matters: a pilot square on.
   *
   * Every triangle the panel could be seen through is gathered once, in world
   * space, and each sample asks which of them its line goes through. It does
   * not use THREE's raycaster: the baked town is a few dozen meshes of fifty
   * thousand triangles each, and a ray through all of them costs fifty
   * milliseconds, so a panel took a minute.
   */
  function drawnOffsets(face, n, samples, uLo, uHi, vLo, vHi) {
    const zLo = Math.min(face - 0.3, face + n * 1.8);
    const zHi = Math.max(face + 0.3, face + n * 1.8);
    const tris = [];
    const a = new T.Vector3();
    const b = new T.Vector3();
    const c = new T.Vector3();
    const world = new T.Matrix4();
    const inst = new T.Matrix4();
    const box = new T.Box3();
    const want = new T.Box3(new T.Vector3(uLo, vLo, zLo), new T.Vector3(uHi, vHi, zHi));
    const take = (geo, m) => {
      const pos = geo.attributes.position;
      const idx = geo.index;
      const count = idx ? idx.count : pos.count;
      for (let i = 0; i < count; i += 3) {
        a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
        b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m);
        c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m);
        if (Math.max(a.x, b.x, c.x) < uLo || Math.min(a.x, b.x, c.x) > uHi) continue;
        if (Math.max(a.y, b.y, c.y) < vLo || Math.min(a.y, b.y, c.y) > vHi) continue;
        if (Math.max(a.z, b.z, c.z) < zLo || Math.min(a.z, b.z, c.z) > zHi) continue;
        tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    };
    scene.traverse((o) => {
      if (!o.isMesh) return;
      /* A sign's own paint is the thing the wall is being asked to carry, and
       * it stands `off` (1.5 cm) in front of the face on purpose, so counting
       * it would read every live patron as a band proud of its wall. The
       * roster was empty when this was written, so no mark was ever in the
       * scene to be counted; the first real patron was the first. Anything
       * else drawn in front of the paint is still counted. */
      if (o.name === 'partnerMarkTrim') return;
      const mat = o.material;
      if (mat && (mat.visible === false || mat.colorWrite === false)) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      o.updateWorldMatrix(true, false);
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i += 1) {
          o.getMatrixAt(i, inst);
          world.multiplyMatrices(o.matrixWorld, inst);
          box.copy(o.geometry.boundingBox).applyMatrix4(world);
          if (box.intersectsBox(want)) take(o.geometry, world);
        }
      } else {
        box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        if (box.intersectsBox(want)) take(o.geometry, o.matrixWorld);
      }
    });
    const nz = n * face;
    return samples.map(([u, v]) => {
      let best = -Infinity;
      for (let k = 0; k < tris.length; k += 9) {
        const ax = tris[k]; const ay = tris[k + 1];
        const bx = tris[k + 3]; const by = tris[k + 4];
        const cx = tris[k + 6]; const cy = tris[k + 7];
        const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        /* Edge on to the line: a floor or a ceiling, which no sample is on. */
        if (Math.abs(den) < 1e-9) continue;
        const l1 = ((by - cy) * (u - cx) + (cx - bx) * (v - cy)) / den;
        const l2 = ((cy - ay) * (u - cx) + (ax - cx) * (v - cy)) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const z = l1 * tris[k + 2] + l2 * tris[k + 5] + l3 * tris[k + 8];
        const t = n * z;
        if (t > best) best = t;
      }
      return best === -Infinity ? null : best - nz;
    });
  }

  /*
   * Which of these eyes see the mark, by the real seesMark. An eye counts only
   * if a craft could be there: EYE_FREE clear of every solid and EYE_ABOVE over
   * the ground. `blockAll` plants a solid across every line of sight, for the
   * self test.
   */
  async function seenFrom(mark, eyes, free, above, blockAll) {
    const egg = await import('/src/game/egg.js');
    const colliders = {
      segmentCrossesAny: (...q) => blockAll || window.__segmentCrossesAny(...q),
      gapAt: (...q) => window.__nearSolid(...q),
    };
    let open = 0;
    const seen = [];
    for (const [x, y, z] of eyes) {
      if (window.__nearSolid(x, y, z, free) !== Infinity) continue;
      if (y - window.__surface(x, z, y, y) < above) continue;
      open += 1;
      const forward = { x: mark.p[0] - x, y: mark.p[1] - y, z: mark.p[2] - z };
      if (egg.seesMark({ x, y, z }, forward, mark, colliders)) seen.push([x, y, z]);
    }
    return { tried: eyes.length, open, seen };
  }

  return { inside, drawnOffsets, seenFrom };
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

async function openCity() {
  page = await openPage({ root, width: 1920, height: 1080, url: '/index.html' });
  await page.until('window.__shellReady === true', 120000);
  await ev("const ui = window.__ui; ui.settings.map = 'city'; ui.settings.graphics = 'low'; "
    + "ui.onAction('fly', ui.settings); return 1;");
  await page.until("(() => { const m = window.__map && window.__map(); "
    + "return Boolean(m && m.ready && m.id === 'city'); })()", 130000);
  /* Ready is the world built. The colliders are the thing asked, so wait for
   * the set to stop growing, which is a fact and not a number of seconds. */
  let last = -1;
  for (let stable = 0; stable < 3;) {
    const count = await ev('return window.__colliders().count');
    stable = count === last && count > 0 ? stable + 1 : 0;
    last = count;
    await sleep(500);
  }
  await ev(`window.__ptc = (${toolbox.toString()})(); return 1;`);
}

/* What the live town and the real code say, read once. */
async function readWorld() {
  return ev(`
    const places = await import('/src/maps/city/places/index.js');
    const built = await import('/src/maps/built/egg.js');
    const patrons = await import('/src/partners/patrons.js');
    const find = await import('/src/game/egg.js');
    const roster = ${JSON.stringify(TEST_PATRONS)};
    const marks = places.buildPatronMarks({ add: (o) => o }, roster);
    const live = window.__marks().marks;
    return {
      spots: places.PATRON_SPOTS.map((s) => ({ ...s })),
      panel: { ...places.PATRON_PANEL },
      sep: built.PARTNER_SEP,
      maxPerMap: patrons.PATRON_MAX_PER_MAP,
      marks: marks.map((m) => JSON.parse(JSON.stringify(m))),
      stf: window.__egg().egg,
      others: live.filter((m) => m.findable !== false).map((m) => ({
        slug: m.slug, p: m.p, findable: find.shouldFindMark(m),
      })),
      livePatrons: live.filter((m) => m.findable === false).length,
    };`);
}

/* The real fit rule, asked for a sign of each aspect: a patron whose logo has
 * the aspect that makes the whole sign this shape (signAspect's own sum). */
function realMakeMarks() {
  return (spot, aspects) => ev(`
    const places = await import('/src/maps/city/places/index.js');
    const { LOGO_SHARE } = await import('/src/art/partnermark.js');
    return ${JSON.stringify(aspects)}.map((a) => places.patronMark(${JSON.stringify(spot)},
      { slug: 'fit', logo: { aspect: (a - (1 - LOGO_SHARE)) / LOGO_SHARE } }));`);
}

/* ------------------------------------------------------------------ */
/* The checks                                                          */
/* ------------------------------------------------------------------ */

const fixed = (v) => (Number.isFinite(v) ? v.toFixed(3) : String(v));

/* Where the sign's paint stands: the face, and `off` in front of it. The mark
 * the town builds says, so a spot is asked where it would really be painted. */
const paintZ = (spot, off) => spot.face + spot.n * off;

/* The whole panel and its margin, on a grid, as [u, v] across and up. */
function gridOf(spot, panel, step, margin) {
  const u0 = spot.x - panel.w / 2 - margin;
  const u1 = spot.x + panel.w / 2 + margin;
  const v0 = spot.y - panel.h / 2 - margin;
  const v1 = spot.y + panel.h / 2 + margin;
  const nu = Math.ceil((u1 - u0) / step);
  const nv = Math.ceil((v1 - v0) / step);
  const out = [];
  for (let j = 0; j <= nv; j += 1) {
    for (let i = 0; i <= nu; i += 1) {
      out.push([u0 + ((u1 - u0) * i) / nu, v0 + ((v1 - v0) * j) / nv]);
    }
  }
  return { out, u0, u1, v0, v1 };
}

async function geometry(spot, panel, off) {
  const g = gridOf(spot, panel, GRID, MARGIN);
  const z = paintZ(spot, off);
  const behind = await ev(`return window.__ptc.inside(${JSON.stringify(g.out.map(([u, v]) => [u, v, z - spot.n * BEHIND]))})`);
  const front = await ev(`return window.__ptc.inside(${JSON.stringify(g.out.map(([u, v]) => [u, v, z + spot.n * FRONT]))})`);
  let air = 0;
  let solid = 0;
  let first = null;
  for (let k = 0; k < g.out.length; k += 1) {
    if (!behind[k]) {
      air += 1;
      first = first ?? `no solid ${BEHIND} m behind (x ${fixed(g.out[k][0])}, y ${fixed(g.out[k][1])})`;
    }
    if (front[k]) {
      solid += 1;
      first = first ?? `solid ${FRONT} m in front (x ${fixed(g.out[k][0])}, y ${fixed(g.out[k][1])})`;
    }
  }
  return {
    ok: air === 0 && solid === 0,
    detail: air === 0 && solid === 0
      ? `${g.out.length} points, solid ${BEHIND} m behind and air ${FRONT} m in front at every one`
      : `${air} of ${g.out.length} points have no solid behind, ${solid} have solid in front; first: ${first}`,
  };
}

async function drawn(spot, panel) {
  const g = gridOf(spot, panel, DRAWN_GRID, MARGIN);
  const h = await ev(`return window.__ptc.drawnOffsets(${spot.face}, ${spot.n},
    ${JSON.stringify(g.out)}, ${g.u0 - 0.05}, ${g.u1 + 0.05}, ${g.v0 - 0.05}, ${g.v1 + 0.05})`);
  let worst = 0;
  let bad = 0;
  let first = null;
  for (let k = 0; k < h.length; k += 1) {
    const off = h[k];
    if (off === null || Math.abs(off) > DRAWN_TOL) {
      bad += 1;
      first = first ?? (off === null
        ? `nothing drawn at (x ${fixed(g.out[k][0])}, y ${fixed(g.out[k][1])})`
        : `drawn ${fixed(off)} m off the face at (x ${fixed(g.out[k][0])}, y ${fixed(g.out[k][1])})`);
    }
    if (off !== null && Math.abs(off) > Math.abs(worst)) {
      worst = off;
    }
  }
  return {
    ok: bad === 0,
    detail: bad === 0
      ? `${h.length} samples, the drawn surface within ${DRAWN_TOL * 100} cm of the collider face at every one (worst ${fixed(worst)} m)`
      : `${bad} of ${h.length} samples are off the face by more than ${DRAWN_TOL * 100} cm; first: ${first}`,
  };
}

async function seen(mark, blockAll) {
  const eyes = [];
  const [px, py, pz] = mark.p;
  for (const d of FAN.dist) {
    for (const lat of FAN.lateral) {
      for (const dy of FAN.height) {
        eyes.push([px + lat, py + dy, pz + mark.n[2] * d]);
      }
    }
  }
  const r = await ev(`return window.__ptc.seenFrom(${JSON.stringify(mark)}, ${JSON.stringify(eyes)},
    ${EYE_FREE}, ${EYE_ABOVE}, ${blockAll ? 'true' : 'false'})`);
  return {
    ok: r.seen.length >= MIN_EYES,
    detail: `${r.seen.length} of ${r.open} eyes in open air see it (${r.tried} tried, ${MIN_EYES} needed)`,
  };
}

const dist3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/*
 * Run every check on a scenario and return the results. `sc` is the world as
 * it is, or with one fault planted in it. `only` limits it to some of the
 * checks, so a planted fault does not pay for the ones it cannot touch.
 */
async function runChecks(sc, only = null) {
  const out = [];
  const want = (id) => !only || only.includes(id);
  const add = (id, label, r) => out.push({ id, label, ok: r.ok, detail: r.detail });
  const name = (i) => `spot ${i + 1}`;

  if (want('shape')) {
    sc.spots.forEach((s, i) => {
      const finite = ['x', 'y', 'face'].every((k) => Number.isFinite(s[k]));
      add('shape', name(i), {
        ok: finite && (s.n === 1 || s.n === -1),
        detail: finite && (s.n === 1 || s.n === -1)
          ? `x ${s.x}, y ${s.y}, face z ${s.face}, looks ${s.n < 0 ? '-z' : '+z'}`
          : `not three finite numbers and a facing of 1 or -1: ${JSON.stringify(s)}`,
      });
    });
  }
  if (want('built')) {
    const wanted = Math.min(sc.roster, sc.spots.length);
    add('built', 'the town paints a mark for each patron it has a spot for', {
      ok: sc.marks.length === wanted,
      detail: `${sc.marks.length} marks built for a roster of ${sc.roster} and ${sc.spots.length} spots`,
    });
  }
  if (want('count')) {
    add('count', 'spots for every patron a map shows', {
      ok: sc.spots.length >= sc.maxPerMap,
      detail: `${sc.spots.length} spots, PATRON_MAX_PER_MAP is ${sc.maxPerMap}`,
    });
  }
  if (want('geometry')) {
    for (let i = 0; i < sc.spots.length; i += 1) {
      add('geometry', name(i), await geometry(sc.spots[i], sc.panel, sc.off));
    }
  }
  if (want('drawn')) {
    for (let i = 0; i < sc.spots.length; i += 1) {
      add('drawn', name(i), await drawn(sc.spots[i], sc.panel));
    }
  }
  if (want('seen')) {
    for (let i = 0; i < sc.marks.length; i += 1) {
      add('seen', `mark ${i + 1} (${sc.marks[i].slug})`, await seen(sc.marks[i], sc.blockAll));
    }
  }
  if (want('apart')) {
    /* Every patron mark against the STF mark, every live partner's mark, and
     * every other patron mark: pairs once each. */
    const things = [
      ...(sc.stf ? [{ who: 'the STF mark', p: sc.stf.p }] : []),
      ...sc.others.map((o) => ({ who: o.slug, p: o.p })),
    ];
    sc.marks.forEach((m, i) => {
      const near = [];
      for (const t of things) {
        const d = dist3(m.p, t.p);
        if (d < sc.sep) near.push(`${t.who} ${fixed(d)} m`);
      }
      for (let j = 0; j < sc.marks.length; j += 1) {
        const d = j === i ? Infinity : dist3(m.p, sc.marks[j].p);
        if (d < sc.sep) near.push(`${sc.marks[j].slug} ${fixed(d)} m`);
      }
      const nearest = Math.min(...things.map((t) => dist3(m.p, t.p)),
        ...sc.marks.filter((_, j) => j !== i).map((o) => dist3(m.p, o.p)));
      add('apart', `mark ${i + 1} (${m.slug})`, {
        ok: near.length === 0,
        detail: near.length === 0
          ? `nearest other mark ${fixed(nearest)} m, at least ${sc.sep} m wanted`
          : `closer than ${sc.sep} m to ${near.join(', ')}`,
      });
    });
  }
  if (want('findable')) {
    const verdicts = await ev(`
      const find = await import('/src/game/egg.js');
      return ${JSON.stringify(sc.marks)}.map((m) => find.shouldFindMark(m));`);
    sc.marks.forEach((m, i) => {
      add('findable', `mark ${i + 1} (${m.slug})`, {
        ok: m.findable === false && verdicts[i] === false,
        detail: `findable ${m.findable}, shouldFindMark ${verdicts[i]}`,
      });
    });
    const partner = sc.others.find((o) => o.slug);
    if (partner) {
      add('findable', `a partner (${partner.slug}) is still found`, {
        ok: partner.findable === true,
        detail: `shouldFindMark ${partner.findable}`,
      });
    }
  }
  if (want('fit')) {
    for (let i = 0; i < sc.spots.length; i += 1) {
      const marks = await sc.makeMarks(sc.spots[i], ASPECTS);
      const bad = [];
      marks.forEach((m, k) => {
        const inside = m.w <= sc.panel.w + 1e-9 && m.h <= sc.panel.h + 1e-9;
        const filled = Math.abs(m.w - sc.panel.w) < 1e-9 || Math.abs(m.h - sc.panel.h) < 1e-9;
        const shaped = Math.abs(m.w / m.h - ASPECTS[k]) < 1e-6;
        const centred = Math.abs(m.p[0] - sc.spots[i].x) < 1e-9 && Math.abs(m.p[1] - sc.spots[i].y) < 1e-9;
        if (!(inside && filled && shaped && centred)) {
          bad.push(`aspect ${ASPECTS[k]} came out ${fixed(m.w)} by ${fixed(m.h)}`);
        }
      });
      add('fit', name(i), {
        ok: bad.length === 0,
        detail: bad.length === 0
          ? `${ASPECTS.length} aspects, each inside ${sc.panel.w} by ${sc.panel.h} m and filling one side`
          : `${bad.length} of ${ASPECTS.length} are wrong: ${bad.slice(0, 2).join('; ')}`,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The faults                                                          */
/* ------------------------------------------------------------------ */

/*
 * One fault each, and each is what a check exists for. `expect` is the check
 * that must fail. `alsoPass` is a check that must still pass, for a fault that
 * only the check named can see: it is what shows `drawn` is not a copy of
 * `geometry`.
 */
const FAULTS = [
  {
    name: 'paint standing 1 m out in the air in front of the wall',
    expect: 'geometry',
    only: ['geometry'],
    plant: (sc) => ({ ...sc, spots: sc.spots.map((s, i) => (i === 0 ? { ...s, face: s.face + s.n } : s)) }),
  },
  {
    name: 'paint 0.1 m inside a 0.3 m wall, the first version\'s mistake',
    expect: 'geometry',
    only: ['geometry'],
    plant: (sc) => ({ ...sc, spots: sc.spots.map((s, i) => (i === 0 ? { ...s, face: s.face - s.n * 0.1 } : s)) }),
  },
  {
    name: 'panel slid 4 m along onto the gap in the wall',
    expect: 'geometry',
    only: ['geometry'],
    plant: (sc) => ({ ...sc, spots: sc.spots.map((s, i) => (i === 0 ? { ...s, x: s.x + 4 } : s)) }),
  },
  {
    name: 'panel lifted over the top of its wall',
    expect: 'geometry',
    only: ['geometry'],
    plant: (sc) => ({ ...sc, spots: sc.spots.map((s, i) => (i === 0 ? { ...s, y: s.y + 1.5 } : s)) }),
  },
  {
    name: 'a panel 12 m wide on a wall that is not',
    expect: 'geometry',
    only: ['geometry'],
    plant: (sc) => ({ ...sc, panel: { ...sc.panel, w: 12 } }),
  },
  {
    name: 'panel lowered across the plinth band, which stands 2 cm proud of a wall that is solid all the way',
    expect: 'drawn',
    alsoPass: 'geometry',
    only: ['geometry', 'drawn'],
    plant: (sc) => ({ ...sc, spots: sc.spots.map((s, i) => (i === 1 ? { ...s, y: 1.5 } : s)) }),
  },
  {
    name: 'a solid across every line of sight to every sign',
    expect: 'seen',
    only: ['seen'],
    plant: (sc) => ({ ...sc, blockAll: true }),
  },
  {
    name: 'a partner\'s mark added 4 m from the first patron',
    expect: 'apart',
    only: ['apart'],
    plant: (sc) => ({
      ...sc,
      others: [...sc.others, { slug: 'planted-partner', p: [sc.marks[0].p[0] + 4, sc.marks[0].p[1], sc.marks[0].p[2]], findable: true }],
    }),
  },
  {
    name: 'two patrons on one spot',
    expect: 'apart',
    only: ['apart'],
    plant: (sc) => ({ ...sc, marks: sc.marks.map((m, i) => (i === 1 ? { ...m, p: [...sc.marks[0].p] } : m)) }),
  },
  {
    name: 'a patron\'s mark that can be found',
    expect: 'findable',
    only: ['findable'],
    plant: (sc) => ({ ...sc, marks: sc.marks.map((m, i) => (i === 0 ? { ...m, findable: undefined } : m)) }),
  },
  {
    name: 'a sign as wide as the panel whatever its height, the first version\'s rule',
    expect: 'fit',
    only: ['fit'],
    plant: (sc) => ({
      ...sc,
      makeMarks: async (spot, aspects) => aspects.map((a) => ({
        w: sc.panel.w, h: sc.panel.w / a, p: [spot.x, spot.y, spot.face],
      })),
    }),
  },
  {
    name: 'a town that paints no marks for the roster it is handed',
    expect: 'built',
    only: ['built'],
    plant: (sc) => ({ ...sc, marks: [] }),
  },
  {
    name: 'one spot short of PATRON_MAX_PER_MAP',
    expect: 'count',
    only: ['count'],
    plant: (sc) => ({ ...sc, spots: sc.spots.slice(0, sc.maxPerMap - 1) }),
  },
  {
    name: 'a spot with no face',
    expect: 'shape',
    only: ['shape'],
    plant: (sc) => ({ ...sc, spots: sc.spots.map((s, i) => (i === 0 ? { ...s, face: NaN } : s)) }),
  },
];

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;

function report(results) {
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(8)} ${r.label}: ${r.detail}`);
    if (r.ok) {
      passed += 1;
    } else {
      failed += 1;
    }
  }
}

async function main() {
  console.log('town-patron-check: the town\'s patron spots against the live city\n');
  await openCity();
  const w = await readWorld();
  console.log(`  loaded the city: ${w.spots.length} spots, a panel of ${w.panel.w} by ${w.panel.h} m, `
    + `${w.marks.length} marks built for the check's roster, ${w.livePatrons} patron marks live on the map\n`);
  const off = w.marks.length ? Math.abs(w.marks[0].p[2] - w.spots[0].face) : 0.015;
  const sc = {
    spots: w.spots,
    panel: w.panel,
    off,
    sep: w.sep,
    maxPerMap: w.maxPerMap,
    roster: TEST_PATRONS.length,
    marks: w.marks,
    stf: w.stf,
    others: w.others,
    blockAll: false,
    makeMarks: realMakeMarks(),
  };

  const base = await runChecks(sc);
  report(base);
  const baseFailed = base.filter((r) => !r.ok).length;
  console.log(`\ntown-patron-check: ${passed} passed, ${failed} failed`);

  if (!selftest) {
    return baseFailed === 0;
  }

  console.log('\nself test: one planted fault at a time, each aimed at one check\n');
  let caught = 0;
  const aimed = new Set();
  for (const f of FAULTS) {
    const res = await runChecks(f.plant(sc), f.only);
    const hit = res.some((r) => r.id === f.expect && !r.ok);
    const kept = !f.alsoPass || res.filter((r) => r.id === f.alsoPass).every((r) => r.ok);
    const ok = hit && kept;
    aimed.add(f.expect);
    caught += ok ? 1 : 0;
    const why = res.filter((r) => r.id === f.expect && !r.ok)[0];
    console.log(`  ${ok ? 'CAUGHT' : 'MISSED'}  ${f.expect.padEnd(8)} ${f.name}`
      + (ok ? `: ${why.detail}` : kept ? ': the check did not fail' : `: and ${f.alsoPass} failed too, so it is not the fault alone`));
  }
  const checks = ['shape', 'built', 'count', 'geometry', 'drawn', 'seen', 'apart', 'findable', 'fit'];
  const unaimed = checks.filter((c) => !aimed.has(c));
  console.log(`\nself test: ${caught} of ${FAULTS.length} planted faults caught, `
    + `${baseFailed === 0 ? 'baseline clean' : `BASELINE NOT CLEAN (${baseFailed} failed)`}`
    + `${unaimed.length ? `, NO FAULT AIMED AT ${unaimed.join(', ')}` : ''}`);
  return baseFailed === 0 && caught === FAULTS.length && unaimed.length === 0;
}

/* The browser is closed on every path out, and the exit code is set rather
 * than exit() called, because an exit inside the try never reaches the finally
 * and leaves a Chromium running on a software rasteriser. */
let good = false;
try {
  good = await main();
} catch (e) {
  console.error(`town-patron-check: ${e.stack || e.message}`);
} finally {
  if (page) {
    const profile = (page.proc.spawnargs.find((a) => a.startsWith('--user-data-dir=')) || '')
      .slice('--user-data-dir='.length);
    const exited = new Promise((r) => page.proc.once('exit', r));
    await page.close().catch(() => {});
    await Promise.race([exited, sleep(15000)]);
    if (profile.includes('sim-page-')) {
      await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    }
  }
}
process.exitCode = good ? 0 : 1;
