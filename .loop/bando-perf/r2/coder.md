# Round 2 MEASURE (confirmation)

No BUILD this round. Plant, quality.js, pace.js, KilnPipeline unchanged
from r1. Evidence from a GPU Chrome tab, not shots.js. CSS 1600x900 via
Emulation.setDeviceMetricsOverride, then 3840x2160 for the 4K dump. UI
hidden. Parks match bando-aaa r11.

GPU: NVIDIA GeForce RTX 5080, software false. Headless dt is not quoted.

## Pace

| CSS | view | internal | scale | emaMs | p95 | fps | renderEma | dtN | calls |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1600x900 | establishing | 1600x900 | 1 | 16.665 | 17.2 | 60.02 | 0.68 | 180 | 172 |
| 1600x900 | hall | 1600x900 | 1 | 16.629 | 17.2 | 60.06 | 0.38 | 181 | 105 |
| 3840x2160 | establishing | 2149x1209 | 0.560 | 16.675 | 16.9 | 60.00 | 0.90 | 183 | 172 |
| 3840x2160 | hall | 2149x1209 | 0.560 | 16.661 | 16.9 | 60.01 | 0.47 | 184 | 105 |

`changes` 0. `cpuBound` 0. Canvas width/height equals pipelineSize in every
dump. 4K CSS is not 3840x2160 HalfFloat.

`__budget` hall is labelled `view: "hall"` (105 calls). Establishing 172.

## scaleAt High bando

| CSS | scale | rw x rh | pixels |
|---|---:|---|---:|
| 1920x1080 | 1 | 1920x1080 | 2073600 |
| 2560x1440 | 0.840 | 2149x1209 | 2598141 |
| 3840x2160 | 0.560 | 2149x1209 | 2598141 |

## Proxies (establishing, worst)

P1 172. P2 31103. P5 91.6 MB at 1080p. PointLights 0. leftoverOverlap 0.
leftoverDeath 6. One 2048 shadow. MAP_MODULE_COUNT.bando is 13.

## Stills vs bando-aaa r11 (SwiftShader)

GPU recapture, same parks, 1600x900. SHA moved. Face samples:

| still | 200,200 r2/r11 | 200,400 r2/r11 | 400,250 r2/r11 |
|---|---|---|---|
| hall-west | DD9652/DD9652 | E8994A/E9994A | 7B5B64/7B5B64 |
| hopper | 723D3B/723D3B | 715147/715147 | 743E3C/743E3C |
| preheater | 45414E/45414E | 45424F/45424F | F3AC00/F3AC00 |
| gantry | C97F40/CA7F40 | CC8140/CC8140 | B13A2E/B13A2E |
| kiln-bore | 4E4752/4E4752 | 4E4753/4E4853 | 4F4853/4F4853 |
| establishing | EA9D50/EB9D50 | D09151/D09151 | F3A75A/F3A75A |

hall-west r11 SHA A526C17C0AF6A28D, r2 B121E188DB0FABCF. Graffiti and sun
pools are in the recapture. See stills-compare.json.

Iris Xe fps is not in these dumps. Derivation is in
`.loop/bando-perf/disputes.md`.
