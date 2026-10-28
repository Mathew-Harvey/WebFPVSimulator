/*
 * scale-seams-check.js: what else has to follow the world scale when the
 * quad picker moves it, checked through the real shell.
 *
 * WHY THIS EXISTS. The sweep of 2026-10-28 (the owner: "big bug sweep,
 * root cause and fix all, then write tests cover all issues"). The quad
 * picker made WORLD_SCALE in src/render/frame.js a number that moves
 * between runs, and four things that landed the same day, or before it,
 * read it once and kept it:
 *
 *   props in view  the lens's offset from the craft's centre, taken through
 *                  the seam once at boot (propViewOpts in src/main.js), so a
 *                  five inch in a house had its props baked from a lens
 *                  3.5 times too close in a craft drawn 3.5 times larger
 *   the ghost      built once at boot at the boot's scale, and never again
 *   room crafts    the other pilots, modelled at the five inch's size and
 *                  drawn at it whatever the world scale (roomcraft.js)
 *   the chase rig  watching a pilot, 1.3 world metres back whatever size
 *                  the quad is drawn (watchcam.js)
 *
 * Each check below reads the thing at a world scale of 1 and at 1 / 3.5,
 * a five inch in a house, and asks that it moved with the scale. Each one
 * failed on main at 5d9457d and passes with the fix.
 *
 * Usage: node scripts/scale-seams-check.js. About a minute: it boots the
 * town once in headless Chromium.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerQuadPicker, openPage } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* A five inch in Nick's house: the house is 3.5 times life size. */
const HOUSE = 1 / 3.5;

const sleep = (ms) => new Promise((r) => {
  setTimeout(r, ms);
});

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}${detail ? `: ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}
const near = (a, b, rel = 0.01) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= rel * Math.abs(b);
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : String(x));

/* In the page, synchronously, so no frame runs while the scale is moved:
 * the other pilots' crafts and the chase rig, at a world scale of 1 and of
 * HOUSE, through the modules the shell itself loaded. */
const MODULES = `
  const frame = await import('/src/render/frame.js');
  const { buildRoomCraft } = await import('/src/render/roomcraft.js');
  const { WatchCam } = await import('/src/render/watchcam.js');
  const THREE = await import('three');
  const was = frame.WORLD_SCALE;
  const pose = { px: 1, py: 2, pz: 3, qx: 0, qy: 0, qz: 0, qw: 1, cut: false, spinning: true };
  const pilot = { id: 2, handle: 'Pilot', avatar: null, away: false };
  const crafts = buildRoomCraft({ capacity: 4 });
  const body = crafts.group.getObjectByName('room-craft-bodies');
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const drawnAt = (ws) => {
    frame.setWorldScale(ws);
    crafts.begin();
    crafts.add(2, pose, pilot);
    crafts.end();
    body.getMatrixAt(0, m);
    m.decompose(p, q, s);
    const tags = crafts.group.children.find((c) => c.material && c.material.uniforms && c.material.uniforms.uLift);
    return { scale: s.x, lift: tags.material.uniforms.uLift.value };
  };
  const boomAt = (ws) => {
    frame.setWorldScale(ws);
    const cam = new WatchCam();
    cam.size = frame.simLenToWorld(1);
    cam.chase(pose, 0, null);
    return { back: cam.want.distanceTo(new THREE.Vector3(pose.px, pose.py, pose.pz)) };
  };
  let out;
  try {
    out = {
      roomAt1: drawnAt(1), roomAtHouse: drawnAt(${HOUSE}),
      boomAt1: boomAt(1).back, boomAtHouse: boomAt(${HOUSE}).back,
    };
  } finally {
    frame.setWorldScale(was);
    crafts.dispose();
  }
  return out;
`;

async function main() {
  const page = await openPage({ root: ROOT, width: 640, height: 360, url: '/index.html?map=city&craft=5inch&fly=1' });
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
  /* Frames until the props have been baked for this scale. */
  const glassAfter = async (ws) => {
    await ev(`window.__forceWorldScale(${ws == null ? 'null' : ws}); return 1;`);
    let st = null;
    for (let i = 0; i < 60; i += 1) {
      await sleep(250);
      st = await ev('return window.__propView()');
      if (st && st.props && st.fpvLens && st.glass > 0) {
        await sleep(500);
        return ev('return window.__propView()');
      }
    }
    return st;
  };
  try {
    for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady')); i += 1) {
      await sleep(500);
    }
    let ready = false;
    for (let i = 0; i < 300 && !ready; i += 1) {
      const m = await ev('return window.__map ? window.__map() : null');
      ready = Boolean(m && m.ready && m.id === 'city');
      if (!ready) {
        await sleep(500);
      }
    }
    if (!ready) {
      throw new Error('the town never became ready');
    }
    /* A fly link to a freestyle map asks which quad first: the five inch
     * the town recommends. */
    await answerQuadPicker(page, 60000).catch(() => {});
    await ev("window.__ui.settings.inView = 'both'; return 1;");
    await sleep(2000);

    console.log('props in view');
    const a = await glassAfter(1);
    const b = await glassAfter(HOUSE);
    check('at a world scale of 1 the props are baked from the lens', a && a.props && a.glass > 0, `glass ${f3(a && a.glass)} m`);
    check('at 1 / 3.5 the glass is 3.5 times as far from the centre, as the craft is drawn',
      b && near(b.glass, a.glass * 3.5), `${f3(b && b.glass)} m, want ${f3(a.glass * 3.5)}`);

    console.log('the ghost');
    const g = await ev('return window.__ghost()');
    check('the ghost is drawn at the craft\'s size: 3.5 at 1 / 3.5', near(g.scale, 3.5), `scale ${f3(g.scale)}`);
    await glassAfter(null);
    const g1 = await ev('return window.__ghost()');
    check('and back to 1 with the scale', near(g1.scale, 1), `scale ${f3(g1.scale)}`);

    console.log('the other pilots and the chase rig');
    const r = await ev(MODULES);
    check('a room\'s quads are drawn at the world scale: 1 at 1', near(r.roomAt1.scale, 1), f3(r.roomAt1.scale));
    check('and 3.5 at 1 / 3.5, the size the pilot\'s own five inch is drawn', near(r.roomAtHouse.scale, 3.5), f3(r.roomAtHouse.scale));
    check('and their name tags stand 3.5 times as high over them', near(r.roomAtHouse.lift, r.roomAt1.lift * 3.5),
      `${f3(r.roomAtHouse.lift)} m, want ${f3(r.roomAt1.lift * 3.5)}`);
    check('the chase rig stands 3.5 times as far back at 1 / 3.5', near(r.boomAtHouse, r.boomAt1 * 3.5),
      `${f3(r.boomAtHouse)} m, want ${f3(r.boomAt1 * 3.5)}`);
  } finally {
    await page.close?.();
  }
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
