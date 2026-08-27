import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  libraryName, libraryHours, libraryInterior, curtainTex, poster, clubPoster,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, steps, groundMats } from './ground.js';
import {
  makeBench, makeBikeRack, makeNoticeBoard, makePlanter, makeFlowerBed,
  makeReturnPost, makeUmbrellaStand, makeDoormat, makeBins, makeGuideBoard,
  makePhoneBooth, makeRecycleBox, makeGuardrail, makeLoosePaper,
} from './props.js';

/* ------------------------------------------------------------------ *
 * ひばり台図書館 -- the community library, and the street corner beside it.
 *
 * The district had shops, a school, a shrine and housing, and no *quiet*
 * public building.  A branch library is the right one: it is the only kind of
 * civic building that is deliberately unassertive, so it does something no
 * other volume here can -- it gives the north end of the street a calm,
 * horizontal, well-kept mass to sit against, between the housing above and
 * the shopping street below.
 *
 * Three things are doing the work, and all three are proportion rather than
 * decoration:
 *
 *  - **The frontage is read in three parts**: a narrow solid pier, a glazed
 *    entrance bay set back 0.8 m, and a run of three tall windows.  A public
 *    building is legible from the *hierarchy* of its openings; give it one
 *    uniform window rhythm and it becomes a small office block.
 *  - **Everything at the top has a thickness.**  A 0.28 m cornice standing
 *    0.25 m proud, a 0.16 m string course at first-floor level, a 0.45 m
 *    parapet with its own cap.  The single fastest way to make a rendered box
 *    read as a real building is to stop its walls with something that has a
 *    depth you can see the shadow of.
 *  - **The entrance is a sequence**: forecourt, ramp *and* steps, a raised
 *    terrace, a canopy over it, then the doors.  That sequence is most of what
 *    says "come in, this is for you" without a single figure in it.
 *
 * The interior is glimpsed, not built -- but the entrance bay is hollow for
 * two metres behind its glazing, with real shelving, a real counter and a real
 * ceiling, because it is the one part of the building the player stands two
 * metres from.  Everything else is painted on the back of the glass.
 *
 * The corner cluster at the west end is a separate beat: the phone box, the
 * district guide board and a recycling box, on the triangle of paving where
 * the north lane meets the main road.  See the note above it.
 * ------------------------------------------------------------------ */

/* the building */
const X0 = 11.0;
const X1 = 20.6;
const Z0 = 50.6;                 // frontage line, facing -z
const Z1 = 57.6;
const H1 = 3.4;                  // ground storey
const H2 = 2.9;                  // upper storey
const H = H1 + H2;
const REC = 0.8;                 // depth of the entrance recess
const BAY0 = 12.0;               // the entrance bay
const BAY1 = 16.2;
const RISE = 0.30;               // floor level above the forecourt paving
const VOID = 2.2;                // how far the entrance bay is hollow

/* the forecourt, and the corner */
const F_X0 = 9.6;
const F_X1 = 22.2;
const F_Z0 = 46.9;
const F_Z1 = 50.7;

const M = {};
function mats() {
  if (M.wall) return M;
  M.wall = cel({ color: 0xf6f2e8, bands: 3, tint: 0x6f6790 });
  M.wallAlt = cel({ color: 0xe8e6de, bands: 3, tint: 0x6f6790 });
  M.band = cel({ color: 0xd6d2ca, bands: 3, tint: 0x6a6288 });
  M.wood = cel({ color: 0xd2bb98, bands: 3, tint: 0x6f5680 });
  M.woodDark = cel({ color: 0xa88a64, bands: 3, tint: 0x5c5680 });
  M.roof = cel({ color: PAL.roofSlate, bands: 3, tint: 0x514b70 });
  M.trim = cel({ color: PAL.trim, bands: 3, tint: 0x5c5680 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.glass = flat({ color: PAL.glass, transparent: true, opacity: 0.24, depthWrite: false, cache: false });
  return M;
}

export function buildLibrary(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(5501);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  const Y = groundY((Z0 + Z1) / 2);
  const FY = Y + 0.07;             // the forecourt's paved surface
  const FL = FY + RISE;            // the library floor

  /* ------------------------------- the forecourt ------------------------------- *
   * Paving out to the north lane, with the two existing cherries left standing
   * in it.  A public forecourt reads as public because it is *swept* and has a
   * kerb: the low planting bed along its west side is what keeps it from being
   * an apron of concrete. */
  pad(ctx, {
    x: (F_X0 + F_X1) / 2, z: (F_Z0 + F_Z1) / 2, w: F_X1 - F_X0, d: F_Z1 - F_Z0,
    y: Y, h: 0.07, mat: gm.concrete, name: 'libraryForecourt',
  });
  // a warmer band along the frontage, so the paving has a grain to it
  pad(ctx, {
    x: (F_X0 + F_X1) / 2, z: F_Z1 - 0.55, w: F_X1 - F_X0, d: 1.1,
    y: Y + 0.005, h: 0.07, mat: gm.stoneWarm, name: 'libraryApron',
  });

  buildBuilding(ctx, Y, FL);
  buildEntrance(ctx, Y, FY, FL);
  dressForecourt(ctx, Y, FY, rng, shrubs, petals);
  buildCorner(ctx, rng);

  /* --------------------------------- planting --------------------------------- *
   * Two shade trees in the forecourt already exist as street cherries; what the
   * building itself wants is one dark green mass off each end, to stop the
   * cornice line running out into sky.  Neither is on the entrance axis -- the
   * one lesson the school forecourt and the overbridge deck both taught. */
  grove.push({ x: 22.9, z: 53.4, y: groundY(53.4), scale: 1.75, seed: 5510, spread: 1.15 });
  grove.push({ x: 8.6, z: 53.8, y: groundY(53.8), scale: 1.6, seed: 5511, spread: 1.1 });
  /* Slid north out of ひばり駐車場, from (24.0, 48.6) -- it stood in the first
   * bay, the same way `shotengai.js`'s grove stood in the second.  Both date
   * from before the car park moved onto this ground, and both are now on the
   * planting strip along its back.  Moved with the motor vehicles. */
  sakura.push({ x: 25.3, z: 53.2, y: groundY(53.2), scale: 1.2, seed: 5512, lean: 0.1, leanDir: 2.2 });
  for (let i = 0; i < 3; i++) {
    shrubs.push({ x: 8.2 + i * 1.5, z: 49.6, y: Y, r: 0.5, count: 3, spread: 1.2, seed: 5520 + i });
  }
  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * The building.
 * ------------------------------------------------------------------ */

function buildBuilding(ctx, Y, FL) {
  const m = mats();
  const rng = rngKit(5502);
  const g = new THREE.Group();
  g.name = 'library';
  ctx.add(g);

  const W = X1 - X0;
  const D = Z1 - Z0;
  const cx = (X0 + X1) / 2;
  const cz = (Z0 + Z1) / 2;
  const parts = {
    wall: [], alt: [], band: [], wood: [], woodDark: [],
    roof: [], trim: [], metal: [], metalDark: [],
  };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* --------------------------------- the mass --------------------------------- *
   * Three volumes on the ground floor, because the entrance bay is set back and
   * hollow behind its glazing.  The upper storey spans the lot, carried over the
   * recess on a header, which is what puts the entrance in shadow. */
  push('band', new THREE.BoxGeometry(W + 0.24, 0.34, D + 0.24), trs(cx, Y + 0.17, cz));
  // west pier and east run, full depth
  push('wall', new THREE.BoxGeometry(BAY0 - X0, H1, D), trs((X0 + BAY0) / 2, Y + H1 / 2, cz));
  push('wall', new THREE.BoxGeometry(X1 - BAY1, H1, D), trs((BAY1 + X1) / 2, Y + H1 / 2, cz));
  // the entrance bay: side and back walls only, so the vestibule is real
  const BZ = Z0 + REC;                       // the glazing line
  const VZ = BZ + VOID;                      // the back of the void
  push('wall', new THREE.BoxGeometry(BAY1 - BAY0, H1, Z1 - VZ), trs((BAY0 + BAY1) / 2, Y + H1 / 2, (VZ + Z1) / 2));
  for (const [xa, xb] of [[BAY0, BAY0 + 0.3], [BAY1 - 0.3, BAY1]]) {
    push('wall', new THREE.BoxGeometry(xb - xa, H1, VOID), trs((xa + xb) / 2, Y + H1 / 2, (BZ + VZ) / 2));
  }
  /* The header over the glazing, and the soffit of the recess.
   *
   * Both in pale wood rather than render, and that is a lighting decision, not
   * a finish.  The sun sits at (-52, 62, 56), so this frontage faces directly
   * away from it and everything on it is lit by the cool bounce alone -- which
   * is right for a reading room and wrong for the one thing that has to say
   * "come in".  A warm-toned surround, a warm soffit and a lit name box give the
   * entrance the only three warm surfaces on the elevation, so the porch reads
   * as the bright thing in a cool wall instead of as a hole in it. */
  push('wood', new THREE.BoxGeometry(BAY1 - BAY0, H1 - 2.92, REC + VOID),
    trs((BAY0 + BAY1) / 2, Y + H1 - (H1 - 2.92) / 2, (Z0 + VZ) / 2));
  push('wood', new THREE.BoxGeometry(BAY1 - BAY0 + 0.02, 0.08, REC),
    trs((BAY0 + BAY1) / 2, Y + 2.88, Z0 + REC / 2));
  // and the reveals down both jambs of the recess
  for (const [xa, xb] of [[BAY0, BAY0 + 0.16], [BAY1 - 0.16, BAY1]]) {
    push('wood', new THREE.BoxGeometry(xb - xa, 2.9, REC),
      trs((xa + xb) / 2, Y + 1.45, Z0 + REC / 2 - 0.01));
  }
  // a warm strip under the soffit, so the porch has a light of its own
  g.add(box(BAY1 - BAY0 - 1.4, 0.05, 0.26, flat({ color: 0xfff1d4 }),
    (BAY0 + BAY1) / 2, Y + 2.82, Z0 + 0.3));

  /* the recess floor, and the vestibule floor behind the glazing */
  push('band', new THREE.BoxGeometry(BAY1 - BAY0, 0.1, REC + VOID + 0.1),
    trs((BAY0 + BAY1) / 2, FL - 0.05, (Z0 + VZ) / 2 + 0.05));
  ctx.platform({ x0: BAY0 + 0.05, x1: BAY1 - 0.05, z0: Z0 - 0.1, z1: BZ + 0.05, top: FL });

  /* the string course at first-floor level, the upper storey, and the cornice */
  push('band', new THREE.BoxGeometry(W + 0.16, 0.16, D + 0.16), trs(cx, Y + H1, cz));
  push('wall', new THREE.BoxGeometry(W, H2, D), trs(cx, Y + H1 + H2 / 2, cz));
  // the spandrel band under the upper windows: pale wood, the one warm surface
  push('wood', new THREE.BoxGeometry(W + 0.06, 0.62, D + 0.06), trs(cx, Y + H1 + 0.42, cz));
  push('band', new THREE.BoxGeometry(W + 0.5, 0.28, D + 0.5), trs(cx, Y + H + 0.14, cz));
  /* The parapet: four runs and a cap.  The cap does not cast -- a 60 mm
   * overhang is two texels of this cascade and lands as sawtooth. */
  for (const s of [-1, 1]) {
    push('wall', new THREE.BoxGeometry(W + 0.3, 0.45, 0.18), trs(cx, Y + H + 0.51, cz + s * ((D + 0.3) / 2 - 0.09)));
    push('wall', new THREE.BoxGeometry(0.18, 0.45, D + 0.3), trs(cx + s * ((W + 0.3) / 2 - 0.09), Y + H + 0.51, cz));
  }
  {
    const caps = [];
    for (const s of [-1, 1]) {
      caps.push({
        geometry: new THREE.BoxGeometry(W + 0.42, 0.07, 0.3),
        matrix: trs(cx, Y + H + 0.76, cz + s * ((D + 0.3) / 2 - 0.09)),
      });
      caps.push({
        geometry: new THREE.BoxGeometry(0.3, 0.07, D + 0.42),
        matrix: trs(cx + s * ((W + 0.3) / 2 - 0.09), Y + H + 0.76, cz),
      });
    }
    const cm = new THREE.Mesh(bake(caps), m.band);
    cm.castShadow = false;
    cm.receiveShadow = true;
    g.add(cm);
  }
  push('roof', new THREE.BoxGeometry(W + 0.2, 0.12, D + 0.2), trs(cx, Y + H + 0.34, cz));

  /* rooftop plant: two condensers, a vent and the ladder hoop */
  {
    for (const dx of [-1.9, -0.6]) {
      push('trim', new THREE.BoxGeometry(1.0, 0.7, 0.44), trs(cx + dx, Y + H + 0.75, cz + 1.6));
      push('metal', new THREE.BoxGeometry(1.04, 0.05, 0.5), trs(cx + dx, Y + H + 1.12, cz + 1.6));
    }
    push('metal', new THREE.CylinderGeometry(0.16, 0.16, 0.9, 10), trs(cx + 2.4, Y + H + 0.85, cz + 1.2));
    push('metal', new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), trs(cx + 2.4, Y + H + 1.32, cz + 1.2));
    for (let i = 0; i < 4; i++) {
      push('metalDark', new THREE.BoxGeometry(0.04, 0.04, 0.36), trs(X1 - 0.5, Y + H1 + 0.6 + i * 0.6, Z1 + 0.16));
    }
  }

  /* ------------------------------- the openings ------------------------------- *
   * One helper, four layers: a recessed reveal, the pane, the mullion and
   * transom in front of it, and a sill that projects.  That is the whole of
   * what makes a window read as a hole in a wall rather than as a dark
   * rectangle painted on one. */
  /**
   * `n` is the outward normal, so the same helper serves the frontage and both
   * flanks.  Getting either of the two things below wrong makes a window that
   * is *there* and cannot be seen, which is the failure mode this whole project
   * keeps running into:
   *
   *  - the painted interior has to sit in front of the reveal, not behind it.
   *    The reveal is a solid box; put the plate 50 mm further in and the plate
   *    is inside it and every window on the building reads as a flat grey panel.
   *  - a `PlaneGeometry` faces +z, and `flat()` is single-sided.  This frontage
   *    looks *down* -z, so every plate needs turning to face out or it is
   *    back-face culled and simply absent.  `atan2(nx, nz)` does that for any
   *    of the four directions.
   */
  const win = ({ x, y, z, w, h, n = [0, -1], interior = 0, curtain = false, transom = true, mull = 1 }) => {
    const [nx, nz] = n;
    const along = nx !== 0;                 // the opening runs along z
    const at = (d) => [x + nx * d, z + nz * d];
    const bx = (t, ww, hh) => (along
      ? new THREE.BoxGeometry(t, hh, ww)
      : new THREE.BoxGeometry(ww, hh, t));
    const ry = Math.atan2(nx, nz);

    /* The reveal is set 20 mm *into* the wall, so its front face lands at
     * at(0.05) and everything after it stacks in front of that.  Centred on
     * at(0.05) instead -- which is what the first pass did -- a 0.14 m box
     * swallows the interior plate whole and every window on the building comes
     * out as a flat grey panel with a cross on it. */
    {
      const [px, pz] = at(-0.02);
      push('trim', bx(0.14, w + 0.16, h + 0.16), trs(px, y, pz));
    }
    {
      const [px, pz] = at(0.055);
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        flat({ color: 0x9a94a4, map: libraryInterior(interior), cache: false }));
      inner.position.set(px, y, pz);
      inner.rotation.y = ry;
      inner.userData.noOutline = true;
      g.add(inner);
      if (curtain) {
        const cur = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.42, h * 0.92),
          flat({ color: 0xeee8da, map: curtainTex(1), cache: false }));
        const [cx2, cz2] = at(0.062);
        cur.position.set(cx2 + (along ? 0 : w * 0.26), y, cz2 + (along ? w * 0.26 : 0));
        cur.rotation.y = ry;
        cur.userData.noOutline = true;
        g.add(cur);
      }
    }
    {
      const [px, pz] = at(0.085);
      const pane = new THREE.Mesh(bx(0.04, w, h), m.glass);
      pane.position.set(px, y, pz);
      pane.userData.noOutline = true;
      pane.userData.noShadow = true;
      g.add(pane);
    }
    // mullions, transom, head and sill, all in front of the glass
    {
      const [px, pz] = at(0.1);
      for (let i = 1; i <= mull; i++) {
        const t = -w / 2 + (w * i) / (mull + 1);
        push('metal', bx(0.09, 0.06, h), trs(px + (along ? 0 : t), y, pz + (along ? t : 0)));
      }
      if (transom) push('metal', bx(0.09, w, 0.07), trs(px, y + h * 0.22, pz));
      push('metal', bx(0.1, w + 0.12, 0.08), trs(px, y + h / 2 + 0.04, pz));
    }
    {
      const [px, pz] = at(0.11);
      push('band', bx(0.24, w + 0.24, 0.1), trs(px, y - h / 2 - 0.1, pz));
    }
  };

  // ground floor, east run: three tall windows on a 1.42 m pier rhythm
  for (let i = 0; i < 3; i++) {
    win({
      x: BAY1 + 0.95 + i * 1.28, y: Y + 1.95, w: 1.0, h: 2.1, z: Z0,
      interior: i === 1 ? 1 : 0, mull: 1, transom: true,
    });
  }
  // and one on the west pier's flank, which is what the west garden sees
  win({ x: X0, y: Y + 1.95, w: 1.0, h: 2.0, z: Z0 + 2.6, n: [-1, 0], interior: 0, mull: 1 });

  /* upper floor: five windows, evenly spaced, all the same -- a regular rhythm
   * up here is exactly right, because the ground floor is where the hierarchy
   * lives */
  for (let i = 0; i < 5; i++) {
    win({
      x: X0 + (W * (i + 1)) / 6, y: Y + H1 + 1.72, w: 1.34, h: 1.72, z: Z0,
      interior: i % 2 ? 0 : 1, curtain: i === 1 || i === 4, mull: 1,
    });
  }
  // two on each flank upstairs, so the corners are not blank above the cornice
  for (const zc of [Z0 + 2.2, Z0 + 4.8]) {
    win({ x: X1, y: Y + H1 + 1.72, w: 1.3, h: 1.7, z: zc, n: [1, 0], interior: 0 });
    win({ x: X0, y: Y + H1 + 1.72, w: 1.3, h: 1.7, z: zc, n: [-1, 0], interior: 1 });
  }

  /* ------------------------------- the glazed front ------------------------------- *
   * Four sliding leaves and their frame, at the back of the recess.  The two
   * middle ones are the doors -- they get their own thicker stiles and a pull,
   * because a shopfront of identical panes has no door in it. */
  {
    const OW = BAY1 - BAY0 - 0.6;
    const ox = (BAY0 + BAY1) / 2;
    const oh = 2.42;
    const oy = FL + oh / 2;
    push('metal', new THREE.BoxGeometry(OW + 0.16, 0.12, 0.16), trs(ox, FL + oh + 0.06, BZ));
    push('metal', new THREE.BoxGeometry(OW + 0.16, 0.1, 0.16), trs(ox, FL + 0.02, BZ));
    for (let i = 0; i <= 4; i++) {
      const t = -OW / 2 + (OW / 4) * i;
      const thick = i === 1 || i === 3 ? 0.1 : 0.06;
      push('metal', new THREE.BoxGeometry(thick, oh, 0.14), trs(ox + t, oy, BZ));
    }
    const pane = box(OW, oh, 0.04, m.glass, ox, oy, BZ + 0.02);
    pane.userData.noOutline = true;
    pane.userData.noShadow = true;
    g.add(pane);
    // the pulls on the two door leaves
    for (const s of [-1, 1]) {
      push('metalDark', new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), trs(ox + s * (OW / 8 + 0.06), FL + 1.15, BZ - 0.09));
      for (const dy of [0.72, 1.58]) {
        push('metalDark', new THREE.BoxGeometry(0.05, 0.035, 0.08), trs(ox + s * (OW / 8 + 0.06), FL + dy, BZ - 0.06));
      }
    }
    // one angled highlight, the way glass is painted
    const hi = new THREE.Mesh(new THREE.PlaneGeometry(OW * 0.22, oh * 1.1),
      flat({ color: 0xf4f9ff, transparent: true, opacity: 0.16, depthWrite: false, cache: false }));
    hi.position.set(ox - OW * 0.24, oy, BZ - 0.05);
    hi.rotation.z = 0.28;
    hi.userData.noOutline = true;
    g.add(hi);
  }

  /* ------------------------------- the vestibule ------------------------------- *
   * Real, for two metres.  This is the one part of the building the player
   * stands close enough to read, so it gets the four things a library entrance
   * actually has: a counter, a run of shelving each side, a ceiling with a
   * lit strip, and the return trolley nobody has emptied. */
  {
    const bx = (BAY0 + BAY1) / 2;
    // turned to face out of the void: `flat()` is single-sided and the viewer
    // is at -z, so an unrotated plate here is simply not drawn
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(BAY1 - BAY0 - 0.6, 2.5),
      flat({ color: 0xa8a2ae, map: libraryInterior(2), cache: false }));
    inner.position.set(bx, FL + 1.3, VZ - 0.03);
    inner.rotation.y = Math.PI;
    inner.userData.noOutline = true;
    g.add(inner);
    // the floor, the ceiling and its lit strip
    push('band', new THREE.BoxGeometry(BAY1 - BAY0 - 0.6, 0.08, VOID - 0.1), trs(bx, FL + 2.6, BZ + VOID / 2));
    g.add(box(1.5, 0.04, 0.34, flat({ color: 0xfff4e0 }), bx, FL + 2.54, BZ + 0.9));
    // the counter, set back and low, with a lighter top
    push('wood', new THREE.BoxGeometry(2.4, 1.02, 0.5), trs(bx + 0.5, FL + 0.51, VZ - 0.4));
    push('band', new THREE.BoxGeometry(2.56, 0.07, 0.62), trs(bx + 0.5, FL + 1.05, VZ - 0.4));
    g.add(box(0.3, 0.22, 0.24, cel({ color: 0xe8e2d2, bands: 3, tint: 0x6f6790 }), bx + 1.3, FL + 1.2, VZ - 0.42));
    // shelving against each side wall, with a lighter band per tier
    for (const s of [-1, 1]) {
      const sx2 = bx + s * ((BAY1 - BAY0) / 2 - 0.5);
      push('woodDark', new THREE.BoxGeometry(0.36, 1.9, 1.5), trs(sx2, FL + 0.95, BZ + 1.0));
      for (let r = 0; r < 4; r++) {
        push('wood', new THREE.BoxGeometry(0.4, 0.05, 1.5), trs(sx2, FL + 0.34 + r * 0.44, BZ + 1.0));
        g.add(box(0.3, 0.32, 1.34, cel({ color: [0xd8cdb4, 0xc9b89c, 0xdcd2b8][r % 3], bands: 3, tint: 0x6f6790 }),
          sx2, FL + 0.53 + r * 0.44, BZ + 1.0));
      }
    }
    // the trolley: a two-tier frame with a leaning stack on it
    {
      const tx = bx - 1.3;
      push('metal', new THREE.BoxGeometry(0.7, 0.04, 0.42), trs(tx, FL + 0.32, BZ + 0.55));
      push('metal', new THREE.BoxGeometry(0.7, 0.04, 0.42), trs(tx, FL + 0.66, BZ + 0.55));
      for (const sx2 of [-1, 1]) {
        push('metal', new THREE.BoxGeometry(0.04, 0.72, 0.04), trs(tx + sx2 * 0.32, FL + 0.36, BZ + 0.55));
      }
      const stack = box(0.44, 0.24, 0.3, cel({ color: 0xc9b89c, bands: 3, tint: 0x6f6790 }), tx, FL + 0.8, BZ + 0.55);
      stack.rotation.z = 0.09;
      g.add(stack);
    }
  }

  /* --------------------------------- the name --------------------------------- *
   * An internally-lit box rather than a painted board: a dark case, a warm face
   * and a rim.  `flat()` is unlit so the face cannot be made brighter -- the
   * whole effect is the case *around* it, which is the same trick three of the
   * shopping street's fascias use, and up here on a cool elevation it is the one
   * warm thing at three metres. */
  {
    const bw = 4.0;
    const bx = (BAY0 + BAY1) / 2;
    const bz = Z0 - 0.13;
    const side = flat({ color: 0x3c3947 });
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(bw, 0.62, 0.24),
      [side, side, flat({ color: 0x4a4653 }), side,
       flat({ color: 0xfff0d2, map: libraryName(), cache: false }), side]
    );
    board.position.set(bx, Y + 3.18, bz);
    board.castShadow = true;
    g.add(board);
    hullOutline(board, { thickness: 0.003 });
    push('metalDark', new THREE.BoxGeometry(bw + 0.14, 0.82, 0.18), trs(bx, Y + 3.18, bz + 0.05));
    // the two bracket lamps that light it after dark
    for (const s of [-1, 1]) {
      push('metalDark', new THREE.BoxGeometry(0.2, 0.07, 0.42), trs(bx + s * 1.5, Y + 3.66, bz - 0.06));
      g.add(box(0.16, 0.04, 0.16, flat({ color: 0xfff3d8 }), bx + s * 1.5, Y + 3.62, bz - 0.24));
    }
  }

  /* ----------------------------- merge and collide ----------------------------- */
  const matFor = {
    wall: m.wall, alt: m.wallAlt, band: m.band, wood: m.wood, woodDark: m.woodDark,
    roof: m.roof, trim: m.trim, metal: m.metal, metalDark: m.metalDark,
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key] ?? m.metal);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof') hullOutline(mesh, { thickness: 0.0032 });
  }
  /* Three colliders, not one: the entrance recess has to stay walkable, so the
   * bay's own box starts at the glazing line rather than at the frontage. */
  ctx.collide(X0 - 0.1, Z0 - 0.1, BAY0, Z1 + 0.1, Y + H);
  ctx.collide(BAY1, Z0 - 0.1, X1 + 0.1, Z1 + 0.1, Y + H);
  ctx.collide(BAY0, Z0 + REC - 0.05, BAY1, Z1 + 0.1, Y + H);
  return g;
}

/* ------------------------------------------------------------------ *
 * The way in: terrace, steps, ramp, canopy.
 * ------------------------------------------------------------------ */

function buildEntrance(ctx, Y, FY, FL) {
  const m = mats();
  const gm = groundMats();
  const g = new THREE.Group();
  g.name = 'libraryEntrance';
  ctx.add(g);

  /* The terrace: a step up in front of the recess, running east past the bay so
   * the ramp has somewhere to land.  Both approaches arrive on it rather than at
   * the door, which is what makes the entrance a sequence instead of a hole.
   *
   * **It is as deep as the ramp is wide, and that is the whole of the geometry
   * here.**  It was 0.85 m against a 1.3 m ramp, and the two run along the same
   * frontage a metre and a half apart: from anywhere on the forecourt you see the
   * ramp's south kerb line and the terrace's riser line as one edge that jogs
   * 0.45 m sideways in the middle of the picture, which is not a thing any
   * entrance does.  The ramp is the side that cannot move -- see its own note --
   * so `RAMP_W` sets the terrace's depth, the flight's width and nothing else on
   * this frontage has a second number in it. */
  const RAMP_W = 1.3;
  const RAMP_Z = 49.9;                        // the ramp's centreline
  const T_X0 = 11.7, T_X1 = 17.8;
  const T_Z1 = Z0 + 0.225;                    // 50.825: it runs on into the recess
  const T_Z0 = T_Z1 - RAMP_W;                 // 49.525
  pad(ctx, {
    x: (T_X0 + T_X1) / 2, z: (T_Z0 + T_Z1) / 2, w: T_X1 - T_X0, d: T_Z1 - T_Z0,
    y: FL - 0.1, h: 0.1, mat: gm.stoneWarm, name: 'libraryTerrace',
  });
  /* Its riser, which is what the steps and the ramp both arrive at.  It stands
   * 55 mm *proud* of the slab -- `T_Z0 + 0.005` and not `T_Z0 + 0.06` -- because
   * flush the two share a face over the slab's whole 0.1 m thickness, and two
   * coplanar faces in different materials are a coin toss the render loses: it
   * came back as a hatched band along the front of the terrace. */
  g.add(box(T_X1 - T_X0, RISE, 0.12, m.band, (T_X0 + T_X1) / 2, FY + RISE / 2, T_Z0 + 0.005));

  /* --------------------------------- the steps --------------------------------- *
   * The flight matches too: `RAMP_W` wide on the doormat's own axis, where it was
   * 2.6 m on an axis 0.3 m east of the doors.  It sits in front of the terrace's
   * new line, and its top tread overlaps the terrace's platform by 0.05 m --
   * two platforms that merely meet are a hole to fall through.  Nothing else
   * about the feet changes: the terrace is 0.30 m up, inside the 0.38 m step, so
   * it can still be walked onto anywhere along its 6.1 m. */
  const STEP_W = RAMP_W;
  const STEP_X = (BAY0 + BAY1) / 2;           // 14.1 -- the doormat's own axis
  const STEP_RUN = 0.44;
  const STEP_Z = T_Z0 - 2 * STEP_RUN + 0.05;  // 48.695
  steps(ctx, {
    x: STEP_X, z: STEP_Z, axis: 'z', dir: 1, n: 2, rise: RISE / 2, run: STEP_RUN,
    w: STEP_W, y: FY, mat: gm.stoneWarm, lipMat: gm.concreteMid,
  });
  // cheeks either side, so the flight has an edge to ink
  for (const s of [-1, 1]) {
    const c = box(0.16, RISE + 0.06, 0.94, m.band, STEP_X + s * (STEP_W / 2 + 0.08),
      FY + (RISE + 0.06) / 2, STEP_Z + STEP_RUN);
    c.castShadow = c.receiveShadow = true;
    g.add(c);
  }

  /* --------------------------------- the ramp --------------------------------- *
   * 1 : 10.7 from the forecourt up to the terrace, running east to west along the
   * frontage rather than straight at it -- there is a street cherry standing in
   * the paving on the west side, and it was here first.
   *
   * The slab is one sloped box; the *walking* surface is a run of seven platform
   * boxes under it, because `heightAt` only understands flat tops.  They overlap
   * by a quarter of their length, which is the rule everywhere else too: two
   * platforms that merely meet are a hole to fall through.
   *
   * **This is the width the terrace and the flight are sized from, and it cannot
   * grow.**  North of the ramp is the frontage at Z0 = 50.6 and south of it is the
   * tree pit at 49.02 with a street cherry in it -- 1.45 m between them once the
   * pipe handrail's 0.16 m is allowed for.  So 1.3 m is the number, and the other
   * two follow it rather than the other way round. */
  {
    const RW = RAMP_W;
    const rz = RAMP_Z;
    const rx0 = 20.6;              // the low end
    const rx1 = T_X1 - 0.4;        // the top, on the terrace
    const len = rx0 - rx1;
    const tilt = Math.atan2(RISE, len);
    const slab = box(len / Math.cos(tilt), 0.12, RW, m.concrete, (rx0 + rx1) / 2, FY + RISE / 2 - 0.02, rz);
    slab.rotation.z = -tilt;
    slab.castShadow = slab.receiveShadow = true;
    g.add(slab);
    const N = 7;
    for (let i = 0; i < N; i++) {
      const xa = rx0 - (len * i) / N;
      const xb = rx0 - (len * (i + 1)) / N;
      ctx.platform({
        x0: xb - 0.12, x1: xa + 0.12, z0: rz - RW / 2, z1: rz + RW / 2,
        top: FY + (RISE * (i + 0.85)) / N,
      });
    }
    // the kerb along its outer edge, and the pipe handrail over that
    const kerb = box(len / Math.cos(tilt), 0.2, 0.14, m.band, (rx0 + rx1) / 2, FY + RISE / 2 + 0.06, rz - RW / 2 - 0.07);
    kerb.rotation.z = -tilt;
    kerb.castShadow = true;
    g.add(kerb);
    {
      const parts = [];
      const RH = 0.88;
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        parts.push({
          geometry: new THREE.CylinderGeometry(0.026, 0.03, RH, 6),
          matrix: trs(rx0 - len * t, FY + RISE * t + RH / 2, rz - RW / 2 - 0.07),
        });
      }
      for (const dy of [RH - 0.02, RH * 0.52]) {
        parts.push({
          geometry: new THREE.CylinderGeometry(0.028, 0.028, Math.hypot(len, RISE) + 0.1, 6),
          matrix: trs((rx0 + rx1) / 2, FY + RISE / 2 + dy, rz - RW / 2 - 0.07, 0, 0, Math.PI / 2 - tilt),
        });
      }
      const rm = new THREE.Mesh(bake(parts), m.metal);
      rm.name = 'openFrame';
      rm.castShadow = true;
      g.add(rm);
      const zRail = rz - RW / 2 - 0.07;
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const x = rx0 - len * t;
        const y = FY + RISE * t;
        ctx.collide(x - 0.05, zRail - 0.05, x + 0.05, zRail + 0.05, y + RH, y, true);
      }
      for (const dy of [RH - 0.02, RH * 0.52]) {
        ctx.collide(rx1, zRail - 0.05, rx0, zRail + 0.05,
          FY + RISE / 2 + dy + 0.05, FY + RISE / 2 + dy - 0.05, true);
      }
    }
  }

  /* -------------------------------- the canopy -------------------------------- *
   * A flat slab on two slender columns, with a fascia and a downpipe.  It is
   * what turns the recess into a porch, and its shadow across the terrace is
   * most of why the entrance reads as an entrance in a still frame. */
  {
    const cw = BAY1 - BAY0 + 0.5;
    const cxm = (BAY0 + BAY1) / 2;
    const cz0 = 49.3;
    const slab = box(cw, 0.14, Z0 - cz0 + 0.1, m.band, cxm, Y + 2.86, (cz0 + Z0) / 2);
    slab.castShadow = slab.receiveShadow = true;
    g.add(slab);
    hullOutline(slab, { thickness: 0.003 });
    // its soffit in pale wood, warm against a cool elevation
    g.add(box(cw - 0.16, 0.04, Z0 - cz0 - 0.06, m.wood, cxm, Y + 2.78, (cz0 + Z0) / 2));
    g.add(box(cw + 0.06, 0.24, 0.1, m.wall, cxm, Y + 2.82, cz0 - 0.02));
    for (const s of [-1, 1]) {
      const col = box(0.12, 2.8, 0.12, m.metal, cxm + s * (cw / 2 - 0.22), Y + 1.4, cz0 + 0.14);
      col.castShadow = true;
      g.add(col);
      g.add(box(0.22, 0.1, 0.22, m.band, cxm + s * (cw / 2 - 0.22), Y + 0.05, cz0 + 0.14));
      ctx.collide(cxm + s * (cw / 2 - 0.22) - 0.1, cz0 + 0.04, cxm + s * (cw / 2 - 0.22) + 0.1, cz0 + 0.24, Y + 2.8);
    }
    // the downpipe off its west corner, and the gully it lands in
    g.add(cyl(0.045, 0.045, 2.8, 6, m.metal, cxm - cw / 2 + 0.06, Y + 1.4, cz0 + 0.06));
    g.add(box(0.24, 0.05, 0.24, m.concreteMid, cxm - cw / 2 + 0.06, Y + 0.055, cz0 + 0.06));
  }

  /* ------------------------------- porch fittings ------------------------------- */
  {
    const bx = (BAY0 + BAY1) / 2;
    ctx.add(makeDoormat({ x: bx, z: Z0 + REC - 0.5, y: FL, w: 1.3, d: 0.7, color: 0x6e6a78 }));
    ctx.add(makeUmbrellaStand({ x: BAY0 + 0.62, z: Z0 + REC - 0.3, y: FL, n: 4, seed: 5531 }));
    /* The refuse point is *not* in the porch.  Three bins at BAY1 - 1.5 put a
     * 1.4 m run of them 0.3 m inside the entrance recess and 0.6 m from the
     * doormat, so the doorway of the district's one public building was behind
     * a bin store.  It goes where a library's actually is: round the east
     * flank, past the end of the forecourt.  Not on the forecourt itself --
     * every metre of that is terrace, ramp, tree pit, bed or bench, and 1.4 m
     * of bins fits in none of them without standing on one. */
    ctx.add(makeBins({ x: 21.0, z: 51.5, y: ctx.groundAt(21.0, 51.5), ry: -Math.PI / 2 }));
    // the hours plate beside the door, and a poster on the pier
    const hours = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56),
      flat({ color: 0xffffff, map: libraryHours(), cache: false }));
    hours.position.set(BAY0 + 0.16, FL + 1.5, Z0 + REC - 0.02);
    hours.rotation.y = Math.PI / 2;
    hours.userData.noOutline = true;
    ctx.add(hours);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.55),
      flat({ color: 0xffffff, map: clubPoster(1), cache: false }));
    p.position.set(BAY1 - 0.16, FL + 1.5, Z0 + REC - 0.02);
    p.rotation.y = -Math.PI / 2;
    p.userData.noOutline = true;
    ctx.add(p);
  }
}

/* ------------------------------------------------------------------ *
 * The forecourt: the return post, the board, the bikes and the planting.
 * ------------------------------------------------------------------ */

function dressForecourt(ctx, Y, FY, rng, shrubs, petals) {
  const m = mats();
  const gm = groundMats();

  /* The after-hours book drop, hard by the entrance where it belongs.
   *
   * Everything in this forecourt faces -z, because that is the side everybody
   * arrives from: the lane is at z 43.5-46.9 and the frontage is at z = 50.6, so
   * a visitor walks *up* in z and sees the -z face of every object in front of
   * them.  Get that backwards and the board, the map and the slot all address
   * the building instead of the street -- which is exactly the mistake the
   * gachapon bank on the shopping street made. */
  ctx.add(makeReturnPost({ x: 11.35, z: 50.1, y: FY, ry: -0.1 }));
  ctx.collide(11.0, 49.85, 11.7, 50.4, FY + 1.2);

  /* the notice board, turned into the forecourt's north-west corner */
  ctx.add(makeNoticeBoard({ ctx,
    x: 10.0, z: 49.8, y: FY, ry: 2.6, w: 2.0, h: 1.15, y0: 0.85,
    sheets: [
      { map: poster(1), x: -0.62, y: 0.02, w: 0.42, h: 0.58, tilt: -0.02 },
      { map: clubPoster(0), x: -0.02, y: 0.04, w: 0.42, h: 0.58, tilt: 0.015 },
      { map: poster(3), x: 0.6, y: 0.0, w: 0.4, h: 0.55, tilt: 0.02 },
    ],
  }));


  /* bicycle parking against the west edge, marked out on the paving the way it
   * always is.  Four stands, not eight: the point is that somebody rides here,
   * not that a crowd does. */
  ctx.add(makeBikeRack({ x: 10.9, z: 47.7, y: FY, n: 4, spacing: 0.66, ry: 0, seed: 55 }));
  {
    const bars = [];
    for (let i = 0; i <= 4; i++) {
      bars.push({
        geometry: new THREE.BoxGeometry(0.08, 0.02, 1.5),
        matrix: trs(10.9, 0, 46.72 + i * 0.66),
      });
    }
    const bm = new THREE.Mesh(bake(bars), gm.white);
    bm.position.y = FY + 0.012;
    bm.userData.noOutline = true;
    ctx.add(bm);
  }

  /* benches facing out into the forecourt, a lamp, and one long bed on the east
   * edge so twelve metres of paving has a green end to it */
  ctx.add(makeBench({ x: 14.0, z: 47.4, y: FY, ry: 0, len: 1.8 }));
  ctx.add(makeBench({ x: 16.4, z: 47.4, y: FY, ry: 0, len: 1.8 }));
  ctx.add(makeFlowerBed({ x: 21.75, z: 48.6, w: 0.9, d: 3.4, y: FY, seed: 5540 }));
  for (const [px, pz, r] of [[12.3, 50.2, 0.26], [17.0, 47.0, 0.22]]) {
    ctx.add(makePlanter({ x: px, z: pz, y: FY, r, flower: true, seed: 5550 + Math.round(px * 10), n: 5 }));
  }

  /* the lamp standard: the forecourt's only light, and a vertical the flat
   * frontage badly needs off to one side */
  {
    const lx = 18.7, lz = 47.5;
    const post = cyl(0.055, 0.07, 4.0, 8, m.metalDark, lx, FY + 2.0, lz);
    post.castShadow = true;
    ctx.add(post);
    hullOutline(post, { thickness: 0.0032 });
    ctx.add(cyl(0.13, 0.16, 0.18, 8, m.concreteMid, lx, FY + 0.09, lz));
    ctx.add(box(0.06, 0.06, 0.62, m.metalDark, lx, FY + 3.96, lz - 0.28));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 12, 1, true), m.metal);
    shade.position.set(lx, FY + 3.86, lz - 0.56);
    ctx.add(shade);
    ctx.add(box(0.22, 0.05, 0.22, flat({ color: 0xfff2d0 }), lx, FY + 3.73, lz - 0.56));
    ctx.collide(lx - 0.18, lz - 0.18, lx + 0.18, lz + 0.18, FY + 4.0);
  }

  /* the tree pits: the two street cherries stand *in* the paving, and a trunk
   * coming straight out of a concrete slab is the one thing that gives away
   * that the slab was laid afterwards */
  for (const [tx, tz] of [[12.6, 48.0], [20.4, 48.4]]) {
    const soil = box(1.1, 0.06, 1.1, cel({ color: 0x8f7a62, bands: 3, tint: 0x615a80 }), tx, FY + 0.012, tz);
    soil.receiveShadow = true;
    ctx.add(soil);
    const rim = [];
    for (const s of [-1, 1]) {
      rim.push({ geometry: new THREE.BoxGeometry(1.24, 0.1, 0.14), matrix: trs(tx, FY + 0.03, tz + s * 0.62) });
      rim.push({ geometry: new THREE.BoxGeometry(0.14, 0.1, 1.24), matrix: trs(tx + s * 0.62, FY + 0.03, tz) });
    }
    ctx.add(new THREE.Mesh(bake(rim), gm.concreteMid));
  }

  makeLoosePaper(ctx, [
    { x: 18.2, z: 46.9, y: FY + 0.01, ry: 0.7 },
    { x: 13.2, z: 46.6, y: FY + 0.01, ry: -0.5 },
  ]);
  // z 48.1 and 2.4 deep, not 48.4 and 3.0: the terrace's front line came out to
  // the ramp's at 49.525, and the last 0.6 m of the old band is under its slab
  petals.push({ x: 15.6, z: 48.1, w: 11.0, d: 2.4, y: FY + 0.02, n: 130 });
  shrubs.push({ x: 22.0, z: 50.2, y: Y, r: 0.5, count: 3, spread: 1.2, seed: 5560 });
}

/* ------------------------------------------------------------------ *
 * The corner.
 *
 * The triangle of paving where the north lane meets the main road, which until
 * now was bare terrain nobody had a reason to look at.  It gets the three
 * things a Japanese street corner has and this world did not: a public
 * telephone box, a district guide board, and the recycling box the residents'
 * association keeps there.
 *
 * The box is the point.  It is one metre square and 2.66 m tall, which is
 * small enough to be intimate and tall enough to hold the corner against a
 * two-storey frontage -- and because it is glazed on four sides it reads as a
 * *lit* object at dusk without a single neon surface, which is exactly the line
 * the brief draws.  It stands turned a fifth of a turn off the lane so you see
 * two faces of it at once from the approach: square-on it is a rectangle, at an
 * angle it is a box.
 * ------------------------------------------------------------------ */

function buildCorner(ctx, rng) {
  const m = mats();
  const gm = groundMats();
  const Y = groundY(48.0);
  const FY = Y + 0.07;

  pad(ctx, {
    x: 4.2, z: 48.1, w: 5.0, d: 2.6, y: Y, h: 0.07, mat: gm.concrete, name: 'cornerPad',
  });
  // the gully at the kerb, which is what tells you which way the corner drains
  {
    const gully = box(0.3, 0.05, 0.7, cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 }), 2.05, FY + 0.005, 47.6);
    gully.receiveShadow = true;
    ctx.add(gully);
  }

  ctx.add(makePhoneBooth({ ctx, x: 3.5, z: 48.6, y: FY, ry: 0.34 }));

  ctx.add(makeGuideBoard({ ctx, x: 5.8, z: 48.9, y: FY, ry: Math.PI, w: 1.5, h: 1.05 }));

  ctx.add(makeRecycleBox({ x: 6.3, z: 47.5, y: FY, ry: Math.PI - 0.31 }));
  ctx.collide(5.85, 47.2, 6.75, 47.8, FY + 0.7);

  /* a short length of guardrail on the road edge, and the lamp above it */
  ctx.add(makeGuardrail({ ctx, x: 2.0, z: 48.4, y: FY, ry: Math.PI / 2, len: 3.4 }));
  {
    const lx = 6.9, lz = 46.9;
    const post = cyl(0.05, 0.065, 3.6, 8, m.metalDark, lx, FY + 1.8, lz);
    post.castShadow = true;
    ctx.add(post);
    ctx.add(cyl(0.12, 0.15, 0.16, 8, m.concreteMid, lx, FY + 0.08, lz));
    ctx.add(box(0.06, 0.06, 0.56, m.metalDark, lx, FY + 3.56, lz - 0.26));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 12, 1, true), m.metal);
    shade.position.set(lx, FY + 3.48, lz - 0.5);
    ctx.add(shade);
    ctx.add(box(0.2, 0.05, 0.2, flat({ color: 0xfff2d0 }), lx, FY + 3.36, lz - 0.5));
    ctx.collide(lx - 0.16, lz - 0.16, lx + 0.16, lz + 0.16, FY + 3.6);
  }
  ctx.add(makePlanter({ x: 2.5, z: 47.2, y: FY, r: 0.24, flower: true, seed: 5570, n: 5 }));
  ctx.add(makePlanter({ x: 2.4, z: 49.6, y: FY, r: 0.2, flower: false, seed: 5571, n: 4 }));
  makeLoosePaper(ctx, [{ x: 5.0, z: 47.3, y: FY + 0.01, ry: 1.1 }]);
}
