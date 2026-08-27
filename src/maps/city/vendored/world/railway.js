import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { crossingSign, stationSign, warningPlate, tactileTex } from '../core/textures.js';
import { box, cyl, rngKit, bake, trs, sagCurve } from '../core/util.js';
import { hullOutline, hullOutlineTree } from '../core/outline.js';
import { centerX, groundY, ROAD_HALF, WALK_W, WALK_H, GATE_Z, TRACK_HALF, CROSS_BAND } from './street.js';
import { CIRCUMFERENCE } from './planet.js';
/* Only for the tunnels' longitudes: the lineside fence, the masking walls and
 * the catenary masts all have to get out of the way of every bore, and the one
 * place that knows where the bores are is `hills.js`.
 *
 * **All three of these take the union over `TUNNELS` now.**  They were written
 * against a single `TUNNEL` object, and the mast test in particular is silent
 * when it is wrong: a 6.6 m mast standing inside a lining cannot be seen from
 * anywhere outside the mountain, so a second bore added without touching this
 * import would have looked perfect and been wrong. */
import { TUNNELS } from './hills.js';

/* ------------------------------------------------------------------ *
 * The railway: single track running along X, crossing the street at
 * x = 0, plus the level crossing hardware, lineside fence, overhead
 * catenary and a small station platform off to the east.
 * ------------------------------------------------------------------ */

export const RAIL_GAUGE = 1.44;
export const RAIL_TOP = 0.30;

/**
 * The track spans exactly one circumference, so once the world is wrapped
 * onto the planet its two ends meet on the equator and the loop closes with
 * no seam. Lineside dressing (fence, walls, station) stays local to the
 * district -- the rest of the ring is bare graded ground.
 */
export const X_MIN = -CIRCUMFERENCE / 2;
export const X_MAX = CIRCUMFERENCE / 2;
export const LOCAL_MIN = -150;
export const LOCAL_MAX = 150;

const matRail = () => cel({ color: PAL.railMetal, bands: 3, tint: 0x5f5878, flat: false });
const matHead = () => cel({ color: PAL.railHead, bands: 2, tint: 0x6f6890 });
const matSleeper = () => cel({ color: PAL.sleeper, bands: 3, tint: 0x5d5878 });
const matBallast = () => cel({ color: PAL.ballast, bands: 3, tint: 0x655d84 });
const matYellow = () => cel({ color: PAL.gateYellow, bands: 3, tint: 0x8f7050 });
const matBlack = () => cel({ color: PAL.gateBlack, bands: 2, tint: 0x4b4560 });
const matMetal = () => cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
const matMetalDark = () => cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
const matCabinet = () => cel({ color: PAL.cabinet, bands: 3, tint: 0x6f6890 });
const matConcrete = () => cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });

export function buildRailway(ctx) {
  const rng = rngKit(2317);
  const g = new THREE.Group();
  g.name = 'railway';
  ctx.add(g);

  /* ------------------------------ ballast bed ------------------------------ */
  {
    const shape = new THREE.Shape();
    shape.moveTo(-TRACK_HALF - 0.9, 0);
    shape.lineTo(-TRACK_HALF, 0.26);
    shape.lineTo(TRACK_HALF, 0.26);
    shape.lineTo(TRACK_HALF + 0.9, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: X_MAX - X_MIN, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(X_MIN, 0, 0);
    const m = new THREE.Mesh(geo, matBallast());
    m.receiveShadow = true;
    m.name = 'ballast';
    g.add(m);
  }

  /* -------------------------------- sleepers ------------------------------- */
  {
    const geo = new THREE.BoxGeometry(0.24, 0.16, 2.5);
    const count = Math.floor((X_MAX - X_MIN) / 0.62);
    const inst = new THREE.InstancedMesh(geo, matSleeper(), count);
    const d = new THREE.Object3D();
    let n = 0;
    for (let x = X_MIN; x < X_MAX; x += 0.62) {
      if (Math.abs(x) < ROAD_HALF + WALK_W + 0.6) continue;
      d.position.set(x, 0.32, 0);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      inst.setMatrixAt(n++, d.matrix);
    }
    inst.count = n;
    inst.receiveShadow = true;
    inst.castShadow = true;
    g.add(inst);
  }

  /* --------------------------------- rails ---------------------------------
   * Dark steel web with a thin polished strip on the running surface.  The
   * value contrast matters: with a pale rail the whole track disappears into
   * the ballast and the crossing reads as blank pavement.               */
  {
    const L = X_MAX - X_MIN;
    const webGeo = bake([
      { geometry: new THREE.BoxGeometry(L, 0.055, 0.115), matrix: trs(0, 0.392, 0) },
      { geometry: new THREE.BoxGeometry(L, 0.10, 0.05), matrix: trs(0, 0.325, 0) },
      { geometry: new THREE.BoxGeometry(L, 0.03, 0.17), matrix: trs(0, 0.27, 0) },
    ]);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(webGeo.clone(), matRail());
      m.position.set((X_MIN + X_MAX) / 2, 0, (s * RAIL_GAUGE) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = 'rail';
      g.add(m);
      const head = box(L, 0.016, 0.09, matHead(), (X_MIN + X_MAX) / 2, 0.424, (s * RAIL_GAUGE) / 2);
      head.userData.noOutline = true;
      g.add(head);
    }
    webGeo.dispose();
  }

  /* ---------------------- crossing deck through the road ---------------------- */
  {
    const w = ROAD_HALF * 2 + WALK_W * 2 + 1.0;
    const cx = centerX(0);
    // deliberately lighter than the asphalt: seen head-on down the street the
    // crossing only reads if the deck is a distinct tonal band
    const deck = cel({ color: 0xdad5df, bands: 3, tint: 0x6f6790 });
    // concrete panels either side of each rail
    const panels = [
      [0, RAIL_GAUGE / 2 - 0.12 - 0.30, 0.58],           // between the rails (centre)
      [RAIL_GAUGE / 2 + 0.42, 0, 0.72],
      [-RAIL_GAUGE / 2 - 0.42, 0, 0.72],
      [1.55, 0, 1.3],
      [-1.55, 0, 1.3],
    ];
    const between = box(w, 0.28, RAIL_GAUGE - 0.26, deck, cx, 0.18, 0);
    between.receiveShadow = true;
    g.add(between);
    for (const s of [-1, 1]) {
      const outer = box(w, 0.28, 1.55, deck, cx, 0.18, s * (RAIL_GAUGE / 2 + 0.12 + 0.78));
      outer.receiveShadow = true;
      g.add(outer);
    }
    // rails continue across the deck, proud of the concrete, plus the flangeway
    // groove either side -- that pair of dark lines is what makes a level
    // crossing legible from a distance
    for (const s of [-1, 1]) {
      const zr = (s * RAIL_GAUGE) / 2;
      const r = box(w, 0.12, 0.115, matRail(), cx, 0.36, zr);
      r.receiveShadow = true;
      g.add(r);
      const head = box(w, 0.016, 0.09, matHead(), cx, 0.424, zr);
      head.userData.noOutline = true;
      g.add(head);
      for (const gs of [-1, 1]) {
        g.add(box(w, 0.06, 0.055, cel({ color: 0x4d4757, bands: 2, tint: 0x413c58 }),
          cx, 0.33, zr + gs * 0.086));
      }
    }
    // yellow hazard bands painted on the road either side of the tracks, plus
    // short cross-ticks: the whole point is to make the crossing a graphic
    // band across the road rather than a subtle change of grey
    const yellowMat = cel({ color: PAL.lineYellow, bands: 2, tint: 0x8f7050 });
    for (const s of [-1, 1]) {
      for (const [off, wide] of [[0.42, 0.3], [0.92, 0.16]]) {
        const geo = new THREE.PlaneGeometry(ROAD_HALF * 2 - 0.15, wide);
        geo.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(geo, yellowMat);
        m.position.set(cx, 0.335, s * (TRACK_HALF + off));
        m.userData.noOutline = true;
        g.add(m);
      }
      // diagonal ticks between the two bands
      for (let i = -5; i <= 5; i++) {
        const geo = new THREE.PlaneGeometry(0.5, 0.11);
        geo.rotateX(-Math.PI / 2);
        geo.rotateY(Math.PI / 4);
        const m = new THREE.Mesh(geo, yellowMat);
        m.position.set(cx + i * 0.56, 0.333, s * (TRACK_HALF + 0.67));
        m.userData.noOutline = true;
        g.add(m);
      }
    }
  }

  /* --------------------------- lineside fencing --------------------------- */
  const FENCE_Z = TRACK_HALF + 1.05;
  const GAP = ROAD_HALF + WALK_W + 0.5;
  {
    const parts = [];
    const railGeoH = new THREE.BoxGeometry(1, 0.06, 0.06);
    const postGeo = new THREE.BoxGeometry(0.07, 1.12, 0.07);
    const barGeo = new THREE.BoxGeometry(0.035, 0.5, 0.035);
    /* The far side breaks for the station platform.
     *
     * **And every run is cut by every bore, and by every maintenance gate.**
     * Written by hand it was `[FENCE_Z, TUNNEL.x1, -GAP]` -- one bore, one
     * subtraction, done in the head -- and `LOCAL_MIN + 22` (-128) had already
     * been left standing *inside* the west bore once.  Two bores and two gates
     * is four openings in five runs, so it is a function now: `trimRun` takes
     * the raw span and returns what is left of it after the mountains and the
     * gates have been taken out.  The run either side of a portal belongs to the
     * cutting, which fences its own crest; `tunnel.js` adds the run on each
     * bore's *outer* approach, which `railway.js` never had. */
    const trimRun = (zf, a, b) => {
      let segs = [[a, b]];
      const cuts = [];
      for (const t of TUNNELS) {
        cuts.push([t.x0, t.x1]);
        // the 1.8 m maintenance gate, on whichever side that bore's walkway is
        if (Math.sign(zf) === t.walk) cuts.push([t.gateX - 0.9, t.gateX + 0.9]);
      }
      for (const [c0, c1] of cuts) {
        const next = [];
        for (const [s0, s1] of segs) {
          if (c1 <= s0 || c0 >= s1) { next.push([s0, s1]); continue; }
          if (c0 - s0 > 0.6) next.push([s0, c0]);
          if (s1 - c1 > 0.6) next.push([c1, s1]);
        }
        segs = next;
      }
      return segs.map(([s0, s1]) => [zf, s0, s1]);
    };
    const runs = [
      ...trimRun(FENCE_Z, LOCAL_MIN + 22, -GAP), ...trimRun(FENCE_Z, GAP, LOCAL_MAX - 22),
      ...trimRun(-FENCE_Z, LOCAL_MIN + 22, -GAP), ...trimRun(-FENCE_Z, GAP, 13.5),
      ...trimRun(-FENCE_Z, 39.5, LOCAL_MAX - 22),
    ];
    for (const [zf, x0, x1] of runs) {
      const len = x1 - x0;
      const mid = (x0 + x1) / 2;
      for (const yy of [0.55, 1.02]) {
        parts.push({ geometry: railGeoH, matrix: trs(mid, yy, zf, 0, 0, 0, len, 1, 1) });
        ctx.collide(x0, zf - 0.04, x1, zf + 0.04, yy + 0.05, yy - 0.05, true);
      }
      for (let x = x0; x <= x1; x += 2.4) {
        parts.push({ geometry: postGeo, matrix: trs(x, 0.56, zf) });
        ctx.collide(x - 0.05, zf - 0.05, x + 0.05, zf + 0.05, 1.12, 0, true);
      }
      // vertical infill bars, sparse enough to stay graphic
      for (let x = x0 + 0.3; x <= x1; x += 0.32) {
        parts.push({ geometry: barGeo, matrix: trs(x, 0.78, zf) });
      }
    }
    const m = new THREE.Mesh(bake(parts), matMetal());
    m.castShadow = true;
    m.name = 'openFrame';
    g.add(m);
    [railGeoH, postGeo, barGeo].forEach((x) => x.dispose());
  }

  /* -------------------------- overhead catenary -------------------------- */
  {
    const mastMat = matMetalDark();
    const parts = [];
    const MAST_STEP = CIRCUMFERENCE / Math.round(CIRCUMFERENCE / 19);
    const WIRE_Z = 0.02;
    for (let x = X_MIN + MAST_STEP; x <= X_MAX - MAST_STEP * 0.5; x += MAST_STEP) {
      if (Math.abs(x) < 8) continue;
      /* No masts through either tunnel or any of their four approach cuttings.
       * A 6.6 m mast at z = -3.65 inside a bore is a mast inside the lining, and
       * in a cutting it would stand in the retaining kerb.  Each bore carries
       * cantilever brackets off its own arch instead (`tunnel.js`); the contact
       * and messenger wires themselves run straight through, because they circle
       * the planet and there is nowhere for them to stop. */
      if (TUNNELS.some((t) => x > t.x0 - 16 && x < t.x1 + 16)) continue;
      const zf = -(TRACK_HALF + 1.45);
      parts.push({ geometry: new THREE.CylinderGeometry(0.09, 0.13, 6.6, 6), matrix: trs(x, 3.3, zf) });
      parts.push({
        geometry: new THREE.BoxGeometry(0.1, 0.1, WIRE_Z - zf),
        matrix: trs(x, 6.1, (zf + WIRE_Z) * 0.5),
      });
      parts.push({ geometry: new THREE.BoxGeometry(0.09, 1.0, 0.09), matrix: trs(x, 5.6, WIRE_Z) });
      parts.push({ geometry: new THREE.CylinderGeometry(0.05, 0.05, 0.28, 6), matrix: trs(x, 5.02, WIRE_Z) });
    }
    const m = new THREE.Mesh(bake(parts), mastMat);
    m.castShadow = true;
    g.add(m);

    // contact wire + messenger wire, carried the whole way round the equator
    const wireMat = cel({ color: PAL.metalDark, bands: 2, tint: 0x4a4468 });
    for (const [y, r] of [[4.88, 0.022], [5.95, 0.026]]) {
      const pts = [];
      for (let x = X_MIN; x <= X_MAX; x += MAST_STEP) {
        pts.push(new THREE.Vector3(x, y - (y > 5 ? 0.12 : 0), WIRE_Z));
        pts.push(new THREE.Vector3(x + MAST_STEP * 0.5, y, WIRE_Z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const segs = Math.round(CIRCUMFERENCE / 2.5);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, 4, false), wireMat);
      tube.name = 'catenaryWire';
      g.add(tube);
    }
  }

  /* ------------------------------- crossing ------------------------------- */
  const crossing = buildCrossing(ctx, g);

  /* -------------------------------- station -------------------------------- */
  buildStation(ctx, g, rng);

  /* ------ walls further down the line, masking where the train enters ------ */
  {
    const wallMat = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
    /* **The west runs stop at -80 instead of -118**, because ひばり山 is west of
     * them now and a mountain masks the line better than 2.2 m of concrete does.
     * They also cannot stay: at -118 the run passes straight through the tunnel's
     * west cutting and out the far side of the portal.  -80 clears the east
     * cutting's retaining kerb (which reaches -81) by a metre, so the two
     * structures read as one continuous lineside rather than as two overlapping
     * ones.
     *
     * **And the east runs stop at 80 instead of 118.**  92 was tried first, on
     * the same reasoning as the west end -- it leaves a metre before 東山's west
     * cutting starts at x = 93 -- and it is wrong, because unlike the west end
     * there is now something *on* that stretch: the bore's 保守用通路 gate is at
     * x = 85 and its railside viewing spot at x = 91, and both of them ended up
     * on the far side of 2.2 m of concrete.  From the spot the wall was 1.6 m
     * away and filled the frame; and the only way to the gate was a one-metre
     * gap between the wall's end and the cutting's kerb, which the flood fill
     * found and no human would.  80 puts both walls exactly along the town's own
     * frontage (the built world reaches x -78 to 79.5) and leaves the whole
     * approach to the tunnel open, which is what a lineside is. */
    const runs = [
      [TRACK_HALF + 2.6, -80, -30], [TRACK_HALF + 2.6, 46, 80],
      [-(TRACK_HALF + 2.6), -80, -30], [-(TRACK_HALF + 2.6), 44, 80],
    ];
    const capMat = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
    for (const [zf, x0, x1] of runs) {
      const m = box(x1 - x0, 2.2, 0.35, wallMat, (x0 + x1) / 2, 1.1, zf);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      ctx.collide(x0, zf - 0.2, x1, zf + 0.2, 2.2);

      /* A pier on **both** ends now.
       *
       * These runs stop dead where the district begins, and the near-side one
       * stops exactly where the lineside footpath to the shrine runs out -- so
       * looking west along that path you got 2.2 m of wall terminating in
       * nothing, which at this tonal range reads as a grey card standing on
       * the paving rather than as the end of a wall.  A wall ends in a pier.
       *
       * The far ends used to get away without one because both of them stood a
       * metre from a tunnel cutting's retaining kerb, which continued the line.
       * Pulling the east runs back to x = 80 puts their ends thirteen metres
       * short of anything, in open ground, in full view of the walk out to
       * 東山's portal -- which is the same grey card again. */
      for (const ex of [x0, x1]) {
        const inward = ex === x0 ? 1 : -1;
        const px = ex - inward * 0.22;
        const pier = box(0.52, 2.52, 0.62, wallMat, px, 1.26, zf);
        pier.castShadow = pier.receiveShadow = true;
        g.add(pier);
        /* The cap does not cast: a 50 mm overhang is about a texel and a half of
         * this cascade, so its own shadow lands as sawtooth along the pier face
         * instead of as a line. */
        const cap = box(0.62, 0.1, 0.72, capMat, px, 2.57, zf);
        cap.receiveShadow = true;
        g.add(cap);
        ctx.collide(px - 0.31, zf - 0.36, px + 0.31, zf + 0.36, 2.62);
      }
    }
  }

  return crossing;
}

/* ------------------------------------------------------------------ *
 * Level crossing: four gate posts, two swinging arms, flashing lamps,
 * crossbucks, bell housings, relay cabinets, safety kerbs.
 * ------------------------------------------------------------------ */

function buildCrossing(ctx, parent) {
  const group = new THREE.Group();
  group.name = 'crossing';
  parent.add(group);

  const cx = centerX(0);
  const yellow = matYellow();
  const black = matBlack();
  const metal = matMetal();
  const metalDark = matMetalDark();
  const cabinet = matCabinet();

  const lamps = [];
  const arms = [];

  // striped arm geometry: alternating yellow / black blocks
  function makeArm(length) {
    const arm = new THREE.Group();
    const seg = 0.52;
    const n = Math.round(length / seg);
    const segGeo = new THREE.BoxGeometry(seg, 0.17, 0.09);
    const yParts = [];
    const bParts = [];
    for (let i = 0; i < n; i++) {
      const mx = trs(seg * (i + 0.5), 0, 0);
      (i % 2 === 0 ? yParts : bParts).push({ geometry: segGeo, matrix: mx });
    }
    const my = new THREE.Mesh(bake(yParts), yellow);
    const mb = new THREE.Mesh(bake(bParts), black);
    my.castShadow = mb.castShadow = true;
    arm.add(my, mb);
    // hanging warning lamps under the arm
    for (let i = 1; i < n - 1; i += 3) {
      const lamp = box(0.11, 0.11, 0.07, flat({ color: PAL.signalOff }), seg * (i + 0.5), -0.14, 0.06);
      lamp.userData.lamp = 'arm';
      lamps.push(lamp);
      arm.add(lamp);
      arm.add(box(0.03, 0.12, 0.03, metalDark, seg * (i + 0.5), -0.05, 0.06));
    }
    hullOutline(my, { thickness: 0.0032 });
    hullOutline(mb, { thickness: 0.0032 });
    segGeo.dispose();
    return arm;
  }

  /**
   * One corner assembly.
   *
   * A real Japanese crossing splits the hardware in two: a squat barrier
   * machine whose boom pivots at about waist height, and a separate taller
   * mast carrying the flashing lamps, the bell and the crossbuck.  Modelling
   * it that way matters -- hanging the boom off the signal mast puts it at
   * chest height on the far kerb and the crossing stops reading as a crossing.
   *
   * `sx` picks the road side, `sz` the track side.
   */
  function corner(sx, sz, kind) {
    const grp = new THREE.Group();
    const x = cx + sx * (ROAD_HALF + 0.42);
    const z = sz * GATE_Z;
    grp.position.set(x, groundY(0), z);
    // the boom pivots have to outlive the planet bake
    grp.userData.planetRigid = true;

    const base = box(0.66, 0.2, 0.62, matConcrete(), 0, 0.1, 0);
    base.receiveShadow = base.castShadow = true;
    grp.add(base);

    /* ---------------------------- barrier machine ---------------------------- */
    if (kind === 'arm') {
      const MH = 0.92;
      const machine = box(0.46, MH, 0.38, matCabinet(), 0, 0.2 + MH / 2, 0);
      machine.castShadow = machine.receiveShadow = true;
      grp.add(machine);
      hullOutline(machine, { thickness: 0.0034 });
      grp.add(box(0.54, 0.07, 0.46, cel({ color: PAL.cabinetTop, bands: 3 }), 0, 0.2 + MH + 0.03, 0));
      // yellow / black hazard banding on the machine body
      for (let i = 0; i < 3; i++) {
        grp.add(box(0.48, 0.11, 0.4, i % 2 ? black : yellow, 0, 0.34 + i * 0.24, 0));
      }

      // The boom stands vertical at rest and swings down across the road.
      // rotation.y aims it at the far kerb, rotation.z is the animated sweep.
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.2 + MH + 0.12, sz * 0.2);
      pivot.add(makeArm(ROAD_HALF * 2 + 0.5));
      pivot.rotation.y = sx > 0 ? Math.PI : 0;
      pivot.rotation.z = Math.PI / 2;
      grp.add(pivot);
      arms.push({ pivot });
      grp.add(box(0.2, 0.2, 0.14, metalDark, 0, 0.2 + MH + 0.12, sz * 0.2));
    }

    /* ------------------------------ signal mast ------------------------------ */
    const mastX = kind === 'arm' ? sx * 0.44 : 0;
    const mastH = 2.45;
    const mast = cyl(0.075, 0.09, mastH, 8, yellow, mastX, 0.2 + mastH / 2, 0);
    mast.castShadow = true;
    grp.add(mast);
    for (let i = 0; i < 4; i++) {
      grp.add(cyl(0.082, 0.082, 0.22, 8, black, mastX, 0.42 + i * 0.56, 0));
    }
    hullOutline(mast, { thickness: 0.0032 });
    if (kind === 'arm') {
      grp.add(box(0.5, 0.09, 0.09, metalDark, mastX / 2, 0.2 + 0.5, 0));
    }

    // signal head: two red lamps facing along the road
    const headGrp = new THREE.Group();
    headGrp.position.set(mastX, 0.2 + mastH + 0.02, sz * 0.02);
    headGrp.rotation.y = sz > 0 ? 0 : Math.PI;
    headGrp.add(box(0.86, 0.13, 0.1, black, 0, 0.06, 0));
    for (const lx of [-0.28, 0.28]) {
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.16, 0.13, 12, 1, true), black);
      hood.rotation.x = Math.PI / 2;
      hood.position.set(lx, -0.12, 0.07);
      headGrp.add(hood);
      const back = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14), black);
      back.position.set(lx, -0.12, 0.0);
      headGrp.add(back);
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.13, 14),
        flat({ color: PAL.signalOff, cache: false })
      );
      lens.position.set(lx, -0.12, 0.135);
      lens.userData.lamp = lx < 0 ? 'a' : 'b';
      lamps.push(lens);
      headGrp.add(lens);
    }
    // bell housing above the lamps
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), metal);
    bell.rotation.x = Math.PI;
    bell.position.set(0, 0.3, 0);
    headGrp.add(bell);
    grp.add(headGrp);

    /* --------------------------- crossbuck and board --------------------------- */
    if (kind === 'sign') {
      const boardMat = [
        flat({ color: PAL.wallWhite }), flat({ color: PAL.wallWhite }),
        flat({ color: PAL.wallWhite }), flat({ color: PAL.wallWhite }),
        flat({ color: 0xffffff, map: crossingSign(), cache: false }),
        flat({ color: PAL.wallGray }),
      ];
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.58, 0.05), boardMat);
      board.position.set(0, 0.2 + mastH + 0.62, sz * 0.05);
      board.rotation.y = sz > 0 ? 0 : Math.PI;
      board.castShadow = true;
      grp.add(board);
      hullOutline(board, { thickness: 0.003 });

      for (const r of [0.72, -0.72]) {
        const bar = box(1.2, 0.15, 0.045, yellow, 0, 0.2 + mastH + 1.28, sz * 0.05);
        bar.rotation.z = r;
        bar.castShadow = true;
        grp.add(bar);
      }
      grp.add(cyl(0.06, 0.07, 1.3, 8, yellow, 0, 0.2 + mastH + 0.65, 0));
    }

    group.add(grp);
    ctx.collide(x - 0.4, z - 0.35, x + 0.4, z + 0.35, 2.4);
    return grp;
  }

  corner(-1, 1, 'arm');
  corner(1, -1, 'arm');
  corner(1, 1, 'sign');
  corner(-1, -1, 'sign');

  /* --- relay cabinets and a control box on the far corner --- */
  {
    const zc = -GATE_Z - 1.15;
    const xc = cx - (ROAD_HALF + 1.5);
    const c1 = box(0.78, 1.32, 0.5, cabinet, xc, groundY(0) + 0.66, zc);
    c1.castShadow = c1.receiveShadow = true;
    group.add(c1);
    hullOutline(c1, { thickness: 0.003 });
    const top = box(0.86, 0.08, 0.58, cel({ color: PAL.cabinetTop, bands: 3 }), xc, groundY(0) + 1.36, zc);
    group.add(top);
    const c2 = box(0.52, 0.9, 0.4, cabinet, xc - 0.9, groundY(0) + 0.45, zc + 0.1);
    c2.castShadow = c2.receiveShadow = true;
    group.add(c2);
    group.add(box(0.6, 0.06, 0.46, cel({ color: PAL.cabinetTop, bands: 3 }), xc - 0.9, groundY(0) + 0.93, zc + 0.1));
    // door seam + a small red indicator
    group.add(box(0.02, 1.0, 0.02, cel({ color: PAL.metalDark, bands: 2 }), xc, groundY(0) + 0.66, zc - 0.26));
    const led = box(0.07, 0.07, 0.03, flat({ color: PAL.signalRed }), xc + 0.24, groundY(0) + 1.16, zc - 0.26);
    group.add(led);
    ctx.collide(xc - 1.3, zc - 0.4, xc + 0.5, zc + 0.4, groundY(0) + 1.4);

    // the box the player can press to call a train
    const button = box(0.3, 0.4, 0.12, cel({ color: PAL.yellow, bands: 3 }), xc, groundY(0) + 1.0, zc - 0.3);
    button.castShadow = true;
    group.add(button);
    const hit = box(0.9, 1.6, 0.9, flat({ color: 0xff0000, cache: false }), xc, groundY(0) + 0.8, zc);
    hit.visible = false;
    group.add(hit);
    ctx.interact({
      hitbox: hit,
      label: '踏切スイッチ  ·  call a train',
      action: () => crossingApi.request?.(),
    });
  }

  /* --- safety kerbs guiding pedestrians through the crossing --- */
  {
    const kerbMat = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
    for (const sx of [-1, 1]) {
      const x = cx + sx * (ROAD_HALF + 0.15);
      const m = box(0.34, 0.16, TRACK_HALF * 2 + 1.6, kerbMat, x, groundY(0) + 0.08, 0);
      m.receiveShadow = true;
      m.castShadow = true;
      group.add(m);
      // yellow tactile patch where the pavement meets the deck
      for (const sz of [-1, 1]) {
        const t = new THREE.Mesh(
          new THREE.PlaneGeometry(1.35, 0.6),
          cel({ color: 0xffffff, bands: 2, map: tactileTex(true), tint: 0x8f7050, cache: false })
        );
        t.rotation.x = -Math.PI / 2;
        t.position.set(cx + sx * (ROAD_HALF + 0.82), groundY(sz * CROSS_BAND) + WALK_H + 0.016, sz * (CROSS_BAND + 0.32));
        group.add(t);
      }
    }
  }

  /* ----------------------------- lamp animation ----------------------------- */
  const onColor = new THREE.Color(PAL.signalRed);
  const offColor = new THREE.Color(PAL.signalOff);
  const armLamps = lamps.filter((l) => l.userData.lamp === 'arm');
  const lampA = lamps.filter((l) => l.userData.lamp === 'a');
  const lampB = lamps.filter((l) => l.userData.lamp === 'b');
  // each lens/lamp gets its own material instance so we can drive colour
  for (const l of lamps) l.material = l.material.clone();

  const crossingApi = {
    group,
    arms,
    active: false,
    armT: 0,
    _blink: 0,
    request: null,
    setLamps(state, blink) {
      const cA = state && blink < 0.5 ? onColor : offColor;
      const cB = state && blink >= 0.5 ? onColor : offColor;
      lampA.forEach((l) => l.material.color.copy(cA));
      lampB.forEach((l) => l.material.color.copy(cB));
      const cArm = state ? (blink < 0.5 ? onColor : offColor) : offColor;
      armLamps.forEach((l) => l.material.color.copy(cArm));
    },
    /** 0 = raised, 1 = fully across the road */
    setArms(t) {
      this.armT = t;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      for (const a of arms) a.pivot.rotation.z = (1 - e) * (Math.PI / 2) * 0.99 + 0.004;
    },
  };
  crossingApi.setLamps(false, 0);
  crossingApi.setArms(0);
  return crossingApi;
}

/* ------------------------------------------------------------------ *
 * A small unstaffed platform down the line, mostly there to give the
 * background depth and a reason for the train to exist.
 * ------------------------------------------------------------------ */

function buildStation(ctx, parent, rng) {
  const g = new THREE.Group();
  g.name = 'station';
  parent.add(g);

  const x0 = 15.5, x1 = 38.0;
  const zf = -1.92;
  const zb = zf - 3.7;
  const H = 0.98;
  const concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  const concreteDark = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });

  const deck = box(x1 - x0, H, zf - zb, concrete, (x0 + x1) / 2, H / 2, (zf + zb) / 2);
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  ctx.platform({ x0, x1, z0: zb, z1: zf, top: H });
  ctx.collide(x0 - 0.1, zb - 0.1, x1 + 0.1, zf + 0.1, H);

  // platform edge: dark band + yellow tactile line
  g.add(box(x1 - x0, 0.06, 0.34, concreteDark, (x0 + x1) / 2, H - 0.02, zf - 0.17));
  const tact = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0 - 1.0, 0.46),
    cel({ color: 0xffffff, bands: 2, map: tactileTex(), tint: 0x8f7050, cache: false })
  );
  tact.material.map.repeat.set((x1 - x0 - 1) / 0.46, 1);
  tact.material.map.wrapS = THREE.RepeatWrapping;
  tact.rotation.x = -Math.PI / 2;
  tact.position.set((x0 + x1) / 2, H + 0.012, zf - 0.62);
  g.add(tact);

  // canopy over the middle of the platform
  {
    const cx = (x0 + x1) / 2 + 1.5;
    const roofW = 9.5, roofD = 3.2;
    const posts = [];
    for (const px of [cx - roofW / 2 + 0.6, cx + roofW / 2 - 0.6]) {
      for (const pz of [zf - 0.9, zb + 0.7]) {
        posts.push({ geometry: new THREE.CylinderGeometry(0.075, 0.075, 2.6, 8), matrix: trs(px, H + 1.3, pz) });
      }
    }
    const pm = new THREE.Mesh(bake(posts), cel({ color: PAL.metalDark, bands: 3 }));
    pm.name = 'openFrame';
    pm.castShadow = true;
    g.add(pm);
    for (const px of [cx - roofW / 2 + 0.6, cx + roofW / 2 - 0.6]) {
      for (const pz of [zf - 0.9, zb + 0.7]) {
        ctx.collide(px - 0.08, pz - 0.08, px + 0.08, pz + 0.08, H + 2.6, H);
      }
    }
    ctx.collide(cx - roofW / 2, Math.min(zf - 0.9, zb + 0.7) - 0.8, cx + roofW / 2,
      Math.max(zf - 0.9, zb + 0.7) + 0.8, H + 2.8, H + 2.5, true);
    const roof = box(roofW, 0.16, roofD, cel({ color: PAL.roofTeal, bands: 3, tint: 0x4a4468 }), cx, H + 2.66, (zf + zb) / 2 - 0.1);
    roof.castShadow = roof.receiveShadow = true;
    g.add(roof);
    g.add(box(roofW + 0.3, 0.1, 0.14, cel({ color: PAL.metal, bands: 3 }), cx, H + 2.56, (zf + zb) / 2 - 1.75));
    hullOutline(roof, { thickness: 0.003 });

    // benches under the canopy
    for (const bx of [cx - 2.2, cx + 1.4]) {
      const b = new THREE.Group();
      b.add(box(1.7, 0.08, 0.42, cel({ color: PAL.wallCream, bands: 3 }), 0, 0.42, 0));
      b.add(box(1.7, 0.5, 0.07, cel({ color: PAL.wallCream, bands: 3 }), 0, 0.66, -0.2));
      for (const lx of [-0.7, 0.7]) {
        b.add(box(0.1, 0.42, 0.36, cel({ color: PAL.metalDark, bands: 3 }), lx, 0.21, 0));
      }
      b.position.set(bx, H, zb + 0.95);
      b.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.add(b);
    }
  }

  // station name boards on posts, facing the track
  for (const sx of [x0 + 4.0, x1 - 4.5]) {
    const post = cyl(0.06, 0.06, 2.2, 8, cel({ color: PAL.metalDark, bands: 3 }), sx, H + 1.1, zf - 0.55);
    post.castShadow = true;
    g.add(post);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.5, 0.06),
      [flat({ color: PAL.wallWhite }), flat({ color: PAL.wallWhite }),
       flat({ color: PAL.wallWhite }), flat({ color: PAL.wallWhite }),
       flat({ color: 0xffffff, map: stationSign(), cache: false }),
       flat({ color: PAL.wallGray })]
    );
    board.position.set(sx, H + 2.25, zf - 0.55);
    board.castShadow = true;
    g.add(board);
    hullOutline(board, { thickness: 0.003 });
  }

  // back fence and a warning plate
  {
    const parts = [];
    for (let x = x0; x <= x1; x += 2.2) {
      parts.push({ geometry: new THREE.BoxGeometry(0.08, 1.2, 0.08), matrix: trs(x, H + 0.6, zb + 0.06) });
    }
    for (const y of [H + 0.5, H + 1.1]) {
      parts.push({ geometry: new THREE.BoxGeometry(x1 - x0, 0.06, 0.06), matrix: trs((x0 + x1) / 2, y, zb + 0.06) });
    }
    const m = new THREE.Mesh(bake(parts), cel({ color: PAL.metal, bands: 3 }));
    m.castShadow = true;
    g.add(m);
  }

  /* Steps down at the near end of the platform.
   *
   * These had no `ctx.platform` registration, so they were six blocks of
   * decorative concrete: `heightAt` never saw them, the deck's own collider
   * kept the player off the platform from every side, and the station could
   * not be walked onto at all.  Nothing showed it -- you simply never got up
   * there, and there was no reason to try until the overbridge landed behind
   * it.  Padded by 30 mm so consecutive treads overlap instead of meeting. */
  {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const h = H * ((steps - i) / steps);
      const sx = x0 - 0.18 - i * 0.36;
      const s = box(0.36, h, 2.4, concrete, sx, h / 2, zb + 1.3);
      s.castShadow = s.receiveShadow = true;
      g.add(s);
      ctx.platform({ x0: sx - 0.21, x1: sx + 0.21, z0: zb + 0.1, z1: zb + 2.5, top: h });
    }
    for (const sz of [zb + 0.1, zb + 2.5]) {
      const rail = box(2.4, 0.07, 0.07, cel({ color: PAL.metal, bands: 3 }), x0 - 1.2, 0.95, sz);
      rail.rotation.z = 0.36;
      g.add(rail);
    }
  }

  // lamps along the platform
  for (const lx of [x0 + 2.5, (x0 + x1) / 2 - 3.5, x1 - 2.0]) {
    const post = cyl(0.055, 0.055, 3.1, 8, cel({ color: PAL.metalDark, bands: 3 }), lx, H + 1.55, zb + 0.5);
    post.castShadow = true;
    g.add(post);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.22, 10, 1, true), cel({ color: PAL.wallGray, bands: 3 }));
    shade.position.set(lx, H + 3.05, zb + 0.5);
    g.add(shade);
    g.add(box(0.18, 0.05, 0.18, flat({ color: 0xfff3d4 }), lx, H + 2.92, zb + 0.5));
  }

  // a warning plate on the fence, for texture
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.72, 0.04),
    [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
     flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
     flat({ color: 0xffffff, map: warningPlate(1), cache: false }),
     flat({ color: PAL.wallGray })]
  );
  plate.position.set(x0 + 8.5, H + 1.0, zb + 0.02);
  plate.rotation.y = Math.PI;
  g.add(plate);

  return g;
}
