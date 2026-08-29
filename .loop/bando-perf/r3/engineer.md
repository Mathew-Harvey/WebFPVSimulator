# Round 3 engineer (iGPU MEASURE)

Verdict: ACCEPT

No BUILD this round. Plant, ink, shadows, and pipeline are the r1/r2 tree. Numbers below are from `pace.json` and `probe.json`. `coder.md` is not graded. No stills this round. Hall-west sanded: cite r2 ACCEPT, not re-opened.

GPU object in every pace dump: `AMD Radeon(TM) Graphics`, `software: false`, raw `ANGLE (AMD, AMD Radeon(TM) Graphics (0x0000164E) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Adapter tag `igpu-low-power`. CPU named `AMD Ryzen 7 7800X3D`. Headless dt is not used. SwiftShader fps is BLOCKED WITH ARGUMENT. fps is quoted because the dump names a real GPU and `software: false`.

This is not a named Iris Xe. Raphael GFX1036, two RDNA2 compute units, PCI 0x164E. It does not cover the laptop contract. Argument under F3.

r2 was engineer ACCEPT on the 5080. This round is the same bars on the 7800X3D integrated GPU at CSS 1600x900 and 3840x2160, High, bando.

## Grades

- F1 PASS
- F2 PASS
- F3 PASS (this adapter). Iris Xe laptop class BLOCKED WITH ARGUMENT
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

`__scaleAt` High bando, every copy in `pace.json` and `probe.json` agrees:

| CSS | scale | rw x rh | pixels | over 2.6e6 |
|---|---|---|---|---|
| 1920x1080 | 1 | 1920x1080 | 2073600 | no |
| 2560x1440 | 0.83982 | 2149x1209 | 2598141 | no |
| 3840x2160 | 0.55988 | 2149x1209 | 2598141 | no |

Live pipeline:

- CSS 1600x900: internal 1600x900, scale 1, 1,440,000 pixels. Under the budget, so scale 1 is the ceiling.
- CSS 3840x2160: internal **2149x1209**, scale 0.5598790102985104, 2,598,141 pixels. Matches `__scaleAt(3840, 2160)` exactly. `pipelineSize` 2149x1209. Scene target 2149x1209 at 12 bytes/pixel (HalfFloat colour plus depth), not 3840x2160.

Native 4K HalfFloat would be 3840x2160 colour. That size is not in any dump. Not a FAIL.

No live 1080 or 1440 pipeline this round. The 4K live size is the same 2149x1209 the 1440 cap already names. Same function. `scaleAt.graphics` is `high` in every dump. `?gpu=low` is `powerPreference` only (`src/main.js`). Named High was not switched.

## F2 PASS

Every capture: `canvas.w/h` equals `pipelineSize`, not CSS times devicePixelRatio.

- 1600x900: canvas 1600x900, pipeline 1600x900, CSS 1600x900
- 3840x2160: canvas 2149x1209, pipeline 2149x1209, CSS 3840x2160

Stretch is CSS. Default framebuffer line is 2149x1209 rgba, same as the internal buffer. `dpr` is 1 in every dump, so this does not re-prove the old cap-2 restore on a 2x panel.

## F3 PASS on AMD Radeon(TM) Graphics (Raphael 0x164E). Laptop class not covered.

`pace.json`, High, bando, `software: false`, `warm: 50`, `changes: 0`:

| CSS | view | dtN | emaMs | p95Ms | fps | renderEma |
|---|---|---:|---:|---:|---:|---:|
| 1600x900 | establishing | 203 | 16.665 | 17.1 | 60.02 | 1.12 |
| 1600x900 | hall | 200 | 16.671 | 17.4 | 60.02 | 0.48 |
| 3840x2160 | establishing | 203 | 16.674 | 17.2 | 60.01 | 0.94 |
| 3840x2160 | hall | 201 | 16.664 | 17.0 | 60.00 | 0.65 |

EMA under 16.7, p95 under 18, n at or over 180, parked establishing and parked hall. This is rAF dt on a GPU tab. Not SwiftShader. Not the 5080.

Software rasteriser: BLOCKED, not a pass. This dump is not that.

"This GPU" this round is the bound adapter: AMD Radeon(TM) Graphics, PCI 0x164E, D3D11. The written F3 numbers hold on it. PASS.

The hardware contract is Iris Xe class, 1920x1080 at 60, a five year old mid range laptop. This dump is not that chip.

Raphael 2 CU is weaker shader throughput than a 96 EU Xe G7, so GPU fill here is a pessimistic bound if the timer is GPU time. It is not a laptop. The same dump names a 7800X3D. rAF dt includes JS and WASM. Shell EMA is 0.09 to 0.13 ms on that CPU. A 15 W Tiger Lake will not look like that. Desktop DDR5 is not LPDDR4x on a 2021 U-series board. renderEma is still 0.48 to 1.12 ms: vsync lock with GPU work under 2 ms, not an unlocked fill-rate test.

Named Iris Xe: BLOCKED WITH ARGUMENT. Not a FAIL of F3. Not a pass of the laptop class. Do not treat Raphael as covering the laptop contract.

Headless / SwiftShader fps is BLOCKED WITH ARGUMENT. Not in these dumps.

## F4 PASS

While F3 holds on this adapter, internal pixels:

- 1600x900 = 1,440,000
- 2149x1209 = 2,598,141
- `__scaleAt` 1080p = 2,073,600

All at or above 1,200,000. `changes: 0`. `cpuBound: 0`. Nobody paced into 720p-class to buy F3. 4K stays at the budget cap, not 480p. Floor at 1080p CSS is 0.7607 (abs 1.2e6), which would land about 1,198,660 after integer `floor`. That path was not taken. Do not read the unused floor as a pass of F4 at 720p. It did not run.

## F5 PASS

No dump is in the F5 regime. renderEma 0.48 to 1.12 ms, shellEma 0.09 to 0.13 ms, emaMs near 16.7, `cpuBound: 0`. The pacer did not drop scale on a CPU hitch. Shell cost on a 7800X3D is not evidence a laptop shell is cheap. That is F3's laptop BLOCKED, not an F5 FAIL.

## F6 PASS

`pace.observe` mutates one state object and a preallocated `Float64Array` ring. No new objects, arrays, or strings in that function. `p95` copies into a second preallocated ring, not in observe. Target resize is after `dirty` and `PACE_COOL`, not every frame. `changes: 0` in every dump, so this round did not exercise a live resize. No BUILD. Path is the r1 tree.

## P1 PASS

Worst parked view is establishing: `__budget` `p1_calls` 172, `__renderStats().calls` 172. Ceiling 400. Hall is 105 (cull), labelled `view: "hall"`. Both under.

## P2 PASS

Establishing 31103 triangles. Ceiling 1,200,000. Hall 27283.

## P5 PASS

`p5_target_MB_at_1080p` is 91.6 in `probe.json` and in every pace dump. Ceiling 120. Derived from the live canvas the way `budget.js` does. Raw 4K targets are 106.3 MB and still under 120. Shadow line is 2048x2048, `scales: false`.

## P9 PASS

One `DirectionalLight`, 2048x2048, allocated. Same in every dump. `quality.js` High bando `shadowMap: 2048`.

## Lights PASS

`pointLights` 0 in `probe.json` and in every pace dump. `quality.js` bando `lamps: 0` and `mergeCell: Infinity` on Low, Medium, and High. High lights none. P1 and P5 still pass.

## isolation PASS

Map id is `bando`. `src/maps/bando/index.js` does not import the city. `MAP_MODULE_COUNT.bando` is 13 in `src/main.js`. Thirteen JS files live under `src/maps/bando`. No fetch log this round. Not a city leak. Structural, same as r2.

## C / D (not owned, confirmation)

No plant, ink, or shadow BUILD. No stills recaptured. leftoverOverlap 0, leftoverDeath 6 in every dump. D hall-west: r2 ACCEPT, faces not sanded. Not re-graded here.

## FAILs by player cost

None.

## MUST-FIX

None.

## SHOULD

- F3 on this adapter is AMD Radeon(TM) Graphics, Raphael 2 CU, vsync lock, renderEma under 2 ms, on a 7800X3D. That is not Intel Iris Xe. Do not treat this ACCEPT as proof the five year old laptop class holds 16.7 ms rAF. Named Xe stays BLOCKED WITH ARGUMENT until that chip flies High Industrial bando with the readout on.
- Dual-GPU flight still defaults to `high-performance`. `?gpu=low` is a query hook and is not stored. A laptop that would have bound the discrete chip in r2 will still do that without the hook. Measurement only.

## NIT

- `dpr` is 1 in every dump. The 4K case still proves backing store equals internal size. A 2x panel was not recaptured.
- 1080p CSS was not a live pace window. Contract size is 1920x1080. 4K internal 2149x1209 is more pixels than 1080p native, and it held. Still not a live 1080p capture.
- 1080p abs floor still lands at about 1,198,660 pixels after integer `floor`, not 1,200,000. Unused this round (`changes: 0`).
- Hall calls 105 against r1 97. Establishing stayed 172. Cull, not a budget.
