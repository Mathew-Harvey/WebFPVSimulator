# Handover

Read `CLAUDE.md` first, then this, then `.loop/state.json`, then
`.loop/tried-and-rejected.md`, then `.loop/blocked.md`.

## Which loop is running

`prompts/lowspec-aaa-loop.md`. It supersedes the polish loop. The target is
the graphics and the game world on a **mid range laptop from five years ago
at 1920 by 1080 and 60 frames per second**, which is an Iris Xe or Vega 8
integrated part, or an MX450 or GTX 1650 Mobile, on a quad core mobile CPU.

Rounds are numbered twice in the files, unavoidably: rounds 1 to 5 in
`PROGRESS.md` are the old polish loop, and the low spec loop's round 1 is
round 6 overall. `.loop/state.json` carries the overall number.

Branch: `claude/webfpv-graphics-low-end-9o165o`. `main` has NOT been fast
forwarded; the rubric is not green.

## Container setup, do this first, neither step is optional

    git submodule update --init --depth 1 vendor/betaflight
    git clone --depth 1 https://github.com/emscripten-core/emsdk /opt/emsdk
    cd /opt/emsdk && ./emsdk install 3.1.61 && ./emsdk activate 3.1.61
    source /opt/emsdk/emsdk_env.sh    # every new shell, before npm run verify

Without them check 1 fails for want of a compiler and `npm run verify`
reports 11 of 13, which looks like a regression and is not one.

## The cost ledger, measured, 1920 by 1080, end of round 7

| # | budget | ceiling | measured | where |
|---|--------|---------|----------|-------|
| P1 | draw calls | 400 | **705** | title attract, worst of four views |
| P2 | triangles | 1,200,000 | **1,916,515** | title attract |
| P3 | full res passes | 4 | 3 | all views |
| P4 | taps per pixel | 14 | 10 | all views |
| P5 | render target bytes | 120 MB | 109.8 MB | all views |
| P6 | first interactive frame | 1800 ms | **4574 ms** | |
| P7 | worst sync block | 50 ms | 29.4 ms | 1.3 ms of it outside post.render |
| P8 | allocations per frame | zero | **at least 3** | read from code |
| P9 | shadow maps | 1 at 2048 or under | 1 at 2048 | |
| P10 | attribute bytes | 48 MB | **48.8 MB** | 25.8 MB of it is grass |
| P11 | settings ladder | 3 levels, measured | **not built** | |

At 1600 by 900: P5 86.0 MB, everything else within a call or two.

Reproduce the whole ledger with the command block at the top of
`.loop/evidence/r6/ledger.md`.

## The instruments

    node scripts/shots.js --out=DIR --w=1920 --h=1080 STEP STEP ...
      steps: wait:MS shot:NAME tap:CODE down:CODE up:CODE click:X,Y
             move:X,Y eval:EXPR until:EXPR expect:EXPR

`until:` and `expect:` exist because a fixed wait is not evidence: a frame
takes about 120 ms on this software rasteriser, so `tap:Enter wait:400` can
capture the state the player was in BEFORE the key.

    node scripts/pixels.js FRAME.png name=x,y,w,h ...
    node scripts/pixels.js FRAME.png name=walk:x,y,dx,dy,n

The second form prints single pixel luminances along a line and is how G4's
"a reviewer walking any edge must find a real coverage pixel" gets settled.
The rectangle form averages exactly the thing G4 is asking about.

Page handles, all harness only, nothing in the shell reads them:
`window.__budget(name)` returns the whole ledger for one instrumented
frame. `window.__boot()` returns first frame time and worst block.
`window.__setCam(px,py,pz,tx,ty,tz)` parks the camera, `__setCam(null)`
gives it back. `window.__trackPoint(u)` returns a point on the racing line.
Also `__renderStats`, `__ui`, `__race`, `__mode`, `__screen`.

**`__setCam` only takes effect on the NEXT animation frame.** A sweep that
sets the camera and reads `__budget` synchronously measures the same view
every time. That produced a beautiful and completely false finding in round
6 before it was caught. Always await two animation frames.

## What rounds 6 and 7 did

Round 6 built `src/render/budget.js` and published the ledger. It changed
no renderer behaviour. Three bugs in the instrument itself are written up
in `PROGRESS.md`; the important one is that `WebGLRenderTarget` has no
`uuid`, so a walker that deduplicates on it reports one target instead of
fifteen.

Round 7 took P5 from 291.0 MB to 109.8 MB. `samples: 4` on an RGBA16F
composer target is 116.1 MB and the composer keeps two of them, but simply
deleting it leaves the frame with no antialiasing, which is the exact
defect round 5 of the old loop existed to fix. So: the prepass packs the
view normal into rg and a 16 bit linear depth into ba of one RGBA8 target,
which takes the edge pass from 11 texture fetches per pixel to 6; the two
fetches that frees pay for an edge directed resolve along the depth
gradient; the grade pass absorbed the OutputPass. P3 went 4 to 3 and P4
went 14 to 10 at the same time.

Colour was verified unchanged: sky, mountain and cloud patches are
identical rgb before and after, which is the check that the folded sRGB
transfer is exactly what OutputPass was doing.

## The next item, and why

P1 and P2, together, because they are the only budgets still over that a
player feels every frame. The mechanisms are known and none of them is
research:

1. **Grass is 57 percent of the triangle budget and it is submitted
   twice.** 184,000 blades at 3 triangles is 552,000, and the frame renders
   it once for colour and once for the geometry prepass. `grassField` in
   `src/render/scene.js` sets `frustumCulled = false` on one mesh spanning
   900 m, so no view can ever cull any of it. Chunk it spatially, one mesh
   per cell with a real bounding sphere, and drop cells past the distance
   where a blade is sub pixel. Expected to take P2 under its ceiling on its
   own.
2. **The eight gates are about 224 meshes.** `gate()` builds 22 to 29 per
   gate and only the ring, the halo and the glow move. The baker is already
   in `scene.js`. Two things have to happen first: `frameMat`, `accent` and
   the pip material are created per gate, so they must be hoisted to be
   shared or the baker buckets by material and merges nothing; and the pips
   use a fresh `MeshBasicMaterial` each, which would be one bucket per pip.
3. **72 flag cloths.** Their animation is closed form in index and time,
   `sin(t * 2.2 + i * 0.7)`, so it belongs in a vertex shader with an
   `aIndex` attribute. The poles are already merged.
4. **P10 is 1.6 percent over and 25.8 MB of the 48.8 MB is the grass.** Its
   colour attribute is three 32 bit floats per vertex where a normalised
   byte triple would do, which is 8.3 MB on its own.

Then P8 (three named allocations, all one line fixes), then P6 (the 67
million distance to track evaluations at load), then P11 (no settings
ladder exists).

## The G items

Not yet reviewed under this loop as of the end of round 7. What is visible
in `.loop/evidence/r7/1080p/04-midcourse.png`, which is the first frame
ever captured from a point on the racing line:

- The terrain is a plane. `makeHeightField` forces height to zero within
  30 m of every point on the circuit, so there is nothing at all in the 20
  to 200 m band G6 requires, and the terrain never occludes the course.
  This is the largest single art item and the most invasive: gate base
  heights, the spawn height and the crash check all read that field.
- The lake is a flat blue quad with a straight edge sitting above the
  horizon line, reading as a rectangle stuck to the sky. No light model, no
  shoreline.
- Overlapping mountain cones have neither a value difference nor an ink
  line between them. The ink fades out from 416 m by
  `smoothstep(0.16, 0.42, d0)` in `src/render/post.js`, and the mountains
  start at 560 m. Round 7 removed the depth precision problem that used to
  block this, so it is now only a threshold question.
- Grass blades read as large chevrons rather than grass, which takes the
  scale reading away from a 250 mm quad in a valley.

## Sharp edges

- Reviewer subagents have write access to the tree. One edited
  `src/main.js` while reviewing it. Run `git status` after every review.
- A lit material on geometry with no normal attribute washes the whole
  world to flat cream with a completely clean console. Check for normals
  before putting a lit material on anything.
- The renderer runs with `NoToneMapping`, so no colour can exceed 1.0.
- `getShadowMask()` is in `shadowmask_pars_fragment`, not
  `shadowmap_pars_fragment`, and reads a bool named `receiveShadow` that
  the renderer only declares for its own materials.
- `celMaterial` has no `customProgramCacheKey` while doing per material
  string surgery in `onBeforeCompile`. Unproven hazard, still sitting there.
- Bulk `str.replace` edits hit every occurrence. One replace of a vertex
  shader tail hit the water shader as well as the grass one.
