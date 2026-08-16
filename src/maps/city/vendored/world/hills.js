import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { sstep, clamp, mulberry32, rngKit, bake, trs } from '../core/util.js';
import { groundY, TERRAIN_DROP } from './street.js';
import { CANAL, CANAL_X0, CANAL_X1 } from './landform.js';
/* ひばり湖.  The lake is a *third* thing shaping this field, after the summits
 * and the keep-outs, and it lives in its own file for the same reason
 * `landform.js` does: the hole has to be describable without knowing anything
 * about what fills it.  See the long note at the top of `lakeform.js` for why the
 * water is above the town's datum rather than below it. */
import { LEVEL as LAKE_LEVEL, lakeGround, lakeDamp, lakeNear, inLakePoly } from './lakeform.js';

/* ------------------------------------------------------------------ *
 * 裏山 -- the low hills.
 *
 * The town has been flat since the relief was switched off, and this is what
 * replaces it: a genuinely large area of low, broad, gently rolling hill land
 * behind the school, wrapping round the east side of the estate and running
 * north up the west side to cross the railway, which goes through it in a
 * tunnel.  Nothing in it is above 17 m.  It is the first thing in this world
 * that is landscape rather than town, and the first walkable ground that is not
 * a plane.
 *
 * ------------------------------------------------------------------ *
 * WHY IT IS NOT `reliefAt` TURNED BACK ON
 *
 * `planet.js` already had low hills, behind one constant, and the reason they
 * are off is written out at length there: the world has **two** ground surfaces
 * 65 mm apart -- the graded terrain grid in `street.js` and the planet sphere --
 * and the relief displaced only the sphere.  Anywhere it passed 65 mm the sphere
 * came up through the grid, and through the road, the lanes, the pads, the kerbs
 * and the tyres of anything parked on them: 7 346 m² of the walkable bounds and
 * 21 colliders standing on ground the sphere had risen through.
 *
 * Displacing both surfaces does not fix it either, because the road, the lanes
 * and every pad in the world are authored against `groundY(z)` alone -- a
 * function of latitude only -- so a hill under any of them cuts through the
 * paving no matter which surfaces carry it.
 *
 * So the hills here are **a third surface, on top of both**, and the two
 * existing ones are not touched at all:
 *
 *   - `hillAt(x, z)` is an analytic height added alongside `reliefAt` by
 *     `world.heightAt` and `ctx.groundAt`, so the player walks it and every
 *     builder seats props on it for free.  It is deliberately **not** folded
 *     into `reliefAt` itself, because `buildPlanet` samples that function too --
 *     and the sphere must stay flat.  Its facets are 5.4 m against this
 *     lattice's 6.0 m, so a sphere carrying the same field would chord across
 *     the creases and poke up to 0.14 m through the hill mesh in a pattern
 *     nobody could diagnose.  Flat, it is 65-80 mm under everything, always.
 *   - the drawn hill is its own mesh at `groundY(z) + field - TERRAIN_DROP`,
 *     i.e. in exactly the same relationship to the reference plane as the flat
 *     terrain grid is.  Where the field is positive it is above the grid and
 *     hides it; where the field is negative it is *below* the grid and the grid
 *     is the ground.  The two surfaces meet along the contour `field = 0`, which
 *     is a line and not an area, so there is nothing to z-fight over.
 *   - and the field is **exactly zero** over every square metre of built ground,
 *     guaranteed by the keep-out list below and verified numerically rather than
 *     by eye (see `hillSafety`).
 *
 * The cost of doing it this way is that the hills are only *near* the town, not
 * under it, which is exactly what was wanted anyway.
 *
 * ------------------------------------------------------------------ *
 * WHY IT IS A LATTICE
 *
 * The art direction is low-poly-but-accurate, and a smooth analytic hill sampled
 * on the 2 m terrain grid is neither: it comes out as a soft blob with tonal
 * contours and almost nothing for the ink pass to find.  So the field is
 * **piecewise linear over a 6 m triangular lattice** -- `nodeAt(i, j)` is the
 * only place a height is ever computed, and both the mesh and `hillAt` read it
 * through the same two-triangle interpolation.  That buys three things at once:
 *
 *   - the drawn surface is genuinely faceted, non-indexed and flat-shaded, so
 *     every facet edge is a crease the depth-difference ink pass draws;
 *   - the walkable surface and the drawn surface are the same surface, to the
 *     bit, with no clearance fudge anywhere;
 *   - and the whole thing is one cheap pure function, so a builder can ask what
 *     height the ground is at a point before any of it has been built.
 *
 * `subdivideLongEdges` bisects the 6 m facets on the way to the sphere, and that
 * does not soften them: the midpoint of an edge of a planar triangle is on the
 * plane, so the facet survives the bake as a facet.
 *
 * ------------------------------------------------------------------ *
 * WHAT SETS THE SLOPES
 *
 * Every summit is a quartic bump `h·(1 - d²)²` over an ellipse, combined with a
 * screen blend rather than a sum so two overlapping summits read as one ridge
 * without adding to twice the height.  The ground only rises where the blended
 * shape beats `PED`, a 2.6 m pedestal -- and that, not the keep-out mask, is
 * what puts the toe of every slope where it is.  It matters which way round:
 *
 *   a mask ramp is 12 m wide, so if the mask were doing the work a 16 m hill
 *   would climb out of the ground at 55°.  A quartic bump crosses the pedestal
 *   at d = 0.773 with a gradient of 1.25·h/r, so a 16 m summit on a 56 m radius
 *   comes out of the ground at 20° and reaches its top 43 m later.  That is the
 *   difference between a hill and a wall, and it is why the radii here are all
 *   between 26 and 86 m for heights between 8.5 and 17 m.
 *
 * The keep-out mask is a **safety net**: it guarantees `hillAt` is 0 over built
 * ground, and if it ever has to bite it will make a cliff -- which is a much
 * better failure outside the town than a hillside through the school's paving.
 *
 * But it *does* bite, unavoidably, and that is the second half of the story.
 * The school's back wall is at z = -86 and the hill-foot road behind it wants
 * the ground flat to z = -95, so the mask is zero there whatever the summits
 * say.  A mask ramp is 13 m wide; multiply a 16 m bump by a ramp that short and
 * the ground climbs out of the flat at 40-45° -- measured, on the first pass:
 * 0.78 at x = 30 between z = -104 and -110.  Widening the ramp does not fix it
 * either.  Going from 0 at z = -96 to 16 m at z = -140 averages 20° whatever
 * shape you choose, and the local maximum is always some multiple of that.
 *
 * So there is a **slope limiter**, and it is the thing that actually makes the
 * word "gentle" true rather than hoped for.  After the lattice is built, a
 * relaxation pass repeatedly *lowers* any node that stands more than
 * `maxSlope · CELL` above a neighbour, until nothing does.  It only ever lowers,
 * which is what keeps every guarantee above intact -- the keep-out stays zero,
 * the buried apron stays buried -- and it converges to the highest surface under
 * the designed one whose gradient is everywhere inside the limit.  Twelve metres
 * of the massif's toe are shaped by it and the summits are untouched, because a
 * 16.5 m summit 45 m behind a pinned toe is already inside a 1-in-2.
 *
 * And there is a trap in it, which cost a pass: **a limiter pinned along a
 * straight line produces a perfectly straight, perfectly uniform ramp.**  The
 * first version had one keep-out rectangle whose south edge ran the whole width
 * of the town, and the twenty-four metres behind the school came out as an
 * exactly constant 1-in-2 plane -- the same height at x = 0, 30 and 60, to the
 * centimetre.  It read as an embankment, and worse, there was no oblique route up
 * it: the field varied only with latitude, so every possible path was either
 * straight up the fall line or dead level, and the main trail measured 0.52.  The
 * fix is in `KEEP`: the town's rectangle stops at z = -80 and only the school and
 * its two roads reach -96, so the pinned line has a twenty-metre step in it and
 * the toe crosses the map on a diagonal.  That diagonal is what the main trail
 * traverses, and it is why the climb is 1 in 6 instead of 1 in 2.
 *
 * The limit is **not uniform**, and the exception is the interesting part: it is
 * 1.9 inside the two ring corridors and 0.52 everywhere else.  A railway
 * cutting *is* steep -- that is what a cutting is -- and the tunnel spur has to
 * rise 17 m in the 12 m between the lineside fence and its own crest or the
 * mountain the railway goes through is a hummock.  The channel's valley sides
 * are the same argument.  Both are engineered faces that `tunnel.js` and
 * `canal.js` retain and face; a wooded hillside behind a school is not, and gets
 * the 27° limit.
 * ------------------------------------------------------------------ */

/**
 * Lattice pitch.  Also the facet size, so it is an art decision as much as a
 * sampling one -- and it is **cheaper** than the 6 m it started at, for the same
 * reason `street.js`'s terrain grid is cheaper at 2 m rows than at 2.5 m: the
 * bake's `subdivideLongEdges` splits anything over 4 m, and a 6 m cell has an
 * 8.49 m diagonal that takes three passes to get under the limit, so 2 200
 * triangles arrived as 18 000.  A 3 m cell's diagonal is 4.24 m and splits once,
 * so 8 900 arrive as about 13 000 -- four times the facets on screen for less
 * geometry than the coarse version cost.
 *
 * And it has to be about this fine, which was the second thing the first render
 * showed: standing *on* a hillside you are two or three metres from the ground,
 * so at 6 m a single facet was most of the frame and the slope read as a wall
 * of flat card.  At 3 m the near ground is six or seven facets across, which is
 * the density the roofs and walls in the town are drawn at.
 *
 * 3.0 also divides every tunnel portal plane (-132, -96, 108, 138) and every
 * notch edge (-15, 21, 24) exactly, which is what lets each cap meet the field
 * with no seam.
 */
export const CELL = 1.5;

/* **1.5, halved from 3.0, and the reason is a close-up rather than a number.**
 *
 * Everything above is still true and 3.0 was a good decision at the time: it was
 * *cheaper* than the 6.0 it replaced (a 6 m cell's 8.49 m diagonal takes three
 * passes of `subdivideLongEdges` to get under the limit, so 2 200 triangles
 * arrived as 18 000) and the note argued it matched the density the town's roofs
 * and walls are drawn at.
 *
 * What it does not survive is standing on the hill.  From the toe of the massif a
 * single 3 m facet is a third of the frame, and because the surface is very nearly
 * planar over tens of metres — measured, the normal turns 7.0° per facet pair at
 * the median — adjacent facets land in the same cel band and read as *one* flat
 * card ten metres across with an ink line down it.  Coarse is exactly the word.
 *
 * 1.5 is the only other value that works, and that is arithmetic rather than
 * taste: every notch edge and portal plane has to stay on a lattice line or the
 * tunnel caps stop meeting the field, and −132, −96, 108, 138, −15, 21 and 24 are
 * all multiples of 1.5 and **−15 is not a multiple of 2.0**.  It also divides 3.0,
 * so every line that was on the old lattice is still on this one.
 *
 * It costs about four times the nodes (45 000 against 11 400) and about three
 * times the drawn triangles — but the diagonal is 2.12 m now, under the bake's
 * split threshold, so nothing is subdivided on the way to the sphere and the
 * post-bake count only rises from 22 k to about 60 k, in the same six draw calls.
 *
 * **And it is worthless on its own.**  Halving the cell halves the normal turn per
 * facet, so without a roughness octave at the new scale the result is smaller flat
 * cards rather than fewer of them.  See `ULTRA`. */

/** How far below the reference plane the buried apron round the hills sits.
 *
 * The field is clamped to this at the node level -- *before* interpolation, so
 * the mesh and `hillAt` still agree exactly -- and any cell whose four nodes are
 * all on the floor is not emitted at all.  That is what keeps a 30 000 m² mesh
 * from being drawn under the whole town. */
const SKIRT = 1.30;

/** The pedestal.  See the note above: this is what puts the toe of every slope. */
const PED = 2.60;

/** Screen-blend ceiling, so no pile-up of summits can produce a mountain. */
const HMAX = 21.0;

/* ------------------------------- the summits ------------------------------- */

/**
 * Every hill in the world, as an elliptical quartic bump.
 *
 * Three groups, and the shape of the whole range is in the grouping:
 *
 *  - **the south massif** is the 後山 proper -- the land behind the school, and
 *    the only part with paths on it.  Its near summit (A1) is 43 m behind the
 *    school's back wall and 16.5 m up, which is the one number the whole
 *    district is composed around: the 展望台 on its north shoulder looks back
 *    *down* on the school's roof, the ground and the gym.
 *  - **the west arm** runs north from the massif's west end, crosses the
 *    drainage channel's valley and then the railway, which tunnels through W3 --
 *    a spur deliberately centred 16 m *north* of the track so its mass is on one
 *    side and the railway clips its southern toe.  A range that ends at the
 *    railway is scenery; one that crosses it is geography.
 *  - **the east shoulder** is the backdrop 二丁目 and 六丁目 never had.  It has
 *    no tunnel: the railway crosses it through a broad col, because two
 *    tunnels on a 1 005 m loop is a model railway rather than a town.
 *
 * Nothing may reach past x ±168 or z -196..108 -- the mesh window below -- and
 * the far-south fringe is faded out rather than cut, because a cut edge on a
 * 10 m hill is a cliff standing in the sky.
 */
const SUMMITS = [
  /* --- the south massif: 後山 ---
   * The three low ones first.  They are what stops the near slope being a plane:
   * with the toe pinned at the keep-out and the summits 45 m back, the limiter
   * would otherwise carve a perfect constant gradient from one to the other, and
   * a perfect constant gradient is the one thing a hillside never is.  8 m and
   * 7 m, on radii wide enough that their own toes are gentler than the limit. */
  { x: 24, z: -116, rx: 76, rz: 30, h: 8.0 },     // A0a the foothill behind the school
  { x: 72, z: -112, rx: 50, rz: 26, h: 7.0 },     // A0b behind the gym and the ground
  { x: -30, z: -114, rx: 54, rz: 26, h: 7.0 },    // A0c behind the school road
  { x: 30, z: -140, rx: 66, rz: 56, h: 16.5 },    // A1  the near summit; the 展望台 is on it
  { x: -26, z: -136, rx: 60, rz: 52, h: 14.0 },   // A2  west, behind 五丁目 and the school road
  { x: 86, z: -134, rx: 58, rz: 50, h: 14.5 },    // A3  east, behind the gym
  { x: 22, z: -162, rx: 80, rz: 40, h: 17.0 },    // A4  the back ridge, the highest thing here
  { x: -84, z: -150, rx: 62, rz: 48, h: 14.0 },   // A5  the south-west shoulder
  { x: 104, z: -164, rx: 56, rz: 44, h: 14.5 },   // A6  the south-east shoulder
  { x: -124, z: -122, rx: 44, rz: 46, h: 12.5 },  // A7  the west turn, into the arm
  { x: 124, z: -118, rx: 44, rz: 46, h: 12.5 },   // A8  the east turn, into the shoulder
  /* --- the west arm, north across the channel and the railway --- */
  { x: -118, z: -88, rx: 46, rz: 44, h: 13.0 },   // W1
  { x: -122, z: -52, rx: 44, rz: 34, h: 13.5 },   // W2  its north tail is in the channel valley
  { x: -112, z: 16, rx: 46, rz: 56, h: 17.0 },    // W3  the tunnel spur -- see TUNNEL below
  /* The two banks that make the tunnel's approaches into cuttings rather than
   * into a knoll standing on a plain.  Both sit north of the track, because the
   * spur's mass is north and a 片切り -- bank one side, open field the other -- is
   * both what this ground would actually be and the better picture: the train is
   * lit from the south and read against the bank. */
  { x: -140, z: 24, rx: 28, rz: 30, h: 13.5 },    // W3b the west approach's bank
  { x: -90, z: 26, rx: 26, rz: 28, h: 12.0 },     // W3c the east approach's bank
  { x: -108, z: 56, rx: 42, rz: 32, h: 12.5 },    // W4
  { x: -98, z: 84, rx: 36, rz: 26, h: 9.5 },      // W5  the arm dies out north of the town
  /* --- the east shoulder --- */
  { x: 118, z: -84, rx: 44, rz: 42, h: 12.5 },    // E1
  { x: 124, z: -48, rx: 42, rz: 32, h: 12.5 },    // E2
  { x: 122, z: 20, rx: 42, rz: 34, h: 12.5 },     // E3  north of the col the railway crosses
  { x: 110, z: 58, rx: 38, rz: 30, h: 11.0 },     // E4
  { x: 102, z: 88, rx: 34, rz: 26, h: 8.5 },      // E5
  /**
   * E2b -- the ridge between the railway and the drainage channel at the col,
   * and the whole reason 東山トンネル can be there.
   *
   * E2 and E3 put 9-10 m of hill on either side of the line at this longitude,
   * which is what the survey found -- but E2's support stops at z = -16 and the
   * channel's corridor flattens everything from -30 to -10 anyway, so the
   * *near* band on the south side measured 0.0 and the line ran along the edge
   * of a hill rather than through one.  This is the 24 m of ground between the
   * two rings, given the mass it needs to read as the range continuing across.
   *
   * Narrow in z on purpose -- rz 15 against E2's 32 -- because both corridors
   * clip it to the 10 m between them and anything deeper is simply thrown away.
   * **Wide in x, and that is measured rather than chosen**: at rx 30 the ridge
   * read 3.1 m at the portal plane instead of the 7 it was drawn for, because a
   * quartic bump is down to 56 % of its height half a radius out and the 2.6 m
   * pedestal then takes most of what is left.  rx 60 puts 7-8 m at both portals
   * and 10 at the crest, which is what the north flank carries.
   *
   * What survives is a ridge with a cut face on the railway side and a fall to
   * the channel on the other, which is a 隘路 -- and `tunnel.js` retains both
   * faces, which is what makes 東山's approach a two-sided cutting and not a
   * 片切り.  Both faces run at the corridor limit of 1.9, which is steep and is
   * meant to be: `slopeLimitAt` allows it inside the corridors for exactly this.
   */
  { x: 123, z: -13, rx: 60, rz: 15, h: 13.0 },    // E2b the col's south ridge
  /* ------------------------- ひばり湖's rim -------------------------
   * The lake sits in the valley *behind* the east shoulder, so the shoulder
   * itself (E1 at (118, -84), A8 at (124, -118)) is already its west rim and the
   * divide between it and the town -- which is the whole geography of the place:
   * you come over the shoulder from the school's hill-foot road and the water is
   * on the other side.  What was missing was the other three sides, because east
   * of x = 160 the range simply stopped and the ground was flat to the mesh edge.
   *
   * Every one of these is placed against a *measured* requirement rather than a
   * shape: `lakeSpillCheck` walks the shoreline, steps outward, and reports the
   * lowest freeboard on the whole rim.  A lake is the one thing in this world
   * that fails globally -- water finds the low point, and a 0.3 m notch in a
   * rim 400 m round drains the basin without rendering as anything at all,
   * because the surface is flat and simply keeps going.
   *
   * The north pair are the interesting ones.  They stand between the lake and the
   * railway, which is 24 m of ground carrying an 11 m ridge, so the same hill is
   * the lake's far shore seen from the park *and* the bank the train runs past --
   * and their north flanks are cut off by the rail corridor exactly like every
   * other hill on the equator, which is what lands them on the lineside instead
   * of on the track. */
  { x: 170, z: -26, rx: 46, rz: 30, h: 11.5 },    // LN1 the north rim, west half
  { x: 214, z: -24, rx: 46, rz: 30, h: 11.0 },    // LN2 the north rim, east half
  { x: 252, z: -36, rx: 34, rz: 32, h: 10.0 },    // LN3 the north-east corner
  { x: 266, z: -76, rx: 34, rz: 42, h: 11.0 },    // LE1 the east rim
  { x: 258, z: -118, rx: 34, rz: 34, h: 10.5 },   // LE2 the south-east corner
  { x: 214, z: -152, rx: 56, rz: 34, h: 11.5 },   // LS1 the south rim
  { x: 158, z: -146, rx: 42, rz: 32, h: 11.0 },   // LS2 the south-west, onto A6/A8
  /* LP -- the peninsula, and it is the most load-bearing 20 m in the district.
   *
   * On a 160 m planet the water surface is only visible for 23 m from a 1.7 m
   * eye, so a lake with nothing standing in it is a pond with haze behind it.  A
   * wooded spit reaching 32 m out from the south shore puts an object of *known
   * size* at the distance where the curvature bites, which is what gives the
   * basin its depth from the park, from the 桟橋 and from the cafe's terrace.
   *
   * Its height is not this number: `lakeform.js`'s bank profile trims it to
   * `LEVEL + 0.34 · s` and its spine is only 9 m from water on both sides, so
   * what actually stands there is about 3 m above the surface.  This has to be
   * comfortably *over* that or the trim has nothing to cut and the spit drowns. */
  { x: 188, z: -106, rx: 21, rz: 18, h: 11.0 },   // LP the peninsula
];

/* ------------------------------ the keep-outs ------------------------------ */

/**
 * Ground the hills may not touch, as rectangles with a ramp width.
 *
 * **Measured, not remembered** -- the 四丁目 lesson, and the stakes here are the
 * whole town rather than one lane.  Every collider in the world was bucketed by
 * 8 m of latitude and the extreme x of each band read off:
 *
 *     z band   built x            z band   built x
 *      -80      1.5 .. 62.7        16     -48.3 .. 69.8
 *      -72    -25.6 .. 66.0        24     -47.4 .. 71.8
 *      -64    -33.9 .. 66.0        32     -36.2 .. 69.9
 *      -56    -34.4 .. 66.0        40     -52.3 .. 77.3
 *      -48    -34.4 .. 62.6        48     -52.2 .. 78.2
 *      -40    -52.8 .. 60.0        56     -50.1 .. 79.3
 *      -32    -58.0 .. 57.8        64     -61.3 .. 79.5
 *      -24    -78.1 .. 55.7        72     -61.3 .. 29.1
 *      -16    -78.2 .. 55.8        80     -61.3 .. -2.3
 *       -8    -78.2 .. 52.5        88     -54.2 .. -12.7
 *        0    -52.3 .. 62.0        96     -49.5 ..  -2.8
 *        8    -44.0 .. 62.0       104     -50.6 ..  -5.4
 *
 * so the town is x -78.2 .. 79.5, z -80.6 .. 107.7, with one tail: 一丁目 runs
 * out to x = -78 only in the four bands between the channel and the railway.
 * `TOWN` covers the body of it with the school's new east and north walls
 * included (x 84, z -86) plus the hill-foot road behind them; `ICHOME` covers
 * the tail, which is why the west arm can come as close to the railway as it
 * does.  Everything else in that list has at least 6 m of margin.
 *
 * Two things also circle the planet at a fixed height and must stay in a flat
 * trough at **every** longitude, not just here:
 *
 *   - the railway on the equator.  Its lineside fence is at z ±3.25 and its
 *     masking walls at ±4.8, so the corridor holds the ground flat to ±7.5 and
 *     lets it rise from there -- which is a railway cutting, and is what the
 *     tunnel's approach is made of.
 *   - the drainage channel at z = -24, whose made ground reaches ±6 m and whose
 *     railings run the whole way round at ±2.4.  A tighter corridor, 6.5 to 14,
 *     because the channel only ever needed to be in a valley floor and the band
 *     between it and the railway is 24 m wide in total.
 *
 * The two corridors combine with `min` rather than by multiplying: in that 24 m
 * band both are partly closed at once, and multiplying them flattens the ground
 * between the channel and the track to nothing instead of leaving the low
 * shoulder that is actually there.
 */
const KEEP = [
  /* The town proper.  Its south edge stops at z = -80 and not at the school,
   * which is the whole reason the toe of the massif is a diagonal rather than a
   * straight line -- see the note on the limiter.
   *
   * **The east edge was 95 and is 88.**  The table above says the built world
   * reaches x = 79.5, so 95 was 15 m of slack, and that slack was the thing
   * holding the col's south ridge down: the ramp ran 95..108, so at the west
   * portal plane the mask was still only 87 % open and E2b lost a metre and a
   * half of the height that puts the overlook above the mouth.  88 keeps 8.5 m
   * clear of anything built, which is more margin than any other entry in that
   * table has, and `hillSafety` still reads 0.00 over every collider. */
  { x0: -68, x1: 88, z0: -80, z1: 114, r: 13 },
  /* The school with its new walls (x 84, z -86), the hill-foot road behind them
   * (centre z -90) and the outer road up its east side (centre x 88). */
  { x0: -6, x1: 94, z0: -96, z1: -60, r: 13 },
  // ひばり台一丁目's west tail, between the channel and the railway
  { x0: -84, x1: -64, z0: -32, z1: 4, r: 11 },
];

/**
 * Where the railway tunnels through the range.  `tunnel.js` owns everything
 * built at these longitudes; this module owns the holes they go in.
 *
 * **It is a list, and that is the point.**  It was one object for as long as
 * there was one bore, and every consumer -- `nearBore` here, and the fence runs,
 * the masking walls and the catenary masts in `railway.js` -- read `TUNNEL.x0`
 * and `TUNNEL.x1` directly.  Adding a second bore that way means finding four
 * scattered longitude tests and doubling each one by hand, and the mast test is
 * *silent* when you miss it: a 6.6 m mast inside a lining is invisible from
 * outside the mountain.  Every one of them takes the union over this array now,
 * so a third bore is a row in a table.
 *
 * Both portal planes of both bores are on lattice lines on purpose (-132, -96,
 * 108 and 138 are all multiples of `CELL`), so each notch below is an exact
 * number of cells and its edges are exactly where the drawn hill's facet edges
 * already are.
 *
 * The two are deliberately *not* the same picture:
 *
 *  - **ひばり山トンネル**, in the west arm, is a **spur seen from one side**.
 *    The range's mass is all north of the line, the crest sits 2 m north of it,
 *    and the approach is a 片切り -- bank north, open field south.  So its
 *    walkway, its maintenance gate and both of its viewpoints are on the
 *    **south**, looking at a hillside.
 *  - **東山トンネル**, through the east shoulder, is a **col**.  There is hill on
 *    both sides of the line (E2 at (124, -48) south of it, E3 at (122, 20)
 *    north), the crest is dead over the track, and the approach is cut on both
 *    banks.  Its walkway, its gate and its railside viewpoint are on the
 *    **north**, and its overlook is on the south ridge -- the mirror of the
 *    other one at every point.
 *
 * That mirroring is not decoration.  Two portals on a 1 005 m loop are only
 * worth having if a player who has seen one does not think they have walked back
 * to it, and the thing that gives a portal away is which side the light and the
 * bank are on.
 */
export const TUNNELS = [
  {
    id: 'W',
    x0: -132,          // west portal plane
    x1: -96,           // east portal plane
    zS: -15,           // the cap's south edge -- the spur's toe, by the channel
    zN: 24,            // its north edge, where it hands back to the hill field
    zCrest: 2,         // the crest line, pushed north of the track like the spur
    crestMid: 17.0,    // crown height above the reference plane at mid-bore
    crestEnd: 12.2,    // and at the portal planes -- 5.7 m of cover over the arch
    /* The bore.  The crown has to clear the catenary and not the train: the
     * messenger wire is at 5.95 and the contact wire at 4.88, against a roof at
     * 3.96, so 6.5 is set by the wires with 0.55 m to spare.  6.6 m wide because
     * one side carries a 1.3 m maintenance walkway outside the ballast. */
    half: 3.3,         // half the bore's inside width
    spring: 3.2,       // springing line: side walls below, arch above
    arch: 3.3,         // the arch's rise above the springing -- crown at 6.5
    /** Which side the walkway, the gate and the lineside all live on. */
    walk: -1,          // south
    /** Which bank is cut.  0 means both -- see 東山 below. */
    bank: 1,           // north only: 片切り
    /* The canal corridor is left alone here, and that *is* the west arm's
     * character: the 24 m between the railway and the channel stays a flat
     * shelf, so the mountain is a nose reaching the line from the north.  The
     * col does the opposite. */
    narrowChannel: false,
    /**
     * Where the maintenance gate breaks the lineside fence, on `walk`'s side.
     *
     * -84.5 and not -89, which is where the railside viewing spot is: that spot
     * has its own safety railing along z = -7.5 from x -91.8 to -86.2, so a gate
     * on the same longitude would be behind it.  The gate is 1.7 m clear of the
     * railing's east end, which means you walk round the rail to reach it --
     * which is the right order anyway.  A gate you can step straight through
     * from a bench is a gate nobody reads as a gate.
     */
    gateX: -84.5,
  },
  {
    id: 'E',
    /* 30 m rather than 36: the col's usable saddle is x 108..138, where both
     * flanks still carry 6-7 m of hill at the portal plane, and pushing either
     * face further out puts it in ground that is falling away on both sides.
     * A different length from the other bore is also worth having for nothing. */
    x0: 108,
    x1: 138,
    /* South edge at the top of the ridge between the railway and the channel --
     * *not* further south, because the channel's own made ground reaches z = -18
     * and a cap edge over it would be a slab of hillside standing in the water. */
    zS: -15,
    zN: 21,
    zCrest: 0,         // a col's low point is where the line goes: dead centre
    /* Nearly level along the bore -- 13.2 in the middle against 11.4 at the
     * faces -- because that is what a col is: a broad low ridge the line crosses,
     * not a peak it burrows under.  ひばり山's spur runs 12.2 to 17.0 over the same
     * 36 m and reads completely differently for it.
     *
     * 11.4 at the faces is also what puts hillside *above* the coping: the coping
     * is capped at `CROWN + 2.6` = 9.1, so at the first value tried (10.2) there
     * was one metre of green over it and the portal read as a free-standing wall
     * with a hedge on top.  2.3 m of hillside is a portal set into a hill. */
    crestMid: 13.2,
    crestEnd: 11.4,
    half: 3.3,
    spring: 3.2,
    arch: 3.3,
    walk: 1,           // north
    bank: 0,           // both: a col is cut on both sides
    /* **The one mechanism this bore needed that the other did not.**  The
     * channel's corridor holds the ground flat from z = -30.5 out to z = -10,
     * which is most of the 24 m between the two rings -- so at *every* longitude
     * in the world the band between the railway and the channel is dead flat,
     * and the survey that found this col reads 0.0 in it on both sides of the
     * planet.  A range cannot cross a railway if the ground beside the railway
     * is not allowed to rise.  Closing the corridor to 11 m over this longitude
     * lets the ridge stand between the two, which is both what a range does
     * where a drainage channel squeezes through it and the only way the hill
     * south of the line is anything but a rumour. */
    narrowChannel: true,
    /**
     * 88, which is **west of where the cutting starts** (x = 93).
     *
     * The obvious place is beside the portal, and it does not work: this bore is
     * cut on both banks, so the north retaining kerb runs x 93..108 at z = 5.7
     * and stands 0.65 m proud -- over the 0.38 m step limit, so it is a wall.  A
     * gate anywhere inside that run is a gate you cannot reach from the field
     * behind it, and nothing about a rendered frame would say so.  Out here the
     * ground is flat from the fence to the field and the walk in is 20 m of
     * lineside with the cutting deepening round you, which is the better
     * approach sequence anyway.
     *
     * 85 rather than 88 because the railside spot's own safety railing runs
     * x 88.2..93.8 -- the same constraint that moved the other bore's gate, at
     * the other end of the world.
     */
    gateX: 85.0,
  },
];

/** Backwards-compatible view of the notches, one per bore. */
export const NOTCHES = TUNNELS.map((t) => ({ x0: t.x0, x1: t.x1, z0: t.zS, z1: t.zN }));

/**
 * Why `zN` is 24 and not 12, which is the whole shape of this thing.
 *
 * The first version had the cap span z -12..12, symmetric about the track, and
 * it produced a **groove**.  The rail corridor holds the field flat to |z| = 7.5
 * and only lets it reach full height by 16, so at z = 12 the field is 2.3-4.6 m
 * while at 18 it is 8.7-13.6 -- so a cap that handed back at 12 came down from a
 * 15 m crown to 3 m and the hillside then climbed straight back to 13 m.  A
 * trench across the mountain's shoulder, 4 m deep and 36 m long.
 *
 * Handing back at 24 instead puts the join where the field is already 8-13.5 m,
 * so the cap's north slope is a gentle fall from the crown into the hillside and
 * there is nothing to groove.  The consequence is that the mountain is not
 * symmetric: it is a **spur reaching the railway from the north**, with the mass
 * on one side, the crown 2 m north of the track and a steep nose falling to the
 * channel's valley on the south.  Which is what W3's summit is placed at z = 16
 * for, and it is also the better picture -- a symmetric hill with a hole through
 * it reads as a model, a spur the line cuts through reads as a place.
 */

/**
 * The two places the hill field is *removed*: each tunnel's own footprint.
 *
 * A height field cannot have a hole in it -- take faces out and you get a
 * canyon from the crest to the floor, not a tunnel -- so the mass over each
 * track is `tunnel.js`'s own swept cap, and the field has to get out of its way
 * or the two surfaces fight over the same ground.  Inside these rectangles
 * `hillAt` answers with the flat grade and no cell is emitted; the cap covers
 * it, and the cap is built to meet `hillAt` exactly along z = `zS` and z = `zN`,
 * which are lattice lines, so the join is seamless in both directions.
 *
 * The player *can* walk into the bore -- that is new this round, and it is the
 * reason the single collider that used to fill the whole rectangle is a shell
 * now (`tunnel.js`).  Everything else in here is still the inside of a mountain.
 *
 * Every edge is on a lattice line -- -132, -96, 108, 138, -15, 21 and 24 are all
 * multiples of `CELL` -- so the cells removed are an exact set and the nodes *on*
 * the boundary keep their field values (the test is a strict inequality).  That
 * is what lets each cap sample `hillAt` along its own edges and land exactly on
 * the hill mesh's free edge, in both directions, with no seam and no overlap to
 * z-fight over.
 */

/* --------------------------- the mesh window ---------------------------
 * Lattice index bounds.  Wide enough that every summit's support closes inside
 * it, so the mesh always ends buried in the skirt rather than at a cut edge --
 * except due south, where `A4`'s back ridge does reach past it and is faded out
 * instead.  x is bounded by the terrain grid (±160) and not by the summits. */
/* **I1 was 112 and is 200**, i.e. the window's east edge moved from x = 168 to
 * x = 300, and that is ひばり湖.
 *
 * 300 rather than 270, and the extra 30 m is not slack -- it is the *outer* flank
 * of the lake's east rim.  `lakeform.js`'s rim profile reaches its crest 19 m
 * behind the shoreline (at x ≈ 260) and then falls at 0.42, so it needs another
 * 29 m to get back down to the buried apron.  Ended at 270 it would be cut off at
 * 1.5 m and the last cell would drop the whole way to the skirt: a 1 in 1 step
 * out in open ground, which is the "a cut edge on a 10 m hill is a cliff standing
 * in the sky" note two paragraphs up, at a smaller scale and just as wrong.
 *
 * It costs 39 % more nodes (62 913 against 45 225) and about 0.3 s at module
 * load.  `J` is untouched, because the lake is at z -34..-130 and going *south*
 * is the one direction this world cannot grow -- `player.js` clamps latitude to
 * ±0.24 of a circumference and, long before that, the equirectangular bake
 * squeezes x by `cos(z/R)`, which is 0.37 at z = -190.  A car at that latitude
 * would be a third of its own length.  Hence a lake to the *east* of the range
 * rather than behind it, with the east shoulder as the divide. */
const I0 = -112, I1 = 200;    // x -168 .. 300
const J0 = -128, J1 = 72;     // z -192 .. 108

/** Fade the far-south fringe to nothing before the window ends. */
const farFade = (z) => sstep(-196, -170, z);

/* ------------------------------------------------------------------ *
 * The field.
 * ------------------------------------------------------------------ */

/** Screen blend: `1 - Π(1 - b/HMAX)`, scaled back up.  Exact for one bump. */
function shapeAt(x, z) {
  let keepProd = 1;
  for (const s of SUMMITS) {
    const dx = (x - s.x) / s.rx;
    const dz = (z - s.z) / s.rz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= 1) continue;
    const b = s.h * (1 - d2) * (1 - d2);
    keepProd *= 1 - b / HMAX;
    if (keepProd <= 0) return HMAX;
  }
  return HMAX * (1 - keepProd);
}

/**
 * How close a longitude is to a bore: 1 within 20 m of either of its portals, 0
 * beyond 44 m, and the **union over every bore**.
 *
 * The railway corridor holds the ground flat to |z| = 7.5 and lets it reach full
 * height by 16, which is right for 950 m of the ring and wrong for the 70 m
 * either side of a tunnel mouth.  With the wide ramp the west approach came out
 * as a flat plain with a knoll popping out of it -- there was no cutting, and a
 * portal standing in open ground reads as a folly.  Inside this window the outer
 * edge closes to 9.5, so the bank climbs steeply from just behind the lineside
 * fence, which is what a 切取り is; the slope limiter's own corridor allowance
 * (1.9, see `slopeLimitAt`) is what lets it.
 *
 * `pick` selects which bores count, so the same window can be reused for a
 * corridor only one of them narrows.
 */
const nearBore = (x, pick) => {
  let k = 0;
  for (const t of TUNNELS) {
    if (pick && !pick(t)) continue;
    k = Math.max(k, sstep(t.x0 - 44, t.x0 - 20, x) * sstep(t.x1 + 44, t.x1 + 20, x));
    if (k >= 1) return 1;
  }
  return k;
};

/** The bores that squeeze the drainage channel's valley as well as the railway's. */
const narrowsChannel = (t) => t.narrowChannel;

/**
 * How much the drainage channel's corridor applies at a longitude: 1 over the
 * stretch the channel actually runs, 0 beyond it, over a 10 m fade.
 *
 * **This is what lets the range cross the channel.**  The corridor exists to keep
 * a hill from rising through the revetment, and for as long as the channel
 * circled the planet the corridor had to circle it too -- which cut a flat
 * 28 m corridor clean through both ends of ひばり山.  At the west arm the field
 * measured 9.3 m at z = -46, **zero from -34 to -15**, and then the tunnel's cap;
 * at the east col 9.9 m, zero from -30 to -18, then E2b's ridge.  Two mountains
 * with a level gap sawn through each of them, and the channel running down the
 * bottom of the gap.
 *
 * `canal.js` is bounded to `CANAL_X0..CANAL_X1` now and this follows it, from the
 * same two constants, so the two cannot drift apart.  Outside those bounds the
 * corridor is gone and `shapeAt` carries the range across z = -24 on its own:
 * measured 2.36 m at (-116, -24) and 2.25 m at (124, -24), with 9-10 m either
 * side, which is a saddle rather than a summit and is exactly what a col with a
 * watercourse in the bottom of it looks like.
 *
 * The 10 m fade is the whole "smooth and natural" of it: at the channel's own end
 * the corridor is still fully closed, so the ground there is dead flat and the
 * headwall stands on level made ground; ten metres beyond it the hill is at its
 * natural height.  On the centreline that is a rise of 0 to 1.9 m over 10 m --
 * gradient 0.19, which the limiter never touches (it allows 1.9 inside this
 * corridor) and which reads as a valley closing at its head.
 */
const CHAN_FADE = 8.0;
const chanHere = (x) => sstep(CANAL_X0 - CHAN_FADE, CANAL_X0, x)
  * sstep(CANAL_X1 + CHAN_FADE, CANAL_X1, x);

/** Everything that holds the hills off ground that is already spoken for. */
function keepAt(x, z) {
  // the two rings, combined with min -- see the note on KEEP
  const rail = sstep(7.5, 16.0 - 6.5 * nearBore(x), Math.abs(z));
  /* The channel's corridor closes from 14 m to 11 m at the longitude of any bore
   * that asks for it, and **applies only where the channel is** -- see
   * `chanHere`.  Over the stretch it does apply, the note it was written with
   * still holds: without it the 24 m band between the two rings is dead flat and
   * no range can cross the railway, because the ground beside the railway is not
   * allowed to rise.  It is also what a drainage channel through a col actually
   * looks like: a narrow valley floor with the hill coming down to it, rather
   * than a ditch across a plain. */
  const chan = 1 - chanHere(x)
    * (1 - sstep(6.5, 14.0 - 3.0 * nearBore(x, narrowsChannel), Math.abs(z - CANAL.z)));
  let k = Math.min(rail, chan);
  if (k <= 0) return 0;
  for (const r of KEEP) {
    const dx = Math.max(r.x0 - x, x - r.x1, 0);
    const dz = Math.max(r.z0 - z, z - r.z1, 0);
    k *= sstep(0, r.r, Math.hypot(dx, dz));
    if (k <= 0) return 0;
  }
  return k;
}

/**
 * What the *range* would do at a point, before the lake touches it.
 *
 * Exported for surveying rather than for building: once `lakeGround` is folded
 * into the lattice there is no way to ask "where is the valley mouth" from
 * `fieldAt`, because the answer already has an embankment standing in it.  Every
 * number in `lakeform.js`'s `DAMS` and `CHANNELS` was read off this.
 */
export function naturalAt(x, z) {
  return inNotch(x, z) ? -SKIRT : shapeAt(x, z) * keepAt(x, z) * farFade(z) - PED;
}

/** True inside any tunnel cap's footprint, where the field is suppressed. */
export function inNotch(x, z) {
  for (const n of NOTCHES) {
    if (x > n.x0 && x < n.x1 && z > n.z0 && z < n.z1) return true;
  }
  return false;
}

/**
 * Per-node hash, in -0.5..0.5.
 *
 * Roughness cannot be continuous noise sampled anywhere: anything evaluated
 * between the nodes would break the exact agreement between the mesh and
 * `hillAt`.  A hash of the *lattice index* is part of the node value, so both
 * readers see the same thing, and it is deterministic across reloads like
 * everything else here.  Also used to jitter the tone boundaries per facet.
 */
function jitterAt(i, j) {
  const h = mulberry32(((i & 1023) << 10 ^ (j & 1023)) + 0x9e37)();
  return h - 0.5;
}

/**
 * The undulation, and it is not decoration -- it is what makes the ground
 * *visible*.
 *
 * A sum of wide ellipses under a slope limiter produces a surface whose facets
 * are very nearly coplanar over tens of metres, and a cel material quantises
 * direct light per facet: coplanar facets all land in the same band, so a
 * hundred-metre hillside came out as one flat area of green with a hard straight
 * edge where the tone changed, and the first render of the massif had no shading
 * on it at all.
 *
 * **It cannot be a sine.**  The first attempt was two smooth octaves of
 * `sin(ax + bz)·cos(cz - dx)`, and a plane wave has a *direction*: the ridges all
 * ran parallel on a bearing of 1 in 1.86 and the ink pass drew them as three
 * perfectly straight lines down the hillside.  Terrain does not do that.  So the
 * roughness is a scattered set of small elliptical bumps instead -- 170 of them,
 * a third of them hollows -- generated once from the seeded RNG at module load.
 * Same construction as the summits, three orders of magnitude smaller.
 *
 * Applied *after* the slope limiter so it survives it, and scaled by how high the
 * ground already is so it roughens the slopes and leaves the toe alone: a wobble
 * on a field about to cross zero turns every toe line into a fringe of islands.
 */
const MICRO = (() => {
  const rng = rngKit(778213);
  const out = [];
  for (let k = 0; k < 170; k++) {
    const x = rng.range(-166, 166);
    const z = rng.range(-190, 104);
    const r = rng.range(7, 21);
    out.push({
      x, z, rx: r * rng.range(0.7, 1.4), rz: r * rng.range(0.7, 1.4),
      h: rng.range(0.55, 2.05) * (rng.chance(0.34) ? -1 : 1),
    });
  }
  /* --------------------- the eastern extension ---------------------
   * ひばり湖 moved the mesh window's east edge from x = 168 to 270, and all four
   * scatter fields in this file were generated over the old span -- so without
   * this the lake's whole east half would have **no roughness and no cover
   * field**: one flat card per facet and one tone over a hundred metres, which is
   * precisely the failure the notes above spent three rounds fixing.
   *
   * It is a *second* set with its own seed rather than a wider window on the
   * first, and that is the whole point: widening the window re-draws the same RNG
   * stream and every bump on ひばり山 moves, which moves 560 trees, re-tones
   * 43 000 facets and re-cuts every benched trail on a range that is finished.
   * Appending cannot do that.  The overlap from x = 158 to the old edge is
   * deliberate -- a hard start would halve the density over one bump radius and
   * leave a visible seam down the middle of the lake -- and it costs nothing: two
   * displacement fields simply sum, and it lands on the lake's own west rim where
   * `lakeDamp` is suppressing most of it anyway. */
  const rngE = rngKit(551907);
  for (let k = 0; k < 76; k++) {
    const x = rngE.range(158, 302);
    const z = rngE.range(-190, 104);
    const r = rngE.range(7, 21);
    out.push({
      x, z, rx: r * rngE.range(0.7, 1.4), rz: r * rngE.range(0.7, 1.4),
      h: rngE.range(0.55, 2.05) * (rngE.chance(0.34) ? -1 : 1),
    });
  }
  return out;
})();

function undulate(x, z) {
  let s = 0;
  for (const b of MICRO) {
    const dx = (x - b.x) / b.rx;
    const dz = (z - b.z) / b.rz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= 1) continue;
    s += b.h * (1 - d2) * (1 - d2);
  }
  return s;
}

/* --------------------------- the second octave ---------------------------
 * **`MICRO` fixed the wrong problem, and the measurement is what says so.**
 *
 * The note above is right that a sum of wide ellipses under a slope limiter has
 * no shading on it, and 170 scattered bumps did give the massif *shape*.  What it
 * did not give it is *surface*: measured over 4 300 facet pairs, the normal turned
 * only **3.16° per 3 m facet at the median** (p25 1.9, p75 5.1, p90 8.0).  A three
 * band cel ramp needs of the order of 15-25° to step a band, so the ramp crossed a
 * boundary about once every twenty metres and the hillside rendered as one flat
 * area of green with a handful of straight ink creases across it -- which is what
 * a heightfield looks like when its roughness is at the wrong *wavelength*.
 *
 * `MICRO`'s radii are 5-29 m.  A bump of amplitude `h` and radius `r` with the
 * profile `h(1-d²)²` has a maximum gradient of `1.54 h / r` reached at
 * `d = 0.577`, so its slope builds over more than half its radius: at r = 14 that
 * is 11° of normal change spread across seven facets.  Per facet it is nothing.
 *
 * So this is the same construction three times smaller, and the arithmetic is the
 * whole design: r ≈ 4.5 and h ≈ 0.42 gives 1.54 × 0.42 / 4.5 = 0.144 of gradient
 * built over 2.6 m, i.e. of the order of 0.17 of slope change across one 3 m
 * facet -- about 10°, per facet, which is what the cel ramp needs.  2 400 of them
 * covers the 97 600 m² window about 1.6 times over, so almost every facet is
 * inside one or two.
 *
 * **Hollows are 42 % rather than 34 %.**  At this scale the eye reads convexity as
 * lumps and concavity as ground, and a hillside wants slightly more of the second.
 */
const FINE = (() => {
  const rng = rngKit(511903);
  const out = [];
  for (let k = 0; k < 2400; k++) {
    const r = rng.range(2.8, 6.8);
    out.push({
      x: rng.range(-168, 168),
      z: rng.range(-194, 108),
      rx: r * rng.range(0.75, 1.3),
      rz: r * rng.range(0.75, 1.3),
      h: rng.range(0.26, 0.78) * (rng.chance(0.42) ? -1 : 1),
    });
  }
  // the eastern extension -- see the note in `MICRO`
  const rngE = rngKit(613481);
  for (let k = 0; k < 1040; k++) {
    const r = rngE.range(2.8, 6.8);
    out.push({
      x: rngE.range(158, 302),
      z: rngE.range(-194, 108),
      rx: r * rngE.range(0.75, 1.3),
      rz: r * rngE.range(0.75, 1.3),
      h: rngE.range(0.26, 0.78) * (rngE.chance(0.42) ? -1 : 1),
    });
  }
  return out;
})();

/* A uniform grid over `FINE`, because 2 400 bumps against 11 413 lattice nodes is
 * 27 million distance tests at module load and the lattice is built eagerly.  Each
 * bump is filed in every cell its own support touches, so a query reads one cell
 * and tests about seven bumps -- and it is exact rather than a near-neighbour
 * approximation, which matters because `fieldAt` must agree with the drawn mesh to
 * the last millimetre. */
const FINE_CELL = 8;
const FINE_GRID = new Map();
const fineKey = (i, j) => i * 4096 + j;
for (const b of FINE) {
  const i0 = Math.floor((b.x - b.rx) / FINE_CELL), i1 = Math.floor((b.x + b.rx) / FINE_CELL);
  const j0 = Math.floor((b.z - b.rz) / FINE_CELL), j1 = Math.floor((b.z + b.rz) / FINE_CELL);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const k = fineKey(i, j);
      let a = FINE_GRID.get(k);
      if (!a) FINE_GRID.set(k, a = []);
      a.push(b);
    }
  }
}

function fineAt(x, z) {
  const a = FINE_GRID.get(fineKey(Math.floor(x / FINE_CELL), Math.floor(z / FINE_CELL)));
  if (!a) return 0;
  let s = 0;
  for (const b of a) {
    const dx = (x - b.x) / b.rx;
    const dz = (z - b.z) / b.rz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= 1) continue;
    s += b.h * (1 - d2) * (1 - d2);
  }
  return s;
}

/* --------------------------- the third octave ---------------------------
 * The same construction a third time, at the size of one 1.5 m facet.
 *
 * `FINE` is tuned to a 3 m cell: r ≈ 4.5 and h ≈ 0.42 gives 1.54·h/r = 0.144 of
 * gradient built over 2.6 m, which is about 0.17 of slope change across one 3 m
 * facet — of the order of 10°, which is what the cel ramp needs to have any chance
 * of stepping a band.  Halve the cell and that number halves with it: the same
 * field measured 7.0° per facet pair at 3 m and would measure about 3.5 at 1.5,
 * so the finer lattice on its own buys smaller flat cards and nothing else.
 *
 * So the arithmetic is run again one scale down.  r ≈ 2.4 and h ≈ 0.20 gives
 * 1.54 × 0.20 / 2.4 = 0.128 of gradient built over 1.4 m — one facet — which is
 * about 7° per facet at the new size, on top of what `FINE` still contributes.
 *
 * 8 000 of them covers the 98 000 m² window about 1.5 times over at r 2.4, so
 * almost every facet is inside one or two.  Amplitude is deliberately at the
 * bottom of what reads: at 0.10–0.30 m these are *texture*, and anything taller
 * starts competing with the tussocks standing on them.
 */
const ULTRA = (() => {
  const rng = rngKit(390211);
  const out = [];
  for (let k = 0; k < 8000; k++) {
    const r = rng.range(1.4, 3.4);
    out.push({
      x: rng.range(-168, 168),
      z: rng.range(-194, 108),
      rx: r * rng.range(0.75, 1.3),
      rz: r * rng.range(0.75, 1.3),
      h: rng.range(0.10, 0.30) * (rng.chance(0.45) ? -1 : 1),
    });
  }
  // the eastern extension -- see the note in `MICRO`
  const rngE = rngKit(728533);
  for (let k = 0; k < 3440; k++) {
    const r = rngE.range(1.4, 3.4);
    out.push({
      x: rngE.range(158, 302),
      z: rngE.range(-194, 108),
      rx: r * rngE.range(0.75, 1.3),
      rz: r * rngE.range(0.75, 1.3),
      h: rngE.range(0.10, 0.30) * (rngE.chance(0.45) ? -1 : 1),
    });
  }
  return out;
})();

const ULTRA_CELL = 4;
const ULTRA_GRID = new Map();
for (const b of ULTRA) {
  const i0 = Math.floor((b.x - b.rx) / ULTRA_CELL), i1 = Math.floor((b.x + b.rx) / ULTRA_CELL);
  const j0 = Math.floor((b.z - b.rz) / ULTRA_CELL), j1 = Math.floor((b.z + b.rz) / ULTRA_CELL);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const k = fineKey(i, j);
      let a = ULTRA_GRID.get(k);
      if (!a) ULTRA_GRID.set(k, a = []);
      a.push(b);
    }
  }
}

function ultraAt(x, z) {
  const a = ULTRA_GRID.get(fineKey(Math.floor(x / ULTRA_CELL), Math.floor(z / ULTRA_CELL)));
  if (!a) return 0;
  let s = 0;
  for (const b of a) {
    const dx = (x - b.x) / b.rx;
    const dz = (z - b.z) / b.rz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= 1) continue;
    s += b.h * (1 - d2) * (1 - d2);
  }
  return s;
}

/* ------------------------------- the cover -------------------------------
 * **The third term in the tone, and the one the near belt needed.**
 *
 * `faceTone` keys off slope, height and aspect, and the palette note explains why
 * it has to: the cel ramp's band boundaries are at `dotNL = ±1/3`, two thirds of
 * the hill sits in the top band, and crossing into the next one takes about 35° of
 * normal change — a metre and a half of relief per 3 m cell.  Direct light will
 * not draw this hill's form, so the material has to.
 *
 * What that misses is measurable.  Over the 28 m belt behind the school — the one
 * piece of hillside the town, the hill-foot road and the school ground all look
 * *at* — the numbers are:
 *
 *     lit    p10 0.42   p50 0.73   p90 0.89
 *     key    p10 0.40   p50 0.71   p90 0.94      threshold 0.46 ± 0.15
 *     => 88 % of it lands in `hillSun` and **0 %** in the deep tone
 *
 * Which is correct behaviour and a bad picture: it is one slope with one aspect,
 * so an aspect term is constant over it, and the height term only spans 8 m there
 * and contributes 0.16.  Forty metres of hillside came out as a single sheet of
 * pale green with a few straight ink creases across it, and no amount of roughness
 * fixes that, because the roughness turns the normal 7° at the median and the ramp
 * needs 35.
 *
 * So this is a **cover field**: how dry and thin the ground is, at the scale a
 * patch of cover actually is.  Same construction as `MICRO` and `FINE` a scale up
 * — scattered ellipses, 9 to 26 m, half of them negative — and it is deliberately
 * *not* derived from the terrain at all.  A hillside's vegetation is not a
 * function of its shape; it is where the last fire was, where the deer browse, what
 * was cleared forty years ago and never came back.  Anything derived from slope or
 * height would be another term that is constant over a uniform slope, which is the
 * problem rather than the fix.
 *
 * Read at the **cell centre**, like `tj` and for the same reason: a value handed to
 * a cell's two triangles differently is confetti, and this one drives the largest
 * areas of colour in the frame.
 */
const COVER = (() => {
  const rng = rngKit(20857);
  const out = [];
  /* **1 100 at r 6-17, not 460 at r 9-26.**  The first scale produced patches 40
   * to 60 m across once the weighted average had smoothed them, so a forty-metre
   * slope held one and a bit of them and the belt came out as two large flat areas
   * with a curve between — which is a different picture from a single sheet but
   * not a better one.  Halved, a patch is 15-25 m and the same slope carries four
   * or five, which is what a hillside's cover actually looks like from the road. */
  for (let k = 0; k < 1100; k++) {
    const r = rng.range(6, 17);
    out.push({
      x: rng.range(-172, 172),
      z: rng.range(-198, 112),
      rx: r * rng.range(0.7, 1.45),
      rz: r * rng.range(0.7, 1.45),
      h: rng.range(0.5, 1.15) * (rng.chance(0.5) ? -1 : 1),
    });
  }
  /* The eastern extension -- see the note in `MICRO`.  This is the one of the
   * four that would have shown: `coverAt` is a *weighted average*, so beyond the
   * old window it returns exactly 0 and `faceTone`'s largest term goes flat.  The
   * lake's east rim would have come out as one sheet of `hillSun` from the water
   * to the crest, which is the 88 %-in-one-tone failure the note above this is
   * entirely about. */
  const rngE = rngKit(884117);
  for (let k = 0; k < 470; k++) {
    const r = rngE.range(6, 17);
    out.push({
      x: rngE.range(158, 306),
      z: rngE.range(-198, 112),
      rx: r * rngE.range(0.7, 1.45),
      rz: r * rngE.range(0.7, 1.45),
      h: rngE.range(0.5, 1.15) * (rngE.chance(0.5) ? -1 : 1),
    });
  }
  return out;
})();

const COVER_CELL = 24;
const COVER_GRID = new Map();
for (const b of COVER) {
  const i0 = Math.floor((b.x - b.rx) / COVER_CELL), i1 = Math.floor((b.x + b.rx) / COVER_CELL);
  const j0 = Math.floor((b.z - b.rz) / COVER_CELL), j1 = Math.floor((b.z + b.rz) / COVER_CELL);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const k = fineKey(i, j);
      let a = COVER_GRID.get(k);
      if (!a) COVER_GRID.set(k, a = []);
      a.push(b);
    }
  }
}

/**
 * How dry and thin the ground is here: +1 thin and dry, −1 lush and deep.
 *
 * **A weighted average, not a sum, and that is the whole difference between this
 * working and not working.**  Written as a sum-and-clamp like `MICRO` and `FINE`
 * — which is what they should be, because they are *displacements* and
 * displacements add — the field came out saturated: 460 blobs cover the window
 * about twice over, so the sum passes ±1 nearly everywhere and the clamp then
 * flattens it.  Measured over the near belt on the first attempt: p25 0.35, p50
 * 0.77, **p75 and p95 both exactly 1.00**.  A constant is worse than nothing here,
 * because it does not vary *and* it shifts every threshold; the belt went from
 * 88 % one tone to 89 % the same tone.
 *
 * Dividing by the accumulated weight makes it a blend of the blobs actually
 * overlapping the point, so the result stays inside the blobs' own amplitude
 * range however many of them pile up, and it varies at their scale rather than at
 * the scale of how many happen to overlap.  The `max(0.55, w)` floor is what lets
 * it fade to zero at the edge of the scatter instead of stepping.
 */
export function coverAt(x, z) {
  const a = COVER_GRID.get(fineKey(Math.floor(x / COVER_CELL), Math.floor(z / COVER_CELL)));
  if (!a) return 0;
  let s = 0, w = 0;
  for (const b of a) {
    const dx = (x - b.x) / b.rx;
    const dz = (z - b.z) / b.rz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= 1) continue;
    const g = (1 - d2) * (1 - d2);
    s += b.h * g;
    w += g;
  }
  return w > 0 ? s / Math.max(0.55, w) : 0;
}

/* ------------------------------------------------------------------ *
 * Trails.
 * ------------------------------------------------------------------ */

/**
 * The trail network, as polylines in flat XZ.
 *
 * These live here rather than in the district for the same reason the height
 * field does: on a hill the path *is* landform.  There is no `ctx.platform`
 * anywhere in it -- platforms are axis-aligned boxes and cannot express a slope
 * -- so what carries the player up is `hillAt` itself, and the trail is a
 * surface treatment laid on the ground the player is already walking.  That is
 * also why the gradients matter: the walker has no slope limit and would climb a
 * cliff, so a route that feels like a path has to be *designed* to sit under
 * about 1 in 4, and every one of these was measured after it was drawn.
 *
 * Kept to the scale of a school's back hill: one main climb, one ridge walk,
 * three short spurs.  Not a mountain park.
 */
export const TRAILS = {
  /**
   * 主步道 -- the climb, from the school's back gate to the ridge.  117 m for
   * 15.3 m of rise, so 1 in 7.6 overall, in twelve legs.
   *
   * The shape of it is forced by the shape of the ground and worth spelling out.
   * The band z -100..-124 is where the slope limiter binds, so it is a uniform
   * 1-in-2 with contours running very nearly east-west -- which means a gentle
   * line can only be found *along* a contour, and the one exception is the low
   * ridge the western foothill throws out at x ≈ -26.  So the route traverses
   * west along the toe to that ridge, turns back on itself, and then crosses the
   * broad shelf at z -118..-126 almost level to the crest.
   *
   * Two legs are still 0.32 and 0.40, and they are meant to be: they get
   * 丸太階段, half-round logs pinned across the path with earth between them,
   * which is what a maintained hill path in Japan actually has on its steep
   * pitches.  `hillPath` returns the measured grade of every segment so the
   * district lays them where the ground says they belong rather than where a
   * table says.
   */
  main: [
    [18.0, -94.5],    // the trail head, on the hill-foot road's south verge
    [15.4, -98.4],    // through the gap in the tree line
    [10.0, -101.0],
    [1.0, -103.4],
    [-9.0, -105.6],
    [-19.0, -108.4],  // 0.40 -- the lower flight of log steps
    [-26.5, -112.6],  // the western foothill's ridge, and the 祠 turn
    [-24.0, -117.6],  // 0.32 -- the switchback, the upper flight
    [-14.0, -120.0],
    [-3.0, -122.4],
    [8.0, -126.4],
    [17.0, -131.0],
    [24.6, -135.6],   // the crest
  ],
  /** the crest walk, west along the ridge.  Near level the whole way. */
  ridge: [
    [24.6, -135.6], [17.0, -137.6], [8.0, -138.2], [-1.0, -137.4],
    [-10.0, -136.2], [-18.0, -135.0],
  ],
  /** the spur out to the 展望台, along the crest to the foot of its stair. */
  deck: [[24.6, -135.6], [29.6, -135.2], [35.4, -135.4]],
  /** the spur down to the 山の祠, off the turn on the foothill's ridge. */
  hokora: [[-26.5, -112.6], [-32.0, -111.0], [-37.0, -112.0]],
  /** the spur into the 林間空地, off the upper traverse. */
  glade: [[-14.0, -120.0], [-18.0, -124.5], [-16.0, -129.0]],
  /**
   * 山裾の道 -- the level maintenance path along the toe of the massif, from the
   * trail head east to the school's outer road.  It is what makes the walk a
   * circuit instead of an out-and-back, and it is level because it follows the
   * toe contour rather than crossing it.
   */
  foot: [
    [13.0, -97.4], [26.0, -97.6], [40.0, -98.0], [54.0, -98.4], [68.0, -98.2],
    [80.0, -96.6], [86.0, -93.8],
  ],
  /**
   * The two tunnel overlooks' approaches, which used to be written inline in
   * `tunnel.js`.  They are here for the same reason every other route is -- the
   * roughness has to know where a made path runs, and that happens at module load
   * long before any district builds anything.  Their last points are
   * `SITES.tover` and `SITES.toverE`; those two are declared below this and
   * cannot be referenced from here, so they are written out and must match.
   */
  toverW: [
    [-66.0, 22.0], [-70.0, 25.5], [-75.0, 26.0], [-79.5, 23.0],
    [-82.5, 19.0], [-84.5, 15.5], [-86.0, 12.0],
  ],
  /* A zigzag, and it has to be one: the ridge's south face runs at the corridor's
   * own allowance of 1.9, so a direct line up it measures 1.3 to 1.6, which is a
   * ladder.  Three traverses and two landings, 34 m of path for 7.7 m of climb. */
  toverE: [
    [91.0, -18.8], [97.5, -18.2], [104.0, -17.4], [106.0, -16.6],
    [99.0, -15.6], [97.8, -14.8], [100.6, -13.6], [101.4, -12.4], [104.0, -12.0],
  ],
};

/** Default bench half-widths for a 1.35 m footpath.  See `ROUTES`. */
const BENCH_FLAT = 1.1;      // cut hard to the profile within this of the centre
const BENCH_FADE = 2.7;      // and blend out to nothing by here

/**
 * ひばり湖's routes -- **wider than a trail, and two of them carry a designed
 * profile rather than the ground's own.**
 *
 * `TRAILS` above is a set of 1.35 m footpaths, and the bench pass grades each one
 * to the natural height at its own vertices.  That is right for a hill path: it
 * follows the land, and what has to be flattened is the *cross*-slope.  It is
 * wrong for the two things this district needs.
 *
 *   - **width.**  A 4.0 m carriageway benched to a 1.1 m half-width is a road
 *     with 0.9 m of untouched hillside down each side of it, which is a ditch on
 *     one side and a drop on the other.  Each route carries its own.
 *   - **grade.**  `湖畔道路` climbs 5.4 m out of the flat ground east of the
 *     school onto the embankment's crest, and the *natural* profile along that
 *     line is 0.0 for eighteen metres and then 3.1 m in the next twelve -- a
 *     0.26 pitch in the middle of an otherwise level lane, which is a road nobody
 *     built.  So a vertex may carry a third number, and where it does the bench
 *     cuts and fills to **that** instead of sampling the field.  Which is simply
 *     what a road is: a designed longitudinal section, cut into the high ground
 *     and filled over the low.
 *
 * Fill is still refused inside a keep-out, exactly as it is for the trails, and
 * that is why `湖畔道路` is specified at 0.0 for its whole run up the school's
 * east side: it is one metre outside `KEEP[0]`, where `hillSafety`'s margin
 * check samples, and a road filled to 0.1 m there would take the one number in
 * this module that is not allowed to move off 0.00.
 */
export const ROUTES = {
  /**
   * 湖畔道路 -- the management road, and the only way anything with four wheels
   * reaches the lake.
   *
   * It comes off the turning head at the top of the school's outer road, runs
   * north up the school's east side on dead flat ground, turns east at z = -34
   * and climbs the east shoulder's north flank to the embankment.  Then the crest
   * itself, and then south down the lake's west shore to the campsite.
   *
   * The climb is the whole reason the road goes *this* way.  The shoulder is 9 to
   * 12 m high over the whole band z -50..-120 -- measured -- so a road crossing
   * it anywhere south of the railway is a 1-in-3 ramp.  At z = -30 it is 3.1 m,
   * because that is where the drainage channel's own corridor holds the ground
   * flat, and the 用水路's east 暗渠 headwall stands at (106, -24) fifteen metres
   * away.  So the road up to the lake leaves from beside the mouth of the channel
   * the lake feeds, which is not a coincidence a designer would invent and is
   * exactly how these are laid out.
   */
  lakeRoad: {
    flat: 2.7, fade: 5.0,
    pts: [
      [89.0, -60.0, 0.00],   // off the school's outer road, on KEEP[0]'s edge
      [89.0, -46.0, 0.00],
      [90.4, -36.4, 0.00],
      [96.0, -33.6, 0.00],
      [104.0, -32.4, 0.10],
      [112.0, -31.6, 0.60],
      [120.0, -31.4, 1.70],
      [130.0, -32.0, 3.00],
      [139.0, -33.0, 4.10],
      [147.0, -34.0, 5.10],
      [153.0, -35.2, 5.80],
      [157.0, -37.0, 6.30],   // the embankment's north-east end, on the crest
    ],
  },
  /**
   * The crest of the embankment, carried on as a road: 26 m of it, dead straight,
   * with the lake 2.8 m below on one side and the outfall valley 3.5 m below on
   * the other.  Level, because a dam crest is.
   */
  damRoad: {
    flat: 3.2, fade: 4.6,
    pts: [
      [157.0, -37.0, 6.30],
      [152.6, -39.2, 6.30],
      [148.0, -41.5, 6.30],
      [143.0, -44.0, 6.20],
      [140.4, -48.0, 5.90],
    ],
  },
  /**
   * 湖畔道路's south leg, along the west and south shores past the park, the boat
   * house and the cafe to the campsite's turning head.
   *
   * **Sampled, not designed**, and this is the one place the two differ for a
   * reason worth writing down.  `lakeRoad` has to be designed because the ground it
   * crosses is a shoulder with a 0.26 pitch in the middle of it.  This one runs
   * along `lakeform.js`'s **own bank profile**, at 12 to 16 m outside the water --
   * a surface that is already smooth, already graded and already has the gradient
   * an authored profile would have been trying to give it.  Designing it as well
   * means two descriptions of the same slope, and the moment a shoreline vertex's
   * `bank` changes the road is floating or buried.
   */
  shoreRoad: {
    flat: 2.6, fade: 4.8,
    pts: [
      [139.4, -51.6], [134.6, -57.0], [131.4, -64.0], [130.0, -72.0],
      [130.0, -80.0], [131.8, -88.0], [134.8, -95.6], [138.8, -103.0],
      /* **The south leg swings 14 m further out than the walk, and it has to.**
       * It was 2 to 3 m *lakeward* of `shoreWalk` from x 160 to 185 -- a road
       * between a footpath and the water, which is backwards -- and there was no
       * room left for the cafe between them.  Inland of the building now, with the
       * car park between the two. */
      [144.2, -111.6], [150.6, -119.6], [158.0, -128.0], [166.0, -137.0],
      [173.0, -145.6], [179.0, -153.6], [186.4, -158.4], [195.0, -159.6],
      [203.0, -157.0], [209.4, -153.8],   // the campsite's turning head
    ],
  },
  /**
   * 湖畔遊歩道 -- the shore walk, and it is **deliberately not a ring**.
   *
   * It runs from the embankment clockwise round the developed half: the park's
   * frontage, the 桟橋's head, the boat house, under the cafe's terrace, the
   * campsite's shore edge, the reed bay's boardwalk and the 野鳥観察小屋 -- and
   * then carries on as a much narrower dirt trace up the east shore to the 水神様
   * and stops.  Everything north of that is林岸: no path, no way in, and it is the
   * far shore in every frame taken from the park.
   *
   * Its profile is sampled from the ground, unlike the road: a shore walk that
   * has been graded flat is a promenade, and this is only one for the 40 m in
   * front of the park.
   */
  shoreWalk: {
    flat: 1.5, fade: 3.4,
    pts: [
      [145.6, -53.6], [141.2, -58.4], [139.6, -64.0], [138.8, -71.0],
      [138.6, -79.0], [139.8, -86.0], [142.0, -92.6], [144.4, -99.4],
      [145.2, -106.0], [147.0, -113.0], [151.0, -120.2], [157.0, -127.0],
      [165.4, -132.2], [175.0, -136.6], [185.4, -140.4], [196.0, -142.6],
      [206.0, -143.4], [216.0, -143.6], [226.0, -142.0], [235.0, -138.0],
      [242.4, -132.0], [247.4, -124.0], [251.0, -115.0], [253.0, -105.0],
      [253.6, -96.0], [252.6, -89.0],
    ],
  },
  /**
   * 見晴台の道 -- the link from ひばり山's own trail system over the east
   * shoulder to the lake, which is the route the brief for this district is
   * really about: you should come *over* a hill and find water.
   *
   * It leaves the 山裾の道 where that path meets the school's outer road, climbs
   * the shoulder's west flank in four traverses to the 見晴台 at (124, -108) --
   * 11.7 m up, which is 8.3 m over the water and gives a 68 m ground horizon, so
   * the peninsula's tip lands exactly on it -- and then drops down the east flank
   * to the shore walk by the boat house.
   *
   * **Sampled, and the vertices are close together on purpose.**  An explicit
   * profile was tried first and it is wrong here in a way worth recording: the
   * natural ground climbs from 0 at the 裾道 to 11.6 m at the 見晴台 in about
   * twenty-five metres, because that is where the school's keep-out ramp releases
   * the field -- so *any* profile gentle enough to feel like a graded path implies
   * a seven-metre cutting, and a seven-metre cutting for a footpath to a bench is
   * absurd.  This is a stepped hill path: it follows the ground, its steep pitches
   * are 0.4 to 0.55 and they get 丸太階段, which is exactly what the 遊歩道 on
   * ひばり山 already does.
   *
   * The vertices are 4 to 6 m apart rather than 8 to 10 because the bench
   * interpolates the profile *between* them: on the first pass the second vertex
   * sat on buried ground at -1.2 and the third on 3.6, so the interpolation filled
   * 1.4 m of new hillside three metres outside the school's keep-out and took
   * `hillSafety`'s margin figure off zero for the first time in the project.
   * Dense vertices mean the interpolated profile *is* the ground and the bench only
   * removes the cross-slope, which is all it was ever for.
   *
   * Which pitches get logs is measured off the finished ground by `hillPath`, not
   * written down here.
   */
  mikaharashi: {
    flat: 1.2, fade: 2.9,
    pts: [
      /* East along the toe first, and *then* up.  The first route ran south-east
       * from the school's corner and measured 0.92 on one leg -- a 43° scramble --
       * because the corner of `KEEP[1]` is a pinned point with a 13 m ramp round it
       * and 12 m of hill behind that, so the contours there are quarter-circles and
       * every radial line out of it is a cliff.  The survey shows shelves at
       * x = 106, 109 and 112 running 9 m in z at a near-constant height; this
       * zigzags between them, which takes the worst leg to 0.60 and puts a natural
       * rest platform on the middle one. */
      [86.0, -95.4], [92.0, -95.6], [98.0, -95.8], [102.6, -96.8],
      [106.0, -99.2], [109.0, -96.6], [112.4, -94.8], [115.0, -97.4],
      [117.6, -100.2], [120.6, -98.0], [123.2, -100.8], [124.6, -104.4],
      /* **Past the deck's south side, not through the middle of it.**  The route
       * ran over (124, -108) -- the platform's own centre -- and the flood fill
       * reported the 見晴台 unreachable with the ground one cell away fully
       * walkable.  The cause is the balustrade: its four colliders carry
       * `bottom = DY - 0.6`, and `bottom` only skips somebody whose feet are more
       * than 1.9 m *below* it, so a walker on the ground 1.1 m under the deck is
       * inside all four of them.  A railed platform is a solid object from
       * underneath -- which is correct, and means a path may not pass under one.
       * The deck is reached by its steps off this leg instead. */
      [123.8, -112.2], [127.4, -112.0],
      /* and down the shoulder's east flank to the lake, which is the gentle half:
       * the ground falls 8 m in 24 and the路 rides the fall line obliquely */
      [130.4, -110.6], [133.0, -109.0], [134.8, -107.6], [137.0, -108.6],
      [139.0, -110.4], [141.6, -111.4], [143.8, -109.8], [145.0, -106.4],
    ],
  },
  /** the spur onto the 桟橋's landward end, off the shore walk */
  pierSpur: { flat: 1.2, fade: 2.6, pts: [[139.0, -79.4], [141.4, -79.8]] },
  /** and the one down to the 水神様's steps, at the shore walk's far end */
  suijinSpur: { flat: 1.1, fade: 2.5, pts: [[252.6, -89.0], [252.8, -91.4]] },
};

/**
 * How much of the roughness a point is allowed to keep: 0 on a trail, 1 well off
 * one, over a two-metre fade.
 *
 * **A made path is graded, and the third octave is what forced the issue.**  The
 * trails are ribbons laid on whatever the field does, with no `ctx.platform`
 * anywhere in them — so every metre of roughness added to the ground is added to
 * the path as well.  At the 3 m lattice that was tolerable; at 1.5 with `ULTRA` on
 * top it is not, and it broke something:
 *
 *   - measured along the 展望台 spur, the worst gradient per metre went from 0.09
 *     to 0.49 — a level walk out to a viewing deck turned into a rubble ramp;
 *   - and the flood fill lost ひばり山's overlook entirely.  Its zigzag traverses
 *     ground at the rail corridor's own 1.9 allowance, so its *designed* worst leg
 *     is 0.95 and a 0.35 m axis-aligned step up that is 0.33, just inside the
 *     0.38 step limit.  One `ULTRA` bump took the local gradient to **1.975**,
 *     which is 0.69 m per step, and the route was cut.  The centreline trace still
 *     walked it — it moves diagonally in 0.15 m steps — which is exactly the kind
 *     of disagreement between the two tools that means the ground changed under a
 *     route rather than that the route is wrong.
 *
 * 1.2 m of dead flat either side of the centreline is the ribbon's own half-width
 * plus a little, and the fade reaches full roughness 2 m beyond that, so a path
 * still sits *in* the landform rather than on a terrace cut through it.
 */
const TRAIL_SEGS = (() => {
  const out = [];
  const push = (a, b, flat, fade, given) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    out.push({ a, b, dx, dz, l2: dx * dx + dz * dz || 1e-6, flat, fade, given });
  };
  for (const key of Object.keys(TRAILS)) {
    const pts = TRAILS[key];
    for (let s = 0; s < pts.length - 1; s++) push(pts[s], pts[s + 1], BENCH_FLAT, BENCH_FADE, false);
  }
  /* The lake's routes, each with its own bench width and, for the three that are
   * roads, its own designed longitudinal profile.  Same list, so one `nearestTrail`
   * serves the roughness damping, the bench and the planting. */
  for (const key of Object.keys(ROUTES)) {
    const r = ROUTES[key];
    const given = r.pts[0].length > 2;
    for (let s = 0; s < r.pts.length - 1; s++) push(r.pts[s], r.pts[s + 1], r.flat, r.fade, given);
  }
  return out;
})();

function nearestTrail(x, z) {
  let best = 1e9, seg = null, tt = 0;
  for (const s of TRAIL_SEGS) {
    let t = ((x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz) / s.l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (s.a[0] + s.dx * t), z - (s.a[1] + s.dz * t));
    if (d < best) { best = d; seg = s; tt = t; }
  }
  return { d: best, seg, t: tt };
}

/* The roughness is faded out over the route's own width rather than over a fixed
 * 1.2 m: a 4 m road with 1.2 m of grading either side of its centreline has
 * untouched hillside inside its own carriageway. */
function trailDamp(x, z) {
  const n = nearestTrail(x, z);
  const in0 = n.seg.flat + 0.1;
  const out0 = in0 + 2.0;
  return n.d <= in0 ? 0 : n.d >= out0 ? 1 : (n.d - in0) / 2.0;
}

/** Distance to the nearest route's *edge*, for keeping planting off it. */
function trailClearance(x, z) {
  const n = nearestTrail(x, z);
  return n.d - (n.seg.flat - BENCH_FLAT);
}

/**
 * **The bench, and it is the mechanism the trails were missing.**
 *
 * `hillPath` lays a ribbon on whatever the field does, so a path across a steep
 * face inherits the *cross*-slope of that face — it is a strip of gravel painted
 * on a 1-in-2 bank, not a path.  Nobody noticed while the walker was the only
 * thing tested, because the walker has no slope limit and simply follows the
 * height query wherever it goes.
 *
 * The flood fill does not walk like that.  It steps 0.35 m along an axis and
 * refuses a rise over 0.38, and on ground held at the rail corridor's own 1.9
 * allowance **every** such step is a rise of 0.63 to 0.78 — measured across the
 * whole band z 11…23 behind ひばり山's east portal, in both directions and on two
 * different candidate routes.  So no route across that bank was ever climbable by
 * anything but the walker; the old 3 m lattice interpolated the face coarsely
 * enough to leave one line that squeaked under the limit, and halving the cell
 * resolved it honestly and took the overlook away.
 *
 * A mountain path on a 1-in-2 slope is a **cut bench** — that is what 切土 is —
 * and once the cross-slope is gone the only gradient left is the path's own
 * longitudinal one, which is designed and measured.  An axial step then climbs
 * `grade · 0.35 · cos θ` where θ is the angle between the axis and the path, so a
 * diagonal leg never presents its full gradient to the fill at all.
 *
 * **It only ever lowers.**  Same discipline as the slope limiter, and for the same
 * reason: cut is safe everywhere, fill is not.  Raising the field near a trail
 * could push it up through something built (the 山裾の道 runs 7 m off the
 * hill-foot road) and would invalidate every guarantee `hillSafety` checks.  A
 * bench cut into a slope with the downhill side left alone is also simply what one
 * looks like.
 *
 * The profile is sampled from the trail's own vertices **before any of this runs**,
 * so it is the natural ground at the points the route was designed against — not
 * a moving target that would drift as the cut proceeds.
 *
 * **Except where a route says otherwise.**  `ROUTES` may give a vertex a third
 * number, and then that is the profile: a road is a designed section, not a
 * follower of the land.  `BENCH_FLAT`/`BENCH_FADE` above are the defaults a
 * 1.35 m footpath gets; every entry in `ROUTES` carries its own.
 */

/**
 * Which way a cell's diagonal runs.  **Checkerboard, not uniform.**
 *
 * Splitting every cell the same way gives the whole hillside a diagonal grain --
 * long straight creases marching across the slope in one direction, which the
 * depth-difference ink pass then draws as a set of parallel lines.  It was very
 * visible on the first render of the massif and it is the single most artificial
 * thing a heightfield can do.  Alternating the diagonal costs one bit and the
 * grain disappears.
 *
 * Declared above the lattice because `fieldAt` reads it and the bench pass at the
 * end of the lattice build reads `fieldAt`.
 */
const flipped = (i, j) => (((i & 1) ^ (j & 1)) === 1);

/* ------------------------------ the lattice ------------------------------
 * Built once, eagerly, because the slope limiter needs the whole surface at
 * once and because `hillAt` is on the player's per-frame path.  2 900 nodes and
 * about forty relaxation passes; it costs a couple of milliseconds at load. */

const NI = I1 - I0 + 1;
const NJ = J1 - J0 + 1;
const NODES = new Float32Array(NI * NJ);

/** Steepest gradient the surface is allowed to hold at a point.  See the header:
 * a cutting is steep on purpose, a wooded hillside is not. */
function slopeLimitAt(x, z) {
  const nearRail = Math.abs(z) < 24;
  const nearChan = Math.abs(z + 24) < 22;
  return nearRail || nearChan ? 1.9 : 0.52;
}

/**
 * "At the floor", and it needs a tolerance because **`NODES` is a `Float32Array`.**
 *
 * Pass 1 writes `Math.max(-SKIRT, ...)`, so a buried node is meant to hold exactly
 * `-SKIRT` and be skipped by everything after it.  It does not: `-1.3` stored as
 * float32 reads back as `-1.2999999523162842`, which is *greater* than the double
 * `-SKIRT`, so `h <= -SKIRT` was false on **every node of the buried apron** and
 * neither the limiter's guard, the roughness's guard nor `buildSurface`'s
 * whole-cell skip ever fired.
 *
 * That was invisible for as long as the apron was under the terrain grid, which is
 * 0.63 m above it.  The one place in this world where there is no grid is the
 * drainage channel, which is a hole in it -- and there the apron is drawn inside
 * the excavation.  Worse, `amp` below is `h / 2.4`, which for a *negative* h is
 * negative, so a negative MICRO hollow lifts the apron instead of lowering it:
 * measured -1.134 of undulation at (-96, -24) against an amp of -0.542, i.e. the
 * node rose from -1.30 to **-0.64**, which is 0.43 m above the water surface.  The
 * symptom was a slab of hillside turf lying in the channel in front of the west
 * headwall, and a raycast on it came back `hillTurf` at 4.98 m with `canalWater`
 * behind it at 5.96.
 */
const FLOOR = -SKIRT + 0.005;

{
  const notched = inNotch;
  // pass 1: the designed surface
  for (let i = I0; i <= I1; i++) {
    for (let j = J0; j <= J1; j++) {
      const x = i * CELL;
      const z = j * CELL;
      /* The lake is applied *inside* pass 1 rather than as a later correction,
       * and it has to be: the slope limiter runs next, and it is what would
       * otherwise eat the embankment.  Its faces are 1 in 2 and the limiter
       * allows 0.52, so with the dam already in the surface the limiter simply
       * never fires on it -- put the dam in afterwards and there is nothing
       * holding the water in but the order of two loops. */
      const keep = keepAt(x, z);
      NODES[(i - I0) * NJ + (j - J0)] = notched(x, z)
        ? -SKIRT
        : Math.max(-SKIRT,
          lakeGround(shapeAt(x, z) * keep * farFade(z) - PED, x, z, keep));
    }
  }
  // pass 2: the slope limiter.  Lowers only, so every guarantee above survives.
  const drop = new Float32Array(NI * NJ);
  for (let i = I0; i <= I1; i++) {
    for (let j = J0; j <= J1; j++) {
      drop[(i - I0) * NJ + (j - J0)] = slopeLimitAt(i * CELL, j * CELL) * CELL;
    }
  }
  /* 140 rather than 90.  The loop breaks the moment nothing moved, so the cap
   * costs nothing when it is not needed -- but if it is ever *hit*, the surface
   * stops being the limiter's fixed point and becomes a function of the sweep
   * order, which changes silently whenever `I1` does.  ひばり湖 widened the window
   * by a third; the headroom is cheap insurance against that. */
  for (let pass = 0; pass < 140; pass++) {
    let worked = false;
    for (let i = 0; i < NI; i++) {
      for (let j = 0; j < NJ; j++) {
        const k = i * NJ + j;
        const h = NODES[k];
        if (h <= FLOOR) continue;
        let cap = Infinity;
        for (let e = 0; e < 4; e++) {
          const ni = i + (e === 0 ? 1 : e === 1 ? -1 : 0);
          const nj = j + (e === 2 ? 1 : e === 3 ? -1 : 0);
          if (ni < 0 || ni >= NI || nj < 0 || nj >= NJ) continue;
          const nk = ni * NJ + nj;
          // the looser of the two allowances, so a cutting is not levelled by
          // the hillside next to it
          cap = Math.min(cap, NODES[nk] + Math.max(drop[k], drop[nk]));
        }
        if (cap < h) { NODES[k] = Math.max(-SKIRT, cap); worked = true; }
      }
    }
    if (!worked) break;
  }
  /* pass 3: the undulation, on top of the limited surface.  It has to come last
   * or the limiter flattens the very thing it is there to create -- and it puts
   * the local gradient back over the limit by about 0.2, which is the whole
   * point: a hillside that is *exactly* at its limit everywhere is a plane. */
  for (let i = I0; i <= I1; i++) {
    for (let j = J0; j <= J1; j++) {
      const k = (i - I0) * NJ + (j - J0);
      const h = NODES[k];
      if (h <= FLOOR) continue;
      const x = i * CELL;
      const z = j * CELL;
      if (notched(x, z)) continue;
      /* **Clamped at 0 and not just at 1.**  `h / 2.4` is negative everywhere the
       * field is below the reference plane, which is the whole toe and the whole
       * buried apron, and a negative amplitude *inverts* the roughness there --
       * hollows become mounds.  It is meaningless in either direction and it is
       * half of what put turf in the channel; see the note on `FLOOR`. */
      const amp = Math.max(0, Math.min(1, h / 2.4));
      /* The second octave reaches full strength at 1.6 m rather than 2.4, because
       * the wide octave's job is the *shape* of a hill and this one's is the
       * surface of a hillside -- and half the hillside anybody stands on is under
       * two metres high.  It also has to be at least the octave's own peak
       * amplitude or one hollow could take a node through zero on its own: at 1.6
       * against a peak of 0.78, `ampFine · fine` is at worst
       * `-(h / 1.6) · 0.78 = -0.49 h`. */
      const ampFine = Math.max(0, Math.min(1, h / 1.6));
      /* The third octave comes in earlier still, at 0.7 m, for the same reason
       * scaled once more: its job is the *texture* of the ground and the ground
       * exists from the toe outward.  Its peak amplitude is 0.30, so at 0.7 the
       * worst it can take off a node is `-(h / 0.7) · 0.30 = -0.43 h`, which the
       * total floor below then catches along with everything else.
       *
       * **The node jitter is halved with the cell.**  It was ±0.21 m on a 3 m
       * lattice, i.e. a gradient of 0.14 between neighbours; left alone on a 1.5 m
       * lattice that doubles to 0.28 and the surface picks up a per-node fizz that
       * reads as noise rather than as ground -- and it is the one term here with no
       * length scale of its own, so it is the one that has to track the cell. */
      const ampUltra = Math.max(0, Math.min(1, h / 0.7));
      /* …and all of it faded out under the trails.  `undulate` is the *shape* of
       * the hill and stays; the two texture octaves and the node jitter are what a
       * path would have been graded through.  See `trailDamp`. */
      /* …and all of it damped again near the water.  `lakeDamp` is 0 in the lake
       * and for three metres outside it, because the shoreline is a *contour* of
       * this surface: the two texture octaves are ±0.3 to ±2 m, so applied at the
       * water's edge they do not add texture, they add islands, lagoons and a
       * coast that looks chewed.  Same argument as `trailDamp` -- a made surface
       * is graded, and a waterline is the most made surface here after the road.
       *
       * The wide octave is damped with them, unlike on a trail.  `undulate` is
       * the *shape* of a hill and a lake bed does want some, but a ±2 m bump 8 m
       * outside the shoreline moves the waterline by six metres, and every reed
       * bed, mooring and boardwalk in `kohan.js` is placed off the depth. */
      const ld = lakeDamp(x, z, h);
      const td = trailDamp(x, z) * ld;
      let disp = undulate(x, z) * amp * (0.20 + 0.80 * ld)
        + (jitterAt(i, j) * 0.21 * amp + fineAt(x, z) * ampFine + ultraAt(x, z) * ampUltra) * td;
      /* **The two octaves together *can* flip the sign, so the total is floored.**
       * Each is safe alone -- that is what the 2.4 and the 1.3 are for -- but
       * `-0.854 h` from the wide one and `-0.48 h` from the fine one sum past
       * `-h`, and `undulate` itself is a sum over overlapping bumps and so is not
       * bounded by one bump's amplitude at all.  A node that crosses zero turns the
       * toe line into a fringe of islands, which is the failure the note above
       * warns about; holding the total at three quarters of the node's own height
       * makes it impossible by construction and only ever engages near the toe. */
      if (h > 0 && disp < -0.75 * h) disp = -0.75 * h;
      NODES[k] = Math.max(-SKIRT, h + disp);
    }
  }
  /* pass 4: bench the trails into the slope.  See the note by `BENCH_FLAT`.
   *
   * The profile is read first, off the finished surface, so the cut below cannot
   * chase its own tail: a vertex whose ground had already been lowered by an
   * earlier node's cut would drag the whole path down with it. */
  {
    const vertY = new Map();
    const keyOf = (p) => p[0] + ',' + p[1];
    /* A vertex with a third number *is* the profile there; one without is
     * sampled.  That is the whole difference between a footpath and a road, and
     * doing it here rather than per node means a road's grade is read once from
     * the table instead of being re-derived from ground the cut is changing. */
    for (const s of TRAIL_SEGS) {
      for (const p of [s.a, s.b]) {
        if (!vertY.has(keyOf(p))) vertY.set(keyOf(p), s.given ? p[2] : fieldAt(p[0], p[1]));
      }
    }
    for (let i = I0; i <= I1; i++) {
      for (let j = J0; j <= J1; j++) {
        const k = (i - I0) * NJ + (j - J0);
        const h = NODES[k];
        if (h <= FLOOR) continue;
        const x = i * CELL;
        const z = j * CELL;
        if (notched(x, z)) continue;
        const n = nearestTrail(x, z);
        if (n.d >= n.seg.fade) continue;
        const { a, b } = n.seg;
        const pathY = vertY.get(keyOf(a)) + (vertY.get(keyOf(b)) - vertY.get(keyOf(a))) * n.t;
        /**
         * **Cut *and* fill, and the fill is the half that mattered.**
         *
         * Cut alone was tried and it does not make a path: it takes the uphill
         * shoulder off and leaves every hollow the natural ground had, so the
         * centreline still measured 1.57 per metre against a designed worst leg of
         * 1.10 — and what stops a flood fill is climbing *out* of a hollow, not
         * going down into it.  A bench is cut on the uphill side and fill on the
         * downhill one; both, or it is a scrape.
         *
         * The fill is refused on ground the hills may not touch.  `main`'s trail
         * head is at (18, −94.5), which is **inside** the school's keep-out
         * rectangle, so raising the field there would put a hillside through the
         * hill-foot road's paving and take `hillSafety` off 0.00 — the one number
         * in this module that is not allowed to move.  Cut stays legal everywhere,
         * exactly like the slope limiter.
         */
        if (pathY > h && inKeepOut(x, z)) continue;
        /* …and refused *in the water*, which is the lake's own version of the same
         * rule.  `shoreWalk` runs within a metre of the shoreline for most of its
         * length and `pierSpur` ends on it, so a bench allowed to fill inside the
         * polygon would build a causeway out into the lake -- and one allowed to
         * cut would trench the bank the water is held back by. */
        if (inLakePoly(x, z)) continue;
        const wgt = n.d <= n.seg.flat ? 1 : (n.seg.fade - n.d) / (n.seg.fade - n.seg.flat);
        NODES[k] = Math.max(-SKIRT, h + (pathY - h) * wgt);
      }
    }
  }
}

/** The height at one lattice node -- the only place a height comes from. */
function nodeAt(i, j) {
  if (i < I0 || i > I1 || j < J0 || j > J1) return -SKIRT;
  return NODES[(i - I0) * NJ + (j - J0)];
}


/**
 * The field at an arbitrary point: linear over the two triangles of one cell,
 * split on the same diagonal the mesh below uses.  So this is not an
 * approximation of the drawn surface -- it *is* the drawn surface, offset by
 * `TERRAIN_DROP`.
 *
 * Can be negative.  That is the point: the zero contour is where the hill comes
 * out of the flat ground, and below it the flat terrain grid is what you see.
 */
export function fieldAt(x, z) {
  const i = Math.floor(x / CELL);
  const j = Math.floor(z / CELL);
  if (i < I0 || i >= I1 || j < J0 || j >= J1) return -SKIRT;
  const u = x / CELL - i;
  const v = z / CELL - j;
  const h00 = nodeAt(i, j);
  const h10 = nodeAt(i + 1, j);
  const h01 = nodeAt(i, j + 1);
  const h11 = nodeAt(i + 1, j + 1);
  if (flipped(i, j)) {
    // diagonal (1,0)-(0,1)
    return u + v <= 1
      ? h00 + (h10 - h00) * u + (h01 - h00) * v
      : h11 + (h11 - h01) * (u - 1) + (h11 - h10) * (v - 1);
  }
  // diagonal (0,0)-(1,1)
  return u >= v
    ? h00 + (h10 - h00) * u + (h11 - h10) * v
    : h00 + (h11 - h01) * u + (h01 - h00) * v;
}

/**
 * How far the hills raise the ground at a flat point.  Never negative.
 *
 * Added to `streetHeight` by both `world.heightAt` and `ctx.groundAt`, so the
 * player walks it with no further work: the walker has no slope limit, it simply
 * follows the height query.
 */
export function hillAt(x, z) {
  const f = fieldAt(x, z);
  return f > 0 ? f : 0;
}

/**
 * How deep ひばり湖 is at a point: positive in the water, negative on the land,
 * and it is simply `LEVEL - field`.
 *
 * That one line is most of what the lake being a *contour* of this surface buys.
 * Everything downstream reads it rather than a polygon -- the water mesh, the
 * shallow and deep tone bands, the reeds, the lilies, the moorings, the reed-bay
 * boardwalk's height and where the 野鳥観察小屋 can see across -- so none of them
 * can drift away from where the water actually is.
 *
 * Outside the shoreline it keeps working and is what says how far *above* the
 * water a bank is, which is what seats a life ring or a depth board.
 */
export function lakeDepthAt(x, z) {
  return LAKE_LEVEL - fieldAt(x, z);
}

/** True where there is standing water: in the polygon and below the level. */
export function inLakeWater(x, z) {
  return inLakePoly(x, z) && fieldAt(x, z) < LAKE_LEVEL;
}

/** Gradient magnitude, sampled across one cell.  Used to pick the ground
 * material, to keep planting off the steep faces and to rake props. */
export function hillSlope(x, z) {
  const e = CELL * 0.5;
  const dx = (hillAt(x + e, z) - hillAt(x - e, z)) / (2 * e);
  const dz = (hillAt(x, z + e) - hillAt(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

/** Uphill direction as a compass yaw, for facing benches and signs at a view. */
export function hillAspect(x, z) {
  const e = CELL * 0.5;
  const dx = hillAt(x + e, z) - hillAt(x - e, z);
  const dz = hillAt(x, z + e) - hillAt(x, z - e);
  return Math.atan2(-dx, -dz);
}

/** True where a point is on ground the hills are forbidden to touch. */
export function inKeepOut(x, z) {
  /* Except inside a tunnel's own footprint, where the corridor rule is
   * suspended on purpose and `tunnel.js` puts its shell colliders round the
   * rectangle.  Without this the safety check reports those colliders as a
   * 6.9 m violation, which is the mountain doing its job. */
  for (const n of NOTCHES) {
    if (x > n.x0 - 1 && x < n.x1 + 1 && z > n.z0 - 1 && z < n.z1 + 1) return false;
  }
  // the railway circles the planet, so its trough is keep-out at every longitude
  if (Math.abs(z) < 7.5) return true;
  /* **The channel's is bounded, exactly like `inTrench` and `chanHere`.**  This
   * read `Math.abs(z + 24) < 6.5` at every longitude, which was right for as long
   * as the channel was a ring -- and the moment the corridor closed over the two
   * crossings it declared 42 m² of newly built hillside at each of them to be
   * ground the hills may not touch.  `hillSafety` then reported a 7.57 m violation
   * at (128.93, -18.55): a grove tree standing on the new saddle, doing exactly
   * what it should.  Same class of finding as the tree filter this function
   * already carries, and the same fix -- ask where the thing actually is. */
  if (x > CANAL_X0 && x < CANAL_X1 && Math.abs(z - CANAL.z) < 6.5) return true;
  for (const r of KEEP) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
  }
  return false;
}

/**
 * The invariant, checkable from the console.
 *
 * `hillAt` must be exactly 0 over every collider and platform standing on ground
 * the hills are forbidden to touch, and it must be small for a few metres
 * outside every keep-out rectangle so the mask is never the thing shaping a
 * slope.  Returns the worst offender rather than a boolean, because the useful
 * answer to "is it safe" is "the worst place is 0.00 m at (x, z)".
 *
 * Colliders whose centre is *outside* every keep-out are skipped, and they have
 * to be: since the hills went in, `world.colliders` contains six hundred of
 * their own trees, which stand on the hill by design.  Written without the
 * filter first and it reported a 16.9 m violation at (38, -151) -- a cedar on the
 * summit, doing exactly what it should.
 */
export function hillSafety(world, margin = 3.0) {
  const out = {
    worstBuilt: 0, atBuilt: null, worstMargin: 0, atMargin: null,
    samples: 0, checked: 0, skipped: 0,
  };
  const probe = (x, z, which) => {
    const h = hillAt(x, z);
    out.samples++;
    if (which === 'built') {
      if (h > out.worstBuilt) { out.worstBuilt = h; out.atBuilt = [+x.toFixed(2), +z.toFixed(2)]; }
    } else if (h > out.worstMargin) {
      out.worstMargin = h; out.atMargin = [+x.toFixed(2), +z.toFixed(2)];
    }
  };
  if (world) {
    const boxes = world.colliders.concat(
      // platforms carry every paved surface in the world, which is the half of
      // "built ground" a collider list does not see
      (world.platforms ?? []).map((p) => ({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 }))
    );
    for (const c of boxes) {
      if (!inKeepOut((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2)) { out.skipped++; continue; }
      out.checked++;
      const nx = Math.min(9, Math.max(2, Math.ceil((c.x1 - c.x0) / 2) + 1));
      const nz = Math.min(9, Math.max(2, Math.ceil((c.z1 - c.z0) / 2) + 1));
      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          probe(c.x0 + ((c.x1 - c.x0) * a) / (nx - 1), c.z0 + ((c.z1 - c.z0) * b) / (nz - 1), 'built');
        }
      }
    }
  }
  for (const r of KEEP) {
    for (let x = r.x0 - margin; x <= r.x1 + margin; x += 1.5) {
      probe(x, r.z0 - margin, 'margin');
      probe(x, r.z1 + margin, 'margin');
    }
    for (let z = r.z0 - margin; z <= r.z1 + margin; z += 1.5) {
      probe(r.x0 - margin, z, 'margin');
      probe(r.x1 + margin, z, 'margin');
    }
  }
  return out;
}

/** Highest point of the field, on a coarse sweep -- a sanity figure for docs. */
export function hillStats() {
  let hi = 0, at = null, area = 0;
  for (let i = I0; i < I1; i++) {
    for (let j = J0; j < J1; j++) {
      const h = nodeAt(i, j);
      if (h > hi) { hi = h; at = [i * CELL, j * CELL]; }
      if (h > 0) area += CELL * CELL;
    }
  }
  return { highest: +hi.toFixed(2), at, areaM2: Math.round(area) };
}

/* ------------------------------------------------------------------ *
 * The drawn hill.
 * ------------------------------------------------------------------ */

const M = {};
export function hillMats() {
  if (M.grass) return M;
  M.grassSun = cel({ color: PAL.hillGrassSun, bands: 3, tint: 0x7488a8 });
  M.grass = cel({ color: PAL.hillGrass, bands: 3, tint: 0x6b7fa0 });
  M.grassDeep = cel({ color: PAL.hillGrassDeep, bands: 3, tint: 0x60749a });
  /* Warmer tint than the greens: bracken is dry cover and its shadow side goes
   * mauve rather than blue, which is also what keeps it from reading as a lighter
   * green when it falls into shade. */
  M.bracken = cel({ color: PAL.hillBracken, bands: 3, tint: 0x84759c });
  /* The 杉林 floor.  See the palette note: mauve tint, because a plantation floor
   * is in shade every hour of the day and its shadow band is the tone you
   * actually see. */
  M.litter = cel({ color: PAL.hillLitter, bands: 3, tint: 0x847a94 });
  /* ひばり湖's two.  The bed is under 0.93-opacity water, so what it is *for* is
   * the shallows -- the first three or four metres out, where the water reads as
   * water precisely because you can see silt through it.  Left as `hillGrass` the
   * whole margin came out as lawn with a blue wash over it.
   *
   * The waterline band is the more valuable of the two.  A lake's edge in a
   * cel-shaded frame is one line, and a line is all the ink pass can give it; a
   * metre of pale exposed shore *above* the water is what says the level moves,
   * which is the single most recognisable thing about an irrigation pond in
   * spring. */
  M.lakeBed = cel({ color: PAL.lakeBed, bands: 3, tint: 0x6f7d96 });
  M.lakeShore = cel({ color: PAL.lakeShore, bands: 3, tint: 0x7a7396 });
  M.earth = cel({ color: PAL.hillEarth, bands: 3, tint: 0x7a7396 });
  M.rock = cel({ color: PAL.hillRock, bands: 3, tint: 0x6f6790 });
  M.moss = cel({ color: PAL.hillMoss, bands: 3, tint: 0x5b6f8c });
  M.path = cel({ color: PAL.hillPath, bands: 3, tint: 0x7d74a0 });
  M.pathEdge = cel({ color: PAL.hillPathStone, bands: 3, tint: 0x6f6790 });
  M.timber = cel({ color: 0x9a7f5e, bands: 3, tint: 0x5c5680 });
  M.timberDark = cel({ color: 0x6f5943, bands: 3, tint: 0x554d72 });
  return M;
}

/** The y a mesh laid on the hill has to sit at, in the same relationship to the
 * reference plane the flat terrain grid has.  Use it for anything that *is* the
 * ground; use `ctx.groundAt` for anything standing on it. */
export const hillMeshY = (x, z) => groundY(z) + fieldAt(x, z) - TERRAIN_DROP;

/* The sun's azimuth in the *authoring* frame -- (-52, 62, 56), horizontal part
 * normalised.  `faceTone` runs before the bake, so this is the direction that is
 * meaningful to it. */
const SUN_AX = -52 / Math.hypot(52, 56);
const SUN_AZ = 56 / Math.hypot(52, 56);

/**
 * Which of the five ground tones a facet gets.
 *
 * **Aspect is the new term and it is the one that matters.**  This keyed off slope
 * and height only, and the hillside rendered as one flat area of green with a few
 * straight ink creases across it -- 57 % of the drawn surface in a single material,
 * on a shape whose direct light is measurably incapable of separating it: the
 * three-band ramp's boundaries are at `dotNL = ±1/3`, two thirds of the hill sits
 * in the top band, and within one slope every facet is in the *same* band.  See the
 * note by `hillGrassSun` in the palette for the numbers.  Light will not draw this
 * hill's form, so the material must, and what a hillside's cover actually varies
 * with is which way it faces.
 *
 * `lit` is the cosine between the facet's downhill-facing horizontal normal and the
 * sun's azimuth, so +1 is a face square to the light and -1 one turned away.  It is
 * weighted by `min(1, slope / 0.25)` because **aspect is meaningless on flat
 * ground**: a facet at 0.02 of slope has an arbitrary bearing, and without the
 * weight the flat shelves and the 林間広場 came out as confetti.
 *
 * Every threshold is jittered by the facet's own hash so no boundary reads as a
 * contour line -- the same trick the height boundary already used, for the same
 * reason, and it is what keeps five tones from reading as camouflage.
 *
 * `slope` must be the **facet's own gradient** and not the biggest drop across
 * its three edges.  Written the second way first, and on a uniform ramp the
 * diagonal edge drops twice as far as either side, so it reported 1.04 for a 0.52
 * slope and painted the whole toe of the massif as bare earth -- a hundred square
 * metres of tan on a green hillside, which is exactly how it was spotted.
 *
 * Measured split over 10 214 facets: earth 8 %, bracken 10 %, sun 27 %, mid 24 %,
 * deep 31 %.  Nothing over about a third, which was the target -- the old split was
 * 57 / 36 / 7.
 */
function faceTone(hAvg, slope, gx, gz, hash, tj, cover) {
  /**
   * Bare earth, on anything as steep as an engineered face.
   *
   * **0.88 against `tj`, not 0.74 against `hash`**, and both halves of that were
   * forced by a render.  `hash` is per cell but handed to the cell's two triangles
   * with *opposite* signs, which is right for a threshold whose job is to break up
   * a lozenge and wrong for one that changes hue: a cell sitting on 0.74 came out
   * as one tan triangle beside one green one, and a 4.5 m² tan triangle in the
   * middle of a green slope reads as a fault rather than as a scar.  It is the
   * same confetti the height threshold had, and it wants the same fix.
   *
   * And the level had to move with the lattice.  `ULTRA` adds of the order of 0.13
   * of gradient at the facet scale by design — that is what it is for — so at the
   * old 0.74 it pushed a swathe of perfectly ordinary hillside over the line and
   * bare earth went from 8.6 % of the drawn surface to 10.2, most of it new and
   * all of it in the wrong places.
   *
   * The cover term is the last part: bare ground is *dry* ground, so a lush patch
   * has to be steeper before it scars.
   */
  if (slope > 0.88 + tj * 0.22 - cover * 0.10) return 4;
  const lit = slope > 1e-6
    ? ((-gx * SUN_AX) + (-gz * SUN_AZ)) / slope * Math.min(1, slope / 0.25)
    : 0;
  /**
   * ススキ and bracken — **and this is now the term that carries the near belt.**
   *
   * It was keyed on height and aspect: `hAvg > 10.5 + tj·5.0 && lit > 0.12`.  Two
   * things were wrong with that.  It fired on any low cell whose `tj` happened to
   * reach −0.5, so bracken appeared as *isolated single cells* of yellow-tan on an
   * otherwise uniform green slope, which reads as a fault rather than as ground.
   * And more importantly it never fired on the one slope that needed it.
   *
   * The measurement is the argument.  Over the belt behind the school `lit` runs
   * 0.42–0.89: that ground **is** uniformly sunlit, so a light-to-dark ladder has
   * no honest answer for it other than "light", and pushing it dark would be
   * painting shade that is not there.  What separates ground that is all lit the
   * same is not value, it is **cover** — and `hillBracken` is 0.739 against
   * `hillGrassSun`'s 0.754, i.e. the same value and a decisively different hue.
   * That is the one pair of tones in the ladder that can differ on a slope where
   * the light does not, which is exactly what the palette note says it is for.
   *
   * So dry patches read as ススキ at any height, with a mild preference for the
   * high ground where it would actually be drier, and the green ladder below
   * handles the rest.
   */
  if (lit > 0.08 && cover + (hAvg - 6.0) * 0.02 > 0.42 + tj * 0.30) return 3;
  /* **Height biases the choice, and without it a long uniform slope is one tone.**
   * Aspect cannot separate ground that all faces the same way, and the massif's
   * flanks are exactly that -- 40 m of constant bearing at a constant 0.45, which
   * rendered as one flat sheet of green even with five tones available.  0.022 per
   * metre puts about 0.24 of `lit` between the toe and the crest, which is most of
   * the way from one band to the next, so a flank breaks into bands *along* itself:
   * lighter and drier toward the top, darker in the hollows, which is both what a
   * hillside does and what makes it read as a solid.
   *
   * It does not become a contour line because `tj` moves the threshold by ±0.15,
   * i.e. ±6.8 m of height, which on a 0.45 slope is ±15 m of ground.
   *
   * **And the cover term at 0.55, which is the largest of the three.**  It has to
   * be: `lit` runs 0.42 to 0.89 across the near belt and the height term spans
   * 0.16 there, so nothing else in this expression can carry `key` across the 0.46
   * threshold and 88 % of that slope came out in one tone.  ±0.55 of cover puts
   * `key` between 0.16 and 1.26 over the same ground, which breaks it into patches
   * of light and mid green at the 20 m scale a patch of cover actually is — and,
   * in the hollows where cover and aspect agree, into the deep tone that the whole
   * belt had none of. */
  const key = lit + (hAvg - 7.0) * 0.022 + cover * 0.55;
  if (key > 0.46 + tj * 0.30) return 0;            // sunlit turf
  if (key < -0.44 + tj * 0.30) return 2;           // damp, shaded, gully floors
  return 1;                                        // the mid tone
}

/**
 * Build the hill surface: one non-indexed mesh per tone, sharing the lattice.
 *
 * Non-indexed and flat-shaded on purpose -- `computeVertexNormals()` on a
 * non-indexed geometry *is* flat shading, which the bake then reproduces for
 * free because `wrapGeometry` deletes and recomputes the normals the same way.
 * Adjacent facets in different tones share their vertex positions exactly, so
 * the tone changes on a facet edge with no seam and no gap.
 */
function buildSurface(ctx) {
  const m = hillMats();
  const pos = [[], [], [], [], [], [], [], []];
  const tri = (list, a, b, c) => {
    list.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  let cells = 0;

  for (let i = I0; i < I1; i++) {
    for (let j = J0; j < J1; j++) {
      const h00 = nodeAt(i, j);
      const h10 = nodeAt(i + 1, j);
      const h01 = nodeAt(i, j + 1);
      const h11 = nodeAt(i + 1, j + 1);
      /* the buried apron: a cell entirely on the floor is never drawn.  **Against
       * `FLOOR` and not `-SKIRT`** -- the float32 note above; this test never once
       * fired, so every square metre of apron in the world was being drawn 0.63 m
       * under the terrain grid, and over the channel, where there is no grid, it
       * was being drawn in the water. */
      if (h00 <= FLOOR && h10 <= FLOOR && h01 <= FLOOR && h11 <= FLOOR) continue;
      const x0 = i * CELL, x1 = x0 + CELL;
      const z0 = j * CELL, z1 = z0 + CELL;
      // the caps' footprints belong to tunnel.js
      let inCap = false;
      for (const n of NOTCHES) {
        if (x0 >= n.x0 && x1 <= n.x1 && z0 >= n.z0 && z1 <= n.z1) { inCap = true; break; }
      }
      if (inCap) continue;
      cells++;
      const g0 = groundY(z0) - TERRAIN_DROP;
      const g1 = groundY(z1) - TERRAIN_DROP;
      const P00 = [x0, g0 + h00, z0];
      const P10 = [x1, g0 + h10, z0];
      const P01 = [x0, g1 + h01, z1];
      const P11 = [x1, g1 + h11, z1];
      const hash = jitterAt(i * 3 + 1, j * 5 + 2);
      /**
       * The *tone* jitter, and it is deliberately coarser than `hash`.
       *
       * `hash` is per cell and is handed to the two triangles of that cell with
       * **opposite signs**, which is right for the slope threshold (it stops a
       * 6 m² cell being one flat lozenge of bare earth) and badly wrong for a tone
       * boundary: it maximises the chance that one triangle of a pair lands on the
       * far side of a threshold from its twin, and the render showed exactly that
       * -- isolated single facets of the wrong green scattered over the hillside,
       * reading as errors rather than as ground.
       *
       * So the tone thresholds use a hash of the lattice index shifted down one
       * bit, which is coherent over 2 x 2 cells -- 6 m patches, the scale of a
       * change of cover -- with a fifth of the fine hash mixed in so the patch
       * edges are not straight either.  Both triangles of a cell see the *same*
       * value.
       */
      const tj = jitterAt((i >> 1) * 7 + 3, (j >> 1) * 11 + 5) * 0.8 + hash * 0.2;
      /**
       * The plantation floor overrides everything else, and it is tested **once
       * per cell at the cell's centre** rather than per facet.
       *
       * Both of those matter.  A tone that keys off cover rather than off light
       * must not be jittered by `hash`, which is handed to a cell's two triangles
       * with opposite signs -- that is what produced confetti when the height
       * threshold was first written, and it would be far worse on a boundary the
       * eye is meant to read as a straight line.  And the boundary has to be the
       * same one `plantRange` planted against or the litter and the cedar drift
       * apart by a tree, so it goes through `standAt` like everything else.
       *
       * A stand can still overlap the toe of its own hill, where the ground is
       * flat and open; below 1.2 m of field there is no plantation to be under
       * (the cedar sampler wants 0.5, but a tree on a 0.6 m rise does not shade
       * anything), so the floor hands back to whatever the light says.
       */
      const litter = standAt(x0 + CELL / 2, z0 + CELL / 2)
        && (h00 + h10 + h01 + h11) / 4 > 1.2;
      // the cover field, at the cell centre for the same reason `tj` is
      const cover = coverAt(x0 + CELL / 2, z0 + CELL / 2);
      /**
       * ひばり湖's bed and its waterline, and both are decided **per cell at the
       * cell centre** for exactly the reason `litter` is: this is a boundary the
       * eye reads as a line, and `hash` is handed to a cell's two triangles with
       * opposite signs.  Jittered, a waterline comes out as a zip of alternating
       * triangles, which is the confetti failure two notes up.
       *
       * The band above the water is 0.85 m of field rather than a distance along
       * the ground, so a steep revetment gets a thin line of exposed shore and the
       * reed flat -- bank 0.10 -- gets eight metres of it.  Which is correct: the
       * width of a drawdown margin is the level's fall divided by the slope, and
       * nothing else.
       */
      const hAvg = (h00 + h10 + h01 + h11) / 4;
      let lakeTone = -1;
      {
        const lk = lakeNear(x0 + CELL / 2, z0 + CELL / 2);
        if (lk) {
          if (lk.d > -0.4 && hAvg < LAKE_LEVEL - 0.02) lakeTone = 6;
          else if (lk.d > -7.0 && hAvg < LAKE_LEVEL + 0.85) lakeTone = 7;
        }
      }
      /* `dhx`/`dhz` are raw drops across the cell, so the gradient is `dh / CELL`
       * -- and `faceTone` needs the two components and not just the magnitude,
       * because aspect is a direction. */
      const face = (a, b, c, ha, hb, hc, dhx, dhz, hs) => {
        if (lakeTone >= 0) { tri(pos[lakeTone], a, b, c); return; }
        const gx = dhx / CELL, gz = dhz / CELL;
        const t = faceTone((ha + hb + hc) / 3, Math.hypot(gx, gz), gx, gz, hs, tj, cover);
        // bare earth still wins: a scarp inside a plantation is still a scarp
        tri(pos[litter && t !== 4 ? 5 : t], a, b, c);
      };
      if (flipped(i, j)) {
        // diagonal (1,0)-(0,1):  (00,01,10) and (10,01,11)
        face(P00, P01, P10, h00, h01, h10, h10 - h00, h01 - h00, hash);
        face(P10, P01, P11, h10, h01, h11, h11 - h01, h11 - h10, -hash);
      } else {
        // diagonal (0,0)-(1,1):  (00,11,10) and (00,01,11)
        face(P00, P11, P10, h00, h11, h10, h10 - h00, h11 - h10, hash);
        face(P00, P01, P11, h00, h01, h11, h11 - h01, h01 - h00, -hash);
      }
    }
  }

  /* One merged non-indexed mesh per tone, so five tones is five draw calls against
   * three -- which against ~5 800 in the heaviest view is nothing, and each mesh
   * carries a single material so none of them needs `geometry.groups` to survive
   * the bake.  The index order here *is* `faceTone`'s return value. */
  const mats = [m.grassSun, m.grass, m.grassDeep, m.bracken, m.earth, m.litter,
    m.lakeBed, m.lakeShore];
  const names = ['hillSun', 'hillTurf', 'hillDeep', 'hillBracken', 'hillEarth',
    'hillLitter', 'lakeBed', 'lakeShore'];
  let tris = 0;
  pos.forEach((list, k) => {
    if (!list.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mats[k]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = names[k];
    ctx.add(mesh);
    tris += list.length / 9;
  });
  return { cells, tris };
}

/* ------------------------------ rock outcrops ------------------------------ */

/**
 * Boulders and outcrops, instanced.
 *
 * They do one job the ground cannot: give a slope a scale.  A faceted hillside
 * has no object on it of known size, so a 14 m hill and a 40 m hill look the
 * same until something a metre across is standing on one.  Seated on the field
 * and tipped into the slope, biased onto the steeper ground where rock actually
 * shows, and kept off the trail corridor.
 */
export function buildOutcrops(ctx, spots) {
  if (!spots.length) return;
  const m = hillMats();
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const lists = [[], []];
  for (const s of spots) {
    const rng = rngKit(s.seed ?? 41);
    const n = s.n ?? 3;
    /* `yAt` exists for the tunnel caps.  Inside a notch the field is cut out, so
     * `hillMeshY` answers with the flat grade and a boulder meant for the
     * mountain over a bore would be seated fifteen metres under it, invisible.
     * A cap knows its own surface; everything else keeps the default. */
    const yOf = s.yAt ?? hillMeshY;
    for (let k = 0; k < n; k++) {
      const px = s.x + rng.range(-1, 1) * (s.spread ?? 1.8);
      const pz = s.z + rng.range(-1, 1) * (s.spread ?? 1.8);
      const r = (s.r ?? 0.7) * rng.range(0.55, 1.35);
      lists[k % 2].push(trs(
        px, yOf(px, pz) + r * 0.42, pz,
        rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.3, 0.3),
        r, r * rng.range(0.55, 0.8), r * rng.range(0.8, 1.25)
      ));
    }
  }
  lists.forEach((list, k) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(geo, k ? m.rock : cel({
      color: PAL.hillRock, bands: 3, tint: 0x655d84,
    }), list.length);
    list.forEach((mx, idx) => inst.setMatrixAt(idx, mx));
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.name = 'hillRock' + k;
    ctx.add(inst);
  });
}

/* -------------------------------- grass tufts -------------------------------- */

/**
 * 野草 -- tussocks of rough grass.
 *
 * Not drawn. Callers still collect spots so the planting rng, and
 * everything hung off it, does not move. The race field made the same
 * cut: blades cost a shadow-caster pass for a texture the pilot does
 * not need.
 */
export function buildTufts(ctx, spots) {
  void ctx;
  void spots;
}

/* -------------------------------- moss patches -------------------------------- */

/** Flat colour patches on the ground -- damp hollows and the north side of
 * things.  Same construction as `dapple`: quads out of the depth buffer so the
 * ink pass ignores them, seated on the field. */
function buildMoss(ctx, spots) {
  if (!spots.length) return;
  const geo = new THREE.CircleGeometry(1, 9);
  geo.rotateX(-Math.PI / 2);
  const list = [];
  for (const s of spots) {
    const rng = rngKit(s.seed ?? 91);
    const n = s.n ?? 4;
    for (let k = 0; k < n; k++) {
      const px = s.x + rng.range(-1, 1) * (s.spread ?? 2.2);
      const pz = s.z + rng.range(-1, 1) * (s.spread ?? 2.2);
      const r = (s.r ?? 1.1) * rng.range(0.6, 1.4);
      list.push(trs(px, hillMeshY(px, pz) + 0.025, pz, 0, rng.range(0, 3), 0, r, 1, r * rng.range(0.7, 1.2)));
    }
  }
  const inst = new THREE.InstancedMesh(geo, flat({
    color: PAL.hillMoss, transparent: true, opacity: 0.5, depthWrite: false, cache: false,
  }), list.length);
  list.forEach((mx, idx) => inst.setMatrixAt(idx, mx));
  inst.userData.noOutline = true;
  inst.renderOrder = 1;
  inst.name = 'hillMoss';
  ctx.add(inst);
}


/**
 * The places on the hills something gets built.
 *
 * They live here rather than in the district for the same reason the trails do:
 * every one of them was chosen off the field -- the deck is on the massif's north
 * shoulder because that is the only high ground with a clean fall away toward the
 * school, the glade is at (-17, -127) because that is where the shelf is flat to
 * 0.04, the 祠 is on the western foothill's ridge because a wayside shrine goes
 * at a turn in the path.  The forest is planted round them, so the list has to be
 * readable by the planting pass; and the district reads the same list, so there
 * is one set of coordinates and not two.
 *
 * `r` is the radius the trees keep out of, not the size of the thing.
 */
export const SITES = {
  /** 桜守台 展望台 -- the viewing deck, 13.9 m up on the north shoulder. */
  deck: { x: 34.5, z: -128.2, r: 10 },
  /** 山の祠 -- the wayside shrine at the turn on the foothill's ridge. */
  hokora: { x: -38.5, z: -112.5, r: 6.5 },
  /** 林間空地 -- the clearing on the shelf, the flattest ground on the hill. */
  glade: { x: -17.0, z: -127.0, r: 10 },
  /** a second, smaller clearing on the crest, at the ridge walk's middle. */
  crestGlade: { x: 8.0, z: -138.4, r: 7.5 },
  /** the maintenance compound at the trail head, off the hill-foot road. */
  yard: { x: 24.0, z: -99.0, r: 5.5 },
  /** the rest platform on the upper traverse, where the shelf opens out. */
  rest: { x: -3.0, z: -122.4, r: 5 },
  /** the railside viewing spot by ひばり山トンネル's east portal (`tunnel.js`). */
  tview: { x: -89.0, z: -9.0, r: 7 },
  /**
   * 東山トンネル's railside spot, on the **north** field by its west portal.
   *
   * North because that is the mirror of the other bore, and west because the sun
   * is at (-52, 62, 56): a portal face whose normal is -x is lit and one whose
   * normal is +x is in shade every hour of the day.  ひばり山's watchable face is
   * its east one, so this one's is its west, and the two spots therefore look in
   * opposite directions as well as standing on opposite sides.
   *
   * x = 91 puts it 17 m from the mouth and, more to the point, **west of the
   * north retaining kerb**, which starts at 93 and is a wall.  Anywhere inside
   * the cutting is a spot with no way to it.
   */
  tviewE: { x: 91.0, z: 7.2, r: 7 },
  /**
   * And its overlook, on the **south** ridge -- E2b, the 7 m of ground between
   * the railway and the drainage channel.  8 m above the track and 13 m out, so
   * the sight line runs into the arch at about 20°.
   *
   * **On the crest, and nowhere else will do.**  The obvious saving -- put it on
   * the shoulder at z = -13.6, where a path can reach it at a worst grade of 0.71
   * instead of 0.95 -- was tried and rendered as a screen of hillside filling the
   * whole frame, because from 1.6 m south of the crest you are looking at the
   * back of the crest.  Exactly what happened to the other overlook's first
   * position, and the reason that one's comment says "on the *crest* at z = 12".
   *
   * Chosen by a sweep this time rather than by eye: every point on the ridge was
   * tested by tracing the sight line to the arch against `hillAt`, and (104, -12)
   * is the highest of the 75 that can see it.  4 m west and 12 m south of the
   * mouth, 7.7 m up, so the line runs down onto a train coming out at about 30°.
   */
  toverE: { x: 104.0, z: -12.0, r: 6.5 },
  /**
   * The overlook on the cutting's north bank, above the east portal.
   *
   * On the *crest* at z = 12 and not further back at 18: the bank rises from the
   * corridor's edge to about 9.5 m by z = 12 and then flattens, so anywhere north
   * of the crest is looking at the back of it.  Measured, and the first position
   * (-94, 18) rendered as a solid violet screen because the sight line to the
   * portal went straight into the hillside.
   *
   * And **east of the mouth rather than over it**: from directly above, 8 m up
   * and 12 m out, all you see is the top of the coping and the knoll's own slope
   * filling the frame.  From (-86, 12) the line runs *along* the track into the
   * arch at 15°, which is the shot -- a train going into a hill, seen from above
   * it.
   */
  tover: { x: -86.0, z: 12.0, r: 7 },

  /* ------------------------- ひばり湖 -------------------------
   * The lake district's nodes.  `kohan.js` reads exactly these coordinates, and
   * `r` is the radius the range's own procedural planting keeps out of -- which
   * for the built ones is generous, because a lakeside park that the automatic
   * wood has grown three grove trees into is not a lakeside park.
   *
   * The two that matter most are the ones nothing is built on.  `lakeDeck` is the
   * high point on the east shoulder the whole district is composed around, and
   * `pierHead` is 26 m out over the water: both have view corridors below, and
   * both were placed against the *curvature* rather than by eye.  From
   * (124, -108) the eye is 14.4 m up, so the ground horizon is 68 m and the
   * peninsula's tip at 66 m lands exactly on it.  From the 桟橋's end the eye is
   * 1.7 m over the surface, so the water is visible for 23 m and the peninsula --
   * 3 m of land 22 m away -- is the only thing that stops the frame being water
   * and haze.
   */
  /** ひばり湖 見晴台 -- the overlook on the east shoulder, 11.5 m up. */
  lakeDeck: { x: 124.0, z: -108.0, r: 9 },
  /** 堰堤 -- the embankment's midpoint, and the road across it. */
  damSite: { x: 150.0, z: -40.5, r: 13 },
  /** the management yard on the downstream side, between the road and the 放水路. */
  mgmtYard: { x: 146.0, z: -30.0, r: 9 },
  /** ひばり湖畔公園 -- the lawn, the plaza and the 東屋. */
  lakePark: { x: 136.0, z: -76.0, r: 15 },
  /** 見晴らし桟橋's end platform, 26 m out over the water. */
  pierHead: { x: 167.0, z: -80.0, r: 9 },
  /** 貸ボート ひばり -- the boat house and its floating dock. */
  boatHouse: { x: 145.0, z: -101.0, r: 10 },
  /**
   * 喫茶 みなも -- the lakeside cafe, its terrace and its car park.
   *
   * **z was -141 and is -145.2**, and the four metres are the whole section.  At
   * -141 the building's own collider ran from z = -144.3 to -137.7 and the shore
   * walk passes (179, -138.1): the walk went *through the cafe*, and the flood fill
   * found it as one unreachable waypoint on a brick rest area 40 m away.  Nothing
   * about a rendered frame said so -- the walk simply disappeared into a wall.
   *
   * The south shore needs 20 m of depth to hold what the brief asks for, and it
   * has to be in this order going inland: water, walk, terrace, building, car
   * park, road.  Which is also what a lakeside cafe on a promenade *is* -- the
   * walk passing between the terrace and the water is the arrangement, not a
   * conflict, and it is why `shoreRoad`'s south leg swings 14 m further out than
   * it did.
   */
  cafe: { x: 179.0, z: -145.2, r: 14 },
  /** ひばり湖 キャンプ場 -- six pitches on the shelf above the reed bay. */
  camp: { x: 206.0, z: -150.0, r: 15 },
  /** 野鳥観察小屋 かいつぶり -- the hide at the reed bay's head. */
  hide: { x: 216.0, z: -146.0, r: 10 },
  /** 水神様 -- the stone shrine on the far shore, under the trees. */
  suijin: { x: 252.8, z: -91.4, r: 6.5 },
};

/**
 * A trail ribbon: a shallow slab swept along a polyline, following the field.
 *
 * Two things are load-bearing.  **Cross-sections every metre**, because the
 * ground is piecewise linear over 6 m facets and a ribbon sampled at the
 * polyline's own vertices cuts straight through every crease it crosses
 * diagonally.  And **side skirts that drop 0.3 m**, which is what makes the
 * clearance honest: the top face sits 45 mm over the field, so where a facet
 * bulges the skirt is what you see rather than a gap under a floating path with
 * an ink line drawn round it.  It is the same argument as `pad()` being a slab
 * and not a plane, one dimension further round.
 */
export function hillPath(ctx, o) {
  const m = hillMats();
  const pts = o.pts;
  const w = (o.w ?? 1.35) / 2;
  const lift = o.lift ?? 0.045;
  const drop = o.drop ?? 0.30;
  const step = o.step ?? 1.0;

  // resample the polyline at `step`
  const line = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      line.push([ax + (bx - ax) * t, az + (bz - az) * t]);
    }
  }
  line.push(pts[pts.length - 1]);

  const top = [];
  const side = [];
  const quad = (list, a, b, c, d) => {
    list.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  const rim = [];
  for (let k = 0; k < line.length; k++) {
    const p = line[k];
    const q = line[Math.min(line.length - 1, k + 1)];
    const r = line[Math.max(0, k - 1)];
    let tx = q[0] - r[0], tz = q[1] - r[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    const L = [p[0] + nx * w, p[1] + nz * w];
    const R = [p[0] - nx * w, p[1] - nz * w];
    rim.push([
      [L[0], hillMeshY(L[0], L[1]) + lift, L[1]],
      [R[0], hillMeshY(R[0], R[1]) + lift, R[1]],
    ]);
  }
  for (let k = 0; k < rim.length - 1; k++) {
    const [l0, r0] = rim[k];
    const [l1, r1] = rim[k + 1];
    // top face: wound so the normal is up
    quad(top, l0, l1, r1, r0);
    // skirts, both sides, facing outward
    const l0d = [l0[0], l0[1] - drop, l0[2]];
    const l1d = [l1[0], l1[1] - drop, l1[2]];
    const r0d = [r0[0], r0[1] - drop, r0[2]];
    const r1d = [r1[0], r1[1] - drop, r1[2]];
    quad(side, l0, l0d, l1d, l1);
    quad(side, r1, r1d, r0d, r0);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, o.mat ?? m.path);
  mesh.receiveShadow = true;
  mesh.name = o.name ?? 'hillPath';
  ctx.add(mesh);

  const gs = new THREE.BufferGeometry();
  gs.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
  gs.computeVertexNormals();
  const sm = new THREE.Mesh(gs, o.edgeMat ?? m.pathEdge);
  sm.receiveShadow = true;
  sm.name = (o.name ?? 'hillPath') + 'Edge';
  ctx.add(sm);
  return { line, rim, segs: trailSegs(pts) };
}

/**
 * The gradient of every leg of a trail, measured off the field.
 *
 * Returned by `hillPath` so a district can dress a pitch according to what it
 * actually is: a leg over about 0.28 gets 丸太階段 rather than bare earth, and
 * that decision belongs to the measured ground and not to a hand-written list
 * that goes stale the moment a summit moves 4 m.
 */
export function trailSegs(pts) {
  const out = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s];
    const b = pts[s + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
    const ha = hillAt(a[0], a[1]);
    const hb = hillAt(b[0], b[1]);
    out.push({
      a, b, len, up: hb > ha,
      grade: Math.abs(hb - ha) / len,
      ry: Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])),
    });
  }
  return out;
}

/** Longest gradient along a trail, as a check rather than as a guess. */
export function trailGrade(pts, step = 1.0) {
  let worst = 0, at = null;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0];
      const p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1];
      const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1e-6;
      const g = Math.abs(hillAt(p1[0], p1[1]) - hillAt(p0[0], p0[1])) / d;
      if (g > worst) { worst = g; at = [+p0[0].toFixed(1), +p0[1].toFixed(1)]; }
    }
  }
  return { worst: +worst.toFixed(3), at };
}

/* ------------------------------------------------------------------ *
 * The forest.
 * ------------------------------------------------------------------ */

/* ------------------------------- 杉林 ------------------------------- *
 * The plantation blocks, and the reason they are **blocks**.
 *
 * `trees.js`'s `buildCedar` gives the range a second silhouette; this decides
 * where it goes, and scattering it would throw away most of what it is for.  A
 * Japanese hillside is not a mixture: it is broadleaf with rectangles of 杉
 * planted into it, on compartment lines that cut straight across the contours,
 * and the **hard edge between the two is as recognisable as either species**.  A
 * cedar every fifth tree reads as a range with some dark trees on it; forty
 * cedars in a block with a straight side reads as a hillside somebody owns.
 *
 * So a stand is a rotated rectangle, the trees inside it are on a **grid** at
 * `pitch` with less jitter than the rectangle is wide, and the broadleaf sampler
 * refuses every candidate inside one.  Both readers go through `standAt`, so the
 * boundary cannot drift between the thing that plants the cedar and the thing
 * that keeps the oak out of it.
 *
 * Three rules the placements follow:
 *
 *   - **never in zone 0.**  The 26 m belt behind the school is deliberately
 *     thin -- it is the part you look *at*, from the hill-foot road and from the
 *     school, and the whole range is behind it.  A block of 11 m cedar there is a
 *     wall 20 m from the back fence.
 *   - **on ground a frame actually looks at.**  The hills cannot be seen from the
 *     town at this radius (measured: the highest visible point is 12.9 m *below*
 *     the sight line from the crossing), so every one of these is placed against
 *     a viewpoint that exists -- the crest walk, the 林間広場, the hill-foot
 *     road's east end, and the two tunnel mouths, which are the only frames in
 *     the world where a hillside fills half the picture.
 *   - **let them cross a notch.**  D and E overlap a tunnel cap, and `tunnel.js`
 *     asks `standAt` for its own planting, so a block runs over the mountain the
 *     railway goes through instead of stopping at an invisible rectangle.  That
 *     continuity is the whole reason this is one exported function and not a
 *     list in each module.
 *
 * `w` is along the rectangle's own +x after `rot`, `d` across it.
 */
export const STANDS = [
  /** A -- the back ridge behind the crest walk (A4/A1).  The skyline from the
   *  ridge walk, from the 林間広場 and from the hill-foot road, and the block the
   *  展望台's own 眺望案内 board has its back to. */
  { x: 24, z: -152, w: 60, d: 28, rot: 0.10, pitch: 4.0, seed: 7301 },
  /** B -- west of the glade, on A2's shoulder.  Closes the 林間広場 on its west
   *  side, which is the one clearing you stand in the middle of. */
  { x: -34, z: -140, w: 36, d: 26, rot: -0.25, pitch: 4.0, seed: 7302 },
  /** C -- east, behind the gym on A3.  Seen down the length of the 山裾の道 and
   *  from the trail head, which is the only view in the district that has 80 m of
   *  hillside in it and nothing built. */
  { x: 86, z: -138, w: 38, d: 26, rot: 0.18, pitch: 4.0, seed: 7303 },
  /** D -- the west arm north of ひばり山トンネル, crossing the notch's north edge
   *  (z = 24) so the cap carries it too.  This is the mass standing over and
   *  behind the portal in every frame of that mouth. */
  { x: -114, z: 30, w: 40, d: 24, rot: 0.0, pitch: 4.2, seed: 7304 },
  /** E -- the east col's north shoulder (E3), crossing 東山's notch at z = 21 for
   *  the same reason.  The `higW` and `higOver` frames are both looking at it. */
  { x: 120, z: 30, w: 34, d: 22, rot: -0.15, pitch: 4.2, seed: 7305 },
  /**
   * F -- ひばり湖's north rim, and it is the district's **far shore**.
   *
   * Every frame taken from the park, the 桟橋 or the cafe looks across 60 to 100 m
   * of water at this ridge, and on a 160 m planet most of the water in between is
   * under the horizon -- so what has to carry the far side of the picture is a
   * *skyline*, not ground.  A cloud of broadleaf blobs at that distance is a
   * smooth green arc with no scale in it; 11 m of 杉 on a 4 m grid is a saw edge
   * with a lit western flank, which is the one thing in this world that reads as
   * "the other side of the lake" at a hundred metres.
   *
   * It is also the bank the railway runs past on its far side, so the same block
   * is the mass behind the train at this longitude.  Two jobs, one stand.
   */
  { x: 198, z: -22, w: 52, d: 20, rot: 0.05, pitch: 4.2, seed: 7306 },
  /** G -- the east rim, closing the end of the basin behind the 水神様. */
  { x: 262, z: -98, w: 26, d: 38, rot: -0.12, pitch: 4.2, seed: 7307 },
];

/**
 * The boundary wobble.
 *
 * A compartment line is straight, not machined: surveyed on the ground, planted
 * by hand, and forty years of windthrow later it wanders by a tree or two.  ±1.2 m
 * on a 4.5 m quantisation keeps the edge legible as a straight line from fifty
 * metres and stops it reading as a stencil from ten.  It is a hash of position
 * rather than of a lattice index because a stand is rotated and does not line up
 * with the lattice at all.
 */
const standWobble = (x, z) =>
  jitterAt(Math.round(x / 4.5) * 13 + 7, Math.round(z / 4.5) * 17 + 3) * 2.4;

/** Which plantation block a point is in, or null.  The single source of truth for
 *  the boundary -- `plantRange` and `tunnel.js`'s cap planting both read it. */
export function standAt(x, z) {
  for (const st of STANDS) {
    const c = Math.cos(st.rot), s = Math.sin(st.rot);
    const dx = x - st.x, dz = z - st.z;
    const lx = dx * c + dz * s;
    const lz = -dx * s + dz * c;
    const wob = standWobble(x, z);
    if (Math.abs(lx) < st.w / 2 + wob && Math.abs(lz) < st.d / 2 + wob) return st;
  }
  return null;
}

/**
 * Plant the whole range, procedurally, and hand the spots back.
 *
 * A district returns its planting rather than planting it -- the tree builders
 * merge every tree in the world into one wood mesh and three instanced canopies,
 * so they run once at the end -- and that is even more true here, because this
 * is by far the largest planted area in the world and doing it any other way
 * would multiply the canopy draw calls by the number of hills.
 *
 * The brief asked for the vegetation to change across the range, and it does,
 * on one rule: **distance from the town**.  Near the school the wood is thinned
 * and swept, with blossom in it and clear turf between the trunks; up on the
 * ridge and deep in the range it closes to evergreen with bamboo in the
 * hollows; along the railway arm it goes scrubby -- more shrub, more bare earth,
 * fewer and rougher trees -- because that is what the land beside a railway
 * actually looks like when nobody is maintaining it.
 *
 * Everything is rejected rather than placed: a candidate has to be on the hill
 * (field > 0.5), off the steep faces, off every trail corridor, and clear of the
 * nodes the district builds.  Rejection is cheaper than cleverness and it is the
 * only way a 30 000 m² planting stays out of the paths.
 */
function plantRange(keepOuts) {
  const rng = rngKit(31337);
  const sakura = [];
  const grove = [];
  const cedar = [];
  const bamboo = [];
  const shrubs = [];
  const rocks = [];
  const tufts = [];
  const moss = [];
  const petals = [];

  /* Distance to the nearest route's *edge*, over `TRAILS` and `ROUTES` together.
   *
   * It used to walk a private copy of `TRAILS`, which was fine while every route
   * in the world was 1.35 m wide.  A 4 m carriageway is not: measured from its
   * centreline, "3 m clear" is 1 m of verge, and a grove tree collides with a
   * 1.42 m box at scale 1.75.  `trailClearance` subtracts the route's own bench
   * half-width, so the thresholds below keep their meaning -- metres clear of the
   * made surface -- whatever it is a route of. */
  const distToTrail = (x, z) => trailClearance(x, z);
  const clearOfNodes = (x, z) => {
    for (const k of keepOuts) {
      if (Math.hypot(x - k.x, z - k.z) < k.r) return false;
    }
    return true;
  };
  /**
   * Standing water, plus a quarter of a metre of freeboard.
   *
   * This is not a nicety.  The rejection sampler's only test for "is there ground
   * here" is `fieldAt > 0.5`, and ひばり湖's **bed is field 0.8 to 3.4** -- so
   * without it the sampler plants 11 m broadleaf in two and a half metres of
   * water, and it does so over the west half of the lake specifically, because
   * that is the part inside the sweep's own x window.  It would render perfectly:
   * a wood standing in a lake, with its own reflections.
   *
   * The polygon test has to come first.  `lakeDepthAt` is `LEVEL - field` and is
   * therefore +3.4 over the whole flat world; on its own it rejects everything.
   */
  const inWater = (x, z) => inLakePoly(x, z) && fieldAt(x, z) < LAKE_LEVEL + 0.25;

  /**
   * View fans, and they are not optional.
   *
   * A deck 7 m up is *inside* the blossom, so a single tree five metres off the
   * end of it closes the whole distance -- the overbridge learned that and so did
   * the school gate axis.  A deck 3.6 m up on a hill 14 m up is inside the
   * canopy layer of everything downhill of it, which is worse: the first render
   * of the 展望台 had two grove trees 12 m out screening most of the school.
   *
   * So each viewpoint carries a sector nothing is planted in, and the sector is
   * *long* -- 46 m for the deck, which is most of the way to the school's back
   * wall.  Outside the fan the wood closes up immediately, which is what frames
   * the view rather than opening the whole hilltop.
   */
  const VIEWS = [
    // the 展望台, north over the descending slope to the school
    { x: SITES.deck.x, z: SITES.deck.z, dx: -4.5, dz: 44.0, half: 9.0, spread: 0.55, range: 48 },
    // the overlook on the cutting's north bank, south at ひばり山's east portal
    { x: SITES.tover.x, z: SITES.tover.z, dx: -3.0, dz: -13.0, half: 6.0, spread: 0.5, range: 26 },
    // 東山's railside spot, east-south-east into its west portal
    { x: SITES.tviewE.x, z: SITES.tviewE.z, dx: 17.0, dz: -7.2, half: 5.5, spread: 0.45, range: 24 },
    // and its overlook on the south ridge, north-east into the same mouth
    { x: SITES.toverE.x, z: SITES.toverE.z, dx: 4.0, dz: 12.0, half: 5.5, spread: 0.5, range: 24 },
    /**
     * The approach to the 展望台 along the crest, north-east onto the deck.
     *
     * Added with the 杉林 and found by a render.  `SITES.deck` keeps planting 10 m
     * off the deck itself, which was enough while the crest carried scattered
     * broadleaf -- and stand A comes up to within a metre and a half of the ridge
     * walk, so the twelve metres between the crest and the deck filled with
     * plantation and the establishing shot of the 展望台 came back as a wall of
     * cedar with no deck in it.  A block of 11 m conifer is not a scatter: the
     * only thing that keeps a line of sight open through one is a corridor.
     *
     * Narrower and shorter than the others (5 m at the apex, 14 m long) because
     * what it has to protect is the moment you *see* the deck rather than the view
     * from it -- and because a wide clearing here would cut the plantation in two
     * along the very edge the crest walk is worth walking for.
     */
    { x: 30.0, z: -139.0, dx: 4.5, dz: 10.8, half: 5.0, spread: 0.35, range: 14 },
    /* ------------------------- ひばり湖 -------------------------
     * The lake's own corridors, and they are the longest in the world because
     * they are the only ones that have to reach across water.
     *
     * `lakeDeck` looks east-north-east down the whole basin, and its 74 m is the
     * *measured* ground horizon from 14.4 m up rather than a round number: a tree
     * beyond that is below the curve and cannot be in the way, and one inside it
     * is the view.  The other three are short and wide, because what has to be
     * kept clear for a viewpoint standing *at* the water is the near bank -- the
     * far shore is 100 m away and 40 m of it is already over the horizon.
     */
    { x: SITES.lakeDeck.x, z: SITES.lakeDeck.z, dx: 30.0, dz: 14.0, half: 7.0, spread: 0.42, range: 74 },
    // the 桟橋's end, east down the lake past the peninsula
    { x: SITES.pierHead.x, z: SITES.pierHead.z, dx: 24.0, dz: -12.0, half: 8.0, spread: 0.30, range: 34 },
    // the park's plaza, east across the water
    { x: SITES.lakePark.x, z: SITES.lakePark.z, dx: 24.0, dz: -3.0, half: 10.0, spread: 0.24, range: 32 },
    // the cafe's terrace, north over the water at the boat house
    { x: SITES.cafe.x, z: SITES.cafe.z, dx: -12.0, dz: 24.0, half: 8.0, spread: 0.30, range: 32 },
    // the 野鳥観察小屋, north-west across the reed flat
    { x: SITES.hide.x, z: SITES.hide.z, dx: -14.0, dz: 18.0, half: 7.0, spread: 0.32, range: 30 },
  ];
  /**
   * A **corridor**, not a cone.
   *
   * A sector from a point is arbitrarily narrow at its apex, so a 32° fan out of
   * the deck left a 4 m gap five metres in front of it -- which is where a cedar
   * went, and a cedar five metres from a viewing platform is the whole view.  The
   * test is a half-width that starts at 9 m and opens with distance, so the trees
   * are held back where it matters and the wood closes in behind them.
   */
  const clearOfViews = (x, z) => {
    for (const v of VIEWS) {
      const px = x - v.x, pz = z - v.z;
      const dl = Math.hypot(v.dx, v.dz);
      const ax = v.dx / dl, az = v.dz / dl;
      const along = px * ax + pz * az;
      if (along < -3 || along > v.range) continue;
      const lat = Math.abs(px * az - pz * ax);
      if (lat < v.half + Math.max(0, along) * v.spread) return false;
    }
    return true;
  };

  /* The three belts.  `zone` is what the vegetation actually keys off, and it is
   * a distance to the built edge rather than a rectangle, so the transition
   * follows the shape of the town instead of cutting across the range. */
  const zone = (x, z) => {
    // 0 = the swept edge by the school, 1 = deep range, 2 = the railway arm
    if (x < -80) return 2;
    const dz = -96 - z;                     // metres south of the school's back
    if (dz < 26 && x > -40 && x < 100) return 0;
    return 1;
  };

  /* ------------------------------ the 杉林 ------------------------------
   * Planted first, and on a grid rather than by rejection sampling, because a
   * plantation *is* a grid -- see the note on `STANDS`.  The same four rejections
   * the broadleaf uses still apply (on the hill, off the steep faces, off the
   * trails, out of the view corridors and clear of the district's own nodes), so
   * a block that runs into a path or over a viewpoint simply thins out there
   * instead of having to be redrawn.
   *
   * 1.05 of slope rather than the broadleaf's 0.9: sugi is planted on ground
   * nothing else would be, and half of what a plantation looks like from below is
   * that it goes right up the steep bit.  Still well under the 1.3-1.9 the two
   * ring corridors allow, which is engineered face and gets 法枠工 instead.
   */
  for (const st of STANDS) {
    const srng = rngKit(st.seed);
    const c = Math.cos(st.rot), s = Math.sin(st.rot);
    const nu = Math.round(st.w / st.pitch);
    const nv = Math.round(st.d / st.pitch);
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const lx = -st.w / 2 + (i * st.w) / nu + srng.range(-0.85, 0.85);
        const lz = -st.d / 2 + (j * st.d) / nv + srng.range(-0.85, 0.85);
        const x = st.x + lx * c - lz * s;
        const z = st.z + lx * s + lz * c;
        // the wobbly edge is the authority, not the nominal rectangle
        if (standAt(x, z) !== st) continue;
        const f = fieldAt(x, z);
        if (f < 0.5) continue;
        if (inWater(x, z)) continue;
        if (hillSlope(x, z) > 1.05) continue;
        if (distToTrail(x, z) < 3.0) continue;
        if (!clearOfNodes(x, z)) continue;
        if (!clearOfViews(x, z)) continue;
        cedar.push({
          x, z, y: groundY(z) + f,
          scale: srng.range(0.86, 1.2), seed: 52000 + cedar.length * 5,
          lean: srng.range(0, 0.045), leanDir: srng.range(0, 6.28),
        });
      }
    }
  }

  let tries = 0;
  const TARGET = 560;
  while (sakura.length + grove.length < TARGET && tries < 26000) {
    tries++;
    const x = rng.range(-166, 166);
    const z = rng.range(-190, 106);
    const f = fieldAt(x, z);
    if (f < 0.5) continue;
    if (inWater(x, z)) continue;
    const s = hillSlope(x, z);
    if (s > 0.9) continue;
    const dTrail = distToTrail(x, z);
    if (dTrail < 3.0) continue;
    if (!clearOfNodes(x, z)) continue;
    if (!clearOfViews(x, z)) continue;
    /* **The hard edge.**  Inside a plantation there is no broadleaf at all, and
     * no understorey either -- a closed 杉林 floor is needles and shade, which is
     * why a stand reads as a different *kind* of ground and not merely as darker
     * trees.  Rejecting here rather than thinning is the whole point: a boundary
     * you can see is worth more than a gradient nobody notices. */
    if (standAt(x, z)) continue;
    const zn = zone(x, z);

    /* Density.  The near belt is deliberately sparse -- it is the bit you look
     * *at*, from the school and from the road, and a wall of trunks 20 m behind
     * the back fence would hide the whole range.  It thickens with height and
     * with distance from the paths. */
    const near = Math.min(1, dTrail / 22);
    const p = zn === 0 ? 0.30 + near * 0.22
      : zn === 2 ? 0.42 + near * 0.26
        : 0.55 + near * 0.30 + Math.min(0.16, f / 90);
    if (!rng.chance(p)) continue;

    const seed = 40000 + sakura.length * 7 + grove.length * 3;
    const y = () => groundY(z) + f;
    // blossom near the school and along the trails; evergreen everywhere else
    const blossomOdds = zn === 0 ? 0.42 : zn === 2 ? 0.10 : 0.16;
    if (rng.chance(blossomOdds)) {
      sakura.push({
        x, z, y: y(), scale: rng.range(0.94, 1.26), seed,
        lean: rng.range(0.04, 0.15), leanDir: rng.range(0, 6.28),
      });
      if (rng.chance(0.3)) petals.push({ x, z, y: y(), r: rng.range(1.4, 2.6), seed: seed + 1 });
    } else {
      grove.push({
        x, z, y: y(),
        scale: zn === 2 ? rng.range(1.0, 1.42) : rng.range(1.12, 1.68),
        seed, spread: zn === 2 ? rng.range(0.85, 1.05) : rng.range(0.95, 1.25),
        lean: rng.range(0.02, zn === 2 ? 0.14 : 0.08), leanDir: rng.range(0, 6.28),
      });
    }

    // the understorey, hung off the trees so it clusters the way scrub does
    if (rng.chance(zn === 2 ? 0.62 : 0.4)) {
      shrubs.push({
        x: x + rng.range(-3.4, 3.4), z: z + rng.range(-3.4, 3.4), y: y(),
        r: rng.range(0.42, 0.62), count: rng.int(3, 5), spread: rng.range(1.2, 2.2),
        seed: seed + 11,
      });
    }
    if (rng.chance(0.24)) {
      tufts.push({
        x: x + rng.range(-4.5, 4.5), z: z + rng.range(-4.5, 4.5),
        n: rng.int(4, 8), spread: rng.range(1.2, 2.4), seed: seed + 21,
      });
    }
    if (rng.chance(zn === 2 ? 0.2 : 0.11)) {
      rocks.push({
        x: x + rng.range(-4, 4), z: z + rng.range(-4, 4),
        n: rng.int(2, 4), r: rng.range(0.5, 1.05), spread: rng.range(1.2, 2.4),
        seed: seed + 31,
      });
    }
    if (s > 0.34 && rng.chance(0.14)) {
      moss.push({
        x: x + rng.range(-3, 3), z: z + rng.range(-3, 3),
        n: rng.int(3, 5), r: rng.range(0.8, 1.5), spread: rng.range(1.6, 2.8),
        seed: seed + 41,
      });
    }
  }

  /* ------------------------- the ground between the trees -------------------------
   * **Everything at the half-metre scale was hung off a tree, and the one belt
   * that has no trees is the one the town looks at.**
   *
   * Tussocks, boulders and moss are all pushed inside the tree loop above, at
   * `rng.chance(0.24)`, `0.11` and `0.14` of a *tree* — so their density follows
   * the planting density exactly.  That is right for the deep range and exactly
   * backwards for zone 0, which is deliberately thinned to 0.30 so the hills stay
   * visible behind the school: 28 m of hillside with three shrubs on it and
   * nothing else, which is the whole of what "there is nothing on it of known
   * size" means at this scale.  A hundred square metres of unbroken green needs
   * something a foot high standing in it far more than the wood does.
   *
   * So this is an independent sweep over open ground, biased **toward** the thin
   * belts rather than away from them, and it is the cheapest thing in the module:
   * every one of these merges into instanced meshes that already exist, so it adds
   * no draw calls at all.
   *
   * Nothing inside a plantation — a closed 杉林 floor is needles and shade, which
   * is the whole reason it has its own ground tone.
   */
  for (let k = 0; k < 14000; k++) {
    const x = rng.range(-166, 166);
    const z = rng.range(-190, 106);
    const f = fieldAt(x, z);
    if (f < 0.6) continue;
    if (inWater(x, z)) continue;
    const s = hillSlope(x, z);
    if (s > 1.15) continue;
    if (distToTrail(x, z) < 1.9) continue;
    if (!clearOfNodes(x, z)) continue;
    if (standAt(x, z)) continue;
    const zn = zone(x, z);
    // the swept belt gets the most of it, the closed range the least
    if (!rng.chance(zn === 0 ? 0.42 : zn === 2 ? 0.28 : 0.16)) continue;
    const seed = 70000 + k;
    const roll = rng.next();
    if (roll < 0.62) {
      tufts.push({
        x, z, n: rng.int(3, 6), spread: rng.range(0.9, 2.0),
        scale: rng.range(0.85, 1.15), seed,
      });
    } else if (roll < 0.80) {
      rocks.push({
        x, z, n: rng.int(1, 3), r: rng.range(0.34, 0.72),
        spread: rng.range(0.8, 1.8), seed,
      });
    } else {
      /* Moss only where it would be: the damp, shaded, lush ground.  `coverAt` is
       * the same field the tone ladder reads, so a green wash lands on the patches
       * that are already being drawn as lush rather than at random over the dry
       * ones -- which is what makes it read as ground and not as a stain. */
      if (coverAt(x, z) > -0.1) continue;
      moss.push({
        x, z, n: rng.int(2, 4), r: rng.range(0.7, 1.5),
        spread: rng.range(1.4, 2.6), seed,
      });
    }
  }

  /* ------------------------- ひばり湖's basin -------------------------
   * A **separate** sweep with its own RNG, over the ground the two above cannot
   * reach: their windows stop at x = 166 and the lake's east rim is at 262.
   *
   * It is a second loop rather than a wider window on the first, for the same
   * reason the scatter fields are appended rather than regenerated: widening a
   * window re-draws the whole stream, and every one of the 560 trees on ひばり山
   * moves.  Some of them would move into a route, and the only tool that finds
   * that is a forty-second flood fill.
   *
   * Two things differ from the range's own rule, and both come off the water:
   *
   *   - **blossom belongs at the water, not away from it.**  Up on the range the
   *     odds run 0.42 near the school and 0.16 deep in, on the argument that
   *     blossom is what a maintained edge looks like.  Here the maintained edge is
   *     the shore: 0.34 within twelve metres of the waterline against 0.12 up on
   *     the rim, which is why the far shore reads as a dark wooded ridge and the
   *     near one as cherry over a pale bank.
   *   - **the willows.**  `PAL.leafPale` on a wide, low, heavily drooping grove
   *     blob is the closest this world's tree kit gets to a 柳, and eight of them
   *     along the water at the two shallow bays is the one planting note that says
   *     "lake" rather than "hillside with a lake in it".
   */
  {
    const lrng = rngKit(46411);
    let ltries = 0;
    let placed = 0;
    const LTARGET = 330;
    while (placed < LTARGET && ltries < 22000) {
      ltries++;
      const x = lrng.range(112, 292);
      const z = lrng.range(-158, -8);
      const f = fieldAt(x, z);
      if (f < 0.5) continue;
      if (inWater(x, z)) continue;
      if (hillSlope(x, z) > 0.95) continue;
      const dTrail = distToTrail(x, z);
      if (dTrail < 2.6) continue;
      if (!clearOfNodes(x, z)) continue;
      if (!clearOfViews(x, z)) continue;
      if (standAt(x, z)) continue;
      /* Height above the water, which is what everything here keys off -- not
       * distance to a polygon, because the shoreline *is* a contour of this
       * surface and "two metres above the water" is a band of constant width
       * only where the bank is constant.  On the reed flat it is thirty metres
       * wide; on the boat house's revetment it is five. */
      const above = f - LAKE_LEVEL;
      const shoreish = above < 2.6;
      const p = shoreish ? 0.46 : 0.62 + Math.min(0.18, f / 70);
      if (!lrng.chance(p)) continue;
      placed++;
      const seed = 46000 + placed * 7;
      const y = groundY(z) + f;
      if (lrng.chance(shoreish ? 0.34 : 0.12)) {
        sakura.push({
          x, z, y, scale: lrng.range(0.96, 1.3), seed,
          lean: lrng.range(0.05, 0.17),
          /* Leaning at the water, the same note `canal.js` makes about its own
           * row: branches over water is the whole reason a cherry is planted on a
           * bank, and a bank of vertical trunks is an avenue. */
          leanDir: Math.atan2(-(x - 190), -(z + 84)) + lrng.range(-0.5, 0.5),
        });
        if (lrng.chance(0.4)) petals.push({ x, z, y, r: lrng.range(1.6, 3.0), seed: seed + 1 });
      } else {
        grove.push({
          x, z, y,
          scale: shoreish ? lrng.range(1.05, 1.5) : lrng.range(1.15, 1.7),
          seed, spread: shoreish ? lrng.range(1.0, 1.34) : lrng.range(0.95, 1.2),
          lean: lrng.range(0.02, shoreish ? 0.12 : 0.07), leanDir: lrng.range(0, 6.28),
        });
      }
      if (lrng.chance(shoreish ? 0.52 : 0.36)) {
        shrubs.push({
          x: x + lrng.range(-3.2, 3.2), z: z + lrng.range(-3.2, 3.2), y,
          r: lrng.range(0.44, 0.66), count: lrng.int(3, 5), spread: lrng.range(1.3, 2.4),
          seed: seed + 11,
        });
      }
      if (lrng.chance(0.3)) {
        tufts.push({
          x: x + lrng.range(-4.5, 4.5), z: z + lrng.range(-4.5, 4.5),
          n: lrng.int(4, 8), spread: lrng.range(1.2, 2.6), seed: seed + 21,
        });
      }
      if (lrng.chance(0.12)) {
        rocks.push({
          x: x + lrng.range(-4, 4), z: z + lrng.range(-4, 4),
          n: lrng.int(2, 4), r: lrng.range(0.45, 1.0), spread: lrng.range(1.2, 2.4),
          seed: seed + 31,
        });
      }
      if (above < 1.4 && lrng.chance(0.3)) {
        moss.push({
          x: x + lrng.range(-2.5, 2.5), z: z + lrng.range(-2.5, 2.5),
          n: lrng.int(3, 5), r: lrng.range(0.8, 1.6), spread: lrng.range(1.4, 2.6),
          seed: seed + 41,
        });
      }
    }
    /* 柳 -- eight of them, hand-placed at the two shallow bays and along the
     * park's frontage, because they are the one tree here whose *position* is a
     * composition decision rather than a density.  Wide, low and drooping. */
    /* **None of them on the park's frontage, and that is a composition fix rather
     * than a botanical one.**  Two went in at (141.6, −72) and (140.4, −85.6) --
     * i.e. across the sight line from the plaza to the water, which is the whole
     * reason the plaza is where it is -- and a 5 m willow eight metres in front of
     * a viewpoint is the viewpoint.  They are on the boat house's shore and the two
     * shallow bays now, where a 柳 would actually be and where the frame they are
     * *in* is the one looking back at them. */
    for (const [wx, wz, sc] of [
      [144.0, -93.0, 1.08], [147.2, -103.6, 1.12],
      [156.0, -122.6, 1.06], [170.0, -128.4, 1.1],
      [203.6, -128.4, 1.12], [214.4, -131.6, 1.08], [228.4, -127.0, 1.04],
      [246.0, -108.0, 1.06],
    ]) {
      const f = fieldAt(wx, wz);
      if (f <= LAKE_LEVEL) continue;
      grove.push({
        x: wx, z: wz, y: groundY(wz) + f, scale: sc, seed: 47100 + Math.round(wx),
        spread: 1.55, lean: 0.16,
        leanDir: Math.atan2(-(wx - 190), -(wz + 84)),
        willow: true,
      });
    }
  }

  /* Bamboo goes in the hollows rather than at random: it wants damp, level
   * ground, and a clump on a 30° face reads as a mistake.  Hand-placed on the
   * two hollows in the massif and one on the arm, which is also where the trail
   * crosses a gully and gets its little bridge. */
  const clumps = [
    { x: 14.6, z: -119.0, n: 12, spread: 2.4, scale: 1.05, seed: 6101 },
    { x: 9.2, z: -123.6, n: 10, spread: 2.0, scale: 0.98, seed: 6102 },
    { x: 41.0, z: -117.4, n: 11, spread: 2.2, scale: 1.02, seed: 6103 },
    { x: -14.0, z: -128.0, n: 9, spread: 1.9, scale: 0.95, seed: 6104 },
    { x: 62.0, z: -113.0, n: 10, spread: 2.1, scale: 1.0, seed: 6105 },
    { x: -104.0, z: 34.0, n: 9, spread: 2.0, scale: 0.92, seed: 6106 },
    { x: 114.0, z: -66.0, n: 10, spread: 2.2, scale: 0.98, seed: 6107 },
  ];
  for (const c of clumps) bamboo.push({ ...c, y: groundY(c.z) + hillAt(c.x, c.z) });

  return { sakura, grove, cedar, bamboo, shrubs, rocks, tufts, moss, petals };
}

/* ------------------------------------------------------------------ *
 * Builder.
 * ------------------------------------------------------------------ */

/**
 * @param extraKeepOuts discs the planting must avoid on top of `SITES`.
 */
export function buildHills(ctx, extraKeepOuts = []) {
  const surface = buildSurface(ctx);
  const p = plantRange(Object.values(SITES).concat(extraKeepOuts));
  buildOutcrops(ctx, p.rocks);
  buildTufts(ctx, p.tufts);
  buildMoss(ctx, p.moss);

  return {
    sakura: p.sakura,
    grove: p.grove,
    cedar: p.cedar,
    bamboo: p.bamboo,
    shrubs: p.shrubs,
    petals: p.petals,
    surface,
  };
}
