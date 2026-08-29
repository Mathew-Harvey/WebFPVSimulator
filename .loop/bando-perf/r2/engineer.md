# Round 2 engineer (confirmation MEASURE)

Verdict: ACCEPT

No BUILD this round. Plant, `quality.js`, `pace.js`, and `KilnPipeline.setSize` are the r1 tree. Numbers below are from `pace.json`, `probe.json`, `scale.json`, `stills-compare.json`, and pixel samples on the PNGs. `coder.md` is not graded.

GPU object in every pace dump: `NVIDIA GeForce RTX 5080`, `software: false`, raw `ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 (0x00002C02) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Headless dt is not used. Headless / SwiftShader fps is BLOCKED WITH ARGUMENT. Iris Xe fps stays BLOCKED WITH ARGUMENT per `.loop/bando-perf/disputes.md`. Neither of those is this dump.

r1 was engineer ACCEPT, MUST-FIX none. This round confirms the same bars on a GPU tab at CSS 1600x900 and 3840x2160.

Pilot stand-in (confirmation, no plant edit): r11 pilot ACCEPT plus still evidence below. leftoverOverlap 0. leftoverDeath 6.

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

C1 PASS. C2 PASS (BLOCKED WITH ARGUMENT: L5 / L10 hoop pairs). D hall-west: not sanded.

## F1 PASS

`__scaleAt` High bando, `scale.json` and every `pace.json` copy agree:

| CSS | scale | rw x rh | pixels | over 2.6e6 |
|---|---|---|---|---|
| 1920x1080 | 1 | 1920x1080 | 2073600 | no |
| 2560x1440 | 0.83982 | 2149x1209 | 2598141 | no |
| 3840x2160 | 0.55988 | 2149x1209 | 2598141 | no |

Live pipeline, same dumps:

- CSS 1600x900: internal 1600x900, scale 1, 1,440,000 pixels. Under the budget, so scale 1 is the ceiling.
- CSS 3840x2160: internal 2149x1209, scale 0.5598790102985104, 2,598,141 pixels. Matches `__scaleAt(3840, 2160)` exactly. `pipelineSize` 2149x1209. Native 3840x2160 HalfFloat is not in any dump.

Formula in `internalScale`: ceil is min(preferScale, sqrt(pixelBudget / CSS area)). 4K cap is the budget, not minScale 1. That is the hitch this loop closed.

No live 1440 pipeline this round. The 4K live size is the same 2149x1209 the 1440 cap already names. Same function.

## F2 PASS

Every capture: `canvas.w/h` equals `pipelineSize`, not CSS times devicePixelRatio.

- 1600x900: canvas 1600x900, pipeline 1600x900, CSS 1600x900
- 3840x2160: canvas 2149x1209, pipeline 2149x1209, CSS 3840x2160

Stretch is CSS. `KilnPipeline.setSize` calls `renderer.setSize(rw, rh, false)` after `setPixelRatio(1)`. `dpr` is 1 in every dump (Emulation override), so this does not re-prove the old cap-2 restore on a 2x panel. The 4K dump still proves the default framebuffer is the internal buffer.

## F3 PASS

`pace.json`, High, bando, RTX 5080, `software: false`, `warm: 50`, `changes: 0`:

| CSS | view | dtN | emaMs | p95Ms | fps | renderEma |
|---|---|---:|---:|---:|---:|---:|
| 1600x900 | establishing | 180 | 16.665 | 17.2 | 60.02 | 0.68 |
| 1600x900 | hall | 181 | 16.629 | 17.2 | 60.06 | 0.38 |
| 3840x2160 | establishing | 183 | 16.675 | 16.9 | 60.00 | 0.90 |
| 3840x2160 | hall | 184 | 16.661 | 16.9 | 60.01 | 0.47 |

EMA under 16.7, p95 under 18, n at or over 180, both views. This is rAF dt on a GPU tab. fps is quoted because the dump names a real GPU and `software: false`.

renderEma is 0.38 to 0.90 ms. That is vsync lock on a 5080, not an Iris Xe fill test. The constitution names this desktop as the F3 machine. The bar as written holds. It does not prove the five-year-old iGPU. That claim stays BLOCKED WITH ARGUMENT in `disputes.md`.

Headless / SwiftShader fps is BLOCKED WITH ARGUMENT. Not in these dumps.

## F4 PASS

While F3 holds, internal pixels:

- 1600x900 = 1,440,000
- 2149x1209 = 2,598,141
- `__scaleAt` 1080p = 2,073,600

All at or above 1,200,000. `changes: 0`. `cpuBound: 0`. Nobody paced into 720p-class to buy F3. 4K stays at the budget cap, not 480p. Floor at 1080p CSS is 0.7607 (abs 1.2e6), which would land about 1,198,660 after integer `floor`. That path was not taken.

## F5 PASS

No dump is in the F5 regime. renderEma under 1 ms, shellEma 0.03 to 0.21 ms, emaMs near 16.7, `cpuBound: 0`. The pacer did not drop scale on a CPU hitch.

## F6 PASS

`pace.observe` mutates one state object and a preallocated `Float64Array` ring. No new objects, arrays, or strings in that function. `p95` copies into a second preallocated ring, not in observe. Target resize is `applyPace` after `dirty` and `PACE_COOL`, not every frame. `changes: 0` in every dump, so this round did not exercise a live resize. The code path is the same as r1.

## P1 PASS

Worst parked view is establishing: `__budget` `p1_calls` 172, `__renderStats().calls` 172. Ceiling 400. Hall is 105 (cull), labelled `view: "hall"`. Both under.

## P2 PASS

Establishing 31103 triangles. Ceiling 1,200,000. Hall 27283.

## P5 PASS

`p5_target_MB_at_1080p` is 91.6 in `probe.json` and in every pace dump. Ceiling 120. Derived from the live canvas the way `budget.js` does. Raw 4K targets are 106.3 MB and still under 120. Shadow line is 2048x2048, `scales: false`.

## P9 PASS

One `DirectionalLight`, 2048x2048, allocated. Same in every dump. `quality.js` High bando `shadowMap: 2048`.

## Lights PASS

`pointLights` 0 in `probe.json` and in every pace dump. `quality.js` bando `lamps: 0` on Low, Medium, and High. `mergeCell: Infinity` on Low and Medium. High lights none.

## isolation PASS

Map id is `bando`. The bando graph does not import `src/maps/city`. `MAP_MODULE_COUNT.bando` is 13 in `src/main.js`. Thirteen JS files live under `src/maps/bando`. No fetch log this round. Not a city leak. r1 SHOULD to set the count to 13 is done.

## C / L / D (pilot stand-in)

Confirmation, no plant edit. Cite r11 pilot ACCEPT and r1 engineer ACCEPT.

- C1 leftoverOverlap 0 in every dump. PASS.
- C2 leftoverDeath 6. Same count as r11. Those six are the disputed L5 1.16 m and L10 1.02 m hoop pairs (`disputes.md` in the art loop). PASS, BLOCKED WITH ARGUMENT on widening them.
- Named lines were not re-probed. No plant edit. r11 had every named `__hit` CLEAR. Held.
- D: hall-west, kiln-bore, gantry, hopper, preheater, establishing recaptured at 1600x900 High. Hashes moved. Faces were not sanded. Argument next.

## Hall-west sanded: no

Quality floor: `.loop/bando-aaa/r11/hall-west.png`, SHA256 prefix A526C17C0AF6A28D. r2 sha16 B121E188DB0FABCF. Both 1600x900. `ident: false`.

Hash movement is GPU D3D11 vs r11 SwiftShader (`scripts/shots.js`), plus chrome, not a plant edit. Scale is the same 1600x900 High park. Samples:

Canonical floor (r11 pilot L1):

| xy | r2 | r11 |
|---|---|---|
| 200,200 | DD9652 | DD9652 |
| 200,400 | E8994A | E9994A |
| 400,250 | 7B5B64 | 7B5B64 |

Sun pool and opening (IDENT or 1 LSB):

| xy | r2 | r11 |
|---|---|---|
| 140,400 | E8994A | E8994A |
| 220,480 | F1A558 | F1A558 |
| 80,180 | E9B27A | E9B37A |
| 10,400 | E6984A | E6984A |

Red drip / crate on the grey wall (held, 1 LSB):

| xy | r2 | r11 |
|---|---|---|
| 500,450 | C1422E | C1432E |
| 520,450 | C1432E | C1432E |
| 480,450 | 7C5C65 | 7C5C65 |

Graffiti-red filter (R>160, R-G>80, B<120) over x<700, step 2: r2 16994, r11 17115. Same cells lead (80x720, 160x720, 160x280). Face-core region 40,120 to 260,380: red counts 14510 / 14510, mean L1 0.266, max L1 15. unique@step4 3037 / 3121. Palette did not collapse.

Sparse high L1 (323 pixels at L1>=80, step 2) sits on chrome, not the face. Worst is 1388,668: r2 F1AA00 (amber panel) against r11 48444F. Neighbour 1380,668 is 48444F / 48444F. One-pixel ink / FXAA on the yellow instrument, which the constitution allows as chrome. Floor-left 240x800 is the other cluster: outline stair on the platform legs.

Graffiti (red face, drips) and sun pools are in the recapture, hard-edged, same value as r11 at the floor samples. Not sanded.

Other stills, same parks, sha16 moved, unique@step4 within a few percent, 1 LSB at the compare points: kiln-bore A3B790E7A6FF83B1 vs EC4DDF86C88A90A8 (4E4752 held), gantry C259F2962CF036A6 vs 656A9D0EF1AF7872 (CC8140 / B13A2E held), hopper D30B47B65E15F601 vs 61AA9EFA1A027AA5 (723D3B / 715147 / 743E3C held), preheater 1801965422A0374A vs 9E0B36CC0C4E6AF1 (45414E / F3AC00 held), establishing 15C1AC5BE257E8CE vs 8B5BE8497F2D09C6 (D09151 / F3A75A held, 200,200 EA9D50 vs EB9D50).

## FAILs by player cost

None.

## MUST-FIX

None.

## SHOULD

- F3 on this desktop is a 5080 vsync lock with renderEma under 1 ms. That does not measure Iris Xe fill rate. Do not treat this ACCEPT as proof the five-year-old iGPU holds 16.7 ms. That number stays BLOCKED WITH ARGUMENT until a human flies Industrial bando High on that class with the readout on.

## NIT

- `dpr` is 1 in every dump. The 4K case still proves backing store equals internal size. A 2x panel was not recaptured.
- 1080p abs floor still lands at about 1,198,660 pixels after integer `floor`, not 1,200,000. Unused this round (`changes: 0`).
- Hall calls 105 against r1 97. Establishing stayed 172. Cull, not a budget.
- unique@step4 on hall-west dropped 3121 to 3037. Rasteriser, not a sand.
