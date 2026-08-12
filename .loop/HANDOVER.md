# Handover

Written during round 4 so the baton exists before it is needed. Update it
at the end of every round. If you are picking this up cold, read CLAUDE.md
first, then this, then .loop/state.json, then .loop/tried-and-rejected.md.

## Where the loop is

Rounds 1 to 3 are committed and pushed on
`claude/webfpvsim-polish-loop-c5qec8`. `main` has NOT been fast forwarded:
the rubric is not green, so the merge condition is not met.

- Round 1: the product shell. Title, how to fly, settings, pause, results,
  flight display. Reviewed by a cold player and a QA tester, both REJECT.
- Round 2: their entire list. A4 and A5 fixed plus fifteen defects.
- Round 3: the frame. B5 focal hierarchy, B1 value bands, B4 for the grass,
  and the two artefacts whose mechanism was named. Reviewed by an art
  director (verdict pending at the time of writing) and a performance
  engineer (REJECT, findings below).

`npm run verify` has reported 12 of 13 in every round, run in the same turn
as the claim. The single red is `yaw-coupling`, structurally 0.00 for a
symmetric X quad, and no threshold has been touched in this loop:
`git diff HEAD -- tests/` is empty across all of it.

## Container setup, do this first

The container starts without the toolchain. Neither step is optional:

    git submodule update --init --depth 1 vendor/betaflight
    git clone --depth 1 https://github.com/emscripten-core/emsdk /opt/emsdk
    cd /opt/emsdk && ./emsdk install 3.1.61 && ./emsdk activate 3.1.61
    source /opt/emsdk/emsdk_env.sh    # every new shell, before npm run verify

Without them check 1 fails for want of a compiler and verify reports 11 of
13, which looks like a regression and is not one.

## The two instruments this loop added

    node scripts/shots.js --out=DIR --w=1600 --h=900 STEP STEP ...
      steps: wait:MS shot:NAME tap:CODE down:CODE up:CODE click:X,Y
             move:X,Y eval:EXPR until:EXPR expect:EXPR

`until:` and `expect:` exist because a fixed wait is not evidence. A frame
takes about 120 ms on this software rasteriser, so a keypress followed by
`wait:400` can capture the state the player was in BEFORE the key. Two
round 1 screenshots were mislabelled exactly that way. Assert the state a
capture claims; a failed assertion fails the run.

    node scripts/pixels.js FRAME.png name=x,y,w,h ...

Prints mean rgb and Rec. 709 linear luminance per rectangle, the same
quantity the bloom high pass thresholds on. Value band arguments are
settled with this, not by looking. Note that patch coordinates are frame
specific: the craft's position differs between capture runs, so pick
rectangles from the frame you are actually measuring.

## What the performance reviewer found, and what is still to do

Its correction of my own claim first, because it matters for honesty:
**"310 draw calls" is one camera azimuth.** The attract camera measures
642. Always state the view with the number. And the 40 calls I could not
account for were not unaccounted: the shadow map is rendered TWICE per
frame, so each new shadow caster costs two draws, not one.

Ranked, with its estimated savings. Nothing here is done yet except the
localStorage defer:

1. **Duplicate shadow map render.** `renderNormals()` in `src/render/post.js`
   calls `renderer.render` and `shadowMap.autoUpdate` defaults true, so the
   shadow map is rebuilt for a prepass that overrides every material with
   `MeshNormalMaterial` and samples no shadow map. Bracket the prepass with
   `renderer.shadowMap.autoUpdate = false` and restore. 74 of 310 calls and
   113,260 of 1,465,708 triangles, bit identical output. Five lines.
2. **Bake the 204 static gate meshes.** `gate()` in `src/render/scene.js`
   builds 22 to 29 meshes per gate and only the ring, halo and glow move.
   The baker is already in the file. 204 objects to 28.
3. **Merge the 72 flag cloths.** Their animation is closed form in index and
   time, `sin(t * 2.2 + i * 0.7)`, so it belongs in a vertex shader with an
   `aIndex` attribute. 72 objects to 1, and 144 CPU sines per frame go.
4. **Grass fragment shader does per-blade constants per fragment.** The
   shadow map lookup is 16 texture compares to resolve a 7 cm shadow texel
   onto a 3 cm blade, and the cloud shadow is 12 hash evaluations to
   resolve a 310 m feature onto the same blade. Both are constant across a
   blade. Move to the vertex shader and interpolate. Visually free, and it
   is the largest per pixel item in the renderer.
5. **`antialias: true` on the renderer is 118 MB at 1440p for nothing,**
   because EffectComposer allocates its own non multisampled targets, so
   the scene is rendered aliased and the MSAA framebuffer is only written
   by one fullscreen quad. Turn it off and pass the composer a target with
   `samples: 4`. The frame currently has no antialiasing at all, on 184,000
   sub pixel blades.
6. **`grass.mesh.frustumCulled = false`** submits 552,000 triangles and
   32 MB of vertex buffer every frame regardless of view. Chunk into about
   24 spatially bounded meshes.
7. **Per frame DOM writes that change nothing.** `ui.setBanner('')` and
   `ui.setReadout('')` are called every frame from `src/main.js` and write
   `textContent`, `style` and `className` unconditionally. `setOsd` writes
   eight text nodes and two full precision width strings per frame.
   Compare and set.
8. **`updateCelTime` writes the same value into 107 separate uniform
   objects** because `celMaterial()` is called per object rather than per
   look. One shared uniform object.
9. **Load is a 2195 ms synchronous stall.** `grassField` and `terrain` call
   `height()` and `groundAlbedo()` per blade and per vertex, and both loop
   all 181 track samples with a `Math.hypot` each: about 67 million
   distance evaluations. Build a coarse distance to track field once and
   sample it.
10. **16 bit depth in the outline prepass against a 0.04 to 2600 m range**
    is why the ink has to fade out by 50 m. Raise `camera.near` to 0.2, the
    camera sits inside a 15 cm airframe so it buys nothing, and use 24 bit
    depth. This is a B2 fix as much as a performance one.
11. Fold the outline and OutputPass into the grade pass, three full res
    passes to one; `bloom.nMips = 2`; drop the nine redundant `clamp()`
    calls per pixel in the outline shader; debounce resize, which currently
    reallocates about 250 MB of render targets per event.

## What the art reviewers have already told us and is still open

See `.loop/state.json` under `open_from_reviewers_not_yet_fixed`. The
biggest is B6: `makeHeightField` forces the terrain flat within 30 m of
every point on the circuit, so the whole flight area is a plane and there
is nothing between a 250 mm quad and a 200 m mountain. Then the unlit
water and flowers, the rim term with no sun term, the tree canopy hulls,
the lake foam pinned to the disc radius rather than the waterline, and the
70 m cream sand shore.

## What has not been started at all

C1 latency measurement, C2 ground effect, C3 impact feedback, C4 audio as a
system. Audio is still a sawtooth per motor plus a noise bed, and it is the
largest single gap between this and a product. C2's ground effect needs the
plant to know its height above ground, which means a new ABI call, which
CLAUDE.md says to think about before doing.

## Blocked, do not try to fake

`.loop/blocked.md` has the four: real blackbox logs, absolute frame rate on
a discrete GPU, stick to photon latency, and a real radio. A human has to
resolve those.

## Sharp edges

- Reviewer subagents have write access to the tree. One of them edited
  `src/main.js` while reviewing it. Run `git status` after every review
  round.
- `python -c` style bulk edits with `str.replace` hit every occurrence. One
  replace of a vertex shader tail hit the water shader as well as the grass
  one and broke the lake's shader compile. The capture run caught it as ten
  WebGL warnings; a `git diff` read before committing would have caught it
  sooner.
- `getShadowMask()` is in `shadowmask_pars_fragment`, not
  `shadowmap_pars_fragment`, and it reads a bool named `receiveShadow` that
  the renderer only declares for its own materials. `#define receiveShadow
  true` is the cheap way through for a material that always receives.
- The renderer runs with `NoToneMapping`, so no colour can exceed 1.0. Any
  plan that wants an emissive highlight has to work below that ceiling or
  change tone mapping deliberately, in its own round.
- `window.__ui`, `window.__race`, `window.__renderStats`, `window.__mode`
  and `window.__screen` exist for the capture harness. `window.__ui.showResults`
  is how the results screen gets captured without flying three clean laps
  at eight frames per second, and any screenshot taken that way must say so.
