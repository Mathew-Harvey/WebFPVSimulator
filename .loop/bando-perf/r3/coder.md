# Round 3 MEASURE (integrated GPU)

No plant, ink, shadow, or pipeline BUILD. `?gpu=low` plus Chrome
`--force-low-power-gpu` bound the 7800X3D iGPU. That chip is RDNA2 with
two compute units (PCI 0x164E), weaker than Intel Iris Xe. F3 on it is
a pessimistic bound for the laptop contract.

GPU: AMD Radeon(TM) Graphics, software false, ANGLE D3D11. Not NVIDIA,
not SwiftShader.

## Pace

| CSS | view | internal | scale | emaMs | p95 | fps | renderEma | dtN | calls | changes |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1600x900 | establishing | 1600x900 | 1 | 16.665 | 17.1 | 60.02 | 1.12 | 203 | 172 | 0 |
| 1600x900 | hall | 1600x900 | 1 | 16.671 | 17.4 | 60.02 | 0.49 | 200 | 105 | 0 |
| 3840x2160 | establishing | 2149x1209 | 0.560 | 16.674 | 17.2 | 60.01 | 0.94 | 203 | 172 | 0 |
| 3840x2160 | hall | 2149x1209 | 0.560 | 16.664 | 17.0 | 60.00 | 0.65 | 201 | 105 | 0 |

Canvas equals pipeline. 4K CSS is not native HalfFloat. P1 172, P2 31103,
P5 91.6 MB at 1080p, lamps 0, leftoverOverlap 0. cpuBound 0.

Stills were not recaptured. No look change. Hall-west floor remains r2
vs r11.

`?gpu=low` is a query hook only. Named High is unchanged. Dual-GPU
laptops still default to high-performance.
