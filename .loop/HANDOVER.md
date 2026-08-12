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

## The next round, designed, with the arithmetic already done

**The value ladder, G1 plus G2 plus G3 together.** They are one mechanism
and they constrain each other, so do not fix them one at a time.

The constraint chain, all in Rec. 709 linear luminance:

- The amber gate ring, `0xffd45c`, has an intrinsic luminance of **0.691**,
  and the mint start ring `0x7dffb4` has **0.790**. The renderer runs with
  `NoToneMapping`, so nothing can exceed 1.0.
- G3 requires the next gate to beat the brightest non gate pixel by 0.08.
- `HORIZON`, `0xf2e3cb`, is **0.787**, and it is both the fog colour and
  the sky's horizon band, so any fully fogged terrain reads 0.787.

So with the gate at its intrinsic 0.691, **every background pixel in the
game would have to sit below 0.611**, including the horizon haze, and
fitting a monotonic ground plus four ridge rings into 0.243 to 0.611 at
0.05 per step forces the ground's fog to be switched off in all but name.
That is the tension. It is not a threshold dispute, because there is a
third way out, and it is the better design:

**Make the gate brighter rather than the world darker.** The additive glow
in `gate()` is unfogged, so it is the one thing in the frame whose value
does not fall with distance. Raise its gain until the next gate's peak
reaches at least **0.867**, which is 0.787 plus the required 0.08. Then:

    layer                       target   mechanism
    near meadow                  0.243   unchanged
    fogged ground at 850 m      <=0.50   FOG_FAR from 780 to about 1650
    ridge ring 0                  0.55   re-anchor ridgeCol, keep unlit
    ridge ring 1                  0.605
    ridge ring 2                  0.66
    ridge ring 3                  0.72    0.067 under the sky, so G1 holds
    sky and horizon haze         0.787   unchanged
    clouds                       0.745   unchanged, already under the gate
    next gate peak              >=0.867   glow gain

Note what this buys: `HORIZON` does not move, so the warm afternoon grade
survives, and the clouds do not have to be dimmed again. Only two constants
and one gain change. Verify by re-running the art director's own
measurements, and beware that raising the glow gain is what round 3 of the
old loop rejected in a different form: scaling the ring colour past 1.0
clamps it to white and takes away the hue that identifies the target. The
glow is a tight annulus, so the band can clip while the torus keeps its
hue, but that has to be looked at in a frame, not assumed.

**Then G5 on the ridges.** They must stop being one flat colour over 14.8
percent of the frame. Bake a two band sun split into the cone vertex
colours before `baker.bake`, so it stays one draw call per ring and the
authored ladder value becomes the mean of the two bands.

**Then P1 and P2**, whose mechanisms are unchanged from the round 7 handover
and are listed there: chunk the grass, bake the gates after hoisting
`frameMat`, `accent` and the pip material to be shared, merge the 72 flag
cloths. The graphics reviewer nailed P2 down: pointing the camera at empty
sky still submits **1,902,533 triangles**, 99.3 percent of the worst case.
Its per draw histogram is grass 552,000 twice, baked scenery 108,916 twice,
terrain 105,800 twice, and 636 of 698 draws carrying 0.5 percent of the
triangles between them.

**P8** is a list of exact lines and the reviewer gave all of them; the
dominant one is `src/game/race.js:223`, `for (const sx of [-GATE_HALF_W,
GATE_HALF_W])`, which allocates an array per gate per sweep sample inside
the collision loop, so tens to hundreds per frame at speed.


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
