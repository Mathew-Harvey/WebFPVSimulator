/*
 * index.js: Hanabi Sound as a map, built the way Tonbo Fest is
 * (../fest/index.js): the built map's pipeline (../built/index.js) does the
 * sky, the ground, the ink, the shadows, the colliders, the cull, the named
 * gaps, the marks. This file hands it the document (./yard.js) and the
 * venue (./venue.js) as one structure, draws what the venue's parts cannot
 * say (the truss, the stage roof's vault, the tents' slopes, the flags, the
 * fence's mesh, a handful of people), hangs the signs on one picture
 * (./signs.js), adds the show (./show.js: the crowd, the fireworks, the
 * lasers, the screens), and names the world.
 *
 * FOR THE LATENCY RULE. Per frame: Tonbo Fest's near cull (forty two
 * bounds tests) and the show's one clock write. Draw calls are kept down
 * the way Tonbo Fest keeps them: twelve chunks, each chunk's plain colours
 * folded into one batch with the colour on its vertices
 * (../sunny/palette.js); the set dressing is drawn near the camera only and
 * not at all on Low; every sign is one mesh on one texture, every wire one
 * set of lines. The show adds six draws, none of them in the shadow pass.
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
import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import { qualityFor } from '../../render/quality.js';
import { paintMaterial } from '../../art/stf.js';
import { signAspect } from '../../art/partnermark.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { partnerAllowed } from '../../steam/edition.js';
import { mergeProps } from '../sunny/palette.js';
import { venueLayout, w, chunkOf, nearOf, BANNERS, HIDDEN_KONEX } from './venue.js';
import { concertDocument } from './yard.js';
import { paintSigns, signMesh } from './signs.js';
import { buildShow } from './show.js';

const DEG = Math.PI / 180;

/* How near the dressing is drawn, by preset; Low draws none of it. */
const NEAR_R = { medium: 40, high: 55 };

/* The chunk a drawn thing is filed under, from a world point. */
const cellAt = (thing, x, z) => (thing && thing.near ? nearOf(x, z) : chunkOf(x, z));
const cellPlan = (thing, px, py) => {
  const p = w(px, py);
  return cellAt(thing, p[0], p[2]);
};

/* ---- the shapes the kit has no word for ---- */

/* A four sided roof rising from a rectangle to a point, both faces. */
function pyramid(o) {
  const a = w(o.x0, o.y0, o.h0);
  const b = w(o.x1, o.y1, o.h0);
  const top = w((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, o.h1);
  const c = [[a[0], o.h0, a[2]], [b[0], o.h0, a[2]], [b[0], o.h0, b[2]], [a[0], o.h0, b[2]]];
  const pos = [];
  for (let i = 0; i < 4; i += 1) {
    const p = c[i];
    const q = c[(i + 1) % 4];
    pos.push(...q, ...p, ...top);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const back = g.clone();
  const arr = back.attributes.position.array;
  for (let i = 0; i < arr.length; i += 9) {
    for (let k = 0; k < 3; k += 1) {
      const t = arr[i + 3 + k];
      arr[i + 3 + k] = arr[i + 6 + k];
      arr[i + 6 + k] = t;
    }
  }
  back.computeVertexNormals();
  return [g, back];
}

/* A sheet of fence mesh between two plan points, its squares ten
 * centimetres whatever its size. */
function netSheet(o) {
  const a = w(o.a[0], o.a[1]);
  const b = w(o.b[0], o.b[1]);
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const ht = o.h1 - o.h0;
  const pos = [a[0], o.h0, a[2], b[0], o.h0, b[2], b[0], o.h1, b[2], a[0], o.h1, a[2]];
  const u = len / 1.0;
  const v = ht / 0.6;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, v], 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/* A person, Tonbo Fest's: a body narrowing to the shoulders, a head, an
 * arm up if cheering, headphones if crew; sat, the knees forward. */
function person(kit, f, low) {
  const [x, , z] = w(f.x, f.y);
  const h = f.h;
  const tall = f.sit ? 0.95 : 1.68;
  const top = h + tall;
  const body0 = f.sit ? h + 0.42 : h;
  kit.cyl(f.shirt, [x, body0, z], [x, top - 0.3, z], f.sit ? 0.21 : 0.23, 6, 0.16);
  kit.blob('drSkin', [x, top - 0.12, z], 0.16, 0.17, [0, f.x, 0]);
  const c = Math.cos(f.face * DEG);
  const s = -Math.sin(f.face * DEG);
  if (f.sit) {
    kit.cyl('drIndigo', [x, h + 0.45, z], [x + c * 0.45, h + 0.45, z + s * 0.45], 0.09, 4);
    kit.cyl('drIndigo', [x + c * 0.45, h + 0.45, z + s * 0.45], [x + c * 0.5, h, z + s * 0.5], 0.07, 4);
  }
  if (low) {
    return;
  }
  if (f.phones) {
    kit.cyl('drToriiBlack', [x - s * 0.17, top - 0.13, z + c * 0.17], [x + s * 0.17, top - 0.13, z - c * 0.17], 0.06, 6);
  }
  if (f.cheer) {
    kit.cyl('drSkin', [x - s * 0.15, top - 0.38, z + c * 0.15], [x - s * 0.24 + c * 0.05, top + 0.25, z + c * 0.24 + s * 0.05], 0.05, 4);
  }
}

/* A square box truss between two plan points with heights, side s: four
 * chords and a zigzag on each face, as a stage's is. Tonbo Fest's. */
function truss(kit, o, low) {
  const A = new THREE.Vector3(...w(...o.a));
  const B = new THREE.Vector3(...w(...o.b));
  const d = B.clone().sub(A);
  const len = d.length();
  d.normalize();
  const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(d, ref).normalize().multiplyScalar(o.s / 2);
  const v = new THREE.Vector3().crossVectors(d, u).normalize().multiplyScalar(o.s / 2);
  const corners = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
  const r = o.s > 0.9 ? 0.045 : 0.03;
  for (const k of corners) {
    kit.cyl('fsTrussSilver', A.clone().add(k).toArray(), B.clone().add(k).toArray(), r, 4);
  }
  if (low) {
    return;
  }
  const n = Math.max(1, Math.round(len / o.s));
  for (let f = 0; f < 4; f += 1) {
    const k0 = corners[f];
    const k1 = corners[(f + 1) % 4];
    for (let i = 0; i < n; i += 1) {
      const p = A.clone().addScaledVector(d, (len * i) / n).add(i % 2 ? k0 : k1);
      const q = A.clone().addScaledVector(d, (len * (i + 1)) / n).add(i % 2 ? k1 : k0);
      kit.cyl('fsTrussSilver', p.toArray(), q.toArray(), r * 0.55, 3);
    }
  }
}

/* A festival flag on its pole: a tall sail, curved at the top. */
function flagSail(kit, o) {
  const [x, , z] = w(o.x, o.y);
  const pts = [];
  const n = 6;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const h = o.h0 + (o.h1 - o.h0) * t;
    const width = 0.55 + 0.35 * Math.sin(t * Math.PI * 0.85);
    pts.push([x, h, z], [x + width, h + 0.05 * Math.sin(t * Math.PI), z + 0.12 * Math.sin(t * 3)]);
  }
  const pos = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[i * 2];
    const b = pts[i * 2 + 1];
    const c = pts[i * 2 + 2];
    const d = pts[i * 2 + 3];
    pos.push(...a, ...b, ...d, ...a, ...d, ...c);
    pos.push(...a, ...d, ...b, ...a, ...c, ...d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  kit.add(o.m, g);
}

/* ---- the ops ---- */

function drawOp(kit, o, low) {
  if (low && (o.fine || o.near)) {
    return;
  }
  switch (o.t) {
    case 'obox': {
      const p = w(o.c[0], o.c[1], o.c[2]);
      kit.begin(p[0], p[1], p[2], o.deg * DEG, cellAt(o, p[0], p[2]));
      kit.box(o.m, -o.size[0] / 2, 0, -o.size[1] / 2, o.size[0] / 2, o.size[2], o.size[1] / 2);
      break;
    }
    case 'ball': {
      const p = w(...o.c);
      kit.begin(0, 0, 0, 0, cellAt(o, p[0], p[2]));
      kit.ball(o.m, p, o.r);
      break;
    }
    case 'ladder': {
      const a = w(...o.a);
      kit.begin(0, 0, 0, 0, cellAt(o, a[0], a[2]));
      kit.ladder(o.m, a, w(...o.b), 0.45);
      break;
    }
    case 'pyr': {
      kit.begin(0, 0, 0, 0, cellPlan(o, (o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2));
      for (const g of pyramid(o)) {
        kit.add(o.m, g);
      }
      break;
    }
    case 'net':
      kit.begin(0, 0, 0, 0, cellPlan(o, (o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2));
      kit.add('net', netSheet(o));
      break;
    case 'cylv': {
      const p = w(o.x, o.y);
      kit.begin(0, 0, 0, 0, cellAt(o, p[0], p[2]));
      kit.cyl(o.m, [p[0], o.h0, p[2]], [p[0], o.h1, p[2]], o.r, o.seg ?? 8);
      break;
    }
    case 'cylx': {
      const p = w(o.x, o.y, o.h);
      kit.begin(0, 0, 0, 0, cellAt(o, p[0], p[2]));
      kit.cyl(o.m, p, [p[0] + (o.len ?? 0.1), p[1], p[2]], o.r, 8);
      break;
    }
    case 'truss': {
      const p = w(...o.a);
      kit.begin(0, 0, 0, 0, cellAt(o, p[0], p[2]));
      truss(kit, o, low);
      break;
    }
    case 'vault': {
      /* An arched skin across x, extruded along the plan's y. */
      kit.begin(0, 0, 0, 0, cellPlan(o, (o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2));
      const N = 10;
      const prof = [];
      for (let i = 0; i <= N; i += 1) {
        const t = i / N;
        prof.push([w(o.x0 + (o.x1 - o.x0) * t, 0)[0], o.h0 + o.rise * Math.sin(Math.PI * t)]);
      }
      for (let i = N; i >= 0; i -= 1) {
        prof.push([prof[i][0], prof[i][1] + 0.3]);
      }
      kit.extrude(o.m, prof, w(0, o.y1)[2], w(0, o.y0)[2]);
      break;
    }
    case 'flag':
      kit.begin(0, 0, 0, 0, cellPlan(o, o.x, o.y));
      flagSail(kit, o);
      break;
    case 'wheel': {
      /* A truck's wheel, its axle along the plan's y. */
      const p = w(o.x, o.y, 0.42);
      kit.begin(0, 0, 0, 0, cellAt(o, p[0], p[2]));
      kit.cyl('drTyre', [p[0], 0.42, p[2] - 0.12], [p[0], 0.42, p[2] + 0.12], 0.42, 10);
      break;
    }
    default:
      break;
  }
}

/* The cables as one set of lines. */
function wireLines(wires) {
  const pts = [];
  const sagAt = (A, B, sag, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t];
  for (const wi of wires) {
    const A = w(...wi.a);
    const B = w(...wi.b);
    const N = wi.sag > 0 ? 8 : 1;
    for (let i = 0; i < N; i += 1) {
      pts.push(...sagAt(A, B, wi.sag, i / N), ...sagAt(A, B, wi.sag, (i + 1) / N));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.computeBoundingSphere();
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2c2a33 }));
  lines.name = 'concert wire lines';
  return lines;
}

/* The near cull, Tonbo Fest's, for this map's near cells. */
function nearCull(props, r) {
  const cells = [];
  const bb = new THREE.Box3();
  for (const g of props.children) {
    if (!g.name.startsWith('props:cn')) {
      continue;
    }
    bb.makeEmpty();
    for (const m of g.children) {
      if (!m.geometry) {
        continue;
      }
      if (!m.geometry.boundingBox) {
        m.geometry.computeBoundingBox();
      }
      bb.union(m.geometry.boundingBox);
    }
    if (!bb.isEmpty()) {
      cells.push({ group: g, x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, on: true });
    }
  }
  const r2 = r * r;
  return {
    to(eye) {
      for (let i = 0; i < cells.length; i += 1) {
        const c = cells[i];
        const dx = Math.max(0, c.x0 - eye.x, eye.x - c.x1);
        const dz = Math.max(0, c.z0 - eye.z, eye.z - c.z1);
        c.on = dx * dx + dz * dz <= r2;
        c.group.visible = c.on;
      }
    },
    stats: () => ({ cells: cells.length, on: cells.filter((c) => c.on).length, radius: r }),
  };
}

/*
 * THE MARKS. The partners' and patrons' banners on the barrier and the
 * desk's pen, one each in the roster's order, and the one hidden Konex
 * Drone sign in the north delay tower. The Steam edition hangs only the
 * partners its profile clears (partnerAllowed).
 */
const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS]
  .filter((p) => shownOn(p, 'concert') && partnerAllowed(p.slug));

export function concertMarkSpots() {
  const out = BRANDS.slice(0, BANNERS.length).map((brand, i) => {
      const b = BANNERS[i];
      const n = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[b.face];
      const px = b.x + n[0] * 0.04;
      const py = b.y + n[1] * 0.04;
      const [x, y, z] = w(px, py, 0.66);
      const wd = Math.min(2.6, 0.95 * signAspect(brand));
      return { slug: brand.slug, p: [x, y, z], n: [n[0], 0, -n[1]], up: [0, 1, 0], w: wd, chunk: chunkOf(x, z) };
    });
  if (BRANDS.some((b) => b.slug === 'konexdrone')) {
    const [x, y, z] = w(HIDDEN_KONEX.x, HIDDEN_KONEX.y, HIDDEN_KONEX.h);
    out.push({ slug: 'konexdrone', key: 'concert#konexdrone~hidden', p: [x, y, z], n: [0, 0, 1], up: [0, 1, 0], w: HIDDEN_KONEX.w, chunk: chunkOf(x, z) });
  }
  return out;
}

export async function buildMap(shell, onProgress, options) {
  const qid = qualityFor(options && options.quality).id;
  const low = qid === 'low';
  const L = venueLayout();
  const doc = concertDocument(L.gaps);
  const extra = {
    el: { id: 'concert', type: 'concert' },
    /* On Low the fine parts are left out of what is drawn; none is solid. */
    parts: low ? L.parts.filter((p) => !(p.fine && !p.solid)) : L.parts,
    draw: (kit) => {
      for (const o of L.ops) {
        drawOp(kit, o, low);
      }
      for (const f of L.fans) {
        const p = w(f.x, f.y);
        kit.begin(0, 0, 0, 0, chunkOf(p[0], p[2]));
        person(kit, f, low);
      }
    },
    chunkOf: (x, z, p) => cellAt(p, x, z),
  };
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), inkFacets: false, document: doc, extra, sponsorMarks: false, markSpots: concertMarkSpots(),
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js). */
  map.id = 'concert';
  map.source = 'concert';
  const props = map.scene.getObjectByName('props');
  /* The dressing casts no shadow: the pipeline gave each near cell its own
   * casters, and they go, as Tonbo Fest's do. */
  if (props) {
    for (const g of props.children) {
      if (!g.name.startsWith('props:cn')) {
        continue;
      }
      for (const m of [...g.children]) {
        if (m.userData.shadowProxy) {
          g.remove(m);
          m.geometry.dispose();
        }
      }
    }
  }
  const palette = props ? mergeProps(props, map, shell) : { from: 0, to: 0 };
  const stats = map.stats;
  const near = props && !low ? nearCull(props, NEAR_R[qid] || NEAR_R.high) : null;
  if (near) {
    const focus = map.updateShadowFocus;
    map.updateShadowFocus = (target) => {
      focus(target);
      near.to(shell.camera.position);
    };
    near.to(shell.camera.position);
  }
  /* The show: the crowd, the fireworks, the lasers, the screens. Its clock
   * rides the wind's call, which the shell makes once a drawn frame with
   * the page's wall clock in seconds. */
  const show = buildShow(L, low);
  map.scene.add(show.group);
  const rt = map.post && map.post.rtScene;
  const wind = map.updateWind;
  map.updateWind = (t, focus, wash) => {
    wind.call(map, t, focus, wash);
    show.tick(t, rt ? rt.height : 0);
  };
  show.tick(0, rt ? rt.height : 0);
  map.stats = () => ({ ...(stats ? stats() : {}), palette, near: near ? near.stats() : null, show: show.stats() });
  /* The signs, one mesh on one picture, and the wires, one set of lines. */
  const atlas = paintSigns(L.signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  map.scene.add(signMesh(THREE, L.signs, atlas, paintMaterial(THREE, tex), low));
  map.scene.add(wireLines(L.wires));
  const dispose = map.dispose;
  map.dispose = () => {
    show.group.traverse((o) => {
      if (o.geometry) {
        o.geometry.dispose();
      }
    });
    if (dispose) {
      dispose.call(map);
    }
  };
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
