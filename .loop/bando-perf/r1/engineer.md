# Round 1 engineer (re-grade)

Verdict: ACCEPT

Prior REJECT was missing artefacts. Those files now exist. Numbers below are from `probe.json`, `pace.json`, `pace-1440.json`, and `pace-4k.json`, not from the briefing paragraph. GPU object is `NVIDIA GeForce RTX 5080`, `software: false`. Headless dt is not used.

## Grades

- F1 PASS
- F2 PASS
- F3 PASS
- F4 PASS
- F5 PASS
- F6 PASS
- P1 PASS
- P2 PASS
- P5 PASS
- P9 PASS
- Lights PASS
- isolation PASS

## F1 PASS

`__scaleAt` in `probe.json` (High, map bando):

| CSS | scale | rw x rh | pixels | over 2.6e6 |
|---|---|---|---|---|
| 1920x1080 | 1 | 1920x1080 | 2073600 | no |
| 2560x1440 | 0.83982 | 2149x1209 | 2598141 | no |
| 3840x2160 | 0.55988 | 2149x1209 | 2598141 | no |

Live 4K-class window in `pace-4k.json`: CSS 3824x2065, internal 2194x1184, 2,597,696 pixels. That is the budget cap on that window, not native 3824x2065 HalfFloat. `__scaleAt(3840,2160)` is 2149x1209 because the CSS size is different. Same function, same ceiling. Native 4K HalfFloat is not in any dump.

## F2 PASS

Every capture: `canvas.w/h` equals `pipelineSize`. Default framebuffer lines in `__budget` are the same size as the scene target.

- 1600-class: canvas 1584x805, pipeline 1584x805, CSS 1584x805
- 1440-class: canvas 2217x1172, pipeline 2217x1172, CSS 2544x1345
- 4K-class: canvas 2194x1184, pipeline 2194x1184, CSS 3824x2065

Stretch is CSS. Backing store is not CSS times devicePixelRatio. `dpr` is 1 in all three, so this does not prove the old cap-2 restore path on a 2x panel. The 4K dump still proves the default FB is the internal buffer, not the CSS panel.

## F3 PASS

`pace.json`, High, bando, RTX 5080, `software: false`, `warm: 50`, `changes: 0`:

| view | dtN | emaMs | p95Ms | fps |
|---|---:|---:|---:|---:|
| establishing | 201 | 16.672 | 17.0 | 60.02 |
| hall | 207 | 16.697 | 17.0 | 60.01 |

EMA under 16.7, p95 under 18, n over 180, both views. This is rAF dt on a GPU tab, not SwiftShader.

`pace-1440.json` establishing 16.663 / p95 17.3, hall 16.637 / p95 17.0. `pace-4k.json` establishing 16.699 / p95 17.6, hall 16.730 / p95 17.1. The 4K hall EMA is 0.030 over 16.7. F3 is the establishing-and-hall pair on this GPU. That pair is `pace.json`. The 4K miss is vsync slop (renderEma 0.59, p95 17.1), not a fill-rate drop. NIT, not a FAIL.

This machine is a 5080. renderEma is 0.46 to 0.90 ms. That is vsync lock, not an Iris Xe fill test. The constitution names this desktop as the F3 machine. The bar as written holds. It does not prove the five-year-old iGPU.

## F4 PASS

While F3 holds, internal pixels:

- 1584x805 = 1,275,120
- 2217x1172 = 2,598,324
- 2194x1184 = 2,597,696

All at or above 1,200,000. `changes: 0`. Nobody paced into 720p-class. 4K stays at the budget cap, not 480p.

## F5 PASS

No dump is in the F5 regime. renderEma under 1 ms, shellEma under 0.23 ms, emaMs near 16.7, `cpuBound: 0`. The pacer did not drop scale.

## F6 PASS

`pace.observe` still mutates one state object and a preallocated `Float64Array` ring. No new objects, arrays, or strings in the observe path. Target resize only after cooldown. `changes: 0` in every dump, so this round did not exercise a live resize. The code path is the same.

## P1 PASS

Worst parked view is establishing: `__budget` `p1_calls` 172, `__renderStats().calls` 172. Ceiling 400. Hall is 97 (cull). Both under.

## P2 PASS

Establishing 31103 triangles. Ceiling 1,200,000. Hall 27247.

## P5 PASS

`p5_target_MB_at_1080p` is 91.6 in `probe.json` and in all three GPU dumps. Ceiling 120. Derived from the live canvas the way `budget.js` does. Raw 1440/4K targets are 106.3 MB and still under 120. Shadow line is 2048x2048, `scales: false`.

## P9 PASS

One `DirectionalLight`, 2048x2048, allocated. Same in every dump.

## Lights PASS

`pointLights` 0 in `probe.json` and in every pace dump. Low and Medium still `lamps: 0` in `quality.js`. High lights none.

## isolation PASS

Map id is `bando`. The bando graph does not import `src/maps/city`. No city module appears in these dumps. `leftoverOverlap` is 0 (not an isolation number, recorded anyway).

`MAP_MODULE_COUNT.bando` is still 14. The `/src/maps/bando/` import graph is 13 JS files. No fetch log this round. Not a city leak. Still a SHOULD.

## FAILs by player cost

None.

## MUST-FIX

None.

## SHOULD

- F3 on this desktop is a 5080 vsync lock with renderEma under 1 ms. That does not measure Iris Xe fill rate. Do not treat this ACCEPT as proof the five-year-old iGPU holds 16.7 ms.
- Set `MAP_MODULE_COUNT.bando` to 13 in `src/main.js` so the declared weight matches the prefix fetch.
- Hall `__budget` in `pace.json` is still labelled `view: "establishing"`. Calls dropped to 97, so the camera moved. Name the view that was parked.

## NIT

- `pace-4k.json` hall `emaMs` 16.730 is over 16.7 by 0.030. p95 17.1. Do not chase it with scale.
- `__pace().want` stays 1 after boot when `changes` is 0, even when live scale is 0.57. Stale initialiser. Report `forceScale ?? ceil`.
- `KilnPipeline.setSize` still allocates `new THREE.Vector2` on resize.
- `Pipeline.setSize` in `src/maps/bando/cel/post.js` is still the old formula. Dead for bando.
- 1080p abs floor still lands at 1,198,660 pixels after integer `floor`, not 1,200,000.
