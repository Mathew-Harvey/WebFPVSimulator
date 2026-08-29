# Industrial bando perf loop: disputes

Constitution: `prompts/bando-perf-loop.md`. Do not change a threshold to make a check pass.

## Absolute fps in headless Chromium

F3 cannot be claimed from `scripts/shots.js`. That Chromium is a software
rasteriser. Frame time on this desktop GPU tab is the measurement. Mark
headless fps BLOCKED WITH ARGUMENT. Proxies P1, P2, P5, P9 and `__scaleAt`
remain the contract in CI.

## Absolute fps on Intel Iris Xe

A named Iris Xe laptop is not in this box. F3 on the discrete chip was
an RTX 5080 vsync lock and is not the contract.

Round 3 bound the 7800X3D iGPU (AMD Radeon Graphics, PCI 0x164E, two
RDNA2 compute units, software false) through `?gpu=low` and Chrome
`--force-low-power-gpu`. High Industrial bando held rAF EMA under
16.7 ms and p95 under 18 ms on that adapter at CSS 1600x900 and
3840x2160. Numbers: `.loop/bando-perf/r3/pace.json`. Engineer ACCEPT
on that adapter. MUST-FIX none.

Round 4 captured the contract size live: CSS 1920x1080 High, same
adapter. Vsync on: establishing EMA 16.649 ms, p95 17.2 ms, 60.06 fps,
internal 1920x1080. Hall EMA 16.653 ms, p95 17.5 ms. Unlocked rAF p95
is 2.0 ms / 1.6 ms (submit rate on this box, not F3). Numbers:
`.loop/bando-perf/r4/pace-1080-vsync.json` and `pace-1080-unlock.json`.
Engineer ACCEPT. MUST-FIX none.

That dump is still a desktop 7800X3D: shell EMA about 0.06 ms, DDR5.
It is not a 15 W Tiger Lake and LPDDR4x board. Named Iris Xe stays
BLOCKED WITH ARGUMENT until that chip flies High Industrial bando
with the readout on. Do not quote 5080 fps as the laptop number. Do
not quote SwiftShader. Do not treat Raphael as covering the laptop
contract. Do not quote unlocked `renderEma` (20 to 27 ms); it cannot
sit inside a 2 ms rAF period.
