/*
 * yardcat-check.js: the yard's cat (src/maps/yardtrack/cat.js and the four
 * files beside it), the black cat that hunts the craft on the yard track in
 * Heads' front yard, Nick Burns' back yard and out the back of Joshua
 * Bardwell's, proved in plain Node never to touch what it hunts.
 *
 * The owner's words, 2026-11-21: "add a cat that hunts and stalks you ...
 * make sure the cat can't acutally touch you". The cat is drawn and is not
 * solid, so nothing in the physics stops it: what stops it is its own mind
 * (src/maps/yardtrack/cat.js), and this is the proof of that. It flies a
 * made up craft at the real cat, in the three real yards with their real
 * solids, the way the page runs it (makeCatLife's frame), and measures the
 * distance from the craft to every drawn corner of the cat, worked out the
 * way the graphics card works it out (catmodel.js's skinCat).
 *
 *   1. yards     each yard builds, its cat begins on its own lawn clear of
 *                both places a run is set down, its gates' openings are
 *                found from their own pipe, and a cat set down where it
 *                may not be walks back onto its lawn
 *   2. shell     the body's balls (catrig.js) wrap the drawn cat: every
 *                corner of both models, claws, hackles and whiskers out,
 *                lies inside one, in every posture and through every flight
 *   3. touch     twenty four flights at each yard with each craft that
 *                is flown there: nothing, hovering at seven heights,
 *                landing, laps of the line at five speeds, flown straight
 *                at it, crept into, circled, flown at random, set down on
 *                top of it, dived on, hung in every gate, hung over the
 *                start and sat on it, and chased. No ball and no corner of
 *                the cat ever nearer the craft's sweep than KEEP, no NaN
 *   4. place     through all of it: no ball of it in the opening of a
 *                gate or within GAP of one, none in a post, a pole, a trunk
 *                or a bar, none in a wall, never sunk in the ground, never
 *                off its lawn, and never asleep in its bones with the craft
 *                near
 *   5. moves     everything it was asked to do it does: stalk, the wiggle,
 *                the big eyes, the pounce, the leap, the swat, and the rest
 *                of what a cat does at a thing that flies. And does it
 *                where the track is: a craft hung in a gate or over the
 *                start is hunted from as near as the cat may come, and a
 *                cat that is chased runs
 *   6. rates     the same at 30, 144 and 240 frames a second and at a
 *                frame time that stutters and stalls; with a tiny craft and
 *                a huge one; and out of the picture, where the bones are
 *                left alone until the craft comes near
 *   7. twice     the same seed lives the same life to the bit, and another
 *                seed another
 *   8. breach    the check can see a touch: the same flights with the last
 *                word (the mind's settle) left out DO touch the craft, and
 *                DO put a nose in a gate and in a post, and are caught
 *   9. cost      what a frame of it costs the processor
 *
 * Usage: node scripts/yardcat-check.js [--yard=heads] [--verbose]
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

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { headsLayout, headsYardTrack } from '../src/maps/heads/heads.js';
import { headsDocument } from '../src/maps/heads/yard.js';
import { houseLayout, houseYardTrack } from '../src/maps/house/house.js';
import { houseDocument } from '../src/maps/house/yard.js';
import { bardwellLayout, bardwellYardTrack } from '../src/maps/bardwell/bardwell.js';
import { bardwellDocument } from '../src/maps/bardwell/yard.js';
import { placeSolids, addSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument } from '../src/maps/built/place.js';
import { Colliders, CRAFT_WORLD_R } from '../src/game/collide.js';
import { CELL, CEIL } from '../src/maps/yardtrack/catlawn.js';
import { makeCatLife, DOING, KEEP, GAP, REACH } from '../src/maps/yardtrack/cat.js';
import { buildCat, skinCat, MORPH } from '../src/maps/yardtrack/catmodel.js';
import { POSTURE, makeControls, makeRig } from '../src/maps/yardtrack/catrig.js';

const ARG = (name) => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit ? (hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true) : null;
};
const VERBOSE = Boolean(ARG('verbose'));
const ONLY = ARG('yard');

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}
const mm = (v) => `${(v * 1000).toFixed(0)} mm`;

/* A small seeded source of chance for the flights (the cat has its own). */
function chance(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * THE YARDS, as the page builds them (src/maps/built/index.js): the map's
 * document seated, the house's structure laid over it, and every solid of
 * both in one collider set. `starts` is the map's own start, which the page
 * hands the cat as map.spawn.
 */
const MAPS = [
  { id: 'heads', name: 'Heads\' front yard', layout: headsLayout, track: headsYardTrack, document: headsDocument },
  { id: 'house', name: 'Nick Burns\' back yard', layout: houseLayout, track: houseYardTrack, document: houseDocument },
  { id: 'bardwell', name: 'Joshua Bardwell\'s back yard', layout: bardwellLayout, track: bardwellYardTrack, document: bardwellDocument },
].filter((m) => !ONLY || m.id === ONLY);

function yardWorld(M) {
  const L = M.layout();
  const { doc } = normalize(M.document());
  const { placed } = seatDocument(doc);
  placeSolids(L.parts, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
  const solids = new Colliders();
  addSolids(solids, placed.solids);
  solids.build();
  const track = M.track();
  const w = {
    id: M.id, name: M.name, track, solids, parts: L.parts, starts: placed.spawn ? [placed.spawn] : null,
    S: track.scale, g: track.y || 0,
  };
  w.openings = openingsOf(w);
  w.walls = wallsOf(w);
  return w;
}

/*
 * A GATE'S OPENING, found from the gate's own pipe and not from what the
 * cat's lawn believes about it: a station of the track with an upright of
 * pipe standing at each edge of its opening, the whole height of it. The
 * track's other stations are planes in the air that score a pass round a
 * pole or over a gate, with nothing built round them, and are not gaps.
 */
function openingsOf(w) {
  const t = w.track;
  const posts = t.parts.filter((p) => p.name === 'yard gate' && Math.hypot(p.a[0] - p.b[0], p.a[2] - p.b[2]) < 1e-4);
  const list = [];
  for (const gt of t.gates) {
    const a = gt.aperture;
    const ux = Math.cos(gt.heading);
    const uz = -Math.sin(gt.heading);
    const lo = gt.position.y + a.centreY - a.clearH / 2;
    const hi = lo + a.clearH;
    /* The upright NEAREST each edge of the pass. Two gates stood side by
     * side share a corner, and the next gate's post is within reach of this
     * one's edge: taking the first found once measured a gate from its
     * neighbour's post, a hole a hand wider than the hole there is. */
    const stood = [-1, 1].map((s) => {
      const ex = gt.position.x + (s * ux * a.clearW) / 2;
      const ez = gt.position.z + (s * uz * a.clearW) / 2;
      let best = null;
      let bd = 1e9;
      for (const p of posts) {
        const d = Math.hypot(p.a[0] - ex, p.a[2] - ez);
        if (d < bd && d < 2.5 * p.r + 0.04 * w.S && Math.min(p.a[1], p.b[1]) < lo + 0.1 * w.S && Math.max(p.a[1], p.b[1]) > hi - 0.1 * w.S) {
          bd = d;
          best = p;
        }
      }
      return best;
    });
    if (!stood[0] || !stood[1]) {
      continue;
    }
    /* The hole is where the pipe is, which is not always quite where the
     * pass is scored: between the two uprights' faces. */
    const [p, q] = stood;
    const wide = Math.hypot(q.a[0] - p.a[0], q.a[2] - p.a[2]);
    const o = {
      id: gt.elementId, x: (p.a[0] + q.a[0]) / 2, y: (lo + hi) / 2, z: (p.a[2] + q.a[2]) / 2,
      ux: (q.a[0] - p.a[0]) / wide, uz: (q.a[2] - p.a[2]) / wide, hw: wide / 2 - p.r, hh: a.clearH / 2,
    };
    if (!list.some((e) => Math.hypot(e.x - o.x, e.z - o.z) < 0.05 * w.S && Math.abs(e.y - o.y) < 0.05 * w.S)) {
      list.push(o);
    }
  }
  return list;
}
/* How far a point is from an opening's rectangle. */
function toOpening(o, x, y, z) {
  const dx = x - o.x;
  const dz = z - o.z;
  const across = Math.max(0, Math.abs(dx * o.ux + dz * o.uz) - o.hw);
  const up = Math.max(0, Math.abs(y - o.y) - o.hh);
  const through = -dx * o.uz + dz * o.ux;
  return Math.sqrt(across * across + up * up + through * through);
}

/*
 * THE WALLS: every solid near the lawn that stands higher than a cat steps
 * over, straight from the collider set's own arrays, with a coarse grid
 * over them so a frame asks only the few beside the cat.
 */
const WALL_CELL = 2;
function wallsOf(w) {
  const s = w.solids;
  const b = w.track.box;
  const pad = 3 * w.S;
  const list = [];
  for (let i = 0; i < s.fax.length; i += 1) {
    const r = s.fbox[i] ? 0 : s.fr[i];
    const top = Math.max(s.fay[i], s.fby[i]) + r;
    if (top <= w.g + 0.06 * w.S) {
      continue;
    }
    const x0 = Math.min(s.fax[i], s.fbx[i]) - r;
    const x1 = Math.max(s.fax[i], s.fbx[i]) + r;
    const z0 = Math.min(s.faz[i], s.fbz[i]) - r;
    const z1 = Math.max(s.faz[i], s.fbz[i]) + r;
    if (x1 < b.x0 - pad || x0 > b.x1 + pad || z1 < b.z0 - pad || z0 > b.z1 + pad) {
      continue;
    }
    list.push({
      box: s.fbox[i] === 1, ax: s.fax[i], ay: s.fay[i], az: s.faz[i], bx: s.fbx[i], by: s.fby[i], bz: s.fbz[i], r, x0, x1, z0, z1,
    });
  }
  const grid = new Map();
  const reach = 0.75 * w.S;
  list.forEach((q, k) => {
    for (let i = Math.floor((q.x0 - reach) / WALL_CELL); i <= Math.floor((q.x1 + reach) / WALL_CELL); i += 1) {
      for (let j = Math.floor((q.z0 - reach) / WALL_CELL); j <= Math.floor((q.z1 + reach) / WALL_CELL); j += 1) {
        const key = i * 4096 + j;
        if (!grid.has(key)) {
          grid.set(key, []);
        }
        grid.get(key).push(k);
      }
    }
  });
  return { list, grid };
}
/* How far a point is from a wall's surface: nothing if it is inside it. */
function toWall(q, x, y, z) {
  if (q.box) {
    const ox = Math.max(Math.min(q.ax, q.bx) - x, 0, x - Math.max(q.ax, q.bx));
    const oy = Math.max(Math.min(q.ay, q.by) - y, 0, y - Math.max(q.ay, q.by));
    const oz = Math.max(Math.min(q.az, q.bz) - z, 0, z - Math.max(q.az, q.bz));
    return Math.sqrt(ox * ox + oy * oy + oz * oz);
  }
  const ex = q.bx - q.ax;
  const ey = q.by - q.ay;
  const ez = q.bz - q.az;
  const ee = ex * ex + ey * ey + ez * ez;
  const t = ee > 1e-12 ? Math.min(1, Math.max(0, ((x - q.ax) * ex + (y - q.ay) * ey + (z - q.az) * ez) / ee)) : 0;
  return Math.max(0, Math.hypot(x - q.ax - ex * t, y - q.ay - ey * t, z - q.az - ez * t) - q.r);
}

/*
 * THE DRAWN CAT. Both models (the full one, and the one Low draws), skinned
 * from the body's bones the way the vertex shader skins them, with the
 * claws, the hackles and the whiskers as far out as the face says (the
 * whiskers all the way: the drawing folds them in with distance, which is
 * the easy case).
 */
function makeDrawn(lite) {
  const model = buildCat({ lite });
  return {
    lite, model, out: new Float32Array(model.count * 3), live: new Uint8Array(model.count), home: new Int16Array(model.count), morph: [0, 0, 0, 0, 1], at: [0, 0, 0],
  };
}
const DRAWN = [makeDrawn(false), makeDrawn(true)];
/* Skin `d` on `rig` at the cat's spot, heights over the lawn. With no face
 * the claws are all the way out, and the hackles as far as the body was
 * told they are (controls.hackle, which the mind copies from the face each
 * frame, and the balls along the back grow by). */
function skin(d, rig, c, face) {
  d.morph[MORPH.clawL] = face ? face.clawL : 1;
  d.morph[MORPH.clawR] = face ? face.clawR : 1;
  d.morph[MORPH.hackle] = face ? face.hackle : c.hackle;
  d.at[0] = c.x;
  d.at[2] = c.z;
  skinCat(d.model, rig.bones, d.at, d.morph, d.out, d.live);
}
/* The corner furthest outside every ball, 0 if none is: each corner asks
 * the ball that held it last before it asks them all. */
function unwrapped(d, P) {
  const n = P.length / 4;
  let worst = 0;
  for (let i = 0; i < d.model.count; i += 1) {
    if (!d.live[i]) {
      continue;
    }
    const x = d.out[i * 3];
    const y = d.out[i * 3 + 1];
    const z = d.out[i * 3 + 2];
    let k = d.home[i];
    let dx = x - P[k * 4];
    let dy = y - P[k * 4 + 1];
    let dz = z - P[k * 4 + 2];
    if (dx * dx + dy * dy + dz * dz <= P[k * 4 + 3] * P[k * 4 + 3]) {
      continue;
    }
    let best = 1e9;
    for (k = 0; k < n; k += 1) {
      dx = x - P[k * 4];
      dy = y - P[k * 4 + 1];
      dz = z - P[k * 4 + 2];
      const q = Math.sqrt(dx * dx + dy * dy + dz * dz) - P[k * 4 + 3];
      if (q < best) {
        best = q;
        d.home[i] = k;
      }
    }
    if (best > worst) {
      worst = best;
    }
  }
  return worst;
}

/*
 * THE FLIGHTS. Each makes a craft's path: (t, dt) to { x, y, z } in the
 * world, or null for no craft. `u` is one cat metre in the world's, `h` a
 * height over the lawn, and `life` the cat being flown at, for the flights
 * that go where it is.
 */
function onLawn(lawn, x, z, room) {
  if (lawn.free(x, z)) {
    return { x, z };
  }
  const k = lawn.nearestFree(x, z, room);
  return k >= 0 ? { x: lawn.cellX(k), z: lawn.cellZ(k) } : { x, z };
}
/* A spot `dist` cat metres from the cat toward the middle of its lawn. */
function spotBy(life, dist, room) {
  const { lawn, controls: c } = life;
  const dx = lawn.centre.x - c.x;
  const dz = lawn.centre.z - c.z;
  const d = Math.max(1e-3, Math.hypot(dx, dz));
  return onLawn(lawn, c.x + (dx / d) * dist * lawn.scale, c.z + (dz / d) * dist * lawn.scale, room);
}
const hover = (h, dist) => ({ life, w }) => {
  let at = null;
  return (t) => {
    if (t < 1) {
      return null;
    }
    at = at || spotBy(life, dist, 0.3 * w.S);
    return { x: at.x, y: w.g + (h + 0.02 * Math.sin(t * 3)) * w.S, z: at.z };
  };
};
/* Down out of the air onto open lawn two cat metres from the cat, and left
 * there: the centre of a landed craft is a fifth of its sweep off the grass. */
const land = ({ life, w, R }) => {
  let at = null;
  return (t) => {
    if (t < 1) {
      return null;
    }
    if (!at) {
      const { lawn, controls: c } = life;
      let best = -1;
      let bs = 1e18;
      for (let r = 0; r < lawn.rests; r += 1) {
        const s = Math.abs(Math.hypot(lawn.restX[r] - c.x, lawn.restZ[r] - c.z) - 2.2 * w.S);
        if (s < bs) {
          bs = s;
          best = r;
        }
      }
      at = best >= 0 ? { x: lawn.restX[best], z: lawn.restZ[best] } : spotBy(life, 2.2, 0.3 * w.S);
    }
    return { x: at.x, y: w.g + Math.max(0.19 * R, 1.0 * w.S - 1.2 * w.S * (t - 1)), z: at.z };
  };
};
/* Round the racing line at `v` metres a second. */
const laps = (v) => ({ w }) => {
  const line = w.track.line;
  const n = line.length;
  const s = [0];
  for (let i = 1; i < n; i += 1) {
    s.push(s[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y, line[i].z - line[i - 1].z));
  }
  const total = s[n - 1];
  let d = 0;
  let i = 0;
  return (t, dt) => {
    d += v * dt;
    if (d >= total) {
      d -= total;
      i = 0;
    }
    while (i < n - 2 && s[i + 1] <= d) {
      i += 1;
    }
    const f = (d - s[i]) / Math.max(1e-6, s[i + 1] - s[i]);
    return { x: line[i].x + (line[i + 1].x - line[i].x) * f, y: line[i].y + (line[i + 1].y - line[i].y) * f, z: line[i].z + (line[i + 1].z - line[i].z) * f };
  };
};
/* Straight at the cat, again and again, from all round, at five speeds and
 * five heights. */
const ram = ({ life, w }) => {
  const c = life.controls;
  let pass = 0;
  let from = null;
  let dir = null;
  let t0 = 0;
  let speed = 5;
  let h = 0.2;
  return (t) => {
    if (!from || (t - t0) * speed > 16 * w.S) {
      pass += 1;
      t0 = t;
      const a = pass * 2.399963;
      speed = [1.5, 4, 8, 14, 22][pass % 5];
      h = [0.08, 0.2, 0.35, 0.6, 1.0][(pass * 3) % 5];
      from = { x: c.x + Math.cos(a) * 8 * w.S, z: c.z + Math.sin(a) * 8 * w.S };
      dir = { x: -Math.cos(a), z: -Math.sin(a) };
    }
    const d = (t - t0) * speed;
    return { x: from.x + dir.x * d, y: w.g + h * w.S, z: from.z + dir.z * d };
  };
};
/* Always toward where the cat is, slowly and low: the pilot who means to
 * touch it. */
const creep = ({ life, w }) => {
  const c = life.controls;
  const p = { x: life.lawn.centre.x, y: 0, z: life.lawn.centre.z };
  return (t, dt) => {
    const dx = c.x - p.x;
    const dz = c.z - p.z;
    const d = Math.max(1e-3, Math.hypot(dx, dz));
    p.x += (dx / d) * 0.5 * w.S * dt;
    p.z += (dz / d) * 0.5 * w.S * dt;
    p.y = w.g + (0.25 + 0.15 * Math.sin(t * 0.7)) * w.S;
    return p;
  };
};
/* Round and round where the cat is, the ring drawn in to a third of a cat
 * metre: there is no way out of it but under or through. */
const orbit = ({ life, w }) => {
  const c = life.controls;
  let a = 0;
  return (t, dt) => {
    const r = Math.max(0.3, 1.7 - 0.035 * t) * w.S;
    a += ((1.5 * w.S) / r) * dt;
    return { x: c.x + Math.cos(a) * r, y: w.g + (0.3 + 0.2 * Math.sin(t * 0.9)) * w.S, z: c.z + Math.sin(a) * r };
  };
};
/* From one place to the next at a walk of four metres a second and held at
 * each for `hold` seconds: `places` is ({ life, w, R }) to a list of
 * [x, height over the lawn, z]. */
const visit = (places, hold) => (arg) => {
  const { w } = arg;
  let list = null;
  let k = 0;
  let held = 0;
  let p = null;
  return (t, dt) => {
    if (t < 1) {
      return null;
    }
    list = list || places(arg);
    const q = list[k % list.length];
    if (!p) {
      p = { x: q[0], y: w.g + q[1], z: q[2] };
    }
    const dx = q[0] - p.x;
    const dy = w.g + q[1] - p.y;
    const dz = q[2] - p.z;
    const d = Math.hypot(dx, dy, dz);
    const step = 4 * dt;
    if (d <= step) {
      p.x = q[0];
      p.y = w.g + q[1];
      p.z = q[2];
      held += dt;
      if (held >= hold) {
        held = 0;
        k += 1;
      }
    } else {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      p.z += (dz / d) * step;
    }
    return p;
  };
};
/* Hung in the hole of every gate that stands on the grass, one after the
 * other, in the middle of the hole: where a pilot lining up a gate hangs,
 * and ground the cat may not stand on. */
const inGates = ({ w }) => w.openings.filter((o) => o.y - o.hh < w.g + 0.2 * w.S).map((o) => [o.x, o.y - w.g, o.z]);
/* Over each place a run is set down: hung over it at the height of a cat's
 * head, then sat on it, which is where every run begins. */
const atStart = ({ w, R }) => [w.track.start, ...(w.starts || [])].flatMap((p) => [[p.x, 0.5 * w.S, p.z], [p.x, Math.max(0.19 * R, 0.03), p.z]]);
/* After the cat wherever it goes, from the middle of the lawn outward, low,
 * at three speeds: the pilot who drives it to the fence and into the corner
 * and keeps coming. It is flown as a craft is, which cannot turn on the
 * spot: it wants to go at the cat and takes a third of a second to be going
 * that way, so it overshoots a cat that jumps aside and comes round again. */
const herd = ({ life, w }) => {
  const c = life.controls;
  const p = { x: life.lawn.centre.x, y: 0, z: life.lawn.centre.z };
  const v = { x: 0, z: 0 };
  return (t, dt) => {
    const dx = c.x - p.x;
    const dz = c.z - p.z;
    const d = Math.max(1e-3, Math.hypot(dx, dz));
    const sp = [1.2, 2.5, 4][Math.floor(t / 10) % 3] * w.S;
    const k = 1 - Math.exp(-dt / 0.3);
    v.x += ((dx / d) * sp - v.x) * k;
    v.z += ((dz / d) * sp - v.z) * k;
    p.x += v.x * dt;
    p.z += v.z * dt;
    p.y = w.g + (0.3 + 0.2 * Math.sin(t * 1.3)) * w.S;
    return p;
  };
};
/* Anywhere over the lawn at any height and speed, changing its mind. */
const erratic = ({ w, rnd }) => {
  const b = w.track.box;
  const p = { x: (b.x0 + b.x1) / 2, y: w.g + w.S, z: (b.z0 + b.z1) / 2 };
  const v = { x: 0, y: 0, z: 0 };
  const to = { x: p.x, y: p.y, z: p.z };
  let next = 0;
  let top = 4;
  return (t, dt) => {
    if (t >= next) {
      next = t + 0.5 + 2.5 * rnd();
      to.x = b.x0 + (b.x1 - b.x0) * rnd();
      to.z = b.z0 + (b.z1 - b.z0) * rnd();
      to.y = w.g + (0.05 + 1.95 * rnd() * rnd()) * w.S;
      top = 1 + 11 * rnd();
    }
    const dx = to.x - p.x;
    const dy = to.y - p.y;
    const dz = to.z - p.z;
    const d = Math.max(1e-3, Math.hypot(dx, dy, dz));
    const sp = Math.min(top, d * 3);
    const k = 1 - Math.exp(-dt / 0.3);
    v.x += ((dx / d) * sp - v.x) * k;
    v.y += ((dy / d) * sp - v.y) * k;
    v.z += ((dz / d) * sp - v.z) * k;
    p.x += v.x * dt;
    p.y = Math.max(w.g + 0.03, p.y + v.y * dt);
    p.z += v.z * dt;
    return p;
  };
};
/* Put down out of nowhere, as a reset or a new run puts a craft: on the
 * cat's own spot at three heights, on its nose, on the tip of its tail, and
 * at both places a run is set down. It stays where it is put. */
const appear = ({ life, w, R }) => {
  const c = life.controls;
  const p = { x: 0, y: 0, z: 0 };
  let n = -1;
  const rest = Math.max(0.19 * R, 0.03);
  return (t) => {
    const k = Math.floor(t / 3);
    if (k !== n) {
      n = k;
      const fx = Math.cos(c.yaw);
      const fz = -Math.sin(c.yaw);
      const places = [
        [c.x, 0.05 * w.S, c.z], [c.x, 0.25 * w.S, c.z], [c.x, 0.6 * w.S, c.z],
        [c.x + fx * 0.3 * w.S, 0.2 * w.S, c.z + fz * 0.3 * w.S], [c.x - fx * 0.45 * w.S, 0.2 * w.S, c.z - fz * 0.45 * w.S],
        [w.track.start.x, rest, w.track.start.z],
        ...(w.starts || []).map((q) => [q.x, rest, q.z]),
      ];
      const q = places[k % places.length];
      p.x = q[0];
      p.y = w.g + q[1];
      p.z = q[2];
    }
    return p;
  };
};
/* Straight down on it out of the sky, to a hand off the grass, and held. */
const dive = ({ life, w }) => {
  const c = life.controls;
  const p = { x: 0, y: 0, z: 0 };
  let n = -1;
  let t0 = 0;
  return (t) => {
    const k = Math.floor(t / 5);
    if (k !== n) {
      n = k;
      t0 = t;
      p.x = c.x;
      p.z = c.z;
    }
    p.y = w.g + Math.max(0.05, 6 - 4 * (t - t0)) * w.S;
    return p;
  };
};

const FLIGHTS = [
  { name: 'alone', secs: 150, make: () => () => null },
  ...[0.2, 0.35, 0.6, 0.9, 1.3, 1.7, 2.4].map((h) => ({ name: `hover at ${h}`, secs: 40, look: 'cat', make: hover(h, 2.5) })),
  { name: 'landed', secs: 100, look: 'cat', make: land },
  ...[2, 4, 7, 12, 18].map((v) => ({ name: `laps at ${v} m/s`, secs: 60, look: 'ahead', make: laps(v) })),
  { name: 'flown at', secs: 150, look: 'ahead', make: ram },
  { name: 'crept into', secs: 90, look: 'cat', make: creep },
  { name: 'circled', secs: 50, look: 'cat', make: orbit },
  { name: 'at random', secs: 120, look: 'ahead', make: erratic },
  { name: 'set down on it', secs: 63, look: 'cat', make: appear },
  { name: 'dived on', secs: 60, look: 'cat', make: dive },
  { name: 'hung in the gates', secs: 125, look: 'cat', make: visit(inGates, 22) },
  { name: 'at the start', secs: 100, look: 'cat', make: visit(atStart, 23) },
  { name: 'chased', secs: 90, look: 'cat', make: herd },
];

/* What a run of flights found. Lengths are the world's metres. */
function makeTally() {
  return {
    frames: 0, posed: 0, looks: 0, nan: 0, pushes: 0, nudges: 0, reach: 0, high: 0,
    ball: 1e9, ballAt: '', corner: 1e9, cornerAt: '', out: 0, outAt: '',
    opening: 1e9, openingAt: '', pipe: 1e9, pipeAt: '', box: 1e9, boxAt: '',
    low: 1e9, lowAt: '', offLawn: 0, offBox: 0, asleepNear: 0,
    moves: {}, by: {}, time: {}, hash: createHash('sha256'),
  };
}

/* The parts of the body by ball, for saying which of them was where: the
 * list in catrig.js runs trunk, neck, head, jaw, ears, whiskers, shoulder
 * blades, tail, legs. */
const PART = (k) => (k <= 5 ? 'its trunk' : k === 6 ? 'its neck' : k <= 9 ? 'its head' : k <= 11 ? 'an ear' : k <= 13 ? 'its whiskers' : k <= 15 ? 'a shoulder' : k <= 22 ? 'its tail' : 'a leg');

/*
 * ONE FLIGHT at one yard with one craft, measured every frame into `T`.
 * opt: fps, seed, lite (which model is measured), seen (is the cat in the
 * picture: true, false, or 'cone' for a camera that looks where the craft
 * goes), unsettled (the mind's last word left out: block 8), jitter.
 */
function fly(w, R, flight, T, opt = {}) {
  const life = makeCatLife({ track: w.track, solids: w.solids, parts: w.parts, starts: w.starts, seed: opt.seed ?? 7 });
  const { lawn, rig, controls: c, mind, face } = life;
  const { S, g } = w;
  const P = rig.probes;
  const n = P.length / 4;
  const rnd = chance(1234 + (opt.seed ?? 7));
  const path = flight.make({ life, w, R, rnd });
  const drawn = DRAWN[opt.lite ? 1 : 0];
  const eye = { x: 0, y: 0, z: 0, fx: 1, fy: 0, fz: 0 };
  const was = { x: 0, y: 0, z: 0, on: false };
  const fps = opt.fps ?? 60;
  const row = new Float64Array(4);
  const rowBytes = new Uint8Array(row.buffer);
  const keep = R + KEEP * S;
  const pushes0 = mind.pushes();
  const nudges0 = mind.nudges();
  let t = 0;
  let frame = 0;
  while (t < flight.secs) {
    /* A frame time that stutters: mostly its own, sometimes three of them,
     * now and then a stall of a quarter of a second. */
    let dt = 1 / fps;
    if (opt.jitter) {
      const q = rnd();
      dt = q < 0.02 ? 0.25 : q < 0.12 ? 3 / fps : (0.6 + 0.8 * rnd()) / fps;
    }
    const craft = path(t, dt);
    let look = null;
    if (craft) {
      eye.x = craft.x;
      eye.y = craft.y;
      eye.z = craft.z;
      let fx = c.x - craft.x;
      let fy = 0;
      let fz = c.z - craft.z;
      if (flight.look === 'ahead' && was.on) {
        fx = craft.x - was.x;
        fy = craft.y - was.y;
        fz = craft.z - was.z;
      }
      const fl = Math.hypot(fx, fy, fz);
      if (fl > 1e-6) {
        eye.fx = fx / fl;
        eye.fy = fy / fl;
        eye.fz = fz / fl;
      }
      look = eye;
      was.x = craft.x;
      was.y = craft.y;
      was.z = craft.z;
    }
    was.on = Boolean(craft);
    let seen = opt.seen ?? true;
    if (seen === 'cone') {
      /* In the picture: within sixty degrees of where the camera looks. */
      const dx = c.x - eye.x;
      const dy = g + 0.3 * S - eye.y;
      const dz = c.z - eye.z;
      seen = Boolean(craft) && dx * eye.fx + dy * eye.fy + dz * eye.fz > 0.5 * Math.hypot(dx, dy, dz);
    }
    let posed;
    if (opt.unsettled) {
      mind.think(dt > 0.1 ? 0.1 : dt, craft, R, look);
      rig.step(dt > 0.1 ? 0.1 : dt, c);
      posed = true;
    } else {
      posed = life.frame(dt, craft, R, look, seen);
    }
    T.frames += 1;
    const doing = DOING[mind.doing()];
    T.time[doing] = (T.time[doing] || 0) + dt;
    row[0] = c.x;
    row[1] = c.z;
    row[2] = c.yaw;
    row[3] = mind.doing() + (posed ? 0 : 100);
    T.hash.update(rowBytes);
    if (!(c.x === c.x && c.z === c.z && c.yaw === c.yaw && c.lift === c.lift)) {
      T.nan += 1;
    }
    const where = `${flight.name} at ${t.toFixed(2)} s, ${doing}`;
    if (c.x < lawn.x0 || c.z < lawn.z0 || c.x > lawn.x0 + lawn.cols * CELL || c.z > lawn.z0 + lawn.rows * CELL) {
      T.offBox += 1;
    }
    const cx = craft ? craft.x : 0;
    const cy = craft ? craft.y - g : 0;
    const cz = craft ? craft.z : 0;
    if (!posed) {
      /* Not in the picture and its bones left alone: then the craft is
       * nowhere near, or the promise is broken. */
      if (craft && Math.hypot(cx - c.x, cz - c.z) < keep + 1.2 * S) {
        T.asleepNear += 1;
      }
    } else {
      T.posed += 1;
      for (let k = 0; k < rig.bones.length; k += 1) {
        if (rig.bones[k] !== rig.bones[k]) {
          T.nan += 1;
          break;
        }
      }
      if (!mind.air() && doing !== 'escape' && !lawn.free(c.x, c.z)) {
        T.offLawn += 1;
      }
      /* The balls against the craft, the openings and the walls. */
      let near = 1e9;
      const walls = w.walls.grid.get(Math.floor(c.x / WALL_CELL) * 4096 + Math.floor(c.z / WALL_CELL));
      for (let k = 0; k < n; k += 1) {
        const x = P[k * 4];
        const y = P[k * 4 + 1];
        const z = P[k * 4 + 2];
        const r = P[k * 4 + 3];
        const far = Math.hypot(x - c.x, z - c.z) + r;
        if (far > T.reach) {
          T.reach = far;
        }
        if (y + r > T.high) {
          T.high = y + r;
        }
        if (craft) {
          const q = Math.hypot(x - cx, y - cy, z - cz) - r - R;
          if (q < near) {
            near = q;
          }
          if (q < T.ball) {
            T.ball = q;
            T.ballAt = `${where}, ball ${k}`;
          }
        }
        for (const o of w.openings) {
          const q = toOpening(o, x, y + g, z) - r;
          if (q < T.opening) {
            T.opening = q;
            T.openingAt = `${where}, ${PART(k)} at ${o.id}`;
          }
        }
        if (walls) {
          for (let j = 0; j < walls.length; j += 1) {
            const wall = w.walls.list[walls[j]];
            const q = toWall(wall, x, y + g, z) - r;
            if (!wall.box) {
              if (q < T.pipe) {
                T.pipe = q;
                T.pipeAt = `${where}, ${PART(k)} at a pipe ${mm((2 * wall.r) / S)} thick`;
              }
            } else if (q < T.box) {
              T.box = q;
              T.boxAt = `${where}, ${PART(k)}`;
            }
          }
        }
      }
      /* The corners, whenever the craft is near, and every eighth frame
       * besides for the shell and the ground. */
      if (near < 0.45 * S || frame % 8 === 0) {
        T.looks += 1;
        skin(drawn, rig, c, face);
        const worst = unwrapped(drawn, P);
        if (worst > T.out) {
          T.out = worst;
          T.outAt = where;
        }
        const out = drawn.out;
        let low = 1e9;
        let nearest = 1e18;
        for (let i = 0; i < drawn.model.count; i += 1) {
          if (!drawn.live[i]) {
            continue;
          }
          const y = out[i * 3 + 1];
          if (y < low) {
            low = y;
          }
          if (craft) {
            const dx = out[i * 3] - cx;
            const dy = y - cy;
            const dz = out[i * 3 + 2] - cz;
            const q = dx * dx + dy * dy + dz * dz;
            if (q < nearest) {
              nearest = q;
            }
          }
        }
        if (low < T.low) {
          T.low = low;
          T.lowAt = where;
        }
        if (craft && Math.sqrt(nearest) - R < T.corner) {
          T.corner = Math.sqrt(nearest) - R;
          T.cornerAt = where;
        }
      }
    }
    t += dt;
    frame += 1;
  }
  const st = life.stats();
  for (const [k, v] of Object.entries(st.moves)) {
    T.moves[k] = (T.moves[k] || 0) + v;
  }
  T.by[flight.name] = st.moves;
  T.pushes += mind.pushes() - pushes0;
  T.nudges += mind.nudges() - nudges0;
  return st;
}

function flyAll(w, R, opt = {}, flights = FLIGHTS) {
  const T = makeTally();
  flights.forEach((f, i) => {
    const before = { ball: T.ball, corner: T.corner, pushes: T.pushes, nudges: T.nudges };
    fly(w, R, f, T, { ...opt, seed: (opt.seed ?? 7) + i });
    if (VERBOSE) {
      console.log(`        ${f.name.padEnd(18)} pushes ${String(T.pushes - before.pushes).padStart(4)}  nudges ${String(T.nudges - before.nudges).padStart(3)}  nearest ball ${T.ball < 1e8 ? (T.ball / w.S).toFixed(3) : '  -  '}  corner ${T.corner < 1e8 ? (T.corner / w.S).toFixed(3) : '  -  '} (running least, cat m)  ${Object.entries(T.by[f.name]).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(' ')}`);
    }
  });
  return T;
}
const cat = (w, v) => `${(v / w.S).toFixed(3)} of a cat's metres`;

const WORLDS = MAPS.map(yardWorld);
const t00 = performance.now();

/* 1. yards */
console.log('\n1. yards');
for (const w of WORLDS) {
  const life = makeCatLife({ track: w.track, solids: w.solids, parts: w.parts, starts: w.starts, seed: 7 });
  const ls = life.lawn.stats();
  const c = life.controls;
  const fromStart = Math.min(...[w.track.start, ...(w.starts || [])].map((p) => Math.hypot(p.x - c.x, p.z - c.z)));
  check(`${w.name}: a lawn, and the cat on it`, life.lawn.stay(c.x, c.z) && ls.rests > 0, `${ls.cols} by ${ls.rows} cells, ${ls.blocked} not lawn, ${ls.rests} places to rest`);
  check('  it begins clear of where a run is set down', fromStart > 1.5 * w.S, `${(fromStart / w.S).toFixed(2)} cat metres from the nearer start`);
  check('  six gate openings found from their pipe', w.openings.length === 6, w.openings.map((o) => `${o.id} ${(o.hw * 2 / w.S).toFixed(2)} wide at ${((o.y - w.g) / w.S).toFixed(2)}`).join(', '));
  check('  walls to keep out of', w.walls.list.length > 0, `${w.walls.list.length} solids near the lawn`);
  /* And a cat that finds itself where it may not be goes back to its lawn.
   * The last word may slide it onto ground that is not its own when there
   * is nowhere else clear of the craft, and what brings it back is its
   * own walk (doEscape). The first of these cats walked to within a hand
   * of the first cell of its lawn, was told that was near enough, and
   * stood there for good: at 3.5 to the metre "arrived" was a hair further
   * than half a cell. So: set down in the mouth of every gate on the
   * grass, on each place on the lawn a run is set down, and off every
   * eighth cell of the lawn's rim by a hand and by a third of a cat's
   * metre, the way a slide leaves it, with no craft about. Each has to be
   * back on its own ground within four seconds and still on it at eight. */
  {
    const { lawn, mind } = life;
    const places = [];
    for (const o of w.openings.filter((q) => q.y - q.hh < w.g + 0.2 * w.S)) {
      for (const side of [-1, 1]) {
        places.push([o.x - o.uz * side * 0.25 * w.S, o.z + o.ux * side * 0.25 * w.S, 'in a gate\'s mouth']);
      }
    }
    /* The map's own start is half a street away at two of the yards, and
     * is nowhere a slide could leave a cat: only a start on the lawn. */
    for (const p of [w.track.start, ...(w.starts || [])]) {
      if (lawn.cellAt(p.x, p.z) >= 0) {
        places.push([p.x, p.z, 'where a run is set down']);
      }
    }
    const rim = (i, j, nx, nz) => {
      if (lawn.hard[j * ls.cols + i] === 0) {
        for (const off of [0.04 * w.S, 0.35 * w.S]) {
          places.push([lawn.x0 + (i + 0.5) * CELL + nx * (CELL / 2 + off), lawn.z0 + (j + 0.5) * CELL + nz * (CELL / 2 + off), 'off the lawn\'s rim']);
        }
      }
    };
    for (let i = 3; i < ls.cols; i += 8) {
      rim(i, 0, 0, -1);
      rim(i, ls.rows - 1, 0, 1);
    }
    for (let j = 3; j < ls.rows; j += 8) {
      rim(0, j, -1, 0);
      rim(ls.cols - 1, j, 1, 0);
    }
    let lost = 0;
    let slowest = 0;
    let where = '';
    let off = 0;
    for (const [x, z, what] of places) {
      mind.force(DOING.indexOf('sit'));
      mind.put(x, z, 0);
      if (lawn.free(x, z)) {
        continue;
      }
      off += 1;
      let home = -1;
      for (let n = 0; n < 8 * 60; n += 1) {
        life.frame(1 / 60, null, CRAFT_WORLD_R, null, true);
        if (home < 0 && lawn.free(c.x, c.z)) {
          home = (n + 1) / 60;
        }
      }
      if (home < 0 || home > 4 || !lawn.free(c.x, c.z)) {
        lost += 1;
        where = where || `${what}, ${x.toFixed(1)}, ${z.toFixed(1)}: ${home < 0 ? 'never back' : `back after ${home.toFixed(1)} s`}, ends at ${c.x.toFixed(1)}, ${c.z.toFixed(1)}`;
      }
      slowest = Math.max(slowest, home);
    }
    check('  set down where it may not be, it walks back onto its lawn', off >= 12 && lost === 0,
      `${off} places off its ground, ${lost} not back in four seconds${lost ? ` (${where})` : `, the slowest ${slowest.toFixed(1)} s`}`);
  }
}

/* 2. shell: the postures, each dressed every way, both models. */
console.log('\n2. shell');
{
  const S = 3.5;
  const DRESS = [
    {}, { low: 0.6 }, { jaw: 1 }, { flatL: 1, flatR: 1, whisk: -1 }, { whisk: 1, earL: 1.4, earR: 1.4 }, { bristle: 1, hackle: 1, tailUp: 1.05 },
    { wag: 0.6, wagHz: 3, twitch: 1 }, { freeL: 1, freeR: 1 }, { tilt: 0.4, lookX: 0, lookY: 0.2 * S, lookZ: 9, look: 1 }, { lookX: 0, lookY: 3 * S, lookZ: -9, look: 1 },
    { lookX: -9, lookY: 0.05 * S, lookZ: 0, look: 1 }, { wiggle: 1, tread: 1, low: 0.3 }, { lean: 0.3, pitch: 0.4 }, { give: 1 },
    { hackle: 1 }, { hackle: 0.5, low: 0.5 }, { hackle: 1, lean: 0.3, pitch: 0.4, jaw: 1 },
  ];
  let worst = 0;
  let worstAt = '';
  let poses = 0;
  for (const [name, p] of Object.entries(POSTURE)) {
    for (const dress of DRESS) {
      const rig = makeRig(S);
      const c = makeControls();
      c.posture = p;
      if (name === 'air') {
        c.lift = 0.25;
        c.air = 0.45;
        c.freeHind = 1;
      }
      Object.assign(c, dress);
      const airs = name === 'air' ? [0.1, 0.3, 0.5, 0.7, 0.9] : [0];
      for (const up of name === 'air' ? [0, 1] : [0]) {
        for (const air of airs) {
          c.air = air;
          c.up = up;
          for (let k = 0; k < 90; k += 1) {
            rig.step(1 / 60, c);
          }
          poses += 1;
          for (const d of DRAWN) {
            skin(d, rig, c, null);
            const q = unwrapped(d, rig.probes);
            if (q > worst) {
              worst = q;
              worstAt = `${name} ${JSON.stringify(dress)}${d.lite ? ', Low\'s model' : ''}`;
            }
          }
        }
      }
    }
  }
  check('every corner of both models inside a ball, in every posture however dressed', worst < 0.0005 * S, `${poses} poses, ${DRAWN[0].model.count} and ${DRAWN[1].model.count} corners, worst ${mm(worst / S)} of a cat's size out${worst > 0 ? ` (${worstAt})` : ''}`);
}

/* 3, 4, 5: every flight at every yard with every craft flown there. */
const MOVES = ['stalk', 'freeze', 'wiggle', 'bigEyes', 'pounce', 'leap', 'swat', 'bat', 'chatter', 'tilt', 'ambush', 'chase', 'startle', 'duck', 'backoff', 'hiss', 'flee', 'sniff', 'tap', 'slowBlink', 'groom', 'sleep', 'stretch', 'yawn'];
const hashes = {};
console.log('\n3 to 5. touch, place and moves');
for (const w of WORLDS) {
  /* The whoop is the five inch plant at the world's own scale in a house
   * built 3.5 times life size, and a five inch flown in such a house is
   * drawn 3.5 times bigger. Bardwell's house is life size: one sweep. */
  const crafts = w.id === 'bardwell' ? [['either craft', CRAFT_WORLD_R]] : [['the whoop', CRAFT_WORLD_R], ['the five inch', CRAFT_WORLD_R * w.S]];
  for (const [what, R] of crafts) {
    const lite = what !== 'the whoop' && w.id !== 'bardwell';
    const T = flyAll(w, R, { lite });
    const floor = KEEP * w.S - 1e-3;
    console.log(`  ${w.name}, ${what} (sweep ${R.toFixed(4)} m, kept off by ${(R + KEEP * w.S).toFixed(3)} m): ${T.frames} frames, ${T.looks} of them corner by corner on ${lite ? 'Low\'s model' : 'the full model'}`);
    check('    no ball of the cat nearer the craft than KEEP', T.ball >= floor, `least ${cat(w, T.ball)} (${T.ballAt}); KEEP is ${KEEP}`);
    check('    no drawn corner of it either', T.corner >= floor, `least ${cat(w, T.corner)} (${T.cornerAt})`);
    check('    every corner inside a ball all the while', T.out < 0.0005 * w.S, `worst ${mm(T.out / w.S)} out${T.out > 0 ? ` (${T.outAt})` : ''}`);
    check('    no NaN', T.nan === 0, `${T.nan}`);
    check('    no ball of it in the opening of a gate, nor within GAP of one', T.opening >= GAP * w.S - 1e-3, `nearest ${cat(w, T.opening)} (${T.openingAt}); GAP is ${GAP}`);
    check('    no ball of it in a post, a pole, a trunk or a bar', T.pipe >= 0, `nearest ${cat(w, T.pipe)} (${T.pipeAt})`);
    /* Every box of the collider set near the lawn, the roofs a cat can
     * stand under as well as the walls it cannot. The lawn keeps where the
     * cat stands half its width from a wall and the last word keeps the
     * rest of it out; a roof is kept off by how high the cat may leap. */
    check('    and none in a wall', T.box >= 0, T.box < 1e8 ? `nearest ${cat(w, T.box)} (${T.boxAt})` : 'none stands within its reach');
    check('    never sunk in the ground', T.low > -0.07 * w.S, `lowest corner ${mm(T.low / w.S)} (${T.lowAt})`);
    check('    never off its lawn', T.offBox === 0 && T.offLawn === 0, `${T.offBox} frames out of it, ${T.offLawn} standing where it may not`);
    check('    no ball further from its spot, or higher, than the last word looks', T.reach <= REACH * w.S && T.high <= CEIL * w.S, `furthest ${cat(w, T.reach)} and highest ${cat(w, T.high)}; it looks ${REACH} and ${CEIL}`);
    check('    never asleep in its bones with the craft near', T.asleepNear === 0, `${T.posed} of ${T.frames} frames posed`);
    const missing = MOVES.filter((k) => !(T.moves[k] > 0));
    check('    every move made', missing.length === 0, missing.length ? `never: ${missing.join(', ')}` : MOVES.map((k) => `${k} ${T.moves[k]}`).join(', '));
    /* And made where the track is. A craft hung in a gate, or over the
     * place a run is set down, is over ground the cat may not stand on. The
     * first cat sat where it was and stared at it. This one comes as near
     * as it may and goes at it from there: a stalk and a strike for every
     * gate the craft is hung in, twenty two seconds each. */
    const strikes = (m) => m.swat + m.pounce + m.leap;
    const holes = inGates({ w }).length;
    const gates = T.by['hung in the gates'];
    check('    a craft hung in a gate is stalked and struck at from as near as the cat may come', gates.stalk >= holes && strikes(gates) >= holes,
      `${holes} gates on the grass: stalked ${gates.stalk} times, struck at ${strikes(gates)} (${gates.swat} on its hind legs, ${gates.pounce} pounces, ${gates.leap} leaps)`);
    const start = T.by['at the start'];
    check('    and so is one hung over the start, and one sat on the start is come to and sniffed', start.stalk >= 2 && strikes(start) >= 1 && start.sniff >= 1,
      `stalked ${start.stalk} times, struck at ${strikes(start)}, sniffed ${start.sniff}, the slow blink ${start.slowBlink}`);
    /* And chased, it does what a cat does: after the third fright it is
     * off across the lawn, and is not pushed along in front of the craft. */
    const chased = T.by.chased;
    check('    chased, it runs', chased.flee >= 3, `ran ${chased.flee} times in ${chased.startle} frights`);
    console.log(`          slid off the craft by the last word in ${T.pushes} frames of ${T.frames}, and eased out of a gate or off a post with no craft by in ${T.nudges}`);
    hashes[w.id] = hashes[w.id] || T.hash.digest('hex');
  }
}

/* 6. rates, sizes, and out of the picture: the hard flights only. */
console.log('\n6. rates');
{
  const HARD = FLIGHTS.filter((f) => ['hover at 0.35', 'hover at 1.3', 'laps at 7 m/s', 'laps at 18 m/s', 'flown at', 'crept into', 'circled', 'at random', 'set down on it', 'dived on', 'hung in the gates', 'chased'].includes(f.name));
  const w = WORLDS[0];
  const floor = KEEP * w.S - 1e-3;
  for (const [name, opt, R] of [
    ['30 frames a second', { fps: 30 }, CRAFT_WORLD_R], ['144 frames a second', { fps: 144 }, CRAFT_WORLD_R], ['240 frames a second', { fps: 240 }, CRAFT_WORLD_R],
    ['a frame time that stutters and stalls', { jitter: true }, CRAFT_WORLD_R], ['a stutter with the five inch', { jitter: true, lite: true }, CRAFT_WORLD_R * w.S],
    ['a craft of 3 cm', {}, 0.03], ['a craft of 1.2 m', {}, 1.2],
  ]) {
    const T = flyAll(w, R, { ...opt, seed: 23 }, HARD);
    check(`${name}: never touched, never unwrapped, never in a gate, a post or a wall, never off the lawn`,
      T.ball >= floor && T.corner >= floor && T.out < 0.0005 * w.S && T.nan === 0 && T.opening >= GAP * w.S - 1e-3 && T.pipe >= 0 && T.box >= 0 && T.offBox === 0,
      `least ball ${cat(w, T.ball)}, corner ${cat(w, T.corner)}, gate ${(T.opening / w.S).toFixed(3)}, post ${(T.pipe / w.S).toFixed(3)}, wall ${T.box < 1e8 ? (T.box / w.S).toFixed(3) : 'none'}, ${T.frames} frames, slid ${T.pushes} times`);
  }
  for (const v of WORLDS) {
    const T = flyAll(v, CRAFT_WORLD_R, { seen: 'cone', seed: 31 }, HARD);
    check(`${v.name}, in the picture only when looked at: never touched, never in a gate, a post or a wall, bones left alone when far and never when near`,
      T.ball >= KEEP * v.S - 1e-3 && T.corner >= KEEP * v.S - 1e-3 && T.nan === 0 && T.asleepNear === 0 && T.posed < T.frames && T.opening >= GAP * v.S - 1e-3 && T.pipe >= 0 && T.box >= 0 && T.offBox === 0,
      `least ball ${cat(v, T.ball)}, corner ${cat(v, T.corner)}, gate ${(T.opening / v.S).toFixed(3)}, post ${(T.pipe / v.S).toFixed(3)} (${T.pipeAt}), wall ${T.box < 1e8 ? (T.box / v.S).toFixed(3) : 'none'}, posed ${T.posed} of ${T.frames} frames`);
  }
}

/* 7. twice */
console.log('\n7. twice');
{
  const w = WORLDS[0];
  const again = flyAll(w, CRAFT_WORLD_R, {}).hash.digest('hex');
  check('the same seed lives the same life to the bit', again === hashes[w.id], again.slice(0, 16));
  const other = flyAll(w, CRAFT_WORLD_R, { seed: 8 }).hash.digest('hex');
  check('and another seed another', other !== again, other.slice(0, 16));
}

/* 8. breach */
console.log('\n8. breach');
{
  const w = WORLDS[0];
  const FOUL = FLIGHTS.filter((f) => ['set down on it', 'crept into', 'dived on'].includes(f.name));
  const bare = flyAll(w, CRAFT_WORLD_R, { unsettled: true }, FOUL);
  const kept = flyAll(w, CRAFT_WORLD_R, {}, FOUL);
  check('without the mind\'s last word the craft is touched, and the check sees it', bare.ball < 0 && bare.corner < 0,
    `ball ${cat(w, bare.ball)}, corner ${cat(w, bare.corner)} (${bare.cornerAt})`);
  check('with it, the same flights never come under KEEP', kept.ball >= KEEP * w.S - 1e-3 && kept.corner >= KEEP * w.S - 1e-3,
    `ball ${cat(w, kept.ball)}, corner ${cat(w, kept.corner)}, slid ${kept.pushes} times`);
  /* And the gates and the posts, which the cat meets in the ordinary way of
   * things: every flight, at the last yard, where the trees are. */
  const v = WORLDS[WORLDS.length - 1];
  const loose = flyAll(v, CRAFT_WORLD_R, { unsettled: true });
  check('without it a nose or a tail is in a gate and in a post, and the check sees both', loose.opening < 0 && loose.pipe < 0,
    `${v.name}: gate ${cat(v, loose.opening)} (${loose.openingAt}), post ${cat(v, loose.pipe)} (${loose.pipeAt})`);
}

/* 9. cost */
console.log('\n9. cost');
{
  const w = WORLDS[WORLDS.length - 1];
  const life = makeCatLife({ track: w.track, solids: w.solids, parts: w.parts, starts: w.starts, seed: 7 });
  const path = laps(7)({ w });
  const eye = { x: 0, y: 0, z: 0, fx: 1, fy: 0, fz: 0 };
  const N = 60000;
  for (let i = 0; i < 3000; i += 1) {
    life.frame(1 / 60, path(i / 60, 1 / 60), CRAFT_WORLD_R, eye, true);
  }
  const t0 = performance.now();
  for (let i = 0; i < N; i += 1) {
    life.frame(1 / 60, path(i / 60, 1 / 60), CRAFT_WORLD_R, eye, true);
  }
  const each = (performance.now() - t0) / N;
  check('a frame of the cat is a small part of a millisecond', each < 0.25, `${(each * 1000).toFixed(1)} microseconds a frame over ${N} frames of laps at ${w.name}, mind, bones and last word`);
}

console.log(`\n${((performance.now() - t00) / 1000).toFixed(1)} s`);
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
