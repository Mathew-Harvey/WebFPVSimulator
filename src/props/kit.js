/*
 * kit.js: turn freestyle assets into meshes, in the town's cel style, in as
 * few draw calls as the materials allow.
 *
 * Every asset in src/props is a layout (what is solid, pure data) and a draw
 * (the paint on top). This is the only file that knows about Three.js: it
 * draws each part the layout marked as drawn, hands itself to the asset's
 * draw() as `K`, and collects everything into one batch per material, so a
 * map of two hundred assets is a few dozen draw calls rather than tens of
 * thousands. The builder's 3D preview and the sim's built map both draw
 * through here, which is what makes the preview the game.
 *
 * THE MATERIALS ARE THE TOWN'S: cel() and flat() from the vendored toon kit,
 * out of its palette, tinted its cool violet in shadow. A few colours the
 * town has no use for (a crane's yellow, a container's red, a scaffold's
 * galvanising) are added, each pulled toward the town's range the way
 * src/maps/city/places/kit.js pulls its rust and tile, so a crane beside a
 * house looks as if one artist drew both.
 *
 * The town's own vehicles and vending machines are drawn by the vendored
 * builders and their meshes folded into the same batches.
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
import { PAL } from '../maps/city/vendored/core/palette.js';
import { cel, flat } from '../maps/city/vendored/core/toon.js';
import { bake } from '../maps/city/vendored/core/util.js';
import * as TownTex from '../maps/city/vendored/core/textures.js';
import { makeVehicle, CAR } from '../maps/city/vendored/world/vehicles.js';
import { makeVendingMachine } from '../maps/city/vendored/world/vending.js';
import { paintGateHeader, paintGateSleeve, bannerCanvas, BANNER_SIZE } from '../art/banners.js';
import { styleOf } from './types.js';
import { assetOf, partsOf, FAMILY_MATERIALS, FAMILY_PAINTERS } from './catalog.js';
import * as PT from './textures.js';

/* The town's standard shadow tints. */
const T = 0x6f6790;
const TD = 0x5c5680;

/*
 * EVERY MATERIAL AN ASSET MAY NAME. `c` is a lit cel material, `f` is an
 * unlit flat one (glass, lamps, paint that should not take a light band).
 * `noCast` keeps it out of the shadow pass; `noReceive` keeps shadow off it,
 * which is what the town does to blossom so a canopy does not go grey.
 */
const SPEC = {
  /* walls, the town's own */
  wallCream: { c: PAL.wallCream }, wallBlue: { c: PAL.wallBlue }, wallPink: { c: PAL.wallPink },
  wallTea: { c: PAL.wallTea }, wallSage: { c: PAL.wallSage }, wallWhite: { c: PAL.wallWhite },
  wallGray: { c: PAL.wallGray },
  concrete: { c: PAL.concrete }, concreteMid: { c: PAL.concreteMid, tint: 0x6a6288 },
  concreteDark: { c: PAL.concreteDark, tint: 0x655d84 },
  /* the bando: weathered, warmer, and a block infill that is not render */
  concreteWorn: { c: 0xbdb6bb, tint: 0x655d84 }, slab: { c: 0xc8c2c8, tint: 0x655d84 },
  block: { c: 0xc2b8ae, tint: 0x6a6288 }, blockDark: { c: 0xa69c95, tint: 0x5f5880 },
  rubble: { c: 0xa19a93, tint: 0x5f5880 },
  /* sheet metal, three colours, and a darker rib for each */
  sheet: { c: 0xb2b0aa, tint: 0x64607f }, sheetRib: { c: 0x929089, tint: 0x5a5678 },
  sheetBlue: { c: 0xa4b8c8, tint: 0x64607f }, sheetBlueRib: { c: 0x8298aa, tint: 0x5a5678 },
  sheetGreen: { c: 0xadc0a8, tint: 0x64607f }, sheetGreenRib: { c: 0x8ca487, tint: 0x5a5678 },
  trim: { c: PAL.trim, tint: TD }, band: { c: 0xcfc9d3 }, balcony: { c: PAL.wallWhite },
  acUnit: { c: 0xe6e3dc }, awning: { c: PAL.redSoft }, tank: { c: 0xdfe7ec }, tankSeam: { c: 0xb4c1ca },
  door: { c: 0x8f98ab, tint: TD },
  metal: { c: PAL.metal, tint: 0x666090 }, metalDark: { c: PAL.metalDark, tint: TD },
  rust: { c: 0xa87a5e, tint: 0x6a5a80 }, rustDeep: { c: 0x8a5c46, tint: 0x5f4f74 },
  brick: { c: 0x9c6c54, tint: 0x62527a }, soot: { c: 0x4c4454, tint: 0x3f3a50 },
  shutter: { c: PAL.shutter, tint: TD }, shutterLight: { c: PAL.shutterLight, tint: TD },
  yellow: { c: PAL.yellow, tint: 0x7a6a78 },
  /* glass and light */
  glass: { f: PAL.glass, noCast: true }, glassDark: { f: PAL.glassDark, noCast: true },
  glassBlue: { f: 0x86abc9, noCast: true }, glassLit: { f: 0xffe4ad, noCast: true },
  glassShop: { f: 0xc0d9e2, noCast: true },
  curtainPink: { f: 0xf2c9d2, noCast: true }, curtainBlue: { f: 0xc2d5ea, noCast: true },
  curtainCream: { f: 0xf4e7cb, noCast: true }, curtainGreen: { f: 0xd0e3cd, noCast: true },
  lampGlow: { f: 0xfff4d8, noCast: true }, lampRed: { f: 0xff5145, noCast: true },
  lampHead: { c: 0x5e5c68, tint: TD },
  /* industrial */
  craneYellow: { c: 0xf2bd34, tint: 0x7d6a74 }, craneYellowDeep: { c: 0xd89c22, tint: 0x6d5a70 },
  white: { c: 0xf4f2f0 }, rope: { c: 0x3d3a45, tint: 0x4b4560 }, hook: { c: PAL.yellow },
  towerSteel: { c: 0xa3b6c0, tint: 0x646080 }, rod: { c: 0x828e97, tint: 0x5c5680 },
  tankPaint: { c: 0xe8eef3, tint: 0x7d74a0 }, grating: { c: 0x7a8390, tint: TD },
  mastRed: { c: 0xe0453f, tint: 0x7a4a6a }, mastWhite: { c: 0xf4f2f6, tint: 0x7d74a0 },
  pylon: { c: 0xa0a99f, tint: 0x62607e }, insulator: { c: 0x6f8f8a, tint: 0x4f5a70 },
  insulatorWhite: { c: 0xe8e4dc },
  containerRed: { c: 0xb8483f, tint: 0x6a4a6a }, containerRedRib: { c: 0x983a34, tint: 0x5a3e60 },
  containerBlue: { c: 0x3f71aa, tint: 0x4a4a7a }, containerBlueRib: { c: 0x335d8e, tint: 0x3f4070 },
  containerGreen: { c: 0x508c5e, tint: 0x4a5a6a }, containerGreenRib: { c: 0x42764f, tint: 0x3f4d60 },
  containerOrange: { c: 0xd9793c, tint: 0x7a5068 }, containerOrangeRib: { c: 0xb96533, tint: 0x6a4460 },
  containerTeal: { c: 0x2f918e, tint: 0x3f5a70 }, containerTealRib: { c: 0x277a77, tint: 0x344d66 },
  containerGrey: { c: 0x8e919b, tint: 0x5a5678 }, containerGreyRib: { c: 0x767983, tint: 0x4d4a6c },
  containerWhite: { c: 0xe7e5df }, containerWhiteRib: { c: 0xc9c6bf, tint: TD },
  cornerCasting: { c: 0x4a4552, tint: 0x3f3a50 }, containerInside: { f: 0x34303f },
  scaffold: { c: 0x93a3b2, tint: 0x5f5c80 }, plywood: { c: 0xc9a676, tint: 0x6f5f7a },
  toeBoard: { c: 0xb58f5c, tint: 0x6a5a78 },
  net: { net: true },
  hazard: { stripes: true },
  /* street */
  bridgeSteel: { c: 0xa2cdb8, tint: 0x5f6a86 }, bridgeSteelDark: { c: 0x7ea796, tint: 0x55607e },
  bridgeDeck: { c: 0x8f8b9d, tint: 0x5f5880 }, asphalt: { c: PAL.road, tint: 0x6a608f },
  lineWhite: { f: PAL.lineWhite, noCast: true },
  billboardSteel: { c: 0x8c94a1, tint: TD }, billboardSteelDark: { c: 0x6c7381, tint: 0x4d4a6c },
  poleConcrete: { c: 0xd8d5da }, transformer: { c: 0x9ca6b0, tint: TD }, lampPost: { c: 0x6c7381, tint: TD },
  trunk: { c: PAL.trunk, tint: 0x8a7290 },
  /* the town's canopy tones, and its high key ramp for blossom */
  blossom0: { c: PAL.blossomLight, bands: 'soft', tint: 0xe2c3d2, noReceive: true },
  blossom1: { c: PAL.blossom, bands: 'soft', tint: 0xd8b2c6, noReceive: true },
  blossom2: { c: PAL.blossomDeep, bands: 'soft', tint: 0xc99cba, noReceive: true },
  leaf0: { c: 0x8cb884, tint: 0x5f7390, noReceive: true },
  leaf1: { c: 0x5f9470, tint: 0x4f6488, noReceive: true },
  leaf2: { c: 0x4f8566, tint: 0x465a80, noReceive: true },
  pine0: { c: 0x4f7e62, tint: 0x465a80 }, pine1: { c: PAL.cedar, tint: 0x3f4d70 }, pine2: { c: 0x355c47, tint: 0x3a4568 },
  /* skate */
  railSteel: { c: 0xaab3bd, tint: 0x646080 }, ledge: { c: 0xc9c3c9 }, coping: { c: 0x7c8591, tint: TD },
  wax: { c: 0xa39ca6, tint: TD }, stairConcrete: { c: 0xd3ced5 }, nosing: { c: 0x6d687a, tint: TD },
  rampDeck: { c: 0xc9a676, tint: 0x6f5f7a }, rampFace: { c: 0xdac9a6, tint: 0x7a6a86 },
  rampSeam: { c: 0xb39a70, tint: 0x6a5a7a }, rampSide: { c: 0x6f7d8d, tint: 0x4d4a6c },
  /* course furniture */
  gatePipe: { c: 0xf2f0ee, tint: 0x7d74a0 }, flagMast: { c: 0x9aa0a8, tint: TD },
  cone: { c: 0xe8702a, tint: 0x7a5068 }, poleRed: { c: 0xc0392b, tint: 0x6a3a5a },
  startWood: { c: 0xa47c52, tint: 0x6a5a78 }, startFoam: { c: 0x3d3a45, tint: 0x4b4560 },
  startLip: { c: 0xe0453f, tint: 0x6a3a5a }, panelEdge: { c: 0x3d4461, tint: 0x3f3a50 },
};

/* The families' own colours join the table; a name in both is a mistake. */
for (const [name, spec] of Object.entries(FAMILY_MATERIALS)) {
  if (SPEC[name]) {
    throw new Error(`props: material ${name} is in kit.js and in a family file`);
  }
  SPEC[name] = spec;
}

const MATS = new Map();
const OWNED = new Set();

function stripesTexture() {
  const c = PT.canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#f4c033';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#322e3b';
  for (let i = -2; i < 4; i += 1) {
    g.beginPath();
    g.moveTo(i * 64, 128);
    g.lineTo(i * 64 + 32, 128);
    g.lineTo(i * 64 + 32 + 128, 0);
    g.lineTo(i * 64 + 128, 0);
    g.closePath();
    g.fill();
  }
  return texture(c, true);
}

function netTexture() {
  const c = PT.canvas(64, 64);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(62,140,96,0.95)';
  g.lineWidth = 3;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  g.fillStyle = 'rgba(80,160,110,0.35)';
  g.fillRect(0, 0, 64, 64);
  const t = texture(c, true);
  t.repeat.set(10, 6);
  return t;
}

function texture(canvasEl, repeat = false) {
  const t = new THREE.CanvasTexture(canvasEl);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.needsUpdate = true;
  return t;
}

/* A named material, made once. */
export function propMaterial(name) {
  let m = MATS.get(name);
  if (m) {
    return m;
  }
  const s = SPEC[name];
  if (!s) {
    throw new Error(`props: no material named ${name}`);
  }
  if (s.f !== undefined) {
    m = flat({ color: s.f });
  } else if (s.stripes) {
    m = cel({ color: 0xffffff, map: stripesTexture(), bands: 3, tint: 0x6a5a78, cache: false });
    OWNED.add(m);
  } else if (s.net) {
    m = flat({ color: 0xffffff, map: netTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, cache: false });
    OWNED.add(m);
  } else {
    m = cel({ color: s.c, bands: s.bands ?? 3, tint: s.tint ?? T });
  }
  m.userData.propCast = !s.noCast && !s.net;
  m.userData.propReceive = !s.noReceive;
  MATS.set(name, m);
  return m;
}

/* Textured materials, cached by what they show. */
const TEXMATS = new Map();
function texMat(key, make) {
  let m = TEXMATS.get(key);
  if (!m) {
    m = make();
    m.userData.propCast = false;
    m.userData.propReceive = true;
    OWNED.add(m);
    TEXMATS.set(key, m);
  }
  return m;
}

function signMat(key, variant) {
  const fam = FAMILY_PAINTERS[key];
  const wrap = fam ? (fam.variants ?? 1) : PT.SIGN_VARIANTS[key];
  const v = wrap ? Math.abs(Math.round(variant)) % wrap : Math.abs(Math.round(variant));
  const paint = fam ? () => fam.paint(v) : () => PT.sign(key, v);
  return texMat(`sign:${key}:${v}`, () => flat({ color: 0xffffff, map: texture(paint()), alphaTest: 0.4, cache: false }));
}

function townMat(fn, arg) {
  return texMat(`town:${fn}:${arg}`, () => flat({ color: 0xffffff, map: TownTex[fn](arg), alphaTest: 0.3, cache: false }));
}

function bannerMat(key) {
  return texMat(`banner:${key}`, () => {
    if (key === 'barrierVinyl') {
      return cel({ color: 0xffffff, map: texture(PT.barrierVinyl()), bands: 3, tint: T, cache: false });
    }
    const size = key === 'gateHeader' ? BANNER_SIZE.header : BANNER_SIZE.sleeve;
    const c = bannerCanvas(size[0], size[1]);
    const g = c.getContext('2d');
    (key === 'gateHeader' ? paintGateHeader : paintGateSleeve)(g, size[0], size[1], {});
    return cel({ color: 0xffffff, map: texture(c), bands: 3, tint: T, cache: false });
  });
}

/* ------------------------------------------------------------------ *
 * Shared geometry: unit shapes scaled by a matrix, so the batches clone
 * one small buffer each time rather than building a new one.
 * ------------------------------------------------------------------ */

const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  ball: new THREE.IcosahedronGeometry(1, 1),
  blob: new THREE.IcosahedronGeometry(1, 0),
};
const CYL = new Map();
function unitCyl(seg) {
  let g = CYL.get(seg);
  if (!g) {
    g = new THREE.CylinderGeometry(1, 1, 1, seg, 1);
    CYL.set(seg, g);
  }
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

/* A matrix that takes a Y axis cylinder of height 1 onto a to b. */
function alongMatrix(a, b, sx, sz, out) {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _dir.length();
  if (len < 1e-6) {
    return null;
  }
  _dir.divideScalar(len);
  _q.setFromUnitVectors(_up, _dir);
  _v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  _s.set(sx, len, sz);
  return out.compose(_v, _q, _s);
}

/* The rotation that turns a plane facing +z onto a named face. */
const FACE_ROT = {
  '+x': new THREE.Euler(0, Math.PI / 2, 0),
  '-x': new THREE.Euler(0, -Math.PI / 2, 0),
  '+z': new THREE.Euler(0, 0, 0),
  '-z': new THREE.Euler(0, Math.PI, 0),
  '+y': new THREE.Euler(-Math.PI / 2, 0, 0),
};

/*
 * THE KIT. One per world being built: the builder's preview makes one per
 * element, the map makes one for the whole map.
 */
export class PropKit {
  constructor() {
    /* Handed to a family's draw() so it can build a geometry the kit has no
     * word for, without importing a renderer into a file Node must load. */
    this.THREE = THREE;
    this.batches = new Map();
    this.place = new THREE.Matrix4();
    this.chunk = '';
    this.counts = { parts: 0, decor: 0, town: 0 };
  }

  /* Where the next element goes: world position and heading. */
  begin(x = 0, y = 0, z = 0, yaw = 0, chunk = '') {
    this.place.makeRotationY(yaw);
    this.place.setPosition(x, y, z);
    this.chunk = chunk;
    return this;
  }

  /* Add a geometry in the current element's frame. */
  add(mat, geometry, local = null) {
    const material = typeof mat === 'string' ? propMaterial(mat) : mat;
    const key = `${material.uuid}|${this.chunk}`;
    let b = this.batches.get(key);
    if (!b) {
      b = { material, chunk: this.chunk, items: [] };
      this.batches.set(key, b);
    }
    const m = new THREE.Matrix4();
    if (local) {
      m.multiplyMatrices(this.place, local);
    } else {
      m.copy(this.place);
    }
    b.items.push({ geometry, matrix: m });
    this.counts.decor += 1;
  }

  /* ---- the vocabulary a draw() speaks ---- */

  box(mat, x0, y0, z0, x1, y1, z1) {
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    const d = Math.abs(z1 - z0);
    if (w < 1e-4 || h < 1e-4 || d < 1e-4) {
      return;
    }
    _v.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    _s.set(w, h, d);
    _q.identity();
    this.add(mat, UNIT.box, new THREE.Matrix4().compose(_v, _q, _s));
  }

  cyl(mat, a, b, r, seg = 8, rTop = null) {
    if (rTop != null && Math.abs(rTop - r) > 1e-6) {
      _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = _dir.length();
      if (len < 1e-6) {
        return;
      }
      const g = new THREE.CylinderGeometry(rTop, r, 1, seg, 1);
      const m = alongMatrix(a, b, 1, 1, new THREE.Matrix4());
      this.add(mat, g, m);
      return;
    }
    const m = alongMatrix(a, b, r, r, new THREE.Matrix4());
    if (m) {
      this.add(mat, unitCyl(seg), m);
    }
  }

  capsule(mat, a, b, r, seg = 12) {
    _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _dir.length();
    if (len < 1e-6) {
      this.ball(mat, a, r);
      return;
    }
    const g = new THREE.CapsuleGeometry(r, len, 4, seg);
    this.add(mat, g, alongMatrix(a, b, 1, 1, new THREE.Matrix4()));
  }

  ball(mat, c, r) {
    _v.set(c[0], c[1], c[2]);
    _s.set(r, r, r);
    _q.identity();
    this.add(mat, UNIT.ball, new THREE.Matrix4().compose(_v, _q, _s));
  }

  blob(mat, c, r, ry, spin) {
    _v.set(c[0], c[1], c[2]);
    _s.set(r, ry, r);
    _q.setFromEuler(new THREE.Euler(spin[0], spin[1], spin[2]));
    this.add(mat, UNIT.blob, new THREE.Matrix4().compose(_v, _q, _s));
  }

  cone(mat, base, r, h, seg = 10) {
    const g = new THREE.ConeGeometry(r, h, seg, 1);
    g.translate(base[0], base[1] + h / 2, base[2]);
    this.add(mat, g);
  }

  torus(mat, c, R, t) {
    const g = new THREE.TorusGeometry(R, t, 6, 14);
    g.translate(c[0], c[1], c[2]);
    this.add(mat, g);
  }

  /* A flat annulus lying level, with an edge: a walkway deck. */
  ring(mat, c, r0, r1, thick) {
    const top = new THREE.RingGeometry(r0, r1, 32);
    top.rotateX(-Math.PI / 2);
    top.translate(c[0], c[1], c[2]);
    this.add(mat, top);
    const bottom = new THREE.RingGeometry(r0, r1, 32);
    bottom.rotateX(Math.PI / 2);
    bottom.translate(c[0], c[1] - thick, c[2]);
    this.add(mat, bottom);
    const edge = new THREE.CylinderGeometry(r1, r1, thick, 32, 1, true);
    edge.translate(c[0], c[1] - thick / 2, c[2]);
    this.add(mat, edge);
  }

  /* A dish: a shallow cone facing `dir`. */
  dish(mat, c, r, dir) {
    const g = new THREE.ConeGeometry(r, r * 0.35, 18, 1);
    const m = alongMatrix(c, [c[0] + dir[0], c[1] + dir[1], c[2] + dir[2]], 1, 1, new THREE.Matrix4());
    if (m) {
      /* alongMatrix scales y by the length of dir; undo it. */
      const n = Math.hypot(dir[0], dir[1], dir[2]);
      g.scale(1, 1 / n, 1);
      this.add(mat, g, m);
    }
  }

  /* A ladder from a to b, `width` across, rungs every 0.3 m. */
  ladder(mat, a, b, width) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 0.3) {
      return;
    }
    /* Across is horizontal and square to the ladder. */
    let sx = -d[2];
    let sz = d[0];
    const sl = Math.hypot(sx, sz);
    if (sl < 1e-6) {
      sx = 1;
      sz = 0;
    } else {
      sx /= sl;
      sz /= sl;
    }
    const hw = width / 2;
    for (const s of [-1, 1]) {
      this.cyl(mat, [a[0] + s * sx * hw, a[1], a[2] + s * sz * hw], [b[0] + s * sx * hw, b[1], b[2] + s * sz * hw], 0.025, 5);
    }
    const n = Math.floor(len / 0.3);
    for (let i = 1; i < n; i += 1) {
      const t = i / n;
      const p = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
      this.cyl(mat, [p[0] - sx * hw, p[1], p[2] - sz * hw], [p[0] + sx * hw, p[1], p[2] + sz * hw], 0.014, 4);
    }
  }

  /* A profile in (x, y), extruded along z from z0 to z1. */
  extrude(mat, profile, z0, z1) {
    const shape = new THREE.Shape();
    profile.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false });
    g.translate(0, 0, z0);
    this.add(mat, g);
  }

  /* A plane on a face, `w` along the face and `h` up it, centred at x, y, z. */
  plane(material, x, y, z, w, h, face) {
    const g = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Matrix4().makeRotationFromEuler(FACE_ROT[face] ?? FACE_ROT['+z']);
    m.setPosition(x, y, z);
    this.add(material, g, m);
  }

  sign(key, x, y, z, w, h, face, variant = 0) {
    if (!(w > 0.05 && h > 0.05)) {
      return;
    }
    this.plane(signMat(key, variant), x, y, z, w, h, face);
  }

  townSign(fn, arg, x, y, z, w, h, face) {
    if (!(w > 0.05 && h > 0.05)) {
      return;
    }
    this.plane(townMat(fn, arg), x, y, z, w, h, face);
  }

  graffiti(face, x, y, z, w, h, seed) {
    const v = Math.abs(seed) % 12;
    const mat = texMat(`graffiti:${v}`, () => cel({
      color: 0xffffff, map: texture(PT.graffiti(v)), bands: 3, tint: T,
      transparent: true, depthWrite: false, cache: false,
    }));
    const o = face[0] === '+' ? 0.015 : -0.015;
    const dx = face[1] === 'x' ? o : 0;
    const dz = face[1] === 'z' ? o : 0;
    /* The piece is painted two to one; keep it that shape. */
    this.plane(mat, x + dx, y, z + dz, w, Math.min(h, w / 2), face);
  }

  patch(key, x, y, z, r, seed) {
    const v = Math.abs(seed) % 4;
    const mat = texMat(`patch:${key}:${v}`, () => flat({
      color: 0xffffff, map: texture(PT.patchTex(key, v)), transparent: true, depthWrite: false, cache: false,
    }));
    this.plane(mat, x, y, z, r * 2, r * 2, '+y');
  }

  /* An advert or a painted band round a cylinder. */
  wrap(key, c, r, h) {
    const mat = texMat(`wrap:${key}`, () => cel({ color: 0xffffff, map: texture(PT.sign(key, 0)), bands: 3, tint: T, cache: false }));
    const g = new THREE.CylinderGeometry(r, r, h, 40, 1, true);
    g.translate(c[0], c[1], c[2]);
    this.add(mat, g);
  }

  /*
   * A printed slab: a thin box of `thick` with its two faces printed. `n` is
   * the face normal, `across` the width direction; up is n cross across.
   */
  panel(key, c, n, across, w, h, thick) {
    const N = new THREE.Vector3(n[0], n[1], n[2]).normalize();
    const A = new THREE.Vector3(across[0], across[1], across[2]).normalize();
    const U = new THREE.Vector3().crossVectors(N, A).normalize();
    const basis = new THREE.Matrix4().makeBasis(A, U, N);
    const at = (off) => basis.clone().setPosition(c[0] + N.x * off, c[1] + N.y * off, c[2] + N.z * off);
    const body = new THREE.BoxGeometry(w, h, Math.max(0.005, thick));
    this.add('panelEdge', body, at(0));
    const front = new THREE.PlaneGeometry(w, h);
    this.add(bannerMat(key), front, at(thick / 2 + 0.002));
    const back = new THREE.PlaneGeometry(w, h);
    back.rotateY(Math.PI);
    this.add(bannerMat(key), back, at(-thick / 2 - 0.002));
  }

  /* A pennant on a mast: the mast from `base` up `h`, a sail off it. */
  pennant(base, h, dir) {
    this.cyl('flagMast', base, [base[0], base[1] + h, base[2]], 0.014, 6);
    const mat = texMat('pennant', () => flat({ color: 0xffffff, map: texture(PT.pennant(0)), alphaTest: 0.4, side: THREE.DoubleSide, cache: false }));
    const sw = Math.min(0.6, h * 0.3);
    const sh = h * 0.8;
    const g = new THREE.PlaneGeometry(sw, sh);
    const m = new THREE.Matrix4().makeTranslation(base[0], base[1] + h - sh / 2, base[2] + dir * sw / 2);
    m.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    this.add(mat, g, m);
  }

  /*
   * Something the vendored town builds: its meshes, folded into these
   * batches at their own materials, turned by `ry` and placed at `pos` in
   * the element's frame.
   */
  town(kind, opts, pos, ry) {
    let obj;
    if (kind === 'car') {
      obj = makeVehicle({ kind: opts.kind, color: CAR[opts.colour] ?? CAR.white, x: 0, y: 0, z: 0, ry: 0 });
    } else if (kind === 'vending') {
      obj = makeVendingMachine(opts.variant ?? 0, opts.seed ?? 1);
    } else {
      return;
    }
    obj.rotation.y = ry;
    obj.position.set(pos[0], pos[1], pos[2]);
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry) {
        return;
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.length !== 1) {
        return;
      }
      if (mats[0].userData.propCast === undefined) {
        mats[0].userData.propCast = o.castShadow !== false;
        mats[0].userData.propReceive = o.receiveShadow !== false;
      }
      if (o.isInstancedMesh) {
        const im = new THREE.Matrix4();
        for (let i = 0; i < o.count; i += 1) {
          o.getMatrixAt(i, im);
          this.add(mats[0], o.geometry, new THREE.Matrix4().multiplyMatrices(o.matrixWorld, im));
        }
        return;
      }
      this.add(mats[0], o.geometry, o.matrixWorld.clone());
    });
    this.counts.town += 1;
  }

  /* ---- drawing an element ---- */

  /* Draw one part the layout marked as drawn. */
  part(p) {
    if (!p.draw) {
      return;
    }
    this.counts.parts += 1;
    if (p.t === 'box') {
      this.box(p.m, p.lo[0], p.lo[1], p.lo[2], p.hi[0], p.hi[1], p.hi[2]);
    } else if (p.look === 'capsule') {
      this.capsule(p.m, p.a, p.b, p.r, p.seg);
    } else {
      this.cyl(p.m, p.a, p.b, p.r, p.seg, p.rTop);
    }
  }

  /*
   * Draw an element in the current frame: its parts, then its paint.
   * Returns its parts, which the caller may want for its solids.
   */
  element(el) {
    const a = assetOf(el);
    if (!a) {
      return [];
    }
    const style = styleOf(el);
    const view = style && style !== el.style ? { ...el, style } : el;
    const parts = partsOf(view);
    for (const p of parts) {
      this.part(p);
    }
    if (a.draw) {
      a.draw(view, parts, this);
    }
    return parts;
  }

  /*
   * Merge every batch into one mesh, and return them in a group, one child
   * group per chunk. The kit owns nothing afterwards: the meshes own their
   * merged geometry, and the materials are shared.
   */
  finish() {
    const root = new THREE.Group();
    root.name = 'props';
    const chunks = new Map();
    for (const b of this.batches.values()) {
      if (!b.items.length) {
        continue;
      }
      const geo = bake(b.items);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, b.material);
      mesh.castShadow = b.material.userData.propCast !== false;
      mesh.receiveShadow = b.material.userData.propReceive !== false;
      mesh.name = 'propBatch';
      let g = chunks.get(b.chunk);
      if (!g) {
        g = new THREE.Group();
        g.name = `props:${b.chunk}`;
        chunks.set(b.chunk, g);
        root.add(g);
      }
      g.add(mesh);
    }
    this.batches.clear();
    return root;
  }
}

/* Materials this module made with textures of its own, for a map's
 * dispose to free. The cel and flat caches are the town's and shared. */
export function ownedPropMaterials() {
  return [...OWNED];
}
