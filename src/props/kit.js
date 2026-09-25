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
  block: { c: 0xc2b8ae, tint: 0x6a6288 }, rubble: { c: 0xa19a93, tint: 0x5f5880 },
  /* sheet metal, three colours, and a darker rib for each */
  sheet: { c: 0xb2b0aa, tint: 0x64607f }, sheetRib: { c: 0x929089, tint: 0x5a5678 },
  sheetBlue: { c: 0xa4b8c8, tint: 0x64607f }, sheetBlueRib: { c: 0x8298aa, tint: 0x5a5678 },
  sheetGreen: { c: 0xadc0a8, tint: 0x64607f }, sheetGreenRib: { c: 0x8ca487, tint: 0x5a5678 },
  trim: { c: PAL.trim, tint: TD }, band: { c: 0xcfc9d3 },
  acUnit: { c: 0xe6e3dc }, awning: { c: PAL.redSoft }, tank: { c: 0xdfe7ec }, tankSeam: { c: 0xb4c1ca },
  metal: { c: PAL.metal, tint: 0x666090 }, metalDark: { c: PAL.metalDark, tint: TD },
  rustDeep: { c: 0x8a5c46, tint: 0x5f4f74 }, brick: { c: 0x9c6c54, tint: 0x62527a },
  shutter: { c: PAL.shutter, tint: TD }, shutterLight: { c: PAL.shutterLight, tint: TD },
  /* glass and light */
  glassDark: { f: PAL.glassDark, noCast: true },
  glassBlue: { f: 0x86abc9, noCast: true }, glassLit: { f: 0xffe4ad, noCast: true },
  curtainPink: { f: 0xf2c9d2, noCast: true }, curtainBlue: { f: 0xc2d5ea, noCast: true },
  curtainCream: { f: 0xf4e7cb, noCast: true }, curtainGreen: { f: 0xd0e3cd, noCast: true },
  lampGlow: { f: 0xfff4d8, noCast: true }, lampRed: { f: 0xff5145, noCast: true },
  lampHead: { c: 0x5e5c68, tint: TD },
  /* industrial */
  craneYellow: { c: 0xf2bd34, tint: 0x7d6a74 }, craneYellowDeep: { c: 0xd89c22, tint: 0x6d5a70 },
  white: { c: 0xf4f2f0 }, rope: { c: 0x3d3a45, tint: 0x4b4560 },
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
  cornerCasting: { c: 0x4a4552, tint: 0x3f3a50 },
  scaffold: { c: 0x93a3b2, tint: 0x5f5c80 }, plywood: { c: 0xc9a676, tint: 0x6f5f7a },
  toeBoard: { c: 0xb58f5c, tint: 0x6a5a78 },
  net: { net: true },
  hazard: { stripes: true },
  /* street */
  bridgeSteel: { c: 0xa2cdb8, tint: 0x5f6a86 }, bridgeSteelDark: { c: 0x7ea796, tint: 0x55607e },
  asphalt: { c: PAL.road, tint: 0x6a608f },
  lineWhite: { f: PAL.lineWhite, noCast: true },
  billboardSteel: { c: 0x8c94a1, tint: TD }, billboardSteelDark: { c: 0x6c7381, tint: 0x4d4a6c },
  trunk: { c: PAL.trunk, tint: 0x8a7290 },
  /* the town's canopy tones: the cherry's blossom on the high key ramp,
   * and two leaf greens for the flower boxes. The street tree and the pine
   * carry their own greens in src/props/street.js. */
  blossom0: { c: PAL.blossomLight, bands: 'soft', tint: 0xe2c3d2, noReceive: true },
  blossom1: { c: PAL.blossom, bands: 'soft', tint: 0xd8b2c6, noReceive: true },
  blossom2: { c: PAL.blossomDeep, bands: 'soft', tint: 0xc99cba, noReceive: true },
  leaf0: { c: 0x8cb884, tint: 0x5f7390, noReceive: true },
  leaf1: { c: 0x5f9470, tint: 0x4f6488, noReceive: true },
  /* course furniture: the pennant's mast and the printed panels' edge,
   * which K.pennant and K.panel name; the rest is src/props/course.js's */
  flagMast: { c: 0x9aa0a8, tint: TD }, panelEdge: { c: 0x3d4461, tint: 0x3f3a50 },
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

/*
 * THE TIME OF DAY, AS FAR AS THE KIT IS CONCERNED.
 *
 * A lit cel material needs nothing from the kit to follow the light: the
 * scene's sun and sky shade it. An unlit one does. Glass, curtains, lines
 * and plates are flat colours drawn the same whatever the lights do, which
 * at golden hour is the point (a pane keeps its colour in shadow, the way
 * the town paints one) and at dusk would be a pane as bright as noon in a
 * wall gone violet. So a kit may be handed a look (src/maps/built/looks.js
 * makes them): `flats`, a linear colour every unlit material that is not a
 * light is multiplied by, sized to what that time's lights do to a pale
 * wall; and `night`, which lights a share of the windows (windowLight and
 * glow below) and keeps a list of where the lamps are, for the map to hang
 * their glow on.
 *
 * No look is the town's own golden hour and draws exactly what the kit drew
 * before looks existed: the same materials, from the same caches.
 */

/* The unlit materials that are lights, and keep their colour at any hour.
 * glassLit is a lit room; the kit's signs (K.sign) are lit plates too and
 * never take a look, which is what lights a billboard at dusk. */
const LIGHTS = new Set(['lampGlow', 'lampRed', 'glassLit']);

/* A colour multiplied, in linear light, by a look's `flats`. */
function dimmed(hex, f) {
  const c = new THREE.Color(hex);
  c.r *= f[0];
  c.g *= f[1];
  c.b *= f[2];
  return c.getHex();
}

/*
 * THE LIT WINDOWS: one material for all of them, the colour carried by the
 * vertices, so a whole town of lit rooms in every tone of lamp and every
 * curtain colour is one batch a chunk rather than one a tone. Unlit, and
 * neither casting nor taking shadow: a lit window is the light.
 */
let glowMat = null;
function glowMaterial() {
  if (!glowMat) {
    glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    glowMat.name = 'propWindowGlow';
    glowMat.userData.propCast = false;
    glowMat.userData.propReceive = false;
    OWNED.add(glowMat);
  }
  return glowMat;
}

/* A unit box painted one colour, one per colour, shared. */
const GLOW_BOXES = new Map();
function glowBox(hex) {
  let g = GLOW_BOXES.get(hex);
  if (!g) {
    g = new THREE.BoxGeometry(1, 1, 1);
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    GLOW_BOXES.set(hex, g);
  }
  return g;
}

/*
 * Which windows are lit, from where they are rather than from any draw's
 * random stream: a draw that asked its stream would roll a different
 * building at dusk than at noon. A window's world position, to a sixty
 * fourth of a metre, through a 32 bit integer mix (murmur3's finaliser), so
 * neighbours are unrelated and no floor, column or facade lights in a
 * pattern.
 */
function mix32(a, b, c) {
  let h = Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77) ^ Math.imul(c, 0xc2b2ae3d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

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

/* A named material, made once, and once more for each look that dims it. */
export function propMaterial(name, look = null) {
  const s = SPEC[name];
  if (!s) {
    throw new Error(`props: no material named ${name}`);
  }
  const dim = Boolean(look && look.flats && (s.f !== undefined || s.net) && !LIGHTS.has(name));
  const key = dim ? `${look.key}:${name}` : name;
  let m = MATS.get(key);
  if (m) {
    return m;
  }
  if (s.f !== undefined) {
    m = flat({ color: dim ? dimmed(s.f, look.flats) : s.f });
  } else if (s.stripes) {
    m = cel({ color: 0xffffff, map: stripesTexture(), bands: 3, tint: 0x6a5a78, cache: false });
    OWNED.add(m);
  } else if (s.net) {
    m = flat({ color: dim ? dimmed(0xffffff, look.flats) : 0xffffff, map: netTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, cache: false });
    OWNED.add(m);
  } else {
    m = cel({ color: s.c, bands: s.bands ?? 3, tint: s.tint ?? T });
  }
  m.userData.propCast = !s.noCast && !s.net;
  m.userData.propReceive = !s.noReceive;
  MATS.set(key, m);
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

/*
 * A painted key at a variant: a family's own painter (FAMILY_PAINTERS in
 * ./catalog.js) or one of ./textures.js's, the variant wrapped to the looks
 * the key has. One place, so a sign and a wrap of the same key and variant
 * are the same texture and the same material.
 */
function painted(key, variant) {
  const fam = FAMILY_PAINTERS[key];
  const looks = fam ? (fam.variants ?? 1) : PT.SIGN_VARIANTS[key];
  const n = Math.abs(Math.round(Number(variant) || 0));
  const v = looks ? n % looks : n;
  return {
    v,
    lit: Boolean(fam && fam.lit),
    paint: fam ? () => fam.paint(v) : () => PT.sign(key, v),
  };
}

/*
 * A sign is flat by default, the way the town draws a lit plate: it keeps
 * its colours in shadow. A family painter that sets `lit` asks for a painted
 * surface instead, cel shaded with the standard tint like the wall it is
 * painted on, for a mural or a stencil that should go dark with the wall.
 */
function signMat(key, variant) {
  const p = painted(key, variant);
  return texMat(`sign:${key}:${p.v}`, () => (p.lit
    ? cel({ color: 0xffffff, map: texture(p.paint()), bands: 3, tint: T, alphaTest: 0.4, cache: false })
    : flat({ color: 0xffffff, map: texture(p.paint()), alphaTest: 0.4, cache: false })));
}

function townMat(fn, arg) {
  return texMat(`town:${fn}:${arg}`, () => flat({ color: 0xffffff, map: TownTex[fn](arg), alphaTest: 0.3, cache: false }));
}

function bannerMat(key) {
  return texMat(`banner:${key}`, () => {
    if (key === 'barrierVinyl') {
      return cel({ color: 0xffffff, map: texture(PT.barrierVinyl()), bands: 3, tint: T, cache: false });
    }
    const header = key === 'gateHeader';
    const size = header ? BANNER_SIZE.header : BANNER_SIZE.sleeve;
    const c = bannerCanvas(size[0], size[1]);
    const g = c.getContext('2d');
    if (header) {
      paintGateHeader(g, size[0], size[1], {});
    } else {
      /* gateSleeveFlip is the far leg's sleeve: the design mirrored in the
       * paint, so the chequer runs down the outside of both legs. See
       * paintGateSleeve for why it is not a negative scale on the mesh. */
      paintGateSleeve(g, size[0], size[1], { flip: key === 'gateSleeveFlip' });
    }
    return cel({ color: 0xffffff, map: texture(c), bands: 3, tint: T, cache: false });
  });
}

/* ------------------------------------------------------------------ *
 * The town's own materials, as K.town folds them in.
 * ------------------------------------------------------------------ */

/* A colour as an exact key, not rounded to eight bits a channel. */
const colKey = (c) => (c ? `${c.r},${c.g},${c.b}` : '-');

/*
 * WHAT A TOWN MATERIAL DRAWS, AS A STRING.
 *
 * The kit batches by material, and the town's builders make some of theirs
 * fresh on every call: the vending machine's drinks, its glass, the
 * highlight on the glass, and every printed plate on it (the town's cel and
 * flat never cache a mapped material, and the rest ask for cache: false).
 * Batched by uuid, every machine brought a new batch of each, so two
 * machines cost more draw calls than one. Two materials with the same
 * signature draw the same pixels, so the first one met stands for all of
 * them. Everything that picks the program or feeds its uniforms is in it:
 * the type, the colour, the map, the cel ramp (which is the bands), alpha
 * and blending, faces, depth, vertex colours, emission, fog, and the town's
 * shadow tint.
 */
function townSignature(m) {
  return [
    m.type, colKey(m.color), m.map ? m.map.uuid : '-', m.gradientMap ? m.gradientMap.uuid : '-',
    m.alphaMap ? m.alphaMap.uuid : '-', m.transparent, m.opacity, m.alphaTest, m.blending, m.side,
    m.depthWrite, m.depthTest, m.vertexColors, colKey(m.emissive), m.emissiveIntensity ?? '-',
    m.fog, m.toneMapped, m.userData.shadowTint ? colKey(m.userData.shadowTint.value) : '-',
  ].join('|');
}

const TOWN_MATS = new Map();
function townMaterial(m) {
  const sig = townSignature(m);
  const first = TOWN_MATS.get(sig);
  if (first) {
    return first;
  }
  TOWN_MATS.set(sig, m);
  return m;
}

/*
 * A town material with one instance's colour multiplied in: what three.js
 * does with an InstancedMesh's instanceColor, and what a batch, which has no
 * instances, cannot. Dropping the colour left every bottle in a vending
 * machine white. Made once per material and colour, so a street of
 * machines is a dozen drink batches and not a dozen per machine.
 *
 * clone() copies a material's parameters and none of the town's shadow
 * tint, which is an onBeforeCompile hook, a program cache key and a uniform
 * kept in userData; Material.copy does not carry the first two and passes
 * userData through JSON, which does not keep a uniform. A clone without
 * them shades its dark side grey where every other cel surface goes violet,
 * so all three are carried over, the uniform shared rather than copied.
 */
const TINTS = new Map();
function tintedMaterial(src, c) {
  const key = `${src.uuid}|${colKey(c)}`;
  let m = TINTS.get(key);
  if (!m) {
    m = src.clone();
    m.color.multiply(c);
    m.onBeforeCompile = src.onBeforeCompile;
    m.customProgramCacheKey = src.customProgramCacheKey;
    m.userData = { ...src.userData };
    OWNED.add(m);
    TINTS.set(key, m);
  }
  return m;
}

/*
 * A town car's unlit material under a look: its glass and plates dimmed
 * with everything else unlit, its lamps not. The lamps are the two colours
 * vehicles.js lights a car with, which is how they are told apart. A
 * vending machine takes no look at all: it is lit from inside, and at dusk
 * a row of them glowing is half of what says a Japanese street at dusk.
 */
const CAR_LAMPS = new Set([0xfff2d4, 0xd8564e]);
const DIMMED_TOWN = new Map();
function lookedTownMaterial(m, look) {
  if (!m.isMeshBasicMaterial || CAR_LAMPS.has(m.color.getHex())) {
    return m;
  }
  const key = `${m.uuid}|${look.key}`;
  let d = DIMMED_TOWN.get(key);
  if (!d) {
    d = m.clone();
    d.color.setHex(dimmed(m.color.getHex(), look.flats));
    d.userData = { ...m.userData };
    OWNED.add(d);
    DIMMED_TOWN.set(key, d);
  }
  return d;
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

/*
 * A matrix that takes a Y axis cylinder of height 1 onto a to b. With
 * `stretch` false it only turns and moves, for a shape already built at the
 * length it needs.
 */
function alongMatrix(a, b, sx, sz, out, stretch = true) {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _dir.length();
  if (len < 1e-6) {
    return null;
  }
  _dir.divideScalar(len);
  _q.setFromUnitVectors(_up, _dir);
  _v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  _s.set(sx, stretch ? len : 1, sz);
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
  /* `look` is a time of day's say over the materials, from
   * src/maps/built/looks.js, or nothing for the town's own golden hour. */
  constructor(look = null) {
    /* Handed to a family's draw() so it can build a geometry the kit has no
     * word for, without importing a renderer into a file Node must load. */
    this.THREE = THREE;
    this.batches = new Map();
    this.place = new THREE.Matrix4();
    this.chunk = '';
    this.counts = { parts: 0, decor: 0, town: 0, lit: 0 };
    this.look = look && (look.flats || look.night) ? look : null;
    /* At night, every lamp drawn, in world metres: see add(). */
    this.lamps = [];
    this.lampMat = propMaterial('lampGlow');
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
    const material = typeof mat === 'string' ? propMaterial(mat, this.look) : mat;
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
    /* A lamp, remembered at night by the middle of what was drawn, so the
     * map can put its pool of light on the ground and its halo round it
     * without every family saying where its lamps are. */
    if (material === this.lampMat && this.night) {
      if (!geometry.boundingBox) {
        geometry.computeBoundingBox();
      }
      const c = geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(m);
      this.lamps.push({ x: c.x, y: c.y, z: c.z, halo: true });
    }
  }

  /* Whether this kit draws at night: lit windows and remembered lamps. */
  get night() {
    return Boolean(this.look && this.look.night);
  }

  /*
   * AT NIGHT, whether the window at (x, y, z) in the element's frame is
   * lit, and in what colour: one of `tones` (colours, weighted by being
   * repeated) for a lit one, 0 for one left dark or for any window by day.
   * `share` is the fraction of such windows lit; 1 lights every one (a
   * room that was lit by day as well).
   */
  windowLight(x, y, z, share, tones = [0xffc978]) {
    if (!this.night) {
      return 0;
    }
    _v.set(x, y, z).applyMatrix4(this.place);
    const h = mix32(Math.round(_v.x * 64), Math.round(_v.y * 64), Math.round(_v.z * 64));
    if ((h >>> 8) / 16777216 >= share) {
      return 0;
    }
    return tones[(h & 0xff) % tones.length];
  }

  /* A lit box: a window's pane or a curtain with the room lit behind it,
   * `hex` its colour, into the one glow batch. */
  glow(hex, x0, y0, z0, x1, y1, z1) {
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    const d = Math.abs(z1 - z0);
    if (w < 1e-4 || h < 1e-4 || d < 1e-4) {
      return;
    }
    _v.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    _s.set(w, h, d);
    _q.identity();
    this.add(glowMaterial(), glowBox(hex), new THREE.Matrix4().compose(_v, _q, _s));
    this.counts.lit += 1;
  }

  /* The colour a look lays over an unlit texture, white by day. */
  flatTint() {
    return this.look && this.look.flats ? dimmed(0xffffff, this.look.flats) : 0xffffff;
  }

  /* The key a look adds to a cached unlit texture material. */
  lookKey() {
    return this.look && this.look.flats ? `:${this.look.key}` : '';
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

  /*
   * The whole rounded shape of a solid capsule: its axis a to b, r round it
   * and r past each end. CapsuleGeometry is built at that size already, its
   * straight part `len` long, so it is turned onto the axis and never
   * stretched. Stretched by alongMatrix as a unit cylinder is, every one was
   * drawn len times its own height: a 0.45 m ventilator came out squashed to
   * 0.47 m tall where its solid is 1.05 m.
   */
  capsule(mat, a, b, r, seg = 12) {
    _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _dir.length();
    if (len < 1e-6) {
      this.ball(mat, a, r);
      return;
    }
    const g = new THREE.CapsuleGeometry(r, len, 4, seg);
    this.add(mat, g, alongMatrix(a, b, 1, 1, new THREE.Matrix4(), false));
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

  /* A painted plate on a face. Under a centimetre either way it is dropped,
   * which is below anything a pilot could read; the floor was five
   * centimetres, and a narrow strip a family asked for vanished without a
   * word. */
  sign(key, x, y, z, w, h, face, variant = 0) {
    if (!(w > 0.01 && h > 0.01)) {
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
    const mat = texMat(`patch:${key}:${v}${this.lookKey()}`, () => flat({
      color: this.flatTint(), map: texture(PT.patchTex(key, v)), transparent: true, depthWrite: false, cache: false,
    }));
    this.plane(mat, x, y, z, r * 2, r * 2, '+y');
  }

  /*
   * An advert or a painted band round a cylinder: `key` is a ./textures.js
   * painter or a family's, at `variant`, on an open cylinder of radius r and
   * height h centred on c. `start` and `arc` are CylinderGeometry's
   * thetaStart and thetaLength, in radians, for a band that only goes part
   * of the way round (a name facing one way, a label on the front of a
   * tank); the whole texture is stretched over the arc. The default is all
   * the way round, which is what wrap(key, c, r, h) always drew.
   */
  wrap(key, c, r, h, variant = 0, start = 0, arc = Math.PI * 2) {
    const p = painted(key, variant);
    const mat = texMat(`wrap:${key}:${p.v}`, () => cel({ color: 0xffffff, map: texture(p.paint()), bands: 3, tint: T, cache: false }));
    /* Forty segments round a whole turn, and as many per radian for less. */
    const seg = Math.max(6, Math.ceil((40 * arc) / (Math.PI * 2)));
    const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true, start, arc);
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
    const mat = texMat(`pennant${this.lookKey()}`, () => flat({ color: this.flatTint(), map: texture(PT.pennant(0)), alphaTest: 0.4, side: THREE.DoubleSide, cache: false }));
    const sw = Math.min(0.6, h * 0.3);
    const sh = h * 0.8;
    const g = new THREE.PlaneGeometry(sw, sh);
    const m = new THREE.Matrix4().makeTranslation(base[0], base[1] + h - sh / 2, base[2] + dir * sw / 2);
    m.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    this.add(mat, g, m);
  }

  /*
   * Something the vendored town builds: its meshes, folded into these
   * batches at their own materials (by signature, see townMaterial), turned
   * by `ry` and placed at `pos` in the element's frame.
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
    /* A vending machine is lit from inside, and at night its front throws
     * light on the ground the way a lamp does: remembered as a lamp at the
     * middle of its face, with no halo, since the glow is the machine. */
    if (kind === 'vending' && this.night) {
      const c = new THREE.Vector3(0, 1.0, 0.8).applyMatrix4(obj.matrixWorld).applyMatrix4(this.place);
      this.lamps.push({ x: c.x, y: c.y, z: c.z, halo: false });
    }
    /*
     * Only what the town would draw. traverseVisible never enters a hidden
     * object: the vending machine keeps its interaction hitbox as a red box
     * it never shows, and its dispensed can hidden until somebody buys a
     * drink, and folded into a batch both were drawn, so every machine was
     * a red block. The ink shells hullOutline hangs on a mesh are left out
     * as well: they are ShaderMaterials the town's outline pass sizes to the
     * screen every frame, not paint, and a batch baked in world space is not
     * something they can be.
     */
    const tint = new THREE.Color();
    obj.traverseVisible((o) => {
      if (!o.isMesh || !o.geometry) {
        return;
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.length !== 1 || mats[0].isShaderMaterial) {
        return;
      }
      let mat = townMaterial(mats[0]);
      if (mat.userData.propCast === undefined) {
        mat.userData.propCast = o.castShadow !== false;
        mat.userData.propReceive = o.receiveShadow !== false;
      }
      if (kind === 'car' && this.look && this.look.flats) {
        mat = lookedTownMaterial(mat, this.look);
      }
      if (o.isInstancedMesh) {
        const im = new THREE.Matrix4();
        for (let i = 0; i < o.count; i += 1) {
          o.getMatrixAt(i, im);
          let m = mat;
          if (o.instanceColor) {
            o.getColorAt(i, tint);
            m = tintedMaterial(mat, tint);
          }
          this.add(m, o.geometry, new THREE.Matrix4().multiplyMatrices(o.matrixWorld, im));
        }
        return;
      }
      this.add(mat, o.geometry, o.matrixWorld.clone());
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
