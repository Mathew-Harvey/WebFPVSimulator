import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  meterBox, litWindowTex, curtainTex, namePlate, hallPlate, hallNotice,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';

/* ------------------------------------------------------------------ *
 * Four more residential types.
 *
 * `buildings.js` has the detached house and `housing.js` has the attic house,
 * the walk-up and the terrace.  Between them that is five, and a Japanese
 * suburb that has been built out over sixty years shows more than five,
 * because each wave of plots was sold to a different kind of buyer.  These are
 * the four the world was still missing, and each one exists for a silhouette
 * the others cannot make:
 *
 *   makeGarageHouse  狭小住宅 -- a narrow three-level house with the car parked
 *                    *inside* the ground floor.  The one type here whose front
 *                    elevation is mostly a hole, which is what makes it read
 *                    against everything else on a lane: a dark bay under two
 *                    storeys of pale render.  Post-war infill, and it is the
 *                    only way a 5 m plot gets a car.
 *   makeTimberHouse  the old 木造 house: stone base, 下見板 boarding, a heavy
 *                    tiled roof with a deep eave, 格子 screens on the frontage
 *                    and a 縁側 down one flank.  `district.js` has one of these
 *                    hand-built below the shrine; the back streets need six, so
 *                    it is a generator now.
 *   makeNagaya       長屋 -- N single-storey units under one continuous low
 *                    roof, doors straight onto the street with no setback at
 *                    all.  It is the *lowest* thing in the world with a
 *                    frontage, and a back street reads as old the moment one
 *                    is on it.
 *   makeHall         町内会館 -- the neighbourhood association hall.  Not a
 *                    house and not a shop: one storey, pale render, a porch,
 *                    a notice board and a car space.  A residential district
 *                    without one has nowhere for the community to be, and the
 *                    building is how you say people organise here without
 *                    putting anybody in the frame.
 *
 * All four follow the `makeShop` convention: authored facing **+Z** with `w`
 * along X and `d` along Z, then the whole group turned by `face`.  Branching on
 * an axis inside every measurement is how the overbridge stairs ended up
 * climbing away from their own treads.  All four bake their static parts per
 * material, so a building costs eight or nine draw calls rather than eighty.
 *
 * Two rules that are not obvious and cost a whole round each when they were
 * broken elsewhere:
 *
 *  - **You cannot carve a recess into a box.**  Every volume here is a solid
 *    `BoxGeometry`, so a panel written *behind* the wall face is simply inside
 *    the render.  The garage bay and the 格子 screens are built by leaving a
 *    hole in the masonry (piers, a header, a back wall) and standing the detail
 *    *outward* of the face -- backing board, then battens, then a sill deeper
 *    than both.
 *  - **A `PlaneGeometry` faces +z and `flat()` is single-sided.**  Because
 *    everything here is authored facing +z, every painted interior, curtain and
 *    plate is correct by construction -- which is exactly why the convention is
 *    worth keeping.
 * ------------------------------------------------------------------ */

const FACE_RY = { 'z+': 0, 'z-': Math.PI, 'x+': Math.PI / 2, 'x-': -Math.PI / 2 };

/* Appended, never reordered -- every `wall:` and `roof:` index in the world is
 * a number into these, exactly as in `buildings.js`. */
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
  M.concreteDark = cel({ color: PAL.concreteDark, bands: 3, tint: 0x655d84 });
  /* The timber set.  Four tones and no more: frame, boarding, the deep members
   * behind a lattice, and fresh cedar.  The onsen street proved that a whole
   * street of dark structure on a pale field only holds together if the wood is
   * this narrow a range. */
  M.wood = cel({ color: PAL.onsenWood, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: PAL.onsenWoodDark, bands: 3, tint: 0x554e74 });
  M.woodPale = cel({ color: PAL.onsenWoodPale, bands: 3, tint: 0x5c5680 });
  M.board = cel({ color: 0xa88f6e, bands: 3, tint: 0x5c5680 });
  M.boardDark = cel({ color: 0x7d6146, bands: 3, tint: 0x554e74 });
  M.plaster = cel({ color: PAL.onsenPlaster, bands: 3, tint: 0x6f6790 });
  M.tile = cel({ color: 0x5a5f6e, bands: 3, tint: 0x4a4468 });
  M.tileDark = cel({ color: PAL.onsenTile, bands: 3, tint: 0x413c58 });
  M.shutter = cel({ color: PAL.shutter, bands: 3, tint: 0x4b4560 });
  return M;
}

/**
 * A sliding window: reveal, pane, mullion, sill -- facing +z, in local space.
 *
 * Same helper `housing.js` carries, and deliberately the same proportions: the
 * window is the one component that appears on every type in the world, and if
 * two generators draw it differently the street stops looking like one street.
 */
function slider(push, g, { x, y, z, w, h, lit = false, curtain = false, variant = 0, mat }) {
  const m = mats();
  push('trim', new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.14), trs(x, y, z - 0.03));
  const paneMat = lit
    ? flat({ color: 0xffffff, map: litWindowTex(variant % 3), cache: false })
    : (mat ?? m.glass);
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

/**
 * 格子 -- a timber lattice screen over a window or a whole bay.
 *
 * Built **outward** of the wall face, and that is the entire point of the
 * function existing.  Every one of these on the onsen street first went in at
 * `front - 0.04` to look recessed, and not one of them was drawn: five timber
 * frontages rendered as blank plaster and nothing threw.  So: a dark backing
 * board 40 mm proud, the battens 120 mm proud, and the sill and posts 80 mm
 * proud so they are deeper than the backing and shallower than the battens,
 * which is what frames it.
 */
function lattice(push, { x, y, z, w, h, n, vertical = true }) {
  push('woodDark', new THREE.BoxGeometry(w, h, 0.04), trs(x, y, z + 0.04));
  const count = n ?? Math.max(3, Math.round(w / 0.13));
  for (let i = 0; i < count; i++) {
    const t = -w / 2 + (w / count) * (i + 0.5);
    if (vertical) push('wood', new THREE.BoxGeometry(0.045, h - 0.02, 0.045), trs(x + t, y, z + 0.12));
    else push('wood', new THREE.BoxGeometry(w - 0.02, 0.045, 0.045), trs(x, y + t, z + 0.12));
  }
  // the frame: two posts, a head and a sill, all deeper than the backing board
  push('wood', new THREE.BoxGeometry(w + 0.14, 0.1, 0.16), trs(x, y + h / 2 + 0.05, z + 0.08));
  push('woodPale', new THREE.BoxGeometry(w + 0.18, 0.11, 0.2), trs(x, y - h / 2 - 0.06, z + 0.09));
  for (const s of [-1, 1]) {
    push('wood', new THREE.BoxGeometry(0.1, h + 0.2, 0.16), trs(x + s * (w / 2 + 0.05), y, z + 0.08));
  }
}

/** Roof tiling as a run of shallow ribs across the slope -- 桟瓦 at this range. */
function tileRibs(g, mat, { x, y, z, w, len, pitch = 0.3, rx = 0, rz = 0 }) {
  const ribs = [];
  const n = Math.max(2, Math.round(len / pitch));
  for (let i = 0; i < n; i++) {
    ribs.push({
      geometry: new THREE.BoxGeometry(w, 0.05, 0.07),
      matrix: trs(0, 0, -len / 2 + (len / n) * (i + 0.5)),
    });
  }
  const mesh = new THREE.Mesh(bake(ribs), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, 0, rz);
  mesh.castShadow = true;
  g.add(mesh);
}

/* ------------------------------------------------------------------ *
 * 狭小住宅 -- the narrow house with the car in the ground floor.
 * ------------------------------------------------------------------ */

/**
 * Mass minus the open bay, then the header, the shutter curtain, the
 * jamb, and the living floors over the mouth. A plot prism fills a
 * bay the drawing leaves as a hole.
 */
function collideGarageHouse(ctx, o) {
  if (!ctx || o.x == null || o.z == null) return;
  const w = o.w ?? 5.2;
  const d = o.d ?? 7.6;
  const FLOORS = o.floors ?? 2;
  const H1 = 2.62;
  const FH = 2.66;
  const H = H1 + FH * FLOORS;
  const ENTRY = 1.85;
  const BAY = w - ENTRY;
  const GD = Math.min(d - 1.6, 4.6);
  const side = (o.doorSide ?? -1) < 0 ? -1 : 1;
  const ex = side * (w / 2 - ENTRY / 2);
  const bx = -side * (w / 2 - BAY / 2);
  const zf = d / 2;
  const SH = 2.35 * (o.garage ?? 0.25);
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
  put(0, 0, w / 2 + 0.16, d / 2 + 0.16, 0.3 + H + 0.65, 0.3 + H1, true);
  put(ex, 0, ENTRY / 2 + 0.12, d / 2 + 0.12, 0.3 + H1);
  put(bx, -GD / 2, BAY / 2 + 0.08, (d - GD) / 2 + 0.12, 0.3 + H1);
  put(bx - side * (BAY / 2 - 0.09), zf - GD / 2, 0.12, GD / 2 + 0.06, 0.3 + H1);
  put(bx, zf - GD / 2, BAY / 2, GD / 2, 0.3 + H1, 0.3 + 2.35, true);
  put(bx, zf - GD / 2 + 0.25, BAY / 2, (GD + 0.5) / 2, 0.16, 0, true);
  if (SH > 0.02) {
    put(bx, zf - 0.2, BAY / 2, 0.08, 2.35, 2.35 - SH, true);
  }
}

export function makeGarageHouse(o = {}) {
  /* o.w, o.d: frontage. 4.6-5.6 is the type.
   * o.floors: living storeys above the garage, 1 or 2.
   * o.garage: 0 shutter up .. 1 shut. ~0.25 is the useful state.
   * o.doorSide: -1 door on -x of the frontage, +1 on +x. Garage takes the rest. */
  const m = mats();
  const rng = rngKit(o.seed ?? 91);
  const g = new THREE.Group();
  g.name = 'garageHouse';

  const w = o.w ?? 5.2;
  const d = o.d ?? 7.6;
  const FLOORS = o.floors ?? 2;
  const H1 = 2.62;                       // the garage storey: 2.35 m clear
  const FH = 2.66;
  const H = H1 + FH * FLOORS;
  const ENTRY = 1.85;                    // the width the door and stair take
  const BAY = w - ENTRY;                 // the garage opening
  const GD = Math.min(d - 1.6, 4.6);     // how deep the bay is cut into the plan
  const side = (o.doorSide ?? -1) < 0 ? -1 : 1;
  const ex = side * (w / 2 - ENTRY / 2); // entry strip centre
  const bx = -side * (w / 2 - BAY / 2);  // garage bay centre
  const wallMat = m.walls[o.wall ?? 0];
  const roofMat = m.roofs[o.roof ?? 0];
  const parts = {
    wall: [], trim: [], roof: [], metal: [], metalDark: [],
    concrete: [], concreteDark: [], door: [], wood: [], woodDark: [], woodPale: [],
  };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  const zf = d / 2;

  /* ------------------------------ ground floor ------------------------------ *
   * A hole in the masonry, not a recess pressed into a solid box: the entry
   * strip runs the full depth, the garage's back wall stands `GD` in from the
   * frontage, and a header spans the opening. */
  /* The plinth runs under the *solid* parts only.  Run it across the whole
   * footprint -- which is what every other generator here does, because every
   * other generator has a solid ground floor -- and it fills the bottom 0.3 m
   * of the garage with concrete, so the bay you can see into has a step in it
   * that no car could cross.  A garage floor is on the ground. */
  push('concrete', new THREE.BoxGeometry(ENTRY + 0.2, 0.42, d + 0.2), trs(ex, 0.21, 0));
  push('concrete', new THREE.BoxGeometry(BAY + 0.1, 0.3, d - GD + 0.2), trs(bx, 0.15, -GD / 2 - 0.05));
  push('wall', new THREE.BoxGeometry(ENTRY, H1, d), trs(ex, 0.3 + H1 / 2, 0));
  push('wall', new THREE.BoxGeometry(BAY, H1, d - GD), trs(bx, 0.3 + H1 / 2, -GD / 2));
  // the bay's outer wall, and the header over its mouth
  push('wall', new THREE.BoxGeometry(0.18, H1, GD), trs(bx - side * (BAY / 2 - 0.09), 0.3 + H1 / 2, zf - GD / 2));
  push('wall', new THREE.BoxGeometry(BAY, H1 - 2.35, GD), trs(bx, 0.3 + H1 - (H1 - 2.35) / 2, zf - GD / 2));
  // floor slab, and the oil-darkened strip down the middle of it
  push('concrete', new THREE.BoxGeometry(BAY, 0.14, GD + 0.5), trs(bx, 0.07, zf - GD / 2 + 0.25));
  {
    const stain = box(BAY - 0.7, 0.02, GD - 0.8, m.concreteDark, bx, 0.15, zf - GD / 2);
    stain.userData.noOutline = true;
    stain.receiveShadow = true;
    g.add(stain);
  }
  /* What is actually in a garage, on the back wall where it can be seen from
   * the street: a shelf of boxes, a coil of hose, a strip light under the
   * header.  All of it stands *forward* of the back wall face. */
  {
    const bz = zf - GD;
    push('metal', new THREE.BoxGeometry(BAY - 0.5, 0.05, 0.36), trs(bx, 1.62, bz + 0.2));
    push('metal', new THREE.BoxGeometry(BAY - 0.5, 0.05, 0.36), trs(bx, 1.06, bz + 0.2));
    for (const sx of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(0.05, 1.7, 0.05), trs(bx + sx * (BAY / 2 - 0.3), 0.9, bz + 0.34));
    }
    const boxes = [];
    for (let i = 0; i < 5; i++) {
      const bw = rng.range(0.3, 0.44);
      boxes.push({
        geometry: new THREE.BoxGeometry(bw, rng.range(0.2, 0.3), 0.3),
        matrix: trs(bx - BAY / 2 + 0.5 + i * 0.5, (i % 2 ? 1.78 : 1.22), bz + 0.24),
      });
    }
    const bm = new THREE.Mesh(bake(boxes), cel({ color: 0xb59a74, bands: 3, tint: 0x5c5680 }));
    bm.castShadow = true;
    g.add(bm);
    const strip = box(BAY - 0.9, 0.06, 0.12, flat({ color: 0xfff4dc }), bx, 2.24, bz + 0.5);
    strip.userData.noOutline = true;
    g.add(strip);
    push('metalDark', new THREE.BoxGeometry(BAY - 0.8, 0.1, 0.16), trs(bx, 2.31, bz + 0.5));
  }
  /* the shutter and its box.  A garage shutter is a *deep* box under the
   * header -- flush with the wall it reads as a painted band. */
  {
    const SH = 2.35 * (o.garage ?? 0.25);
    push('metalDark', new THREE.BoxGeometry(BAY + 0.14, 0.34, 0.34), trs(bx, 2.5, zf - 0.18));
    if (SH > 0.02) {
      const ribs = [];
      const n = Math.max(2, Math.round(SH / 0.11));
      for (let i = 0; i < n; i++) {
        ribs.push({
          geometry: new THREE.BoxGeometry(BAY - 0.08, 0.09, 0.05),
          matrix: trs(bx, 2.35 - SH + (SH / n) * (i + 0.5), zf - 0.2),
        });
      }
      const sm = new THREE.Mesh(bake(ribs), m.shutter);
      sm.castShadow = sm.receiveShadow = true;
      g.add(sm);
      push('metalDark', new THREE.BoxGeometry(BAY - 0.04, 0.11, 0.1), trs(bx, 2.35 - SH, zf - 0.2));
    }
    // the rails the shutter runs in, which is what makes it read as a shutter
    for (const s of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(0.09, 2.4, 0.13), trs(bx + s * (BAY / 2 - 0.04), 1.5, zf - 0.2));
    }
  }

  /* -------------------------------- entrance -------------------------------- */
  {
    const dxx = ex;
    push('door', new THREE.BoxGeometry(0.94, 2.02, 0.09), trs(dxx, 0.42 + 1.01, zf - 0.02));
    push('trim', new THREE.BoxGeometry(1.22, 2.22, 0.14), trs(dxx, 0.42 + 1.06, zf - 0.07));
    push('metal', new THREE.BoxGeometry(0.05, 0.86, 0.05), trs(dxx + 0.34, 0.42 + 1.0, zf + 0.04));
    // the hood, on two brackets
    push('trim', new THREE.BoxGeometry(1.7, 0.1, 0.78), trs(dxx, 0.42 + 2.36, zf + 0.34));
    push('metal', new THREE.BoxGeometry(1.76, 0.05, 0.84), trs(dxx, 0.42 + 2.42, zf + 0.35));
    for (const s of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(0.05, 0.42, 0.05), trs(dxx + s * 0.7, 0.42 + 2.12, zf + 0.6));
    }
    for (let i = 0; i < 2; i++) {
      const t = 0.42 - i * 0.21;
      push('concrete', new THREE.BoxGeometry(1.42 - i * 0.16, t, 0.34), trs(dxx, t / 2, zf + 0.17 + i * 0.34));
    }
    // meter cupboard and name plate, at the heights they always are
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.1),
      flat({ color: 0xffffff, map: meterBox(), cache: false }));
    plate.position.set(ex - side * 0.72, 1.8, zf + 0.03);
    g.add(plate);
    const np = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15),
      flat({ color: 0xffffff, map: namePlate(o.nameVariant ?? 6), cache: false }));
    np.position.set(dxx - side * 0.62, 1.44, zf + 0.048);
    np.userData.noOutline = true;
    g.add(np);
  }

  /* ------------------------------ upper storeys ------------------------------ *
   * Oversailing the ground floor by 0.1 m all round.  That tiny overhang is
   * what a 狭小住宅 always has and it does real work: it puts a shadow line
   * across the top of the garage mouth and stops the elevation being one flat
   * plane four storeys tall. */
  for (let k = 0; k < FLOORS; k++) {
    const y0 = 0.3 + H1 + FH * k;
    push('wall', new THREE.BoxGeometry(w + 0.2, FH, d + 0.2), trs(0, y0 + FH / 2, 0));
    push('trim', new THREE.BoxGeometry(w + 0.3, 0.14, d + 0.3), trs(0, y0 + 0.02, 0));
    const lit = k === FLOORS - 1 ? (o.lit ?? false) : rng.chance(0.35);
    // the big room on the front, a narrow one beside it
    slider(push, g, {
      x: bx, y: y0 + 1.42, z: zf + 0.1, w: Math.min(BAY - 0.4, 2.1), h: 1.34,
      lit, curtain: !lit, variant: k,
    });
    slider(push, g, {
      x: ex, y: y0 + 1.5, z: zf + 0.1, w: 0.9, h: 1.0, curtain: rng.chance(0.5), variant: k + 1,
    });
    // one balcony, on the upper floor only -- two stacked reads as an apartment
    if (k === FLOORS - 1) {
      const by = y0 + 0.34;
      const bw = w - 0.5;
      push('concrete', new THREE.BoxGeometry(bw, 0.11, 0.92), trs(0, by, zf + 0.56));
      push('metal', new THREE.BoxGeometry(bw, 0.06, 0.06), trs(0, by + 1.02, zf + 1.0));
      push('metalDark', new THREE.BoxGeometry(bw, 0.44, 0.05), trs(0, by + 0.36, zf + 1.0));
      const nb = Math.round(bw / 0.23);
      for (let i = 0; i <= nb; i++) {
        push('metal', new THREE.BoxGeometry(0.04, 0.94, 0.04), trs(-bw / 2 + (bw / nb) * i, by + 0.54, zf + 1.0));
      }
      push('metal', new THREE.BoxGeometry(bw * 0.78, 0.05, 0.05), trs(0, by + 1.44, zf + 0.72));
      if (rng.chance(0.85)) {
        for (let i = 0; i < 3; i++) {
          const t = new THREE.Mesh(new THREE.PlaneGeometry(rng.range(0.32, 0.46), rng.range(0.5, 0.7)),
            cel({
              color: rng.pick([PAL.wallBlue, PAL.blossom, PAL.wallWhite, PAL.yellow, 0xa8cfe0]),
              bands: 2, side: THREE.DoubleSide, tint: 0x6f6790,
            }));
          t.position.set(-bw / 2 + 0.6 + i * ((bw - 1.2) / 2), by + 1.06, zf + 0.72);
          t.rotation.y = rng.range(-0.12, 0.12);
          t.castShadow = true;
          g.add(t);
        }
      }
    }
    // a small window on each flank, so the gable walls are not blank
    for (const s of [-1, 1]) {
      push('trim', new THREE.BoxGeometry(0.14, 0.86, 0.72), trs(s * (w / 2 + 0.1), y0 + 1.5, -d * 0.18));
      g.add(box(0.05, 0.7, 0.58, m.glass, s * (w / 2 + 0.16), y0 + 1.5, -d * 0.18));
    }
  }

  /* ---------------------------------- roof ---------------------------------- *
   * Shallow mono-pitch behind a low parapet on the street side: this type is
   * built to a height limit, so its roof is whatever is left over. */
  {
    const yr = 0.3 + H;
    const fall = 0.42;
    const rw = w + 0.5, rd = d + 0.5;
    const tilt = Math.atan2(fall, rd);
    push('roof', new THREE.BoxGeometry(rw, 0.14, rd / Math.cos(tilt)), trs(0, yr + fall / 2 + 0.07, 0, tilt, 0, 0));
    push('roof', new THREE.BoxGeometry(rw, 0.34, 0.14), trs(0, yr + 0.17 + fall, rd / 2 - 0.07));
    push('metal', new THREE.BoxGeometry(rw, 0.1, 0.12), trs(0, yr + 0.04, -rd / 2 + 0.06));
    push('metal', new THREE.CylinderGeometry(0.055, 0.055, H + 0.3, 6), trs(w / 2 + 0.14, (H + 0.3) / 2, -d / 2 + 0.2));
    // the aerial, and the two condensers on the flat bit
    push('metalDark', new THREE.CylinderGeometry(0.028, 0.028, 1.8, 5), trs(-w / 2 + 0.5, yr + 0.9, -d * 0.3));
    for (let i = 0; i < 4; i++) {
      push('metalDark', new THREE.BoxGeometry(0.02, 0.02, 0.5 - i * 0.06), trs(-w / 2 + 0.5, yr + 0.4 + i * 0.16, -d * 0.3));
    }
    push('trim', new THREE.BoxGeometry(0.86, 0.6, 0.4), trs(w * 0.18, yr + 0.62, -d * 0.14));
    push('metal', new THREE.BoxGeometry(0.9, 0.05, 0.46), trs(w * 0.18, yr + 0.94, -d * 0.14));
  }

  const matFor = {
    wall: wallMat, trim: m.trim, roof: roofMat, metal: m.metal, metalDark: m.metalDark,
    concrete: m.concreteMid, concreteDark: m.concreteDark, door: m.doors[o.door ?? 1],
    wood: m.wood, woodDark: m.woodDark, woodPale: m.woodPale,
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
  g.userData.top = 0.3 + H + 0.6;
  g.userData.bay = { x: bx, w: BAY, d: GD };   // so a caller can park something in it
  /* Where the door is, in the *unit's* frame.  `dressPlot` needs it to put the
   * mat, the umbrella stand and the parcel box beside the door rather than
   * beside the window -- and a unit turned a half circle makes that offset
   * change sign in world space, which is exactly the bug that put a ryokan's
   * whole porch 1.4 m off its own doorway. */
  g.userData.doorAt = ex;
  collideGarageHouse(o.ctx, o);
  return g;
}

/* ------------------------------------------------------------------ *
 * The old timber house.
 * ------------------------------------------------------------------ */

/**
 * @param o.floors    1 or 2
 * @param o.roofKind  'hip' | 'gable'
 * @param o.engawa    false | -1 | 1 -- which flank carries the veranda
 * @param o.plaster   true for a 漆喰 upper storey over boarding, which is the
 *                    older reading; false for boarding all the way up
 */
export function makeTimberHouse(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 101);
  const g = new THREE.Group();
  g.name = 'timberHouse';

  const w = o.w ?? 7.0;
  const d = o.d ?? 6.4;
  const FLOORS = o.floors ?? 1;
  const FH = 2.72;
  const WH = FH * FLOORS;
  const EAVE = o.eave ?? 0.86;            // deep, and it is the whole character
  const RH = o.roofH ?? (FLOORS === 1 ? 1.5 : 1.35);
  const roofMat = o.roofMat ?? m.tile;
  const parts = {
    wood: [], woodDark: [], woodPale: [], plaster: [], roof: [],
    stone: [], metal: [], metalDark: [], door: [], trim: [],
  };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
  const zf = d / 2;

  /* -------------------------- base, walls, corner posts -------------------------- */
  push('stone', new THREE.BoxGeometry(w + 0.28, 0.44, d + 0.28), trs(0, 0.22, 0));
  const split = o.plaster !== false && FLOORS === 2 ? FH : WH;
  push('wood', new THREE.BoxGeometry(w, split, d), trs(0, 0.44 + split / 2, 0));
  if (split < WH) {
    push('plaster', new THREE.BoxGeometry(w, WH - split, d), trs(0, 0.44 + split + (WH - split) / 2, 0));
    push('woodDark', new THREE.BoxGeometry(w + 0.12, 0.16, d + 0.12), trs(0, 0.44 + split + 0.02, 0));
  }
  /* 下見板 -- horizontal boarding as a run of shallow ribs.  One mesh, and it
   * is what stops the volume reading as an extruded rectangle. */
  {
    const ribs = [];
    const n = Math.round((split - 0.1) / 0.26);
    for (let i = 0; i < n; i++) {
      ribs.push({
        geometry: new THREE.BoxGeometry(w + 0.05, 0.05, d + 0.05),
        matrix: trs(0, 0.5 + i * 0.26, 0),
      });
    }
    const rm = new THREE.Mesh(bake(ribs), m.boardDark);
    rm.castShadow = true;
    g.add(rm);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      push('woodDark', new THREE.BoxGeometry(0.17, WH, 0.17),
        trs(sx * (w / 2 - 0.04), 0.44 + WH / 2, sz * (d / 2 - 0.04)));
    }
  }

  /* ---------------------------------- roof ---------------------------------- */
  const yr = 0.44 + WH;
  {
    const rw = w + EAVE * 2;
    const rd = d + EAVE * 2;
    push('woodDark', new THREE.BoxGeometry(w + 0.5, 0.2, d + 0.5), trs(0, yr + 0.1, 0));
    if ((o.roofKind ?? 'hip') === 'hip') {
      const pyr = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
      pyr.rotateY(Math.PI / 4);
      push('roof', pyr, trs(0, yr + 0.2 + RH / 2, 0, 0, 0, 0, rw, RH, rd));
      pyr.dispose();
      push('roof', new THREE.BoxGeometry(rw, 0.22, rd), trs(0, yr + 0.28, 0));
      push('roof', new THREE.BoxGeometry(Math.max(1.6, w - 2.4), 0.28, 0.38), trs(0, yr + 0.2 + RH - 0.02, 0));
      tileRibs(g, roofMat, { x: 0, y: yr + 0.42, z: rd / 2 - 0.5, w: rw - 0.6, len: 1.0, rx: -0.5 });
    } else {
      const slope = Math.atan2(RH, rw / 2);
      const slab = Math.hypot(rw / 2, RH) + 0.1;
      for (const s of [-1, 1]) {
        push('roof', new THREE.BoxGeometry(slab, 0.19, rd), trs(s * (rw / 4), yr + RH / 2 + 0.14, 0, 0, 0, -s * slope));
      }
      push('roof', new THREE.BoxGeometry(0.34, 0.26, rd + 0.1), trs(0, yr + RH + 0.2, 0));
      // 破風 -- the gable boards, and the boarded triangle behind them
      const tri = new THREE.Shape();
      tri.moveTo(-w / 2, 0);
      tri.lineTo(w / 2, 0);
      tri.lineTo(0, RH * (1 - (EAVE * 2) / rw));
      tri.closePath();
      const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.18, bevelEnabled: false });
      triGeo.translate(0, 0, -0.09);
      for (const s of [-1, 1]) {
        push('wood', triGeo, trs(0, yr + 0.14, s * (d / 2 - 0.02)));
        push('woodPale', new THREE.BoxGeometry(slab, 0.14, 0.12), trs(0, yr + RH / 2 + 0.14, s * (d / 2 + 0.06)));
      }
      triGeo.dispose();
    }
    // 垂木 -- exposed rafter ends under both long eaves
    const raf = [];
    const nr = Math.max(3, Math.round(rd / 0.48));
    for (let i = 0; i < nr; i++) {
      const rz = -rd / 2 + 0.32 + i * ((rd - 0.64) / (nr - 1));
      for (const s of [-1, 1]) {
        raf.push({
          geometry: new THREE.BoxGeometry(EAVE + 0.2, 0.11, 0.09),
          matrix: trs(s * (w / 2 + EAVE / 2 - 0.02), yr + 0.2, rz),
        });
      }
    }
    const rm = new THREE.Mesh(bake(raf), m.woodDark);
    rm.castShadow = true;
    g.add(rm);
    for (const s of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(0.12, 0.12, rd), trs(s * (rw / 2 - 0.02), yr + 0.16, 0));
    }
    push('metal', new THREE.CylinderGeometry(0.05, 0.05, WH + 0.4, 6), trs(w / 2 - 0.1, (WH + 0.4) / 2, d / 2 - 0.16));
  }

  /* -------------------------------- frontage -------------------------------- *
   * A 玄関 of two glazed sliding leaves under a small tiled hood, a 格子 screen
   * beside it, and one boarded panel at low level -- the three things a house
   * like this actually shows to the street. */
  {
    const ex = -w / 2 + 1.55;
    push('woodDark', new THREE.BoxGeometry(2.0, 2.24, 0.16), trs(ex, 0.44 + 1.1, zf - 0.06));
    for (const s of [-1, 1]) {
      const leaf = box(0.86, 1.94, 0.06,
        flat({ color: 0xe8dcc2 }), ex + s * 0.44, 0.44 + 1.02, zf + (s > 0 ? 0.05 : 0.01));
      leaf.castShadow = true;
      g.add(leaf);
      // the muntins on the glazed part, which is how a 玄関 reads at all
      for (let i = 0; i < 3; i++) {
        push('wood', new THREE.BoxGeometry(0.86, 0.05, 0.04), trs(ex + s * 0.44, 0.9 + i * 0.42, zf + (s > 0 ? 0.09 : 0.05)));
      }
      push('wood', new THREE.BoxGeometry(0.05, 1.94, 0.05), trs(ex + s * 0.86, 0.44 + 1.02, zf + (s > 0 ? 0.09 : 0.05)));
    }
    push('woodPale', new THREE.BoxGeometry(2.1, 0.12, 0.22), trs(ex, 0.44 - 0.04, zf + 0.06));
    push('woodDark', new THREE.BoxGeometry(2.4, 0.14, 0.9), trs(ex, 0.44 + 2.34, zf + 0.4));
    push('roof', new THREE.BoxGeometry(2.5, 0.1, 1.0), trs(ex, 0.44 + 2.44, zf + 0.42));
    for (const s of [-1, 1]) {
      push('woodDark', new THREE.BoxGeometry(0.1, 0.56, 0.1), trs(ex + s * 1.0, 0.44 + 2.04, zf + 0.74));
    }
    for (let i = 0; i < 2; i++) {
      const t = 0.44 - i * 0.22;
      push('stone', new THREE.BoxGeometry(1.9 - i * 0.2, t, 0.36), trs(ex, t / 2, zf + 0.19 + i * 0.36));
    }
    // the 格子 screen over the front room's window
    const lx = w / 2 - 1.5;
    lattice(push, { x: lx, y: 0.44 + 1.5, z: zf, w: Math.min(2.4, w - 3.4), h: 1.4, vertical: true });
    g.add(box(Math.min(2.4, w - 3.4) - 0.2, 1.2, 0.05,
      o.lit ? flat({ color: 0xffffff, map: litWindowTex(1), cache: false }) : m.glass,
      lx, 0.44 + 1.5, zf + 0.02));
    // the name plate and the meter, on the post beside the door
    const np = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15),
      flat({ color: 0xffffff, map: namePlate(o.nameVariant ?? 2), cache: false }));
    np.position.set(ex - 1.02, 1.46, zf + 0.05);
    np.userData.noOutline = true;
    g.add(np);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.1),
      flat({ color: 0xffffff, map: meterBox(), cache: false }));
    plate.position.set(w / 2 - 0.42, 1.72, zf + 0.03);
    g.add(plate);
    if (FLOORS === 2) {
      slider(push, g, { x: ex, y: 0.44 + FH + 1.42, z: zf, w: 1.7, h: 1.2, curtain: true, variant: 1 });
      lattice(push, { x: lx, y: 0.44 + FH + 1.46, z: zf, w: 1.5, h: 1.1, vertical: true });
      g.add(box(1.3, 0.94, 0.05, m.glass, lx, 0.44 + FH + 1.46, zf + 0.02));
    }
  }

  /* ---------------------------------- 縁側 ---------------------------------- *
   * A deck along one flank behind glazed screens, and the reason to build the
   * type at all: it is the only place in the world where you look *into* a
   * house rather than at it. */
  if (o.engawa) {
    const s = o.engawa < 0 ? -1 : 1;
    const vx = s * (w / 2 + 0.85);
    const deck = box(1.7, 0.16, d - 1.2, m.woodPale, vx, 0.5, 0);
    deck.castShadow = deck.receiveShadow = true;
    g.add(deck);
    for (const sz of [-1, 1]) {
      push('woodDark', new THREE.BoxGeometry(0.12, 0.5, 0.12), trs(vx + s * 0.7, 0.25, sz * (d / 2 - 0.8)));
    }
    const shoji = box(0.06, 1.92, d - 1.4, flat({ color: 0xf4ead6 }), s * (w / 2 - 0.03), 1.5, 0);
    g.add(shoji);
    const lat = [];
    const nv = Math.round((d - 1.4) / 0.34);
    for (let i = 0; i <= nv; i++) {
      lat.push({
        geometry: new THREE.BoxGeometry(0.05, 1.92, 0.05),
        matrix: trs(s * (w / 2 - 0.01), 1.5, -(d - 1.4) / 2 + ((d - 1.4) / nv) * i),
      });
    }
    for (let i = 0; i < 5; i++) {
      lat.push({
        geometry: new THREE.BoxGeometry(0.05, 0.05, d - 1.4),
        matrix: trs(s * (w / 2 - 0.01), 0.66 + i * 0.42, 0),
      });
    }
    const lm = new THREE.Mesh(bake(lat), m.woodDark);
    g.add(lm);
    push('woodDark', new THREE.BoxGeometry(0.17, 0.14, d - 1.2), trs(s * (w / 2 - 0.02), 0.62, 0));
    push('woodDark', new THREE.BoxGeometry(0.17, 0.14, d - 1.2), trs(s * (w / 2 - 0.02), 2.5, 0));
  }

  /* the aerial and the gas riser on the back, where they always are */
  push('metalDark', new THREE.CylinderGeometry(0.028, 0.028, 1.9, 5), trs(-w * 0.2, yr + RH + 0.9, -d * 0.24));
  for (let i = 0; i < 5; i++) {
    push('metalDark', new THREE.BoxGeometry(0.02, 0.02, 0.56 - i * 0.06), trs(-w * 0.2, yr + RH + 0.3 + i * 0.15, -d * 0.24));
  }
  push('metal', new THREE.BoxGeometry(0.32, 0.44, 0.22), trs(-w / 2 + 0.5, 0.86, -d / 2 - 0.1));

  const matFor = {
    wood: m.board, woodDark: m.woodDark, woodPale: m.woodPale, plaster: m.plaster,
    roof: roofMat, stone: m.concreteMid, metal: m.metal, metalDark: m.metalDark,
    door: m.doors[o.door ?? 0], trim: m.trim,
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wood' || key === 'roof' || key === 'plaster') hullOutline(mesh, { thickness: 0.0034 });
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = FACE_RY[o.face ?? 'z+'];
  g.userData.top = 0.44 + WH + RH + 0.3;
  g.userData.eave = EAVE;
  g.userData.doorAt = -w / 2 + 1.55;      // in the unit's frame -- see makeGarageHouse
  return g;
}

/* ------------------------------------------------------------------ *
 * 長屋 -- the single-storey row.
 * ------------------------------------------------------------------ */

/**
 * N units under one continuous low roof, doors straight onto the street.
 *
 * The type's whole character is that it has *no setback* -- the eave overhangs
 * the pavement and the step is the pavement -- so it is the one thing to put on
 * a back street where a garden would make the street too wide to read as one.
 * Variety is per unit and material-free, the `makeTerrace` rule: same wall,
 * same roof, same window, different door colour, different clutter, one unit
 * with its screen shut.
 */
export function makeNagaya(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 111);
  const g = new THREE.Group();
  g.name = 'nagaya';

  const N = o.units ?? 4;
  const uw = o.unitW ?? 2.7;
  const w = uw * N;
  const d = o.d ?? 5.2;
  const WH = o.h ?? 2.48;
  const RH = 0.92;
  const EAVE = 0.92;
  const parts = {
    wood: [], woodDark: [], woodPale: [], plaster: [], roof: [],
    stone: [], metal: [], metalDark: [], door: [],
  };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
  const zf = d / 2;

  push('stone', new THREE.BoxGeometry(w + 0.2, 0.32, d + 0.2), trs(0, 0.16, 0));
  push('plaster', new THREE.BoxGeometry(w, WH, d), trs(0, 0.32 + WH / 2, 0));
  // the sill board that runs the whole length, and the boarded skirt under it
  push('woodDark', new THREE.BoxGeometry(w + 0.08, 0.14, d + 0.08), trs(0, 0.32 + 0.62, 0));
  push('wood', new THREE.BoxGeometry(w + 0.04, 0.6, d + 0.04), trs(0, 0.32 + 0.3, 0));

  /* the roof: one shallow gable the length of the row, tiled, with a deep
   * front eave carried on a post at every party line */
  const yr = 0.32 + WH;
  {
    const rd = d + EAVE * 2;
    const slope = Math.atan2(RH, rd / 2);
    const slab = Math.hypot(rd / 2, RH) + 0.08;
    for (const s of [-1, 1]) {
      push('roof', new THREE.BoxGeometry(w + 0.5, 0.17, slab), trs(0, yr + RH / 2 + 0.1, s * (rd / 4), s * slope, 0, 0));
    }
    push('roof', new THREE.BoxGeometry(w + 0.56, 0.24, 0.3), trs(0, yr + RH + 0.16, 0));
    tileRibs(g, m.tile, { x: 0, y: yr + 0.3, z: rd / 2 - 0.55, w: w + 0.4, len: 1.05, rx: -slope });
    const tri = new THREE.Shape();
    tri.moveTo(-rd / 2 + EAVE, 0);
    tri.lineTo(rd / 2 - EAVE, 0);
    tri.lineTo(0, RH * (1 - (EAVE * 2) / rd));
    tri.closePath();
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.16, bevelEnabled: false });
    triGeo.translate(0, 0, -0.08);
    for (const s of [-1, 1]) {
      push('plaster', triGeo, trs(s * (w / 2 - 0.02), yr + 0.1, 0, 0, Math.PI / 2, 0));
    }
    triGeo.dispose();
    push('metal', new THREE.BoxGeometry(w + 0.5, 0.11, 0.11), trs(0, yr + 0.12, rd / 2 - 0.04));
    // the eave posts: one on each party line and one at each end
    for (let i = 0; i <= N; i++) {
      push('woodDark', new THREE.CylinderGeometry(0.075, 0.08, WH + 0.24, 7),
        trs(-w / 2 + uw * i, (WH + 0.24) / 2, zf + EAVE - 0.14));
      push('stone', new THREE.CylinderGeometry(0.13, 0.15, 0.14, 8), trs(-w / 2 + uw * i, 0.07, zf + EAVE - 0.14));
    }
    push('woodDark', new THREE.BoxGeometry(w + 0.3, 0.13, 0.13), trs(0, WH + 0.24, zf + EAVE - 0.14));
  }

  /* ------------------------------- unit by unit -------------------------------
   * The unit's frontage is laid out from the party line outward, and the widths
   * are derived from `uw` rather than fixed, because the first pass fixed them
   * and then two things went wrong at once: the door frame and the 格子 frame
   * overlapped by 0.15 m, and the meter and the name plate ended up on the party
   * line -- which is exactly where the eave post stands, 0.75 m in front of
   * them. Rendered, that is a white box and a name plate hiding behind a post.
   * So: 0.44 m of service strip against the party line (meter over plate), then
   * the door, an 80 mm reveal, then the window. */
  const SERV = 0.44;
  const dw = Math.min(1.1, uw * 0.42);           // door frame
  const ww = Math.min(0.78, uw * 0.3);           // window opening
  for (let i = 0; i < N; i++) {
    const cx = -w / 2 + uw * (i + 0.5);
    const party = cx - uw / 2;
    if (i) push('woodDark', new THREE.BoxGeometry(0.14, WH, d + 0.06), trs(party, 0.32 + WH / 2, 0));
    // the door: two timber leaves in a dark frame, one unit's shut fast
    const dxx = party + SERV + dw / 2;
    const leafW = dw / 2 - 0.07;
    const dm = m.doors[(i * 2 + (o.seed ?? 0)) % DOORS.length];
    push('woodDark', new THREE.BoxGeometry(dw, 2.06, 0.16), trs(dxx, 0.32 + 1.0, zf - 0.06));
    for (const s of [-1, 1]) {
      const leaf = box(leafW, 1.86, 0.06, dm, dxx + s * (leafW / 2 + 0.02), 0.32 + 0.95, zf + (s > 0 ? 0.05 : 0.01));
      leaf.castShadow = true;
      g.add(leaf);
      push('woodPale', new THREE.BoxGeometry(leafW, 0.05, 0.04),
        trs(dxx + s * (leafW / 2 + 0.02), 1.62, zf + (s > 0 ? 0.09 : 0.05)));
    }
    push('metal', new THREE.BoxGeometry(0.05, 0.26, 0.05), trs(dxx, 1.28, zf + 0.11));
    push('stone', new THREE.BoxGeometry(dw + 0.26, 0.32, 0.34), trs(dxx, 0.16, zf + 0.17));
    // the window: a 格子 screen, shut on one unit and open on the rest
    const wx = party + SERV + dw + 0.08 + 0.09 + ww / 2;
    lattice(push, { x: wx, y: 0.32 + 1.42, z: zf, w: ww, h: 1.06, n: 6, vertical: true });
    g.add(box(ww - 0.14, 0.88, 0.05,
      i === 1 ? flat({ color: 0xe8dcc2 })
        : (i === N - 1 ? flat({ color: 0xffffff, map: litWindowTex(2), cache: false }) : m.glass),
      wx, 0.32 + 1.42, zf + 0.02));
    // meter over name plate on the service strip, clear of the eave post
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.09),
      flat({ color: 0xffffff, map: meterBox(), cache: false }));
    plate.position.set(party + SERV / 2, 1.86, zf + 0.03);
    g.add(plate);
    const np = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.13),
      flat({ color: 0xffffff, map: namePlate(6 + (i % 6)), cache: false }));
    np.position.set(party + SERV / 2, 1.42, zf + 0.05);
    np.userData.noOutline = true;
    g.add(np);
    if (i) push('metal', new THREE.CylinderGeometry(0.045, 0.045, WH, 6), trs(party, WH / 2, zf + 0.1));
  }
  /* 垂木 -- rafter ends along the front eave.  Without them the soffit over a
   * 0.92 m overhang is one flat violet plane the whole length of the row, which
   * is the largest single surface on the building and the least interesting. */
  {
    const raf = [];
    const nr = Math.max(4, Math.round(w / 0.46));
    for (let k = 0; k < nr; k++) {
      raf.push({
        geometry: new THREE.BoxGeometry(0.09, 0.1, EAVE + 0.12),
        matrix: trs(-w / 2 + 0.28 + k * ((w - 0.56) / (nr - 1)), yr + 0.16, zf + EAVE / 2),
      });
    }
    const rm = new THREE.Mesh(bake(raf), m.woodDark);
    rm.castShadow = true;
    g.add(rm);
  }
  // the gutter channel along the front, which a row with no setback has instead
  // of a garden -- and the one at the back for the same reason
  {
    const ch = box(w + 0.3, 0.05, 0.26, m.concreteDark, 0, 0.06, zf + EAVE + 0.08);
    ch.receiveShadow = true;
    ch.userData.noOutline = true;
    g.add(ch);
  }

  const matFor = {
    wood: m.board, woodDark: m.woodDark, woodPale: m.woodPale, plaster: m.plaster,
    roof: m.tile, stone: m.concreteMid, metal: m.metal, metalDark: m.metalDark,
    door: m.doors[0],
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'plaster' || key === 'roof' || key === 'wood') hullOutline(mesh, { thickness: 0.0032 });
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = FACE_RY[o.face ?? 'z+'];
  g.userData.top = yr + RH + 0.3;
  g.userData.width = w;
  g.userData.eave = EAVE;
  // every unit's door, in the unit's frame, so clutter can be put at one of them
  g.userData.doors = Array.from({ length: N }, (_, i) => -w / 2 + uw * (i + 0.5) - 0.42);
  g.userData.doorAt = g.userData.doors[0];
  return g;
}

/* ------------------------------------------------------------------ *
 * 町内会館 -- the neighbourhood association hall.
 * ------------------------------------------------------------------ */

/**
 * One storey, pale render, a porch you could stand a folding table in.
 *
 * The building has to say "committee" rather than "shop" or "house", and it
 * does that with three things and no others: a *wide* low mass with no
 * domestic detail on it at all, a run of identical high windows, and a porch
 * with a name board over it. Everything that makes it feel used -- the notice
 * board, the bicycle stand, the folded tables glimpsed through the doors -- is
 * clutter, which is where the life is in this project anyway.
 */
export function makeHall(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 121);
  const g = new THREE.Group();
  g.name = 'hall';

  const w = o.w ?? 9.2;
  const d = o.d ?? 6.6;
  const WH = o.h ?? 3.35;
  const PORCH_W = 2.9;
  const PORCH_D = 1.25;
  const px = o.porchAt ?? -w / 2 + PORCH_W / 2 + 0.9;
  const wallMat = m.walls[o.wall ?? 1];
  const parts = {
    wall: [], trim: [], roof: [], metal: [], metalDark: [],
    concrete: [], door: [], wood: [], woodPale: [],
  };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
  const zf = d / 2;

  push('concrete', new THREE.BoxGeometry(w + 0.3, 0.38, d + 0.3), trs(0, 0.19, 0));
  push('wall', new THREE.BoxGeometry(w, WH, d), trs(0, 0.38 + WH / 2, 0));
  // a string course at door head height: it is what stops a 9 m blank wall
  push('trim', new THREE.BoxGeometry(w + 0.14, 0.16, d + 0.14), trs(0, 0.38 + 2.32, 0));

  /* the roof: one shallow fall to the back behind a front parapet, with a
   * proper 0.22 m cornice standing proud.  A public building in this world is
   * recognisable from its cornice -- the library's is the same idea. */
  {
    const yr = 0.38 + WH;
    const fall = 0.5;
    const rd = d + 0.4;
    const tilt = Math.atan2(fall, rd);
    push('roof', new THREE.BoxGeometry(w + 0.4, 0.15, rd / Math.cos(tilt)), trs(0, yr + fall / 2 + 0.08, -0.1, tilt, 0, 0));
    push('trim', new THREE.BoxGeometry(w + 0.56, 0.22, 0.44), trs(0, yr + fall + 0.06, zf + 0.02));
    for (const s of [-1, 1]) {
      push('trim', new THREE.BoxGeometry(0.3, 0.22, rd), trs(s * (w / 2 + 0.2), yr + fall / 2 + 0.2, -0.1));
    }
    push('metal', new THREE.BoxGeometry(w + 0.3, 0.11, 0.13), trs(0, yr + 0.06, -rd / 2 + 0.06));
    push('metal', new THREE.CylinderGeometry(0.06, 0.06, WH + 0.5, 6), trs(w / 2 - 0.18, (WH + 0.5) / 2, -zf + 0.16));
    // roof kit: a vent hood and a water tank stand, both read as "not a house"
    push('metal', new THREE.CylinderGeometry(0.2, 0.2, 0.44, 10), trs(w * 0.28, yr + 0.5, -d * 0.2));
    push('metalDark', new THREE.CylinderGeometry(0.24, 0.24, 0.07, 10), trs(w * 0.28, yr + 0.74, -d * 0.2));
    push('trim', new THREE.BoxGeometry(1.5, 0.5, 0.9), trs(-w * 0.2, yr + 0.62, -d * 0.16));
  }

  /* ---------------------------------- porch ---------------------------------- *
   * Stepping forward of the frontage, not cut into it: a slab, two posts, a
   * canopy, and the name board across its beam. */
  {
    push('concrete', new THREE.BoxGeometry(PORCH_W + 0.5, 0.2, PORCH_D + 0.4), trs(px, 0.1, zf + PORCH_D / 2 + 0.1));
    for (const s of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(0.12, 2.62, 0.12), trs(px + s * (PORCH_W / 2), 0.2 + 1.31, zf + PORCH_D - 0.06));
    }
    push('trim', new THREE.BoxGeometry(PORCH_W + 0.6, 0.16, PORCH_D + 0.34), trs(px, 0.2 + 2.7, zf + PORCH_D / 2 + 0.06));
    push('metal', new THREE.BoxGeometry(PORCH_W + 0.66, 0.06, PORCH_D + 0.4), trs(px, 0.2 + 2.79, zf + PORCH_D / 2 + 0.06));
    // the name board, on the beam, both faces printed
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.46, 0.12),
      [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: 0xffffff, map: hallPlate(), cache: false }),
       flat({ color: PAL.wallGray })]);
    board.position.set(px, 0.2 + 2.42, zf + PORCH_D + 0.02);
    board.castShadow = true;
    g.add(board);
    hullOutline(board, { thickness: 0.003 });
    // two bracket lamps on it: this is the one building open after dark
    for (const s of [-1, 1]) {
      push('metalDark', new THREE.BoxGeometry(0.05, 0.05, 0.3), trs(px + s * 1.42, 0.2 + 2.5, zf + PORCH_D + 0.12));
      const lamp = box(0.2, 0.14, 0.2, flat({ color: 0xfff0cf }), px + s * 1.42, 0.2 + 2.44, zf + PORCH_D + 0.26);
      lamp.userData.noOutline = true;
      g.add(lamp);
    }
    // the doors: two aluminium leaves, glazed, with a real lobby behind them
    const DOOR_W = 1.9;
    push('trim', new THREE.BoxGeometry(DOOR_W + 0.3, 2.44, 0.16), trs(px, 0.38 + 1.16, zf - 0.06));
    for (const s of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(DOOR_W / 2, 2.2, 0.07), trs(px + s * DOOR_W / 4, 0.38 + 1.1, zf + 0.02));
      const pane = box(DOOR_W / 2 - 0.16, 1.86, 0.03,
        flat({ color: PAL.glass, transparent: true, opacity: 0.26, depthWrite: false, cache: false }),
        px + s * DOOR_W / 4, 0.38 + 1.16, zf + 0.06);
      pane.userData.noOutline = true;
      pane.userData.noShadow = true;
      g.add(pane);
      push('metal', new THREE.BoxGeometry(0.05, 0.9, 0.05), trs(px + s * 0.16, 0.38 + 1.06, zf + 0.09));
    }
    /* The lobby, on the face of the wall behind the glass: a shoe rack, a stack
     * of folded tables against the wall and a strip light. Nobody in it -- the
     * folded tables are the whole story. */
    const lobby = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, 2.0),
      flat({ color: 0x8f8a9c }));
    lobby.position.set(px, 0.38 + 1.1, zf - 0.12);
    lobby.userData.noOutline = true;
    g.add(lobby);
    push('woodPale', new THREE.BoxGeometry(1.5, 0.06, 0.3), trs(px + 0.1, 0.72, zf - 0.24));
    push('woodPale', new THREE.BoxGeometry(1.5, 0.06, 0.3), trs(px + 0.1, 1.06, zf - 0.24));
    for (let i = 0; i < 3; i++) {
      push('trim', new THREE.BoxGeometry(0.06, 1.5, 0.7), trs(px - 0.72 + i * 0.1, 0.38 + 0.75, zf - 0.4));
    }
    const strip = box(1.4, 0.05, 0.1, flat({ color: 0xfff4dc }), px, 0.38 + 2.1, zf - 0.2);
    strip.userData.noOutline = true;
    g.add(strip);
  }

  /* -------------------------- the run of high windows -------------------------- *
   * Identical, evenly pitched, sills high: a hall has its windows above head
   * height because the walls inside are for notice boards. */
  {
    const x0 = px + PORCH_W / 2 + 0.9;
    const avail = w / 2 - 0.6 - x0;
    const n = Math.max(2, Math.floor(avail / 1.55));
    for (let i = 0; i < n; i++) {
      const wx = x0 + (avail / n) * (i + 0.5);
      slider(push, g, { x: wx, y: 0.38 + 2.0, z: zf, w: 1.24, h: 1.16, variant: i, lit: o.lit && i === n - 1 });
    }
    // and the frosted window of the kitchen at the far end
    push('trim', new THREE.BoxGeometry(0.9, 0.86, 0.14), trs(w / 2 - 0.5, 0.38 + 1.9, zf - 0.02));
    g.add(box(0.76, 0.72, 0.05, flat({ color: 0xdfe6ea }), w / 2 - 0.5, 0.38 + 1.9, zf + 0.05));
  }

  /* the service door and the mains cupboard on the -x flank */
  push('door', new THREE.BoxGeometry(0.09, 1.98, 0.9), trs(-w / 2 - 0.02, 0.38 + 0.99, -d * 0.16));
  push('trim', new THREE.BoxGeometry(0.14, 2.16, 1.14), trs(-w / 2 - 0.03, 0.38 + 1.04, -d * 0.16));
  push('metal', new THREE.BoxGeometry(0.22, 0.62, 0.44), trs(-w / 2 - 0.11, 1.3, d * 0.16));
  // the notice case bolted flat to the frontage beside the porch, glazed
  {
    const nx = px - PORCH_W / 2 - 1.0;
    push('metalDark', new THREE.BoxGeometry(1.3, 0.98, 0.14), trs(nx, 1.62, zf + 0.06));
    /* `hallNotice`, not `chalkNotice` -- the second chalk variant is the
     * electrical shop's 修理承ります board, and a television repair notice in a
     * community hall's glazed case is a small joke nobody meant to make. */
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 0.82),
      flat({ color: 0xffffff, map: hallNotice(0), cache: false }));
    face.position.set(nx, 1.62, zf + 0.14);
    face.userData.noOutline = true;
    g.add(face);
    const glass = box(1.2, 0.88, 0.03,
      flat({ color: PAL.glass, transparent: true, opacity: 0.2, depthWrite: false, cache: false }),
      nx, 1.62, zf + 0.16);
    glass.userData.noOutline = true;
    glass.userData.noShadow = true;
    g.add(glass);
  }

  const matFor = {
    wall: wallMat, trim: m.trim, roof: m.roofs[o.roof ?? 0], metal: m.metal,
    metalDark: m.metalDark, concrete: m.concreteMid, door: m.doors[o.door ?? 1],
    wood: m.wood, woodPale: m.woodPale,
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof' || key === 'trim') hullOutline(mesh, { thickness: 0.0032 });
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = FACE_RY[o.face ?? 'z+'];
  g.userData.top = 0.38 + WH + 0.7;
  g.userData.porch = { x: px, w: PORCH_W, d: PORCH_D };
  g.userData.doorAt = px;                 // in the unit's frame -- see makeGarageHouse
  return g;
}
