import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { platePlate, busStopPlate, busTimetable } from '../core/textures.js';
import { box, bake, trs } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { makeKeiTruck } from './props.js';

/* ------------------------------------------------------------------ *
 * 機動車 -- the motor vehicles.
 *
 * One generator, nine bodies, the way `makeShop` is one generator and nine
 * tenants.  Everything parked anywhere in this world comes out of
 * `makeVehicle`, and a kind is a *table row* rather than a function, because
 * the class of bug this file exists to avoid is the one `NEXT.md` records
 * against the bicycle: two hand-placed copies of the same assembly, neither of
 * which joined up.
 *
 * ------------------------------------------------------------------ *
 * THE CONVENTION
 *
 * Authored **along +x with the nose at +x**, origin at ground level in the
 * centre of the footprint.  That is the vehicle convention already in the
 * world -- `makeKeiTruck`, `makeBicycle` and `makeScooter` are all built that
 * way -- so one `ry` noses everything the same direction, and a car parked in
 * a rack of bicycles points where they do.
 *
 * `ry` is therefore the direction the nose faces:
 *   0      nose +x        PI/2   nose -z
 *   PI     nose -x       -PI/2   nose +z
 *
 * ------------------------------------------------------------------ *
 * HOW A BODY IS DESCRIBED
 *
 * A vehicle in this style is read from four things and nothing else: the
 * proportion of glasshouse to body, the rake of the two screens, where the
 * wheels sit under the arches, and the mirrors.  So that is all the table
 * carries.
 *
 *   L, W, R          overall length, overall width, wheel radius
 *   axle [f, r]      the two axle centres in x -- the wheels are drawn *there*
 *   sill, waist      bottom and top of the lower body mass.  `waist` is the
 *                    beltline: the bonnet, the boot lid and the window sill are
 *                    all one height on a car drawn this way, and pretending
 *                    otherwise costs two masses and reads no better.
 *   roof             height to the roof panel
 *   cab [r, f]       where the glasshouse meets the waist, rear and front
 *   rakeF, rakeR     how far the roof edge is set *back* from each of those.
 *                    The screens are then drawn **between two points** rather
 *                    than as a box given a guessed tilt -- the mistake the
 *                    overbridge stringers made in both directions.
 *   side [x0, x1]    the extent of the side glazing.  A delivery van is glazed
 *                    over its cab and panelled behind it, and that one number
 *                    is the whole difference between a van and a minivan.
 *   extra []         additional masses: a box body, a load bed, a raised roof.
 *
 * Everything else -- arches, bumpers, lamps, plates, seams, handles, mirrors,
 * wipers -- is derived from those, so a new kind is a row and not a function.
 *
 * ------------------------------------------------------------------ *
 * COST
 *
 * Seven baked meshes per vehicle (body, deep, dark, brite, glass, and the two
 * lamp colours), plus one for the plates.  No inverted-hull outline unless the
 * caller asks: `outline.js` is for the handful of hero props the README names,
 * the screen-space ink pass already fires on every silhouette in the frame, and
 * fifty extra shells is fifty extra draw calls in a scene that is measurably
 * draw-call bound.  The one hero vehicle in the world is the kei truck at the
 * crossing, and it keeps its shell.
 * ------------------------------------------------------------------ */

/* ------------------------------ the palette ------------------------------ *
 * Everyday Japanese suburban colours only: the car park outside a clinic is
 * white, silver, beige and one dark green, and that is not a stylisation --
 * it is what is actually parked there.  Held inside the world's existing
 * range so a row of cars is not the loudest thing in any frame it is in, and
 * deliberately short of anything saturated: no reds beyond a muted wine, no
 * blues beyond a dusty slate. */
export const CAR = {
  white: 0xf2eee6,
  pearl: 0xe8e4dc,
  cream: 0xe9dfc6,
  silver: 0xc9c8cc,
  gunmetal: 0x8d8f98,
  charcoal: 0x63626e,
  skyblue: 0xc2d3de,
  slate: 0x7f93a4,
  mint: 0xc3d8cc,
  /* The two dark bodies are a shade *lighter than a real dark car*, and they
   * have to be.  The sun is at (-52, 62, 56), so a parked vehicle's tail is
   * always the face turned away from it, and the cel ramp's bottom band on a
   * true bottle green or navy takes it to within a few per cent of the ink
   * colour -- at which point the glazing, the seams and the shut lines stop
   * existing and the car is a silhouette with two red lamps in it.  Same note
   * `CLAUDE.md` records against the grove canopies at #3f6b52.  Lifted until
   * they still read as "the dark one in the row" and no further; a row of cars
   * with no dark note in it is a row of cars in a brochure. */
  forest: 0x6d8c78,
  wine: 0x8b4a4c,
  tea: 0xcbbfa6,
  mustard: 0xd9b45f,
  navy: 0x5a7093,
};

const M = {};
function mats() {
  if (M.dark) return M;
  M.dark = cel({ color: 0x36333e, bands: 2, tint: 0x4b4560 });
  M.tyre = cel({ color: 0x3b3843, bands: 2, tint: 0x4b4560 });
  M.brite = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.briteDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.glass = flat({ color: PAL.glassDark });
  M.lampF = flat({ color: 0xfff2d4 });
  M.lampR = flat({ color: 0xd8564e });
  /* One plate material for every vehicle in the world.  `flat()` does not
   * cache a mapped material, so building it per call would be a hundred
   * materials and a hundred shader programs for a hundred 0.33 m rectangles. */
  M.plate = flat({ color: 0xffffff, map: platePlate(), cache: false });
  return M;
}

const bodyMat = (c) => cel({ color: c, bands: 3, tint: 0x6a6288 });
const deepMat = (c) => cel({
  color: new THREE.Color(c).multiplyScalar(0.76).getHex(), bands: 3, tint: 0x5e5680,
});

/* ------------------------------------------------------------------ *
 * The table.
 *
 * Real dimensions, because the 軽 class is a legal box (3.40 x 1.48 x 2.00)
 * and a kei car that is not visibly smaller than the car beside it is the one
 * mistake a Japanese street cannot survive.  Everything here is within a few
 * centimetres of the thing it is.
 * ------------------------------------------------------------------ */
export const SPEC = {
  /* 軽トールワゴン -- the default car of a Japanese suburb.  Tall, short,
   * upright screen, wheels at the extreme corners, and 2.2 m of its 3.4 m is
   * roof.  If it does not look like a shed on castors it is wrong. */
  kei: {
    L: 3.40, W: 1.475, R: 0.275, axle: [1.16, -1.19],
    sill: 0.38, waist: 1.00, roof: 1.70,
    cab: [-1.60, 1.15], rakeF: 0.42, rakeR: 0.14,
    seams: [0.12, -0.80], handles: [-0.60, -1.40],
  },
  /* 軽バン -- the same box with the glass taken out of the back half and the
   * roof pushed up.  Every trade in the district runs one. */
  keivan: {
    L: 3.40, W: 1.475, R: 0.275, axle: [1.18, -1.16],
    sill: 0.38, waist: 1.02, roof: 1.88,
    cab: [-1.66, 1.55], rakeF: 0.28, rakeR: 0.06,
    side: [0.34, 1.22],
    seams: [0.30], handles: [0.04],
    rails: true,
  },
  /* コンパクトカー -- the five-door hatch that is not a kei: wider track,
   * longer bonnet, and it sits lower than everything round it. */
  hatch: {
    L: 4.05, W: 1.695, R: 0.30, axle: [1.32, -1.22],
    sill: 0.36, waist: 0.98, roof: 1.52,
    cab: [-1.72, 0.88], rakeF: 0.62, rakeR: 0.52,
    seams: [0.10, -0.85], handles: [-0.20, -1.10],
  },
  /* セダン -- the older generation's car, and the one thing on the street with
   * a boot.  Kept to one per district; nobody in a town this size buys one. */
  sedan: {
    L: 4.42, W: 1.695, R: 0.31, axle: [1.36, -1.28],
    sill: 0.36, waist: 0.97, roof: 1.44,
    cab: [-1.55, 0.95], rakeF: 0.68, rakeR: 0.62,
    seams: [0.16, -0.78], handles: [-0.14, -1.02],
  },
  /* ライトバン -- the estate on a commercial chassis: near-vertical tailgate,
   * steel wheels, no trim.  What a shop owner drives. */
  wagon: {
    L: 4.25, W: 1.690, R: 0.30, axle: [1.32, -1.20],
    sill: 0.36, waist: 0.97, roof: 1.54,
    cab: [-1.92, 0.93], rakeF: 0.60, rakeR: 0.16,
    seams: [0.14, -0.80], handles: [-0.16, -1.06],
    steelies: true,
  },
  /* ミニバン -- the school-run car.  Sliding door, roof rails, and a nose so
   * short that the whole silhouette is glasshouse. */
  minivan: {
    L: 4.34, W: 1.695, R: 0.30, axle: [1.42, -1.20],
    sill: 0.38, waist: 1.06, roof: 1.80,
    cab: [-2.00, 1.32], rakeF: 0.58, rakeR: 0.14,
    seams: [0.28], handles: [0.02, -1.30],
    slider: -0.70, rails: true,
  },
  /* 商用バン -- the one-box delivery van.  Cab-over, so the screen starts at
   * the bumper; glazed over the cab only and blank steel behind it, which is
   * the one number that separates it from the minivan above. */
  van: {
    L: 4.44, W: 1.695, R: 0.31, axle: [1.48, -1.28],
    sill: 0.40, waist: 1.12, roof: 1.98,
    cab: [-2.14, 2.02], rakeF: 0.32, rakeR: 0.06,
    side: [0.70, 1.62],
    seams: [0.60], handles: [0.34],
    rails: true,
  },
  /* 小型トラック -- the two-tonne box lorry that restocks the conbini.  Cab in
   * front, a box body standing proud of it behind, and the step between the
   * two is most of what says "lorry" at twenty metres. */
  boxtruck: {
    L: 4.80, W: 1.695, R: 0.325, axle: [1.62, -1.16],
    sill: 0.46, waist: 1.20, roof: 1.98,
    cab: [0.42, 2.16], rakeF: 0.28, rakeR: 0.10,
    side: [0.72, 1.84],
    seams: [0.62], handles: [0.30],
    box: { x0: -2.40, x1: 0.28, y0: 1.06, y1: 2.46 },
  },
  /* コミュニティバス -- the little council minibus that runs four times a day.
   * 6.3 m and 2.08 wide, so it is the largest thing that ever parks in this
   * world, and it only ever stands on the main road or at the hall. */
  minibus: {
    L: 6.30, W: 2.08, R: 0.36, axle: [2.06, -1.86],
    sill: 0.52, waist: 1.26, roof: 2.60,
    cab: [-3.04, 2.94], rakeF: 0.26, rakeR: 0.08,
    side: [-2.80, 2.55],
    seams: [1.72, -0.36], handles: [],
    doors: [1.72, -0.36], bus: true,
  },
};

/** Overall footprint of a kind, for sizing a collider. */
export function vehicleSize(kind) {
  const s = SPEC[kind];
  if (!s) return { L: 3.32, W: 1.46, H: 1.90, sill: 0.16 };            // the kei truck
  return { L: s.L, W: s.box ? s.W + 0.06 : s.W, H: s.box ? s.box.y1 : s.roof, sill: s.sill ?? 0.16 };
}

/* ------------------------------ small helpers ------------------------------ */

/**
 * A raked panel drawn **between two points of the side profile**, extruded
 * across `w` in z.
 *
 * Every screen, every pillar and the bus's skirt use this, and they use it for
 * the reason `CLAUDE.md` gives against the overbridge stringers: a box along X
 * turned by `rz` about Z sends its +x end *up*, so a windscreen written as
 * "a box tilted by the rake" is inverted half the time and nobody notices until
 * the roof is longer than the floor.  Deriving the angle from the two ends it
 * actually spans makes that impossible.
 */
function panel(arr, ax, ay, bx, by, w, t) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return;
  arr.push({
    geometry: new THREE.BoxGeometry(len, t, w),
    matrix: trs((ax + bx) / 2, (ay + by) / 2, 0, 0, 0, Math.atan2(dy, dx)),
  });
}

function emit(g, parts, matFor, o = {}) {
  const noCast = o.noCast ?? [];
  const out = {};
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = !noCast.includes(key);
    mesh.receiveShadow = true;
    g.add(mesh);
    out[key] = mesh;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The generator.
 * ------------------------------------------------------------------ */

/**
 * One parked vehicle.
 *
 * @param o.kind    a key of `SPEC`, or 'keitruck' for the flatbed in `props.js`
 * @param o.color   a `CAR` value.  White, silver and beige are three quarters
 *                  of every Japanese car park and the mix should say so.
 * @param o.x,z,y   flat position; `y` is the ground the tyres stand on
 * @param o.ry      the direction the nose faces (see the convention above)
 * @param o.hero    inverted-hull outline as well as the ink pass.  Reserved
 *                  for anything the player stands within three metres of.
 */
export function makeVehicle(o = {}) {
  if (o.kind === 'keitruck') {
    return makeKeiTruck({
      x: o.x, y: o.y, z: o.z, ry: o.ry,
      color: o.color, load: o.load, hero: o.hero,
    });
  }
  const m = mats();
  const s = SPEC[o.kind] ?? SPEC.kei;
  const g = new THREE.Group();

  const col = o.color ?? CAR.white;
  const mBody = bodyMat(col);
  const mDeep = deepMat(col);

  const HW = s.W / 2;
  /* Track is set so the *outside* of the tyre lands within a centimetre of the
   * flank.  It was 0.13 m inboard of that to begin with, and at eight metres
   * the result is a car standing on castors: what you read from the side is
   * the arch, and a wheel recessed behind one is a dark hole rather than a
   * wheel.  Everything on a Japanese kei is at the extreme corner. */
  const TRACK = s.W - 0.17;
  const TW = s.R < 0.3 ? 0.165 : 0.195;     // tyre width
  /* The cabin is drawn 0.14 m narrower than the body.  That step is the
   * shoulder line, and it is the difference between a car and a loaf: with the
   * glasshouse flush to the flanks there is no horizontal ink line anywhere
   * above the waist and the whole thing reads as one extruded rectangle. */
  const CW = s.W - 0.14;
  const roofFront = s.cab[1] - s.rakeF;
  const roofRear = s.cab[0] + s.rakeR;
  const side = s.side ?? [roofRear, roofFront];

  const parts = { body: [], deep: [], dark: [], brite: [], glass: [], lampF: [], lampR: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* ------------------------------ the lower body ------------------------------
   * One mass from nose to tail at the beltline, with the valance tucked under
   * it.  The step between the two is what gives the flank its one horizontal
   * ink line, and without it a car in this style is a single slab. */
  push('body', new THREE.BoxGeometry(s.L, s.waist - s.sill, s.W),
    trs(0, (s.sill + s.waist) / 2, 0));
  push('deep', new THREE.BoxGeometry(s.L - 0.16, s.sill - 0.10, s.W - 0.07),
    trs(0, (s.sill + 0.10) / 2 + 0.05, 0));

  /* The bonnet's leading edge and the boot's trailing one, as raked panels off
   * the top of that mass.  Without them both ends of the car are a vertical
   * wall the full width and the full depth of the body, and the ink pass draws
   * exactly that: a brick.  Only where there *is* a bonnet -- a cab-over van's
   * front genuinely is a vertical wall, and giving it a slope would be the
   * same mistake in the other direction. */
  if (s.L / 2 - s.cab[1] > 0.55) {
    panel(parts.body, s.L / 2 - 0.01, s.waist - 0.15, s.L / 2 - 0.46, s.waist + 0.01, s.W - 0.05, 0.13);
  }
  if (s.cab[0] + s.L / 2 > 0.45) {
    panel(parts.body, -s.L / 2 + 0.01, s.waist - 0.10, -s.L / 2 + 0.30, s.waist + 0.01, s.W - 0.05, 0.11);
  }

  /* -------------------------------- the cabin --------------------------------
   * A solid core between the two roof edges, then the screens as raked wedges
   * off each end of it, then the glazing laid *on* those faces.  Depth is built
   * outward, never inward: `CLAUDE.md`'s note about the 格子 screens on the
   * onsen street is exactly this shape of mistake -- a window written 40 mm
   * behind a solid box's face is simply inside the render. */
  push('body', new THREE.BoxGeometry(roofFront - roofRear, s.roof - s.waist, CW),
    trs((roofFront + roofRear) / 2, (s.waist + s.roof) / 2, 0));
  // the windscreen and backlight wedges, in body colour: the glass goes on top
  panel(parts.body, s.cab[1], s.waist, roofFront, s.roof, CW, 0.11);
  panel(parts.body, s.cab[0], s.waist, roofRear, s.roof, CW, 0.11);
  // roof cap and drip rails -- the crisp top line, and the shadow under it
  push('body', new THREE.BoxGeometry(roofFront - roofRear + 0.05, 0.05, CW + 0.03),
    trs((roofFront + roofRear) / 2, s.roof - 0.015, 0));
  for (const t of [-1, 1]) {
    push('deep', new THREE.BoxGeometry(roofFront - roofRear, 0.035, 0.035),
      trs((roofFront + roofRear) / 2, s.roof - 0.05, t * (CW / 2 + 0.005)));
  }

  /* ------------------------------- the glazing -------------------------------
   * Windscreen and backlight are drawn along the same two points as the wedge
   * they sit on, shortened at both ends so the body reads as a frame round
   * them.  A screen flush to the corners is a windowed box, not a car. */
  {
    const cx = (roofFront + roofRear) / 2, cy = (s.waist + s.roof) / 2;
    /* Laid **on** the wedge, not along its centreline.  Written the obvious way
     * -- same two points, thinner box -- the screen ends up entirely *inside*
     * the body wedge and every car in the world comes out with a body-coloured
     * windscreen.  That is the same failure as the onsen street's 格子 panels
     * and the library's window plates: depth is built outward. */
    const lay = (ax, ay, bx, by, k) => {
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len;
      // the outward normal is whichever of the two points away from the cabin
      let nx = uy, ny = -ux;
      if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
      const o = 0.062;
      panel(parts.glass,
        ax + ux * k + nx * o, ay + uy * k + ny * o,
        bx - ux * k + nx * o, by - uy * k + ny * o, CW - 0.15, 0.055);
    };
    lay(s.cab[1], s.waist + 0.05, roofFront, s.roof - 0.045, 0.05);
    lay(s.cab[0], s.waist + 0.05, roofRear, s.roof - 0.045, 0.05);
  }
  /* Side glass: one panel a side, laid 20 mm proud of the cabin core so it is
   * *on* the face and not behind it, with the B-pillar drawn over the top of
   * it in body colour.  `side` is what makes a van a van. */
  {
    const y0 = s.waist + 0.035, y1 = s.roof - 0.075;
    const x0 = Math.max(side[0], roofRear) + 0.04;
    const x1 = Math.min(side[1], roofFront) - 0.04;
    if (x1 > x0 + 0.12) {
      for (const t of [-1, 1]) {
        push('glass', new THREE.BoxGeometry(x1 - x0, y1 - y0, 0.05),
          trs((x0 + x1) / 2, (y0 + y1) / 2, t * (CW / 2 - 0.006)));
      }
      for (const px of s.seams ?? []) {
        if (px < x0 + 0.06 || px > x1 - 0.06) continue;
        for (const t of [-1, 1]) {
          push('body', new THREE.BoxGeometry(0.075, y1 - y0 + 0.02, 0.05),
            trs(px, (y0 + y1) / 2, t * (CW / 2 - 0.002)));
        }
      }
    }
  }

  /* --------------------------------- wheels ---------------------------------
   * Tyre, then a rim disc standing 10 mm proud of the sidewall, then the nut
   * circle.  The scooter records why: a plain dark cylinder at eight metres is
   * a dot rather than a wheel, and a rim drawn *inside* a solid tyre is not
   * drawn at all. */
  for (const ax of s.axle) {
    for (const t of [-1, 1]) {
      const z = t * (TRACK / 2);
      push('dark', new THREE.CylinderGeometry(s.R, s.R, TW, 14), trs(ax, s.R, z, Math.PI / 2));
      push(s.steelies ? 'deep' : 'brite',
        new THREE.CylinderGeometry(s.R * 0.62, s.R * 0.62, TW + 0.02, 12),
        trs(ax, s.R, z, Math.PI / 2));
      push('dark', new THREE.CylinderGeometry(s.R * 0.22, s.R * 0.22, TW + 0.04, 8),
        trs(ax, s.R, z, Math.PI / 2));
      /* The arch is two pieces and it has to be, because it is doing two jobs.
       * The *well* is a dark arc set inboard of the flank: it is the shadow
       * inside the wheel opening, and without it the tyre is a dark shape on a
       * pale body with nothing to explain the hole it stands in.  The *lip* is
       * a thin flare at the flank itself -- the one curve on the whole vehicle,
       * and what stops a parked car reading as a crate.
       *
       * A single fat torus does neither: it reads as a pale disc bigger than
       * the wheel it is supposed to frame. */
      push('dark', new THREE.TorusGeometry(s.R + 0.015, 0.055, 4, 12, Math.PI),
        trs(ax, s.R + 0.01, t * (HW - 0.095)));
      push('deep', new THREE.TorusGeometry(s.R + 0.055, 0.030, 4, 14, Math.PI),
        trs(ax, s.R + 0.01, t * (HW + 0.008), 0, 0, 0, 1, 1, 1.3));
    }
  }

  /* -------------------------- bumpers, valance, grille --------------------------
   * Body-coloured bumpers with a dark rub strip, because that is what a car
   * built after 1995 has -- and a black bumper on a white kei reads as damage
   * at this tonal range. */
  /* Lamp height is taken off the *sill* and not off the beltline.  A headlamp
   * sits about 0.7 m up whatever the vehicle is, so hanging it a fixed distance
   * under the waist puts the minibus's lamps at chest height. */
  const lampY = Math.min(s.waist - 0.17, s.sill + 0.36);
  for (const [sx, isFront] of [[1, true], [-1, false]]) {
    const x = sx * (s.L / 2);
    push('body', new THREE.BoxGeometry(0.10, 0.36, s.W - 0.02), trs(x + sx * 0.04, s.sill + 0.12, 0));
    // the rub strip, not a bumper bar: at `W - 0.20` it read as a black band
    // the full width of the car, which on a pale body is a hole
    push('dark', new THREE.BoxGeometry(0.05, 0.07, s.W - 0.46), trs(x + sx * 0.08, s.sill + 0.04, 0));
    // the lamps, hard into the corners so they carry the width
    const lz = s.W / 2 - 0.20;
    for (const t of [-1, 1]) {
      if (isFront) {
        push('lampF', new THREE.BoxGeometry(0.05, 0.16, 0.32), trs(x + 0.015, lampY, t * lz));
      } else {
        /* The tail lamp is the only saturated thing on a parked car, so it is
         * the one part that has to be *small*.  At 0.26 x 0.20 in a flat red it
         * came out as two poster-paint rectangles that were the loudest note in
         * any frame with a car park in it -- which is the same failure as the
         * first reeds and the first crows: a prop read at the wrong scale.
         * Smaller, deeper, and split by the housing bar that every real cluster
         * has, so it reads as a lamp rather than as a colour. */
        push('lampR', new THREE.BoxGeometry(0.05, 0.21, 0.155), trs(x - 0.015, lampY + 0.05, t * lz));
        push('dark', new THREE.BoxGeometry(0.055, 0.028, 0.165), trs(x - 0.02, lampY + 0.05, t * lz));
        push('lampF', new THREE.BoxGeometry(0.05, 0.055, 0.075), trs(x - 0.015, lampY - 0.10, t * (lz - 0.02)));
      }
    }
    if (isFront) {
      push('dark', new THREE.BoxGeometry(0.04, 0.15, s.W - 0.66), trs(x + 0.02, lampY + 0.01, 0));
      push('dark', new THREE.BoxGeometry(0.05, 0.13, s.W - 0.50), trs(x + 0.05, s.sill + 0.16, 0));
    } else {
      /* The tailgate: its shut line across the back panel and the grab strip
       * under the glass.  A parked car is seen from behind more than from any
       * other angle -- it is the view from the pavement it is parked against --
       * and without these two the whole rear is one blank panel between two
       * lamps. */
      push('dark', new THREE.BoxGeometry(0.03, 0.022, s.W - 0.30), trs(x - 0.025, s.sill + 0.30, 0));
      push('brite', new THREE.BoxGeometry(0.05, 0.045, 0.34), trs(x - 0.03, s.waist - 0.13, s.W * 0.14));
    }
  }
  // exhaust tail pipe, out of the left rear corner
  push('brite', new THREE.CylinderGeometry(0.033, 0.033, 0.14, 8),
    trs(-s.L / 2 - 0.02, s.sill - 0.05, -(s.W / 2 - 0.32), 0, 0, Math.PI / 2));

  /* --------------------------------- plates ---------------------------------
   * 330 x 165 front and rear, which is the real size, and standing 12 mm off
   * the bumper so it is not a coin toss with it in the depth buffer -- the
   * bathhouse noren's lesson, at a tenth of the scale. */
  {
    const pg = [];
    for (const sx of [1, -1]) {
      pg.push({
        geometry: new THREE.PlaneGeometry(0.33, 0.165),
        matrix: trs(sx * (s.L / 2 + 0.10), s.sill + 0.13, sx * 0.10, 0, sx * Math.PI / 2, 0),
      });
    }
    const pm = new THREE.Mesh(bake(pg), m.plate);
    pm.castShadow = false;
    g.add(pm);
  }

  /* ------------------------------ flank details ------------------------------
   * Door seams, handles, the sliding-door rail and the rocker strip.  All of it
   * lives on the two flanks, which is the only part of a parked car anybody
   * ever sees -- it is against a wall or against a kerb, never in plan. */
  for (const t of [-1, 1]) {
    const z = t * (HW + 0.004);
    for (const px of s.seams ?? []) {
      push('dark', new THREE.BoxGeometry(0.022, s.waist - s.sill - 0.10, 0.02),
        trs(px, (s.sill + s.waist) / 2 + 0.02, z));
    }
    for (const px of s.handles ?? []) {
      push('brite', new THREE.BoxGeometry(0.15, 0.045, 0.035), trs(px, s.waist - 0.15, z + t * 0.012));
    }
    if (s.slider !== undefined) {
      push('deep', new THREE.BoxGeometry(1.10, 0.045, 0.03), trs(s.slider, s.waist - 0.045, z + t * 0.008));
    }
    push('deep', new THREE.BoxGeometry(s.L - 0.5, 0.06, 0.03), trs(0, s.sill + 0.03, z));
  }

  /* --------------------------------- mirrors ---------------------------------
   * On stalks off the A-pillar foot, standing well clear of the body: the door
   * mirror is the only thing on a car that breaks its plan silhouette, and a
   * parked car without them reads as a bar of soap. */
  {
    const mx = s.cab[1] - 0.14;
    const my = s.waist + 0.14;
    for (const t of [-1, 1]) {
      const z0 = t * (HW - 0.02), z1 = t * (HW + 0.17);
      push('deep', new THREE.BoxGeometry(0.07, 0.05, 0.19), trs(mx, my, (z0 + z1) / 2));
      push('deep', new THREE.BoxGeometry(0.10, 0.16, 0.07), trs(mx - 0.01, my + 0.03, z1));
      push('brite', new THREE.BoxGeometry(0.015, 0.12, 0.05), trs(mx - 0.06, my + 0.03, z1));
    }
  }

  /* ----------------------------- wipers and rails ----------------------------- */
  {
    const wy = s.waist + 0.035;
    for (const t of [-1, 1]) {
      push('dark', new THREE.BoxGeometry(0.34, 0.022, 0.022),
        trs(s.cab[1] - 0.20, wy, t * 0.28, 0, 0, 0.12));
    }
  }
  if (s.rails) {
    for (const t of [-1, 1]) {
      push('deep', new THREE.BoxGeometry(roofFront - roofRear - 0.25, 0.05, 0.05),
        trs((roofFront + roofRear) / 2, s.roof + 0.045, t * (CW / 2 - 0.16)));
    }
  }

  /* ------------------------------- the minibus -------------------------------
   * Two extra things and they are the whole difference: a folding door with its
   * own glass, and the destination box over the screen.  Everything else the
   * table already handles by being 6.3 m long. */
  if (s.bus) {
    for (const dx of s.doors ?? []) {
      push('dark', new THREE.BoxGeometry(0.9, s.waist - s.sill - 0.06, 0.03),
        trs(dx, (s.sill + s.waist) / 2 + 0.02, HW + 0.008));
      push('glass', new THREE.BoxGeometry(0.82, 0.52, 0.04),
        trs(dx, s.waist - 0.26, HW + 0.014));
    }
    push('dark', new THREE.BoxGeometry(0.10, 0.24, 1.10), trs(s.cab[1] - 0.18, s.roof - 0.22, 0));
    push('lampF', new THREE.BoxGeometry(0.03, 0.16, 0.96), trs(s.cab[1] - 0.12, s.roof - 0.22, 0));
    // the skirt: a bus's floor is high and the panel below it is what says so
    push('deep', new THREE.BoxGeometry(s.L - 0.4, 0.20, s.W + 0.01), trs(0, s.sill + 0.02, 0));
  }

  /* The box lorry's body: the mass itself, then the corrugation, the roll
   * shutter at the back and the cant rail round the top.  It stands 30 mm
   * proud of the cab on both flanks, which is what a body built by a different
   * factory to the chassis actually does and reads at any distance. */
  if (s.box) {
    const b = s.box;
    push('body', new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, s.W + 0.06),
      trs((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0));
    for (let i = 0; i < 7; i++) {
      const x = b.x0 + 0.2 + i * ((b.x1 - b.x0 - 0.4) / 6);
      for (const t of [-1, 1]) {
        push('deep', new THREE.BoxGeometry(0.05, b.y1 - b.y0 - 0.14, 0.03),
          trs(x, (b.y0 + b.y1) / 2, t * (s.W / 2 + 0.045)));
      }
    }
    // the roller shutter across the back, its pull rail, and the cant rail
    push('deep', new THREE.BoxGeometry(0.06, b.y1 - b.y0 - 0.12, s.W - 0.04),
      trs(b.x0 - 0.03, (b.y0 + b.y1) / 2, 0));
    push('dark', new THREE.BoxGeometry(0.04, 0.10, s.W - 0.22), trs(b.x0 - 0.07, b.y0 + 0.14, 0));
    push('deep', new THREE.BoxGeometry(b.x1 - b.x0 + 0.06, 0.07, s.W + 0.12),
      trs((b.x0 + b.x1) / 2, b.y1 + 0.02, 0));
  }

  emit(g, parts, {
    body: mBody, deep: mDeep, dark: m.dark, brite: m.brite,
    glass: m.glass, lampF: m.lampF, lampR: m.lampR,
  }, { noCast: ['glass', 'lampF', 'lampR'] });

  if (o.hero) {
    const bodyMesh = g.children.find((c) => c.material === mBody);
    if (bodyMesh) hullOutline(bodyMesh, { thickness: 0.0034 });
  }

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  // a couple of degrees of nose-in-the-kerb, so a row is never mechanical
  if (o.skew) g.rotation.y += o.skew;
  g.name = 'vehicle_' + (o.kind ?? 'kei');
  g.userData.vehicle = { kind: o.kind, ...vehicleSize(o.kind) };
  return g;
}

/* ------------------------------------------------------------------ *
 * Placing one.
 * ------------------------------------------------------------------ */

/**
 * Add a vehicle and register the collider that goes with it.
 *
 * Doing this in one call is not a convenience.  `CLAUDE.md` records the same
 * bug four separate times -- a notice board across an alley, two garden walls
 * in a lane, a grove tree in a carriageway, a pole that sealed a squeeze in
 * another district -- and every one of them is *the collider is bigger than
 * the object*: the player's 0.34 m radius is added to every side.  A car is
 * 4.4 x 1.7, so it takes 5.1 x 2.4 out of whatever it stands on, and fifty of
 * them placed by hand with an eyeballed box is fifty chances to seal a route.
 *
 * The AABB of the rotated rectangle is derived here, once.
 *
 * `top` is deliberately the real roof height: a collider whose top is within
 * one step of the feet is skipped by `_resolve`, and a car is not a kerb.
 */
export function parkVehicle(ctx, o) {
  const g = makeVehicle(o);
  ctx.add(g);
  const { L, W, H, sill } = vehicleSize(o.kind);
  const ry = (o.ry ?? 0) + (o.skew ?? 0);
  const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
  const hw = (c * L + s * W) / 2;
  const hd = (s * L + c * W) / 2;
  // Flush to the sheet metal. The query already Minkowski-sums the craft;
  // insetting for a walker's radius made every car a hole you could fly into.
  // skipFit so a stair or carport drawn above the bay cannot grow this box
  // up through that air. The 公園前 kei under the 跨線橋 was a 4.4 m wall
  // up the last five treads for exactly that reason. Bottom at the sill so
  // the undercroft stays a knife-edge line.
  ctx.collide(o.x - hw, o.z - hd, o.x + hw, o.z + hd,
    (o.y ?? 0) + H - 0.15, (o.y ?? 0) + (sill ?? 0.16), true);
  return g;
}

/* ------------------------------------------------------------------ *
 * The ground a car stands on.
 * ------------------------------------------------------------------ */

/**
 * A parking bay marked out on an existing surface: two side lines, a head
 * line, and the tyre track worn down the middle of it.
 *
 * Authored with the bay running along **z** and the car nosing in from +z,
 * which is `makeWheelStops`' convention, so the two are placed with the same
 * numbers.  `ry` turns the pair together.
 *
 * Nothing calls this at the moment: every vehicle in the world stands on
 * parking that a district module had already marked out, which is the point.
 * It is here for the first one that does not.
 */
export function bayPaint(ctx, o) {
  const w = o.w ?? 2.4, d = o.d ?? 5.0;
  const mat = o.mat ?? flat({ color: PAL.lineWhite });
  const parts = [];
  const t = o.t ?? 0.10;
  for (const sx of [-1, 1]) {
    parts.push({
      geometry: new THREE.BoxGeometry(t, 0.02, d),
      matrix: trs(sx * (w / 2), 0, 0),
    });
  }
  if (o.head !== false) {
    parts.push({ geometry: new THREE.BoxGeometry(w + t, 0.02, t), matrix: trs(0, 0, -d / 2) });
  }
  const mesh = new THREE.Mesh(bake(parts), mat);
  mesh.position.set(o.x, (o.y ?? 0) + 0.022, o.z);
  mesh.rotation.y = o.ry ?? 0;
  mesh.userData.noOutline = true;
  ctx.add(mesh);
  return mesh;
}

/**
 * 黄色い停止線 -- the yellow no-waiting line painted along a kerb.
 *
 * A solid single line, which in Japan is 駐停車禁止; it is drawn 0.15 m off the
 * kerb face and only ever where a car would otherwise obstruct something --
 * the crossing approach, a gate, a corner.  It is also the cheapest way to say
 * "the cars that *are* parked are parked where they may be".
 */
export function kerbLine(ctx, o) {
  const len = Math.abs(o.to - o.from);
  const mesh = box(
    o.axis === 'x' ? len : 0.11, 0.02, o.axis === 'x' ? 0.11 : len,
    o.mat ?? flat({ color: PAL.lineYellow }),
    o.axis === 'x' ? (o.from + o.to) / 2 : o.at,
    (o.y ?? 0) + 0.022,
    o.axis === 'x' ? o.at : (o.from + o.to) / 2
  );
  mesh.userData.noOutline = true;
  ctx.add(mesh);
  return mesh;
}

/**
 * 視線誘導標 -- the slim reflective delineator post.
 *
 * The white-and-orange plastic wand on the edge of a narrow lane, bent by
 * something that misjudged the corner.  0.8 m tall and 60 mm across, so it is
 * under the 0.3 m rule `CLAUDE.md` sets for a prop reading as a dot -- which
 * is why it gets its two reflector bands: at eight metres they are the whole
 * object, and a plain white stick is a scratch on the frame.
 */
export function makeDelineator(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const H = o.h ?? 0.80;
  const parts = { pale: [], band: [], base: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
  push('pale', new THREE.CylinderGeometry(0.032, 0.036, H, 8), trs(0, H / 2, 0));
  push('base', new THREE.CylinderGeometry(0.075, 0.095, 0.06, 10), trs(0, 0.03, 0));
  for (const y of [H - 0.10, H - 0.26]) {
    push('band', new THREE.CylinderGeometry(0.039, 0.039, 0.06, 8), trs(0, y, 0));
  }
  emit(g, parts, {
    pale: cel({ color: 0xf0eee8, bands: 2, tint: 0x7d74a0 }),
    band: cel({ color: PAL.orange, bands: 2, tint: 0x8f6050 }),
    base: m.briteDark,
  });
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.z = o.lean ?? 0;
  g.rotation.y = o.ry ?? 0;
  return g;
}

/**
 * バス停 -- the community bus stop: post, round head, timetable case, base.
 *
 * The head is a **box**, not a disc, and it is deliberately two-sided with one
 * map: `BoxGeometry` builds each face with its own `udir` and already reverses
 * it on the negative face of every axis, so the same plate reads correctly from
 * both approaches.  `mirrored()` here is what would produce mirror writing --
 * the trap this project had on every two-sided sign in the world.
 *
 * `ry` is the direction the *face* looks, i.e. across the footway at the road.
 *
 * `variant` is an index into `busStopPlate`, so a route with two stops on it
 * gets two names rather than the same name twice.
 */
export function makeBusStop(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const H = o.h ?? 2.45;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, H, 8), m.briteDark);
  post.position.y = H / 2;
  post.castShadow = true;
  g.add(post);
  g.add(box(0.24, 0.09, 0.24, m.concreteMid, 0, 0.045, 0));

  const side = cel({ color: 0xe6e3e8, bands: 3, tint: 0x6f6790 });
  const plateMap = busStopPlate(o.variant ?? 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.06), [
    side, side, side, side,
    flat({ color: 0xffffff, map: plateMap, cache: false }),
    flat({ color: 0xffffff, map: plateMap, cache: false }),
  ]);
  head.position.set(0, H - 0.30, 0);
  head.castShadow = true;
  g.add(head);

  const caseSide = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  /* The timetable faces the *footway*, not the road: it is read by somebody
   * standing at the stop, and the head above it is two-sided so the stop is
   * still legible from a moving vehicle.  Hung off the back of the post, which
   * is why it needs its own half turn. */
  const tt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.51, 0.05), [
    caseSide, caseSide, caseSide, caseSide,
    flat({ color: 0xffffff, map: busTimetable(), cache: false }), caseSide,
  ]);
  tt.position.set(0, H - 0.98, -0.03);
  tt.rotation.y = Math.PI;
  tt.castShadow = true;
  g.add(tt);

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/**
 * Tyre tracks and a dropped-oil patch.
 *
 * The one piece of wear this round adds, and it is deliberately faint: the
 * brief for the whole world is a *clean* town, so what marks a bay that has
 * been used is two pale bands and one small dark stain, not grime.  Out of the
 * depth buffer, like every other decal here, or the ink pass speckles it.
 */
export function tyreMarks(ctx, spots, o = {}) {
  if (!spots.length) return null;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = flat({
    color: o.color ?? 0x6e6880, transparent: true, opacity: o.opacity ?? 0.12,
    depthWrite: false, cache: false,
  });
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  const d = new THREE.Object3D();
  spots.forEach((sp, i) => {
    d.position.set(sp.x, (sp.y ?? 0) + 0.025, sp.z);
    d.rotation.set(0, sp.ry ?? 0, 0);
    d.scale.set(sp.w ?? 0.22, 1, sp.d ?? 2.4);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  });
  inst.userData.noOutline = true;
  inst.renderOrder = 1;
  ctx.add(inst);
  return inst;
}
