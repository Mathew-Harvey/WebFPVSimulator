/*
 * gatecards.js: the four pictures on the front door, drawn by the game and
 * by the builder.
 *
 * The first screen asks one question, what to fly, and it asks it with three
 * pictures rather than three words, because the difference between them is a
 * difference between PLACES and a sentence is a poor way to describe a
 * place. See PROGRESS.md for the argument. The fourth card makes something
 * instead of flying it, and its picture is the builder's; see BUILDER below.
 *
 * WHY THEY ARE FILES AND NOT LIVE. The shell already records a short clip of
 * a world for the picker cards, and it records the world the player is
 * actually in, so a world nobody has visited has no clip. The gate is the
 * screen a first visit opens on: whatever it shows has to be there before
 * anything has been flown, on the first frame, with no network. That is a
 * file. Two of them, and they are frames of the REAL renderer through
 * scripts/shots.js, the same harness og.js uses, so they cannot drift into
 * being a drawing of a game that no longer looks like this.
 *
 * REGENERATE, DO NOT EDIT, the same rule as og.js and the icons:
 *
 *     npm run gen:gatecards
 *     npm run gen:gatecards -- builder     only the pictures named
 *
 * Naming them is for a change that is about one card: the other three are
 * not captured, so their files are not rewritten by a change that is not
 * about them, and three simulator boots are not paid for.
 *
 * WHAT EACH FRAME IS, and why those numbers.
 *
 * Race is a lit start gate at eleven metres, left of centre, with the course
 * markers running away to the right and the rest of the gates small behind
 * them. The green is the renderer's own "this is the way through" and it is
 * the one colour in this product that means racing. The track under it is
 * tracks/json/trk-0870b164.json, the 2022 AU Nationals layout, because a
 * real published course is the honest thing to photograph and it is already
 * in the repository.
 *
 * Whoop is the same shot at a fifth of the size: the room's own lit start
 * gate at two and a half metres, left of centre, with the rest of the track
 * running away to the right and the skirting board and the wall behind it,
 * because "indoors" is the whole claim that card makes. The track is
 * tracks/json/micro-livingroom-1.json, which ships with the simulator, and
 * the aircraft has to be the whoop: a micro track is seated per class, so
 * without --airframe the capture would open on the five inch's field.
 *
 * Freestyle is the town from twelve metres up: roofs, wires, sakura and the
 * street running into the haze, with no gate anywhere in it. The camera is
 * high enough to show that it goes on past the frame, which is the whole
 * claim the card is making.
 *
 * The animation clock is parked with __animTo so the train and the level
 * crossing are in the same place on every regeneration. The camera is parked
 * with __setCam for the same reason: the attract camera is always moving, so
 * a capture that just waited would be a different picture every time.
 *
 * Builder is the builder's own 3D preview (src/trackbuilder/view3d.js) on
 * the starter map, Hibari Yard (src/maps/built/starter.js), from a hundred
 * metres out over the south west corner: the bando in the middle, the crane
 * over the crane gap's office on the left, the chimney, the water tower and
 * the pylon behind, the containers on the right, and the named gaps'
 * labels. The subjects sit in the top two thirds of the frame, because the
 * card darkens its bottom half under a gradient. That is the screen an
 * author gets, so it is the honest picture of what the card opens. The
 * starter's ids are fixed, so every seeded asset rolls the same way on every
 * regeneration, and the orbit is set by number rather than dragged.
 *
 * It goes through tests/lib/page.js directly and not through shots.js,
 * because shots.js asks every frame which gate the race wants and records a
 * fault when nothing answers, which is right for the simulator and
 * meaningless on a page with no race in it.
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

import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
/* The factor a micro course is built at, for the whoop card's camera. */
import { MICRO_SCALE } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * 16:10, and 900 across.
 *
 * The card is at most 460 px wide on a desktop and the whole width of a
 * phone, so 900 is a two times asset for the widest case and nothing more.
 * JPEG because these are photographs of a shaded world: the same frame is
 * about 40 kB here and about 300 kB as a PNG, and the front door is the one
 * screen that has to paint before anything else has loaded.
 */
const W = 900;
const H = 560;
const QUALITY = 82;

/* Everything the shell draws over the world. The frame bars and the menu go
 * too, which og.js does not need to do because it only ever captures the
 * title, and this captures the title with a full menu on it. */
const HIDE = [
  '.menu-stage', '.hint', '.lede', '.title-foot', '.bug-chip', '.brand',
  '.brand-best', '.keep-note', '.first-note', '.gate-note', '.beta-note',
  '.wiki-teaser', '.craft-showcase', '.frame-top', '.frame-bot', '.music-dock',
  /*
   * AND THE CARDS THEMSELVES, which was missing and is why this list is
   * being read again. A capture run seeds a track and an aircraft into
   * storage, but the gate reads the URL rather than storage, so it is up:
   * the first regeneration after the title grew cards photographed the
   * cards, three of them, each wearing the picture this run was supposed
   * to be replacing.
   */
  '.gate-cards',
];

const hide = `${JSON.stringify(HIDE)}.forEach((s) => document.querySelectorAll(s)`
  + `.forEach((n) => { n.style.display = 'none'; }));`
  + `'hidden'`;

/* Camera, then the point it looks at. Metres, world frame, Y up. */
const SHOTS = [
  {
    name: 'race',
    args: ['--course=tracks/json/trk-0870b164.json'],
    /* Behind the start gate and a little to its right, so the gate is left
     * of centre and the course leaves the frame rather than stopping in it. */
    cam: [-21.5, 2.4, 36.6, -40, 1.6, 28],
    anim: null,
  },
  {
    name: 'whoop',
    args: [
      '--course=tracks/json/micro-livingroom-1.json',
      '--airframe=whoop65',
    ],
    /* Behind and to the right of the start gate, which stands at z = 0.6 in
     * a track that runs to z = -1.38. High enough to put the floor under the
     * whole of it and low enough that the wall and the skirting are still in
     * frame, which is what says room rather than field.
     *
     * THROUGH MICRO_SCALE, because those are RaceGOW's metres. The card was
     * made on 2026-09-09 and on 2026-09-14 the room and every micro course
     * grew by MICRO_SCALE (91c77eb), so the same six numbers put the lens a
     * metre and a half from the start gate, which filled the frame. Scaled
     * the way src/render/scene.js scales the room, the picture is the one
     * this comment describes whatever the factor becomes.
     *
     * The aim is 0.75 m up rather than 0.35 since the room was dressed on
     * 2026-09-26: the sakura plaster, the rail and the slap pack's banner and
     * posters are what say which room this is now, and the card darkens its
     * bottom half under a gradient, so they belong in the top third. The
     * start gate stays where it was on the card, left of centre. */
    cam: [1.6, 1.15, 2.4, -0.05, 0.75, -0.5].map((v) => v * MICRO_SCALE),
    anim: null,
  },
  {
    name: 'freestyle',
    args: ['--url=/index.html?map=city'],
    /* Over the roofs on the east side of the crossing, looking west down the
     * street. High enough for the town to read as a town. */
    cam: [18, 12, 40, -6, 3, 6],
    /* The step the collider reference in src/maps/city uses for its booms
     * down measurement, so the crossing in the middle distance is closed and
     * the train is where it is every time this is regenerated. */
    anim: 14125,
  },
];

/*
 * THE BUILDER'S FRAME. The orbit is the preview's own: a point on the plot
 * in document metres (x east, y north, from the south west corner), how far
 * out, which way round (radians counter clockwise from east, in the
 * preview's frame) and how high (radians above the ground). The page is
 * opened on the map canvas by ?mode=freestyle, which is also what keeps the
 * builder's chooser from opening over the thing being photographed.
 */
const BUILDER = {
  name: 'builder',
  url: '/src/trackbuilder/index.html?mode=freestyle',
  orbit: { x: 80, y: 82, radius: 104, theta: 2.2, phi: 0.5 },
};

/* The builder's chrome, which is the whole page except the drawing. */
const BUILDER_HIDE = ['#tb-topbar', '#tb-keep', '#tb-palette', '#tb-side', '#tb-status', '#tb-toast', '#tb-modal'];

async function captureBuilder(outDir) {
  const page = await openPage({ root, width: W, height: H, url: BUILDER.url });
  try {
    await page.until('!!window.trackBuilder', 60000);
    await page.evaluate(`import('/src/maps/built/starter.js').then((m) => {
      window.trackBuilder.loadDocument(m.starterMap(), '');
      return true;
    })`);
    /* The stage fills the window, square cornered, so the frame is the
     * drawing and nothing else. */
    await page.evaluate(`(() => {
      ${JSON.stringify(BUILDER_HIDE)}.forEach((s) => {
        const n = document.querySelector(s);
        if (n) { n.style.display = 'none'; }
      });
      document.getElementById('tb-main').style.padding = '0';
      document.getElementById('tb-stage').style.borderRadius = '0';
      document.querySelectorAll('#tb-stage canvas').forEach((c) => { c.style.borderRadius = '0'; });
      window.trackBuilder.view2d.resize();
      window.trackBuilder.setMode('3d');
      return true;
    })()`);
    /* Three.js and the map's kit arrive after the button, and the first
     * frame is drawn once both have. */
    await page.until(`(() => {
      const v = window.trackBuilder.view3d;
      return !!v.renderer && !!v.fs && !v.fsPending && !v.dirty;
    })()`, 90000);
    const o = BUILDER.orbit;
    await page.evaluate(`(() => {
      const v = window.trackBuilder.view3d;
      v.orbit.target = { x: ${o.x}, y: 0, z: ${-o.y} };
      v.orbit.radius = ${o.radius};
      v.orbit.theta = ${o.theta};
      v.orbit.phi = ${o.phi};
      window.trackBuilder.requestDraw();
      return true;
    })()`);
    /* Drawn on demand rather than every frame, so this waits for the view
     * to settle and then asks for one more frame and lets two go by. */
    await page.until('!window.trackBuilder.view3d.dirty && !window.trackBuilder.drawQueued', 30000);
    await page.sleep(1500);
    await page.evaluate(`new Promise((done) => {
      window.trackBuilder.requestDraw();
      requestAnimationFrame(() => requestAnimationFrame(() => done(true)));
    })`);
    const { data } = await page.cdp.send('Page.captureScreenshot',
      { format: 'jpeg', quality: QUALITY }, page.sessionId);
    const path = join(outDir, `${BUILDER.name}.jpg`);
    await writeFile(path, Buffer.from(data, 'base64'));
    console.log(`shot ${path}`);
    /* A thrown error or a console.error means the frame may be of a page
     * that half built. A refused request does not: the page's visit ping
     * goes to a board that a local server does not run. */
    const faults = page.errors.filter((e) => !e.startsWith('network:'));
    if (faults.length) {
      throw new Error(`the builder logged ${faults.length} error(s): ${faults.join(' | ')}`);
    }
  } finally {
    await page.close();
  }
}

/* Which pictures to make: the names given, or all four. */
const ALL = [...SHOTS.map((s) => s.name), BUILDER.name];
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const unknown = asked.filter((n) => !ALL.includes(n));
if (unknown.length) {
  throw new Error(`no gate picture called ${unknown.join(', ')}; there are ${ALL.join(', ')}`);
}
const wanted = asked.length ? asked : ALL;

const out = await mkdtemp(join(tmpdir(), 'webfpv-gatecards-'));
try {
  for (const shot of SHOTS.filter((s) => wanted.includes(s.name))) {
    const steps = [
      'until:!!window.__boot && window.__boot().frames > 2',
      `eval:(() => { ${hide} })()`,
      ...(shot.anim == null ? [] : [`eval:(window.__animTo(${shot.anim}), 'anim')`]),
      `eval:(window.__setCam(${shot.cam.join(',')}),`
        + ' window.__gateFrame = window.__boot().frames, \'camera\')',
      /* Frames, not milliseconds: __setCam lands on the next animation frame
       * and a wall clock wait sometimes captures the one before it. */
      'until:window.__boot().frames > window.__gateFrame + 4',
      `shot:${shot.name}`,
    ];
    const run = spawnSync('node', [
      join(root, 'scripts/shots.js'),
      `--out=${out}`,
      `--w=${W}`,
      `--h=${H}`,
      `--jpeg=${QUALITY}`,
      /* Headless Chromium rasterises on the CPU, so boot would otherwise
       * detect a slow machine and drop the preset, and the card would come
       * out at a different quality depending on who regenerated it. */
      '--graphics=high',
      ...shot.args,
      ...steps,
    ], { cwd: root, stdio: 'inherit' });

    if (run.status !== 0) {
      throw new Error(`shots.js exited ${run.status} on ${shot.name}`);
    }
  }
  if (wanted.includes(BUILDER.name)) {
    await captureBuilder(out);
  }

  /* Copied only once every capture has succeeded, so a run that fails part
   * way leaves the shipped pictures as they were rather than half new. */
  const dir = join(root, 'assets', 'gate');
  await mkdir(dir, { recursive: true });
  for (const name of wanted) {
    await copyFile(join(out, `${name}.jpg`), join(dir, `${name}.jpg`));
    console.log(`${name}.jpg -> ${join(dir, `${name}.jpg`)}`);
  }
} finally {
  await rm(out, { recursive: true, force: true });
}
