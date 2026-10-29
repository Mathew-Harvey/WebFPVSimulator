/*
 * index.js: 90%er goat herding, a map and a mini game. The owner's ask of
 * 28 October 2026:
 *
 *   "Make a new 90%er map, use everyones logos. make it heads house and
 *   his entire neighbourhood, make it up. Each persons logo should go on
 *   the side of a goat, that is roaming around the neighbourhood. the map
 *   is a mini game - your goal is to herd your goat into heads' garage,
 *   which is open, once the goat has run in the garage it stays there
 *   until the map is reset."
 *
 * Heads' house is Heads' house's (../heads/), built by its own builder,
 * exactly, with its logos, its signs and Heads in his garage; the only
 * differences are that the yard track is off its lawn and the two cars on
 * its drive are parked at the kerb, so the garage door can be reached.
 * Round it is the neighbourhood (./hood.js). In it are the goats
 * (./herd.js, ./goatdraw.js): one for each 90%er's sticker on the
 * Infinity Loops map, every one of them wearing it on both flanks.
 *
 * THE GAME, and why it is fun to watch:
 *
 *   - Every goat is somebody's. A goat seen for the first time is called
 *     out with its owner's logo and name, a find kept like a sticker's, and
 *     the box at the side names the goat on the run, so a chat that asks
 *     "where is my goat" gets an answer on screen.
 *   - They run from the whoop when it is low (./herd.js says how), faster
 *     the closer it is, and a herd goes with the goat you push. Herding is
 *     flown at a goat's height between cars, fences and kerbs.
 *   - A goat that runs into the garage is HOME: a lettered flash with its
 *     logo, Nick Burns' "Boom Shakala!", the count goes up, and it stays.
 *     A crash does not let it out: only choosing the map again does.
 *   - The box at the side keeps the count, the time since the first goat
 *     ran, and whose goat is on the run right now, so a stream sees the
 *     game as it is played. All of them home is the big finish.
 *
 * FOR THE LATENCY RULE, measured and written in the PR: on every other map,
 * nothing (this file loads only when the map is chosen). On this map, two
 * draw calls for the goats and their logos (./goatdraw.js), and the
 * neighbourhood drawn into the house's own chunks, so a colour the house
 * already draws costs no call: about eight new calls, and triangles.
 * Per frame on the CPU: the herd's step, about 20 microseconds for the
 * whole herd measured in Node, one matrix a goat, and the logos' sticker
 * records moved in place.
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

import * as THREE from 'three';
import { buildHeadsWorld, drawHouse } from '../heads/index.js';
import { qualityFor } from '../../render/quality.js';
import { worldAt, FRAME, S, G_ASPHALT } from '../heads/heads.js';
import { WALL_STICKERS } from '../heads/logos.js';
import { stfKey } from '../built/egg.js';
import { hoodLayout, BOUNDS, PARK } from './hood.js';
import { goatsDocument } from './yard.js';
import { makeGrid, makeHerd, HOME } from './herd.js';
import { makeGoatDraw, logoPose, patronPicture } from './goatdraw.js';
import { tidy as tidyPatrons } from './patrons.js';
import { cellShadows } from './shadows.js';
import { goatTraffic } from './traffic.js';
import { makeCarDraw } from './cardraw.js';
import { uploadTraffic } from '../built/traffic.js';

const CHUNK = 'extra';

/* The house's own rooms, plan metres, which a goat may not go into by its
 * open front door or slider; the garage is the one room it may. */
const ROOMS = { x0: -0.2, x1: 13.9, y0: -0.1, y1: 8.6 };

/* The longest step the herd is moved in one go, seconds, and the longest
 * gap it is moved over at all (a stall, a pause). */
const SUBSTEP = 1 / 30;
const STALL = 0.1;

/* A paint box whose top is under this, world metres, lies flat on the
 * ground (a walk, a line, a seam, a bed), and only its top can be seen:
 * it is drawn as that top alone, two triangles where a box is twelve. */
const ON_GROUND = 0.35;

/* The dressing's blobs (THE DRESSING in ./hood.js): a sphere with its
 * normals out from the middle, so it shades round with few faces, twenty
 * for a flower and eighty for anything as big as a shrub. */
function roundBall(detail) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i += 1) {
    n.setXYZ(i, p.getX(i), p.getY(i), p.getZ(i));
  }
  return g;
}
const BIT_BIG = 0.3 * S;

/* What the callout calls a goat seen. */
const FOUND_WORD = 'Goat!';

/* The longest wait for a patron's logo, ms. A logo that is late is the
 * patron's name instead: the map does not wait on a slow link. */
const LOGO_WAIT = 4000;

/* A patron's logo as a decoded picture, or null when it is missing, broken
 * or late (the name is drawn instead, patronPicture in ./goatdraw.js). */
function loadLogo(path) {
  if (!path) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let img = null;
    const done = (v) => {
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), LOGO_WAIT);
    try {
      img = new Image();
      img.onload = () => done(img.naturalWidth > 0 ? img : null);
      img.onerror = () => {
        console.warn(`goats: patron logo ${path} did not load; the name is drawn instead`);
        done(null);
      };
      img.src = new URL(`../../../${path}`, import.meta.url).href;
    } catch (err) {
      done(null);
    }
  });
}

/* The last herd this module built. A rebuild of the same map, which a
 * change of graphics is (`keepGame` from the shell's syncWorld), takes its
 * state whole, so a pilot who drops to Low halfway through does not lose
 * the goats already home. A map chosen afresh starts a new herd. */
let carried = null;

/* The plan point of a world one. */
const { OX, OZ } = FRAME;
const toPlan = (x, z) => [(x - OX) / S, (OZ - z) / S];

export async function buildMap(shell, onProgress, options) {
  const hood = hoodLayout();
  /* Medium and High draw the dressing; Low draws the street without it. */
  const dressed = qualityFor(options && options.quality).id !== 'low';
  const keep = (list) => (dressed ? list : list.filter((x) => !x.fine));
  const doc = goatsDocument();
  const crops = WALL_STICKERS;
  const plus = {
    id: 'goats',
    document: doc,
    layout: { yardTrack: false, clearDrive: true },
    /* The neighbourhood's solids: placed with the house's, drawn below. */
    parts: hood.parts.filter((p) => p.solid).map((p) => (p.draw ? { ...p, draw: false } : p)),
    draw: (kit) => {
      kit.begin(0, 0, 0, 0, CHUNK);
      for (const p of keep(hood.parts)) {
        if (p.draw && p.t === 'box' && !p.solid && p.hi[1] < ON_GROUND) {
          kit.plane(p.m, (p.lo[0] + p.hi[0]) / 2, p.hi[1], (p.lo[2] + p.hi[2]) / 2, p.hi[0] - p.lo[0], p.hi[2] - p.lo[2], '+y');
        } else {
          kit.part(p);
        }
      }
      drawHouse(kit, {
        ...hood, cyls: keep(hood.cyls), cones: keep(hood.cones), flats: keep(hood.flats), prisms: keep(hood.prisms),
      });
      /* The bits: all of them on Medium and High, on Low only those that
       * are something solid's shape, a small tree's crown, and those as
       * the small ball. */
      kit.begin(0, 0, 0, 0, CHUNK);
      const small = roundBall(0);
      const big = roundBall(1);
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      const at = new THREE.Vector3();
      const size = new THREE.Vector3();
      for (const b of hood.bits) {
        if (!dressed && !b.keep) {
          continue;
        }
        at.set(b.c[0], b.c[1], b.c[2]);
        size.set(b.r, b.ry, b.r);
        q.setFromEuler(e.set(b.spin[0], b.spin[1], b.spin[2]));
        kit.add(b.m, dressed && Math.max(b.r, b.ry) >= BIT_BIG ? big : small, new THREE.Matrix4().compose(at, q, size));
      }
      /* The street's own trees (tree in ./hood.js), with Heads' own. */
      kit.begin(0, 0, 0, 0, 'extra:trees');
      for (const g of keep(hood.grove)) {
        if (g.c) {
          kit.leaf(g.m, g.c, g.r, g.ry, g.spin);
        } else {
          kit.cyl(g.m, g.a, g.b, g.r, g.seg, g.rTop);
        }
      }
    },
    after: async (map, { sheets, layout }) => {
      /* The street's shadows drawn near the whoop only (./shadows.js): the
       * squares are aimed each time the map has moved the sun's box. */
      const shade = cellShadows(map.scene, ['props:extra', 'props:extra:trees', 'props:extra:street']);
      const focus = map.updateShadowFocus;
      map.updateShadowFocus = (target) => {
        focus(target);
        shade.aim();
      };
      const grid = makeGrid([...layout.parts, ...hood.parts], toPlan, S, BOUNDS, [...hood.blocks, ROOMS]);
      /* The patrons' goats, after the 90%ers' (./patrons.js): the same herd
       * and the same drawing, one more cell of the logo picture each. */
      const patrons = tidyPatrons();
      const logos = await Promise.all(patrons.map((p) => loadLogo(p.logo)));
      const pics = patrons.map((p, i) => patronPicture(p, logos[i]));
      const herd = makeHerd([...crops.map((c) => c.name), ...patrons.map((p) => p.name)], grid, { parks: [PARK] });
      if (options && options.keepGame && carried) {
        herd.adopt(carried.state());
      }
      carried = herd;
      const draw = makeGoatDraw(herd, crops, sheets, worldAt, S, !dressed, pics);
      map.scene.add(draw.group);
      /*
       * THE TRAFFIC (./traffic.js, the owner's ask of 28 October: "Let's
       * put moving cars"), for the shell in the shape a built map hands it
       * (../built/index.js, "THE TRAFFIC"): the physics drives the cars
       * and the shell reads their poses back each step, so they are solid
       * to the whoop and the same on every run; this draws them
       * (./cardraw.js) and hands the goats where they are. A crash is not
       * set down in a car's lane. No chase meter here: the game on this
       * map is the goats.
       */
      const { traffic, keepOut } = goatTraffic();
      const cars = makeCarDraw(traffic, S, S * G_ASPHALT, toPlan);
      map.scene.add(cars.group);
      map.traffic = traffic.vehicles.length ? traffic : null;
      map.restKeepOut = keepOut;
      map.uploadTraffic = (sim) => uploadTraffic(sim, traffic);
      map.chaseCars = () => [];
      map.poseCars = (prev, curr, alpha) => cars.place(prev, curr, alpha);
      map.carTick = () => {};
      map.clearSmoke = () => {};
      map.carGap = (x, y, z, reach) => cars.gapAt(x, y, z, reach);
      /* Every goat's logo is a sticker to find, moved with its goat. */
      const key = stfKey(doc, 'goats');
      const goatStickers = crops.map((c) => ({
        id: `goat-${c.id}`,
        key: `${key}#sticker:goat-${c.id}`,
        name: c.name,
        achievement: FOUND_WORD,
        crop: { x: c.x, y: c.y, w: c.w, h: c.h },
        sheet: sheets[c.sheet] ? { image: sheets[c.sheet] } : null,
        p: [0, -50, 0],
        n: [0, 0, 1],
        w: 1,
        h: 1,
      }));
      /* A patron's goat is not a find to be seen: it has a picture for its
       * callout when it is home, and no place in map.stickers. */
      const patronPics = patrons.map((p, i) => ({
        id: `patron-${i}`,
        key: `${key}#patron:${i}:${p.name}`,
        name: p.name,
        crop: { x: 0, y: 0, w: 1, h: 1 },
        sheet: { image: pics[i] },
      }));
      const homeStickers = [...goatStickers, ...patronPics];
      map.stickers = [...map.stickers.filter((s) => !String(s.id).startsWith('ninety-')), ...goatStickers];
      /* Each goat is called out the first time it is seen, kept like a
       * sticker find, and not again: ninety eight goats called out every
       * time one came back into sight was a name a second on the screen,
       * and buried the goats coming home. A goat seen is counted as seen,
       * and all of them seen is not the finish: all of them home is
       * (goatFrame in src/main.js). */
      map.stickersEverySighting = false;
      map.stickersWord = 'seen';
      map.stickersComplete = { sub: 'Every goat seen', band: 'Every 90%er goat on the street' };
      map.clips = 'goats';
      const cue = (name) => {
        if (typeof map.onCue === 'function') {
          map.onCue(name);
        }
      };
      /* The game as the shell reads it (goatFrame in src/main.js): the
       * box at the side, and the goats that came home since it last
       * asked. */
      const hud = {
        home: 0, total: herd.count, clockS: 0, started: false, herding: '', seen: 0,
      };
      map.goatGame = {
        hud() {
          hud.home = herd.homeCount();
          hud.clockS = herd.sinceFirst();
          hud.started = herd.started();
          /* Whose goat is on the run: the most frightened one not home. */
          let best = -1;
          let fear = 0.25;
          for (let i = 0; i < herd.count; i += 1) {
            if (herd.MODE[i] !== HOME && herd.FEAR[i] > fear) {
              fear = herd.FEAR[i];
              best = i;
            }
          }
          hud.herding = best >= 0 ? herd.names[best] : '';
          return hud;
        },
        /* The goats home since the last ask: [{ name, count, total, atS,
         * sticker }], the sticker its logo's, for its picture. */
        drain() {
          const out = [];
          while (herd.events.length) {
            const e = herd.events.shift();
            if (e.kind === 'firstRun') {
              cue('warm:home');
              continue;
            }
            out.push({
              name: herd.names[e.goat], count: e.count, total: herd.count, atS: e.at, sticker: homeStickers[e.goat],
            });
            cue('home');
          }
          return out;
        },
        /* Let the goats out (the pause menu's row, src/ui/ui.js): every
         * goat back on the street and the clock not started. */
        restart() {
          herd.reset();
        },
        /*
         * FOR A ROUND WITH OTHERS (src/game/goatround.js): the herd is
         * stepped with `others`, nOthers more craft as plan x, y and h in
         * threes, which the round writes each feed and nothing here reads
         * but the step; the plan's frame, for the round to put a plan
         * point in the world; and the way home the herd made.
         */
        others: new Float64Array(3 * 16),
        nOthers: 0,
        frame: { OX, OZ, S },
        field: () => herd.field,
        /* For the harness: where every goat is, plan metres. */
        goats: () => Array.from({ length: herd.count }, (_, i) => ({
          name: herd.names[i], x: herd.X[i], y: herd.Y[i], mode: ['graze', 'flee', 'home'][herd.MODE[i]],
        })),
        herd,
      };
      /* The herd's own clock: forward only, so a crash or a reset, which
       * take the sim's back to zero, leave every goat where it is. */
      let last = null;
      const eye = shell.camera.position;
      const craft = { x: 0, y: 0, h: 0 };
      const game = map.goatGame;
      function update(ms) {
        let dt = last === null ? 0 : (ms - last) / 1000;
        last = ms;
        if (!(dt > 0)) {
          dt = 0;
        }
        dt = Math.min(dt, STALL);
        const frame = dt;
        const q = shell.quad ? shell.quad.position : null;
        if (q) {
          const [px, py] = toPlan(q.x, q.z);
          craft.x = px;
          craft.y = py;
          craft.h = q.y / S;
        }
        while (dt > 1e-6) {
          const h = Math.min(dt, SUBSTEP);
          herd.step(h, q ? craft : null, cars.feed, cars.count, game.nOthers ? game.others : null, game.nOthers);
          dt -= h;
        }
        draw.update(frame);
        for (let i = 0; i < goatStickers.length; i += 1) {
          logoPose(herd, i, eye, worldAt, S, goatStickers[i]);
        }
      }
      update(0);
      return {
        update,
        stats: () => ({ goats: { count: herd.count, patrons: patrons.length, home: herd.homeCount(), hood: hood.stats, shade: shade.stats, cars: cars.stats() } }),
      };
    },
  };
  const map = await buildHeadsWorld(shell, onProgress, options, plus);
  return map;
}
