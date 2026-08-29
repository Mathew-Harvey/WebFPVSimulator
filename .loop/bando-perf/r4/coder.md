# Round 4 MEASURE (1080p iGPU, vsync on and unlocked)

No plant or look BUILD. Same High bando. Adapter AMD Radeon Graphics
(PCI 0x164E), software false, via `?gpu=low` and `--force-low-power-gpu`.
CSS 1920x1080 live, the contract size r3 did not capture.

## Vsync on (`pace-1080-vsync.json`)

| view | internal | scale | emaMs | p95 | fps | renderEma | shellEma | dtN | calls | changes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| establishing | 1920x1080 | 1 | 16.649 | 17.2 | 60.06 | 1.09 | 0.06 | 201 | 172 | 0 |
| hall | 1920x1080 | 1 | 16.653 | 17.5 | 60.06 | 0.71 |  |  | 105 | 0 |

Canvas equals pipeline. P5 91.6 MB at 1080p. Pixels 2,073,600. Above
1.2e6. Not 720p-class.

## Vsync off (`pace-1080-unlock.json`)

Chrome `--disable-frame-rate-limit` `--disable-gpu-vsync`. Same adapter.

| view | scale | emaMs | p95 rAF | fps EMA | renderEma | changes | rw x rh |
|---|---:|---:|---:|---:|---:|---:|---|
| establishing | 1 | 15.501 | 2.0 | 1678 | 26.6 | 2 | 1920x1080 |
| hall | 1 | 13.658 | 1.6 | 2100 | 19.8 | 2 | 1920x1080 |

rAF p95 is about 2 ms, so a High 1080p frame is produced in about 2 ms
on this iGPU. fps EMA agrees (thousand plus). `renderEma` 20 to 27 ms
does not: EXT timer queries go disjoint when vsync is off. Do not quote
that as GPU fill. The pacer moved twice then sat at scale 1, 1920x1080.

Stills were not recaptured. Hall-west floor remains r2 vs r11.
