import { clamp, sstep } from '../core/util.js';

/* ------------------------------------------------------------------ *
 * ひばり湖 -- the shape of the lake.
 *
 * This file is to the lake what `landform.js` is to the drainage channel: the
 * *geometry of the hole*, with no materials, no props and no imports from
 * anything that could import it back.  `hills.js` reads it while it is building
 * its lattice, which is why it has to be able to stand entirely on its own.
 *
 * ------------------------------------------------------------------ *
 * WHY THE LAKE IS ABOVE THE TOWN AND NOT BELOW IT
 *
 * There are exactly two ways to put water into this world and the choice
 * decides everything else.
 *
 *   **Below the datum**, like the 用水路: the channel is a genuine hole -- faces
 *   removed from the terrain grid *and* from the planet sphere (`cutTrench`),
 *   sealed by its own concrete, with a `ctx.cut` so the height query follows the
 *   excavation.  That is three cooperating layers and a hard cut edge that has
 *   to be sealed all the way round, which is tolerable for a 5 m channel and
 *   absurd for a 110 m lake with an irregular shoreline.
 *
 *   **Above the datum**, which is what this is: the water is a flat surface at
 *   `groundY + LEVEL`, and it is hidden wherever the ground is higher than it.
 *   That is the *same* trick `hills.js` already uses against the terrain grid --
 *   where the field is positive the hill mesh is above the grid and hides it,
 *   where it is negative the grid is the ground, and the two meet along the
 *   contour `field = 0`, which is a line and not an area, so there is nothing to
 *   z-fight over.  Here the contour is `field = LEVEL`, and it *is* the
 *   shoreline.
 *
 * Three things fall out of that and they are the whole reason it is worth doing:
 *
 *   - **the shoreline is a contour, so it is irregular for free.**  Every bay,
 *     every spit and the whole of the peninsula are where they are because the
 *     ground is that shape there, not because a polygon was drawn round them.
 *   - **depth is `LEVEL - field`**, available at any point from a function that
 *     already exists, which is what places the reeds, the lilies, the shallow
 *     tone band and the moorings.
 *   - **nothing in `street.js`, `planet.js` or `landform.js` has to change.**  A
 *     lake below the datum would have needed all three.
 *
 * The cost is that the lake is *perched*: its surface stands 3.4 m above the
 * town's ground plane and its rim stands 5 to 9 m above that again.  Which is
 * not a compromise -- it is what a 灌漑用ため池 **is**.  Japanese irrigation
 * ponds are not lowland lakes; they are valleys in the hills behind a village,
 * closed at the low end by an earth embankment, and the water is higher than the
 * fields it serves because that is the entire point of building one.  So the
 * lake being up behind ひばり山 with a dam on its north-west corner and a
 * culvert running down to the 用水路 is the honest arrangement, not a dodge.
 *
 * ------------------------------------------------------------------ *
 * WHY THERE IS AN AUTHORED SHORELINE, AND WHY IT CARRIES THE RIM
 *
 * If the shoreline is a contour, why is there a polygon in this file at all?
 *
 * Because a contour of a sum of elliptical bumps is a *smooth blob*, and the
 * brief for this place is a list of specific rooms: a bay with reeds in it, a
 * peninsula that splits the view, a narrow inlet where a stream comes in, a
 * revetted park frontage, an embankment.  Those are compositional decisions and
 * they cannot be reached by tuning six radii.
 *
 * **And because a lake is the one thing in this world that fails globally.**
 * Water finds the low point.  The first version of this file described only the
 * *bed* and the *bank*, and left the rim to seven new summits in `hills.js` --
 * which is how everything else here is built and is completely wrong for a body
 * of water: measured round the shoreline, twenty of the thirty-two stretches had
 * ground **below the water level** within two metres of the shore, and the worst
 * was 4.7 m below.  Not a leak: no lake at all, just a water-coloured plane
 * lying across a valley.  A quartic bump is down to 56 % of its height half a
 * radius out and then the 2.6 m pedestal takes most of what is left, so getting a
 * continuous 400 m rim out of ellipses means placing thirty of them and checking
 * every one -- and any later change to any of them silently drains the lake.
 *
 * So the rim is derived from the shoreline as well (`rimAt`), and the no-spill
 * property is then **structural**: within `s1` of the water the ground is exactly
 * `LEVEL + bank·s`, which is above `LEVEL` by construction, and beyond that it is
 * a crest at `LEVEL + crest`.  `hills.js` takes the max of its own summits and
 * this, so where the real range is higher -- the whole west divide, most of the
 * north ridge -- the range wins and the rim is invisible.  Where it is not, the
 * rim is what holds the water in.  Nothing about a later change to a summit can
 * drain it.
 *
 * Every gradient in the rim is at or under 0.50, which is the second half of the
 * same argument: `hills.js`'s slope limiter lowers any node standing more than
 * 0.52·CELL above a neighbour, so a rim built any steeper would be quietly eaten
 * by the very pass that makes the hills gentle -- and it would be eaten from the
 * *outside in*, which drains the lake without changing the picture until it does.
 *
 * Per-vertex, and this is where the character of each stretch lives:
 *
 *   `bank`  how fast the ground rises out of the water, in metres per metre.
 *           0.10 is a reed flat you cannot see the edge of, 0.24 a mown park
 *           slope, 0.34 a wooded shore, 0.46 a stone revetment or the upstream
 *           face of the embankment.
 *   `dr`    how far in the bed takes to reach full depth.  A long ramp is a
 *           shallow bay, a short one is a shore you could moor against.
 *   `dm`    that full depth.  1.0 in the reed bay, 2.6 in the main basin.
 *   `cr`    how high the rim stands above the water behind this stretch.
 *   `fa`    and how fast its outer flank falls away to the plain.
 *
 * All five are interpolated along each segment, so the treatment changes the way
 * a real shore does rather than switching at a corner.
 * ------------------------------------------------------------------ */

/**
 * Water level, in the same units `hills.js` uses -- metres above `groundY(z)`,
 * which is a flat 1.05 over the whole of this latitude band.
 *
 * 3.40 is picked off the ground rather than chosen.  The lake's west shore is
 * the east flank of E1, the east shoulder's summit at (118, -84), and that flank
 * measures about 4.2 m of field at x = 140 and 5.3 at x = 137: put the water at
 * 4.2 and the shore is *at* the natural grade, so the bank has nothing to rise
 * out of and the smallest hollow in the roughness opens a spill.  At 3.40 there
 * is the better part of a metre of freeboard on the tightest stretch of the
 * whole rim before `rimAt` adds anything at all.
 */
export const LEVEL = 3.40;

/**
 * The band outside the shoreline where the authored bank hands back to the
 * natural hillside.
 *
 * It has to be a blend and not a cut-off.  A hard edge at a fixed offset leaves
 * a step wherever the natural ground is higher than the bank profile has reached
 * -- which is most of the rim, by design -- and a step in a height field is a
 * cliff the slope limiter then has to eat.
 */
const HAND_IN = 7.0;
const HAND_OUT = 17.0;

/**
 * …and it is per-vertex, because the width of the shelf **is** the difference
 * between a park and a bank.
 *
 * The west shore is the east flank of E1, which rises naturally at 0.35 to 0.40.
 * With the default 7 m handover the authored bank governs for seven metres and
 * then the hillside takes over, so the park's lawn came out at 0.32 -- a slope you
 * cannot put a picnic table on, ten metres from the water.  Widening the handover
 * to 14 m there cuts a genuine terrace into the flank at the stretch's own 0.20,
 * which is 1 in 5 and is what a reservoir-bank park actually is: mown, tilted, and
 * running down to a low revetment.
 *
 * It stays at 7 everywhere the shore is *meant* to be the hillside's own toe --
 * the far side, the peninsula, the wooded south -- because there a wide graded
 * shelf reads as a road that was never built.
 */
const DEF_HI = HAND_IN;
const DEF_HO = HAND_OUT;

/** Width of the rim's crest before its outer flank starts, before the wobble. */
const RIM_CW = 5.5;

/**
 * The shoreline.
 *
 * Read it as a walk round the lake anticlockwise in plan, starting at the dam.
 * The names are the places `kohan.js` builds, and the geometry is chosen for
 * what each one has to look at:
 *
 *   - the **west shore** is the arrival side, so it is the graded one: the road
 *     comes over the embankment, the park's lawn runs down to a low revetment,
 *     and the 桟橋 goes out from the flattest part of it.
 *   - the **peninsula** is a bite out of the water at x 178..199, and it is the
 *     single most load-bearing thing in the plan.  On a 160 m planet the water
 *     surface is only visible for 23 m from a 1.7 m eye, so a lake with nothing
 *     standing in it is a pond with a haze behind it; a wooded spit 40 m out
 *     puts a *known* object at the distance where the curvature bites and gives
 *     the whole basin its depth.  Its height is not authored anywhere: the bank
 *     profile trims it to `LEVEL + bank·s` and its spine is 9 m from water on
 *     both sides, so what stands there is about 3 m above the surface.
 *   - the **south-east** is a reed flat: bank 0.10 and a 28 m depth ramp, so
 *     there is thirty metres of ankle-deep water for the 野鳥観察小屋 to look
 *     across.  That is also why it is the only stretch nothing is built on.
 *   - the **east and north-east** are the far shore, seen from everywhere else,
 *     and get nothing but trees and the highest rim in the ring.  From the park,
 *     100 m of water away, they are below the horizon and what reads is the rim.
 */
/**
 * **Every vertex sits on the range's own `LEVEL` contour, and that is the second
 * thing this file got wrong before it got right.**
 *
 * The first shoreline was drawn as a shape -- a pleasing crescent with a spit in
 * it -- and then the rim was expected to appear behind it.  What the survey
 * actually showed (`naturalAt`, dumped as a map over x 112..300, z -8..-160) is
 * that the ground east of the shoulder is **already a closed basin**: 12 m of
 * divide on the west, 8-9 m of ridge between it and the railway on the north,
 * 7-9 m on the south and east, and a floor 40 m across that never rises above
 * -1.3.  There is no natural outlet anywhere in it.  Drawing a shoreline
 * *inside* that basin meant excavating a 3 m trench round the whole north shore
 * to make the water reach it, and building a synthetic bund round the whole east
 * shore to stop it going further.  Both, at once, in opposite directions.
 *
 * So the shoreline is the natural full-pool line instead, read off the contour at
 * about 5 m intervals: x 142..250, z -39..-137.  The consequences are all good.
 * The lake is half again as large for no extra ground.  The bank is a *trim* of a
 * metre or two rather than an earthwork.  The rim is the real range over most of
 * its length and `rimAt` only fills the gaps.  And the one place there *is* a
 * thin spot -- the basin's north-west corner, where the barrier between it and
 * the saddle at (124, -26) drops to 4.6 m -- is exactly where an irrigation pond
 * would be dammed, so that is where the embankment goes.
 */
export const SHORE = [
  /* the embankment's upstream toe -- 9.2 m out from the crest line, which is
   * `half` plus the 1-in-2 face's own run, so the water meets riprap at the level
   * the face reaches it and not at the crest.  Low `cr`, because `damAt` is what
   * stands here and a rim on top of a dam is a bund on a bund. */
  { x: 161.0, z: -45.2, bank: 0.50, dr: 14, dm: 2.5, cr: 2.2, fa: 0.48 },
  { x: 154.0, z: -48.8, bank: 0.50, dr: 15, dm: 2.6, cr: 2.2, fa: 0.48 },
  { x: 147.2, z: -52.2, bank: 0.46, dr: 14, dm: 2.5, cr: 4.2, fa: 0.46, hi: 10 },
  /* the west shore: 湖畔公園.  0.20 over a 15 m shelf is a mown slope you walk
   * down, and it is the gentlest stretch outside the reed flat for exactly that
   * reason -- see the note on `hi` above. */
  { x: 143.6, z: -60.0, bank: 0.26, dr: 16, dm: 2.6, cr: 5.6, fa: 0.46, hi: 12, ho: 24 },
  { x: 142.4, z: -70.0, bank: 0.21, dr: 17, dm: 2.6, cr: 6.4, fa: 0.44, hi: 14, ho: 28 },
  { x: 142.2, z: -80.0, bank: 0.20, dr: 18, dm: 2.6, cr: 6.8, fa: 0.44, hi: 15, ho: 30 },
  { x: 145.0, z: -90.0, bank: 0.24, dr: 17, dm: 2.6, cr: 7.0, fa: 0.44, hi: 14, ho: 28 },
  { x: 147.6, z: -100.0, bank: 0.38, dr: 14, dm: 2.5, cr: 7.2, fa: 0.44, hi: 11, ho: 24 },
  /* the south-west, where a gully off ひばり山 comes in */
  { x: 148.6, z: -110.0, bank: 0.26, dr: 16, dm: 2.3, cr: 6.8, fa: 0.42, hi: 9 },
  { x: 151.6, z: -118.0, bank: 0.22, dr: 18, dm: 2.1, cr: 6.2, fa: 0.42 },
  { x: 159.4, z: -125.6, bank: 0.18, dr: 20, dm: 1.9, cr: 5.6, fa: 0.40 },
  /* the south shore under 喫茶 みなも */
  { x: 170.0, z: -131.6, bank: 0.24, dr: 18, dm: 1.9, cr: 5.4, fa: 0.40, hi: 11, ho: 24 },
  { x: 181.0, z: -135.6, bank: 0.26, dr: 16, dm: 1.8, cr: 5.4, fa: 0.40, hi: 12, ho: 24 },
  /* Round the peninsula -- a bite out of the water reaching 34 m north.  `dm` is
   * deliberately not small here: it was 1.2 at the tip on the first pass, and
   * because the tip is the *nearest* shoreline point to most of the main basin it
   * set the depth of the whole middle of the lake -- the water measured 1.2 m deep
   * sixty metres from any shore.  A spit's tip is where a pond is *deepest*. */
  { x: 184.0, z: -126.0, bank: 0.30, dr: 14, dm: 1.9, cr: 5.0, fa: 0.40 },
  { x: 186.0, z: -116.0, bank: 0.32, dr: 13, dm: 2.1, cr: 4.8, fa: 0.40 },
  { x: 189.0, z: -107.0, bank: 0.34, dr: 12, dm: 2.3, cr: 4.6, fa: 0.40 },
  { x: 194.0, z: -101.0, bank: 0.36, dr: 12, dm: 2.4, cr: 4.2, fa: 0.40 },
  { x: 199.0, z: -105.0, bank: 0.34, dr: 12, dm: 2.3, cr: 4.6, fa: 0.40 },
  { x: 201.0, z: -114.0, bank: 0.30, dr: 13, dm: 2.1, cr: 4.8, fa: 0.40 },
  { x: 200.0, z: -124.0, bank: 0.26, dr: 15, dm: 1.8, cr: 5.0, fa: 0.40 },
  /* the reed flat -- thirty metres of ankle-deep water for the hide to look over */
  { x: 202.0, z: -134.0, bank: 0.11, dr: 26, dm: 1.1, cr: 5.4, fa: 0.38 },
  { x: 214.0, z: -136.5, bank: 0.10, dr: 28, dm: 1.0, cr: 5.6, fa: 0.38 },
  { x: 226.0, z: -135.0, bank: 0.12, dr: 26, dm: 1.1, cr: 5.8, fa: 0.38 },
  { x: 236.0, z: -130.0, bank: 0.16, dr: 22, dm: 1.6, cr: 6.4, fa: 0.40 },
  /* the east shore -- the far side, seen from everywhere else, and the highest
   * rim in the ring.  Nothing is built on it but the 水神様. */
  { x: 243.0, z: -120.0, bank: 0.30, dr: 17, dm: 2.3, cr: 7.2, fa: 0.42 },
  { x: 247.0, z: -108.0, bank: 0.34, dr: 15, dm: 2.5, cr: 7.4, fa: 0.42 },
  { x: 249.6, z: -96.0, bank: 0.38, dr: 14, dm: 2.5, cr: 7.6, fa: 0.42 },
  { x: 249.8, z: -84.0, bank: 0.40, dr: 14, dm: 2.5, cr: 7.6, fa: 0.42 },
  { x: 247.0, z: -72.0, bank: 0.38, dr: 15, dm: 2.5, cr: 7.4, fa: 0.42 },
  { x: 242.0, z: -60.0, bank: 0.32, dr: 16, dm: 2.4, cr: 7.0, fa: 0.42 },
  /* the north-east bay, and back along the north shore */
  { x: 234.0, z: -50.0, bank: 0.26, dr: 18, dm: 2.2, cr: 6.4, fa: 0.40 },
  { x: 224.0, z: -43.0, bank: 0.24, dr: 19, dm: 2.2, cr: 6.2, fa: 0.42 },
  { x: 212.0, z: -40.0, bank: 0.26, dr: 20, dm: 2.4, cr: 6.4, fa: 0.44 },
  { x: 199.0, z: -39.4, bank: 0.28, dr: 20, dm: 2.5, cr: 6.8, fa: 0.46 },
  { x: 186.0, z: -39.6, bank: 0.28, dr: 20, dm: 2.5, cr: 7.2, fa: 0.46 },
  { x: 174.0, z: -40.6, bank: 0.30, dr: 18, dm: 2.5, cr: 7.2, fa: 0.46 },
  { x: 166.0, z: -42.4, bank: 0.36, dr: 16, dm: 2.5, cr: 6.0, fa: 0.46 },
];

/* Segment cache, with cumulative arc length: the polygon is walked once per
 * lattice node in the lake's neighbourhood, which is of the order of two million
 * segment tests at module load, and none of it at run time. */
const SEGS = SHORE.map((a, i) => {
  const b = SHORE[(i + 1) % SHORE.length];
  const dx = b.x - a.x, dz = b.z - a.z;
  return { a, b, dx, dz, len: Math.hypot(dx, dz), l2: dx * dx + dz * dz || 1e-6, s0: 0 };
});
{
  let run = 0;
  for (const s of SEGS) { s.s0 = run; run += s.len; }
}

/** Bounding box, plus the widest band anything here cares about. */
const BB = (() => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of SHORE) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  }
  return { x0, x1, z0, z1 };
})();

/** The shoreline's own bounding box, for sizing a survey or a mesh window. */
export const LAKE_BBOX = { ...BB };

/**
 * How far outside the shoreline this module has anything to say.
 *
 * It has to cover the rim's whole footprint and not just the bank: the crest is
 * 15 to 30 m out and its outer flank runs another 25, and if `lakeNear` gives up
 * before that then `lakeDamp` gives up with it -- which puts full-strength
 * roughness (±2 m of `MICRO`) on the one part of the rim that is only 1.9 m above
 * the water.  That is a breach, and it is the kind that appears three rounds
 * later when somebody re-seeds a scatter field.
 */
export const LAKE_REACH = 62.0;

/** Ray-cast parity test.  The polygon is simple and closed, so this is exact. */
function insidePoly(x, z) {
  let inside = false;
  for (const s of SEGS) {
    const { a, b } = s;
    if ((a.z > z) !== (b.z > z)) {
      const t = (z - a.z) / (b.z - a.z);
      if (x < a.x + t * (b.x - a.x)) inside = !inside;
    }
  }
  return inside;
}

/**
 * Nearest point on the shoreline, with the stretch's own treatment.
 *
 * `d` is signed: positive in the water, negative on the land.  Returns null
 * beyond `LAKE_REACH`, so a caller sweeping the whole world pays a bounding-box
 * test and nothing else.  `arc` is the distance round the shoreline to the
 * nearest point, which is what the rim's wobble is a function of.
 */
export function lakeNear(x, z) {
  if (x < BB.x0 - LAKE_REACH || x > BB.x1 + LAKE_REACH
    || z < BB.z0 - LAKE_REACH || z > BB.z1 + LAKE_REACH) return null;
  let best = Infinity, seg = null, tt = 0;
  for (const s of SEGS) {
    let t = ((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / s.l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.a.x + s.dx * t, pz = s.a.z + s.dz * t;
    const dd = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (dd < best) { best = dd; seg = s; tt = t; }
  }
  const dist = Math.sqrt(best);
  const inside = insidePoly(x, z);
  if (!inside && dist > LAKE_REACH) return null;
  const { a, b } = seg;
  const L = (p, q) => p + (q - p) * tt;
  return {
    d: inside ? dist : -dist,
    bank: L(a.bank, b.bank),
    dr: L(a.dr, b.dr),
    dm: L(a.dm, b.dm),
    cr: L(a.cr, b.cr),
    fa: L(a.fa, b.fa),
    hi: L(a.hi ?? DEF_HI, b.hi ?? DEF_HI),
    ho: L(a.ho ?? DEF_HO, b.ho ?? DEF_HO),
    arc: seg.s0 + seg.len * tt,
  };
}

/** True in the water, by the polygon alone -- for masking a mesh window. */
export function inLakePoly(x, z) {
  if (x < BB.x0 - 1 || x > BB.x1 + 1 || z < BB.z0 - 1 || z > BB.z1 + 1) return false;
  return insidePoly(x, z);
}

/**
 * The rim, as a profile hung off the shoreline.
 *
 * `s` is the distance outside the water.  The ground rises at the stretch's own
 * `bank` until it reaches the crest, holds it for `cw`, then falls at `fa`:
 *
 *      LEVEL + cr  ┌────────┐
 *                 /          \
 *                /            \
 *     LEVEL ────┘              \____ the plain, wherever that is
 *              0    s1  s1+cw
 *
 * The two sine terms on `cw` and `cr` are the difference between a rim and a
 * *bund*.  A crest at a constant offset from a smooth shoreline is a running
 * track, and the eye finds it instantly from the 見晴台; wandering the crest line
 * by ±4 m on a 100 m wavelength and ±8 % on a 70 m one, both as functions of
 * distance *round the shore*, keeps it continuous (which is what stops the slope
 * limiter eating it) while leaving nothing for the eye to lock onto.  `hills.js`
 * then takes the max of this and its own summits, and over the west third of the
 * ring the summits win outright -- so a third of the rim is a real hillside and
 * the join is wherever the two cross.
 */
export function rimAt(x, z, n) {
  if (!n || n.d >= 0) return -Infinity;
  const s = -n.d;
  const wob = Math.sin(n.arc * 0.062) * 4.0 + Math.sin(n.arc * 0.148 + 1.7) * 1.8;
  const cw = Math.max(2.0, RIM_CW + wob);
  const cr = n.cr * (1 + 0.09 * Math.sin(n.arc * 0.091 + 0.4));
  const s1 = cr / Math.max(0.08, n.bank);
  if (s <= s1) return LEVEL + n.bank * s;
  if (s <= s1 + cw) return LEVEL + cr;
  return LEVEL + cr - (s - s1 - cw) * n.fa;
}

/* ------------------------------------------------------------------ *
 * 堰堤 -- the embankment.
 * ------------------------------------------------------------------ */

/**
 * The dam, as a flat-topped ridge across the valley's low end.
 *
 * It is a term in the *height field* rather than a building standing on one, and
 * that is deliberate: a dam that is only cladding is a dam the water flows round
 * the moment a summit moves four metres, and the whole point of the field being
 * the single source of truth is that it cannot.  `hills.js` takes the max of the
 * natural surface and this, so the embankment can only ever raise the ground.
 *
 * **Where it goes was measured, and it is not where the first guess put it.**  The
 * survey of `naturalAt` over this quarter of the world shows the basin is closed
 * on all four sides, so a dam is not structurally necessary anywhere -- which
 * means the *right* place for one is wherever the barrier is thinnest, because
 * that is where an irrigation pond's builders would have found it.  Reading the
 * map, the basin's north-west corner is 4.6 to 5.4 m at z = -40 and the saddle at
 * (124, -26) beyond it is 1.3 to 2.4 m: sixteen metres of ground between a valley
 * floor and a gap leading straight down to the 用水路's east headwall.  That is a
 * valley mouth, and this is the bank across it.
 *
 * The embankment itself is only 1.2 m of fill over the natural sill -- which is
 * what a small ため池's 堤体 actually is -- but the 放水路 cut immediately
 * downstream takes the ground to 3.0, so the face you see from the road below it
 * is 3.3 m.  The height of a dam is the difference between two ground levels, not
 * a number.
 *
 * 1 in 2 faces (`face: 0.5`), which matters twice over: it is what an earth
 * embankment is built at, and it is *inside* the 0.52 the slope limiter allows
 * outside the two ring corridors -- so the limiter never touches it and the dam
 * cannot be quietly eaten by the very pass that makes the hills gentle.
 */
export const DAMS = [
  {
    a: [143.0, -44.0], b: [157.0, -37.0],
    crest: 6.30, half: 3.4, face: 0.50,
  },
];

const DAM_SEGS = DAMS.map((d) => {
  const dx = d.b[0] - d.a[0], dz = d.b[1] - d.a[1];
  return { d, dx, dz, l2: dx * dx + dz * dz || 1e-6 };
});

/** Height the embankment insists on at a point.  `-Infinity` away from one. */
export function damAt(x, z) {
  let h = -Infinity;
  for (const s of DAM_SEGS) {
    let t = ((x - s.d.a[0]) * s.dx + (z - s.d.a[1]) * s.dz) / s.l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.d.a[0] + s.dx * t, pz = s.d.a[1] + s.dz * t;
    const dist = Math.hypot(x - px, z - pz);
    const v = dist <= s.d.half
      ? s.d.crest
      : s.d.crest - (dist - s.d.half) * s.d.face;
    if (v > h) h = v;
  }
  return h;
}

/** The crest's centreline, as a point at parameter t -- the road reads this. */
export function damPoint(t, i = 0) {
  const d = DAMS[i];
  return [d.a[0] + (d.b[0] - d.a[0]) * t, d.a[1] + (d.b[1] - d.a[1]) * t];
}

/* ------------------------------------------------------------------ *
 * Cut channels: the spillway, the outfall and the two inflows.
 * ------------------------------------------------------------------ */

/**
 * A watercourse carved *into* the finished surface, as a polyline with an invert
 * height at every vertex.
 *
 * `hills.js` applies these last, with `min`, so a channel goes through whatever
 * is in its way -- the embankment and the rim included, which is the only way a
 * 余水吐 can exist at all.  Outside `half` the ceiling rises at `wall`, so a
 * channel is a trapezoidal cut and not a slot; beyond that it says nothing.
 *
 * The inverts are what make the hydrology read, and they are the reason the
 * lake is where it is:
 *
 *   **余水吐** is a **dry** chute, and that is a correction rather than a
 *   compromise.  It was first specified with its weir at `LEVEL - 0.05` so that a
 *   sheet of water would stand over the crest, and `lakeLeakCheck` promptly did
 *   what water does: the fill walked out of the basin, down the chute and into
 *   the outfall, which is a drained lake.  A 余水吐's crest is the 満水位 by
 *   definition, so in April -- which is when this world is set -- it is 0.15 m in
 *   the air and bone dry, and what actually discharges is the 底樋 at the toe of
 *   the embankment, fed through the 斜樋 standing in the water.  That is both the
 *   correct hydraulics and the better picture: a dry concrete chute reads as
 *   infrastructure waiting for the rains, and the one place water is *moving* in
 *   this district is a 0.6 m stream coming out of a pipe at the bottom of a dam.
 *
 *   It is at the crest's *north* end rather than through the middle of it, which
 *   is where these actually are, and it means the management road runs the length
 *   of the crest and never crosses the water at all.
 *
 *   **放水路** carries it on down the valley to (112, -26) and stops there,
 *   because that is 6 m from `CANAL_X1` -- the east 暗渠 headwall of the 用水路,
 *   which `canal.js` describes as "the reach's source".  The lake *is* that
 *   source.  Nothing in the code depends on it; it costs one plate on the
 *   management hut and it is the reason there is water in the channel that runs
 *   past the level crossing.
 */
export const CHANNELS = [
  /**
   * 余水吐 -- a side-channel spillway at the crest's north-east end.
   *
   * Its head is 3.4 m out from the water on the upstream toe and its crest is
   * `LEVEL + 0.30`, so there is a real sill three metres wide between the lake and
   * the chute rather than a one-cell knife edge that a 1.5 m lattice could round
   * off.  It then crosses the embankment's crest -- which is what puts the small
   * slab bridge on the management road, and is where these are.
   */
  {
    id: 'spill',
    half: 1.6, wall: 0.9,
    pts: [
      [158.6, -42.6, LEVEL + 0.30],   // the weir: 満水位 plus a hand, dry in April
      [157.4, -38.8, LEVEL + 0.05],
      [155.6, -34.6, 3.10],           // through the crest, under the road
      [153.4, -31.4, 3.00],
      [151.0, -29.0, 2.95],
    ],
  },
  {
    id: 'outfall',
    half: 1.9, wall: 0.7,
    pts: [
      [151.0, -29.0, 2.95],
      [143.0, -27.4, 2.20],
      [134.0, -26.6, 1.40],
      [124.0, -26.2, 0.55],
      [116.0, -26.0, 0.10],
      [110.0, -25.4, -0.10],          // 6 m short of the 用水路's east headwall
    ],
  },
  /* 流れ込み -- the gully that feeds the lake from ひばり山's south-east flank.
   * It comes in at the south-west corner because that is the only direction
   * there is any catchment: everything else round this basin is its own rim. */
  {
    id: 'inflowSW',
    half: 1.2, wall: 0.8,
    pts: [
      [158.0, -127.0, LEVEL - 0.30],
      [154.0, -133.0, LEVEL + 0.70],
      [149.0, -140.0, LEVEL + 2.40],
      [144.0, -147.0, LEVEL + 4.40],
    ],
  },
  /* and a much smaller one on the east shore, off the east rim */
  {
    id: 'inflowE',
    half: 0.9, wall: 0.8,
    pts: [
      [250.6, -90.0, LEVEL - 0.25],
      [256.0, -89.0, LEVEL + 0.90],
      [262.0, -87.0, LEVEL + 2.60],
    ],
  },
];

const CHAN_SEGS = [];
for (const c of CHANNELS) {
  for (let i = 0; i < c.pts.length - 1; i++) {
    const a = c.pts[i], b = c.pts[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    CHAN_SEGS.push({ c, a, b, dx, dz, l2: dx * dx + dz * dz || 1e-6 });
  }
}

/** Ceiling a carved channel imposes at a point.  `Infinity` away from one. */
export function channelAt(x, z) {
  let h = Infinity;
  for (const s of CHAN_SEGS) {
    let t = ((x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz) / s.l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.a[0] + s.dx * t, pz = s.a[1] + s.dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist > s.c.half + 8.0) continue;
    const inv = s.a[2] + (s.b[2] - s.a[2]) * t;
    const v = dist <= s.c.half ? inv : inv + (dist - s.c.half) * s.c.wall;
    if (v < h) h = v;
  }
  return h;
}

/** A channel's own centreline, resampled -- the lining and the road read this. */
export function channelLine(id, step = 1.0) {
  const c = CHANNELS.find((k) => k.id === id);
  const out = [];
  for (let i = 0; i < c.pts.length - 1; i++) {
    const a = c.pts[i], b = c.pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  out.push([...c.pts[c.pts.length - 1]]);
  return { pts: out, half: c.half };
}

/* ------------------------------------------------------------------ *
 * The one function `hills.js` calls.
 * ------------------------------------------------------------------ */

/**
 * The lake's surface at a point, given whatever the range was going to do.
 *
 * Five layers, in this order, and the order is the argument:
 *
 *   1. the embankment and the rim *raise* the ground (`max`), because both are
 *      fill.  Both are faded to the buried skirt by `keep`, the same keep-out
 *      mask the summits go through -- without it the lake's north rim, whose
 *      outer flank falls toward the equator, would build a hillside straight
 *      through the railway's flat trough at every longitude it reaches.
 *   2. inside the shoreline the bed *replaces* it, because a lake bed is not the
 *      hillside with water on it -- a `min` here would let a −1.3 m patch of
 *      buried apron out in the middle of the basin punch a hole in the bed;
 *   3. outside the shoreline the bank *cuts* it (`min`), so a park frontage is a
 *      graded lawn and a wooded shore is the hillside's own toe trimmed to the
 *      water;
 *   4. and hands back to the natural surface over ten metres;
 *   5. the carved channels cut everything (`min`), embankment and rim included.
 *
 * @param keep `hills.js`'s keep-out mask at this point, 0..1.
 */
export function lakeGround(natural, x, z, keep) {
  const n = lakeNear(x, z);
  if (!n) return natural;

  let h = natural;
  /* A fill term whose baseline is `LEVEL` cannot simply be multiplied by the
   * mask -- that would scale it toward zero, which is 3.4 m *below* the water.
   * It is faded toward the buried floor instead, which is what `-SKIRT` is, so a
   * masked rim disappears into the apron rather than into a shelf. */
  const FLOORY = -1.30;
  const fade = (v) => (v === -Infinity ? -Infinity : FLOORY + (v - FLOORY) * keep);
  const dm = fade(damAt(x, z));
  if (dm > h) h = dm;
  const rm = fade(rimAt(x, z, n));
  if (rm > h) h = rm;

  if (n.d >= 0) {
    const t = clamp(n.d / n.dr, 0, 1);
    h = LEVEL - n.dm * t * t * (3 - 2 * t);
  } else {
    const s = -n.d;
    const bank = LEVEL + n.bank * s;
    const cut = bank < h ? bank : h;
    const w = sstep(n.hi, n.ho, s);
    h = cut + (h - cut) * w;
  }

  const ch = channelAt(x, z);
  return ch < h ? ch : h;
}

/**
 * How much of the hills' roughness a point keeps: 0 in the water and for two
 * metres outside it, and 1 only once the ground is well clear of the surface.
 *
 * The two texture octaves are ±0.3 to ±2 m by design, and applied to a surface
 * whose shoreline is a contour they do not add texture -- they add **islands**,
 * lagoons and a coastline that looks chewed.  Same argument as `trailDamp`: a
 * made surface is graded, and the water's edge is the most made surface in this
 * world after the road.
 *
 * **It is damped by height above the water as well as by distance, and that is
 * the half that keeps the lake in.**  The reed flat's bank is 0.10, so twenty
 * metres out the rim is still only 1.9 m above the surface -- and ±2 m of `MICRO`
 * there is a channel out of the basin.  Distance alone cannot express that;
 * `h` can, and it is the node's own pre-roughness height, so the release is
 * exactly where the ground has the headroom to take it.
 *
 * @param h the node's height before any roughness is added.
 */
export function lakeDamp(x, z, h) {
  const n = lakeNear(x, z);
  if (!n) return 1;
  if (n.d > -2.0) return 0;
  const byDist = clamp((-n.d - 2.0) / 10.0, 0, 1);
  const byRise = clamp((h - LEVEL - 0.9) / 2.4, 0, 1);
  return byDist < byRise ? byDist : byRise;
}

/* ------------------------------------------------------------------ *
 * The two checks.
 * ------------------------------------------------------------------ */

/**
 * Freeboard: the lowest `field - LEVEL` anywhere on the land side of the
 * shoreline, walked at 1 m and stepped outward to `HAND_OUT`.
 *
 * Useful for tuning a stretch, but it is **not** the safety check -- a rim can
 * have a metre of freeboard everywhere along the shoreline and still drain
 * through a gully twenty metres out.  `lakeLeakCheck` is the one that means
 * something.
 *
 * `fieldAt` is passed in rather than imported, so this file still has no
 * dependency on `hills.js`.
 */
export function lakeSpillCheck(fieldAt, step = 1.0) {
  let worst = Infinity, at = null;
  for (const s of SEGS) {
    const n = Math.max(1, Math.round(s.len / step));
    const nx = s.dz / s.len, nz = -s.dx / s.len;      // one of the two normals
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const px = s.a.x + s.dx * t, pz = s.a.z + s.dz * t;
      const sgn = inLakePoly(px + nx * 0.6, pz + nz * 0.6) ? -1 : 1;
      for (let o = 1.0; o <= 32.0; o += 1.0) {
        const qx = px + nx * sgn * o, qz = pz + nz * sgn * o;
        if (inLakePoly(qx, qz)) continue;             // a concave corner
        /* Skip anything a carved channel is holding down.  The 余水吐 and the
         * 放水路 are *meant* to be below the water level -- that is what a
         * spillway is -- and without this the freeboard number is always the
         * chute's invert and never says anything about the rim. */
        if (channelAt(qx, qz) < LEVEL) continue;
        const free = fieldAt(qx, qz) - LEVEL;
        if (free < worst) { worst = free; at = [+qx.toFixed(1), +qz.toFixed(1)]; }
      }
    }
  }
  return { freeboard: +worst.toFixed(3), at };
}

/**
 * **The check that matters: does the water stay in?**
 *
 * Flood-fills the region `field < LEVEL` from a seed in the middle of the basin
 * and reports how far it gets.  That is the actual physics, and it is the only
 * test that catches the failure mode this lake has -- a continuous path of ground
 * below the water level leading out of the bowl, which renders as absolutely
 * nothing, because the water surface is flat and simply keeps going.
 *
 * Two numbers come back.  `escaped` is how far outside the shoreline the fill
 * reached; anything over about 30 m is a breach, and `at` is where.  `areaM2` is
 * the wetted area the fill found, which should agree with `lakeStats` -- if it is
 * much larger, the lake has joined something it should not have.
 *
 * The grid is 1.5 m, i.e. the lattice's own cell, because a coarser one can step
 * over a one-cell sill and a finer one cannot find anything the ground does not
 * already say.
 */
export function lakeLeakCheck(fieldAt, step = 1.5) {
  const x0 = BB.x0 - 90, x1 = BB.x1 + 90;
  const z0 = BB.z0 - 90, z1 = BB.z1 + 90;
  const nx = Math.ceil((x1 - x0) / step) + 1;
  const nz = Math.ceil((z1 - z0) / step) + 1;
  const seen = new Uint8Array(nx * nz);
  const key = (i, j) => i * nz + j;
  // a seed in the deepest part of the main basin
  const seedX = 160, seedZ = -80;
  const si = Math.round((seedX - x0) / step), sj = Math.round((seedZ - z0) / step);
  const q = [key(si, sj)];
  seen[key(si, sj)] = 1;
  let head = 0, wet = 0, escaped = 0, at = null;
  while (head < q.length) {
    const k = q[head++];
    const i = Math.floor(k / nz), j = k % nz;
    const px = x0 + i * step, pz = z0 + j * step;
    wet++;
    if (!inLakePoly(px, pz)) {
      const n = lakeNear(px, pz);
      const out = n ? -n.d : LAKE_REACH + 30;
      if (out > escaped) { escaped = out; at = [+px.toFixed(1), +pz.toFixed(1)]; }
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || ni >= nx || nj < 0 || nj >= nz) continue;
      const nk = key(ni, nj);
      if (seen[nk]) continue;
      if (fieldAt(x0 + ni * step, z0 + nj * step) >= LEVEL) continue;
      seen[nk] = 1;
      q.push(nk);
    }
  }
  return {
    escaped: +escaped.toFixed(1), at,
    areaM2: Math.round(wet * step * step),
    contained: escaped < 30,
  };
}

/** Water area and shoreline length, from the field rather than the polygon. */
export function lakeStats(fieldAt, step = 1.0) {
  let area = 0, deep = 0, shallow = 0, maxDepth = 0, at = null;
  for (let x = BB.x0 - 4; x <= BB.x1 + 4; x += step) {
    for (let z = BB.z0 - 4; z <= BB.z1 + 4; z += step) {
      const d = LEVEL - fieldAt(x, z);
      if (d <= 0) continue;
      if (!inLakePoly(x, z)) continue;
      area += step * step;
      if (d < 0.9) shallow += step * step;
      if (d > 1.9) deep += step * step;
      if (d > maxDepth) { maxDepth = d; at = [+x.toFixed(1), +z.toFixed(1)]; }
    }
  }
  return {
    areaM2: Math.round(area),
    shallowM2: Math.round(shallow),
    deepM2: Math.round(deep),
    maxDepth: +maxDepth.toFixed(2),
    deepestAt: at,
  };
}
