# Round 0 baseline (derived, then measured in r1)

Constitution: `prompts/bando-perf-loop.md`.

The art loop closed at r11 with P1 197, P2 31985, P5 91.6 MB at 1080p.
Those proxies are fine. The hitch is fill rate on a real panel.

## The 4K / 1440p formula (code, before r1)

High bando: `preferScale` 1, `minScale` 1, `pixelBudget` 2.6e6.

Old KilnPipeline.setSize:

    scale = preferScale (1)
    if (w * h * scale^2 > pixelBudget)
      scale = max(minScale, sqrt(pixelBudget / (w * h)))

| CSS | area | budget cap | old scale | old internal |
|---|---:|---:|---:|---|
| 1600x900 | 1.44e6 | 1.34 | 1 | 1600x900 |
| 1920x1080 | 2.07e6 | 1.12 | 1 | 1920x1080 |
| 2560x1440 | 3.69e6 | 0.84 | **1** | **2560x1440** |
| 3840x2160 | 8.29e6 | 0.56 | **1** | **3840x2160** |

Old also restored `shellPixelRatio` (capped at 2) on the default
framebuffer, so the last FXAA pass could be 5120x2880 on a 2560x1440
panel at 2x DPR.

P5 at 1080p was 91.6 MB. Native 4K HalfFloat would be about four times
that on the scene targets alone, well over the 120 MB ceiling.

## What r1 changes

- `internalScale`: pixelBudget always wins. minScale is the pacer floor.
- High bando minScale 1 -> 0.75.
- Canvas backing store equals the internal buffer. CSS stretches.
- `pace.js` drops scale only when rAF dt EMA is over 18 ms and the GPU
  half of the callback is actually expensive.

Headless fps is BLOCKED WITH ARGUMENT. See disputes.md.
