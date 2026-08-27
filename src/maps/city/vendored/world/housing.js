import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  meterBox, litWindowTex, curtainTex, namePlate, blockPlate,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';

/* ------------------------------------------------------------------ *
 * Three more residential types.
 *
 * `buildings.js` has one house generator, and after twenty-five houses it is
 * plainly a *detached* house generator: one volume, one roof, one frontage,
 * one family.  A Japanese suburb is not made of that alone, and the three
 * types below are the ones a street of only detached houses is missing:
 *
 *   makeAtticHouse   二階半 -- two storeys of boarding under a steep roof with
 *                    a dormer in it, deep eaves, exposed rafter ends.  The one
 *                    silhouette in the world with a roof taller than a storey.
 *   makeWalkup       a three-storey block: regular window rhythm, an access
 *                    gallery, an open stair at one end, one balcony rail
 *                    detail repeated the whole way along.  Its whole character
 *                    is *repetition*, which is exactly what makes it read
 *                    against the houses either side of it.
 *   makeTerrace      連棟 -- N narrow units sharing party walls, each with its
 *                    own door, meter, plate and parking bay.  The variety is
 *                    per *unit* and nothing else: same wall, same roof, same
 *                    window, different door colour, different clutter, one
 *                    shutter down.  A terrace that varies its walls is not a
 *                    terrace, it is a row of houses.
 *
 * All three are authored facing +Z and rotated into place by `face`, the same
 * convention `makeShop` uses -- far less error-prone than branching on an axis
 * inside every measurement -- and all three bake their static parts per
 * material, so a whole building costs about eight draw calls.
 * ------------------------------------------------------------------ */

const FACE_RY = { 'z+': 0, 'z-': Math.PI, 'x+': Math.PI / 2, 'x-': -Math.PI / 2 };
const WALLS = [
  PAL.wallWhite, PAL.wallCream, PAL.wallBlue, PAL.wallBeige, PAL.wallGray, PAL.wallPink,
  PAL.wallTea, PAL.wallSage,
];
const ROOFS = [PAL.roofSlate, PAL.roofBlue, PAL.roofBrown, PAL.roofTeal];
const DOORS = [0x8a6f5c, 0x5f6f7a, 0x7a5a52, 0x4f6b58, 0x8f7a52, 0x6a5f70];

const M = {};
function mats() {
  if (M.walls) return M;
  M.walls = WALLS.map((c) => cel({ color: c, bands: 3, tint: 0x6f6790 }));
  M.roofs = ROOFS.map((c) => cel({ color: c, bands: 3, tint: 0x514b70 }));
  M.doors = DOORS.map((c) => cel({ color: c, bands: 3, tint: 0x5c5680 }));
  M.trim = cel({ color: PAL.trim, bands: 3, tint: 0x5c5680 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.glass = flat({ color: PAL.glassDark });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.board = cel({ color: 0xa88f6e, bands: 3, tint: 0x5c5680 });
  M.boardDark = cel({ color: 0x7d6146, bands: 3, tint: 0x554e74 });
  M.tile = cel({ color: 0x5a5f6e, bands: 3, tint: 0x4a4468 });
  return M;
}

/** A sliding window: reveal, pane, mullion, sill. Facing +z, in local space. */
function slider(push, g, { x, y, z, w, h, lit = false, curtain = false, variant = 0 }) {
  const m = mats();
  push('trim', new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.14), trs(x, y, z - 0.03));
  const paneMat = lit
    ? flat({ color: 0xffffff, map: litWindowTex(variant % 3), cache: false })
    : m.glass;
  g.add(box(w, h, 0.05, paneMat, x, y, z + 0.045));
  push('metal', new THREE.BoxGeometry(0.06, h, 0.08), trs(x, y, z + 0.07));
  push('metal', new THREE.BoxGeometry(w + 0.1, 0.06, 0.08), trs(x, y + h / 2 + 0.03, z + 0.07));
  push('trim', new THREE.BoxGeometry(w + 0.24, 0.08, 0.2), trs(x, y - h / 2 - 0.08, z + 0.06));
  if (curtain) {
    const cur = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.44, h * 0.9),
      flat({ color: 0xeae2d4, map: curtainTex(variant % 2), cache: false }));
    cur.position.set(x + w * 0.25, y, z + 0.052);
    cur.userData.noOutline = true;
    g.add(cur);
  }
}

/* ------------------------------------------------------------------ *
 * 二階半の木造 -- the attic house.
 * ------------------------------------------------------------------ */

export function makeAtticHouse(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 41);
  const g = new THREE.Group();
  g.name = 'atticHouse';

  const w = o.w ?? 6.6;
  const d = o.d ?? 7.2;
  const FH = 2.55;
  const H = FH * 2;
  const RH = o.roofH ?? 2.4;             // the attic, and it is a whole storey
  const EAVE = 0.62;                     // deep, which is the point of the type
  const wallMat = m.walls[o.wall ?? 1];
  const roofMat = m.roofs[o.roof ?? 0];
  const parts = {
    wall: [], board: [], boardDark: [], roof: [], trim: [],
    metal: [], metalDark: [], concrete: [], door: [],
  };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* ------------------------------- the volume ------------------------------- *
   * Boarded below, rendered above.  That split is what the type actually looks
   * like, and it also does the compositional job: a dark base under a pale upper
   * storey reads as *older* than any amount of detail could. */
  push('concrete', new THREE.BoxGeometry(w + 0.2, 0.46, d + 0.2), trs(0, 0.23, 0));
  push('board', new THREE.BoxGeometry(w, FH - 0.1, d), trs(0, 0.46 + (FH - 0.1) / 2, 0));
  push('wall', new THREE.BoxGeometry(w, H - FH + 0.1, d), trs(0, 0.46 + FH + (H - FH) / 2 - 0.05, 0));
  push('boardDark', new THREE.BoxGeometry(w + 0.1, 0.14, d + 0.1), trs(0, 0.46 + FH - 0.04, 0));
  // the boarding itself, as a run of shallow ribs
  {
    const ribs = [];
    const n = Math.round((FH - 0.2) / 0.24);
    for (let i = 0; i < n; i++) {
      ribs.push({
        geometry: new THREE.BoxGeometry(w + 0.05, 0.05, d + 0.05),
        matrix: trs(0, 0.54 + i * 0.24, 0),
      });
    }
    const rm = new THREE.Mesh(bake(ribs), m.boardDark);
    rm.castShadow = true;
    g.add(rm);
  }
  // corner posts, which is how a boarded wall is actually stopped
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      push('boardDark', new THREE.BoxGeometry(0.16, FH, 0.16),
        trs(sx * (w / 2 - 0.04), 0.46 + FH / 2, sz * (d / 2 - 0.04)));
    }
  }

  /* --------------------------------- the roof --------------------------------- *
   * A steep gable with the ridge along the depth, so the frontage shows the
   * gable end and the roof reads at its full height from the street. */
  const yr = 0.46 + H;
  {
    const rw = w + EAVE * 2;
    const rd = d + EAVE * 2;
    const slope = Math.atan2(RH, rw / 2);
    const slab = Math.hypot(rw / 2, RH) + 0.1;
    for (const s of [-1, 1]) {
      push('roof', new THREE.BoxGeometry(slab, 0.17, rd),
        trs(s * (rw / 4), yr + RH / 2, 0, 0, 0, -s * slope));
    }
    push('roof', new THREE.BoxGeometry(0.3, 0.22, rd + 0.1), trs(0, yr + RH + 0.05, 0));
    // the gable ends, and the boarded triangle inside each
    const tri = new THREE.Shape();
    tri.moveTo(-w / 2, 0);
    tri.lineTo(w / 2, 0);
    tri.lineTo(0, RH * (1 - (EAVE * 2) / rw));
    tri.closePath();
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.18, bevelEnabled: false });
    triGeo.translate(0, 0, -0.09);
    for (const s of [-1, 1]) {
      push('board', triGeo, trs(0, yr, s * (d / 2 - 0.02)));
    }
    triGeo.dispose();
    // exposed rafter ends under both eaves -- the type's signature
    const raf = [];
    const nr = Math.round(rd / 0.46);
    for (let i = 0; i < nr; i++) {
      const rz = -rd / 2 + 0.3 + i * ((rd - 0.6) / (nr - 1));
      for (const s of [-1, 1]) {
        raf.push({
          geometry: new THREE.BoxGeometry(EAVE + 0.16, 0.11, 0.09),
          matrix: trs(s * (w / 2 + EAVE / 2 - 0.04), yr + 0.16 + (EAVE / 2) * Math.tan(slope) * 0.5, rz,
            0, 0, -s * slope),
        });
      }
    }
    const rm = new THREE.Mesh(bake(raf), m.boardDark);
    rm.castShadow = true;
    g.add(rm);
    // and the gutter along each low edge
    for (const s of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(0.12, 0.12, rd), trs(s * (rw / 2 - 0.02), yr + 0.06, 0));
    }
  }

  /* -------------------------------- the dormer -------------------------------- *
   * The whole reason the type is worth building.  A box out of the roof slope
   * with its own little gable and its own window, which puts a third storey of
   * *silhouette* on a two-storey house. */
  {
    const dw = 1.5, dd = 1.15, dh = 1.15;
    const dz = d / 2 - 1.6;
    const dx = -w / 4;
    push('wall', new THREE.BoxGeometry(dw, dh, dd), trs(dx, yr + 0.5 + dh / 2, dz));
    const tri = new THREE.Shape();
    tri.moveTo(-dw / 2 - 0.12, 0);
    tri.lineTo(dw / 2 + 0.12, 0);
    tri.lineTo(0, 0.44);
    tri.closePath();
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.14, bevelEnabled: false });
    triGeo.translate(0, 0, -0.07);
    push('wall', triGeo, trs(dx, yr + 0.5 + dh, dz - dd / 2 + 0.07));
    triGeo.dispose();
    for (const s of [-1, 1]) {
      push('roof', new THREE.BoxGeometry(Math.hypot(dw / 2 + 0.2, 0.44) + 0.06, 0.11, dd + 0.3),
        trs(dx + s * ((dw / 2 + 0.2) / 2), yr + 0.5 + dh + 0.22, dz,
          0, 0, -s * Math.atan2(0.44, dw / 2 + 0.2)));
    }
    push('roof', new THREE.BoxGeometry(0.14, 0.13, dd + 0.34), trs(dx, yr + 0.5 + dh + 0.44, dz));
    slider(push, g, { x: dx, y: yr + 0.5 + dh / 2 + 0.06, z: dz - dd / 2, w: 1.0, h: 0.78, lit: o.litDormer, variant: 2 });
  }

  /* ------------------------------- the frontage ------------------------------- */
  {
    const zf = d / 2;
    // 玄関: a recessed door with a hood and two treads
    const ex = w / 2 - 1.15;
    push('door', new THREE.BoxGeometry(1.0, 2.0, 0.09), trs(ex, 0.46 + 1.0, zf - 0.02));
    push('boardDark', new THREE.BoxGeometry(1.28, 2.2, 0.14), trs(ex, 0.46 + 1.05, zf - 0.07));
    push('metal', new THREE.BoxGeometry(0.05, 0.9, 0.05), trs(ex + 0.36, 0.46 + 1.0, zf + 0.04));
    push('boardDark', new THREE.BoxGeometry(1.9, 0.12, 0.95), trs(ex, 0.46 + 2.32, zf + 0.4));
    push('roof', new THREE.BoxGeometry(2.0, 0.09, 1.05), trs(ex, 0.46 + 2.4, zf + 0.42));
    for (const s of [-1, 1]) {
      push('boardDark', new THREE.BoxGeometry(0.09, 0.5, 0.09), trs(ex + s * 0.8, 0.46 + 2.02, zf + 0.72));
    }
    for (let i = 0; i < 2; i++) {
      const t = 0.46 - i * 0.23;
      push('concrete', new THREE.BoxGeometry(1.5 - i * 0.16, t, 0.36), trs(ex, t / 2, zf + 0.18 + i * 0.36));
    }
    // ground-floor window, and two above with a balcony over the door
    slider(push, g, { x: -w / 2 + 1.5, y: 0.46 + 1.45, z: zf, w: 1.7, h: 1.3, curtain: true, variant: 0 });
    slider(push, g, { x: -w / 2 + 1.5, y: 0.46 + FH + 1.5, z: zf, w: 1.7, h: 1.3, lit: o.lit, variant: 1 });
    slider(push, g, { x: ex, y: 0.46 + FH + 1.5, z: zf, w: 1.5, h: 1.3, curtain: true, variant: 1 });
    {
      const by = 0.46 + FH + 0.42;
      const bw = 2.3;
      push('concrete', new THREE.BoxGeometry(bw, 0.11, 0.9), trs(ex, by, zf + 0.45));
      push('metal', new THREE.BoxGeometry(bw, 0.06, 0.06), trs(ex, by + 1.0, zf + 0.88));
      push('metalDark', new THREE.BoxGeometry(bw, 0.42, 0.05), trs(ex, by + 0.34, zf + 0.88));
      const nb = Math.round(bw / 0.24);
      for (let i = 0; i <= nb; i++) {
        push('metal', new THREE.BoxGeometry(0.04, 0.92, 0.04), trs(ex - bw / 2 + (bw / nb) * i, by + 0.52, zf + 0.88));
      }
      push('metal', new THREE.BoxGeometry(bw * 0.8, 0.05, 0.05), trs(ex, by + 1.4, zf + 0.6));
      if (rng.chance(0.8)) {
        for (let i = 0; i < 2; i++) {
          const t = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6),
            cel({ color: rng.pick([PAL.wallBlue, PAL.blossom, PAL.wallWhite, PAL.yellow]),
              bands: 2, side: THREE.DoubleSide, tint: 0x6f6790 }));
          t.position.set(ex - 0.5 + i * 0.9, by + 1.08, zf + 0.6);
          t.castShadow = true;
          g.add(t);
        }
      }
    }
    // the meter and the gas box, at the height they always are
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.1),
      flat({ color: 0xffffff, map: meterBox(), cache: false }));
    plate.position.set(-w / 2 + 0.5, 1.86, zf + 0.03);
    g.add(plate);
    push('metal', new THREE.BoxGeometry(0.3, 0.42, 0.22), trs(w / 2 - 0.34, 0.72, zf + 0.1));
    push('metalDark', new THREE.BoxGeometry(0.34, 0.05, 0.26), trs(w / 2 - 0.34, 0.95, zf + 0.1));
    // and the name plate by the door
    const np = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15),
      flat({ color: 0xffffff, map: namePlate(o.nameVariant ?? 3), cache: false }));
    np.position.set(ex - 0.72, 1.5, zf + 0.045);
    np.userData.noOutline = true;
    g.add(np);
  }

  /* -------------------------- services on the flanks -------------------------- */
  push('metal', new THREE.CylinderGeometry(0.055, 0.055, H + 0.4, 6), trs(w / 2 - 0.12, (H + 0.4) / 2, -d / 2 + 0.2));
  push('metal', new THREE.CylinderGeometry(0.05, 0.05, H, 6), trs(-w / 2 + 0.12, H / 2, d / 2 - 0.2));
  push('trim', new THREE.BoxGeometry(0.78, 0.58, 0.32), trs(w / 2 + 0.16, 1.0, -0.6));
  push('metalDark', new THREE.CylinderGeometry(0.03, 0.03, 2.0, 5), trs(w * 0.2, yr + RH + 1.1, -d * 0.2));
  for (let i = 0; i < 5; i++) {
    push('metalDark', new THREE.BoxGeometry(0.02, 0.02, 0.6 - i * 0.06), trs(w * 0.2, yr + RH + 0.5 + i * 0.16, -d * 0.2));
  }

  const matFor = {
    wall: wallMat, board: m.board, boardDark: m.boardDark, roof: roofMat,
    trim: m.trim, metal: m.metal, metalDark: m.metalDark,
    concrete: m.concreteMid, door: m.doors[o.door ?? 0],
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof' || key === 'board') hullOutline(mesh, { thickness: 0.0032 });
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = FACE_RY[o.face ?? 'z+'];
  g.userData.top = 0.46 + H + RH + 0.3;
  return g;
}

/* ------------------------------------------------------------------ *
 * The walk-up block.
 * ------------------------------------------------------------------ */

/**
 * Mass, then per-floor gallery slab / outer rail / soffit, then the open
 * stair as landings and treads, then rear balcony slabs. A single prism
 * through the plot is a gallery you cannot fly.
 */
function collideWalkup(ctx, o) {
  if (!ctx || o.x == null || o.z == null) return;
  const w = o.w ?? 8.0;
  const d = o.d ?? 7.0;
  const FLOORS = o.floors ?? 3;
  const FH = o.fh ?? 2.7;
  const H = FH * FLOORS;
  const GAL = 1.35;
  const y = o.y ?? 0;
  const ry = FACE_RY[o.face ?? 'z+'];
  const ca = Math.cos(ry);
  const sa = Math.sin(ry);
  const put = (lx, lz, hw, hd, top, bot, skip) => {
    const px = o.x + ca * lx - sa * lz;
    const pz = o.z + sa * lx + ca * lz;
    const hx = Math.abs(ca) * hw + Math.abs(sa) * hd;
    const hz = Math.abs(sa) * hw + Math.abs(ca) * hd;
    ctx.collide(px - hx, pz - hz, px + hx, pz + hz,
      y + top, bot == null ? undefined : y + bot, skip);
  };
  put(0, -GAL / 2, w / 2 + 0.08, (d - GAL) / 2 + 0.08, H + 0.5, undefined, true);
  const gz = d / 2;
  for (let k = 0; k < FLOORS; k++) {
    const fy = k * FH;
    put(0, gz - GAL / 2, w / 2, GAL / 2, fy + 0.22, fy, true);
    put(0, gz - 0.07, w / 2, 0.08, fy + 1.18, fy + 0.30, true);
    put(0, gz - GAL / 2, w / 2, GAL / 2 + 0.05, fy + FH, fy + FH - 0.12, true);
  }
  const sx = -w / 2 - 1.6;
  for (let k = 0; k < FLOORS; k++) {
    const fy = k * FH;
    put(sx + 0.8, gz - GAL / 2 + 0.2, 0.8, (GAL + 0.4) / 2, fy + 0.20, fy, true);
    for (let i = 0; i < 9; i++) {
      put(sx + 0.8, gz - GAL / 2 + 0.4 - i * 0.26, 0.68, 0.16,
        fy + 0.26 + (i * FH) / 9 + 0.08, fy + 0.26 + (i * FH) / 9, true);
    }
    put(sx + 0.04, gz - GAL / 2 + 0.2, 0.05, (GAL + 0.4) / 2, fy + 1.20, fy + 1.12, true);
  }
  put(sx + 0.8, gz - GAL / 2 + 0.3, 0.98, (GAL + 0.8) / 2, H + 0.16, H, true);
  for (let k = 1; k < FLOORS; k++) {
    const fy = k * FH;
    const bz = -d / 2;
    put(0, bz - 0.48, (w - 0.7) / 2, 0.48, fy + 0.18, fy, true);
    put(0, bz - 0.94, (w - 0.7) / 2, 0.06, fy + 1.12, fy + 0.18, true);
  }
}

export function makeWalkup(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 61);
  const g = new THREE.Group();
  g.name = 'walkup';

  const w = o.w ?? 8.0;
  const d = o.d ?? 7.0;
  const FLOORS = o.floors ?? 3;
  const FH = o.fh ?? 2.7;
  const H = FH * FLOORS;
  const UNITS = o.units ?? 4;
  const GAL = 1.35;                       // the access gallery, on the +z face
  const wallMat = m.walls[o.wall ?? 4];
  const parts = { wall: [], trim: [], roof: [], metal: [], metalDark: [], concrete: [], door: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
  const litA = flat({ color: 0xffffff, map: litWindowTex(0), cache: false });
  const litB = flat({ color: 0xffffff, map: litWindowTex(1), cache: false });

  /* ---------------------------------- mass ---------------------------------- */
  push('concrete', new THREE.BoxGeometry(w + 0.44, 0.44, d + 0.44), trs(0, 0.22, 0));
  push('wall', new THREE.BoxGeometry(w, H, d - GAL), trs(0, H / 2, -GAL / 2));
  /* A band at every floor line, not just at the top.  The whole character of the
   * type is horizontal repetition, and the bands are what carry it. */
  for (let k = 1; k <= FLOORS; k++) {
    push('trim', new THREE.BoxGeometry(w + 0.26, 0.22, d + 0.26 - GAL), trs(0, k * FH, -GAL / 2));
  }
  push('roof', new THREE.BoxGeometry(w + 0.5, 0.2, d + 0.5 - GAL), trs(0, H + 0.1, -GAL / 2 + 0.08));
  for (const s of [-1, 1]) {
    push('roof', new THREE.BoxGeometry(w + 0.5, 0.42, 0.16),
      trs(0, H + 0.41, -GAL / 2 + 0.08 + s * ((d + 0.5 - GAL) / 2)));
    push('roof', new THREE.BoxGeometry(0.16, 0.42, d + 0.5 - GAL),
      trs(s * ((w + 0.5) / 2), H + 0.41, -GAL / 2 + 0.08));
  }
  // rooftop: two condensers, a vent and a stubby aerial
  for (const dx of [-1.6, -0.3]) {
    push('trim', new THREE.BoxGeometry(0.9, 0.62, 0.4), trs(dx, H + 0.53, -1.4));
    push('metal', new THREE.BoxGeometry(0.94, 0.05, 0.46), trs(dx, H + 0.86, -1.4));
  }
  push('metal', new THREE.CylinderGeometry(0.14, 0.14, 0.8, 10), trs(w / 2 - 1.1, H + 0.6, -1.9));
  push('metalDark', new THREE.CylinderGeometry(0.028, 0.028, 1.9, 5), trs(-w / 2 + 0.8, H + 1.15, -1.6));

  /* ------------------------------- the gallery ------------------------------- */
  const gz = d / 2;
  for (let k = 0; k < FLOORS; k++) {
    const y = k * FH;
    push('concrete', new THREE.BoxGeometry(w, 0.22, GAL), trs(0, y + 0.11, gz - GAL / 2));
    push('metal', new THREE.BoxGeometry(w, 0.07, 0.07), trs(0, y + 1.16, gz - 0.07));
    push('metalDark', new THREE.BoxGeometry(w, 0.07, 0.07), trs(0, y + 0.36, gz - 0.07));
    const nb = Math.round(w / 0.22);
    for (let i = 0; i <= nb; i++) {
      push('metal', new THREE.BoxGeometry(0.04, 0.84, 0.04), trs(-w / 2 + (w / nb) * i, y + 0.74, gz - 0.07));
    }
    // the soffit over each gallery, so the run above reads as a lid
    push('trim', new THREE.BoxGeometry(w, 0.1, GAL + 0.1), trs(0, y + FH - 0.05, gz - GAL / 2 + 0.05));
    for (let i = 0; i < UNITS; i++) {
      const dx = -w / 2 + (w / UNITS) * (i + 0.5);
      push('trim', new THREE.BoxGeometry(1.0, 2.14, 0.14), trs(dx - 0.32, y + 1.3, gz - GAL + 0.07));
      push('door', new THREE.BoxGeometry(0.86, 2.0, 0.06), trs(dx - 0.32, y + 1.26, gz - GAL + 0.14));
      push('metal', new THREE.BoxGeometry(0.05, 0.3, 0.05), trs(dx - 0.02, y + 1.2, gz - GAL + 0.18));
      // the meter cupboard and the small kitchen window beside every door
      push('metal', new THREE.BoxGeometry(0.3, 0.4, 0.12), trs(dx + 0.66, y + 1.94, gz - GAL + 0.08));
      const lit = rng.chance(0.4);
      g.add(box(0.52, 0.6, 0.05, lit ? (i % 2 ? litB : litA) : m.glass, dx + 0.66, y + 1.3, gz - GAL + 0.14));
      push('metal', new THREE.BoxGeometry(0.62, 0.7, 0.1), trs(dx + 0.66, y + 1.3, gz - GAL + 0.09));
      // a number plate over the door
      const np = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09), flat({ color: 0xf2efe4 }));
      np.position.set(dx - 0.32, y + 2.28, gz - GAL + 0.15);
      np.userData.noOutline = true;
      g.add(np);
    }
  }
  /* the pipe run: one vertical stack with a branch at every floor, which is the
   * detail that stops the gallery elevation being a grid of doors */
  push('metal', new THREE.CylinderGeometry(0.075, 0.075, H, 6), trs(w / 2 - 0.22, H / 2, gz - GAL + 0.16));
  for (let k = 0; k < FLOORS; k++) {
    push('metal', new THREE.BoxGeometry(w * 0.5, 0.07, 0.07), trs(w * 0.24, k * FH + 0.55, gz - GAL + 0.16));
    push('metalDark', new THREE.BoxGeometry(0.12, 0.06, 0.12), trs(w / 2 - 0.22, k * FH + 0.3, gz - GAL + 0.16));
  }

  /* ------------------------------ the open stair ------------------------------ *
   * At the -x end, outside the mass, which is the single most recognisable thing
   * about the type.  Treads on a raked slab, a landing per floor and one rail. */
  {
    const sx = -w / 2 - 1.6;
    for (let k = 0; k < FLOORS; k++) {
      const y = k * FH;
      push('concrete', new THREE.BoxGeometry(1.6, 0.2, GAL + 0.4), trs(sx + 0.8, y + 0.1, gz - GAL / 2 + 0.2));
      for (let i = 0; i < 9; i++) {
        push('concrete', new THREE.BoxGeometry(1.35, 0.14, 0.32),
          trs(sx + 0.8, y + 0.26 + (i * FH) / 9, gz - GAL / 2 + 0.4 - i * 0.26));
      }
      push('metal', new THREE.BoxGeometry(0.07, 0.07, GAL + 0.4), trs(sx + 0.04, y + 1.16, gz - GAL / 2 + 0.2));
      for (let i = 0; i <= 8; i++) {
        push('metal', new THREE.BoxGeometry(0.04, 0.9, 0.04),
          trs(sx + 0.04, y + 0.72 + (i * FH) / 9, gz - GAL / 2 + 0.4 - i * 0.26));
      }
    }
    push('roof', new THREE.BoxGeometry(1.95, 0.16, GAL + 0.8), trs(sx + 0.8, H + 0.08, gz - GAL / 2 + 0.3));
  }

  /* ------------------------- balconies on the quiet side ------------------------- */
  for (let k = 1; k < FLOORS; k++) {
    const y = k * FH;
    const bz = -d / 2;
    push('concrete', new THREE.BoxGeometry(w - 0.7, 0.18, 0.95), trs(0, y + 0.09, bz - 0.48));
    push('metal', new THREE.BoxGeometry(w - 0.7, 0.06, 0.06), trs(0, y + 1.08, bz - 0.94));
    push('metalDark', new THREE.BoxGeometry(w - 0.7, 0.46, 0.05), trs(0, y + 0.58, bz - 0.94));
    const nb = Math.round((w - 0.7) / 0.24);
    for (let i = 0; i <= nb; i++) {
      push('metal', new THREE.BoxGeometry(0.04, 0.94, 0.04), trs(-(w - 0.7) / 2 + ((w - 0.7) / nb) * i, y + 0.62, bz - 0.94));
    }
    push('metal', new THREE.BoxGeometry(w - 1.4, 0.05, 0.05), trs(0, y + 1.5, bz - 0.7));
    for (let i = 0; i < UNITS - 1; i++) {
      const dx = -w / 2 + (w / (UNITS - 1)) * (i + 0.5);
      slider(push, g, { x: dx, y: y + 1.1, z: bz - 0.02, w: 1.4, h: 1.8, lit: rng.chance(0.45), curtain: rng.chance(0.6), variant: i });
      // the party screen between balconies, which every one of these has
      if (i) push('trim', new THREE.BoxGeometry(0.06, 1.0, 0.9), trs(-w / 2 + (w / (UNITS - 1)) * i, y + 0.68, bz - 0.5));
    }
    // washing on two of the three floors
    if (k !== 2) {
      for (let i = 0; i < 3; i++) {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(rng.range(0.34, 0.5), rng.range(0.5, 0.72)),
          cel({ color: rng.pick([PAL.wallBlue, PAL.blossom, PAL.wallWhite, PAL.yellow, 0xa8cfe0]),
            bands: 2, side: THREE.DoubleSide, tint: 0x6f6790 }));
        t.position.set(-2.2 + i * 1.9, y + 1.12, bz - 0.7);
        t.rotation.y = rng.range(-0.12, 0.12);
        t.castShadow = true;
        g.add(t);
      }
    }
  }

  /* the name plate on the stair end, at eye level where it belongs */
  {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.42, 0.1),
      [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: 0xffffff, map: blockPlate(o.plate ?? 0), cache: false }),
       flat({ color: PAL.wallGray })]
    );
    plate.position.set(-w / 2 + 1.1, 2.3, gz + 0.06);
    plate.castShadow = true;
    g.add(plate);
    hullOutline(plate, { thickness: 0.003 });
  }

  const matFor = {
    wall: wallMat, trim: m.trim, roof: m.roofs[o.roof ?? 0], metal: m.metal,
    metalDark: m.metalDark, concrete: m.concrete, door: m.doors[o.door ?? 1],
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof') hullOutline(mesh, { thickness: 0.0032 });
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = FACE_RY[o.face ?? 'z+'];
  g.userData.top = H + 0.62;
  g.userData.stairOut = 1.6;
  collideWalkup(o.ctx, o);
  return g;
}

/* ------------------------------------------------------------------ *
 * The terrace.
 * ------------------------------------------------------------------ */

export function makeTerrace(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 71);
  const g = new THREE.Group();
  g.name = 'terrace';

  const N = o.units ?? 3;
  const uw = o.unitW ?? 2.9;
  const w = uw * N;
  const d = o.d ?? 6.2;
  const FH = 2.62;
  const H = FH * 2;
  const wallMat = m.walls[o.wall ?? 0];
  const parts = { wall: [], trim: [], roof: [], metal: [], metalDark: [], concrete: [], door: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  push('concrete', new THREE.BoxGeometry(w + 0.18, 0.4, d + 0.18), trs(0, 0.2, 0));
  push('wall', new THREE.BoxGeometry(w, H, d), trs(0, H / 2, 0));
  push('trim', new THREE.BoxGeometry(w + 0.1, 0.14, d + 0.1), trs(0, FH, 0));

  /* A shallow gable running the length of the row, which is what a 建売 terrace
   * always has -- one roof over N houses is most of why it reads as one
   * building rather than as N. */
  {
    const eave = 0.36;
    const rw = w + eave * 2;
    const rd = d + eave * 2;
    const rh = 1.0;
    const slope = Math.atan2(rh, rd / 2);
    const slab = Math.hypot(rd / 2, rh) + 0.06;
    for (const s of [-1, 1]) {
      push('roof', new THREE.BoxGeometry(rw, 0.14, slab), trs(0, H + rh / 2, s * (rd / 4), s * slope, 0, 0));
    }
    push('roof', new THREE.BoxGeometry(rw + 0.06, 0.17, 0.24), trs(0, H + rh + 0.04, 0));
    // the verge boards at each end, closing the roof over the end party walls
    const tri = new THREE.Shape();
    tri.moveTo(-rd / 2 + eave, 0);
    tri.lineTo(rd / 2 - eave, 0);
    tri.lineTo(0, rh * (1 - (eave * 2) / rd));
    tri.closePath();
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.16, bevelEnabled: false });
    triGeo.translate(0, 0, -0.08);
    for (const s of [-1, 1]) {
      push('wall', triGeo, trs(s * (w / 2 - 0.02), H, 0, 0, Math.PI / 2, 0));
    }
    triGeo.dispose();
    push('metal', new THREE.BoxGeometry(rw, 0.11, 0.11), trs(0, H + 0.04, rd / 2 - 0.02));
  }

  /* ------------------------------- unit by unit ------------------------------- *
   * Same wall, same roof, same window; a different door colour, a different bit
   * of clutter, one shutter half down.  That is the whole recipe -- a terrace
   * whose units differ in *material* stops being a terrace. */
  const zf = d / 2;
  for (let i = 0; i < N; i++) {
    const cx = -w / 2 + uw * (i + 0.5);
    // the party wall, expressed as a shallow pilaster up the full height
    if (i) push('trim', new THREE.BoxGeometry(0.16, H, d + 0.06), trs(-w / 2 + uw * i, H / 2, 0));
    // the door, in its own colour, with a hood and a step
    const dm = m.doors[(i * 2 + (o.seed ?? 0)) % DOORS.length];
    const dx = cx - uw / 2 + 0.78;
    const door = box(0.9, 2.0, 0.08, dm, dx, 0.4 + 1.0, zf + 0.01);
    door.castShadow = door.receiveShadow = true;
    g.add(door);
    push('trim', new THREE.BoxGeometry(1.16, 2.2, 0.14), trs(dx, 0.4 + 1.04, zf - 0.05));
    push('metal', new THREE.BoxGeometry(0.05, 0.34, 0.05), trs(dx + 0.32, 0.4 + 1.0, zf + 0.06));
    push('trim', new THREE.BoxGeometry(1.5, 0.1, 0.62), trs(dx, 0.4 + 2.3, zf + 0.28));
    push('metal', new THREE.BoxGeometry(1.56, 0.05, 0.66), trs(dx, 0.4 + 2.36, zf + 0.29));
    for (let k = 0; k < 2; k++) {
      const t = 0.4 - k * 0.2;
      push('concrete', new THREE.BoxGeometry(1.24 - k * 0.14, t, 0.32), trs(dx, t / 2, zf + 0.16 + k * 0.32));
    }
    // the ground-floor window, and a shutter half down on one unit
    const wx = cx + uw / 2 - 0.85;
    slider(push, g, { x: wx, y: 0.4 + 1.4, z: zf, w: 1.2, h: 1.2, curtain: i !== 1, variant: i });
    if (i === 1) {
      push('metal', new THREE.BoxGeometry(1.34, 0.62, 0.07), trs(wx, 0.4 + 1.7, zf + 0.08));
      push('metalDark', new THREE.BoxGeometry(1.36, 0.06, 0.09), trs(wx, 0.4 + 1.38, zf + 0.09));
    }
    // upstairs: one window per unit and a shared balcony line
    slider(push, g, { x: cx, y: FH + 1.5, z: zf, w: 1.7, h: 1.34, lit: i === 2, curtain: i === 0, variant: i + 1 });
    {
      const by = FH + 0.44;
      push('concrete', new THREE.BoxGeometry(uw - 0.16, 0.1, 0.82), trs(cx, by, zf + 0.41));
      push('metal', new THREE.BoxGeometry(uw - 0.16, 0.06, 0.06), trs(cx, by + 0.98, zf + 0.8));
      push('metalDark', new THREE.BoxGeometry(uw - 0.16, 0.4, 0.05), trs(cx, by + 0.32, zf + 0.8));
      const nb = Math.round((uw - 0.16) / 0.23);
      for (let k = 0; k <= nb; k++) {
        push('metal', new THREE.BoxGeometry(0.04, 0.9, 0.04), trs(cx - (uw - 0.16) / 2 + ((uw - 0.16) / nb) * k, by + 0.5, zf + 0.8));
      }
      if (i !== 1) {
        push('metal', new THREE.BoxGeometry(uw * 0.7, 0.05, 0.05), trs(cx, by + 1.36, zf + 0.56));
        for (let k = 0; k < 2; k++) {
          const t = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.58),
            cel({ color: rng.pick([PAL.wallBlue, PAL.blossom, PAL.wallWhite, PAL.yellow]),
              bands: 2, side: THREE.DoubleSide, tint: 0x6f6790 }));
          t.position.set(cx - 0.42 + k * 0.84, by + 1.05, zf + 0.56);
          t.castShadow = true;
          g.add(t);
        }
      }
      // the party screen between balconies
      if (i) push('trim', new THREE.BoxGeometry(0.05, 0.98, 0.78), trs(-w / 2 + uw * i, by + 0.6, zf + 0.44));
    }
    // meter, name plate and the downpipe on the party line
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.38, 0.09),
      flat({ color: 0xffffff, map: meterBox(), cache: false }));
    plate.position.set(cx - uw / 2 + 0.24, 1.8, zf + 0.03);
    g.add(plate);
    const np = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.14),
      flat({ color: 0xffffff, map: namePlate(i + 1), cache: false }));
    np.position.set(dx - 0.62, 1.48, zf + 0.045);
    np.userData.noOutline = true;
    g.add(np);
    if (i) push('metal', new THREE.CylinderGeometry(0.05, 0.05, H, 6), trs(-w / 2 + uw * i, H / 2, zf + 0.1));
  }
  push('metal', new THREE.CylinderGeometry(0.055, 0.055, H, 6), trs(-w / 2 + 0.14, H / 2, -zf + 0.14));

  const matFor = {
    wall: wallMat, trim: m.trim, roof: m.roofs[o.roof ?? 1], metal: m.metal,
    metalDark: m.metalDark, concrete: m.concreteMid, door: m.doors[0],
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof') hullOutline(mesh, { thickness: 0.0032 });
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = FACE_RY[o.face ?? 'z+'];
  g.userData.top = H + 1.1;
  g.userData.width = w;
  return g;
}

/* ------------------------------------------------------------------ *
 * Two lean-tos.
 *
 * Both are the same three ideas -- four thin posts, a translucent corrugated
 * sheet, a gutter along the low edge -- and both live or die on the sheet
 * reading *as* a sheet.  The lesson from the overbridge canopy applies exactly:
 * a pale translucent panel seen from below against a pale sky is not there at
 * all unless it is tinted cool and pushed past about 0.55 opacity.
 * ------------------------------------------------------------------ */

function leanTo(g, { w, d, h, fall, mat, sheetColor, opacity }) {
  const m = mats();
  const parts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const hy = h + (sz > 0 ? 0 : fall);
      parts.push({
        geometry: new THREE.CylinderGeometry(0.045, 0.05, hy, 7),
        matrix: trs(sx * (w / 2 - 0.12), hy / 2, sz * (d / 2 - 0.1)),
      });
      parts.push({
        geometry: new THREE.CylinderGeometry(0.1, 0.12, 0.12, 8),
        matrix: trs(sx * (w / 2 - 0.12), 0.06, sz * (d / 2 - 0.1)),
      });
    }
  }
  const tilt = Math.atan2(fall, d);
  for (const sx of [-1, 1]) {
    parts.push({
      geometry: new THREE.BoxGeometry(0.06, 0.06, d / Math.cos(tilt)),
      matrix: trs(sx * (w / 2 - 0.12), h + fall / 2 + 0.02, 0, tilt, 0, 0),
    });
  }
  parts.push({ geometry: new THREE.BoxGeometry(w, 0.07, 0.09), matrix: trs(0, h + 0.02, d / 2 - 0.08) });
  parts.push({ geometry: new THREE.BoxGeometry(w, 0.09, 0.11), matrix: trs(0, h + fall - 0.02, -d / 2 + 0.06) });
  const fm = new THREE.Mesh(bake(parts), mat ?? m.metalDark);
  fm.name = 'openFrame';
  fm.castShadow = true;
  g.add(fm);

  const sheet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.03, d / Math.cos(tilt) + 0.2),
    flat({ color: sheetColor ?? 0xa8c0d4, transparent: true, opacity: opacity ?? 0.6, depthWrite: false, cache: false }));
  sheet.name = 'canopy';
  sheet.position.set(0, h + fall / 2 + 0.07, 0);
  sheet.rotation.x = tilt;
  sheet.userData.noOutline = true;
  sheet.userData.noShadow = true;
  g.add(sheet);
  // the ribs, which is what makes a translucent sheet read as corrugated
  {
    const ribs = [];
    const n = Math.round(w / 0.24);
    for (let i = 0; i < n; i++) {
      ribs.push({
        geometry: new THREE.BoxGeometry(0.05, 0.05, d / Math.cos(tilt) + 0.16),
        matrix: trs(-w / 2 + 0.1 + i * ((w - 0.2) / (n - 1)), h + fall / 2 + 0.09, 0, tilt, 0, 0),
      });
    }
    const rm = new THREE.Mesh(bake(ribs), m.metal);
    rm.name = 'canopy';
    g.add(rm);
  }
  return g;
}

function collideLeanTo(ctx, o, w, d, h, fall) {
  if (!ctx || o.x == null || o.z == null) return;
  const ry = o.ry ?? 0;
  const ca = Math.cos(ry);
  const sa = Math.sin(ry);
  const y = o.y ?? 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = sx * (w / 2 - 0.12);
      const lz = sz * (d / 2 - 0.1);
      const px = o.x + ca * lx - sa * lz;
      const pz = o.z + sa * lx + ca * lz;
      ctx.collide(px - 0.055, pz - 0.055, px + 0.055, pz + 0.055,
        y + h + (sz > 0 ? 0 : fall), y, true);
    }
  }
  const hw = (Math.abs(ca) * w + Math.abs(sa) * d) / 2;
  const hd = (Math.abs(sa) * w + Math.abs(ca) * d) / 2;
  ctx.collide(o.x - hw - 0.08, o.z - hd - 0.08, o.x + hw + 0.08, o.z + hd + 0.08,
    y + h + fall + 0.14, y + h + fall - 0.08, true);
}

/** A carport: the lean-to over a bay, plus the wheel stop under it. */
export function makeCarport(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'openFrame';
  const w = o.w ?? 2.7, d = o.d ?? 5.0, h = o.h ?? 2.25, fall = 0.22;
  leanTo(g, { w, d, h, fall, sheetColor: 0x9cb8d0, opacity: 0.62 });
  g.add(box(w - 0.9, 0.11, 0.16, m.concreteMid, 0, 0.055, -d / 2 + 0.7));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  collideLeanTo(o.ctx, o, w, d, h, fall);
  return g;
}

/** A bicycle shelter: the same lean-to, lower and shallower. */
export function makeBikeShelter(o = {}) {
  const g = new THREE.Group();
  g.name = 'openFrame';
  const w = o.w ?? 4.2, d = o.d ?? 1.9, h = o.h ?? 2.05, fall = 0.18;
  leanTo(g, { w, d, h, fall, sheetColor: 0xb0c4d0, opacity: 0.58 });
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  collideLeanTo(o.ctx, o, w, d, h, fall);
  return g;
}
