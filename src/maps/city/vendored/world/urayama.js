import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  trailSign, trailNotice, deckPanel, warningPlate, roadSignTex, laneNamePlate,
  shrinePlate, blockPlate,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit, shadowify } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY, centerX, makeStrip, ROAD_HALF, WALK_W, Z_MIN } from './street.js';
import { pad, lane, laneLine, steps, wallRun, railing, meshFence, dapple, groundMats } from './ground.js';
import { laneGutter, bollardRow, hedgeRun, refusePoint } from './plots.js';
import {
  makeBench, makeSignPost, makeNoticeBoard, makeGuardrail, makeCone, makeCrates,
  makeMilkCrate, makeBucket, makeBroom, makeStorageShed, makeFlowerBed,
  makeTapPost, makeGuideBoard, makeLoosePaper, makeShrine, makePlanter,
} from './props.js';
import { makeChalkMarks } from './streetprops.js';
import {
  TRAILS, SITES, hillAt, hillSlope, hillMeshY, hillMats, hillPath, trailSegs,
} from './hills.js';

/* ------------------------------------------------------------------ *
 * ひばり山 -- the back-hill district.
 *
 * The twenty-fifth district, and the first one that is *land* rather than a place
 * or a street: forty thousand square metres of hill, of which about a fifth is
 * within walking distance of the school's back gate.  `hills.js` makes the ground
 * and the trails; this module is everything a hill has on it when a town has been
 * using it for eighty years.
 *
 * ------------------------------------------------------------------ *
 * THE THREE THINGS IT HAS TO GET RIGHT
 *
 * **It has to be reachable, and the school is the way in.**  The school's north
 * wall was at z = -74 and the ground behind it was empty field; it is at -86 now
 * with a 裏門 in it at x = 18, and the whole district hangs off that gate.  In
 * between is the 裾道 -- the hill-foot road -- which is what makes the back of the
 * school a *place* rather than the edge of the model, and it is also the only way
 * anything with wheels reaches the hill.
 *
 * **It has to be maintained, not wild.**  The brief was explicit and it is the
 * harder half: a hill with a path on it and nothing else reads as abandoned.  So
 * there are cut logs across the steep pitches, a gutter where the trail crosses a
 * drainage line, fingerposts at every junction with real distances on them, a
 * tool store and a flood box at the trail head, chalk on the concrete, a
 * strimmed edge along the road, and a shrine somebody still leaves water at.  The
 * measure of it is that every one of those has a reason to be where it is.
 *
 * **Nothing may be steeper than the ground it is on.**  `hillPath` hands back the
 * measured gradient of every leg, and the log steps go where *that* says rather
 * than where a hand-written list says -- two pitches on the main climb, at 0.42
 * and 0.34.  Write the list by hand and it goes stale the moment a summit moves
 * four metres, which is exactly what happened three times while the field was
 * being tuned.
 *
 * ------------------------------------------------------------------ *
 * FLOODFILL -- every one of these must be reachable on foot from the spawn.
 *
 *   roadHead    [3.00, -68.00]    the 通学路's old dead end, now a junction
 *   roadS       [3.00, -86.00]    the 裾道's west leg
 *   roadW       [14.00, -90.00]    its corner, below the school's back gate
 *   roadM       [46.00, -90.00]    the middle of the run behind the school
 *   roadE       [84.00, -90.00]    its east corner
 *   roadN       [88.00, -70.00]    the school's outer road, north end
 *   backGate    [18.00, -87.60]    inside the 裏門's opening
 *   trailHead   [18.00, -94.50]    the foot of the 遊歩道
 *   yard        [24.00, -99.00]    the maintenance compound
 *   climbLow    [1.00, -103.40]    the traverse, below the first flight
 *   climbMid    [-26.50, -112.60]  the foothill's ridge, at the 祠 turn
 *   hokora      [-37.00, -112.00]  the shrine's step foot
 *   climbHigh   [-14.00, -120.00]  the upper traverse
 *   glade       [-17.00, -127.00]  the 林間広場
 *   crest       [24.60, -135.60]   the top of the climb
 *   deckFoot    [33.50, -129.00]   the foot of the 展望台's stair
 *   deck        [34.50, -128.20]   the deck itself
 *   ridgeW      [-18.00, -135.00]  the west end of the ridge walk
 *   footE       [80.00, -96.60]    the 山裾の道's east end
 * ------------------------------------------------------------------ */

/** The hill-foot road.  Its west leg comes off the 通学路's old dead end. */
const RD = {
  wx: 3.0,             // the west leg's centreline
  z: -90.0,            // the long run behind the school
  ex: 88.0,            // the east leg, up the school's outer side
  w: 4.4,
  zN: -62.0,           // where the east leg stops
};

const Y0 = groundY(-90);          // 1.05 -- flat over the whole district

const M = {};
function mats() {
  if (M.timber) return M;
  M.timber = cel({ color: 0x9a7f5e, bands: 3, tint: 0x5c5680 });
  M.timberDark = cel({ color: 0x6f5943, bands: 3, tint: 0x554d72 });
  M.log = cel({ color: 0x8a7050, bands: 3, tint: 0x5c5680 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.stone = cel({ color: PAL.stone, bands: 3, tint: 0x655d80 });
  M.stoneDark = cel({ color: PAL.stoneDark, bands: 3, tint: 0x605878 });
  M.torii = cel({ color: PAL.torii, bands: 3, tint: 0x7a4a60 });
  M.rope = cel({ color: PAL.rope, bands: 3, tint: 0x8a83a8 });
  return M;
}

/* ------------------------------------------------------------------ *
 * Trail furniture: the pieces that follow a sloping surface.
 * ------------------------------------------------------------------ */

/**
 * 丸太階段 -- half-round logs pinned across the path, earth between them.
 *
 * This is what a maintained hill path in Japan has on a pitch too steep to walk
 * comfortably, and it is also the *only* way to draw a stair on this ground:
 * `ctx.platform` cannot express a slope, and a flight whose treads are level
 * boxes would either float above the hill or be buried in it, one end each.  The
 * logs are decoration over ground the player already walks -- they change the
 * reading, not the walking -- which is honest, because that is exactly what they
 * do on a real path.
 */
function logSteps(ctx, a, b, o = {}) {
  const m = mats();
  const w = o.w ?? 1.5;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(len / (o.pitch ?? 0.62)));
  const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
  const parts = [];
  const pin = [];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const px = a[0] + (b[0] - a[0]) * t;
    const pz = a[1] + (b[1] - a[1]) * t;
    const y = hillMeshY(px, pz);
    const ry = Math.atan2(tx, tz);
    // the log itself: a half-round laid across the path
    parts.push({
      geometry: new THREE.CylinderGeometry(0.1, 0.105, w, 7, 1, false, 0, Math.PI),
      matrix: trs(px, y + 0.03, pz, Math.PI / 2, ry, 0),
    });
    // the two stakes that hold it
    for (const s of [-1, 1]) {
      pin.push({
        geometry: new THREE.CylinderGeometry(0.038, 0.032, 0.4, 5),
        matrix: trs(px - tx * 0.05 + -tz * s * (w / 2 - 0.12), y - 0.05,
          pz - tz * 0.05 + tx * s * (w / 2 - 0.12)),
      });
    }
  }
  const lm = new THREE.Mesh(bake(parts), m.log);
  lm.castShadow = lm.receiveShadow = true;
  ctx.add(lm);
  const pm = new THREE.Mesh(bake(pin), m.timberDark);
  ctx.add(pm);
}

/**
 * A timber rail following the ground along one side of a trail.
 *
 * Posts and two rails, each span taken between two samples of the surface, so it
 * follows a slope instead of floating at one end and burying itself at the other
 * -- the same reason the tunnel's crest fence is built in five pieces.  No
 * collider: these run beside a 1.35 m path, and a box round one inflated by the
 * player's 0.34 m radius on each side would leave 0.67 m of it.
 */
function trailRail(ctx, pts, o = {}) {
  const m = mats();
  const side = o.side ?? 1;
  const off = o.off ?? 0.95;
  const h = o.h ?? 0.92;
  const parts = [];
  const line = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 1.6));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      line.push([px + nx * off * side, pz + nz * off * side]);
    }
  }
  {
    const [ax, az] = pts[pts.length - 2];
    const [bx, bz] = pts[pts.length - 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    line.push([bx + nx * off * side, bz + nz * off * side]);
  }
  for (let k = 0; k < line.length; k++) {
    const [px, pz] = line[k];
    const y = hillMeshY(px, pz);
    parts.push({
      geometry: new THREE.CylinderGeometry(0.055, 0.065, h + 0.3, 6),
      matrix: trs(px, y + (h + 0.3) / 2 - 0.3, pz),
    });
    if (k === line.length - 1) break;
    const [qx, qz] = line[k + 1];
    const qy = hillMeshY(qx, qz);
    const dx = qx - px, dz = qz - pz, dy = qy - y;
    const L = Math.hypot(dx, dy, dz);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    for (const hy of [h, h * 0.55]) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.042, 0.042, L, 5),
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3((px + qx) / 2, (y + qy) / 2 + hy, (pz + qz) / 2),
          q, new THREE.Vector3(1, 1, 1)),
      });
    }
  }
  const mesh = new THREE.Mesh(bake(parts), o.mat ?? m.timber);
  mesh.castShadow = true;
  mesh.name = 'trailRail';
  ctx.add(mesh);
}

/** A fingerpost: a post with one or two plates on it, seated on the hill. */
function finger(ctx, x, z, ry, plates) {
  const m = mats();
  const y = hillMeshY(x, z);
  ctx.add(makeSignPost({
    x, z, y, ry, h: 2.25, postMat: m.timber,
    plates: plates.map((p, i) => ({
      map: trailSign(p), w: 1.05, h: 0.26, y: 1.95 - i * 0.34, double: true,
    })),
  }));
  ctx.collide(x - 0.16, z - 0.16, x + 0.16, z + 0.16, y + 2.25);
}

/**
 * A plank bridge over a drainage line crossing the path.
 *
 * The gully itself is drawn as a shallow trough laid on the hill rather than cut
 * into the height field -- a 0.4 m V in a 3 m lattice cannot be expressed, and it
 * does not need to be: what reads is the stone lining and the plank over it, and
 * the player walks the surface either way.
 */
function gullyBridge(ctx, x, z, ry, len = 3.2) {
  const m = mats();
  const g = new THREE.Group();
  const y = hillMeshY(x, z);
  const c = Math.cos(ry), s = Math.sin(ry);
  // the trough: two raking stone cheeks and a bed between them
  for (const sd of [-1, 1]) {
    const wall = box(0.34, 0.5, len, m.stoneDark,
      x + c * sd * 0.62, y - 0.12, z - s * sd * 0.62);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    g.add(wall);
  }
  const bed = box(1.0, 0.16, len, m.stone, x, y - 0.3, z);
  bed.rotation.y = ry;
  bed.receiveShadow = true;
  g.add(bed);
  // the planks, and the two bearers under them
  const deck = [];
  for (let k = 0; k < 5; k++) {
    deck.push({
      geometry: new THREE.BoxGeometry(0.26, 0.07, 1.6),
      matrix: trs(-0.62 + k * 0.31, 0.06, 0),
    });
  }
  for (const sd of [-1, 1]) {
    deck.push({ geometry: new THREE.BoxGeometry(1.7, 0.09, 0.1), matrix: trs(0, -0.01, sd * 0.68) });
  }
  const dm = new THREE.Mesh(bake(deck), m.timber);
  dm.position.set(x, y + 0.04, z);
  dm.rotation.y = ry;
  dm.castShadow = dm.receiveShadow = true;
  g.add(dm);
  ctx.add(g);
  ctx.platform({ x0: x - 1.0, x1: x + 1.0, z0: z - 1.0, z1: z + 1.0, top: y + 0.12 });
}

/* ------------------------------------------------------------------ *
 * The hill-foot road.
 * ------------------------------------------------------------------ */

/**
 * 裾道 -- the road along the foot of the hill, and the school's outer road.
 *
 * The 通学路 used to stop dead at z = -65 with a railing across it, two bollards,
 * a 注意 plate and a thicket of six grove trees behind: it ended because there was
 * nothing beyond it.  There is now, so it does not.  The railing comes out
 * (`approach.js`), the bollards stay as the taper markers into a narrower lane,
 * and the road turns east behind the school -- 89 m of it -- and then north up the
 * school's east side to a turning head.
 *
 * 4.4 m and kerbed on one side only: this is a 市道 that serves a school's back
 * gate, a maintenance yard and a hill, and nothing else.  Which is also why the
 * kerb is **split wherever something drives over it** -- the two school gates and
 * the yard's mouth -- because a kerb is invisible to every check this project has
 * and 六丁目 found a 0.105 m ledge across the entrance of a car park that way.
 */
function buildRoad(ctx, rng) {
  const m = mats();
  const gm = groundMats();

  /* --- the west leg, south from the 通学路's old end ---
   *
   * **It starts at -65.8 and it flares to the road's own width at the joint.**
   * `street.js` runs the carriageway to `Z_MIN = -66` and this lane began at
   * -66.4, so 0.4 m of the junction was bare terrain right across it; and the
   * road is 6.3 m against this lane's 4.4, which left a 0.95 m wedge of grass on
   * each side of the mouth.  Two cones and a pair of bollards were marking a
   * taper that was not there.  The flare is a swept solid rather than a second
   * slab: butting two rectangles of different widths just moves the notch. */
  lane(ctx, {
    axis: 'z', at: RD.wx, from: -65.8, to: RD.z + RD.w / 2, w: RD.w,
    mat: gm.asphaltWorn, kerb: false, rise: 0.05, name: 'susomichiWest',
  });
  {
    const FZ0 = -71.0, FZ1 = -65.8;            // the flare's own reach
    const half = (z) => {
      const t = Math.min(1, Math.max(0, (z - FZ0) / (FZ1 - FZ0)));
      return RD.w / 2 + (ROAD_HALF - RD.w / 2) * t * t * (3 - 2 * t);
    };
    const a = (z) => ({ x: RD.wx - half(z), y: groundY(z) + 0.05 });
    const b = (z) => ({ x: RD.wx + half(z), y: groundY(z) + 0.05 });
    const flare = new THREE.Mesh(makeStrip({ z0: FZ0, z1: FZ1, a, b, step: 0.65 }), gm.asphaltWorn);
    flare.name = 'susomichiFlare';
    flare.receiveShadow = true;
    ctx.add(flare);
    ctx.platform({
      x0: RD.wx - ROAD_HALF, x1: RD.wx + ROAD_HALF, z0: FZ1 - 0.6, z1: FZ1 + 0.4, top: Y0 + 0.11,
    });
    ctx.platform({
      x0: RD.wx - RD.w / 2 - 0.9, x1: RD.wx + RD.w / 2 + 0.9, z0: FZ0, z1: FZ1, top: Y0 + 0.11,
    });
  }
  ctx.platform({
    x0: RD.wx - RD.w / 2, x1: RD.wx + RD.w / 2,
    z0: RD.z - RD.w / 2, z1: -66.0, top: Y0 + 0.11,
  });
  /* The taper: the carriageway is 6.3 m wide and this is 4.4, so the join needs
   * marking.  Two cones and the pair of yellow bollards `approach.js` already has
   * at the old dead end do it. */
  ctx.add(makeCone({ x: RD.wx - 2.9, z: -65.4, y: Y0, ry: 0.3 }));
  ctx.add(makeCone({ x: RD.wx + 2.9, z: -65.4, y: Y0, ry: -0.2 }));

  /* --- the long run behind the school --- */
  lane(ctx, {
    axis: 'x', at: RD.z, from: RD.wx - RD.w / 2, to: RD.ex + RD.w / 2, w: RD.w,
    y: Y0, mat: gm.asphaltWorn, kerb: false, rise: 0.05, name: 'susomichi',
  });
  /* the kerb on the *north* side only -- the school's -- and split at both gates
   * and at the yard.  A vehicle crossing a 0.105 m kerb is the 六丁目 trap. */
  {
    const gaps = [[15.2, 21.0], [46.6, 53.4], [21.6, 27.0]];
    const zk = RD.z + RD.w / 2 + 0.13;
    const runs = [];
    let cursor = RD.wx - RD.w / 2;
    const sorted = gaps.slice().sort((a, b) => a[0] - b[0]);
    for (const [a, b] of sorted) {
      if (a > cursor) runs.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    runs.push([cursor, RD.ex + RD.w / 2]);
    const parts = [];
    for (const [a, b] of runs) {
      parts.push({ geometry: new THREE.BoxGeometry(b - a, 0.16, 0.26), matrix: trs((a + b) / 2, 0.08, zk) });
    }
    // and the dropped kerb across each opening
    for (const [a, b] of sorted) {
      parts.push({ geometry: new THREE.BoxGeometry(b - a, 0.06, 0.26), matrix: trs((a + b) / 2, 0.03, zk) });
    }
    const km = new THREE.Mesh(bake(parts), gm.curb);
    km.position.y = Y0 + 0.05;
    km.receiveShadow = true;
    ctx.add(km);
  }
  // the gutter and its gullies down the south side, where the hill drains to it
  laneGutter(ctx, {
    axis: 'x', at: RD.z - RD.w / 2 - 0.3, from: 2.0, to: RD.ex - 2.0, y: Y0, pitch: 0.9,
    manholes: [22.0, 58.0], manholeOff: 0.55,
    patches: [[14.0, RD.z + 0.6, 1.8, 1.3], [61.0, RD.z - 0.5, 1.5, 1.1]],
  });
  laneLine(ctx, { axis: 'x', at: RD.z, from: 8.0, to: RD.ex - 6.0, y: Y0 + 0.12, dash: 1.6 });

  /* --- the east leg, up the school's outer side --- */
  lane(ctx, {
    axis: 'z', at: RD.ex, from: RD.z - RD.w / 2, to: RD.zN, w: 4.0,
    mat: gm.asphaltWorn, kerb: false, rise: 0.05, name: 'susomichiEast',
  });
  ctx.platform({
    x0: RD.ex - 2.0, x1: RD.ex + 2.0,
    z0: RD.z - RD.w / 2, z1: RD.zN, top: Y0 + 0.11,
  });
  // the turning head where it stops, and the hedge across the end
  pad(ctx, { x: RD.ex + 0.8, z: RD.zN - 1.4, w: 6.0, d: 3.4, y: Y0, h: 0.06, mat: gm.asphaltWorn, name: 'susomichiTurn' });
  hedgeRun(ctx, { axis: 'x', at: RD.zN + 0.6, from: RD.ex - 2.6, to: RD.ex + 4.2, y: Y0, h: 1.0, seed: 8311 });
  ctx.add(makeCone({ x: RD.ex + 3.4, z: RD.zN - 0.4, y: Y0, ry: 0.4 }));

  /* --- the name plate, the signs, and the mirror on the corner --- */
  ctx.add(makeSignPost({
    x: RD.wx + 3.4, z: RD.z + 3.2, y: Y0, ry: -Math.PI / 2, h: 2.3, postMat: m.metal,
    plates: [
      { map: roadSignTex('chui'), w: 0.6, h: 0.6, y: 1.85, double: true },
      { map: trailSign(5), w: 1.05, h: 0.26, y: 1.32, double: true },
    ],
  }));
  ctx.collide(RD.wx + 3.24, RD.z + 3.04, RD.wx + 3.56, RD.z + 3.36, Y0 + 2.3);
  for (const [mx, mz, mry] of [[RD.wx + 3.6, RD.z - 2.6, 0.9], [RD.ex - 3.4, RD.z - 2.6, -0.9]]) {
    ctx.add(makeGuardrail({ ctx, x: mx, z: mz, y: Y0, ry: 0, len: 3.0 }));
  }
  /* Guardrail along the south side where the road runs closest to the hill's toe
   * -- the two stretches where the ground beyond it starts to fall toward the
   * gully rather than run level away. */
  for (const [a, b] of [[30.0, 42.0], [62.0, 76.0]]) {
    ctx.add(makeGuardrail({ ctx,
      x: (a + b) / 2, z: RD.z - RD.w / 2 - 0.75, y: Y0, ry: 0, len: b - a,
    }));
  }
}

/* ------------------------------------------------------------------ *
 * The transition: the school's back fence to the foot of the hill.
 * ------------------------------------------------------------------ */

/**
 * 林縁 -- the edge of the wood, and the buffer the brief asked for.
 *
 * Between the road's south verge at z = -92.2 and the toe of the massif -- which
 * is at z ≈ -100 behind the school and z ≈ -93 further west, because the toe runs
 * on a diagonal -- there is a strip of ground that is neither road nor hill.  What
 * goes in it is the list from the brief and it is all *maintenance*: a
 * strimmed grass edge, a retaining kerb where the slope starts, a drain, the
 * shrub belt, warning plates, and the tree line.  It is the piece that stops the
 * hill starting abruptly at the back of a school.
 */
function buildFringe(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();

  /* the retaining kerb along the toe: a low run of concrete blocks following the
   * contour, which is what holds a cut edge above a road anywhere in Japan.
   * Sampled off the field rather than laid on a line, because the toe is a
   * diagonal and a straight run would be buried at one end. */
  {
    const parts = [];
    for (let x = 0.0; x < 84.0; x += 2.0) {
      // walk south from the road until the ground starts to lift
      let zt = null;
      for (let z = -93.0; z > -106.0; z -= 0.5) {
        if (hillAt(x, z) > 0.35) { zt = z; break; }
      }
      if (zt === null) continue;
      const y = hillMeshY(x, zt);
      parts.push({ geometry: new THREE.BoxGeometry(2.05, 0.46, 0.3), matrix: trs(x + 1.0, y - 0.02, zt + 0.2) });
      parts.push({ geometry: new THREE.BoxGeometry(2.05, 0.08, 0.42), matrix: trs(x + 1.0, y + 0.25, zt + 0.2) });
    }
    const km = new THREE.Mesh(bake(parts), m.concreteMid);
    km.castShadow = km.receiveShadow = true;
    km.name = 'urayamaToeKerb';
    ctx.add(km);
  }

  /* 注意 plates at the two places somebody would walk off the road into the wood
   * without meaning to, and the 自然観察 board on the verge by the trail head. */
  for (const [sx, sz] of [[36.0, -93.4], [66.0, -93.4]]) {
    ctx.add(makeSignPost({
      x: sx, z: sz, y: Y0, ry: 0, h: 2.0, postMat: m.timber,
      plates: [{ map: trailNotice(0), w: 0.9, h: 0.68, y: 1.5, double: false }],
    }));
    ctx.collide(sx - 0.16, sz - 0.16, sx + 0.16, sz + 0.16, Y0 + 2.0);
  }

  /* the shrub belt and the tree line.  Density falls away from the school: the
   * bit you see from the back gate is swept, and it thickens toward the east
   * where nobody goes. */
  for (let k = 0; k < 26; k++) {
    const x = rng.range(-4, 88);
    let zt = null;
    for (let z = -92.5; z > -104.0; z -= 0.5) {
      if (hillAt(x, z) > 0.2) { zt = z; break; }
    }
    if (zt === null) continue;
    if (Math.abs(x - SITES.yard.x) < 7 || Math.abs(x - 18.0) < 5) continue;   // the trail head
    const y = hillMeshY(x, zt - rng.range(0.5, 3.0));
    out.shrubs.push({
      x, z: zt - rng.range(0.5, 3.0), y,
      r: rng.range(0.42, 0.62), count: rng.int(3, 5), spread: rng.range(1.2, 2.2),
      seed: 8400 + k,
    });
  }
  /* Three cherries on the verge, and only three: this is the elevation the school
   * looks out of its own back windows at, and a screen of blossom across it would
   * hide the hill the brief exists to show. */
  for (const [tx, tz, sc, sd] of [[8.0, -93.6, 1.18, 8421], [43.0, -93.8, 1.24, 8422], [72.0, -93.4, 1.12, 8423]]) {
    out.sakura.push({ x: tx, z: tz, y: Y0, scale: sc, seed: sd, lean: 0.1, leanDir: 3.4 });
    out.petals.push({ x: tx, z: tz + 1.4, y: Y0, r: 2.1, seed: sd + 1 });
  }
  // a strimmed pile and a couple of cut logs stacked on the verge, where the
  // maintenance actually happens
  ctx.add(makeCrates({ x: 52.0, z: -93.2, y: Y0, n: 3, seed: 8431, ry: 0.2 }));
  {
    const parts = [];
    for (let k = 0; k < 6; k++) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.14, 0.15, 1.7, 7),
        matrix: trs(58.0 + (k % 3) * 0.31, Y0 + 0.15 + ((k / 3) | 0) * 0.28, -93.6, 0, 0, Math.PI / 2),
      });
    }
    const lm = new THREE.Mesh(bake(parts), m.log);
    lm.castShadow = lm.receiveShadow = true;
    ctx.add(lm);
    ctx.collide(57.6, -94.5, 59.0, -92.7, Y0 + 0.6);
  }
}

/* ------------------------------------------------------------------ *
 * The trail head and the maintenance yard.
 * ------------------------------------------------------------------ */

function buildTrailHead(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();
  const HEAD = TRAILS.main[0];

  /* the apron, from the road's verge to the first of the path */
  pad(ctx, { x: 18.0, z: -92.6, w: 4.2, d: 2.6, y: Y0, h: 0.07, mat: gm.gravel, name: 'trailHeadApron' });

  /* the two posts and the chain across the entrance -- a vehicle bar, not a
   * gate: this is a footpath and the bar is there to stop a car, so it is 0.55 m
   * high and the way through beside it is open.  A collider on the *posts* only,
   * for the same reason the bus shelter's cheeks carry none. */
  {
    const px = 18.0, pz = -93.6;
    for (const s of [-1, 1]) {
      const p = cyl(0.09, 0.1, 0.95, 8, m.timberDark, px + s * 1.5, hillMeshY(px + s * 1.5, pz) + 0.4, pz);
      p.castShadow = true;
      ctx.add(p);
      ctx.add(cyl(0.11, 0.11, 0.1, 8, m.metalDark, px + s * 1.5, hillMeshY(px + s * 1.5, pz) + 0.9, pz));
      ctx.collide(px + s * 1.5 - 0.14, pz - 0.14, px + s * 1.5 + 0.14, pz + 0.14, Y0 + 0.95);
    }
    // the chain, hanging slack
    const chain = [];
    for (let k = 0; k < 9; k++) {
      const t = (k + 0.5) / 9;
      const cxp = px - 1.5 + 3.0 * t;
      const sag = Math.sin(Math.PI * t) * 0.14;
      chain.push({
        geometry: new THREE.CylinderGeometry(0.022, 0.022, 0.36, 5),
        matrix: trs(cxp, Y0 + 0.66 - sag, pz, 0, 0, Math.PI / 2),
      });
    }
    const cm = new THREE.Mesh(bake(chain), m.metalDark);
    ctx.add(cm);
  }

  // the safety notice and the fingerpost at the head
  ctx.add(makeNoticeBoard({ ctx,
    x: 15.4, z: -93.0, y: Y0, ry: 0.28, w: 1.9, h: 1.3, y0: 0.95, wood: 0x8a6f52,
    sheets: [
      { map: trailNotice(0), x: -0.42, y: 0.0, w: 0.78, h: 0.6, tilt: 0.0 },
      { map: trailNotice(1), x: 0.46, y: 0.02, w: 0.66, h: 0.5, tilt: -0.02 },
    ],
  }));
  finger(ctx, 20.2, -94.4, 0.35, [0, 1]);

  /* --- the maintenance compound, 6 m up the slope --- */
  {
    const V = SITES.yard;
    const y = hillMeshY(V.x, V.z);
    pad(ctx, { x: V.x, z: V.z, w: 5.6, d: 4.2, y: y - 0.07, h: 0.07, mat: gm.gravel, name: 'urayamaYard' });
    // the tool store, and the flood box beside it
    ctx.add(makeStorageShed({ x: V.x - 1.5, z: V.z - 1.2, y, ry: Math.PI, w: 2.4, d: 1.5, h: 2.1, seed: 8441 }));
    ctx.collide(V.x - 2.8, V.z - 2.1, V.x - 0.2, V.z - 0.3, y + 2.3);
    {
      const bx = V.x + 1.9, bz = V.z - 1.3;
      const body = box(1.5, 0.95, 1.0, cel({ color: 0xd8d0c0, bands: 3, tint: 0x6a6288 }), bx, y + 0.48, bz);
      body.castShadow = body.receiveShadow = true;
      ctx.add(body);
      hullOutline(body, { thickness: 0.003 });
      const lid = box(1.62, 0.1, 1.1, cel({ color: 0xc4bcac, bands: 3, tint: 0x655d84 }), bx, y + 1.0, bz);
      lid.rotation.x = -0.04;
      ctx.add(lid);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.28, 0.04),
        [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
         flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
         flat({ color: 0xffffff, map: warningPlate(0), cache: false }),
         flat({ color: PAL.wallGray })]
      );
      plate.position.set(bx, y + 0.62, bz + 0.52);
      ctx.add(plate);
      ctx.collide(bx - 0.85, bz - 0.6, bx + 0.85, bz + 0.6, y + 1.05);
    }
    ctx.add(makeBucket({ x: V.x - 0.2, z: V.z + 1.3, y, ry: 0.6 }));
    ctx.add(makeBucket({ x: V.x + 0.3, z: V.z + 1.6, y, ry: -0.4 }));
    ctx.add(makeBroom({ x: V.x - 2.6, z: V.z + 0.4, y, ry: 1.1, lean: 0.22 }));
    ctx.add(makeMilkCrate({ x: V.x + 2.4, z: V.z + 1.2, y, ry: 0.3, n: 2 }));
    ctx.add(makeTapPost({ x: V.x + 2.5, z: V.z + 0.1, y, ry: Math.PI, h: 0.86 }));
    makeChalkMarks(ctx, [{ x: V.x - 0.4, z: V.z + 1.9, y: y + 0.005, ry: 0.5, seed: 8451 }]);
    // the spur of path from the trail up to it
    hillPath(ctx, {
      pts: [[19.6, -97.4], [21.6, -98.6], [V.x, V.z + 2.1]],
      w: 1.1, name: 'urayamaYardPath',
    });
    out.shrubs.push({ x: V.x + 3.6, z: V.z - 1.0, y, r: 0.5, count: 4, spread: 1.5, seed: 8461 });
  }
}

/* ------------------------------------------------------------------ *
 * The trails, dressed.
 * ------------------------------------------------------------------ */

function buildTrails(ctx, rng, out) {
  const m = mats();
  const hm = hillMats();

  /* Every trail as a ribbon, then the pitches that need logs, then the rails on
   * the spans where the ground falls away on the outside. */
  const laid = {};
  for (const key of Object.keys(TRAILS)) {
    laid[key] = hillPath(ctx, {
      pts: TRAILS[key],
      w: key === 'main' ? 1.5 : key === 'foot' ? 1.7 : 1.25,
      mat: key === 'foot' ? hm.pathEdge : hm.path,
      name: 'trail_' + key,
    });
  }

  /* --- log steps, placed by measurement --- */
  let flights = 0;
  for (const key of Object.keys(TRAILS)) {
    for (const s of laid[key].segs) {
      if (s.grade < 0.28) continue;
      logSteps(ctx, s.a, s.b, { w: key === 'main' ? 1.5 : 1.25 });
      flights++;
    }
  }

  /* --- rails where it matters --- *
   * On the *downhill* side of the two legs above the switchback, and along the
   * ridge where the ground falls away north.  Not everywhere: a hill path with a
   * handrail down the whole of it is a boardwalk in a country park, which is
   * exactly what the brief said not to build. */
  trailRail(ctx, TRAILS.main.slice(4, 8), { side: 1, off: 0.98 });
  trailRail(ctx, TRAILS.ridge.slice(0, 4), { side: -1, off: 0.86, h: 0.86 });
  trailRail(ctx, TRAILS.deck, { side: 1, off: 0.86, h: 0.86 });

  /* --- a short length of boardwalk where the upper traverse crosses the wet
   * shelf.  Timber on bearers, because that shelf is where the field is flattest
   * and the one place on the hill that would actually be boggy. --- */
  {
    const a = [-11.0, -121.2], b = [-4.4, -122.6];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const parts = [];
    const bearers = [];
    const n = Math.round(len / 0.34);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const px = a[0] + (b[0] - a[0]) * t;
      const pz = a[1] + (b[1] - a[1]) * t;
      const y = hillMeshY(px, pz);
      parts.push({
        geometry: new THREE.BoxGeometry(1.4, 0.06, 0.26),
        matrix: trs(px, y + 0.14, pz, 0, ry + Math.PI / 2, 0),
      });
      if (k % 6 === 0) {
        for (const s of [-1, 1]) {
          bearers.push({
            geometry: new THREE.BoxGeometry(0.12, 0.24, 0.12),
            matrix: trs(px + Math.cos(ry) * s * 0.58, y + 0.0, pz - Math.sin(ry) * s * 0.58),
          });
        }
      }
    }
    const dm = new THREE.Mesh(bake(parts), m.timber);
    dm.castShadow = dm.receiveShadow = true;
    ctx.add(dm);
    const bm = new THREE.Mesh(bake(bearers), m.timberDark);
    ctx.add(bm);
    ctx.platform({
      x0: Math.min(a[0], b[0]) - 0.8, x1: Math.max(a[0], b[0]) + 0.8,
      z0: Math.min(a[1], b[1]) - 0.8, z1: Math.max(a[1], b[1]) + 0.8,
      top: hillMeshY((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) + 0.18,
    });
  }

  /* --- two gullies with plank bridges over them --- */
  gullyBridge(ctx, -21.0, -108.0, 0.42, 3.4);
  gullyBridge(ctx, 11.4, -127.6, 1.15, 3.0);

  /* --- fingerposts at the junctions, with the distances the panel quotes --- */
  finger(ctx, -25.4, -111.6, 0.9, [1, 4]);          // the 祠 turn
  finger(ctx, -13.2, -119.2, 2.3, [2, 0]);          // the glade spur
  finger(ctx, 23.8, -134.6, 3.0, [0, 4]);           // the crest
  finger(ctx, 25.6, -136.4, 1.4, [4]);              // the ridge walk
  finger(ctx, 12.6, -97.2, 0.2, [5]);               // the 山裾の道's west end
  finger(ctx, 84.6, -95.4, -0.8, [3]);              // and its east end

  /* --- benches and rest points along the way, on the outside of bends where
   * there is something to look at --- */
  for (const [bx, bz, bry] of [
    [0.4, -103.0, 3.0], [-27.8, -113.6, 1.2], [SITES.rest.x, SITES.rest.z, 3.0],
    [7.2, -126.0, 2.8], [-19.4, -134.6, 1.7],
  ]) {
    const y = hillMeshY(bx, bz);
    ctx.add(makeBench({ x: bx, z: bz, y, ry: bry, len: 1.7 }));
  }

  /* the rest platform on the shelf: a slab, two benches and a waste bin, which is
   * what a maintained path puts where it opens out */
  {
    const V = SITES.rest;
    const y = hillMeshY(V.x, V.z);
    pad(ctx, { x: V.x + 1.6, z: V.z + 1.8, w: 3.4, d: 2.6, y: y - 0.07, h: 0.07, mat: hillMats().pathEdge, name: 'urayamaRest' });
    ctx.add(makeBench({ x: V.x + 2.4, z: V.z + 2.6, y, ry: 0.4, len: 1.6 }));
    ctx.add(makeMilkCrate({ x: V.x + 0.4, z: V.z + 2.8, y, ry: 0.7, n: 1 }));
  }

  return flights;
}

/* ------------------------------------------------------------------ *
 * 展望台 -- the viewing deck.
 * ------------------------------------------------------------------ */

/**
 * The deck, and it is the reason the district exists.
 *
 * 13.9 m up on the massif's north shoulder, on the one piece of high ground with
 * a clean fall away toward the school, with a 2.8 m timber platform on top of that
 * -- so the eye is 18.3 m above the town's datum.  On a 160 m planet that is a
 * ground horizon of 76 m, which reaches the school's north wall at 42 m, the gym
 * at 62, and the ground in between; the town's roofs beyond that are visible
 * because they are tall, not because the ground is.  Everything the 眺望案内 panel
 * names was checked against that number.
 *
 * 2.8 m and not 4: a deck high enough to see over the crest behind it needs a
 * flight of twenty-two treads, and a twenty-two-tread stair on a hillside is a
 * structure rather than a viewpoint.  Fifteen at 0.187 is one flight.
 */
function buildDeck(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();
  const g = new THREE.Group();
  g.name = 'urayamaDeck';
  ctx.add(g);

  const V = SITES.deck;
  const gy = hillMeshY(V.x, V.z);
  const W = 5.4, D = 4.6;
  const H = 2.8;
  const DY = gy + H;

  /* --- the frame: four corner posts on pad footings, and the beams they carry.
   * A 3 by 3 grid put a pole in the middle of the undercroft. --- */
  {
    const posts = [];
    const foot = [];
    for (const i of [-1, 1]) {
      for (const j of [-1, 1]) {
        const px = V.x + i * (W / 2 - 0.35);
        const pz = V.z + j * (D / 2 - 0.35);
        const py = hillMeshY(px, pz);
        foot.push({ geometry: new THREE.BoxGeometry(0.6, 0.3, 0.6), matrix: trs(px, py + 0.08, pz) });
        posts.push({
          geometry: new THREE.BoxGeometry(0.2, DY - py - 0.1, 0.2),
          matrix: trs(px, (DY + py + 0.1) / 2 - 0.05, pz),
        });
        ctx.collide(px - 0.10, pz - 0.10, px + 0.10, pz + 0.10, DY, py, true);
      }
    }
    /* Cross ties on the four faces, between the remaining corners. */
    for (const i of [-1, 1]) {
      const px = V.x + i * (W / 2 - 0.35);
      const za = V.z + -1 * (D / 2 - 0.35);
      const zb = V.z + 1 * (D / 2 - 0.35);
      const ya = hillMeshY(px, za), yb = hillMeshY(px, zb);
      for (const f of [0.36, 0.7]) {
        const y0 = ya + (DY - ya) * f, y1 = yb + (DY - yb) * f;
        const L = Math.hypot(zb - za, y1 - y0);
        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, y1 - y0, zb - za).normalize());
        posts.push({
          geometry: new THREE.BoxGeometry(0.1, L, 0.1),
          matrix: new THREE.Matrix4().compose(
            new THREE.Vector3(px, (y0 + y1) / 2, (za + zb) / 2), q, new THREE.Vector3(1, 1, 1)),
        });
      }
    }
    const fm = new THREE.Mesh(bake(foot), gm.concreteMid);
    fm.castShadow = fm.receiveShadow = true;
    g.add(fm);
    const pm = new THREE.Mesh(bake(posts), m.timberDark);
    pm.name = 'openFrame';
    pm.castShadow = pm.receiveShadow = true;
    g.add(pm);
    hullOutline(pm, { thickness: 0.003 });
  }

  /* --- the deck: bearers, then boards laid across them --- */
  {
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push({ geometry: new THREE.BoxGeometry(W + 0.2, 0.22, 0.16), matrix: trs(V.x, DY - 0.12, V.z + s * (D / 2 - 0.1)) });
      parts.push({ geometry: new THREE.BoxGeometry(0.16, 0.22, D + 0.2), matrix: trs(V.x + s * (W / 2 - 0.08), DY - 0.12, V.z) });
    }
    parts.push({ geometry: new THREE.BoxGeometry(W + 0.2, 0.2, 0.14), matrix: trs(V.x, DY - 0.13, V.z) });
    const bm = new THREE.Mesh(bake(parts), m.timberDark);
    bm.castShadow = bm.receiveShadow = true;
    g.add(bm);

    const boards = [];
    const n = Math.round(D / 0.19);
    for (let k = 0; k < n; k++) {
      boards.push({
        geometry: new THREE.BoxGeometry(W + 0.24, 0.055, 0.165),
        matrix: trs(V.x, DY + 0.03, V.z - D / 2 + 0.1 + k * (D - 0.2) / (n - 1)),
      });
    }
    const dm = new THREE.Mesh(bake(boards), m.timber);
    dm.castShadow = dm.receiveShadow = true;
    g.add(dm);
    hullOutline(dm, { thickness: 0.003 });
    ctx.platform({ x0: V.x - W / 2, x1: V.x + W / 2, z0: V.z - D / 2, z1: V.z + D / 2, top: DY + 0.06 });
  }

  /* --- the balustrade.  A parapet and not a flush edge: `_resolve` skips any
   * collider whose top is within a step of the feet, so a rail at deck level lets
   * the player stroll off a 2.8 m drop -- the shrine's wall stands 0.5 m proud for
   * exactly this reason.  1.05 m clears the 0.38 m step by a long way. --- */
  {
    const RH = 1.05;
    const parts = [];
    const rail = (x0, z0, x1, z1, gap) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ry = Math.atan2(x1 - x0, z1 - z0);
      const n = Math.max(2, Math.round(len / 1.3));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        if (gap && t > gap[0] && t < gap[1]) continue;
        const px = x0 + (x1 - x0) * t;
        const pz = z0 + (z1 - z0) * t;
        parts.push({
          geometry: new THREE.BoxGeometry(0.11, RH, 0.11),
          matrix: trs(px, DY + RH / 2, pz),
        });
        ctx.collide(px - 0.06, pz - 0.06, px + 0.06, pz + 0.06, DY + RH, DY, true);
      }
      for (const hy of [RH - 0.05, RH * 0.5]) {
        if (gap) {
          for (const [a, b] of [[0, gap[0]], [gap[1], 1]]) {
            if (b - a < 0.02) continue;
            const sx = x0 + (x1 - x0) * a, sz = z0 + (z1 - z0) * a;
            const ex = x0 + (x1 - x0) * b, ez = z0 + (z1 - z0) * b;
            parts.push({
              geometry: new THREE.BoxGeometry(0.08, 0.08, Math.hypot(ex - sx, ez - sz)),
              matrix: trs((sx + ex) / 2, DY + hy, (sz + ez) / 2, 0, ry, 0),
            });
            ctx.collide(Math.min(sx, ex) - 0.06, Math.min(sz, ez) - 0.06,
              Math.max(sx, ex) + 0.06, Math.max(sz, ez) + 0.06,
              DY + hy + 0.05, DY + hy - 0.05, true);
          }
        } else {
          parts.push({
            geometry: new THREE.BoxGeometry(0.08, 0.08, len),
            matrix: trs((x0 + x1) / 2, DY + hy, (z0 + z1) / 2, 0, ry, 0),
          });
          ctx.collide(Math.min(x0, x1) - 0.06, Math.min(z0, z1) - 0.06,
            Math.max(x0, x1) + 0.06, Math.max(z0, z1) + 0.06,
            DY + hy + 0.05, DY + hy - 0.05, true);
        }
      }
    };
    /* **+z is north, which is the way the deck looks.**  Written the other way
     * round first -- the stair, the gap in the rail and the 眺望案内 panel all
     * ended up on the +z side, i.e. across the view, and the flood fill found it
     * as three blocked cells on the stair rather than as a picture problem.  The
     * gap and the flight are on the *back* of the deck; the panel is on the front
     * rail with its map on the -z face so it is read from inside. */
    const x0 = V.x - W / 2, x1 = V.x + W / 2, z0 = V.z - D / 2, z1 = V.z + D / 2;
    rail(x0, z1, x1, z1);                  // north -- the view side, unbroken
    rail(x0, z0, x1, z0, [0.55, 0.86]);    // south -- the stair comes up here
    rail(x0, z0, x0, z1);
    rail(x1, z0, x1, z1);
    const rm = new THREE.Mesh(bake(parts), m.timber);
    rm.name = 'openFrame';
    rm.castShadow = true;
    g.add(rm);
  }

  /* --- the stair up the south side.  Treads on stringers with a platform each,
   * because `heightAt` is what carries the player and nothing else will. --- */
  {
    const n = 15;
    const rise = H / n;
    const run = 0.34;
    const sx = V.x + 0.9;
    const parts = [];
    const treads = [];
    const zTop = V.z - D / 2 - 0.25;
    for (let k = 0; k < n; k++) {
      const tz = zTop - (n - 1 - k) * run;
      const ty = gy + rise * (k + 1);
      treads.push({ geometry: new THREE.BoxGeometry(1.5, 0.06, run + 0.06), matrix: trs(sx, ty, tz) });
      ctx.platform({ x0: sx - 0.75, x1: sx + 0.75, z0: tz - run * 0.62, z1: tz + run * 0.62, top: ty });
    }
    const tm = new THREE.Mesh(bake(treads), m.timber);
    tm.castShadow = tm.receiveShadow = true;
    g.add(tm);
    /* The two stringers, raked.
     *
     * **A box along Z turned by `rx` about X sends its +z end DOWN**, and this
     * stair's +z end is its *foot* -- the treads run from `V.z + D/2 + 0.25` at
     * the top to that plus `(n-1)·run` at the bottom.  So the sign is positive.
     * Written negative first, which is the overbridge's bug exactly: the
     * stringer climbed away from the treads it was carrying, and from below it
     * read as two poles leaning off into the air. */
    /* The stair runs south, so its foot is at *smaller* z and the +z end of a
     * stringer is its head.  A box along Z turned by `rx` about X sends its +z
     * end down, so the head goes up on a **negative** rake -- the mirror of the
     * sign this had when the flight ran the other way, and the reason that trap
     * is in the table twice. */
    const slen = Math.hypot(n * run, H);
    const rake = Math.atan2(H, n * run);
    const zMid = zTop - ((n - 1) * run) / 2;
    for (const s of [-1, 1]) {
      const st = box(0.14, 0.34, slen + 0.4, m.timberDark, sx + s * 0.8, gy + H / 2 + 0.02, zMid);
      st.rotation.x = -rake;
      st.castShadow = st.receiveShadow = true;
      g.add(st);
      // and its handrail
      const hr = box(0.09, 0.09, slen + 0.2, m.timber, sx + s * 0.8, gy + H / 2 + 0.95, zMid);
      hr.rotation.x = -rake;
      hr.castShadow = true;
      g.add(hr);
      for (let k = 0; k < 4; k++) {
        const t = (k + 0.5) / 4;
        const pz = zTop - (n - 1) * run * (1 - t);
        const py = gy + H * t;
        g.add(box(0.09, 1.0, 0.09, m.timber, sx + s * 0.8, py + 0.48, pz));
      }
      /* One box per tread at that tread's rail. A band of two fills air
       * above the lower handrail. */
      for (let k = 0; k < n; k++) {
        const zA = zTop - (n - 1 - k) * run;
        const zB = k + 1 < n ? zTop - (n - 1 - (k + 1)) * run : zA - run;
        const yTread = gy + rise * (k + 1);
        ctx.collide(sx + s * 0.8 - 0.1, Math.min(zA, zB), sx + s * 0.8 + 0.1, Math.max(zA, zB),
          yTread + 0.95, yTread);
      }
    }
    // the gravel landing at the bottom, where the spur arrives
    pad(ctx, {
      x: sx, z: zTop - (n - 0.2) * run, w: 1.9, d: 1.4,
      y: gy - 0.07, h: 0.07, mat: hillMats().pathEdge, name: 'deckLanding',
    });
  }

  /* --- what makes it a viewpoint rather than a platform: the panel, two benches
   * facing the view, and the plate with the name on it --- */
  {
    /* The map goes on the board's **-z** face and the board tilts +0.42 about X,
     * so its normal ends up pointing up and south -- which is where the reader is.
     * On the +z face it faces up and *north*, i.e. it is legible only from
     * outside the deck, over the drop. */
    /* On the west half of the rail, not the middle.  A 2.4 m panel centred on a
     * 5.4 m deck is half the view -- and the *reason* to stand here is the other
     * half.  1.9 m, offset 1.2 m west, so the east side of the rail is clear. */
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.9, 0.09),
      [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }),
       flat({ color: 0xffffff, map: deckPanel(), cache: false })]
    );
    panel.position.set(V.x - 1.2, DY + 0.92, V.z + D / 2 - 0.4);
    panel.rotation.x = 0.42;
    panel.castShadow = true;
    g.add(panel);
    hullOutline(panel, { thickness: 0.003 });
    for (const s of [-1, 1]) {
      g.add(box(0.1, 0.85, 0.1, m.timberDark, V.x - 1.2 + s * 0.85, DY + 0.48, V.z + D / 2 - 0.56));
    }
    /* `ry: 0`, and the comment three lines up is why: `makeBench` puts its back
     * at local -z, so `0` faces +z -- which is north, which is the way this deck
     * looks and the entire reason it is here.  At `Math.PI` both benches sat you
     * with your back to the school, the ground and the gym, facing the hillside
     * you had just walked up. */
    ctx.add(makeBench({ x: V.x - 1.4, z: V.z - 1.2, y: DY + 0.06, ry: 0, len: 1.7 }));
    ctx.add(makeBench({ x: V.x + 1.5, z: V.z - 1.2, y: DY + 0.06, ry: 0, len: 1.4 }));
  }

  /* the name board at the foot of the stair, on the trail */
  {
    const bx = V.x - 1.4, bz = V.z - D / 2 - 6.2;
    const y = hillMeshY(bx, bz);
    ctx.add(makeNoticeBoard({ ctx,
      x: bx, z: bz, y, ry: 0, w: 1.7, h: 1.1, y0: 0.95, wood: 0x8a6f52,
      sheets: [{ map: trailNotice(1), x: 0, y: 0, w: 0.76, h: 0.58, tilt: 0.0 }],
    }));
  }

  /* Planting: the corridor north of the deck is kept clear by `hills.js`, so what
   * goes in is a frame.
   *
   * **All of it is south or hard on the flanks**, and the first pass got that
   * backwards: `+z` is north, which is the way the deck *looks*, so four
   * evergreens at `+dz` and a cherry 5.8 m in front of the rail filled the entire
   * view with blossom.  The deck faces the school; anything in front of it is in
   * the picture it exists for. */
  for (const [dx, dz, sc, sd] of [
    [-7.4, -1.4, 1.5, 8501], [-6.2, -5.0, 1.38, 8502],
    [7.2, -1.0, 1.44, 8503], [8.0, -5.6, 1.55, 8504],
  ]) {
    out.grove.push({
      x: V.x + dx, z: V.z + dz, y: hillMeshY(V.x + dx, V.z + dz) + 0.02,
      scale: sc, seed: sd, spread: 1.12, lean: 0.05, leanDir: sd % 6,
    });
  }
  out.sakura.push({
    x: V.x - 3.4, z: V.z - 6.4, y: hillMeshY(V.x - 3.4, V.z - 6.4) + 0.02,
    scale: 1.2, seed: 8511, lean: 0.11, leanDir: 2.4,
  });
  dapple(ctx, { x: V.x, z: V.z + 3.6, y: hillMeshY(V.x, V.z + 3.6), r: 1.5, spread: 3.0, n: 6, rng });

  shadowify(g, true, true);
  return g;
}

/* ------------------------------------------------------------------ *
 * 山ノ神 -- the stone shrine on the path.
 * ------------------------------------------------------------------ */

/**
 * A 石祠 and not a shrine: no precinct, no hall, no forecourt.  A stone box the
 * size of a letterbox on a plinth, a 1.4 m timber 鳥居 in front of it, two small
 * 石灯籠, an offering shelf with a cup of water on it, three stone treads up from
 * the path, and a rope with 紙垂 on the tree beside it.  Fifteen square metres in
 * total, which is the whole point -- 桜守神社 is the shrine in this world and this
 * is what the mountain has instead.
 */
function buildHokora(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();
  const g = new THREE.Group();
  g.name = 'urayamaHokora';
  ctx.add(g);

  const V = SITES.hokora;
  const base = hillMeshY(V.x + 1.6, V.z + 0.6);

  /* three treads up from the path, on the flat ground the spur ends at */
  const fl = steps(ctx, {
    x: V.x + 1.5, z: V.z + 0.4, n: 3, rise: 0.16, run: 0.42, w: 1.6,
    y: base - 0.16, dir: -1, axis: 'x', mat: gm.stone,
  });
  const py = base + 0.32;

  /* the platform the whole thing stands on */
  pad(ctx, { x: V.x - 0.6, z: V.z, w: 3.4, d: 3.0, y: py - 0.08, h: 0.08, mat: gm.gravel, name: 'hokoraPad' });
  {
    const kerb = [];
    for (const s of [-1, 1]) {
      kerb.push({ geometry: new THREE.BoxGeometry(3.4, 0.22, 0.18), matrix: trs(V.x - 0.6, 0.11, V.z + s * 1.44) });
    }
    kerb.push({ geometry: new THREE.BoxGeometry(0.18, 0.22, 3.0), matrix: trs(V.x - 2.2, 0.11, V.z) });
    const km = new THREE.Mesh(bake(kerb), gm.stoneDark);
    km.position.y = py - 0.08;
    km.castShadow = km.receiveShadow = true;
    g.add(km);
  }

  /* the 鳥居 -- 1.4 m, timber, vermilion, and small enough that you duck */
  {
    const tx = V.x + 0.5, TW = 1.15, TH = 1.5;
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.065, 0.078, TH, 8),
        matrix: trs(0, TH / 2, s * TW / 2),
      });
    }
    parts.push({ geometry: new THREE.BoxGeometry(0.13, 0.1, TW + 0.5), matrix: trs(0, TH - 0.28, 0) });
    // the 笠木, with the slight upward sweep every torii has
    parts.push({ geometry: new THREE.BoxGeometry(0.17, 0.11, TW + 0.66), matrix: trs(0, TH + 0.02, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(0.2, 0.07, TW + 0.72), matrix: trs(0, TH + 0.1, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(0.1, 0.2, 0.13), matrix: trs(0, TH - 0.16, 0) });
    const tm = new THREE.Mesh(bake(parts), m.torii);
    tm.name = 'torii';
    tm.position.set(tx, py, V.z);
    tm.castShadow = tm.receiveShadow = true;
    g.add(tm);
    hullOutline(tm, { thickness: 0.0032 });
    for (const s of [-1, 1]) {
      ctx.collide(tx - 0.12, V.z + s * TW / 2 - 0.12, tx + 0.12, V.z + s * TW / 2 + 0.12, py + TH);
    }
  }

  /* the 祠 itself: a plinth, a stone box, a stepped roof and the dark of the
   * niche behind its opening */
  {
    const hx = V.x - 1.35;
    const plinth = box(1.1, 0.42, 1.0, gm.stoneDark, hx, py + 0.21, V.z);
    plinth.castShadow = plinth.receiveShadow = true;
    g.add(plinth);
    const body = box(0.68, 0.72, 0.6, gm.stone, hx, py + 0.78, V.z);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    hullOutline(body, { thickness: 0.0032 });
    // the niche: a real opening with a dark back, not a panel drawn on the face
    const niche = box(0.16, 0.44, 0.3, flat({ color: 0x2e2b38 }), hx + 0.28, py + 0.76, V.z);
    niche.userData.noOutline = true;
    g.add(niche);
    g.add(box(0.07, 0.5, 0.36, gm.stoneDark, hx + 0.35, py + 0.76, V.z));
    // the roof: two stepped slabs and a ridge
    g.add(box(0.86, 0.1, 0.78, gm.stone, hx, py + 1.19, V.z));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), gm.stoneDark);
    cap.rotation.y = Math.PI / 4;
    cap.scale.set(0.78, 0.34, 0.7);
    cap.position.set(hx, py + 1.4, V.z);
    cap.castShadow = true;
    g.add(cap);
    hullOutline(cap, { thickness: 0.0032 });
    ctx.collide(hx - 0.62, V.z - 0.58, hx + 0.62, V.z + 0.58, py + 1.5);

    // the offering shelf, with a cup and a small dish on it
    const shelf = box(0.66, 0.12, 0.4, gm.stone, hx + 0.72, py + 0.4, V.z);
    shelf.castShadow = shelf.receiveShadow = true;
    g.add(shelf);
    g.add(box(0.12, 0.28, 0.12, gm.stoneDark, hx + 0.72, py + 0.2, V.z));
    g.add(cyl(0.045, 0.04, 0.075, 9, cel({ color: 0xf2eee4, bands: 'soft', tint: 0x9c93b8 }), hx + 0.68, py + 0.49, V.z - 0.1));
    g.add(cyl(0.062, 0.058, 0.03, 10, cel({ color: 0xe4dccc, bands: 3, tint: 0x8a83a8 }), hx + 0.7, py + 0.47, V.z + 0.11));
    // a sprig in a cup, which is what is actually on one of these
    for (let k = 0; k < 3; k++) {
      const sp = cyl(0.008, 0.008, 0.2, 4, cel({ color: PAL.cedar, bands: 3, tint: 0x5b6f8c }),
        hx + 0.68 + rng.range(-0.02, 0.02), py + 0.62, V.z - 0.1 + rng.range(-0.02, 0.02));
      sp.rotation.z = rng.range(-0.2, 0.2);
      g.add(sp);
    }
  }

  /* two small 石灯籠, flanking the way in */
  for (const s of [-1, 1]) {
    const lx = V.x + 0.4, lz = V.z + s * 1.05;
    const parts = [];
    parts.push({ geometry: new THREE.BoxGeometry(0.34, 0.14, 0.34), matrix: trs(0, 0.07, 0) });
    parts.push({ geometry: new THREE.CylinderGeometry(0.075, 0.09, 0.42, 8), matrix: trs(0, 0.35, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(0.3, 0.07, 0.3), matrix: trs(0, 0.6, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(0.25, 0.24, 0.25), matrix: trs(0, 0.75, 0) });
    const lm = new THREE.Mesh(bake(parts), gm.stone);
    lm.position.set(lx, py, lz);
    lm.castShadow = lm.receiveShadow = true;
    g.add(lm);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), gm.stoneDark);
    cap.rotation.y = Math.PI / 4;
    cap.scale.set(0.42, 0.2, 0.42);
    cap.position.set(lx, py + 0.96, lz);
    cap.castShadow = true;
    g.add(cap);
    // the dark of the light chamber
    const box0 = box(0.13, 0.14, 0.13, flat({ color: 0x2e2b38 }), lx, py + 0.75, lz);
    box0.userData.noOutline = true;
    g.add(box0);
    ctx.collide(lx - 0.2, lz - 0.2, lx + 0.2, lz + 0.2, py + 1.0);
  }

  /* the notice board, and the 御神木's rope on the tree beside the pad */
  ctx.add(makeNoticeBoard({ ctx,
    x: V.x - 0.4, z: V.z - 1.9, y: py - 0.08, ry: 0, w: 1.3, h: 0.9, y0: 0.85, wood: 0x8a6f52,
    sheets: [{ map: trailNotice(2), x: 0, y: 0, w: 0.62, h: 0.5, tilt: 0.0 }],
  }));
  {
    const tx = V.x - 2.9, tz = V.z + 1.6;
    const ty = hillMeshY(tx, tz);
    out.grove.push({ x: tx, z: tz, y: ty, scale: 1.75, seed: 8601, spread: 1.2, lean: 0.04, leanDir: 1.4 });
    // the 注連縄 round its trunk, with four 紙垂 hanging off it
    const r = 0.24 * 1.75 * 1.1;
    const rope = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 5, 12), m.rope);
    rope.rotation.x = Math.PI / 2;
    rope.position.set(tx, ty + 1.35, tz);
    rope.castShadow = true;
    g.add(rope);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.24),
        flat({ color: 0xfaf8f2, side: THREE.DoubleSide }));
      sh.position.set(tx + Math.cos(a) * r, ty + 1.2, tz + Math.sin(a) * r);
      sh.rotation.y = -a;
      sh.userData.noOutline = true;
      g.add(sh);
    }
  }
  out.shrubs.push({ x: V.x - 1.2, z: V.z + 2.2, y: hillMeshY(V.x - 1.2, V.z + 2.2), r: 0.44, count: 3, spread: 1.1, seed: 8611 });
  out.petals.push({ x: V.x + 0.4, z: V.z, y: py, r: 1.6, seed: 8612 });
  dapple(ctx, { x: V.x - 0.6, z: V.z + 0.6, y: py, r: 1.3, spread: 2.0, n: 5, rng });

  shadowify(g, true, true);
  return g;
}

/* ------------------------------------------------------------------ *
 * 林間広場 -- the clearing, and the smaller one on the crest.
 * ------------------------------------------------------------------ */

function buildGlades(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();

  /* --- the main clearing, on the flattest ground on the hill (slope 0.04) --- */
  {
    const V = SITES.glade;
    const y = hillMeshY(V.x, V.z);
    pad(ctx, { x: V.x, z: V.z, w: 8.0, d: 7.0, y: y - 0.06, h: 0.06, mat: hillMats().pathEdge, name: 'gladePad' });

    /* the timber post-and-rail fence round three sides of it -- the thing that
     * says "this is a place, not a gap in the trees" -- with the fourth side open
     * where the spur comes in. */
    for (const [ax, az, bx, bz] of [
      [V.x - 4.0, V.z - 3.5, V.x + 4.0, V.z - 3.5],
      [V.x + 4.0, V.z - 3.5, V.x + 4.0, V.z + 3.5],
      [V.x - 4.0, V.z + 3.5, V.x - 0.6, V.z + 3.5],
    ]) {
      trailRail(ctx, [[ax, az], [bx, bz]], { side: 0, off: 0, h: 0.82, mat: m.timberDark });
    }

    /* the interpretation board -- the 自然観察 one, which is the reason the
     * clearing exists: this is where the biology club's observation records come
     * from, and the board quotes them. */
    ctx.add(makeNoticeBoard({ ctx,
      x: V.x - 1.2, z: V.z - 3.1, y, ry: 0, w: 2.2, h: 1.4, y0: 0.95, wood: 0x8a6f52,
      sheets: [
        { map: trailNotice(1), x: -0.5, y: 0.0, w: 0.84, h: 0.64, tilt: 0.0 },
        { map: trailNotice(0), x: 0.56, y: 0.02, w: 0.66, h: 0.5, tilt: -0.02 },
      ],
    }));


    /* log seats round a stone table.  Cut rings of trunk, which is what a school
     * puts in a clearing because it costs nothing and lasts. */
    {
      const tx = V.x + 1.0, tz = V.z + 0.4;
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.72, 0.16, 9), gm.stone);
      slab.position.set(tx, y + 0.5, tz);
      slab.castShadow = slab.receiveShadow = true;
      ctx.add(slab);
      ctx.add(cyl(0.28, 0.34, 0.44, 8, gm.stoneDark, tx, y + 0.22, tz));
      ctx.collide(tx - 0.32, tz - 0.32, tx + 0.32, tz + 0.32, y + 0.44, y, true);
      ctx.collide(tx - 0.78, tz - 0.78, tx + 0.78, tz + 0.78, y + 0.58, y + 0.42, true);
      const logs = [];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.6;
        const lx = tx + Math.cos(a) * 1.7;
        const lz = tz + Math.sin(a) * 1.7;
        const ly = hillMeshY(lx, lz);
        logs.push({
          geometry: new THREE.CylinderGeometry(0.24, 0.26, 0.44, 9),
          matrix: trs(lx, ly + 0.22, lz),
        });
        logs.push({
          geometry: new THREE.CylinderGeometry(0.245, 0.245, 0.03, 9),
          matrix: trs(lx, ly + 0.45, lz),
        });
      }
      const lm = new THREE.Mesh(bake(logs), m.log);
      lm.castShadow = lm.receiveShadow = true;
      ctx.add(lm);
    }
    ctx.add(makeBench({ x: V.x - 2.8, z: V.z + 1.8, y: hillMeshY(V.x - 2.8, V.z + 1.8), ry: -0.9, len: 1.8 }));
    ctx.add(makeMilkCrate({ x: V.x + 3.4, z: V.z - 2.4, y: hillMeshY(V.x + 3.4, V.z - 2.4), ry: 0.4, n: 2 }));
    dapple(ctx, { x: V.x, z: V.z, y, r: 1.9, spread: 3.6, n: 8, rng });
    out.petals.push({ x: V.x - 1.6, z: V.z + 2.4, y, r: 2.2, seed: 8621 });
    for (const [dx, dz, sc, sd] of [[-5.6, -1.0, 1.6, 8631], [5.8, 2.6, 1.5, 8632], [-1.0, 5.4, 1.66, 8633]]) {
      out.grove.push({
        x: V.x + dx, z: V.z + dz, y: hillMeshY(V.x + dx, V.z + dz),
        scale: sc, seed: sd, spread: 1.15, lean: 0.04, leanDir: sd % 6,
      });
    }
    out.sakura.push({ x: V.x + 4.6, z: V.z - 4.2, y: hillMeshY(V.x + 4.6, V.z - 4.2), scale: 1.22, seed: 8641, lean: 0.1, leanDir: 4.0 });
  }

  /* --- the smaller clearing on the crest, halfway along the ridge walk --- */
  {
    const V = SITES.crestGlade;
    const y = hillMeshY(V.x, V.z);
    pad(ctx, { x: V.x, z: V.z, w: 5.0, d: 4.4, y: y - 0.06, h: 0.06, mat: hillMats().pathEdge, name: 'crestGladePad' });
    const logs = [];
    for (const [dx, dz] of [[-1.5, -0.9], [-0.5, -1.5], [1.4, -0.6], [1.0, 1.2], [-1.2, 1.3]]) {
      const lx = V.x + dx, lz = V.z + dz;
      const ly = hillMeshY(lx, lz);
      logs.push({ geometry: new THREE.CylinderGeometry(0.23, 0.25, 0.42, 9), matrix: trs(lx, ly + 0.21, lz) });
      logs.push({ geometry: new THREE.CylinderGeometry(0.235, 0.235, 0.03, 9), matrix: trs(lx, ly + 0.43, lz) });
    }
    const lm = new THREE.Mesh(bake(logs), m.log);
    lm.castShadow = lm.receiveShadow = true;
    ctx.add(lm);
    // the fire ring nobody is allowed to use, with the plate that says so
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.11, 5, 12), gm.stoneDark);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(V.x, y + 0.1, V.z);
    ring.castShadow = true;
    ctx.add(ring);
    ctx.add(makeSignPost({
      x: V.x + 2.1, z: V.z + 1.8, y, ry: -0.8, h: 1.7, postMat: m.timber,
      plates: [{ map: trailNotice(0), w: 0.78, h: 0.58, y: 1.24, double: false }],
    }));
    ctx.collide(V.x + 1.94, V.z + 1.64, V.x + 2.26, V.z + 1.96, y + 1.7);
    dapple(ctx, { x: V.x, z: V.z, y, r: 1.6, spread: 2.8, n: 6, rng });
    out.bamboo.push({ x: V.x - 4.0, z: V.z + 2.6, y: hillMeshY(V.x - 4.0, V.z + 2.6), n: 9, spread: 1.8, scale: 0.96, seed: 8651 });
  }
}

/* ------------------------------------------------------------------ *
 * Builder.
 * ------------------------------------------------------------------ */

export function buildUrayama(ctx) {
  const rng = rngKit(83117);
  const out = { sakura: [], grove: [], shrubs: [], bamboo: [], petals: [] };

  buildRoad(ctx, rng);
  buildFringe(ctx, rng, out);
  buildTrailHead(ctx, rng, out);
  const flights = buildTrails(ctx, rng, out);
  buildDeck(ctx, rng, out);
  buildHokora(ctx, rng, out);
  buildGlades(ctx, rng, out);

  out.stats = { logFlights: flights };
  return out;
}
