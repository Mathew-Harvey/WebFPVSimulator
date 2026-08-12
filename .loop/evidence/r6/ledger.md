# Cost ledger, round 1 of the low spec loop (round 6 overall)

Baseline. Nothing in the renderer was changed this round: this is what the
build inherited, measured rather than estimated. Every number below came
out of `window.__budget()` in `src/render/budget.js`, which instruments one
real frame in the real page.

## How to reproduce

    node scripts/shots.js --out=DIR --w=1920 --h=1080 \
      until:window.__shellReady "expect:window.__mode==='title'" wait:1500 \
      shot:01-title "eval:JSON.stringify(window.__budget('title attract'))" \
      "eval:(async()=>{const raf=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const g=window.__trackPoint(0);const a=Math.PI/3;window.__setCam(g.x+Math.sin(a)*19,g.ground+7,g.z+Math.cos(a)*19,g.x,g.ground+2.5,g.z);await raf();return 1;})()" \
      wait:600 shot:02-title-worst "eval:JSON.stringify(window.__budget('title worst azimuth'))" \
      "eval:window.__setCam(null)" wait:400 \
      tap:Enter "until:window.__mode==='flight'" wait:1500 \
      shot:03-startline "eval:JSON.stringify(window.__budget('start line'))" \
      "eval:(async()=>{const raf=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const p=window.__trackPoint(0.30);window.__setCam(p.x,p.ground+3,p.z,p.x+p.tx*60,p.ground+5,p.z+p.tz*60);await raf();return 1;})()" \
      wait:900 shot:04-midcourse "eval:JSON.stringify(window.__budget('mid course'))" \
      "eval:JSON.stringify(window.__boot())"

Frames in `.loop/evidence/r6/1080p` and `.loop/evidence/r6/900p`.

## The three views

The title view is not one view. Its camera orbits the start gate, and the
draw count swings by a factor of 2.9 around that orbit. Twelve azimuths at
30 degree steps, 1920 by 1080, one real animation frame between each move
and its measurement:

    az  0   1   2   3   4   5   6   7   8   9  10  11
   cal 305 571 692 686 673 547 287 277 237 247 254 293
   tri 1906 1913 1916 1916 1916 1913 1906 1906 1904 1905 1905 1906  (thousands)

Worst is azimuth 2, 60 degrees, looking back across the valley at the gate
field. That is the number the ledger carries, because P1 says worst view.

The first version of this sweep reported 306 calls at all twelve azimuths.
That was a measurement bug and not a finding: `__setCam` is applied by the
frame loop, and the sweep read the budget synchronously without letting a
frame run, so all twelve reads used one camera. The sweep now awaits two
animation frames per step.

## The ledger, 1920 by 1080, devicePixelRatio 1

| # | budget | ceiling | title attract | title worst | start line | mid course | verdict |
|---|--------|---------|---------------|-------------|------------|------------|---------|
| P1 | draw calls | 400 | 448 | **693** | 237 | 289 | FAIL, 1.73x over in the worst view |
| P2 | triangles | 1,200,000 | 1,909,692 | **1,916,380** | 1,904,448 | 1,905,120 | FAIL, 1.60x over in every view |
| P3 | full res post passes | 4 | 4 | 4 | 4 | 4 | PASS, exactly at the ceiling |
| P4 | full res taps per pixel | 14 | 14 | 14 | 14 | 14 | PASS, exactly at the ceiling |
| P5 | render target bytes | 120 MB | **291.0 MB** | 291.0 MB | 291.0 MB | 291.0 MB | FAIL, 2.43x over |
| P6 | navigation to first frame | 1800 ms | 4977 ms | | | | FAIL, see caveat |
| P7 | worst synchronous block | 50 ms | 21.6 ms | | | | PASS, see caveat |
| P8 | allocations per frame | zero | at least three | | | | FAIL |
| P9 | shadow maps | 1, 2048 or under | 1 at 2048 | | | | PASS |
| P10 | vertex attribute bytes | 48 MB | **48.8 MB** | 48.8 MB | 48.8 MB | 48.8 MB | FAIL, 1.6 percent over |

At 1600 by 900 the same run gives title worst 692 calls and 1,916,364
triangles, P5 211.9 MB, P6 4330 ms, P7 37.1 ms. P1, P2, P3, P4, P9 and P10
are resolution independent and match.

## What the numbers mean, budget by budget

**P1, 693 draw calls in the worst view.** 317 meshes in the scene, and the
count moves with the camera, so some culling happens. It is not enough: the
gates are 8 groups of 22 to 29 separate meshes and the flags are 72
separate cloths, and both are static or closed form.

**P2, 1.92M triangles, and it barely moves.** The swing across the whole
title orbit is 1,904k to 1,916k, 0.6 percent, while draw calls swing 2.9x.
That is the proof the loop asks for, and it is a proof of absence: the
triangles are not being culled at all. `grass.mesh.frustumCulled = false`
in `src/render/scene.js` submits its whole field every frame by
construction, and the baked scenery is a handful of merged meshes whose
bounding spheres cover the valley, so a frustum test on them is always
true.

**P3 and P4 are both exactly at their ceilings, which is the constraint
that shapes the next round.** The four full resolution passes are the
outline, the bloom composite, the grade and the OutputPass. The taps are
outline 11, bloom composite 1, grade 1, OutputPass 1.

The outline's 11 is worth stating carefully, because a first attempt at
this instrument said 7. The shader contains 7 texture calls in its source,
but 5 of them are one call inside `readDepth`, which `main` calls 5 times.
Per output pixel it costs 1 colour tap, 5 normal taps and 5 depth taps.
`countTaps` in `budget.js` now resolves helper functions before counting,
because P4 is a bandwidth budget and bandwidth is paid per fetch, not per
line of source.

**P5, 291.0 MB against 120 MB, is the largest overage in the ledger and it
was previously unmeasured.** Line by line, at 1920 by 1080:

    116.1 MB  composer target 1, RGBA16F, samples 4
    116.1 MB  composer target 2, RGBA16F, samples 4
     33.6 MB  shadow map, 2048 x 2048, colour plus depth
     16.6 MB  outline prepass, RGBA8 plus a 32 bit depth texture
     18.7 MB  bloom, three targets at 960 x 540
      4.2 MB  bloom, eight targets from 480 x 270 down to 60 x 34

232.2 MB of the 291.0, four fifths of the whole budget, is the two composer
targets, and they are that size because of one word: `samples: 4` in
`src/render/post.js`. A multisampled colour target costs the resolve
texture plus one renderbuffer per sample, so 4x multisampling on RGBA16F at
1080p is 8.3 MB becoming 41.5 MB, and the depth renderbuffer goes the same
way, 8.3 MB becoming 33.2 MB. The loop prompt predicted 132 MB for one such
target. The measured figure is 116.1 MB, and there are two of them, because
EffectComposer clones its target for the ping pong and the clone inherits
the sample count even though the only thing ever drawn into it is a
fullscreen quad, which multisampling cannot improve.

The second composer target is therefore 116.1 MB of pure waste, 97 percent
of the entire P5 ceiling, spent on antialiasing a fullscreen quad.

**P6, 4977 ms.** This is not comparable to the 2195 ms recorded in round 5
of the previous loop: that number was the synchronous cost of `buildScene`
alone, and this one is navigation to the first completed frame, including
the Three.js fetch through this container's CDN proxy and the first frame
on a software rasteriser. It is over the ceiling either way, and the
mechanism named in round 5 has not been touched: `grassField` and `terrain`
evaluate distance to the track by looping all 181 curve samples per blade
and per vertex.

**P7, 21.6 ms at 1080p and 37.1 ms at 900p, both under 50 ms.** Recorded
as the length of the whole `frame` callback, ignoring the first three
frames, so it excludes load. It is split in `window.__boot()`: the shell's
own work, everything outside `post.render()`, worsts at 4.4 ms, and the
rest is the rasteriser. On this container that rest is CPU rasterisation
and says nothing about a real GPU, so the honest reading of P7 today is
that the shell side passes with 45 ms of margin and the render side is
unmeasurable here. Recorded as PASS on the measurable part, and the
container caveat is in `.loop/blocked.md`.

**P8, at least three allocations per frame, so FAIL.** Read from the code,
which is what the budget asks for:

- `src/input/input.js` line 320, `drain()` does `this.queue = []` and
  returns the old array. One array per frame, always.
- `src/game/race.js` line 269, `update()` returns `{ passed, hitFrame }`.
  One object per frame while flying.
- `src/main.js`, `ui.setOsd({ ... })` is an object literal with ten
  properties, built every frame while flying.

**P9 passes.** One DirectionalLight with a 2048 by 2048 map, and no other
shadow caster in the scene.

**P10, 48.8 MB of vertex attributes against 48 MB.** 263 distinct
geometries across 317 meshes, plus 7.4 MB of index buffers on top, which
the budget does not count. Over by 1.6 percent, which is the smallest
overage here and the one with the least headroom for adding world.

## The three failures ranked by what they cost the player

1. P5, 2.43x. 171 MB of render target over budget on a machine whose whole
   graphics memory bandwidth is shared with the CPU.
2. P1 and P2 together, 1.73x and 1.60x, and P2 with no culling at all.
3. P6, 2.8x, which is the first thing a player experiences.

## Screenshots, and what is visible in them that the numbers do not say

`1080p/04-midcourse.png`, which is the first frame ever captured from a
point on the racing line rather than from the start line or the attract
camera, shows four things at once:

- The terrain is a plane. B6's named root cause, `makeHeightField` forcing
  height to zero within 30 m of every point on the circuit, is visible as a
  dead flat field running to a hard horizon with no relief anywhere in the
  20 to 200 m band that G6 requires.
- The lake is a flat blue quad with a straight edge, sitting above the
  horizon line at frame right, reading as a rectangle stuck to the sky.
- Where two mountain cones overlap there is no separating line and no
  value difference, so the ridge behind and the ridge in front merge into
  one green mass. G1 fails there by inspection, and the ink pass is the cue
  that is supposed to save it.
- The grass blades read as large chevrons rather than grass. At 20 m from
  the camera a blade is still several pixels wide, which is what takes the
  scale reading away from a 250 mm quad in a valley.

Those are round 3 and later. This round measured.
