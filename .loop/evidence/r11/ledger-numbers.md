# Round 11 cost ledger, raw

Every figure is `window.__budget(name)` on one real frame in the real page,
with two animation frames allowed to pass after each camera move.

## 1920 by 1080, devicePixelRatio 1

| view | P1 draw calls | P2 triangles |
|---|---|---|
| title attract | 246 | 1,913,703 |
| title worst azimuth | **321** | 1,915,103 |
| start line | 146 | 1,911,163 |
| mid course forward | 239 | 1,912,781 |
| empty sky | 131 | 1,910,515 |

Run scoped and resolution independent:

| # | budget | ceiling | measured | verdict |
|---|--------|---------|----------|---------|
| P1 | draw calls, worst view | 400 | **321** | **PASS**, first time in this project |
| P2 | triangles | 1,200,000 | 1,915,103 worst, 1,910,515 with nothing in frame | FAIL 1.60x |
| P3 | full res passes | 4 | 3 | PASS |
| P4 | taps per pixel | 14 | 10 | PASS |
| P5 | render target bytes | 120 MB | 115.1 MB decimal | PASS |
| P6 | first interactive frame | 1800 ms | 3609 ms at 1080p, 3369 ms at 900p | FAIL |
| P7 | worst sync block | 50 ms | 17.9 ms at 1080p, 19.0 ms at 900p, over 55 frames | CANNOT VERIFY |
| P9 | shadow maps | 1 at 2048 | 1 at 2048 | PASS |
| P10 | attribute bytes | 48 MB | 51.4 MB | FAIL 1.07x |
| P12 | audio nodes | 64 | **52** | PASS |
| P13 | audio ms per frame | 2 ms | 0.30 ms at 1080p, 0.40 ms at 900p | PASS |

Meshes in the scene: **141**, against 317 in round 10.

Console at both resolutions: errors 0, warnings 0, harness faults 0.

## What moved, and what did not

P1 went from 692 to 321 because every obstacle's static geometry now shares
its materials with every other obstacle and bakes into the same buckets as the
scenery. The mesh count nearly halved. Only three meshes per obstacle stay
live, the ones whose material gains are driven every frame.

P10 went from 51.2 to 51.4 MB: the regulation frames, panels and dot matrix
numbers are slightly more vertex data than a torus and a few boxes were. Still
over the 48 MB ceiling, and the grass is 25.8 MB of it.

P2 did not move at all and the reason is unchanged from round 10: `grassField`
sets `frustumCulled = false` on one mesh spanning 900 m, so 552,000 triangles
are submitted whatever the camera is doing, and the empty sky view is still
99.8 percent of the worst view. That is the next item.

P6 is a wall clock figure in a shared container on a software rasteriser and
has now been measured between 2500 and 5100 ms across rounds on builds whose
boot path nobody touched. It is over the ceiling by any reading.

## The audio node budget, itemised, totalling 52

    2   master gain and the soft clip WaveShaper
    3   stem buses: motors, wind, focus
    20  four motors, each an oscillator, two lowpasses, a gain and a panner
    3   wind: noise source, lowpass, gain
    6   focus tone: two oscillators, two gains, a channel merger, a bus gain
    2   gate and landing cue: oscillator and gain
    3   crash: noise source, lowpass, gain
    13  the bed: bus gain, duck, lofi shelf, kick, sub, snare, hat chains
