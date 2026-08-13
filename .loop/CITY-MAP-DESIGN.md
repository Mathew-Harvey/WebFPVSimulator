# The city map: sakura-crossing as a second map

Survey and design round for adding the whole sakura-crossing city as a second,
freestyle map alongside the race field. Five readers surveyed both codebases
citing file and line, three architects designed the integration from different
leanings, and two judges scored them. Nothing here is implemented yet.

**Read the caveats at the bottom before building any of it.** One judge died
on a session limit, and the surviving determinism judge found fabricated
numbers inside the winning design.

## The licence question, settled

sakura-crossing is MIT, Copyright (c) 2026 Kenton Wang. MIT into GPLv3 is a
one way fit: we may incorporate it, the combined work ships GPLv3, and the MIT
notice and copyright must travel with the copied files. three.js is its only
dependency, which is also ours, and our import map already maps both `three`
and `three/addons/`.

## Why this port is unusually tractable

- **No assets.** 56,096 lines across 66 files and every sign, fascia, lantern
  and price strip is drawn at runtime with Canvas2D. The only binary in the
  repository is a 3.9 MB music mp3 we do not need.
- **One entry point.** `buildWorld(scene)` returns colliders, `heightAt(x, z,
  fromY)`, platforms, cuts and `update(dt)`, which is close to the contract
  our own `scene.js` already provides.
- **Metres throughout**, same as ours.
- **The town is small.** Its own establishing shots sit inside roughly 76 by
  114 m against our race field's 210 by 236 m, so it fits the collider grid.
- **Bundler independent.** Zero Vite specific syntax except three
  `import.meta.env` uses, two of which are optional chained and inert.

## The chosen design: two maps, one shell

Both judges chose it. Fidelity 9, determinism 8, feasibility 6, legality 9.

Split `buildScene` into a session lived shell (renderer, camera, craft, input,
audio, resize) and a swappable MapInstance. Vendor sakura-crossing as a pinned
submodule at `vendor/sakura-crossing`, copy the 59 files that
`src/world/index.js` actually reaches into a committed
`src/maps/city/vendored/` tree with exactly one patch, and let the city render
through sakura's own three target ink pipeline while the race field keeps ours.
Only the active map's scene, post chain and contact data exist at any time, so
the two never share a frame.

The load bearing discovery: **the city's import graph is clean.**
`src/world/index.js` reaches 57 files and none of them is `core/audio.js`,
`core/player.js`, `core/hud.js`, `core/post.js`, `core/sky.js`, `src/main.js`
or `world/ebike.js`. That matters because `core/audio.js:29` uses
`import.meta.env.BASE_URL` with no optional chaining and throws a TypeError on
module evaluation without a bundler. It is not on the path, so the no bundler
rule survives untouched.

Grafts from the other two designs:

- **Do not run `bakeToPlanet`.** `src/world/index.js:734-737` says in the
  source itself that "Everything above this line is still authored on a flat
  plane and has no idea the planet exists", and the bake is the last statement
  before the world literal. `bakeToPlanet` is a pure post pass over the
  Object3D graph (`planet.js:269-366`), so it is a choice, not a fact. Taking
  the pre bake flat authoring means the city drops into our three space with NO
  transform, `src/render/frame.js` is not touched, and the single conversion
  point survives. Outside `planet.js` there are exactly three build time uses
  of the sphere mapping.
- **`surfaceAt(x, z, fromY)`** as the contact model, so roofs, the overbridge
  deck and the supermarket roof car park are real surfaces. That is most of
  what a city offers a quad.
- **Boxes must not contribute to `this.maxR`**, because `collide.js:262-266`
  pads every query by `CRAFT_R + this.maxR`.

## The 27 blockers, by area

### The sphere, and why flat is the answer
The drawn geometry is an equirectangular projection of a sphere of radius
160 m; x compresses by `cos(z / R)`, which is 0.37 at z = -190. A flat right
handed Z up physics world cannot match that. Skipping the bake resolves it and
costs the curved horizon look.

### Determinism, the sharpest edge
- **Two colliders are animated from frame delta**: the level crossing booms.
  Their `top` toggles between -1 and 1.25 when `seq.armT` crosses 0.55, and
  `armT` integrates raw `dt`. Collision geometry itself becomes frame time
  dependent.
- **The gate state is a function of `train.x`, which is a dt accumulation.**
  Measured drift after 10 s of simulated time: 234.9999999999908 at dt 1/60,
  234.99999999985437 at dt 1/120, 235.00000000001353 at dt 1/50. Port it as a
  closed form of the fixed step count, not an accumulation.
- **The hill height table is built at module load with `Math.hypot`**, and the
  sphere mapping uses `Math.sin`, `Math.cos`, `Math.asin`, `Math.atan2`. If
  `heightAt` enters the physics path, bit exactness is broken by construction.
  Bake the table to a fixed point lattice or keep it out of physics.
- **The geometry wraps in x but the height field and colliders do not.**
  `heightAt(-31, 30)` is 2.0900 and `heightAt(-31 + CIRCUMFERENCE, 30)` is
  0.0126, because `hills.js` indexes a bounded lattice with no wrap.

### Cost, and it is draw calls not triangles
- **13,600 draw calls in the worst view**, 9,368 at the crossing, 10,722
  looking north up the school road. Our P1 budget view currently reports 157.
  The author states repeatedly that the scene is draw call bound by a wide
  margin.
- 1,876,610 triangles across 18,751 wrapped meshes, and that is a SUBTOTAL:
  `stats.tris` only accumulates in the non instanced branch.
- **An unculled floor of about 900 k triangles** is submitted from every camera
  position, measured at 926 k standing in a forecourt with nothing in view,
  from ring scale meshes whose bounding sphere is the planet.
- No LOD, no distance hiding, no way to switch a district off. Fine for a
  walker with a 23 m ground horizon, not for a quad that can climb.

### Colliders
- 2,731 colliders, flat rectangles with a `top` and, in only 23 cases, a
  `bottom`. **2,708 are effectively infinitely tall walls** with no ceiling
  data, so a quad can be stopped by a 0.2 m signpost at 40 m altitude.
- Our `collide.js` has a closed enum of seven kinds and throws on anything
  else, and the graze versus crash rule in `main.js` is decided by kind name.

### Our shell's hard couplings
- `main.js` dereferences `view.gates[0].heading` and `view.gates[0].position`
  at boot, and `new Race(view.gates)` dereferences `gates[0].position`. **A map
  with no gates crashes before the first frame.**
- The spawn is three module scope consts computed once from `gates[0]`.
- `Colliders` cannot be added to after build and has no clear or remove.
- **Every `shot:` step in `scripts/shots.js` requires `window.__nextGate` to
  return a gate** and records a harness fault plus a non zero exit otherwise,
  so a gateless map makes every capture fail even when the frame is perfect.
  The sidecar has no opt out.
- Check 14 waits at most 20 s for `window.__boot`. The field map already takes
  2500 to 5100 ms to first frame in this container.

### Render
- **The two post chains cannot both run.** Both end with a hand written sRGB
  transfer as the last statement of the last pass, so chaining them applies the
  curve twice.
- Sakura's three render targets cost 105.3 MiB at its default `pixelBudget` of
  4.6e6, against our P5 budget of 120 MB already sitting at 109.8 MB.
- **Every sakura mesh is on layer 0**, which is exactly the layer our outline
  prepass renders with `scene.overrideMaterial`.
- `Pipeline.setSize` forces `renderer.setPixelRatio(1)` and calls
  `renderer.setSize` with `updateStyle` true, which would silently resize every
  one of our render targets and change the canvas CSS.

## Caveats before building

1. **The winning design contains fabricated numbers.** The determinism judge
   found two and said so explicitly. Every quantitative claim in the design
   must be re measured before it is relied on.
2. **One judge never returned**, so the feasibility and budget lens has only
   one opinion behind it.
3. The survey's own figures are cited to file and line and should be spot
   checked, not trusted wholesale, on the same principle this project applies
   to its own ledger.
4. Nothing here has been built. There is no code, no branch and no measurement
   of a city frame in our shell.
