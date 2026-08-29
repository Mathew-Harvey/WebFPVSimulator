# Round 4 engineer (1080p iGPU MEASURE)

Verdict: ACCEPT

No BUILD this round. Plant, ink, shadows, and pipeline are the r1/r2 tree. Numbers below are from `pace-1080-vsync.json` and `pace-1080-unlock.json`. `coder.md` is not graded. No stills this round. Hall-west sanded: cite r2 ACCEPT, not re-opened.

GPU object in every pace dump: `AMD Radeon(TM) Graphics`, `software: false`, raw `ANGLE (AMD, AMD Radeon(TM) Graphics (0x0000164E) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Adapter tag `igpu-low-power`. CPU named `AMD Ryzen 7 7800X3D`. fps is quoted because the dump names a real GPU and `software: false`.

This is not a named Iris Xe. Raphael GFX1036, two RDNA2 compute units, PCI 0x164E, on a desktop 7800X3D. Live 1080p vsync and unlocked rAF p95 do not cover the laptop contract. Argument under F3.

r3 was engineer ACCEPT on this same adapter at CSS 1600x900 and 3840x2160. This round is the missing contract size: live CSS 1920x1080 High, one dump vsync-on, one dump with Chrome `--disable-frame-rate-limit --disable-gpu-vsync`.

## Grades

- F1 PASS
- F2 PASS
- F3 PASS (this adapter, vsync 1080p). Iris Xe laptop class BLOCKED WITH ARGUMENT
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

`__scaleAt` High bando, every copy in both dumps agrees:

| CSS | scale | rw x rh | pixels | over 2.6e6 |
|---|---|---|---|---|
| 1920x1080 | 1 | 1920x1080 | 2073600 | no |
| 2560x1440 | 0.83982 | 2149x1209 | 2598141 | no |
| 3840x2160 | 0.55988 | 2149x1209 | 2598141 | no |

Live pipeline this round is CSS 1920x1080: internal 1920x1080, scale 1, 2,073,600 pixels. Matches `__scaleAt(1920, 1080)` exactly. `pipelineSize` 1920x1080. Scene target 1920x1080 at 12 bytes/pixel (HalfFloat colour plus depth), not a 4K buffer.

Native 4K HalfFloat would be 3840x2160 colour. That size is not in either dump. Not a FAIL.

Live 1440 and live 4K were r3 on this adapter (internal 2149x1209 both). No BUILD. Same `__scaleAt`. `scaleAt.graphics` is `high` in every dump. Named High was not switched.

## F2 PASS

Every capture: `canvas.w/h` equals `pipelineSize`, not CSS times devicePixelRatio.

- vsync 1920x1080: canvas 1920x1080, pipeline 1920x1080, CSS 1920x1080
- unlock 1920x1080: canvas 1920x1080, pipeline 1920x1080, CSS 1920x1080

Stretch is CSS. Default framebuffer line is 1920x1080 rgba, same as the internal buffer. `dpr` is 1 in every dump, so this does not re-prove the old cap-2 restore on a 2x panel.

## F3 PASS on AMD Radeon(TM) Graphics (Raphael 0x164E) at live 1920x1080 vsync. Laptop class not covered.

F3 is the vsync dump. Unlocked rAF is a fill and submit probe, not the 60 Hz bar.

`pace-1080-vsync.json`, High, bando, `software: false`, `warm: 50`, `changes: 0`:

| CSS | view | dtN | emaMs | p95Ms | fps | renderEma |
|---|---|---:|---:|---:|---:|---:|
| 1920x1080 | establishing | 201 | 16.649 | 17.2 | 60.06 | 1.09 |
| 1920x1080 | hall | 203 | 16.653 | 17.5 | 60.06 | 0.71 |

EMA under 16.7, p95 under 18, n at or over 180, parked establishing and parked hall. This is rAF dt on a GPU tab. Contract size, native High, no scale drop. Not a FAIL. Do not soften it.

"This GPU" this round is the bound adapter: AMD Radeon(TM) Graphics, PCI 0x164E, D3D11. The written F3 numbers hold on it at 1920x1080. PASS.

### Unlocked dump: which timers are usable

`pace-1080-unlock.json`, same adapter, same CSS, Chrome `--disable-frame-rate-limit --disable-gpu-vsync`:

| view | dtN | emaMs | p95Ms | fps | renderEma | changes | rw x rh |
|---|---:|---:|---:|---:|---:|---:|---|
| establishing | 223 | 15.501 | 2.0 | 1678 | 26.6 | 2 | 1920x1080 |
| hall | 256 | 13.658 | 1.6 | 2100 | 19.8 | 2 | 1920x1080 |

rAF p95 and fps are wall clock of the rAF callback stamp: establishing p95 2.0 ms, hall p95 1.6 ms, fps EMA 1678 and 2100. Those two agree with each other (short stamp, high 1/dt). They are usable as a submit-rate probe on this box. They are not F3. F3 is vsync 16.7 / 18.

`renderEma` is not usable. It is `performance.now()` around `view.post.render()` in `src/main.js`, not a GPU timestamp query. On vsync it reads 0.71 to 1.09 ms and sits inside the 16.7 ms rAF period, which is coherent (CPU submit, GPU work hidden behind vblank). On the unlocked dump it jumps to 19.8 to 26.6 ms while rAF p95 is 1.6 to 2.0 ms. A 20 ms render cannot live inside a 2 ms rAF period. That timer is discarded: not GPU fill, not frame cost, not F5. Do not quote it.

Unlocked `emaMs` (13.7 to 15.5) is also not an F3 instrument. `observe` writes `emaMs` and the dt ring behind the same gate. After 223 to 256 samples at alpha 0.15, an EMA of ~15 ms cannot be the same series as a ring whose p95 is 2 ms. Hitching (`cool > PACE_COOL - 8`) skips both together, so the hitch window does not explain the split. Use vsync ema and vsync p95 for F3. Use unlocked rAF p95 and fps only as submit rate.

Software rasteriser: BLOCKED, not a pass. This dump is not that.

The hardware contract is Iris Xe class, 1920x1080 at 60, a five year old mid range laptop. This dump is not that chip.

Raphael 2 CU is weaker shader throughput than a 96 EU Xe G7, so GPU fill here is a pessimistic bound if the timer is GPU complete time. Unlocked rAF p95 is not that timer. It is callback stamp rate on a 7800X3D that can run the shell in 0.04 to 0.06 ms and present into desktop DDR5 without a 15 W cap. A 15 W Tiger Lake will not look like that. Named Iris Xe stays BLOCKED WITH ARGUMENT. Live 1080p vsync plus unlocked rAF p95 do not lift it. Not a FAIL of F3. Not a pass of the laptop class. Do not treat Raphael as covering the laptop contract.

## F4 PASS

While F3 holds on this adapter at live 1080p, internal pixels are 2,073,600. At or above 1,200,000. Vsync `changes: 0`. `cpuBound: 0`. Nobody paced into 720p-class to buy F3.

Unlocked ended at scale 1, 1920x1080, after two pace applies. Floor is 0.7607. Two `PACE_STEP` drops from 1 would still sit near 1.8e6, and the dump did not stay there. Do not read the unused floor as a pass of F4 at 720p. Final buffer is native 1080p.

## F5 PASS

Vsync is not the F5 regime. renderEma 0.71 to 1.09 ms, shellEma 0.06 to 0.11 ms, emaMs near 16.7, `cpuBound: 0`. The pacer did not drop scale on a CPU hitch.

Unlocked renderEma is discarded above. Even if it were believed, F5 needs render under 7 and shell over 9 and rAF over 18. Unlocked rAF p95 is 1.6 to 2.0 ms, shellEma 0.04 to 0.06 ms. Not F5. Do not drop scale against it.

Shell cost on a 7800X3D is not evidence a laptop shell is cheap. That is F3's laptop BLOCKED, not an F5 FAIL.

## F6 PASS

`pace.observe` mutates one state object and a preallocated `Float64Array` ring. No new objects, arrays, or strings in that function. `p95` copies into a second preallocated ring, not in observe. Target resize is after `dirty` and `PACE_COOL`, not every frame. Vsync `changes: 0`. Unlock `changes: 2` then cool, then sit at scale 1: cooldown hitch window skips ring writes on purpose so a resize does not spiral. That is the designed skip, not a per-frame alloc. Path is the r1 tree. No BUILD.

## P1 PASS

Worst parked view is establishing: `__budget` `p1_calls` 172, `__renderStats().calls` 172. Ceiling 400. Hall is 105 (cull), labelled `view: "hall"`. Both under. Same in vsync and unlock.

## P2 PASS

Establishing 31103 triangles. Ceiling 1,200,000. Hall 27283.

## P5 PASS

`p5_target_MB_at_1080p` is 91.6 in both dumps. Ceiling 120. Derived from the live 1920x1080 canvas the way `budget.js` does. Shadow line is 2048x2048, `scales: false`. Scene, grade, and default FB are 1920x1080.

## P9 PASS

One `DirectionalLight`, 2048x2048, allocated. Same in both dumps. `quality.js` High bando `shadowMap: 2048`.

## Lights PASS

`pointLights` 0 in both dumps. `quality.js` bando `lamps: 0` and `mergeCell: Infinity` on Low, Medium, and High. High lights none. P1 and P5 still pass.

## isolation PASS

Map id is `bando`. `src/maps/bando/index.js` does not import the city. `MAP_MODULE_COUNT.bando` is 13 in `src/main.js`. Thirteen JS files live under `src/maps/bando`. No fetch log this round. Not a city leak. Structural, same as r3.

## C / D (not owned, confirmation)

No plant, ink, or shadow BUILD. No stills recaptured. leftoverOverlap 0, leftoverDeath 6 in every dump. D hall-west: r2 ACCEPT, faces not sanded. Not re-graded here.

## FAILs by player cost

None.

## MUST-FIX

None.

## SHOULD

- F3 on this adapter is AMD Radeon(TM) Graphics, Raphael 2 CU, vsync lock at live 1920x1080, renderEma under 2 ms on that path, on a 7800X3D. Unlocked rAF p95 1.6 to 2.0 ms is submit rate on the same desktop chip, not GPU complete time on a 15 W Tiger Lake. Named Xe stays BLOCKED WITH ARGUMENT until that chip flies High Industrial bando with the readout on.
- Dual-GPU flight still defaults to `high-performance`. `?gpu=low` is a query hook and is not stored. A laptop that would have bound the discrete chip in r2 will still do that without the hook. Measurement only.
- Unlocked `renderEma` (19.8 to 26.6 ms) is not a usable timer. Do not feed it to F5 or to a scale drop. The vsync dump is the frame-time instrument.

## NIT

- `dpr` is 1 in every dump. A 2x panel was not recaptured.
- 1080p abs floor still lands at about 1,198,660 pixels after integer `floor`, not 1,200,000. Unused on vsync (`changes: 0`). Unlock ended at scale 1.
- Unlocked `emaMs` disagrees with unlocked rAF p95. Do not cite 13.7 to 15.5 ms as F3.
- Hall calls 105 against r1 97. Establishing stayed 172. Cull, not a budget.
- r3 NIT that live 1080p was missing is closed by this vsync dump. Laptop BLOCKED is not closed with it.
