# Bringing the city map inside the performance budget

Measured on this branch, 14 August 2026, in the repo's own headless Chromium
harness at 1600 by 900 unless a line says otherwise. Nothing here is copied
from an earlier round of PROGRESS.md: every figure was taken again, because
round 27 closed with two budgets nobody had measured on this map at all.

This is a plan, not a change. No source file moved.

## 1. Where the map stands

| # | Budget | Ceiling | City now | Verdict |
|---|---|---:|---:|---|
| P1 | Draw calls, worst view | 400 | **2049** at spawn, 1715 at street | FAIL 4.3x to 5.1x |
| P2 | Triangles, all passes | 1,200,000 | **2,977,665** at flying, 2,765,233 at street | FAIL 2.3x to 2.5x |
| P3 | Full resolution post passes | 4 | 1 | pass |
| P4 | Post taps per output pixel | 14 | 9 | pass |
| P5 | Render target bytes at 1080p | 120 MB | **104.2 MB** measured at a real 1920 by 1080 canvas | pass |
| P9 | Shadow maps | 1 at 2048 or smaller | 1 at 2048 | pass |
| P10 | Vertex attribute bytes resident | 48 MB | **98.4 MB** plus 8.8 MB of indices | FAIL 2.05x |

Five parked viewpoints, each measured through `window.__budget`:

| view | draw calls | triangles | objects in the colour pass |
|------|-----------:|----------:|---------------------------:|
| spawn   | 2049 | 2,759,143 | 1173 |
| street  | 1715 | 2,765,233 |  974 |
| rooftop | 1726 | 2,914,891 | 1006 |
| flying  | 1996 | 2,977,665 | 1183 |
| high    | 1853 | 2,691,893 | 1381 |

These viewpoints are not the ones round 27 quoted, so 1715 at street here and
2245 at street there are not the same measurement and should not be subtracted
from each other. Everything below is internally consistent: one harness, one
run, one set of cameras.

### Two corrections to the record

**P5 is not failing, and the ledger says it is.** `src/render/budget.js`
derives a 1080p figure by scaling every target that is not a shadow map by
pixel area. The city's composer targets are capped by `pixelBudget: 2.6e6`
and come out at 2149 by 1209 whatever the canvas is, so scaling them is
wrong. Measured directly: 104.2 MB at a 1920 by 1080 canvas, 87.0 MB at 1280
by 720 from which the same code derives 153.8 MB. The instrument over reports
by 26 percent from a 900p capture and by 47 percent from a 720p one. Fixing
the derivation is step 7 below.

**P10 has never been measured on this map and it is the second worst failure
after draw calls.** 2,333,270 resident vertices:

| attribute | format | bytes |
|-----------|--------|------:|
| position | Float32 x3 | 28.0 MB |
| normal   | Float32 x3 | 28.0 MB |
| color    | Float32 x3 | 26.3 MB |
| uv       | Float32 x2 | 16.0 MB |
| index    | | 8.8 MB |

The `color` attribute is round 27's colour bake, and it is paid on every
geometry the bake touched whether or not that geometry's bucket mixes more
than one colour.

## 2. Where the frame actually goes

Street viewpoint, 1715 draw calls. 974 objects in the colour pass, about 608
submissions in the shadow pass, 4 post passes.

| block | calls | triangles | cullable today |
|-------|------:|----------:|----------------|
| town wide static merge | 66 | 609,410 | **no**, bounding sphere spans the town |
| caster merges on the 80 m grid | 331 | 375,600 | by frustum only |
| instanced foliage chunks | 343 | 661,000 | yes, distance and frustum |
| vending machine rigs | 92 | 3,176 | yes |
| railway furniture | 88 | 2,894 | yes |
| other named rigs and props | ~54 | ~9,000 | yes |
| the shadow pass | **608** | **1,089,544** | frustum, against the shadow camera |

The build's own counters, from `window.__map()`:

- 18,466 static meshes went into the merge and came out as 625, across 2015
  buckets. **1,390 of those buckets hold exactly one mesh**, so they are 1,390
  draw calls no merge can ever touch. 671 of them carry a texture.
- 1,087 meshes are held out as animated. 26 rigs merged 936 meshes down to 154.
- 39 instanced plant sets chunked into **1,200** InstancedMeshes, of which 343
  are drawn at street.
- 2,511 of the 3,736 meshes in the scene have `castShadow` true. Only 12 of
  them are the town wide merges. The other 2,499 are small.

## 3. What the two suggested levers are worth, measured

Both were swept live through `window.__cullRadius` and `window.__shadows`.

Street:

| cull radius | shadows on | shadows off |
|------------:|-----------:|------------:|
| 100 (today) | 1715 calls, 2.77 M | 1107 calls, 1.68 M |
| 70          | 1541 calls, 2.46 M |  935 calls, 1.38 M |
| 50          | 1498 calls, 2.44 M |  895 calls, 1.37 M |
| 35          | 1164 calls, 2.11 M |  608 calls, 1.15 M |

Flying:

| cull radius | shadows on | shadows off |
|------------:|-----------:|------------:|
| 100 (today) | 1996 calls, 2.98 M | 1348 calls, 1.87 M |
| 70          | 1797 calls, 2.69 M | 1153 calls, 1.59 M |
| 50          | 1543 calls, 2.49 M |  916 calls, 1.43 M |
| 35          | 1409 calls, 2.31 M |  821 calls, 1.32 M |

**Closing the fog is worth having and it cannot get there alone.** Taking the
radius from 100 to 70 buys 174 calls and 300 k triangles at street. Taking it
to 35 buys 551 calls, and the fog would then have to end at about 33 m: at 100
km/h that is 1.2 s of sight, which is not enough to read a gap and commit to
it. 70 m of radius with the fog ending at 65 gives 2.4 s and is defensible.
The recommendation is 70, and the rest has to come from structure.

**The reason the fog does so little is that it cannot see the buildings.**
The town wide merge gives every static mesh a bounding sphere of 249 m, so
`buildCullGrid` routes it into `always` and the distance cull never touches
it. 609,410 triangles in 66 calls are submitted from every camera position in
the town, at any radius. That is the single fact that makes the owner's first
idea underperform, and step 3 fixes it rather than abandoning it.

## 4. The thing neither idea touches, and it is the biggest one

**The shadow pass is 35 percent of the draw calls and 39 percent of the
triangles**, and it is also the reason the static merge is fragmented.

Measured two independent ways that agree exactly: turning off
`renderer.shadowMap.enabled`, and clearing `castShadow` on every mesh, both
take street from 1715 to **1107** calls and from 2,765,233 to **1,675,689**
triangles.

It costs twice over. `bakeCity` buckets a shadow caster on an 80 m grid so the
shadow camera can cull it, and everything else town wide. Since 2,499 static
meshes cast, the static town is split into 331 drawn pieces where it could be
about 70. So the shadow pass costs 608 calls of its own and forces roughly 265
more in the colour pass.

Restricting who casts, swept live by source mesh size:

| casters | street | flying |
|---------|-------:|-------:|
| all 2511 | 1715 calls, 2.77 M | 1996 calls, 2.98 M |
| radius over 0.6 m, 1787 | 1505 calls, 2.75 M | 1769 calls, 2.97 M |
| radius over 1.2 m, 566 | 1345 calls, 2.44 M | 1589 calls, 2.65 M |
| radius over 2.5 m, 439 | 1317 calls, 2.43 M | 1557 calls, 2.64 M |
| radius over 5 m, 405 | 1304 calls, 2.43 M | 1547 calls, 2.64 M |

The knee is between 0.6 and 1.2 m. Below 1.2 the shadow pass is full of window
frames and fence slats. Past 2.5 the return is gone.

This is a size test, and PROGRESS.md records two rounds where a size test went
wrong. The objection does not transfer, and the difference matters: a size
test used for REMOVAL cannot see that a window frame is part of a building, so
it deletes the shop signage. A size test used for CASTING decides only whether
a bollard puts a shadow on the pavement inside a 44 m box, which nobody flying
at 100 km/h will see. Wrong answers here are invisible, not structural.

Note for whoever builds this: the obvious alternative, a shadow only proxy on
a hidden layer, does not work in three 0.160. `WebGLShadowMap.renderObject`
tests `object.layers.test( camera.layers )` against the **view** camera, not
the shadow camera, so an object the main camera cannot see casts nothing.

## 5. The plan

In order. Each step names what it changes, what it should be worth, and how it
is checked. Steps 1 and 2 come first because step 3 is only affordable after
them.

### Step 1. Decide `castShadow` at bake time, by size. DONE, round 29

`restrictCasters` in `src/maps/city/bake.js`, run after `mergeRigs` and before
the bucketing. 1.4 m for a mesh that stands on its own, 0.8 m for one member of
an instanced crowd, because a single threshold above this town's 1.0 m canopy
blob turns off every tree shadow in it. 6,888 of 8,971 meshes stopped casting.

Delivered, worst of the five viewpoints: **2049 calls to 1638** and 2,977,665
triangles to 2,709,107. At street, 1715 to 1267 and 2.77 M to 2.58 M. The
shadow pass went from about 737 calls to about 351.

**The estimate above was 880 at street and it was wrong by 44 percent.** What
it missed: the buildings themselves are large, so 2,083 meshes still cast, the
shadow pass keeps about 351 calls rather than a few tens, and the caster grid
still holds 237 pieces rather than collapsing entirely. The rest of this
document's estimates should be read with that error bar.

Two things were measured and refused. Shrinking the shadow box does not reach
the residue, because the shadow camera culls whole objects and an 80 m caster
mesh is pulled in entire by even a 16 m box: half extent 22, 16, 12 and 8 give
1363, 1288, 1246 and 1207 at street against 1073 with the pass off. Shrinking
the caster grid still costs more than it saves, at 1745 and 2056 for the worst
view at 40 m and 24 m against 1610 at 80 m.

**The residue needs a shadow only proxy set**, and the way to build one is
recorded in PROGRESS.md round 29: not a hidden layer, which three 0.160 does not
support because the shadow pass tests the VIEW camera's layers, but coarse box
proxies gated on the shadow box in `updateShadowFocus`, since the renderer
builds its render list before the shadow pass runs and both skip
`visible === false`. Worth roughly 300 more calls at street. Left for after
step 2, which is worth more per hour.

### Step 2. Atlas the textured one mesh buckets

671 of the 1,390 singleton buckets carry a texture, and a texture is the one
part of a material the colour bake cannot fold into a vertex attribute. They
are the signs, posters, shop fronts and hoardings, each with its own small
canvas: 164 of them are drawn at street, 277 at high, for about 5,000
triangles between them.

Pack the canvases into one sheet at build time, rewrite the uvs into the
sheet's sub rectangle, and they become one material and one bucket. The town
generates these canvases itself, so the packer runs over what `buildWorld`
produced rather than over asset files.

Worth: about **160 calls at street and 270 at high**, and, more importantly, it
takes the per cell material count down far enough for step 3 to pay.

Risk: uv wrapping. A tiled texture cannot be atlased without a border, so
anything with `wrapS` or `wrapT` set to repeat stays out of the atlas and is
counted as a miss rather than forced.

### Step 3. Re chunk the static merge spatially, then close the fog

`MERGE_CELL` from `Infinity` to about 80 m, `CULL_RADIUS` from 100 to 70,
`FOG_FAR` from 95 to 65, `FOG_NEAR` from 30 to 22.

Round 26 measured that splitting the merge costs a mesh per cell per material
and concluded it was a losing trade. That arithmetic changes after steps 1 and
2: the colour bake already collapsed the untextured looks to 129, the atlas
collapses the textured ones, and a cell only pays for the materials actually
present in it. At 80 m cells a 70 m radius holds about 6 to 9 cells.

Worth: the static town becomes distance cullable for the first time. Triangles
from about 985 k to roughly 300 k at street. Calls roughly flat, possibly plus
20 to 70. **This step is the owner's fog of war idea, and it is what makes the
idea reach the buildings instead of only the trees.**

Risk: this is the step most likely to come out negative, exactly as it did in
round 26. It must be swept over cell size with the radius fixed, and reverted
with the measurement published if it does not pay.

### Step 4. Cut the clutter by named family, and take the colliders with it

The two failed attempts both decided what to remove by size, and both removed
parts of buildings rather than props. The town does not need a heuristic: it is
built by named modules, and the objects carry those names into the scene graph.
Add a keep fraction per family, hashed on a stable index exactly as
`thinFoliage` already does, over the street furniture families rather than over
everything.

**Every removal has to take its collider with it.** Round 27 shipped nothing
because the collider match found zero of the 898 sub metre rectangles. The
mechanism already exists and was looked at in the wrong place: `cityReferences`
and the collider fit in `src/maps/city/index.js` already build a mesh to
collider ownership map with `FIT_OWNERSHIP`. Thinning must run before the fit
and reuse that map, not after it with a fresh point test.

Worth: fewer calls and fewer triangles in proportion to what goes, and the
thing the owner actually asked for, which is more gaps and more lines to fly.

Risk: this is the one step that changes how the map plays. It should be swept
at 1.0, 0.8, 0.65 and 0.5 with screenshots at the five viewpoints, and the
value chosen by eye, the way `FOLIAGE_KEEP` was.

### Step 5. Instance the repeated rig furniture

92 draw calls at street are vending machines and 88 are railway furniture, for
6,070 triangles between them, about 35 triangles per call. They are held out of
the merge because they carry `userData.planetRigid`, and `mergeRigs` already
took them from 936 meshes to 154, which is as far as merging a rig into itself
can go.

They are repeated objects. One InstancedMesh per part material across every
machine in the town keeps the per instance matrix, so the dispense animation
still works, and costs one call per material for all of them.

Worth: about **150 calls**.

### Step 6. Stop paying for attributes the map does not use

Three changes to `src/maps/city/bake.js`, in order of value:

1. Write the `color` attribute only where a bucket actually mixes colours. A
   bucket whose sources are all one colour keeps that colour on the material.
   Saves a large share of 26.3 MB.
2. `normal` from Float32 x3 to Int8 x4 normalised: 28.0 MB to 9.3 MB.
3. `uv` from Float32 x2 to Uint16 x2 normalised, for the geometry whose uvs
   sit inside 0 to 1, which after step 2's atlas is nearly all of it: 16.0 MB
   to 8.0 MB.

Worth: 98.4 MB to roughly 55 to 63 MB. That is not yet 48, and the remainder
has to come from step 4 removing geometry, so P10 is the budget most likely to
still be open at the end of this list. Say so in PROGRESS.md rather than
moving the number.

### Step 7. Fix the P5 derivation in `src/render/budget.js`

A target whose size is capped by a pixel budget does not scale with the canvas,
so it must be classified with the shadow map as fixed rather than scaled. The
comment in that file already argues this case for shadow maps and the same
argument applies here. Until it is fixed, the only trustworthy P5 reading is a
capture at a real 1920 by 1080 canvas.

## 6. Where this lands

Worst of five parked viewpoints, measured after each step.

| after | worst calls | worst triangles |
|-------|------:|----------:|
| before this work | 2049 | 2,977,665 |
| casters by size (round 29) | 1638 | 2,709,107 |
| radius 70 and fog 65 (round 30) | 1470 | 2,426,187 |
| texture atlas (round 30) | 1597\* | 2,367,100 |
| still rigs released (round 31) | 1383 | 2,375,756 |
| shadow proxies, MERGE_CELL back (round 32) | **946** | **2,231,537** |
| attribute trim (round 33) | 946 | 2,231,537 |
| budget | 400 | 1,200,000 |

\* that row rises because `MERGE_CELL` was 120 for it and `Infinity` either
side. Isolated, the atlas is worth 92 draw calls at spawn.

**54 percent off the draw calls and 25 percent off the triangles. The map is
not inside the budget: 2.4x over on calls where it was 5.1x, and 1.9x on
triangles where it was 2.5x.**

What is left, in order of what it is worth at the worst view:

1. **The instanced planting, 282 of the 946 calls and another 96 in the shadow
   pass.** 39 plant sets chunked at 40 m is 39 draw calls per cell in range
   before anything else draws. The cell has now been swept three times and
   coarser is a straight trade of triangles for calls. The only lever that is
   not a trade is FEWER SETS, by giving a family's variants one geometry, and
   that changes the planting's look, so it wants an eye on it rather than a
   measurement alone.
2. **The clutter cut**, still unbuilt, and still the one that is wanted for the
   flying rather than for the frame. It needs the collider ownership map that
   already exists, not a fresh point test, which is what killed round 27.
3. **P10 at about 92 MB against 48.** Quantising normal to Int8x4 is 18.7 MB
   and colour to Uint16 is 11 MB. Both change what the GPU is handed and both
   want a pixel diff.
4. **Tree shadows cost 96 calls and 288,000 triangles.** Kept deliberately.
   That is the cheapest remaining 10 percent of the frame if the look ever
   becomes negotiable.

Getting to 400 needs item 1 and probably item 2 as well, and neither is a
constant. Everything that was a constant has now been swept.

## 7. What is deliberately not here

- **No level of detail on the buildings.** Round 27 named it as the way to the
  triangle budget. Step 3 gets there by culling instead, which is a smaller
  change with a measurable outcome, and generating simplified meshes for a town
  of 18,466 authored parts is a project rather than a step. If step 3 comes out
  negative, this is what replaces it.
- **No Web Worker.** CLAUDE.md holds that for stage 2 and nothing here needs it:
  draw calls are submitted on the main thread either way.
- **No change to `pixelBudget`.** P3, P4 and P5 all pass. Supersampling is not
  what is wrong with this map.
- **Nothing about the 14.5 s load** measured in this container, of which 9.4 s
  is `buildWorld`. This container is a software rasteriser and its timings are
  not the target machine's, so P6 needs a reading somewhere real before it is
  worth acting on. It is recorded here so it is not forgotten.

## 8. Reproducing the numbers

Every figure above came from `scripts/shots.js` driving the real page, with the
map swapped through `window.__setMap('city')`, the camera parked through
`window.__setCam`, and the ledger read through `window.__budget`. The camera
override only lands on the next animation frame, so each reading waits on
`window.__boot().frames` rather than on a timer.

The five viewpoints, as camera position then look at target:

| view | position | target |
|------|----------|--------|
| spawn   | 0, 1.6, 24 | 0, 1.4, -10 |
| street  | 0, 2.5, 6  | 0, 2.0, -30 |
| rooftop | 0, 12, 10  | 0, 8, -40 |
| flying  | 0, 25, 20  | 0, 12, -40 |
| high    | 0, 70, 40  | 0, 20, -60 |

The attribution in section 2, which `window.__budget` does not produce, came
from walking `window.__mapScene()` against the live camera's frustum and
grouping the drawn objects by bounding radius, by material texture and by
nearest named ancestor. That walk should be landed as `scripts/city-ledger.js`
as the first commit of the implementation, so that every step below can be
checked against the same breakdown rather than against a total.
