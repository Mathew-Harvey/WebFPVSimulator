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

## The cost ledger, measured, 1920 by 1080, end of round 8

| # | budget | ceiling | measured | verdict |
|---|--------|---------|----------|---------|
| P1 | draw calls | 400 | **705** title attract, 692 title worst azimuth, 236 start line, 288 mid course | FAIL 1.76x |
| P2 | triangles | 1,200,000 | **1,916,515** title attract, 1,904,447 start line | FAIL 1.60x |
| P3 | full res passes | 4 | 3 | PASS |
| P4 | taps per pixel | 14 | 10 | PASS |
| P5 | render target bytes | 120 MB | 115.1 MB decimal, 109.8 MiB | PASS |
| P6 | first interactive frame | 1800 ms | **5122 ms** | FAIL 2.8x |
| P7 | worst sync block | 50 ms | 23 ms whole frame, 4 ms shell only | CANNOT VERIFY, see below |
| P8 | allocations per frame | zero | **about 20 at rest, over 100 in flight** | FAIL |
| P9 | shadow maps | 1 at 2048 or under | 1 at 2048 | PASS |
| P10 | attribute bytes | 48 MB | **51.2 MB** decimal, plus 7.4 MB of indices | FAIL 1.07x |
| P11 | settings ladder | 3 levels, measured | **nothing exists** | FAIL |

At 1600 by 900: P5 90.2 MB, which derives 115.1 MB for 1080p, exactly the
direct figure. Everything else is resolution independent and matches.

**P7 is CANNOT VERIFY, not PASS.** Every figure published for it, including
round 7's 29.4 ms, was sampled over about ten frames. Round 8's runs are 37
and 38 frames. Ten or forty frames is not a worst case statistic on any
hardware, and the render side is CPU rasterisation in this container and
says nothing about a real GPU. To close it honestly a human has to run
`window.__boot().worstBlockMs` on a real Iris Xe or Vega 8 at 1920 by 1080
over at least 600 frames of actual flight.

## The G items, all FAIL or CANNOT VERIFY at round 8

An art director reviewed `.loop/evidence/r7` against G1 to G10 and returned
REJECT on every item. Its measurements, which are the starting point and
should not be re-derived:

- **G3, ranked the most expensive to the player.** In the mid course view
  the next gate peaks **0.711** and a cloud peaks **0.745**: the target is
  not the brightest thing in the frame, and the required headroom is +0.08.
  The gate after next peaks 0.722, louder than the gate the pilot is
  actually flying at. Only the start line view passes, one of six.
- **G2 is inverted at the far end.** Ridge ring 0 at 560 m measures 0.195
  against fogged ground at 400 m measuring 0.352: the further layer is
  0.157 **darker**. `ridgeMats` in `scene.js` is
  `MeshBasicMaterial({fog: false})` while the terrain fogs to `HORIZON`
  with `FOG_FAR` 780, so a 560 m ridge is exempt from a fog that fully
  applies to ground at 400 m. The authored ring ladder itself is fine and
  all four rings do appear in a frame; it is anchored about 0.2 too low.
- **G1.** 21.4 percent of sampled columns have the ridge base within 0.06
  of the ground in front of it with no ink in the gap. Worst measured
  Delta 0.003. At 900p it is 24.2 percent.
- **G5.** One exact colour, rgb(93,130,114), covers 14.8 percent of the mid
  course frame with no light model at all. The threshold is 2 percent.
- **G6.** `makeHeightField` multiplies all relief by
  `clamp((d - 30) / 70)`, so height is exactly zero everywhere within 30 m
  of the racing line. Confirmed live: `__trackPoint(u).ground` returns 0 at
  u = 0.30, 0.60 and 0.80. The corridor is a mathematical plane and the
  terrain never occludes any part of the course.
- **G9.** `water()` computes depth as `1.0 - length(vLocal) / uRadius`,
  literally distance from the disc centre, which is the thing G9 forbids by
  name, and foam is a concentric ring at 90 percent of that radius rather
  than the land intersection. From above it reads as a target logo.
- **G4.** Six artefacts, the two most visible being ink crossing the middle
  of an unbroken tree canopy with a 0.26 bright rim beside a 0.019 ink
  stroke, and a flat blue slab, rgb(46,97,111), floating above the horizon
  at frame right with straight top and left edges.
- **G8.** The horizon is 136 instances of one `ConeGeometry` family. Seven
  silhouette classes exist but only two unique instances in the world.
- **G7 CANNOT VERIFY** from stills. What is settled from the code: there is
  no particle system anywhere in `src/`, so the dust G7 requires does not
  exist.

## Round 9 did the value ladder. What it left open.

`FOG_FAR` is 2200, the four ridge rings are re-anchored to 0.49, 0.56, 0.63
and 0.70 with a light model carried in hue at equal luminance, and
`GLOW_LADDER` is [0.95, 0.42, 0.24]. Details and the two dead ends are in
`PROGRESS.md` and `.loop/tried-and-rejected.md`. Read the second one before
touching the ridge colours again: a luminance split for the light model
does not fit in the available range, and solving the right luminances at an
orange hue turns the whole horizon into sand dunes.

**G3 is still FAIL and the reason is a harness gap, not an art gap.** The
mid course capture parks the camera at u = 0.30 while the race's next gate
is still gate 1, so the bright ring in that frame is some later gate on the
glow ladder and not the target. Any G3 measurement taken from a parked
camera is measuring the wrong object. The fix is to have `shots.js` record
`window.__race.next` and the screen position of that gate alongside each
capture, or to add a handle that sets the next gate to whichever gate the
parked camera is looking at. Do that before claiming G3 either way.

## The next round

1. **P1 and P2**, which are the only budgets over that a player feels every
   frame, and whose mechanisms are all known:
   - `grassField` in `scene.js` sets `frustumCulled = false` on one mesh
     spanning 900 m: 552,000 triangles submitted unconditionally, twice,
     which is 57.6 percent of the triangle budget. Chunk it spatially with
     real bounding spheres. A reviewer pointed the camera at empty sky and
     still measured 1,902,533 triangles, 99.3 percent of the worst case.
   - `makeBaker().flush()` merges all static scenery into one mesh per
     material, and the merged bounding spheres span the 1700 m world, so
     the frustum test is always true. Bucket by spatial cell as well.
   - The eight gates are about 224 meshes and 636 of 698 draws carry 0.5
     percent of the triangles. Bake the static parts, but hoist `frameMat`,
     `accent` and the pip material out of `gate()` first: they are created
     per gate, and the pips use a fresh `MeshBasicMaterial` each, so the
     baker would bucket one per pip.
   - Merge the 72 flag cloths; their animation is closed form in index and
     time so it belongs in a vertex shader.
2. **P10**, 51.2 MB against 48. 25.8 MB is the grass, whose colour
   attribute is three 32 bit floats per vertex where a normalised byte
   triple would do.
3. **P8**, about 20 allocations per frame at rest and over 100 in flight.
   The reviewer gave every line; the dominant one is `src/game/race.js:223`,
   an array literal per gate per sweep sample inside the collision loop.
4. **P6**, 5122 ms. `grassField` and `terrain` evaluate distance to all 181
   curve samples per blade and per vertex.
5. **P11**, which does not exist at all. `DEFAULTS` in `src/ui/ui.js` has no
   quality key and nothing in `scene.js` or `post.js` reads one.
6. **G6**, the flat corridor, which is the largest remaining art item and
   the most invasive: `makeHeightField` multiplies all relief by
   `clamp((d - 30) / 70)` and the gate base heights, the spawn height and
   the crash check all read that field.
7. **G9**, the water, whose depth is literally distance from the disc
   centre.
8. **G4's remaining five artefacts** and the grass half of the
   antialiasing, which is measurably better than round 7 and still
   measurably worse than multisampling.

## The instruments

    node scripts/shots.js --out=DIR --w=1920 --h=1080 STEP STEP ...
      steps: wait:MS shot:NAME tap:CODE down:CODE up:CODE click:X,Y
             move:X,Y eval:EXPR until:EXPR expect:EXPR

`until:` and `expect:` exist because a fixed wait is not evidence: a frame
takes about 120 ms on this software rasteriser, so `tap:Enter wait:400` can
capture the state the player was in BEFORE the key.

    node scripts/pixels.js FRAME.png name=x,y,w,h ...
    node scripts/pixels.js FRAME.png name=walk:x,y,dx,dy,n
    node scripts/pixels.js FRAME.png name=stair:x0,y0,w,rows,level

`walk:` prints single pixel luminances along a line. `stair:` prints the
sub pixel position at which a near vertical edge crosses a level, row by
row, and the RMS of the second difference of that sequence. Use `stair:`
for any claim about antialiasing: the first difference is the edge's slope,
which is whatever the geometry is, and the second difference is the
staircase. Walking ACROSS an edge cannot tell a blur from a resolve, and
that mistake has already been made once here.

Page handles, all harness only, nothing in the shell reads them:
`window.__budget(name)` returns the whole ledger for one instrumented
frame. `window.__boot()` returns first frame time and worst block.
`window.__setCam(px,py,pz,tx,ty,tz)` parks the camera, `__setCam(null)`
gives it back. `window.__trackPoint(u)` returns a point on the racing line.
Also `__renderStats`, `__ui`, `__race`, `__mode`, `__screen`.

**`__setCam` only takes effect on the NEXT animation frame.** A sweep that
sets the camera and reads `__budget` synchronously measures the same view
every time. Always await two animation frames.

The full ledger command block is at the top of `.loop/evidence/r6/ledger.md`.

## Sharp edges

- Reviewer subagents have write access to the tree. One edited
  `src/main.js` while reviewing it in an earlier loop, and one deleted and
  restored tracked files under `tmp/` in round 8. Run `git status` after
  every review round.
- A lit material on geometry with no normal attribute washes the whole
  world to flat cream with a completely clean console. Check for normals
  before putting a lit material on anything.
- The renderer runs with `NoToneMapping`, so no colour can exceed 1.0.
- `grass.receiveShadow` is a no operation: the grass is a `ShaderMaterial`
  computing its own sun term, so three.js sets the flag and nothing reads
  it. Measured, blades inside a cast shadow are 0.125 against 0.132
  outside it while the ground under the same shadow is 0.012.
- `getShadowMask()` is in `shadowmask_pars_fragment`, not
  `shadowmap_pars_fragment`, and reads a bool named `receiveShadow` that
  the renderer only declares for its own materials.
- `celMaterial` has no `customProgramCacheKey` while doing per material
  string surgery in `onBeforeCompile`. Unproven hazard, still sitting there.
- `EffectComposer.setSize` takes CSS pixels and multiplies by the pixel
  ratio it captured at construction. A reviewer called this a HiDPI bug; it
  is not. Read the r160 source in the container's CDN cache before
  believing otherwise.
- The composer's read buffer is `renderTarget2`, not 1: `RenderPass` draws
  the scene there. `post.js` disables the depth buffer on the other one,
  guarded by counting the parity of the passes that swap.
- Bulk `str.replace` edits hit every occurrence. One replace of a vertex
  shader tail hit the water shader as well as the grass one.
